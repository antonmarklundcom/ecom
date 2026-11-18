import { consultasCsv, diaPY } from "@/domain/consultas";
import { requireAdminSession } from "@/lib/admin-guard";
import { csvFilename } from "@/lib/csv";
import { can } from "@/lib/permissions";

/**
 * `GET /admin/consultas/csv` — los conteos de los últimos 90 días (O33).
 *
 * Una ruta y no una server action porque es una descarga: el `<a download>` de
 * `/admin/consultas` alcanza. El permiso se relee acá adentro, contra la
 * cookie firmada, igual que en una acción: esta URL no pasa por el layout del
 * panel. Son cantidades por día, sin datos de nadie — por eso alcanza con el
 * permiso del resumen y no hace falta el de `exports`.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let permitido = false;
  try {
    const actor = await requireAdminSession();
    permitido = can(actor.role, "dashboard");
  } catch {
    permitido = false;
  }
  if (!permitido) return new Response(null, { status: 403 });

  const csv = await consultasCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("consultas", diaPY())}"`,
      "Cache-Control": "no-store",
    },
  });
}
