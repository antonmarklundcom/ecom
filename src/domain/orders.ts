import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { orderEvents, orders, stockReservations, variants, type OrderStatus } from '@/db/schema';

import type { Executor, Tx } from './executor';

/**
 * Máquina de estados del pedido (ARCH.md §3).
 *
 * `transitionOrder()` es la ÚNICA forma de cambiar `orders.status`. Ninguna
 * ruta, acción o script hace `UPDATE orders SET status = ...` por su cuenta:
 * si lo hiciera, un webhook duplicado o tardío podría arrastrar un pedido
 * `enviado` de vuelta a `pagado` y el log de auditoría mentiría.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pendiente_pago: ['esperando_verificacion', 'pagado', 'vencido', 'cancelado'],
  esperando_verificacion: ['pagado', 'rechazado', 'cancelado'],
  // Comprobante inválido: el comprador puede reintentar.
  rechazado: ['pendiente_pago', 'cancelado'],
  pagado: ['preparando', 'reembolsado'],
  preparando: ['enviado', 'reembolsado'],
  enviado: ['entregado'],
  entregado: [],
  vencido: ['cancelado'],
  cancelado: [],
  reembolsado: [],
};

/** Estados en los que todavía no entró plata. */
export const PRE_PAYMENT_STATUSES: readonly OrderStatus[] = [
  'pendiente_pago',
  'esperando_verificacion',
  'rechazado',
];

/** Al entrar acá el stock se consume de verdad. */
const CONSUMES_STOCK: readonly OrderStatus[] = ['pagado'];
/** Al entrar acá las reservas se sueltan. */
const RELEASES_STOCK: readonly OrderStatus[] = ['vencido', 'cancelado'];

export class OrderNotFoundError extends Error {
  constructor(readonly orderId: number) {
    super(`No existe el pedido ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly orderId: number,
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Transición inválida para el pedido ${orderId}: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export type TransitionResult = {
  orderId: number;
  from: OrderStatus;
  to: OrderStatus;
  /** `false` cuando el pedido ya estaba en ese estado (webhook repetido). */
  changed: boolean;
};

export type TransitionOptions = {
  /** Para encadenar la transición dentro de una transacción ya abierta. */
  executor?: Executor;
};

/**
 * Cambia el estado de un pedido.
 *
 * 1. abre transacción y toma `SELECT ... FOR UPDATE` sobre el pedido,
 * 2. si ya está en el estado destino, no hace nada (idempotente),
 * 3. rechaza toda arista que no esté en `ORDER_TRANSITIONS`,
 * 4. `→ pagado`: consume las reservas y descuenta `on_hand` en la MISMA
 *    transacción — una sola vez, porque las reservas quedan `consumed`,
 * 5. `→ vencido | cancelado`: libera las reservas,
 * 6. escribe la fila de auditoría en `order_events`.
 */
export async function transitionOrder(
  orderId: number,
  to: OrderStatus,
  actor: string,
  reason?: string | null,
  options: TransitionOptions = {},
): Promise<TransitionResult> {
  const run = async (tx: Tx | Executor): Promise<TransitionResult> => {
    const locked = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update');

    const order = locked[0];
    if (!order) throw new OrderNotFoundError(orderId);

    const from = order.status;

    // Webhook repetido / doble click del admin: no-op, no evento, no descuento.
    if (from === to) {
      return { orderId, from, to, changed: false };
    }

    if (!canTransition(from, to)) {
      throw new InvalidTransitionError(orderId, from, to);
    }

    if (CONSUMES_STOCK.includes(to)) {
      await consumeReservations(tx, orderId);
    }
    if (RELEASES_STOCK.includes(to)) {
      await releaseReservations(tx, orderId);
    }

    await tx
      .update(orders)
      .set({
        status: to,
        ...(to === 'pagado' ? { paidAt: new Date() } : {}),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, from)));

    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: from,
      toStatus: to,
      actor,
      reason: reason ?? null,
    });

    return { orderId, from, to, changed: true };
  };

  return options.executor ? run(options.executor) : getDb().transaction(run);
}

/**
 * Marca las reservas del pedido como `consumed` y descuenta `on_hand`.
 * Sólo toca las que siguen en `held`, así que correr esto dos veces descuenta
 * una sola vez.
 */
async function consumeReservations(tx: Executor, orderId: number): Promise<void> {
  const held = await tx
    .select({ id: stockReservations.id, variantId: stockReservations.variantId, qty: stockReservations.qty })
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.state, 'held')))
    .for('update');

  for (const reservation of held) {
    await tx
      .update(variants)
      // GREATEST(...,0): on_hand es UNSIGNED. Si un ajuste manual de stock dejó
      // menos de lo reservado, preferimos 0 antes que abortar el cobro.
      .set({ onHand: sql`GREATEST(${variants.onHand} - ${reservation.qty}, 0)` })
      .where(eq(variants.id, reservation.variantId));

    await tx
      .update(stockReservations)
      .set({ state: 'consumed' })
      .where(and(eq(stockReservations.id, reservation.id), eq(stockReservations.state, 'held')));
  }
}

async function releaseReservations(tx: Executor, orderId: number): Promise<void> {
  await tx
    .update(stockReservations)
    .set({ state: 'released' })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.state, 'held')));
}

/** Timeline del pedido para `/pedido/[n]` y para el admin. */
export async function getOrderEvents(orderId: number, executor?: Executor) {
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt, orderEvents.id);
}
