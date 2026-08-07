import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/components/admin/labels";
import { ReceiptReview } from "@/components/admin/receipt-review";
import { getAdminOrder } from "@/domain/admin-orders";
import { ORDER_TRANSITIONS, getOrderEvents } from "@/domain/orders";
import { listReceipts } from "@/domain/receipts";
import { orderUrl } from "@/domain/order-access";
import { formatGs, ivaIncluded } from "@/lib/money";
import { formatDateTimePY, formatPhonePY, waLink } from "@/lib/py";

export const metadata: Metadata = { title: "Pedido" };

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const found = await getAdminOrder(orderId);
  if (!found) notFound();

  const { order, items } = found;
  const [events, receipts] = await Promise.all([
    getOrderEvents(order.id),
    listReceipts(order.id),
  ]);

  // El link que se le manda al comprador lleva su token: se arma acá, en el
  // servidor, y sale ya hecho dentro del href de WhatsApp.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const buyerUrl = `${siteUrl}${orderUrl(order.orderNumber, order.accessToken)}`;
  const waHref = waLink(
    order.customerPhone,
    `Hola ${order.customerName.split(" ")[0] ?? ""}! Te escribo por tu pedido ${order.orderNumber} ` +
      `(${formatGs(order.totalPyg)}). Podés seguirlo acá: ${buyerUrl}`,
  );

  const nextStatuses = ORDER_TRANSITIONS[order.status];

  return (
    <div>
      <Link href="/admin/pedidos" className="text-muted-foreground text-sm">
        ← Pedidos
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight tabular-nums">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {formatDateTimePY(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Escribir por WhatsApp
        </a>
      </div>

      {receipts.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-medium">Comprobantes</h2>
          <div className="mt-2">
            <ReceiptReview
              receipts={receipts.map((receipt) => ({
                id: receipt.id,
                mime: receipt.mime,
                bytes: receipt.bytes,
                review: receipt.review,
                note: receipt.note,
                uploadedAt: formatDateTimePY(receipt.uploadedAt),
              }))}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-medium">Ítems</h2>
        <ul className="divide-border mt-2 divide-y text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                {item.nameSnapshot}
                <span className="text-muted-foreground"> × {item.qty}</span>
                <span className="text-muted-foreground block text-xs">
                  {item.skuSnapshot} · {formatGs(item.unitPricePyg)} c/u · IVA {item.ivaRate}%
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatGs(item.lineTotalPyg)}</span>
            </li>
          ))}
        </ul>

        <dl className="border-border mt-3 grid grid-cols-2 gap-1 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">{formatGs(order.subtotalPyg)}</dd>
          <dt className="text-muted-foreground">Envío</dt>
          <dd className="text-right tabular-nums">{formatGs(order.shippingPyg)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-semibold tabular-nums">{formatGs(order.totalPyg)}</dd>
        </dl>

        {/* El IVA está INCLUIDO en el total (convención PY): esto es el
            desglose de lo que ya se cobró, no algo que se suma. */}
        <dl className="border-border bg-muted/40 mt-3 grid grid-cols-2 gap-1 rounded-lg border p-3 text-xs">
          <dt className="text-muted-foreground col-span-2 font-medium">
            IVA incluido en el total
          </dt>
          <dt className="text-muted-foreground">IVA 10%</dt>
          <dd className="text-right tabular-nums">{formatGs(order.iva10Pyg)}</dd>
          <dt className="text-muted-foreground">IVA 5%</dt>
          <dd className="text-right tabular-nums">{formatGs(order.iva5Pyg)}</dd>
          <dt className="text-muted-foreground">Gravado</dt>
          <dd className="text-right tabular-nums">
            {formatGs(order.totalPyg - order.iva10Pyg - order.iva5Pyg)}
          </dd>
        </dl>

        <details className="mt-2">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Ver IVA por línea
          </summary>
          <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span>
                  {item.nameSnapshot} · IVA {item.ivaRate}%
                </span>
                <span className="tabular-nums">
                  {formatGs(ivaIncluded(item.lineTotalPyg, item.ivaRate))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Cliente</h2>
        <dl className="mt-2 grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd className="text-right">{order.customerName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">WhatsApp</dt>
            <dd className="text-right tabular-nums">{formatPhonePY(order.customerPhone)}</dd>
          </div>
          {order.customerEmail ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right break-all">{order.customerEmail}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Documento</dt>
            <dd className="text-right tabular-nums">
              {order.docType === "NINGUNO"
                ? "Consumidor final"
                : `${order.docType} ${order.docNumber ?? ""}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Envío</dt>
            <dd className="max-w-[60%] text-right">
              {order.shipAddress}
              {order.shipBarrio ? `, ${order.shipBarrio}` : ""}, {order.shipCity}
              {order.shipReference ? (
                <span className="text-muted-foreground block text-xs">
                  Ref: {order.shipReference}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Cambiar estado</h2>
        {nextStatuses.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Este pedido está en un estado final: ya no se puede mover.
          </p>
        ) : (
          <div className="mt-2">
            <OrderActions orderId={order.id} nextStatuses={[...nextStatuses]} />
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Historial</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-border flex flex-wrap gap-x-3 border-b pb-2">
              <span className="text-muted-foreground w-36 shrink-0 tabular-nums">
                {formatDateTimePY(event.createdAt)}
              </span>
              <span>
                {event.fromStatus ? `${ORDER_STATUS_LABEL[event.fromStatus]} → ` : ""}
                {ORDER_STATUS_LABEL[event.toStatus]}
              </span>
              <span className="text-muted-foreground w-full text-xs">
                {event.actor}
                {event.reason ? ` · ${event.reason}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
