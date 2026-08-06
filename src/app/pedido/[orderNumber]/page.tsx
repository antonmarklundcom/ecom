import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptUpload } from "@/components/receipt-upload";
import { getOrderItems, requireOrderAccess } from "@/domain/order-access";
import { getOrderEvents } from "@/domain/orders";
import { RECEIPT_MAX_PER_ORDER, countReceipts } from "@/domain/receipts";
import type { OrderStatus } from "@/db/schema";
import { comercioWaLink } from "@/lib/comercio";
import { formatGs } from "@/lib/money";
import { formatDateTimePY } from "@/lib/py";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu pedido",
  // El link lleva el token en la URL: fuera de los buscadores.
  robots: { index: false, follow: false },
};

type Params = Promise<{ orderNumber: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente_pago: "Esperando tu pago",
  esperando_verificacion: "Comprobante en revisión",
  pagado: "Pago confirmado",
  preparando: "Preparando tu pedido",
  enviado: "En camino",
  entregado: "Entregado",
  rechazado: "Comprobante rechazado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.t) ? query.t[0] : query.t;

  // Guard: token inválido y pedido inexistente dan exactamente el mismo 404.
  // Distinguirlos convierte esta página en un detector de pedidos válidos.
  const order = await requireOrderAccess(orderNumber, token);
  if (!order) notFound();

  const [items, events, receiptCount] = await Promise.all([
    getOrderItems(order.id),
    getOrderEvents(order.id),
    countReceipts(order.id),
  ]);

  const waHref = comercioWaLink(
    `¡Hola! Te escribo por mi pedido ${order.orderNumber} (${formatGs(order.totalPyg)}).`
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-muted-foreground text-sm">Pedido</p>
      <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
      <p className="mt-1 text-sm">
        Estado: <strong>{STATUS_LABEL[order.status]}</strong>
      </p>

      {order.status === "pendiente_pago" && order.paymentMethod === "transferencia" ? (
        <section className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-medium">Pagá por transferencia o QR</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Transferí el total exacto y subí el comprobante acá abajo. Lo revisamos y te
            confirmamos.
          </p>
          <p className="mt-3 text-sm">
            Total a transferir: <strong className="tabular-nums">{formatGs(order.totalPyg)}</strong>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Los datos bancarios del comercio se cargan en el PR #3.4.
          </p>
        </section>
      ) : null}

      {["pendiente_pago", "rechazado", "esperando_verificacion"].includes(order.status) &&
      order.paymentMethod === "transferencia" &&
      token ? (
        <section className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-medium">Subí tu comprobante</h2>
          <div className="mt-3">
            <ReceiptUpload
              orderNumber={order.orderNumber}
              token={token}
              remaining={RECEIPT_MAX_PER_ORDER - receiptCount}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-medium">Tu pedido</h2>
        <ul className="divide-border mt-2 divide-y text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                {item.nameSnapshot}
                <span className="text-muted-foreground"> × {item.qty}</span>
              </span>
              <span className="tabular-nums">{formatGs(item.lineTotalPyg)}</span>
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
          <dt className="text-muted-foreground text-xs">IVA 10% incluido</dt>
          <dd className="text-muted-foreground text-right text-xs tabular-nums">
            {formatGs(order.iva10Pyg)}
          </dd>
          {order.iva5Pyg > 0 ? (
            <>
              <dt className="text-muted-foreground text-xs">IVA 5% incluido</dt>
              <dd className="text-muted-foreground text-right text-xs tabular-nums">
                {formatGs(order.iva5Pyg)}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Envío</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {order.customerName} · {order.customerPhone}
          <br />
          {order.shipAddress}
          {order.shipBarrio ? `, ${order.shipBarrio}` : ""}, {order.shipCity}
          {order.shipReference ? <span className="block">Ref: {order.shipReference}</span> : null}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Seguimiento</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="text-muted-foreground w-36 shrink-0 tabular-nums">
                {formatDateTimePY(event.createdAt)}
              </span>
              <span>{STATUS_LABEL[event.toStatus]}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border rounded-lg border px-4 py-2 text-sm"
          >
            Escribinos por WhatsApp
          </a>
        ) : null}
        <Link href="/" className="border-border rounded-lg border px-4 py-2 text-sm">
          Seguir comprando
        </Link>
      </div>
    </main>
  );
}
