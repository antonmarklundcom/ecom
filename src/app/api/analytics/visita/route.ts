import { normalizarPath, registrarVisita } from "@/domain/analytics";
import {
  ANALYTICS_IP_LIMIT,
  ANALYTICS_IP_WINDOW_MS,
  ANALYTICS_VISIT_LIMIT,
  ANALYTICS_VISIT_WINDOW_MS,
  clientIp,
  rateLimit,
} from "@/lib/rate-limit";
import { visitIdActual } from "@/lib/visit-cookie";

/**
 * El beacon de pageviews. Lo llama `visit-tracker.tsx` en cada navegación.
 *
 * Es el **único** dato de toda la analítica que depende de que el navegador
 * colabore, y por eso es también el único que se puede bloquear o inflar. La
 * clasificación completa de qué número es confiable y cuál no está en
 * `src/domain/analytics.ts`; lo que corresponde acá es no empeorarlo.
 *
 * ### De qué no se fía esta ruta
 *
 * De casi todo lo que llega en el cuerpo. Del POST se lee **una sola cosa**,
 * `path`, y pasa por `normalizarPath` antes de tocar la base. En particular:
 *
 * - **El `visitId` sale de la cookie**, nunca del cuerpo. Aceptarlo del JSON
 *   dejaría que cualquiera escribiera pageviews atribuidos a la visita de otra
 *   persona, y esa persona es la que después compra: se podría inventar la
 *   página de entrada de una conversión real.
 * - **La fecha la pone MySQL** (`created_at` con su default). Un timestamp del
 *   cliente permitiría escribir en el pasado y cambiar un reporte ya leído.
 * - **Sin `visitId` no se registra nada.** No se acuña uno acá: ver
 *   `visitIdActual`.
 *
 * ### Por qué contesta 204 a todo
 *
 * Aun cuando descarta el evento. Del otro lado hay un `sendBeacon` que nadie
 * mira: un código de error no lo puede arreglar nadie, y distinguir "ruta
 * inválida" de "sin cookie" de "límite alcanzado" sólo le dice a quien está
 * probando el endpoint qué le falta para ensuciar los datos. Un 204 es además
 * lo más barato que se puede contestar, que importa en la ruta más llamada del
 * sitio.
 */

// Escribe en la base en cada llamada: nunca se prerenderiza ni se cachea.
export const dynamic = "force-dynamic";

/** El cuerpo más largo que tiene sentido: una ruta y sus comillas. */
const MAX_BODY_BYTES = 512;

export async function POST(request: Request): Promise<Response> {
  // Antes que nada: sin cookie no hay nada que correlacionar, y no vale la
  // pena ni leer el cuerpo.
  const visitId = await visitIdActual();
  if (visitId === null) return noContent();

  // Dos límites, dos abusos distintos (ver `rate-limit.ts`). El de la visita
  // va primero porque es el que acota las filas que un navegador puede
  // escribir, que es lo que ensucia el embudo.
  if (!rateLimit(`analytics:visita:${visitId}`, {
    limit: ANALYTICS_VISIT_LIMIT,
    windowMs: ANALYTICS_VISIT_WINDOW_MS,
  }).ok) {
    return noContent();
  }

  const ip = clientIp(request.headers);
  if (!rateLimit(`analytics:ip:${ip}`, {
    limit: ANALYTICS_IP_LIMIT,
    windowMs: ANALYTICS_IP_WINDOW_MS,
  }).ok) {
    return noContent();
  }

  const path = normalizarPath(await leerPath(request));
  if (path === null) return noContent();

  // `registrarVisita` no tira nunca (ver el módulo). El `await` está igual
  // porque sin él el proceso puede terminar el request antes del INSERT.
  await registrarVisita(visitId, path);

  return noContent();
}

/**
 * El `path` del cuerpo, o `null` si el cuerpo no sirve.
 *
 * `sendBeacon` manda `text/plain` y un `fetch keepalive` manda JSON, así que
 * se lee el texto crudo y se parsea a mano en vez de confiar en el
 * content-type. El corte de tamaño va antes del `JSON.parse`: es lo que evita
 * que alguien haga trabajar al servidor mandando un megabyte a la ruta más
 * barata del sitio.
 */
async function leerPath(request: Request): Promise<unknown> {
  try {
    const texto = await request.text();
    if (texto.length > MAX_BODY_BYTES) return null;
    const cuerpo: unknown = JSON.parse(texto);
    if (typeof cuerpo !== "object" || cuerpo === null) return null;
    return (cuerpo as { path?: unknown }).path;
  } catch {
    return null;
  }
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
