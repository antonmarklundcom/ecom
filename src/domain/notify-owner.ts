import { getDb } from "@/db";
import { orderEvents, type OrderStatus } from "@/db/schema";
import { comercioWaLink, ownerNewOrderWaMessage } from "@/lib/comercio";

import { adminOrderUrl } from "./order-access";

/**
 * Notificación al dueño de un pedido nuevo (PLAN.md 3.10, TASKS.md §9).
 *
 * Se llama DESPUÉS de que `createOrder` ya commiteó su transacción y nunca
 * puede abortarla — si esto falla, el pedido igual existe. MVP sin WhatsApp
 * Cloud API (eso es fase 2, PLAN.md): generamos el deeplink wa.me hacia el
 * número del comercio con el link **interno** del panel (nunca el token del
 * comprador) y dejamos una fila en `order_events` como registro.
 */
export type NewOrderNotificationInput = {
  orderId: number;
  orderNumber: string;
  totalPyg: number;
  status?: OrderStatus;
};

export async function notifyOwnerOfNewOrder(input: NewOrderNotificationInput): Promise<void> {
  try {
    const panelUrl = adminOrderUrl(input.orderId, process.env.NEXT_PUBLIC_SITE_URL ?? "");
    const waHref = comercioWaLink(ownerNewOrderWaMessage(input.orderNumber, input.totalPyg, panelUrl));

    await getDb()
      .insert(orderEvents)
      .values({
        orderId: input.orderId,
        fromStatus: null,
        toStatus: input.status ?? "pendiente_pago",
        actor: "system",
        reason: waHref
          ? `Notificación al dueño generada (wa.me) para ${input.orderNumber}.`
          : "No se pudo armar la notificación al dueño: falta WHATSAPP_NUMBER en el entorno.",
      });
  } catch {
    // Nunca revierte el pedido: la transacción de createOrder ya commiteó.
    // Sin datos personales acá — sólo el id, que no identifica a nadie por sí solo.
    console.error(`No pude registrar la notificación del pedido ${input.orderId}.`);
  }
}
