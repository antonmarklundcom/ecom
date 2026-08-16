import type { Metadata } from "next";
import Link from "next/link";

import { OrderFiltersForm } from "@/components/admin/order-filters";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { OrderStatusTabs } from "@/components/admin/order-status-tabs";
import { PAYMENT_METHOD_LABEL } from "@/components/admin/labels";
import {
  countOrdersByStatus,
  isOrderStatus,
  isPaymentMethod,
  listOrders,
  type AdminOrderRow,
} from "@/domain/admin-orders";
import { comercioWaLink } from "@/lib/comercio";
import { formatGs } from "@/lib/money";
import { formatDateTimePY, parsePyDateInput, parsePyDateInputEnd } from "@/lib/py";

export const metadata: Metadata = { title: "Pedidos" };

// El listado muestra estados que cambian a cada rato: nunca se cachea.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;

  const status = first(query.estado);
  const method = first(query.metodo);
  const desde = first(query.desde);
  const hasta = first(query.hasta);
  const search = first(query.q);
  const page = Number(first(query.pagina) ?? 1);

  const filters = {
    status: isOrderStatus(status) ? status : undefined,
    paymentMethod: isPaymentMethod(method) ? method : undefined,
    createdFrom: parsePyDateInput(desde) ?? undefined,
    createdTo: parsePyDateInputEnd(hasta) ?? undefined,
    search,
  };

  const [result, counts] = await Promise.all([
    listOrders({ ...filters, page: Number.isFinite(page) ? page : 1 }),
    countOrdersByStatus(filters),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {result.total} {result.total === 1 ? "pedido" : "pedidos"}
        </p>
      </div>

      {/* Los accesos rápidos van arriba del buscador: la pregunta más común
          —"¿qué está esperando por mí?"— se contesta con un toque y sin
          tipear. Los filtros finos siguen abajo, colapsados. */}
      <OrderStatusTabs
        counts={counts}
        active={filters.status}
        query={{ metodo: method, desde, hasta, q: search }}
      />

      <div className="mt-4">
        <OrderFiltersForm
          defaults={{
            estado: status ?? "",
            metodo: method ?? "",
            desde: desde ?? "",
            hasta: hasta ?? "",
            q: search ?? "",
          }}
        />
      </div>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          No hay pedidos con esos filtros.
        </p>
      ) : (
        // Tarjetas en vez de tabla: el dueño abre esto en el celular, y una
        // tabla de 8 columnas ahí es scroll horizontal y nada más.
        <ul className="mt-4 grid gap-3">
          {result.rows.map((order) => (
            <li key={order.id} className="border-border rounded-xl border">
              <Link
                href={`/admin/pedidos/${order.id}`}
                className="hover:bg-muted/50 block p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">{order.orderNumber}</span>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm">{order.customerName}</span>
                  <span className="font-semibold tabular-nums">{formatGs(order.totalPyg)}</span>
                </div>

                <p className="text-muted-foreground mt-1 text-xs">
                  {formatDateTimePY(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  {order.pendingReceipts > 0 ? (
                    <span className="text-foreground font-medium">
                      {" "}
                      · {order.pendingReceipts} comprobante
                      {order.pendingReceipts === 1 ? "" : "s"} sin revisar
                    </span>
                  ) : null}
                </p>
              </Link>
              {order.status === "pendiente_pago" ? <NotifyOwnerLink order={order} /> : null}
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        query={{ estado: status, metodo: method, desde, hasta, q: search }}
      />
    </div>
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
    return qs === "" ? "/admin/pedidos" : `/admin/pedidos?${qs}`;
  };

  return (
    <nav className="mt-6 flex items-center justify-between gap-3 text-sm" aria-label="Paginación">
      {page > 1 ? (
        <Link href={href(page - 1)} className="border-border rounded-lg border px-3 py-2">
          ← Anteriores
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground tabular-nums">
        Página {page} de {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="border-border rounded-lg border px-3 py-2">
          Siguientes →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/**
 * PLAN 3.10 — sin SMTP ni servicios externos: un link `wa.me` con el mensaje
 * ya armado para que el dueño (o quien esté de guardia en WhatsApp) se avise
 * de un pedido nuevo con un solo toque, sin loguearse al panel.
 */
function NotifyOwnerLink({ order }: { order: AdminOrderRow }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const adminUrl = `${siteUrl}/admin/pedidos/${order.id}`;
  const waHref = comercioWaLink(
    `Pedido nuevo ${order.orderNumber} — ${order.customerName} — ${formatGs(order.totalPyg)} ` +
      `(${PAYMENT_METHOD_LABEL[order.paymentMethod]}). Ver: ${adminUrl}`
  );
  if (!waHref) return null;

  return (
    <div className="border-border border-t px-4 py-2">
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        Avisar por WhatsApp →
      </a>
    </div>
  );
}
