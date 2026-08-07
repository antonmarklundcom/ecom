import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/domain/admin-products";

export const metadata: Metadata = { title: "Nuevo producto" };

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await listCategories();

  return (
    <div>
      <Link href="/admin/productos" className="text-muted-foreground text-sm">
        ← Productos
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Nuevo producto</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Primero se crea el producto; las variantes, los precios y las fotos se cargan después.
      </p>

      <div className="mt-6">
        <ProductForm
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          defaults={{
            slug: "",
            name: "",
            description: "",
            categoryId: categories[0]?.id ?? 0,
            brand: "",
            ivaRate: 10,
            isActive: true,
            published: false,
          }}
        />
      </div>
    </div>
  );
}
