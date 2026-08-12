import type { Metadata } from "next";
import Link from "next/link";

import { listOrders } from "@/domain/admin-orders";
import { getDashboardSummary } from "@/domain/admin-dashboard";
import { lowStockVariants } from "@/domain/admin-products";
import { findUnmatchedPayments } from "@/domain/payment-recovery";
import { formatGs } from "@/lib/money";
import { formatDateTimePY } from "@/lib/py";

export const metadata: Metadata = { title: "Resumen" };

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [summary, awaiting, lowStock, unmatched] = await Promise.all([
    getDashboardSummary(),
    listOrders({ status: "esperando_verificacion", perPage: 5 }),
    lowStockVariants(3, 8),
    findUnmatchedPayments({ limit: 10 }),
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
            después de que el pedido venciera y la mercadería ya se había vendido. Revisá cada
            uno: o volvés a habilitar el pedido a mano si hay stock, o le devolvés al comprador.
          </p>
          <ul className="divide-border mt-3 divide-y text-sm">
            {unmatched.map((payment) => (
              <li key={payment.paymentId} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/pedidos/${payment.orderId}`} className="font-medium underline">
                    {payment.orderNumber}
                  </Link>
                  <span className="font-semibold tabular-nums">{formatGs(payment.amountPyg)}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {payment.provider} · pedido en &quot;{payment.orderStatus}&quot; ·{" "}
                  {formatDateTimePY(payment.paidAt)}
                </p>
              </li>
            ))}
          </ul>
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

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-border rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}
