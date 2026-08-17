import type { Metadata } from "next";
import Link from "next/link";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { PAYMENT_METHOD_LABEL } from "@/components/admin/labels";
import { listOrdersToRecover, type RecoverableOrderRow } from "@/domain/admin-orders";
import { buyerWaLink, recoveryMessage } from "@/domain/order-messages";
import { comercioDatosBancarios } from "@/lib/comercio";
import { formatGs } from "@/lib/money";
import { formatDateTimePY } from "@/lib/py";

export const metadata: Metadata = { title: "Por cobrar" };

export const dynamic = "force-dynamic";

/**
 * Recuperación de pedidos sin pagar.
 *
 * Un `pendiente_pago` de hace tres días y un `vencido` son el mismo trabajo:
 * alguien tiene que escribirle. Están en la misma pantalla, ordenados por
 * antigüedad, y el botón de WhatsApp está en **la fila** y no un click más
 * adentro: el dueño hace esto parado en el local entre cliente y cliente, y
 * un click de más es la diferencia entre hacerlo y no hacerlo.
 *
 * El mensaje lleva la fricción resuelta —datos del banco, el total exacto y
 * el link tokenizado para subir el comprobante— y **nunca** el detalle de lo
 * comprado: eso aparece en una pantalla de bloqueo (ver `order-messages.ts`).
 *
 * Acá no hay ningún botón que toque la reserva de stock, y es a propósito
 * (ver `listOrdersToRecover`).
 */
export default async function PorCobrarPage() {
  const { rows, total } = await listOrdersToRecover();
  const banco = comercioDatosBancarios();

  const vencidos = rows.filter((row) => row.status === "vencido").length;

  return (
    <div>
      <Link href="/admin/pedidos" className="text-muted-foreground text-sm">
        ← Pedidos
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Por cobrar</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {total} {total === 1 ? "pedido" : "pedidos"}
          {vencidos > 0 ? ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Pendientes de pago, vencidos y con el comprobante rechazado, del más viejo al más nuevo.
        El mensaje ya lleva los datos para transferir, el total y el link del pedido.
      </p>

      {/* Un listado cortado que no dice que está cortado es peor que uno
          paginado: el dueño llega al final y cree que terminó. */}
      {rows.length < total ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Mostramos los {rows.length} más viejos de {total}. Cobrá estos y volvé a entrar.
        </p>
      ) : null}

      {!banco ? (
        <p className="border-border bg-muted/40 mt-4 rounded-lg border p-3 text-sm">
          Faltan los datos bancarios (<code>BANCO_*</code> en el entorno): el mensaje sale sin la
          parte de la transferencia. Cargalos y el botón queda completo.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          No hay pedidos esperando pago.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((order) => (
            <li key={order.id} className="border-border rounded-xl border">
              <Link href={`/admin/pedidos/${order.id}`} className="hover:bg-muted/50 block p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">{order.orderNumber}</span>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm">{order.customerName}</span>
                  <span className="font-semibold tabular-nums">{formatGs(order.totalPyg)}</span>
                </div>

                <p className="text-muted-foreground mt-1 text-xs">
                  {formatDateTimePY(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]} ·{" "}
                  <Antiguedad days={order.ageDays} />
                </p>
              </Link>

              <RecoveryLink order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Días desde que se creó — el dato que ordena la prioridad de la llamada.
 * El número lo cuenta MySQL en la misma consulta: acá sólo se conjuga.
 */
function Antiguedad({ days }: { days: number }) {
  if (days <= 0) return <>hoy</>;
  return (
    <>
      hace {days} {days === 1 ? "día" : "días"}
    </>
  );
}

function RecoveryLink({ order }: { order: RecoverableOrderRow }) {
  const href = buyerWaLink(order, recoveryMessage(order));
  if (!href) return null;

  return (
    <div className="border-border border-t px-4 py-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="text-sm font-medium underline"
      >
        Escribirle por WhatsApp →
      </a>
    </div>
  );
}
