import { runMaintenance } from "@/domain/maintenance";
import { cronJson, requireCronSecret } from "@/lib/cron-auth";

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
  // Secreto, rate limit y comparación en tiempo constante: `src/lib/cron-auth.ts`
  // (O6 la extrajo de acá para que las tres rutas de cron y `/api/version`
  // compartan exactamente la misma puerta). El comportamiento no cambió.
  const auth = requireCronSecret(request);
  if (!auth.ok) return auth.response;

  try {
    const report = await runMaintenance();
    // Sólo cantidades. Los ids de pedido son datos del negocio y los logs de
    // Hostinger los ve cualquiera con acceso al hPanel.
    console.info(
      `cron: ${report.expired.length} vencidos, ${report.skipped} salteados, ` +
        `${report.reservationsDeleted} reservas borradas`,
    );

    return cronJson({
      ok: true,
      expired: report.expired.length,
      skipped: report.skipped,
      reservationsDeleted: report.reservationsDeleted,
    });
  } catch (error) {
    console.error("cron: falló la corrida", error);
    return cronJson({ error: "internal_error" }, 500);
  }
}
