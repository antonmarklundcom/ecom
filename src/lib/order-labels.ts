import type { OrderStatus, PaymentMethod } from "@/db/schema";
import { TEXTOS } from "@/i18n";

/**
 * Los textos de la máquina de estados, en un solo archivo.
 *
 * Los ENUM de la DB están en snake_case y nadie los lee así. Hay **dos**
 * traducciones legítimas del mismo estado, y por eso conviven acá en vez de
 * unificarse en una: el panel dice qué tiene que hacer el dueño
 * ("Verificar comprobante"), y la página del pedido le cuenta al comprador
 * qué está pasando con su plata ("Comprobante en revisión"). Son el mismo
 * `esperando_verificacion` visto desde los dos lados del mostrador.
 *
 * Lo que sí era un problema es que vivieran en archivos distintos: agregar un
 * estado obligaba a acordarse del segundo mapa, y el que se olvidaba se
 * enteraba con un `undefined` en pantalla. Acá los dos `Record<OrderStatus,
 * string>` fallan el typecheck juntos.
 *
 * Es además el punto de extracción del i18n (PLAN.md, PR P–S): un catálogo de
 * mensajes reemplaza este archivo y nada más.
 */

/** Cómo lo lee el dueño en el panel: qué hay que hacer con este pedido. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = TEXTOS.panel.estados.panel;

/**
 * Cómo lo lee el comprador en `/pedido/[orderNumber]`: qué pasa con lo suyo.
 *
 * Éste sí sale del catálogo de i18n (PR Q): lo lee quien compra, que puede no
 * hablar el idioma del dueño. El de arriba —el del panel— sigue en código
 * hasta el PR R.
 */
export const ORDER_STATUS_LABEL_COMPRADOR: Record<OrderStatus, string> =
  TEXTOS.estados.comprador;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = TEXTOS.panel.estados.metodo;

/** Verbo del botón que lleva a cada estado, en voseo. */
export const TRANSITION_LABEL: Partial<Record<OrderStatus, string>> =
  TEXTOS.panel.estados.transicion;

/**
 * Transiciones que borran plata o stock y merecen una confirmación extra.
 * No es seguridad — `transitionOrder` valida igual —, es no cancelar un
 * pedido con el pulgar en el celular.
 */
export const DESTRUCTIVE_TRANSITIONS: readonly OrderStatus[] = [
  "cancelado",
  "rechazado",
  "reembolsado",
  "vencido",
];
