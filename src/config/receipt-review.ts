/**
 * Cuánto se sostiene la mercadería de un pedido por transferencia mientras su
 * comprobante espera revisión. Store-owned: cada tienda lo ajusta a su ritmo
 * de revisión (docs/TEMPLATE-IMPROVEMENT-PLAN.md D5).
 *
 * La ventana cuenta desde el **primer** comprobante, no desde el último:
 * subir otro no la renueva, así un pedido no puede retener stock para
 * siempre. Si el dueño no lo revisa a tiempo, la unidad vuelve a estar
 * disponible y la aprobación vuelve a pedirla (si ya no hay, no se cobra
 * mercadería que no existe).
 */
export const RECEIPT_REVIEW: { holdHours: number } = {
  holdHours: 48,
};
