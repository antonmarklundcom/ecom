import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";
import { isPagoparConfigured } from "@/domain/pagopar/config";
import { listShippingZones } from "@/domain/shipping";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const zones = await listShippingZones().catch(() => []);
  const cities = zones.flatMap((zone) => zone.cities).sort((a, b) => a.localeCompare(b, "es"));
  const pagoparEnabled = isPagoparConfigured();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Finalizá tu compra</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Sin cuenta ni registro: te mandamos el link de tu pedido por WhatsApp.
      </p>

      <div className="mt-6">
        <CheckoutForm cities={cities} pagoparEnabled={pagoparEnabled} />
      </div>
    </main>
  );
}
