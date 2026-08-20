import type { Metadata } from "next";

import { CategoriesManager } from "@/components/admin/categories-manager";
import { listAdminCategories } from "@/domain/admin-categories";
import { TEXTOS } from "@/i18n";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: TEXTOS.panel.categorias.titulo };

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
      <h1 className="text-xl font-semibold tracking-tight">{TEXTOS.panel.categorias.titulo}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{TEXTOS.panel.categorias.ayuda}</p>

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
