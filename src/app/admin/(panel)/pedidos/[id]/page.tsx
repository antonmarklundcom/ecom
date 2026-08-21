import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/order-labels";
import { ReceiptReview } from "@/components/admin/receipt-review";
import { getAdminOrder, isRecoverableStatus } from "@/domain/admin-orders";
import { ORDER_TRANSITIONS, getOrderEvents } from "@/domain/orders";
import { listReceipts } from "@/domain/receipts";
import { buyerWaLink, followUpMessage, recoveryMessage } from "@/domain/order-messages";
import { adminActor } from "@/lib/admin-guard";
import { getDatosBancarios } from "@/lib/comercio";
import { formatGs, ivaIncluded } from "@/lib/money";
import { can } from "@/lib/permissions";
import { VENDEDOR_TRANSITIONS } from "@/lib/session";
import { formatDateTimePY, formatPhonePY } from "@/lib/py";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("panel.pedido.meta") };

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({ params }: { params: Params }) {
  const actor = await adminActor();
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const found = await getAdminOrder(orderId);
  if (!found) notFound();

  const { order, items } = found;
  const [events, receipts, banco] = await Promise.all([
    getOrderEvents(order.id),
    listReceipts(order.id),
    // Una sola lectura por pantalla: `recoveryMessage` ya no los busca solo
    // (ver `src/domain/order-messages.ts`).
    getDatosBancarios(),
  ]);

  // Los dos mensajes salen del mismo armador que usa "Por cobrar": el link
  // tokenizado y la regla de no listar lo comprado se escriben una sola vez
  // (ver `src/domain/order-messages.ts`).
  const waHref = buyerWaLink(order, followUpMessage(order));
  const recoveryHref = isRecoverableStatus(order.status)
    ? buyerWaLink(order, recoveryMessage(order, banco))
    : null;

  const verPrecios = can(actor.role, "precios");
  const verComprobantes = can(actor.role, "comprobantes");

  // La máquina de estados dice qué transiciones existen desde acá; el rol dice
  // cuáles de ésas puede apretar quien está mirando. `advanceOrder` vuelve a
  // chequear las dos cosas del lado del servidor (`assertCanTransitionTo` +
  // `transitionOrder`), así que un botón fabricado a mano no mueve nada.
  const nextStatuses = ORDER_TRANSITIONS[order.status].filter(
    (status) => actor.role !== "vendedor" || VENDEDOR_TRANSITIONS.includes(status)
  );

  return (
    <div>
      <Link href="/admin/pedidos" className="text-muted-foreground text-sm">
        {t("panel.porCobrar.volver")}
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight tabular-nums">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {formatDateTimePY(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
          >
            {t("panel.pedido.escribir")}
          </a>
        ) : null}
        {recoveryHref ? (
          <a
            href={recoveryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
          >
            {t("panel.pedido.mandarDatos")}
          </a>
        ) : null}
      </div>

      {/* Arriba de todo y no en la ficha del cliente: esto se mira mientras
          se arma el paquete, y un dato que hay que scrollear para encontrar
          es un dato que se descubre después de cerrar la caja. */}
      {order.isGift ? (
        <section className="border-border bg-muted/40 mt-4 rounded-lg border p-3">
          <h2 className="text-sm font-medium">{t("panel.pedido.esRegalo")}</h2>
          {order.giftNote ? (
            <p className="mt-1 text-sm whitespace-pre-line">“{order.giftNote}”</p>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">{t("panel.pedido.sinMensaje")}</p>
          )}
        </section>
      ) : null}

      {receipts.length > 0 && verComprobantes ? (
        <section className="mt-6">
          <h2 className="font-medium">{t("panel.pedido.comprobantes")}</h2>
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

      {/*
        Los ítems los ven los tres roles —sin saber qué armar no se despacha
        nada— pero los montos no: el vendedor arma el paquete, no audita la
        caja (ARCH.md §1). Lo que le queda es qué producto, qué SKU y cuántas
        unidades, que es exactamente su trabajo.
      */}
      <section className="mt-6">
        <h2 className="font-medium">{t("panel.pedido.items")}</h2>
        <ul className="divide-border mt-2 divide-y text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                {item.nameSnapshot}
                <span className="text-muted-foreground"> × {item.qty}</span>
                <span className="text-muted-foreground block text-xs">
                  {item.skuSnapshot}
                  {verPrecios
                    ? t("panel.pedido.itemDetalle", {
                        precio: formatGs(item.unitPricePyg),
                        tasa: item.ivaRate,
                      })
                    : ""}
                </span>
              </span>
              {verPrecios ? (
                <span className="shrink-0 tabular-nums">{formatGs(item.lineTotalPyg)}</span>
              ) : null}
            </li>
          ))}
        </ul>

        {verPrecios ? (
          <>
            <dl className="border-border mt-3 grid grid-cols-2 gap-1 border-t pt-3 text-sm">
              <dt className="text-muted-foreground">{t("panel.pedido.subtotal")}</dt>
              <dd className="text-right tabular-nums">{formatGs(order.subtotalPyg)}</dd>
              {order.discountPyg > 0 ? (
                <>
                  <dt className="text-muted-foreground">
                    {order.couponCode
                      ? t("panel.pedido.descuentoCon", { codigo: order.couponCode })
                      : t("panel.pedido.descuento")}
                  </dt>
                  <dd className="text-right tabular-nums">−{formatGs(order.discountPyg)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("panel.pedido.envio")}</dt>
              <dd className="text-right tabular-nums">{formatGs(order.shippingPyg)}</dd>
              <dt className="font-medium">{t("panel.pedido.total")}</dt>
              <dd className="text-right font-semibold tabular-nums">{formatGs(order.totalPyg)}</dd>
            </dl>

            {/* El IVA está INCLUIDO en el total (convención PY): esto es el
            desglose de lo que ya se cobró, no algo que se suma. */}
            <dl className="border-border bg-muted/40 mt-3 grid grid-cols-2 gap-1 rounded-lg border p-3 text-xs">
              <dt className="text-muted-foreground col-span-2 font-medium">
                {t("panel.pedido.ivaIncluido")}
              </dt>
              <dt className="text-muted-foreground">{t("panel.pedido.iva10")}</dt>
              <dd className="text-right tabular-nums">{formatGs(order.iva10Pyg)}</dd>
              <dt className="text-muted-foreground">{t("panel.pedido.iva5")}</dt>
              <dd className="text-right tabular-nums">{formatGs(order.iva5Pyg)}</dd>
              <dt className="text-muted-foreground">{t("panel.pedido.gravado")}</dt>
              <dd className="text-right tabular-nums">
                {formatGs(order.totalPyg - order.iva10Pyg - order.iva5Pyg)}
              </dd>
            </dl>

            <details className="mt-2">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                {t("panel.pedido.ivaPorLinea")}
              </summary>
              <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4">
                    <span>
                      {t("panel.pedido.lineaIva", {
                        nombre: item.nameSnapshot,
                        tasa: item.ivaRate,
                      })}
                    </span>
                    <span className="tabular-nums">
                      {formatGs(ivaIncluded(item.lineTotalPyg, item.ivaRate))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="font-medium">{t("panel.pedido.cliente")}</h2>
        <dl className="mt-2 grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("panel.pedido.nombre")}</dt>
            <dd className="text-right">{order.customerName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("panel.pedido.whatsapp")}</dt>
            <dd className="text-right tabular-nums">{formatPhonePY(order.customerPhone)}</dd>
          </div>
          {order.customerEmail ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("panel.pedido.email")}</dt>
              <dd className="text-right break-all">{order.customerEmail}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("panel.pedido.documento")}</dt>
            <dd className="text-right tabular-nums">
              {order.docType === "NINGUNO"
                ? t("panel.pedido.consumidorFinal")
                : t("panel.pedido.docConNumero", {
                    tipo: order.docType,
                    numero: order.docNumber ?? "",
                  })}
            </dd>
          </div>
          {/* Se muestra sólo si contestó: en los pedidos anteriores a la
              casilla la columna es NULL, y "no se preguntó" no es un "no". */}
          {order.marketingOptIn !== null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("panel.pedido.novedades")}</dt>
              <dd className="text-right">
                {order.marketingOptIn ? t("panel.pedido.acepta") : t("panel.pedido.noAcepta")}
                {order.marketingOptInAt ? (
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    {formatDateTimePY(order.marketingOptInAt)}
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("panel.pedido.envio")}</dt>
            <dd className="max-w-[60%] text-right">
              {order.shipAddress}
              {order.shipBarrio ? `, ${order.shipBarrio}` : ""}, {order.shipCity}
              {order.shipReference ? (
                <span className="text-muted-foreground block text-xs">
                  {t("panel.pedido.referencia", { referencia: order.shipReference })}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">{t("panel.pedido.cambiarEstado")}</h2>
        {nextStatuses.length === 0 ? (
          // Dos motivos distintos para no tener botones, y decir el que no es
          // manda a alguien a buscar un problema que no existe: el pedido
          // terminó, o este rol no despacha desde acá.
          <p className="text-muted-foreground mt-2 text-sm">
            {ORDER_TRANSITIONS[order.status].length === 0
              ? t("panel.pedido.estadoFinal")
              : t("panel.pedido.sinPermiso")}
          </p>
        ) : (
          <div className="mt-2">
            <OrderActions orderId={order.id} nextStatuses={[...nextStatuses]} />
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-medium">{t("panel.pedido.historial")}</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-border flex flex-wrap gap-x-3 border-b pb-2">
              <span className="text-muted-foreground w-36 shrink-0 tabular-nums">
                {formatDateTimePY(event.createdAt)}
              </span>
              <span>
                {event.fromStatus
                  ? t("panel.pedido.transicionDesde", {
                      estado: ORDER_STATUS_LABEL[event.fromStatus],
                    })
                  : ""}
                {ORDER_STATUS_LABEL[event.toStatus]}
              </span>
              <span className="text-muted-foreground w-full text-xs">
                {event.actor}
                {event.reason ? t("panel.pedido.motivoEvento", { motivo: event.reason }) : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
