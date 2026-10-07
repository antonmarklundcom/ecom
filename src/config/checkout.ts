import type { PaymentMethod } from "@/db/schema";

/** Store-owned policy. Runtime prerequisites always apply to these choices. */
export const CHECKOUT: { paymentMethods: readonly PaymentMethod[] } = {
  paymentMethods: ["transferencia", "contra_entrega", "tarjeta"],
};
