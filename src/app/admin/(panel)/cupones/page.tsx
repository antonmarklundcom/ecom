import type { Metadata } from "next";

import { CouponsManager } from "@/components/admin/coupons-manager";
import { listAdminCoupons } from "@/domain/admin-coupons";
import { TEXTOS } from "@/i18n";
import { requireCapabilityPage } from "@/lib/admin-guard";
import { formatDatePY } from "@/lib/py";

export const metadata: Metadata = { title: TEXTOS.panel.cupones.titulo };

export const dynamic = "force-dynamic";

/**
 * `/admin/cupones` — owner-only (PLAN.md FASE 2, PR G.4).
 *
 * Cero cupones = el checkout no muestra ningún campo de descuento. Esta
 * pantalla es la única forma de que aparezca.
 */
export default async function AdminCouponsPage() {
  await requireCapabilityPage("cupones");
  const coupons = await listAdminCoupons();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{TEXTOS.panel.cupones.titulo}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{TEXTOS.panel.cupones.ayuda}</p>

      <div className="mt-6">
        <CouponsManager
          coupons={coupons.map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            minOrderPyg: coupon.minOrderPyg,
            desde: coupon.startsAt ? formatDatePY(coupon.startsAt) : "",
            hasta: coupon.endsAt ? formatDatePY(coupon.endsAt) : "",
            maxUses: coupon.maxUses,
            maxUsesPerCustomer: coupon.maxUsesPerCustomer,
            timesUsed: coupon.timesUsed,
            soloClientes: coupon.soloClientes,
            isActive: coupon.isActive,
            orderCount: coupon.orderCount,
            discountedPyg: coupon.discountedPyg,
          }))}
        />
      </div>
    </div>
  );
}
