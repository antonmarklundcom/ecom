import type { Metadata } from "next";
import Link from "next/link";

import { ActivityFiltersForm } from "@/components/admin/activity-filters";
import {
  actividadActores,
  isActivityKind,
  listActivity,
  type ActivityRow,
} from "@/domain/admin-activity";
import { requireCapabilityPage } from "@/lib/admin-guard";
import { ORDER_STATUS_LABEL } from "@/lib/order-labels";
import { formatDateTimePY, parsePyDateInput, parsePyDateInputEnd } from "@/lib/py";

export const metadata: Metadata = { title: "Actividad" };

// Un feed de lo que acaba de pasar no se cachea nunca.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

/**
 * `/admin/actividad` — owner y staff (PLAN.md FASE 2, PR L).
 *
 * "¿Qué hizo X hoy?" en una pantalla. `order_events` y `stock_adjustments`
 * guardaban todo desde el principio, pero repartido: los eventos de un pedido
 * sólo se veían abriendo ese pedido y los ajustes de stock abriendo esa
 * variante. Para revisar el turno de alguien había que adivinar por dónde
 * empezar.
 *
 * El `vendedor` no entra: es de lectura y no toca nada, pero muestra el
 * trabajo de cada persona con nombre y apellido — eso es supervisión, no
 * mostrador.
 */
export default async function AdminActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCapabilityPage("actividad");
  const query = await searchParams;

  const tipo = first(query.tipo);
  const quien = first(query.quien);
  const desde = first(query.desde);
  const hasta = first(query.hasta);
  const page = Number(first(query.pagina) ?? 1);

  // `"sistema"` no es un id y es un filtro válido: las filas sin
  // `actor_user_id`. Un `Number("sistema")` daría NaN y se perdería en
  // silencio, así que se decide acá y no en el dominio.
  const actorUserId =
    quien === "sistema"
      ? ("sistema" as const)
      : quien !== undefined && Number.isInteger(Number(quien))
        ? Number(quien)
        : undefined;

  const [result, actores] = await Promise.all([
    listActivity({
      kind: isActivityKind(tipo) ? tipo : undefined,
      actorUserId,
      createdFrom: parsePyDateInput(desde) ?? undefined,
      createdTo: parsePyDateInputEnd(hasta) ?? undefined,
      page: Number.isFinite(page) ? page : 1,
    }),
    actividadActores(),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Actividad</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {result.total} {result.total === 1 ? "movimiento" : "movimientos"}
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Todo lo que se movió en la tienda: cambios de estado de pedidos y ajustes
        de stock, del más nuevo al más viejo. Es un registro, no se edita.
      </p>

      <div className="mt-4">
        <ActivityFiltersForm
          defaults={{
            tipo: tipo ?? "",
            quien: quien ?? "",
            desde: desde ?? "",
            hasta: hasta ?? "",
          }}
          actores={actores}
        />
      </div>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          No hay movimientos con esos filtros.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {result.rows.map((row) => (
            <ActivityItem key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </ul>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        query={{ tipo, quien, desde, hasta }}
      />
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
              <Link href={`/admin/pedidos/${row.orderId}`} className="underline">
                {row.orderNumber}
              </Link>{" "}
              <span className="font-normal">
                {row.fromStatus === null
                  ? `creado como ${ORDER_STATUS_LABEL[row.toStatus]}`
                  : `${ORDER_STATUS_LABEL[row.fromStatus]} → ${ORDER_STATUS_LABEL[row.toStatus]}`}
              </span>
            </>
          ) : (
            <>
              <Link href={`/admin/productos/${row.productId}`} className="underline">
                {row.sku}
              </Link>{" "}
              <span className="font-normal tabular-nums">
                {/*
                  El signo va explícito en el positivo: "+6" se lee como una
                  reposición de un vistazo, "6" hay que pensarlo. Y el
                  antes→después importa tanto como el delta, porque es lo que
                  se compara contra el conteo físico.
                */}
                {row.delta > 0 ? `+${row.delta}` : row.delta} ({row.previousOnHand} →{" "}
                {row.newOnHand})
              </span>
            </>
          )}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatDateTimePY(row.createdAt)}
        </span>
      </div>

      {row.kind === "stock" ? (
        <p className="text-muted-foreground mt-1 text-xs">{row.productName}</p>
      ) : null}

      {row.reason ? <p className="mt-1 text-xs">{row.reason}</p> : null}

      {/*
        El nombre de hoy arriba y el string histórico abajo: `actor` dice
        `admin:ana@tienda.py` y sigue siendo la verdad de lo que pasó, pero el
        dueño está buscando a Ana. Se muestran los dos y no se pierde ninguno.
      */}
      <p className="text-muted-foreground mt-1 text-xs">
        {row.actorName ?? "El sistema"}
        <span className="opacity-70"> · {row.actor}</span>
      </p>
    </li>
  );
}

function Pagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  query: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("pagina", String(target));
    const qs = params.toString();
    return qs === "" ? "/admin/actividad" : `/admin/actividad?${qs}`;
  };

  return (
    <nav className="mt-6 flex items-center justify-between gap-3 text-sm" aria-label="Paginación">
      {page > 1 ? (
        <Link href={href(page - 1)} className="border-border rounded-lg border px-3 py-2">
          ← Más nuevos
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground tabular-nums">
        Página {page} de {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="border-border rounded-lg border px-3 py-2">
          Más viejos →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
