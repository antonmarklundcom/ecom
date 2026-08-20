import type { Metadata } from "next";

import { ShippingZonesManager } from "@/components/admin/shipping-zones-manager";
import { listAdminShippingZones } from "@/domain/admin-shipping";
import { TEXTOS } from "@/i18n";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: TEXTOS.panel.envios.titulo };

export const dynamic = "force-dynamic";

/**
 * `/admin/envios` — owner-only (PLAN.md FASE 2, PR K).
 *
 * La cotización del checkout ya leía de `shipping_zones`; lo que faltaba era
 * poder escribirla sin el seed.
 */
export default async function AdminShippingPage() {
  await requireCapabilityPage("envios");
  const zones = await listAdminShippingZones();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{TEXTOS.panel.envios.titulo}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{TEXTOS.panel.envios.ayuda}</p>

      <div className="mt-6">
        <ShippingZonesManager
          zones={zones.map((zone) => ({
            id: zone.id,
            slug: zone.slug,
            name: zone.name,
            cities: zone.cities,
            pricePyg: zone.pricePyg,
            freeThresholdPyg: zone.freeThresholdPyg,
            isActive: zone.isActive,
          }))}
        />
      </div>
    </div>
  );
}
