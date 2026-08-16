import type { Metadata } from "next";
import Link from "next/link";

import { UnmatchedPayments } from "@/components/admin/unmatched-payments";
import { listOrders } from "@/domain/admin-orders";
import { getDashboardSummary, salesTrend, topProducts } from "@/domain/admin-dashboard";
import { lowStockVariants } from "@/domain/admin-products";
import { findUnmatchedPayments } from "@/domain/payment-recovery";
import { formatGs } from "@/lib/money";
import { formatDatePY, formatDateTimePY } from "@/lib/py";

export const metadata: Metadata = { title: "Resumen" };

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [summary, awaiting, lowStock, unmatched, top, trend] = await Promise.all([
    getDashboardSummary(),
    listOrders({ status: "esperando_verificacion", perPage: 5 }),
    lowStockVariants(3, 8),
    findUnmatchedPayments({ limit: 10 }),
    topProducts(),
    salesTrend(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Resumen</h1>

      {/*
        Va arriba de todo y sólo aparece si hay algo: es plata de un comprador
        que está en la cuenta del comercio sin un pedido vivo detrás
        (ARCH.md §4.1). Cada fila es una devolución pendiente.
      */}
      {unmatched.length > 0 && (
        <section className="border-destructive/40 bg-destructive/5 mt-4 rounded-xl border p-4">
          <h2 className="text-destructive font-medium">Pagos sin pedido vivo</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Entró la plata pero el pedido no está cobrado — normalmente el pago llegó justo
            después de que el pedido venciera y la mercadería ya se había vendido.
            <strong> Reintentar</strong> vuelve a probar si hoy hay stock; si no lo hay, no pasa
            nada y podés volver a intentarlo. <strong>Marcar como devuelto</strong> es para
            cuando ya le transferiste la plata de vuelta al comprador.
          </p>
          <UnmatchedPayments
            payments={unmatched.map((payment) => ({
              paymentId: payment.paymentId,
              orderId: payment.orderId,
              orderNumber: payment.orderNumber,
              orderStatus: payment.orderStatus,
              provider: payment.provider,
              amountPyg: payment.amountPyg,
              paidAt: formatDateTimePY(payment.paidAt),
            }))}
          />
        </section>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Ventas de hoy"
          value={formatGs(summary.today.totalPyg)}
          hint={`${summary.today.orders} ${summary.today.orders === 1 ? "pedido cobrado" : "pedidos cobrados"}`}
        />
        <Stat
          label="Ventas del mes"
          value={formatGs(summary.month.totalPyg)}
          hint={`${summary.month.orders} ${summary.month.orders === 1 ? "pedido cobrado" : "pedidos cobrados"}`}
        />
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Sólo se cuentan los pedidos ya cobrados (pagado en adelante). Un pedido esperando pago
        todavía puede vencer.
      </p>

      <section className="mt-8">
        <h2 className="font-medium">Últimos 7 días</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Cada día se corta a medianoche de Asunción y cuenta lo mismo que el cuadro de arriba.
        </p>
        <SalesTrend days={trend} />
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Lo más vendido del mes</h2>
        {top.length === 0 ? (
          <p className="text-muted-foreground border-border mt-2 rounded-xl border border-dashed p-6 text-center text-sm">
            Todavía no hay ventas cobradas este mes.
          </p>
        ) : (
          <ol className="divide-border mt-2 divide-y text-sm">
            {top.map((product, index) => (
              <li key={product.productId} className="flex items-baseline gap-3 py-2">
                <span className="text-muted-foreground w-4 shrink-0 tabular-nums">
                  {index + 1}
                </span>
                <Link
                  href={`/admin/productos/${product.productId}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {product.name}
                </Link>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {product.qty} u.
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatGs(product.totalPyg)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-medium">Esperando verificación</h2>
          <Link href="/admin/pedidos?estado=esperando_verificacion" className="text-sm underline">
            Ver todos ({summary.awaitingVerification})
          </Link>
        </div>

        {awaiting.rows.length === 0 ? (
          <p className="text-muted-foreground border-border mt-2 rounded-xl border border-dashed p-6 text-center text-sm">
            No hay comprobantes esperando revisión. Todo al día.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {awaiting.rows.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/pedidos/${order.id}`}
                  className="border-border hover:bg-muted/50 block rounded-xl border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium tabular-nums">{order.orderNumber}</span>
                    <span className="font-semibold tabular-nums">{formatGs(order.totalPyg)}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {order.customerName} · {formatDateTimePY(order.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Stock bajo</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Disponible = lo que hay físicamente menos lo que ya está reservado por un pedido.
        </p>
        {lowStock.length === 0 ? (
          <p className="text-muted-foreground border-border mt-2 rounded-xl border border-dashed p-6 text-center text-sm">
            Ninguna variante con stock bajo.
          </p>
        ) : (
          <ul className="divide-border mt-2 divide-y text-sm">
            {lowStock.map((variant) => (
              <li key={variant.variantId} className="flex justify-between gap-3 py-2">
                <span>
                  {variant.productName}
                  <span className="text-muted-foreground"> · {variant.label}</span>
                  <span className="text-muted-foreground block text-xs">{variant.sku}</span>
                </span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${variant.available === 0 ? "text-destructive" : ""}`}
                >
                  {variant.available}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Pendientes de pago</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {summary.pendingPayment}{" "}
          {summary.pendingPayment === 1 ? "pedido espera" : "pedidos esperan"} el pago. Los que
          pasen su fecha de reserva los vence el cron automáticamente.
        </p>
        <Link
          href="/admin/pedidos?estado=pendiente_pago"
          className="mt-2 inline-block text-sm underline"
        >
          Ver pendientes
        </Link>
      </section>
    </div>
  );
}

/**
 * Tendencia de la semana.
 *
 * Barras de CSS y no una librería de gráficos: son siete números, y meter un
 * paquete de charting al bundle por esto es cargar 50 kB para dibujar siete
 * rectángulos. Los montos están escritos al lado de cada barra, así que la
 * barra es una ayuda visual y no el único portador del dato — que además es lo
 * que lo hace legible en un lector de pantalla.
 */
function SalesTrend({ days }: { days: Array<{ day: Date; totalPyg: number; orders: number }> }) {
  const max = Math.max(...days.map((day) => day.totalPyg), 1);

  return (
    <ul className="divide-border mt-2 divide-y text-sm">
      {days.map((day) => (
        <li key={day.day.toISOString()} className="flex items-center gap-3 py-2">
          <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
            {formatDatePY(day.day)}
          </span>
          <span className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-primary block h-full rounded-full"
              // El ancho es el único dato que no puede vivir en una clase de
              // Tailwind: sale de una consulta, no de la hoja de estilos.
              style={{ width: `${Math.round((day.totalPyg / max) * 100)}%` }}
            />
          </span>
          <span className="shrink-0 tabular-nums">{formatGs(day.totalPyg)}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-border rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}
