import type { Metadata } from "next";

import { CategoriesManager } from "@/components/admin/categories-manager";
import { listAdminCategories } from "@/domain/admin-categories";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Categorías" };

export const dynamic = "force-dynamic";

/**
 * `/admin/categorias` — owner-only (PLAN.md FASE 2, PR J).
 *
 * Hasta este PR esta tabla la escribía sólo `scripts/seed.ts`: agregar una
 * categoría era una tarea de desarrollador con acceso a la base. Ahora es un
 * formulario.
 */
export default async function AdminCategoriesPage() {
  await requireCapabilityPage("categorias");
  const categories = await listAdminCategories();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Categorías</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        El menú de la tienda, en el orden en que se ve. Nada se borra: una
        categoría se desactiva, y con ella dejan de verse sus productos hasta
        que la vuelvas a prender.
      </p>

      <div className="mt-6">
        <CategoriesManager
          categories={categories.map((category, index) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
            isActive: category.isActive,
            productos: category.productos,
            publicados: category.publicados,
            esPrimera: index === 0,
            esUltima: index === categories.length - 1,
          }))}
        />
      </div>
    </div>
  );
}
