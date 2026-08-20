import { asc, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { users, type OrderStatus } from "@/db/schema";

import type { Executor } from "./executor";
import { rowsOf } from "./rows";

/**
 * Feed de actividad del panel (PLAN.md FASE 2, PR L).
 *
 * Contesta una pregunta concreta que hoy no se puede hacer: **"¿qué hizo X
 * hoy?"**. Los datos ya existían —`order_events` y `stock_adjustments` son
 * append-only desde el PR #4, y el PR D les puso el `actor_user_id`
 * consultable— pero repartidos en la ficha de cada pedido y de cada variante.
 * Para reconstruir un turno había que abrir pedido por pedido.
 *
 * Es un UNION ALL en SQL y no dos consultas mezcladas en JS a propósito: con
 * dos listas separadas, la paginación miente (traer 20 de cada una y ordenar
 * después no da las 20 más recientes del conjunto).
 */

export const ACTIVITY_PER_PAGE = 30;

export type ActivityKind = "pedido" | "stock";

export const ACTIVITY_KINDS: ActivityKind[] = ["pedido", "stock"];

export function isActivityKind(value: string | undefined): value is ActivityKind {
  return value !== undefined && (ACTIVITY_KINDS as string[]).includes(value);
}

export type ActivityRow = {
  kind: ActivityKind;
  id: number;
  createdAt: Date;
  /** El texto histórico (`admin:due@tienda.py`, `cron`, `pagopar`). */
  actor: string;
  actorUserId: number | null;
  reason: string | null;
  /** Sólo en `pedido`. */
  orderNumber: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  /** Sólo en `stock`. */
  sku: string | null;
  productName: string | null;
  delta: number | null;
  newOnHand: number | null;
};

export type ActivityFilters = {
  actorUserId?: number;
  kind?: ActivityKind;
  /** Instantes UTC ya convertidos desde el día paraguayo (ver lib/py). */
  createdFrom?: Date;
  createdTo?: Date;
  page?: number;
  perPage?: number;
};

export type ActivityPage = {
  rows: ActivityRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

/**
 * Las dos tablas con la misma forma.
 *
 * Las columnas que una no tiene van como NULL: es lo que permite paginar el
 * conjunto en MySQL en vez de en memoria.
 */
const FEED = sql`
  SELECT
    'pedido'        AS kind,
    e.id            AS id,
    e.created_at    AS createdAt,
    e.actor         AS actor,
    e.actor_user_id AS actorUserId,
    e.reason        AS reason,
    o.order_number  AS orderNumber,
    e.from_status   AS fromStatus,
    e.to_status     AS toStatus,
    NULL            AS sku,
    NULL            AS productName,
    NULL            AS delta,
    NULL            AS newOnHand
  FROM order_events e
  JOIN orders o ON o.id = e.order_id
  UNION ALL
  SELECT
    'stock'         AS kind,
    a.id            AS id,
    a.created_at    AS createdAt,
    a.actor         AS actor,
    a.actor_user_id AS actorUserId,
    a.reason        AS reason,
    NULL            AS orderNumber,
    NULL            AS fromStatus,
    NULL            AS toStatus,
    v.sku           AS sku,
    p.name          AS productName,
    a.delta         AS delta,
    a.new_on_hand   AS newOnHand
  FROM stock_adjustments a
  JOIN variants v ON v.id = a.variant_id
  JOIN products p ON p.id = v.product_id
`;

function where(filters: ActivityFilters): SQL {
  const conditions: SQL[] = [sql`1 = 1`];

  if (filters.actorUserId !== undefined) {
    conditions.push(sql`f.actorUserId = ${filters.actorUserId}`);
  }
  if (filters.kind !== undefined) conditions.push(sql`f.kind = ${filters.kind}`);
  if (filters.createdFrom) conditions.push(sql`f.createdAt >= ${filters.createdFrom}`);
  if (filters.createdTo) conditions.push(sql`f.createdAt <= ${filters.createdTo}`);

  return sql.join(conditions, sql` AND `);
}

export async function listActivity(
  filters: ActivityFilters = {},
  executor?: Executor
): Promise<ActivityPage> {
  const tx = executor ?? getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, Math.max(1, filters.perPage ?? ACTIVITY_PER_PAGE));
  const offset = (page - 1) * perPage;
  const condition = where(filters);

  const totalResult = await tx.execute(
    sql`SELECT COUNT(*) AS n FROM (${FEED}) f WHERE ${condition}`
  );
  const total = Number(rowsOf(totalResult)[0]?.n ?? 0);

  const result = await tx.execute(sql`
    SELECT * FROM (${FEED}) f
    WHERE ${condition}
    -- El id desempata dentro del mismo segundo: dos eventos con el mismo
    -- created_at y sin desempate cambian de lugar entre páginas, y una fila
    -- se ve dos veces mientras otra no se ve nunca.
    ORDER BY f.createdAt DESC, f.kind DESC, f.id DESC
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const rows = rowsOf(result).map((row): ActivityRow => ({
    kind: String(row.kind) === "stock" ? "stock" : "pedido",
    id: Number(row.id),
    createdAt: new Date(row.createdAt as string),
    actor: String(row.actor),
    actorUserId: row.actorUserId === null ? null : Number(row.actorUserId),
    reason: row.reason === null ? null : String(row.reason),
    orderNumber: row.orderNumber === null ? null : String(row.orderNumber),
    fromStatus: row.fromStatus === null ? null : (String(row.fromStatus) as OrderStatus),
    toStatus: row.toStatus === null ? null : (String(row.toStatus) as OrderStatus),
    sku: row.sku === null ? null : String(row.sku),
    productName: row.productName === null ? null : String(row.productName),
    delta: row.delta === null ? null : Number(row.delta),
    newOnHand: row.newOnHand === null ? null : Number(row.newOnHand),
  }));

  return {
    rows,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Los usuarios que se pueden elegir en el filtro.
 *
 * Todos los del panel, activos o no: el feed sirve sobre todo para mirar lo
 * que hizo alguien que ya no está.
 */
export async function activityActors(
  executor?: Executor
): Promise<Array<{ id: number; email: string; name: string | null }>> {
  const tx = executor ?? getDb();
  return tx
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .orderBy(asc(users.email));
}
