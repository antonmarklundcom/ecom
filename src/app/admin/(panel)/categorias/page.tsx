import type { Metadata } from "next";

import { CategoriesManager } from "@/components/admin/categories-manager";
import { listAdminCategories } from "@/domain/admin-categories";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Categorías" };

export const dynamic = "force-dynamic";

/**
 * `/admin/categorias` — owner-only (PLAN.md FASE 2, PR J).
 *
 * Hasta este PR la tabla la escribía sólo el seed: una categoría nueva era un
 * pedido al desarrollador.
 */
export default async function AdminCategoriesPage() {
  await requireCapabilityPage("categorias");
  const categories = await listAdminCategories();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Categorías</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        El orden de esta lista es el del menú de la tienda. Una categoría
        desactivada esconde también sus productos de la vidriera, sin
        modificarlos: al reactivarla vuelven como estaban. No se borran, por los
        productos que cuelgan de ellas.
      </p>

      <div className="mt-6">
        <CategoriesManager
          categories={categories.map((category) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
            isActive: category.isActive,
            productCount: category.productCount,
            visibleCount: category.visibleCount,
          }))}
        />
      </div>
    </div>
  );
}
