import type { Metadata } from "next";

import { ShippingZonesManager } from "@/components/admin/shipping-zones-manager";
import { listAdminShippingZones } from "@/domain/admin-shipping";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Envíos" };

export const dynamic = "force-dynamic";

/**
 * `/admin/envios` — owner-only (PLAN.md FASE 2, PR K).
 *
 * El checkout ya cotizaba contra estas filas; lo que faltaba era quién las
 * edita. Es la pantalla que más rápido se usa de todo el panel: el flete de
 * una tienda paraguaya cambia con el combustible, y hasta hoy cambiarlo era
 * una llamada al desarrollador.
 *
 * Cambiar una zona **no toca los pedidos en vuelo**: el flete quedó copiado en
 * `orders.shipping_pyg` cuando se creó cada pedido.
 */
export default async function AdminShippingPage() {
  await requireCapabilityPage("envios");
  const zones = await listAdminShippingZones();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Zonas de envío</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Cuánto sale el flete a cada ciudad. Lo que cambies acá se cotiza de los
        próximos pedidos en adelante — los que ya se hicieron conservan el envío
        que la compradora aceptó pagar.
      </p>

      <div className="mt-6">
        <ShippingZonesManager
          zones={zones.map((zone, index) => ({
            id: zone.id,
            slug: zone.slug,
            name: zone.name,
            cities: zone.cities,
            pricePyg: zone.pricePyg,
            freeThresholdPyg: zone.freeThresholdPyg,
            isActive: zone.isActive,
            esPrimera: index === 0,
            esUltima: index === zones.length - 1,
          }))}
        />
      </div>
    </div>
  );
}
