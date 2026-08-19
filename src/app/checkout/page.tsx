import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";
import { findCustomerByPhone } from "@/domain/customers";
import { isPagoparConfigured } from "@/domain/pagopar/config";
import { listShippingZones } from "@/domain/shipping";
import { currentCustomer } from "@/lib/customer-session";
import { formatPhonePY } from "@/lib/py";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const zones = await listShippingZones().catch(() => []);
  const cities = zones.flatMap((zone) => zone.cities).sort((a, b) => a.localeCompare(b, "es"));
  const pagoparEnabled = isPagoparConfigured();

  // Con las cuentas apagadas —el default— esto es null y todo lo de abajo se
  // comporta como antes de que la feature existiera.
  const actor = await currentCustomer();
  const customer = actor ? await findCustomerByPhone(actor.phone) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Finalizá tu compra</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {customer
          ? "Ya tenemos tus datos: revisalos y confirmá."
          : "Sin cuenta ni registro: te mandamos el link de tu pedido por WhatsApp."}
      </p>

      <div className="mt-6">
        <CheckoutForm
          cities={cities}
          pagoparEnabled={pagoparEnabled}
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
