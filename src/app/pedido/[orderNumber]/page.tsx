import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyField } from "@/components/copy-field";
import { PurchaseEvent } from "@/components/purchase-event";
import { GuardarDatosCta } from "@/components/cuenta/guardar-datos";
import { ReceiptUpload } from "@/components/receipt-upload";
import { getOrderItems, requireOrderAccess, orderUrl } from "@/domain/order-access";
import { getOrderEvents } from "@/domain/orders";
import { RECEIPT_MAX_PER_ORDER, countReceipts } from "@/domain/receipts";
import { t } from "@/i18n";
import { analyticsActivo } from "@/lib/analytics";
import { comercioWaLink, getDatosBancarios } from "@/lib/comercio";
import { formatGs, formatGsPlain } from "@/lib/money";
import { ORDER_STATUS_LABEL_COMPRADOR } from "@/lib/order-labels";
import { formatDateTimePY } from "@/lib/py";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("pedido.meta"),
  // El link lleva el token en la URL: fuera de los buscadores.
  robots: { index: false, follow: false },
};

type Params = Promise<{ orderNumber: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

  const [items, events, receiptCount, datosBancarios] = await Promise.all([
    getOrderItems(order.id),
    getOrderEvents(order.id),
    countReceipts(order.id),
    getDatosBancarios(),
  ]);

  const waHref = comercioWaLink(
    t("pedido.consultaWhatsApp", {
      numero: order.orderNumber,
      total: formatGs(order.totalPyg),
    })
  );

  // PLAN 3.6: mensaje pre-armado con nro. de pedido, total y la URL
  // tokenizada — bien por debajo del límite de ~1500 caracteres de waLink()
  // (ARCH.md §5 punto 4).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const buyerUrl = `${siteUrl}${orderUrl(order.orderNumber, order.accessToken)}`;
  const comprobanteWaHref = comercioWaLink(
    t("pedido.comprobante.waMensaje", {
      numero: order.orderNumber,
      total: formatGs(order.totalPyg),
      url: buyerUrl,
    })
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-muted-foreground text-sm">{t("pedido.etiqueta")}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
      <p className="mt-1 text-sm">
        {t("pedido.estado")} <strong>{ORDER_STATUS_LABEL_COMPRADOR[order.status]}</strong>
      </p>

      {order.status === "pendiente_pago" && order.paymentMethod === "transferencia" ? (
        <section className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-medium">{t("pedido.transferencia.titulo")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("pedido.transferencia.bajada")}</p>

          {datosBancarios ? (
            <>
              <dl className="divide-border mt-3 divide-y">
                <CopyField label={t("pedido.banco.banco")} value={datosBancarios.banco} />
                <CopyField label={t("pedido.banco.titular")} value={datosBancarios.titular} />
                <CopyField label={t("pedido.banco.ruc")} value={datosBancarios.ruc} />
                <CopyField label={datosBancarios.tipoCuenta} value={datosBancarios.cuenta} />
                <CopyField
                  label={t("pedido.banco.total")}
                  value={formatGsPlain(order.totalPyg)}
                />
              </dl>

              {datosBancarios.qrUrl ? (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="border-border relative size-56 overflow-hidden rounded-lg border bg-white">
                    <Image
                      src={datosBancarios.qrUrl}
                      alt={t("pedido.banco.qrAlt")}
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">{t("pedido.banco.qrAyuda")}</p>
                </div>
              ) : null}

              <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
                <li>{t("pedido.pasos.1")}</li>
                <li>{t("pedido.pasos.2")}</li>
                <li>{t("pedido.pasos.3", { total: formatGs(order.totalPyg) })}</li>
                <li>{t("pedido.pasos.4")}</li>
                <li>{t("pedido.pasos.5")}</li>
              </ol>
            </>
          ) : (
            <p className="text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-sm">
              {t("pedido.banco.sinDatos")}
            </p>
          )}
        </section>
      ) : null}

      {["pendiente_pago", "rechazado", "esperando_verificacion"].includes(order.status) &&
      order.paymentMethod === "transferencia" &&
      token ? (
        <section className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-medium">{t("pedido.comprobante.titulo")}</h2>
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
                {t("pedido.comprobante.waAyuda")}
              </p>
              <a
                href={comprobanteWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border mt-2 inline-flex rounded-lg border px-4 py-2 text-sm"
              >
                {t("pedido.comprobante.waBoton")}
              </a>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-medium">{t("pedido.items.titulo")}</h2>
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
          <dt className="text-muted-foreground">{t("pedido.subtotal")}</dt>
          <dd className="text-right tabular-nums">{formatGs(order.subtotalPyg)}</dd>
          {/* El descuento, con el código que lo explica: es lo primero que se
              busca cuando el total no coincide con lo que se recordaba. */}
          {order.discountPyg > 0 ? (
            <>
              <dt className="text-muted-foreground">
                {order.couponCode
                  ? t("pedido.descuentoCon", { codigo: order.couponCode })
                  : t("pedido.descuento")}
              </dt>
              <dd className="text-right tabular-nums">−{formatGs(order.discountPyg)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("pedido.envio")}</dt>
          <dd className="text-right tabular-nums">{formatGs(order.shippingPyg)}</dd>
          <dt className="font-medium">{t("pedido.total")}</dt>
          <dd className="text-right font-semibold tabular-nums">{formatGs(order.totalPyg)}</dd>
          <dt className="text-muted-foreground text-xs">{t("pedido.iva10")}</dt>
          <dd className="text-muted-foreground text-right text-xs tabular-nums">
            {formatGs(order.iva10Pyg)}
          </dd>
          {order.iva5Pyg > 0 ? (
            <>
              <dt className="text-muted-foreground text-xs">{t("pedido.iva5")}</dt>
              <dd className="text-muted-foreground text-right text-xs tabular-nums">
                {formatGs(order.iva5Pyg)}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">{t("pedido.envio.titulo")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {order.customerName} · {order.customerPhone}
          <br />
          {order.shipAddress}
          {order.shipBarrio ? `, ${order.shipBarrio}` : ""}, {order.shipCity}
          {order.shipReference ? (
            <span className="block">
              {t("pedido.envio.referencia", { referencia: order.shipReference })}
            </span>
          ) : null}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">{t("pedido.seguimiento")}</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="text-muted-foreground w-36 shrink-0 tabular-nums">
                {formatDateTimePY(event.createdAt)}
              </span>
              <span>{ORDER_STATUS_LABEL_COMPRADOR[event.toStatus]}</span>
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
            {t("pedido.escribinos")}
          </a>
        ) : null}
        <Link href="/" className="border-border rounded-lg border px-4 py-2 text-sm">
          {t("pedido.seguirComprando")}
        </Link>
      </div>
      {/* Devuelve null con las cuentas apagadas: sin el flag, esta página
          es idéntica a la de antes de la feature. */}
      <GuardarDatosCta orderNumber={order.orderNumber} />

      {/* El evento de venta para GA4/Meta Pixel, una sola vez por navegador.
          Sin medidores configurados no se renderiza — src/lib/analytics.ts. */}
      {analyticsActivo() ? (
        <PurchaseEvent orderNumber={order.orderNumber} totalPyg={order.totalPyg} />
      ) : null}
    </main>
  );
}
