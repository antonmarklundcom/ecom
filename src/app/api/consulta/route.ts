import { parsearConsulta, registrarConsulta } from "@/domain/consultas";
import {
  CONSULTA_LIMIT,
  CONSULTA_WINDOW_MS,
  clientIp,
  rateLimit,
} from "@/lib/rate-limit";

/**
 * `POST /api/consulta` — el beacon de "Consultar por WhatsApp" (O33,
 * `src/lib/consulta-click.ts`).
 *
 * Contesta **204 siempre**: con cuerpo válido o inválido, contado o no, con la
 * base caída o con el límite pasado. El que manda es un `sendBeacon` que no
 * lee la respuesta, y un código distinto sólo le serviría a quien prueba qué
 * productos existen.
 *
 * Sólo cuenta lo que viene del mismo origen (`Sec-Fetch-Site: same-origin`, o
 * un `Origin` igual al del pedido): un beacon desde otro sitio no suma. No
 * guarda IP, user agent ni cookie: la IP se usa sólo para el límite en
 * memoria (`src/lib/rate-limit.ts`).
 */
export const dynamic = "force-dynamic";

/** Un cuerpo más grande que esto no es un beacon nuestro. */
const MAX_CUERPO = 512;

function sinContenido(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function mismoOrigen(request: Request): boolean {
  const sitio = request.headers.get("sec-fetch-site");
  if (sitio) return sitio === "same-origin";
  const origen = request.headers.get("origin");
  if (!origen) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!mismoOrigen(request)) return sinContenido();
    const limite = rateLimit(`consulta:${clientIp(request.headers)}`, {
      limit: CONSULTA_LIMIT,
      windowMs: CONSULTA_WINDOW_MS,
    });
    if (!limite.ok) return sinContenido();

    const texto = await request.text();
    if (texto.length === 0 || texto.length > MAX_CUERPO) return sinContenido();
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return sinContenido();
    }
    const consulta = parsearConsulta(cuerpo);
    if (consulta) await registrarConsulta(consulta);
  } catch {
    // Contar es secundario: nada de acá puede devolver otra cosa que 204.
  }
  return sinContenido();
}
