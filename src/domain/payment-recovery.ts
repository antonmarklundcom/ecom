import { and, eq, sql } from "drizzle-orm";
import type { MessageKey, Params } from "@/i18n";

import { DomainError } from "./errors";

import { getDb } from "@/db";
import { orders, payments, type OrderStatus } from "@/db/schema";

import type { Executor } from "./executor";
import { transitionOrder } from "./orders";

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

/* ---------------------------------------------------------------------------
 * Las dos acciones que la lista implica
 *
 * Mostrar la plata colgada era la mitad del trabajo. La otra mitad es poder
 * hacer algo con ella sin abrir la consola de MySQL: reintentar la
 * recuperación (si volvió a haber stock) o marcarla devuelta.
 *
 * Las dos releen el estado con `SELECT ... FOR UPDATE` en vez de confiar en el
 * id que vino del formulario. La lista se renderizó hace un minuto y desde
 * entonces pudo pasar cualquier cosa: el otro dueño ya devolvió esa plata, el
 * cron movió el pedido, entró una venta que se llevó la última unidad. Decidir
 * sobre lo que decía la pantalla es decidir sobre datos viejos.
 *
 * Las dos son idempotentes: el segundo click no hace nada y no es un error.
 * ------------------------------------------------------------------------- */

/** Algo del pedido o del pago impide la acción. El mensaje lo lee el dueño. */
export class PaymentRecoveryError extends DomainError {
  constructor(code: MessageKey, params?: Params) {
    super(code, params);
    this.name = "PaymentRecoveryError";
  }
}

export type RecoveryResult = {
  paymentId: number;
  orderId: number;
  orderNumber: string;
  orderStatus: OrderStatus;
  /** `false` si ya estaba así: el segundo click de un doble click. */
  changed: boolean;
  /** Devolución sobre un pedido que ya estaba `cancelado`: no se movió nada. */
  orderAlreadyClosed?: boolean;
};

/**
 * Reintenta revivir el pedido de un pago que quedó colgado.
 *
 * El caso que arregla: el pago entró tarde, el pedido estaba `vencido` y la
 * mercadería no estaba. Días después el comercio repone stock y el pedido se
 * puede cumplir. Esto es ese botón.
 *
 * No hay ningún `UPDATE orders SET status` acá: el estado lo mueve
 * `transitionOrder`, que vuelve a validar la arista y —lo importante— vuelve a
 * asegurar el stock antes de descontar (ARCH.md §4.1). Si la mercadería sigue
 * sin estar, tira `StockUnavailableError` y el pedido no se mueve: el
 * reintento puede fallar tantas veces como haga falta sin ensuciar nada.
 */
export async function retryOrderRevival(input: {
  paymentId: number;
  actor: string;
  /**
   * `users.id` de quien lo hizo (PR D). Opcional por el mismo motivo que en
   * `TransitionOptions`: hay caminos legítimos sin persona detrás.
   */
  actorUserId?: number | null;
}): Promise<RecoveryResult> {
  return getDb().transaction(async (tx) => {
    const { payment, order } = await lockPaymentAndOrder(tx, input.paymentId);

    if (payment.status === "refunded") {
      throw new PaymentRecoveryError("adminError.pago.yaDevuelto");
    }
    if (payment.status !== "paid") {
      throw new PaymentRecoveryError("adminError.pago.noAcreditado");
    }

    // Otro dueño ya lo revivió desde la otra pestaña. No es un error: el
    // resultado que se pedía ya está.
    if (SETTLED_STATUSES.includes(order.status as (typeof SETTLED_STATUSES)[number])) {
      return {
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        changed: false,
      };
    }

    // `cancelado` no revive (ARCH.md §4.1, regla 4): lo canceló una persona a
    // propósito y el software no la contradice. La máquina de estados ya lo
    // impide —`cancelado` no tiene aristas de salida— pero el mensaje que sale
    // de ahí habla de transiciones, y el que lee esto es el dueño.
    if (order.status === "cancelado") {
      throw new PaymentRecoveryError("adminError.pago.pedidoCancelado");
    }

    const result = await transitionOrder(
      order.id,
      "pagado",
      input.actor,
      "reintento de recuperación del pago tardío desde el panel",
      { executor: tx, actorUserId: input.actorUserId ?? null },
    );

    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: "pagado" as OrderStatus,
      changed: result.changed,
    };
  });
}

/** Mínimo del motivo de la devolución. El mismo criterio que el rechazo. */
export const REFUND_MIN_REASON = 5;

/**
 * Marca el pago como devuelto y cierra el pedido.
 *
 * Dos escrituras que tienen que ir juntas o no ir: `payments.status` a
 * `refunded` y el pedido a `cancelado`, con el motivo en `order_events`. Si se
 * escribiera sólo la primera, la plata desaparecería de esta lista con el
 * pedido todavía esperando; si se escribiera sólo la segunda, la devolución no
 * quedaría registrada en ningún lado.
 *
 * Esto **no le devuelve la plata a nadie**: la transferencia la hace el dueño
 * desde su banco. Acá se anota que la hizo, que es lo que saca la fila de la
 * lista de pendientes.
 */
export async function refundPayment(input: {
  paymentId: number;
  reason: string;
  actor: string;
  /**
   * `users.id` de quien lo hizo (PR D). Opcional por el mismo motivo que en
   * `TransitionOptions`: hay caminos legítimos sin persona detrás.
   */
  actorUserId?: number | null;
}): Promise<RecoveryResult> {
  const reason = input.reason.trim();
  if (reason.length < REFUND_MIN_REASON) {
    throw new PaymentRecoveryError("adminError.pago.sinMotivo");
  }

  return getDb().transaction(async (tx) => {
    const { payment, order } = await lockPaymentAndOrder(tx, input.paymentId);

    // Segundo click: ya estaba devuelto. Se contesta lo mismo que la primera
    // vez, sin escribir nada.
    if (payment.status === "refunded") {
      return {
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        changed: false,
      };
    }
    if (payment.status !== "paid") {
      throw new PaymentRecoveryError("adminError.pago.nadaQueDevolver");
    }

    // El pedido revivió mientras esta pantalla estaba abierta. Marcar la
    // devolución ahora cancelaría un pedido que alguien está por preparar.
    if (SETTLED_STATUSES.includes(order.status as (typeof SETTLED_STATUSES)[number])) {
      throw new PaymentRecoveryError("adminError.pago.pedidoRevivio", {
        estado: order.status,
      });
    }

    await tx
      .update(payments)
      .set({ status: "refunded" })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "paid")));

    // `cancelado` es el estado terminal honesto para un pedido cuya plata
    // vuelve. Si ya estaba cancelado, `transitionOrder` no escribe evento y el
    // motivo de la cancelación original —que ya está en el historial— se
    // respeta: no se pisa con este.
    const result = await transitionOrder(
      order.id,
      "cancelado",
      input.actor,
      `pago devuelto: ${reason}`.slice(0, 500),
      { executor: tx, actorUserId: input.actorUserId ?? null },
    );

    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: "cancelado" as OrderStatus,
      // `true` sin mirar `result.changed`: el pago pasó a `refunded` en esta
      // misma corrida, aunque el pedido ya estuviera cancelado de antes.
      changed: true,
      orderAlreadyClosed: !result.changed,
    };
  });
}

/**
 * Relee el pago y su pedido con el candado tomado.
 *
 * El orden importa: primero el pago, después el pedido — el mismo que toma
 * `transitionOrder` a continuación. Dos acciones simultáneas sobre la misma
 * fila se ordenan en vez de cruzarse.
 */
async function lockPaymentAndOrder(tx: Executor, paymentId: number) {
  const payment = (
    await tx
      .select({ id: payments.id, orderId: payments.orderId, status: payments.status })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update")
  )[0];

  if (!payment) {
    throw new PaymentRecoveryError("adminError.pago.noEncontrado");
  }

  const order = (
    await tx
      .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
      .from(orders)
      .where(eq(orders.id, payment.orderId))
      .for("update")
  )[0];

  if (!order) {
    throw new PaymentRecoveryError("adminError.pago.pedidoNoExiste");
  }

  return { payment, order };
}

/** mysql2 devuelve `[rows, fields]`; drizzle a veces pasa las filas peladas. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}
