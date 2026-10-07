import type { PaymentMethod } from "@/db/schema";
import { getDatosBancarios } from "@/lib/comercio";
import { isPagoparConfigured } from "./pagopar/config";
import type { Executor } from "./executor";
import { paymentPolicy } from "./payment-policy";
import { readStoreSettings } from "./store-settings";

export { paymentPolicy } from "./payment-policy";

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
