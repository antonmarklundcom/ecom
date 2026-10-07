import { CHECKOUT } from "@/config/checkout";
import type { PaymentMethod } from "@/db/schema";

/**
 * Qué medios de pago **eligió** la tienda, sin mirar si están configurados
 * (eso lo decide `readyPaymentMethods`). Puro: lo usan el checkout, el panel y
 * `pnpm preflight`, que no puede importar la base.
 *
 * Precedencia: selección explícita del dueño en `/admin/ajustes` >
 * `STORE_PAYMENT_METHODS` > `src/config/checkout.ts`.
 *
 * - Una selección del dueño vacía es una **pausa** a propósito: cierra.
 * - Un valor inválido —en el panel o en la variable— cierra: nunca se abre un
 *   medio que nadie eligió.
 * - La variable **vacía o en blanco es "no está"**, como cualquier variable
 *   opcional del template (CLAUDE.md): pegar el bloque de
 *   docs/ENV-OPCIONAL.md con el valor vacío no puede cerrar el checkout
 *   entero (docs/TEMPLATE-IMPROVEMENT-PLAN.md D2).
 */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "transferencia",
  "contra_entrega",
  "tarjeta",
];

export function paymentPolicy(
  owner: readonly PaymentMethod[] | null,
  environment: string | undefined
): PaymentMethod[] {
  const allowed = new Set<string>(PAYMENT_METHODS);
  const variable = environment?.trim() ? environment : undefined;
  const requested: readonly string[] =
    owner ??
    (variable === undefined
      ? CHECKOUT.paymentMethods
      : variable.split(",").map((s) => s.trim()));
  if (requested.some((method) => !allowed.has(method))) return [];
  return [...new Set(requested)] as PaymentMethod[];
}
