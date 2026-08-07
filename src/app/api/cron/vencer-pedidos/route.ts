import { timingSafeEqual } from "node:crypto";

import { runMaintenance } from "@/domain/maintenance";
import { CRON_LIMIT, CRON_WINDOW_MS, clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Cron de Hostinger (PLAN.md 4.8).
 *
 * Se llama desde el cron job del panel de Hostinger, una vez cada 15 minutos:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tienda.py/api/cron/vencer-pedidos
 *
 * Vence los pedidos sin pago que pasaron su `reserved_until` y limpia las
 * reservas viejas. Todo el trabajo pasa por `transitionOrder`, así que cada
 * vencimiento deja su fila en `order_events` con actor `cron`.
 */

// La ruta lee y escribe la DB en cada llamada: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

/** Algunos cron runners sólo saben hacer POST. */
export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  // Sin secreto configurado la ruta queda cerrada. Lo contrario —dejarla
  // abierta "hasta que se configure"— es un endpoint que cualquiera puede
  // martillar para vencer pedidos ajenos.
  if (!secret || secret.length < 16) {
    console.error("CRON_SECRET no está configurado (o es demasiado corto)");
    return json({ error: "not_configured" }, 503);
  }

  // La comparación de abajo es en tiempo constante, pero un atacante puede
  // igual probar secretos de a millones: el límite corta eso.
  const ip = clientIp(request.headers);
  if (!rateLimit(`cron:${ip}`, { limit: CRON_LIMIT, windowMs: CRON_WINDOW_MS }).ok) {
    return json({ error: "rate_limited" }, 429);
  }

  if (!presentedSecretMatches(request, secret)) {
    // Sin detalle: si el mensaje distingue "falta el header" de "el secreto
    // está mal", ya es información gratis. Y no se loguea nada de lo que llegó
    // —ni el valor probado ni la IP completa—, porque el log del comercio no
    // es lugar para secretos ajenos.
    console.warn("cron: intento rechazado");
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const report = await runMaintenance();
    // Sólo cantidades. Los ids de pedido son datos del negocio y los logs de
    // Hostinger los ve cualquiera con acceso al hPanel.
    console.info(
      `cron: ${report.expired.length} vencidos, ${report.skipped} salteados, ` +
        `${report.reservationsDeleted} reservas borradas`,
    );

    return json({
      ok: true,
      expired: report.expired.length,
      skipped: report.skipped,
      reservationsDeleted: report.reservationsDeleted,
    });
  } catch (error) {
    console.error("cron: falló la corrida", error);
    return json({ error: "internal_error" }, 500);
  }
}

/**
 * Acepta `Authorization: Bearer <secreto>` o `?secret=` — algunos cron de
 * Hostinger no dejan mandar headers.
 *
 * `timingSafeEqual` y no `===`: comparar strings corta en el primer byte
 * distinto, y esa diferencia de tiempo alcanza para reconstruir el secreto
 * byte por byte contra un endpoint público.
 */
function presentedSecretMatches(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const fromQuery = new URL(request.url).searchParams.get("secret") ?? "";

  const presented = bearer || fromQuery;
  if (presented === "") return false;

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  // El largo se compara aparte: timingSafeEqual tira si difieren, y ese throw
  // ya filtraría el largo del secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
