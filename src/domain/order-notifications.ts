import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orders, type PaymentMethod } from "@/db/schema";
import { t } from "@/i18n";
import { comercioWhatsApp } from "@/lib/comercio";
import { formatGs } from "@/lib/money";
import { siteOrigin } from "@/lib/site-url";

import { resolveMessageSender, whatsappOwnerTemplate, type MessageSender } from "./messaging";
import { recordOrderEvent } from "./order-events";

/**
 * El aviso de pedido nuevo al comercio (fable/plan.md §5.2, F2 de la revisión).
 *
 * Antes de esto, el único "aviso" era un link de WhatsApp que **la compradora**
 * decidía tocar o no: un pedido con el comprobante ya subido podía quedar 24
 * horas sin que nadie lo mirara. Ahora el servidor le escribe al número del
 * comercio en cuanto el pedido queda commiteado.
 *
 * Tres reglas que no se negocian:
 *
 * 1. **Nunca hace fallar ni demorar el checkout.** `notifyOwnerNewOrder` no
 *    tira nunca: atrapa todo adentro y lo deja anotado en `order_events`. La
 *    compradora no puede perder su pedido porque Meta esté caído.
 * 2. **Sin variables, apagado.** Sin número del comercio, sin sender, o —en
 *    WhatsApp Cloud— sin la plantilla aprobada para este mensaje, no hay aviso
 *    y la tienda es exactamente la de antes.
 * 3. **Deja rastro.** Salga o falle, queda una fila en `order_events` con
 *    `actor: "sistema"`. Un aviso que se pierde en silencio es peor que no
 *    tenerlo: el dueño creería que no hubo pedidos.
 */

/** Más que esto y no vale la pena seguir esperando: el pedido ya está guardado. */
const AVISO_TIMEOUT_MS = 10_000;

export type OwnerNotifier = {
  sender: MessageSender;
  /** Nombre de la plantilla de Meta, o `undefined` para el sender de consola. */
  templateName?: string;
  to: string;
};

/**
 * Con qué mandar el aviso, o `null` si esta tienda no puede mandarlo.
 *
 * `null` es la respuesta esperada en la mayoría de las tiendas: es todo el
 * mecanismo que apaga la feature (regla de `.env.example`: una variable vacía
 * apaga, no rompe).
 */
export function resolveOwnerNotifier(): OwnerNotifier | null {
  const to = comercioWhatsApp();
  if (!to) return null;

  const sender = resolveMessageSender();
  if (!sender) return null;

  if (sender.channel === "whatsapp") {
    const templateName = whatsappOwnerTemplate();
    // Sin plantilla propia el mensaje saldría con la del código de login:
    // Meta lo rechaza, y si no lo rechazara sería peor.
    if (!templateName) return null;
    return { sender, templateName, to };
  }

  return { sender, to };
}

/** ¿Esta tienda le avisa al comercio de los pedidos nuevos? */
export function ownerNotificationsConfigured(): boolean {
  return resolveOwnerNotifier() !== null;
}

export type NewOrderNotice = {
  orderId: number;
  orderNumber: string;
  customerName: string;
  totalPyg: number;
  paymentMethod: PaymentMethod;
};

/**
 * El texto del aviso. Separado del envío para poder testearlo sin red.
 *
 * Sin `NEXT_PUBLIC_SITE_URL` no hay link absoluto —un `/admin/pedidos/12` en
 * WhatsApp no es clickeable y no dice a qué tienda pertenece—, así que en ese
 * caso el mensaje sale sin la línea del link en vez de con una a medias.
 */
export function newOrderNoticeBody(notice: NewOrderNotice): string {
  const linea = t("wa.aviso.pedidoNuevo", {
    numero: notice.orderNumber,
    total: formatGs(notice.totalPyg),
    metodo: t(`metodo.${notice.paymentMethod}`),
    nombre: notice.customerName.trim(),
  });

  const origin = siteOrigin();
  if (!origin) return linea;

  const url = new URL(`/admin/pedidos/${notice.orderId}`, origin).toString();
  return `${linea}\n${t("wa.aviso.pedidoNuevo.url", { url })}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`el envío pasó de ${ms} ms`)), ms).unref?.(),
    ),
  ]);
}

/** Motivo corto para `order_events.reason`: sin stack, sin número de nadie. */
function motivo(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Le avisa al comercio del pedido `orderId`. **No tira nunca.**
 *
 * Se la llama sin `await` desde el checkout, después del commit: la compradora
 * ya tiene su pedido y su link, y nada de lo que pase acá puede cambiarle eso.
 */
export async function notifyOwnerNewOrder(
  orderId: number,
  options: { notifier?: OwnerNotifier | null } = {},
): Promise<void> {
  try {
    const notifier = options.notifier === undefined ? resolveOwnerNotifier() : options.notifier;
    if (!notifier) return;

    const [order] = await getDb()
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        totalPyg: orders.totalPyg,
        paymentMethod: orders.paymentMethod,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    // El pedido puede no estar si alguien llamó a esto con un id inventado.
    // No es un fallo del aviso: no hay a quién anotarle el evento.
    if (!order) return;

    const body = newOrderNoticeBody({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      totalPyg: order.totalPyg,
      paymentMethod: order.paymentMethod,
    });

    try {
      await withTimeout(
        notifier.sender.send({ to: notifier.to, body, templateName: notifier.templateName }),
        AVISO_TIMEOUT_MS,
      );
      await recordOrderEvent({
        orderId,
        status: order.status,
        actor: "sistema",
        reason: "aviso_dueno_enviado",
      });
    } catch (error) {
      console.error("notifyOwnerNewOrder: no se pudo avisar del pedido", error);
      await recordOrderEvent({
        orderId,
        status: order.status,
        actor: "sistema",
        reason: `aviso_dueno_fallido: ${motivo(error)}`.slice(0, 500),
      });
    }
  } catch (error) {
    // Último cinturón: si hasta el registro del fallo falla (la base se cayó
    // entre el commit y esto), el checkout **igual** no se entera.
    console.error("notifyOwnerNewOrder falló entero", error);
  }
}
