import { and, count, desc, eq, gte, like, lt, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  orderItems,
  orders,
  type OrderStatus,
  type PaymentMethod,
} from "@/db/schema";
import { normalizePhonePY } from "@/lib/py";

import type { Executor } from "./executor";

/**
 * Consultas de lectura del panel de pedidos (PLAN.md 4.2).
 *
 * Todo el filtrado, la búsqueda y la paginación pasan en MySQL. El dueño abre
 * esto desde el celular con datos móviles: traer 800 pedidos para filtrar en
 * el navegador es la diferencia entre una página que abre y una que no.
 */

export const ORDERS_PER_PAGE = 20;

export type OrderFilters = {
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  /** Instantes UTC ya convertidos desde el día paraguayo (ver lib/py). */
  createdFrom?: Date;
  createdTo?: Date;
  search?: string;
  page?: number;
  perPage?: number;
};

export type AdminOrderRow = {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  docNumber: string | null;
  totalPyg: number;
  createdAt: Date;
  reservedUntil: Date | null;
  pendingReceipts: number;
};

export type AdminOrderPage = {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export function isOrderStatus(value: string | undefined): value is OrderStatus {
  return value !== undefined && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: string | undefined): value is PaymentMethod {
  return value !== undefined && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** `%` y `_` son comodines de LIKE: sin escaparlos, `%` lista todo. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Búsqueda por número de pedido, WhatsApp o RUC/CI.
 *
 * No es un `LIKE %term%` sobre todas las columnas: cada forma de buscar entra
 * por el índice que le corresponde (`orders_number_uq`, `orders_phone_idx`,
 * `orders_doc_number_idx`). El teléfono se normaliza antes de comparar porque
 * en la DB está guardado `+595981123456` y el dueño lo va a tipear
 * `0981 123 456`.
 */
function searchCondition(rawTerm: string): SQL | undefined {
  const term = rawTerm.trim();
  if (term === "") return undefined;

  const conditions: SQL[] = [];

  // "PY-000123", "py-000123" o directamente "123".
  const upper = term.toUpperCase();
  if (/^PY-\d+$/.test(upper)) {
    conditions.push(eq(orders.orderNumber, upper));
  } else if (/^\d{1,7}$/.test(term)) {
    conditions.push(eq(orders.orderNumber, `PY-${term.padStart(6, "0")}`));
  }

  const phone = normalizePhonePY(term);
  if (phone) conditions.push(eq(orders.customerPhone, phone));

  // RUC/CI: se compara sin puntos ni guion contra el documento guardado,
  // también normalizado, para que "80012345-6" y "800123456" encuentren lo
  // mismo.
  const docDigits = term.replace(/[.\s-]/g, "");
  if (/^\d{4,10}$/.test(docDigits)) {
    conditions.push(
      sql`REPLACE(REPLACE(${orders.docNumber}, '-', ''), '.', '') = ${docDigits}`,
    );
  }

  // Último recurso: el nombre del cliente. Es un scan, pero sólo cae acá
  // cuando el término no parece ninguna de las tres llaves de arriba.
  if (conditions.length === 0) {
    conditions.push(like(orders.customerName, `%${escapeLike(term)}%`));
  }

  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

function buildWhere(filters: OrderFilters, options: { ignoreStatus?: boolean } = {}): SQL | undefined {
  return and(
    filters.status && !options.ignoreStatus ? eq(orders.status, filters.status) : undefined,
    filters.paymentMethod ? eq(orders.paymentMethod, filters.paymentMethod) : undefined,
    filters.createdFrom ? gte(orders.createdAt, filters.createdFrom) : undefined,
    // Borde superior exclusivo: `parsePyDateInputEnd` ya devuelve la
    // medianoche siguiente.
    filters.createdTo ? lt(orders.createdAt, filters.createdTo) : undefined,
    filters.search ? searchCondition(filters.search) : undefined,
  );
}

export async function listOrders(
  filters: OrderFilters = {},
  executor?: Executor,
): Promise<AdminOrderPage> {
  const tx = executor ?? getDb();
  const perPage = Math.min(100, Math.max(1, filters.perPage ?? ORDERS_PER_PAGE));
  const page = Math.max(1, filters.page ?? 1);
  const where = buildWhere(filters);

  const [{ total = 0 } = {}] = await tx
    .select({ total: count() })
    .from(orders)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  // Si el filtro achicó el resultado, `?page=9` no puede quedar en una página
  // vacía sin explicación.
  const safePage = Math.min(page, totalPages);

  const rows = await tx
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      docNumber: orders.docNumber,
      totalPyg: orders.totalPyg,
      createdAt: orders.createdAt,
      reservedUntil: orders.reservedUntil,
      // Subconsulta y no JOIN: un JOIN a `receipts` multiplica las filas del
      // pedido por sus comprobantes y rompe la paginación.
      //
      // Las columnas van calificadas a mano y con alias. Interpolar
      // `${receipts.orderId}` acá adentro las emite **sin** el nombre de la
      // tabla, así que `WHERE order_id = id` termina comparando dos columnas
      // de `receipts` y la cuenta siempre da cero, sin error que lo delate.
      pendingReceipts: sql<number>`(
        SELECT COUNT(*) FROM \`receipts\` AS r
        WHERE r.\`order_id\` = \`orders\`.\`id\` AND r.\`review\` = 'pending'
      )`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(perPage)
    .offset((safePage - 1) * perPage);

  return {
    rows: rows.map((row) => ({ ...row, pendingReceipts: Number(row.pendingReceipts) })),
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

export type OrderStatusCounts = {
  /** Un número por estado, incluidos los que están en cero. */
  byStatus: Record<OrderStatus, number>;
  /** Todos los pedidos que pasan el resto de los filtros. */
  total: number;
};

/**
 * Cuántos pedidos hay en cada estado, para los accesos rápidos del listado.
 *
 * **Ignora el filtro de estado a propósito** y respeta todos los demás: los
 * números que se ven arriba del listado tienen que ser los de "a dónde puedo
 * ir desde acá", no los de dónde estoy parado. Si respetara el estado activo,
 * todos los accesos menos uno mostrarían cero y dejarían de servir para
 * navegar.
 *
 * Una sola consulta agrupada y no once `COUNT(*)`: esto se abre desde el
 * celular con datos móviles.
 */
export async function countOrdersByStatus(
  filters: OrderFilters = {},
  executor?: Executor,
): Promise<OrderStatusCounts> {
  const tx = executor ?? getDb();

  const rows = await tx
    .select({ status: orders.status, total: count() })
    .from(orders)
    .where(buildWhere(filters, { ignoreStatus: true }))
    .groupBy(orders.status);

  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, 0]),
  ) as Record<OrderStatus, number>;

  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row.total;
    total += row.total;
  }

  return { byStatus, total };
}

/** Ficha completa del pedido para `/admin/pedidos/[id]` (PLAN.md 4.3). */
export async function getAdminOrder(orderId: number, executor?: Executor) {
  const tx = executor ?? getDb();
  const rows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return null;

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order, items };
}

/** Pedidos con comprobante esperando revisión — el trabajo pendiente del dueño. */
export async function countAwaitingVerification(executor?: Executor): Promise<number> {
  const tx = executor ?? getDb();
  const [row] = await tx
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.status, "esperando_verificacion"));
  return row?.total ?? 0;
}
