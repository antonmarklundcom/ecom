import { sql } from "drizzle-orm";

import { getDb } from "@/db";

import type { Executor } from "./executor";

/**
 * Reconciliación de totales (PLAN.md 4.10).
 *
 * Verifica, contra la base de verdad, las tres identidades que sostienen todo
 * el dinero de la tienda (ARCH.md §2 "Money invariants"):
 *
 *   1. `subtotal_pyg = Σ(order_items.line_total_pyg)`
 *   2. `total_pyg = subtotal_pyg + shipping_pyg`
 *   3. `line_total_pyg = unit_price_pyg × qty` en cada línea
 *
 * Todo pasa en MySQL con enteros. Si esto se hiciera en JS trayendo las filas,
 * la propia suma sería el paso que introduce el error que estamos buscando.
 *
 * Un desvío acá no es un redondeo: significa que algo escribió un total sin
 * pasar por `createOrder`, y hay que ir a buscar qué.
 */

export type ReconciliationRow = {
  orderId: number;
  orderNumber: string;
  status: string;
  storedSubtotalPyg: number;
  itemsSubtotalPyg: number;
  shippingPyg: number;
  storedTotalPyg: number;
  expectedTotalPyg: number;
  subtotalDiffPyg: number;
  totalDiffPyg: number;
};

/**
 * Pedidos cuyos totales no cierran. Lista vacía = todo cuadra.
 *
 * El LEFT JOIN es a propósito: un pedido sin ítems suma 0 y sale reportado en
 * vez de desaparecer del control, que es justo el caso más raro y más grave.
 */
export async function findTotalMismatches(
  options: { limit?: number } = {},
  executor?: Executor,
): Promise<ReconciliationRow[]> {
  const tx = executor ?? getDb();
  const limit = options.limit ?? 100;

  const result = await tx.execute(sql`
    SELECT
      o.id                                        AS orderId,
      o.order_number                              AS orderNumber,
      o.status                                    AS status,
      o.subtotal_pyg                              AS storedSubtotalPyg,
      COALESCE(i.items_subtotal, 0)               AS itemsSubtotalPyg,
      o.shipping_pyg                              AS shippingPyg,
      o.total_pyg                                 AS storedTotalPyg,
      (o.subtotal_pyg + o.shipping_pyg)           AS expectedTotalPyg,
      CAST(o.subtotal_pyg AS SIGNED) - CAST(COALESCE(i.items_subtotal, 0) AS SIGNED)
                                                  AS subtotalDiffPyg,
      CAST(o.total_pyg AS SIGNED) - CAST(o.subtotal_pyg + o.shipping_pyg AS SIGNED)
                                                  AS totalDiffPyg
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(line_total_pyg) AS items_subtotal
      FROM order_items
      GROUP BY order_id
    ) i ON i.order_id = o.id
    WHERE o.subtotal_pyg <> COALESCE(i.items_subtotal, 0)
       OR o.total_pyg <> o.subtotal_pyg + o.shipping_pyg
    ORDER BY o.id DESC
    LIMIT ${limit}
  `);

  return rowsOf(result).map((row) => ({
    orderId: Number(row.orderId),
    orderNumber: String(row.orderNumber),
    status: String(row.status),
    storedSubtotalPyg: Number(row.storedSubtotalPyg),
    itemsSubtotalPyg: Number(row.itemsSubtotalPyg),
    shippingPyg: Number(row.shippingPyg),
    storedTotalPyg: Number(row.storedTotalPyg),
    expectedTotalPyg: Number(row.expectedTotalPyg),
    subtotalDiffPyg: Number(row.subtotalDiffPyg),
    totalDiffPyg: Number(row.totalDiffPyg),
  }));
}

export type LineMismatch = {
  orderItemId: number;
  orderNumber: string;
  skuSnapshot: string;
  unitPricePyg: number;
  qty: number;
  storedLineTotalPyg: number;
  expectedLineTotalPyg: number;
};

/** Líneas donde `line_total_pyg ≠ unit_price_pyg × qty`. */
export async function findLineMismatches(
  options: { limit?: number } = {},
  executor?: Executor,
): Promise<LineMismatch[]> {
  const tx = executor ?? getDb();
  const limit = options.limit ?? 100;

  const result = await tx.execute(sql`
    SELECT
      oi.id                       AS orderItemId,
      o.order_number              AS orderNumber,
      oi.sku_snapshot             AS skuSnapshot,
      oi.unit_price_pyg           AS unitPricePyg,
      oi.qty                      AS qty,
      oi.line_total_pyg           AS storedLineTotalPyg,
      oi.unit_price_pyg * oi.qty  AS expectedLineTotalPyg
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.line_total_pyg <> oi.unit_price_pyg * oi.qty
    ORDER BY oi.id DESC
    LIMIT ${limit}
  `);

  return rowsOf(result).map((row) => ({
    orderItemId: Number(row.orderItemId),
    orderNumber: String(row.orderNumber),
    skuSnapshot: String(row.skuSnapshot),
    unitPricePyg: Number(row.unitPricePyg),
    qty: Number(row.qty),
    storedLineTotalPyg: Number(row.storedLineTotalPyg),
    expectedLineTotalPyg: Number(row.expectedLineTotalPyg),
  }));
}

export type ReconciliationReport = {
  totalMismatches: ReconciliationRow[];
  lineMismatches: LineMismatch[];
  ok: boolean;
};

export async function reconcile(executor?: Executor): Promise<ReconciliationReport> {
  const [totalMismatches, lineMismatches] = await Promise.all([
    findTotalMismatches({}, executor),
    findLineMismatches({}, executor),
  ]);

  return {
    totalMismatches,
    lineMismatches,
    ok: totalMismatches.length === 0 && lineMismatches.length === 0,
  };
}

/** mysql2 devuelve `[rows, fields]`; drizzle a veces pasa las filas peladas. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}
