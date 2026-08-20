import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";
import { hasUsableCoupons } from "@/domain/coupons";
import { findCustomerByPhone } from "@/domain/customers";
import { isPagoparConfigured } from "@/domain/pagopar/config";
import { listShippingZones } from "@/domain/shipping";
import { t } from "@/i18n";
import { currentCustomer } from "@/lib/customer-session";
import { formatPhonePY } from "@/lib/py";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("checkout.meta"),
  robots: { index: false },
};

export default async function CheckoutPage() {
  const zones = await listShippingZones().catch(() => []);
  const cities = zones.flatMap((zone) => zone.cities).sort((a, b) => a.localeCompare(b, "es"));
  const pagoparEnabled = isPagoparConfigured();
  // Sin cupones cargados el campo de descuento no se dibuja.
  const hayCupones = await hasUsableCoupons().catch(() => false);

  // Con las cuentas apagadas —el default— esto es null y todo lo de abajo se
  // comporta como antes de que la feature existiera.
  const actor = await currentCustomer();
  const customer = actor ? await findCustomerByPhone(actor.phone) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("checkout.titulo")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {customer ? t("checkout.bajadaConCuenta") : t("checkout.bajadaInvitado")}
      </p>

      <div className="mt-6">
        <CheckoutForm
          cities={cities}
          pagoparEnabled={pagoparEnabled}
          hayCupones={hayCupones}
          prefill={
            customer
              ? {
                  name: customer.name,
                  // El formulario acepta cualquier formato y lo normaliza el
                  // servidor; se muestra en el que ella reconoce.
                  phone: formatPhonePY(customer.phone),
                  email: customer.email ?? "",
                }
              : undefined
          }
        />
      </div>
    </main>
  );
}
