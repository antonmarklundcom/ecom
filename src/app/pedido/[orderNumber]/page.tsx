import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyField } from "@/components/copy-field";
import { ReceiptUpload } from "@/components/receipt-upload";
import { getOrderItems, requireOrderAccess, orderUrl } from "@/domain/order-access";
import { getOrderEvents } from "@/domain/orders";
import { RECEIPT_MAX_PER_ORDER, countReceipts } from "@/domain/receipts";
import type { OrderStatus } from "@/db/schema";
import { comercioDatosBancarios, comercioWaLink } from "@/lib/comercio";
import { formatGs, formatGsPlain } from "@/lib/money";
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

  const datosBancarios = comercioDatosBancarios();

  // PLAN 3.6: mensaje pre-armado con nro. de pedido, total y la URL
  // tokenizada — bien por debajo del límite de ~1500 caracteres de waLink()
  // (ARCH.md §5 punto 4).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const buyerUrl = `${siteUrl}${orderUrl(order.orderNumber, order.accessToken)}`;
  const comprobanteWaHref = comercioWaLink(
    `¡Hola! Ya transferí el pedido ${order.orderNumber} por ${formatGs(order.totalPyg)}. ` +
      `Te mando el comprobante. Podés ver el pedido acá: ${buyerUrl}`
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

          {datosBancarios ? (
            <>
              <dl className="divide-border mt-3 divide-y">
                <CopyField label="Banco" value={datosBancarios.banco} />
                <CopyField label="Titular" value={datosBancarios.titular} />
                <CopyField label="RUC" value={datosBancarios.ruc} />
                <CopyField label={datosBancarios.tipoCuenta} value={datosBancarios.cuenta} />
                <CopyField label="Total a transferir (₲)" value={formatGsPlain(order.totalPyg)} />
              </dl>

              {datosBancarios.qrUrl ? (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="border-border relative size-56 overflow-hidden rounded-lg border bg-white">
                    <Image
                      src={datosBancarios.qrUrl}
                      alt="Código QR para pagar por SPI"
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    O escaneá el QR desde la app de tu banco.
                  </p>
                </div>
              ) : null}

              <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
                <li>Abrí la app de tu banco y elegí transferencia por SPI o pago por QR.</li>
                <li>Copiá el banco, titular, RUC y número de cuenta de arriba (o escaneá el QR).</li>
                <li>
                  Copiá el total exacto —{" "}
                  <strong className="tabular-nums">{formatGs(order.totalPyg)}</strong>— y pegalo
                  como monto. No redondees ni cambies el número.
                </li>
                <li>Confirmá la transferencia.</li>
                <li>Sacá una captura del comprobante y subila acá abajo.</li>
              </ol>
            </>
          ) : (
            <p className="text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-sm">
              Los datos bancarios del comercio todavía no están configurados. Escribinos por
              WhatsApp con tu número de pedido y te los pasamos a mano mientras tanto.
            </p>
          )}
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
          {comprobanteWaHref ? (
            <>
              <p className="text-muted-foreground mt-4 text-xs">
                También podés mandarnos el comprobante directo por WhatsApp:
              </p>
              <a
                href={comprobanteWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border mt-2 inline-flex rounded-lg border px-4 py-2 text-sm"
              >
                Enviar comprobante por WhatsApp
              </a>
            </>
          ) : null}
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
