import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { getCatalog, getCategories, type CatalogProduct } from "@/db/queries";

/**
 * Home. ISR: el catálogo cambia poco y las redes móviles paraguayas
 * agradecen el HTML ya armado. La disponibilidad exacta se ve en la ficha.
 */
export const revalidate = 300;

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let featured: CatalogProduct[] = [];
  let error: string | null = null;

  try {
    [categories, featured] = await Promise.all([getCategories(), getCatalog({ limit: 8 })]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="border-border bg-muted/30 rounded-2xl border p-6 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
          Comprá fácil, pagá como quieras
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-sm sm:text-base">
          Transferencia, QR o contra entrega. Precios en guaraníes con IVA incluido y envíos a
          todo el país. ¿Dudas? Escribinos por WhatsApp.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {categories[0] ? (
            <Button asChild size="lg">
              <Link href={`/categoria/${categories[0].slug}`}>Ver productos</Link>
            </Button>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="border-border border-l-primary mt-8 rounded-lg border border-l-2 p-4">
          <p className="text-sm">No pude leer el catálogo:</p>
          <p className="mt-1 font-mono text-xs break-all">{error}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Levantá la base con <code>docker compose up -d</code>, después{" "}
            <code>pnpm db:push &amp;&amp; pnpm db:seed</code>.
          </p>
        </div>
      ) : (
        <>
          {categories.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Categorías</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categoria/${category.slug}`}
                    className="border-border hover:border-foreground/30 rounded-xl border p-4 transition-colors"
                  >
                    <p className="font-medium">{category.name}</p>
                    <p className="text-muted-foreground mt-1 text-sm">Ver todo →</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {featured.length > 0 ? (
            <section className="mt-12">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Destacados</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {featured.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>
            </section>
          ) : (
            <p className="text-muted-foreground mt-10 text-sm">
              Todavía no hay productos publicados. Sembrá el catálogo con <code>pnpm db:seed</code>.
            </p>
          )}
        </>
      )}
    </main>
  );
}
