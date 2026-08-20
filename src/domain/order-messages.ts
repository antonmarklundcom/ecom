import type { OrderStatus } from "@/db/schema";
import { comercioDatosBancarios, type DatosBancarios } from "@/lib/comercio";
import { formatGs } from "@/lib/money";
import { waLink } from "@/lib/py";
import { siteOrigin } from "@/lib/site-url";

import { MENSAJES } from "./mensajes";
import { orderUrl } from "./order-access";

/**
 * Los mensajes de WhatsApp que el comercio le manda al comprador.
 *
 * Viven acá, en el dominio, y no adentro de una página: el mismo texto de
 * seguimiento se necesita en el detalle del pedido y en el listado de "por
 * cobrar", y un segundo armador es un segundo lugar donde el link tokenizado
 * puede salir mal.
 *
 * **Lo que estos mensajes nunca llevan es el detalle de lo comprado.** Un
 * WhatsApp llega a la pantalla de bloqueo del teléfono, que puede estar sobre
 * una mesa con más gente alrededor, y quien compró no eligió publicar qué
 * compró. Por eso el tipo de entrada no tiene ítems: no es una regla que haya
 * que acordarse de respetar, es que la función no los recibe.
 */

/** Lo mínimo para escribirle: sin ítems, a propósito (ver arriba). */
export type OrderContact = {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  accessToken: string;
  totalPyg: number;
  status: OrderStatus;
};

/** URL absoluta del pedido con su token — la única llave que tiene el comprador. */
export function buyerOrderUrl(order: Pick<OrderContact, "orderNumber" | "accessToken">): string {
  const path = orderUrl(order.orderNumber, order.accessToken);
  const origin = siteOrigin();
  return origin ? new URL(path, origin).toString() : path;
}

function firstName(fullName: string): string {
  return fullName.trim().split(" ")[0] ?? "";
}

/** Seguimiento genérico: el que se usa desde el detalle del pedido. */
export function followUpMessage(order: OrderContact): string {
  return MENSAJES.whatsapp.seguimiento(
    firstName(order.customerName),
    order.orderNumber,
    formatGs(order.totalPyg),
    buyerOrderUrl(order)
  );
}

/**
 * El mensaje de recuperación: el que se manda a un pedido que quedó sin pagar.
 *
 * Lleva exactamente lo que sacó del camino a ese pedido — a dónde transferir,
 * cuánto exacto, y el link para subir el comprobante — porque la fricción que
 * lo frenó fue tener que pedir esos datos de nuevo. Sin `BANCO_*` configurado
 * se manda igual, sin la parte bancaria: mejor un recordatorio incompleto que
 * un banco inventado (mismo criterio que la página del pedido).
 */
export function recoveryMessage(
  order: OrderContact,
  banco: DatosBancarios | null = comercioDatosBancarios()
): string {
  const textos = MENSAJES.whatsapp.recuperacion;
  const hola = textos.hola(firstName(order.customerName));
  const saludo =
    order.status === "vencido"
      ? textos.vencido(hola, order.orderNumber)
      : order.status === "rechazado"
        ? // El comprobante no se pudo validar. El motivo lo escribió el dueño y
          // ella lo lee en la página del pedido; repetirlo por WhatsApp sería
          // contar en una pantalla de bloqueo por qué no le aceptaron un pago.
          textos.rechazado(hola, order.orderNumber)
        : textos.pendiente(hola, order.orderNumber);

  const datos = banco
    ? [
        "",
        textos.paraTransferir,
        `${banco.banco} — ${banco.tipoCuenta}`,
        textos.titular(banco.titular),
        textos.ruc(banco.ruc),
        textos.cuenta(banco.cuenta),
      ]
    : [];

  return [
    saludo,
    "",
    textos.total(formatGs(order.totalPyg)),
    ...datos,
    "",
    textos.subiComprobante(buyerOrderUrl(order)),
  ].join("\n");
}

/** `wa.me` ya armado, o `null` si el teléfono guardado no es válido. */
export function buyerWaLink(order: OrderContact, text: string): string | null {
  try {
    return waLink(order.customerPhone, text);
  } catch {
    // Un teléfono que no normaliza no es motivo para romper el listado
    // entero del panel: la fila se dibuja sin el botón.
    return null;
  }
}
