import type { Metadata } from "next";

import { ShippingZonesManager } from "@/components/admin/shipping-zones-manager";
import { listAdminShippingZones } from "@/domain/admin-shipping";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Envíos" };

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
      <h1 className="text-xl font-semibold tracking-tight">Envíos</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Lo que se cobra de flete sale de acá. Un cambio vale para los pedidos
        nuevos: los que ya existen guardan su propio envío y no se recalculan.
        Las zonas no se borran —los pedidos viejos las nombran— se desactivan.
      </p>

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
