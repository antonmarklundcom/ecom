import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orderEvents, orders, type OrderStatus } from "@/db/schema";
import { TIENDA } from "@/config/tienda";
import { t } from "@/i18n";
import { formatGs } from "@/lib/money";

import { resolveMessageSender, type MessageSender } from "./messaging";
import { motivoDeAviso, withTimeout } from "./notify-timing";
import { firstName, buyerOrderUrl } from "./order-messages";
import { recordOrderEvent } from "./order-events";

/**
 * Los avisos por WhatsApp que recibe la COMPRADORA (fase O3, sigue a O2 —
 * `order-notifications.ts`, el aviso al comercio).
 *
 * O2 avisaba al comercio de que entró un pedido; el comprador no se enteraba
 * de nada del servidor salvo lo que ella misma decidiera mirar en la página
 * del pedido. Acá se agregan tres avisos que salen solos, en el momento en
 * que cambian: **confirmado** (el pedido quedó registrado), **pagado** (la
 * plata entró, por el camino que sea) y **enviado** (salió a reparto).
 *
 * Misma filosofía que O2, y por eso comparten `notify-timing.ts`:
 *
 * 1. **Nunca frenan ni demoran una transición.** Se disparan sin `await`
 *    después de que el pedido ya quedó escrito — desde `createOrder()` para
 *    "confirmado" y desde el hook post-transición de `transitionOrder()` para
 *    "pagado" y "enviado" (`src/domain/orders.ts`). Un Meta caído no puede
 *    hacer perder ni un pedido ni un cobro.
 * 2. **Sin la plantilla de ese aviso, apagado — en cualquier canal.** A
 *    diferencia del aviso al comercio (que sale por la consola de dev en
 *    cuanto hay `WHATSAPP_NUMBER`, sin plantilla), acá la plantilla
 *    `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_*` es el único interruptor de cada
 *    aviso: son tres decisiones independientes del comercio ("¿le aviso
 *    cuando pago? ¿cuando confirmo?"), y una tienda que no cargó ninguna
 *    tiene que quedar exactamente como antes de este archivo, hasta en dev.
 * 3. **Deja rastro y es idempotente.** Sale o falla, queda una fila en
 *    `order_events` con `actor: "sistema"`; y antes de mandar nada se fija si
 *    ya existe la fila de éxito de este aviso para este pedido, para no
 *    mandarlo dos veces (p. ej. un pedido que revive de `vencido` a `pagado`
 *    dos veces en la recuperación de pago tardío, ARCH.md §4.1).
 */

const AVISO_TIMEOUT_MS = 10_000;

export type CustomerNoticeKind = "confirmado" | "pagado" | "enviado";

const TEMPLATE_ENV_VAR: Record<CustomerNoticeKind, string> = {
  confirmado: "WHATSAPP_CLOUD_TEMPLATE_CLIENTE_CONFIRMADO",
  pagado: "WHATSAPP_CLOUD_TEMPLATE_CLIENTE_PAGADO",
  enviado: "WHATSAPP_CLOUD_TEMPLATE_CLIENTE_ENVIADO",
};

/** El nombre de la plantilla de Meta para este aviso, o `null` si no se cargó. */
export function customerNoticeTemplate(kind: CustomerNoticeKind): string | null {
  return process.env[TEMPLATE_ENV_VAR[kind]]?.trim() || null;
}

export type CustomerNotifier = {
  sender: MessageSender;
  /** Nombre de la plantilla de Meta, o `undefined` para el sender de consola. */
  templateName?: string;
};

/**
 * Con qué mandar este aviso, o `null` si esta tienda no lo pidió.
 *
 * La plantilla es obligatoria pase lo que pase con el canal (ver regla 2 de
 * arriba): sin ella, ni el sender de consola de dev manda nada.
 */
export function resolveCustomerNotifier(kind: CustomerNoticeKind): CustomerNotifier | null {
  const templateName = customerNoticeTemplate(kind);
  if (!templateName) return null;

  const sender = resolveMessageSender();
  if (!sender) return null;

  return sender.channel === "whatsapp" ? { sender, templateName } : { sender };
}

/** ¿Esta tienda le manda este aviso a la compradora? */
export function customerNoticeConfigured(kind: CustomerNoticeKind): boolean {
  return resolveCustomerNotifier(kind) !== null;
}

export type CustomerNoticeOrder = {
  orderId: number;
  orderNumber: string;
  customerName: string;
  accessToken: string;
  totalPyg: number;
  /** Snapshot del método (FASE 3); ausente en pedidos viejos o tiendas sin configurar. */
  shippingMethodName?: string | null;
};

/**
 * El texto de cada aviso. Separado del envío para poder testearlo sin red,
 * igual que `newOrderNoticeBody`.
 *
 * `note` es el número de seguimiento o la nota que tipeó el admin al marcar
 * "enviado" — el mismo `reason` que ya queda en el evento de la transición
 * (`advanceOrder` → `transitionOrder`). Sólo se usa para "enviado".
 */
export function customerNoticeBody(
  kind: CustomerNoticeKind,
  order: CustomerNoticeOrder,
  options: { note?: string | null } = {},
): string {
  const nombre = firstName(order.customerName);
  const total = formatGs(order.totalPyg);
  const url = buyerOrderUrl(order);
  const metodo = order.shippingMethodName?.trim();

  if (kind === "confirmado") {
    return [
      t("wa.cliente.confirmado", { nombre, numero: order.orderNumber, total, tienda: TIENDA.nombre }),
      ...(metodo ? [t("wa.cliente.confirmado.envio", { metodo })] : []),
      t("wa.cliente.verPedido", { url }),
    ].join("\n");
  }

  if (kind === "pagado") {
    return [
      t("wa.cliente.pagado", { nombre, numero: order.orderNumber, total }),
      t("wa.cliente.verPedido", { url }),
    ].join("\n");
  }

  // "enviado"
  const nota = options.note?.trim();
  return [
    t("wa.cliente.enviado", { nombre, numero: order.orderNumber }),
    ...(metodo ? [t("wa.cliente.enviado.envio", { metodo })] : []),
    ...(nota ? [t("wa.cliente.enviado.nota", { nota })] : []),
    t("wa.cliente.verPedido", { url }),
  ].join("\n");
}

/** El motivo que queda en `order_events` cuando el aviso sale bien. */
function reasonOk(kind: CustomerNoticeKind): string {
  return `aviso_cliente_${kind}`;
}

/**
 * Le avisa a la compradora del pedido `orderId`. **No tira nunca.**
 *
 * Se la llama sin `await` desde `createOrder()` (kind "confirmado") y desde
 * el hook post-transición de `transitionOrder()` (kind "pagado" / "enviado"),
 * después de que la escritura que dispara el aviso ya quedó comprometida.
 */
export async function notifyCustomerOrderEvent(
  orderId: number,
  kind: CustomerNoticeKind,
  options: { notifier?: CustomerNotifier | null; note?: string | null } = {},
): Promise<void> {
  try {
    const notifier = options.notifier === undefined ? resolveCustomerNotifier(kind) : options.notifier;
    if (!notifier) return;

    const [order] = await getDb()
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        accessToken: orders.accessToken,
        totalPyg: orders.totalPyg,
        shippingMethodName: orders.shippingMethodName,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    // El pedido puede no estar si alguien llamó a esto con un id inventado.
    if (!order) return;

    // Idempotencia: si ya está la fila de éxito de este aviso para este
    // pedido, no se manda de nuevo (p. ej. dos disparos del mismo hook).
    const yaMandado = await getDb()
      .select({ id: orderEvents.id })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.reason, reasonOk(kind))))
      .limit(1);
    if (yaMandado.length > 0) return;

    const body = customerNoticeBody(kind, order, { note: options.note });

    try {
      await withTimeout(
        notifier.sender.send({ to: order.customerPhone, body, templateName: notifier.templateName }),
        AVISO_TIMEOUT_MS,
      );
      await recordOrderEvent({
        orderId,
        status: order.status as OrderStatus,
        actor: "sistema",
        reason: reasonOk(kind),
      });
    } catch (error) {
      console.error(`notifyCustomerOrderEvent(${kind}): no se pudo avisar del pedido`, error);
      await recordOrderEvent({
        orderId,
        status: order.status as OrderStatus,
        actor: "sistema",
        reason: `aviso_cliente_${kind}_fallido: ${motivoDeAviso(error)}`.slice(0, 500),
      });
    }
  } catch (error) {
    // Último cinturón: si hasta el registro del fallo falla, quien disparó
    // esto (createOrder, transitionOrder) igual no se entera.
    console.error("notifyCustomerOrderEvent falló entero", error);
  }
}
