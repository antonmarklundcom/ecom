import type { Metadata } from "next";
import Link from "next/link";

import { ActivityFilters } from "@/components/admin/activity-filters";
import { Button } from "@/components/ui/button";
import {
  activityActors,
  isActivityKind,
  listActivity,
  type ActivityRow,
} from "@/domain/admin-activity";
import { requireCapabilityPage } from "@/lib/admin-guard";
import { ORDER_STATUS_LABEL } from "@/lib/order-labels";
import { formatDateTimePY, parsePyDateInput, parsePyDateInputEnd } from "@/lib/py";

export const metadata: Metadata = { title: "Actividad" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

/**
 * `/admin/actividad` — owner y staff (PLAN.md FASE 2, PR L).
 *
 * "¿Qué hizo X hoy?" en una pantalla. Los datos existían desde el PR #4; lo
 * que faltaba era poder mirarlos sin abrir pedido por pedido.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapabilityPage("actividad");
  const query = await searchParams;

  const usuario = first(query.usuario);
  const tipo = first(query.tipo);
  const desde = first(query.desde);
  const hasta = first(query.hasta);
  const page = Number(first(query.pagina) ?? 1);

  const actorUserId = Number(usuario);

  const [result, actors] = await Promise.all([
    listActivity({
      actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : undefined,
      kind: isActivityKind(tipo) ? tipo : undefined,
      createdFrom: parsePyDateInput(desde) ?? undefined,
      createdTo: parsePyDateInputEnd(hasta) ?? undefined,
      page: Number.isFinite(page) ? page : 1,
    }),
    activityActors(),
  ]);

  const buildPageHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const single = first(value);
      if (single && key !== "pagina") params.set(key, single);
    }
    if (target > 1) params.set("pagina", String(target));
    const qs = params.toString();
    return qs ? `/admin/actividad?${qs}` : "/admin/actividad";
  };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Actividad</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Cada cambio de estado de un pedido y cada ajuste de stock, del más
        reciente al más viejo. Lo que movió el cron o un webhook aparece sin
        usuario: no lo hizo nadie del panel.
      </p>

      <div className="mt-5">
        <ActivityFilters
          defaults={{
            usuario: usuario ?? "",
            tipo: tipo ?? "",
            desde: desde ?? "",
            hasta: hasta ?? "",
          }}
          actors={actors}
        />
      </div>

      <p className="text-muted-foreground mt-4 text-sm tabular-nums">
        {result.total} movimiento{result.total === 1 ? "" : "s"}
      </p>

      {result.rows.length === 0 ? (
        <div className="border-border mt-4 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No hay movimientos con esos filtros</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Probá ampliando las fechas o sacando el usuario.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {result.rows.map((row) => (
            <ActivityItem key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Paginación">
          <Button asChild variant="outline" size="sm" disabled={result.page <= 1}>
            <Link href={buildPageHref(result.page - 1)} aria-disabled={result.page <= 1}>
              Anterior
            </Link>
          </Button>
          <span className="text-muted-foreground text-sm">
            Página {result.page} de {result.totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={result.page >= result.totalPages}>
            <Link
              href={buildPageHref(result.page + 1)}
              aria-disabled={result.page >= result.totalPages}
            >
              Siguiente
            </Link>
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function ActivityItem({ row }: { row: ActivityRow }) {
  return (
    <li className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">
          {row.kind === "pedido" ? (
            <>
              <Link href={`/admin/pedidos?q=${row.orderNumber}`} className="hover:underline">
                {row.orderNumber}
              </Link>{" "}
              <span className="text-muted-foreground font-normal">
                {row.fromStatus ? `${ORDER_STATUS_LABEL[row.fromStatus]} → ` : ""}
                {row.toStatus ? ORDER_STATUS_LABEL[row.toStatus] : ""}
              </span>
            </>
          ) : (
            <>
              {row.productName}{" "}
              <span className="text-muted-foreground font-mono text-xs font-normal">{row.sku}</span>{" "}
              <span className="text-muted-foreground font-normal tabular-nums">
                {row.delta !== null && row.delta > 0 ? `+${row.delta}` : row.delta} → {row.newOnHand}
              </span>
            </>
          )}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatDateTimePY(row.createdAt)}
        </span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {row.actor}
        {row.reason ? ` · ${row.reason}` : ""}
      </p>
    </li>
  );
}
