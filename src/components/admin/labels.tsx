import type { OrderStatus, PaymentMethod } from "@/db/schema";

/**
 * Los ENUM de la DB están en snake_case; el dueño lee castellano. Un único
 * lugar donde se traduce, para que el listado, la ficha y el resumen no
 * discrepen.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente_pago: "Esperando pago",
  esperando_verificacion: "Verificar comprobante",
  pagado: "Pagado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  rechazado: "Comprobante rechazado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "Transferencia / QR",
  contra_entrega: "Contra entrega",
  tarjeta: "Tarjeta",
};

/** Verbo del botón que lleva a cada estado, en voseo. */
export const TRANSITION_LABEL: Partial<Record<OrderStatus, string>> = {
  pagado: "Marcar como pagado",
  preparando: "Empezar a preparar",
  enviado: "Marcar como enviado",
  entregado: "Marcar como entregado",
  cancelado: "Cancelar pedido",
  vencido: "Marcar como vencido",
  rechazado: "Rechazar comprobante",
  reembolsado: "Marcar como reembolsado",
  pendiente_pago: "Volver a esperando pago",
  esperando_verificacion: "Volver a verificación",
};

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
