import type { PaymentMethod } from "@/db/schema";
import { getDatosBancarios } from "@/lib/comercio";
import { isPagoparConfigured } from "./pagopar/config";
import type { Executor } from "./executor";
import { CHECKOUT } from "@/config/checkout";
import { readStoreSettings } from "./store-settings";

export function paymentPolicy(
  owner: PaymentMethod[] | null,
  environment: string | undefined
): PaymentMethod[] {
  const allowed = new Set<PaymentMethod>([
    "transferencia",
    "contra_entrega",
    "tarjeta",
  ]);
  const requested =
    owner ??
    (environment === undefined
      ? CHECKOUT.paymentMethods
      : environment.split(",").map((s) => s.trim()));
  // Invalid policy fails closed; an explicit empty list intentionally closes checkout.
  if (requested.some((method) => !allowed.has(method as PaymentMethod)))
    return [];
  return [...new Set(requested)] as PaymentMethod[];
}

export async function readyPaymentMethods(
  executor?: Executor
): Promise<PaymentMethod[]> {
  const { settings } = await readStoreSettings(executor);
  const requested = paymentPolicy(
    settings.checkout.metodosPago,
    process.env.STORE_PAYMENT_METHODS
  );
  const bank = requested.includes("transferencia")
    ? await getDatosBancarios(executor)
    : null;
  return requested.filter(
    (method) =>
      method === "contra_entrega" ||
      (method === "transferencia" && Boolean(bank)) ||
      (method === "tarjeta" && isPagoparConfigured())
  );
}
