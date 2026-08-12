import { sql } from "drizzle-orm";

import { getDb } from "@/db";

import type { Executor } from "./executor";

/**
 * Plata que entró y no tiene un pedido vivo detrás (ARCH.md §4.1).
 *
 * Es el otro extremo de la política del pago tardío. Cuando el aviso de
 * Pagopar llega después de que el cron venció el pedido, `transitionOrder`
 * intenta revivirlo re-asegurando el stock. Si la mercadería ya se vendió, el
 * pedido se queda en `vencido` **pero el pago igual queda registrado**: la fila
 * de `payments` en `paid` y el aviso crudo en `payment_events`. Perder ese
 * registro sería lo único imperdonable — es la prueba de que el comprador pagó.
 *
 * Registrado no alcanza: alguien tiene que devolver esa plata. Esta consulta
 * es lo que hace que el dueño lo vea, y por eso no se apoya en ninguna columna
 * nueva ni en ningún flag que haya que acordarse de escribir. Se deriva de los
 * datos: pago cobrado + pedido que no está en la cadena del cobro = caso a
 * mirar. Un flag se puede olvidar de poner; esto no.
 *
 * Todo el filtro corre en MySQL con enteros: acá no se hace aritmética de
 * dinero, sólo se lo transporta.
 */

/** Estados en los que el pago tiene sentido: la plata entró y el pedido vive. */
const SETTLED_STATUSES = ["pagado", "preparando", "enviado", "entregado", "reembolsado"] as const;

export type UnmatchedPayment = {
  paymentId: number;
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  provider: string;
  providerRef: string;
  amountPyg: number;
  /** Total del pedido, para comparar de un vistazo contra lo cobrado. */
  orderTotalPyg: number;
  paidAt: Date;
};

/**
 * Pagos en `paid` cuyo pedido no llegó nunca a la cadena del cobro.
 *
 * Lista vacía = no hay plata colgada. Cada fila es una devolución pendiente o,
 * en el mejor de los casos, un pedido que se puede revivir a mano si volvió a
 * haber stock.
 */
export async function findUnmatchedPayments(
  options: { limit?: number } = {},
  executor?: Executor,
): Promise<UnmatchedPayment[]> {
  const tx = executor ?? getDb();
  const limit = options.limit ?? 50;

  const result = await tx.execute(sql`
    SELECT
      p.id            AS paymentId,
      o.id            AS orderId,
      o.order_number  AS orderNumber,
      o.status        AS orderStatus,
      p.provider      AS provider,
      p.provider_ref  AS providerRef,
      p.amount_pyg    AS amountPyg,
      o.total_pyg     AS orderTotalPyg,
      p.updated_at    AS paidAt
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE p.status = 'paid'
      AND o.status NOT IN (${sql.join(
        SETTLED_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )})
    ORDER BY p.updated_at DESC
    LIMIT ${limit}
  `);

  return rowsOf(result).map((row) => ({
    paymentId: Number(row.paymentId),
    orderId: Number(row.orderId),
    orderNumber: String(row.orderNumber),
    orderStatus: String(row.orderStatus),
    provider: String(row.provider),
    providerRef: String(row.providerRef),
    amountPyg: Number(row.amountPyg),
    orderTotalPyg: Number(row.orderTotalPyg),
    paidAt: new Date(row.paidAt as string | number | Date),
  }));
}

/** Sólo el conteo, para el resumen del panel. */
export async function countUnmatchedPayments(executor?: Executor): Promise<number> {
  const rows = await findUnmatchedPayments({ limit: 1000 }, executor);
  return rows.length;
}

/** mysql2 devuelve `[rows, fields]`; drizzle a veces pasa las filas peladas. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}
