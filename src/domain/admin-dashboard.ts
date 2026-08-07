import { and, count, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { orders, type OrderStatus } from "@/db/schema";
import { startOfDayPY, startOfMonthPY, startOfNextDayPY } from "@/lib/py";

import type { Executor } from "./executor";

/**
 * Números del resumen (PLAN.md 4.7).
 *
 * "Ventas de hoy" cuenta lo **cobrado**, no lo pedido: un pedido en
 * `pendiente_pago` todavía puede vencer, y meterlo en la caja del día hace que
 * el panel muestre plata que no entró. El corte del día es a medianoche de
 * Asunción, no de UTC (ver `lib/py`).
 */

/** Estados en los que la plata ya entró y no volvió. */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  "pagado",
  "preparando",
  "enviado",
  "entregado",
];

export type SalesTotals = {
  /** Suma de `total_pyg`. Entero, guaraníes. */
  totalPyg: number;
  orders: number;
};

async function salesBetween(
  tx: Executor,
  from: Date,
  to: Date | null,
): Promise<SalesTotals> {
  const [row] = await tx
    .select({
      // COALESCE porque SUM sobre cero filas devuelve NULL, no 0.
      totalPyg: sql<string | number>`COALESCE(SUM(${orders.totalPyg}), 0)`,
      orders: count(),
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, [...REVENUE_STATUSES]),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
      ),
    );

  return {
    // mysql2 devuelve la suma de un BIGINT como string cuando no entra en un
    // número exacto: se normaliza acá, una sola vez.
    totalPyg: Number(row?.totalPyg ?? 0),
    orders: row?.orders ?? 0,
  };
}

export type DashboardSummary = {
  today: SalesTotals;
  month: SalesTotals;
  awaitingVerification: number;
  pendingPayment: number;
};

export async function getDashboardSummary(
  now: Date = new Date(),
  executor?: Executor,
): Promise<DashboardSummary> {
  const tx = executor ?? getDb();

  const [today, month, awaiting, pending] = await Promise.all([
    salesBetween(tx, startOfDayPY(now), startOfNextDayPY(now)),
    salesBetween(tx, startOfMonthPY(now), null),
    tx
      .select({ total: count() })
      .from(orders)
      .where(inArray(orders.status, ["esperando_verificacion"])),
    tx.select({ total: count() }).from(orders).where(inArray(orders.status, ["pendiente_pago"])),
  ]);

  return {
    today,
    month,
    awaitingVerification: awaiting[0]?.total ?? 0,
    pendingPayment: pending[0]?.total ?? 0,
  };
}
