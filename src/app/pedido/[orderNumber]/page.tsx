import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DatosTransferencia } from "@/components/datos-transferencia";
import { ReceiptUpload } from "@/components/receipt-upload";
import { getOrderItems, requireOrderAccess } from "@/domain/order-access";
import { getOrderEvents } from "@/domain/orders";
import { RECEIPT_MAX_PER_ORDER, countReceipts } from "@/domain/receipts";
import type { OrderStatus } from "@/db/schema";
import { comercioWaLink, datosBancarios } from "@/lib/comercio";
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

  const banco = datosBancarios();

  const waHref = comercioWaLink(
    `¡Hola! Te escribo por mi pedido ${order.orderNumber} (${formatGs(order.totalPyg)}).`
  );

  /**
   * Botón "mandar el comprobante por WhatsApp" (PLAN.md 3.6).
   *
   * El mensaje ya trae el nro. de pedido y el total para que el dueño no tenga
   * que preguntar de qué pedido se trata. **No** lleva el link tokenizado: eso
   * le da acceso al pedido a cualquiera que reenvíe el chat, y acá el que
   * escribe es el propio comprador, que ya lo tiene.
   */
  const waComprobanteHref = comercioWaLink(
    `¡Hola! Te mando el comprobante de mi pedido ${order.orderNumber} por ` +
      `${formatGs(order.totalPyg)}. (Adjuntá la foto acá 👇)`
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-muted-foreground text-sm">Pedido</p>
      <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
      <p className="mt-1 text-sm">
        Estado: <strong>{STATUS_LABEL[order.status]}</strong>
      </p>

      {["pendiente_pago", "rechazado"].includes(order.status) &&
      order.paymentMethod === "transferencia" ? (
        <section className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-medium">Pagá por transferencia o QR</h2>

          {banco ? (
            <>
              <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm">
                <li>Transferí el total exacto a la cuenta de abajo.</li>
                <li>Guardá el comprobante que te da el banco.</li>
                <li>Subilo acá o mandanoslo por WhatsApp.</li>
              </ol>

              <div className="mt-4">
                <DatosTransferencia
                  qrUrl={banco.qrUrl}
                  campos={[
                    {
                      label: "Total exacto a transferir",
                      display: formatGs(order.totalPyg),
                      // Dígitos pelados: ni `₲` ni puntos de miles. `formatGs`
                      // da "₲ 570.000" y `formatGsPlain` todavía agrupa
                      // ("570.000") — y el campo "monto" de una app bancaria
                      // interpreta ese punto como decimal o directamente
                      // rechaza el pegado. Acá el formato lindo es para leer,
                      // no para copiar.
                      copy: String(order.totalPyg),
                      destacado: true,
                    },
                    { label: "Banco", display: banco.banco },
                    { label: "Titular", display: banco.titular },
                    { label: "RUC", display: banco.ruc },
                    { label: "Nº de cuenta", display: banco.cuenta },
                    ...(banco.alias ? [{ label: "Alias SPI", display: banco.alias }] : []),
                  ]}
                />
              </div>

              <p className="text-muted-foreground mt-3 text-xs">
                Transferí el monto exacto: si el importe no coincide, tenemos que verificarlo a
                mano y tu pedido tarda más.
              </p>
            </>
          ) : (
            // Sin datos bancarios cargados no inventamos una pantalla de pago
            // a medias: mandamos al comprador por el camino que sí funciona.
            <p className="mt-2 text-sm">
              Escribinos por WhatsApp y te pasamos los datos para transferir.{" "}
              {waHref ? (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline">
                  Abrir WhatsApp
                </a>
              ) : null}
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

          {/* Salida alternativa: mucha gente tiene el comprobante en la app del
              banco y le sale más natural mandarlo por WhatsApp que buscar el
              archivo. Que el pedido no se trabe por eso. */}
          {waComprobanteHref ? (
            <p className="text-muted-foreground mt-4 text-sm">
              ¿Se te complica subirlo?{" "}
              <a
                href={waComprobanteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium underline"
              >
                Mandanoslo por WhatsApp
              </a>
            </p>
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
