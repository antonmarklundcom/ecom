import { formatGs } from '@/lib/money';

import { createConsoleSender } from './index';
import type { MessageSender } from './sender';
import { createWhatsappCloudSender } from './whatsapp-cloud';

/**
 * Aviso de pedido nuevo al dueño, por WhatsApp (candidato #1 de la lista de
 * mejoras post-`setup:doctor`: hoy el dueño se entera de un pedido sólo si
 * tiene `/admin/pedidos` abierto).
 *
 * Reusa la **misma** WhatsApp Cloud API que el login sin contraseña
 * (`whatsapp-cloud.ts`) pero con su propia plantilla: el mensaje "entró un
 * pedido" y el mensaje "tu código es 123456" son contenidos distintos y Meta
 * exige una plantilla aprobada por cada uno — no alcanza con reusar la de
 * login. `WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME` es una plantilla nueva a
 * aprobar, separada de `WHATSAPP_CLOUD_TEMPLATE_NAME`.
 *
 * **Apagado por defecto.** Sin `ORDER_NOTIFICATIONS_WHATSAPP_TO` (a quién
 * avisar) no hay a quién mandarle nada, y esa decisión —qué número del
 * comercio recibe los avisos— es de la tienda, nunca un default inventado.
 */

export type OrderNotificationConfig = {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  templateName: string;
};

/** Credenciales de WhatsApp Cloud para el canal de avisos, o `null` si falta alguna. */
export function orderNotificationConfig(): OrderNotificationConfig | null {
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const templateName = process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME?.trim();

  if (!phoneNumberId || !accessToken || !templateName) return null;

  return {
    phoneNumberId,
    accessToken,
    templateName,
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || 'v21.0',
  };
}

/**
 * Sender + destinatario para esta tienda, o `null` si el aviso está apagado.
 *
 * Sin la plantilla de Meta pero **con** destinatario configurado y fuera de
 * producción, cae en la consola del servidor — mismo criterio que
 * `resolveMessageSender` (`index.ts`): sirve para probar el flujo de punta a
 * punta antes de tener la plantilla aprobada, y nunca existe en producción.
 */
function resolveOrderNotificationSender(): { sender: MessageSender; to: string } | null {
  const to = process.env.ORDER_NOTIFICATIONS_WHATSAPP_TO?.trim();
  if (!to) return null;

  const config = orderNotificationConfig();
  if (config) return { sender: createWhatsappCloudSender(config), to };

  if (process.env.NODE_ENV !== 'production') return { sender: createConsoleSender(), to };

  return null;
}

export type NewOrderSummary = {
  orderNumber: string;
  totalPyg: number;
  customerName: string;
};

/**
 * Avisa al dueño que entró un pedido. **Nunca tira**: el pedido y su reserva
 * de stock ya quedaron escritos cuando esto se llama, y un aviso que falla
 * —Meta caído, credenciales vencidas— no puede tumbar un checkout que ya
 * terminó. El error queda en el log del servidor, no en la respuesta al
 * comprador.
 */
export async function notifyNewOrder(order: NewOrderSummary): Promise<void> {
  const resolved = resolveOrderNotificationSender();
  if (!resolved) return;

  const body = `Pedido nuevo ${order.orderNumber} — ${formatGs(order.totalPyg)} — ${order.customerName}`;

  try {
    await resolved.sender.send({ to: resolved.to, body });
  } catch (error) {
    console.error('notifyNewOrder: no se pudo avisar', error);
  }
}
