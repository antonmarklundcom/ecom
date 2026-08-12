import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";

import { CatalogFilters } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { parsePriceRange } from "@/lib/price-ranges";
import {
  getBrands,
  getCategories,
  getCategoryBySlug,
  getCategoryProducts,
  isCatalogSort,
} from "@/db/queries";

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ slug: string }>;

/** `cache()` memoiza por request: metadata y página comparten una consulta. */
const loadCategory = cache(async (slug: string) => getCategoryBySlug(slug));

export async function generateStaticParams() {
  try {
    const categories = await getCategories();
    return categories.map((category) => ({ slug: category.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug).catch(() => null);
  if (!category) return { title: "Categoría" };
  return {
    title: category.name,
    description: `${category.name} en guaraníes, IVA incluido. Envíos a todo Paraguay.`,
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const category = await loadCategory(slug);
  // Ver la nota en producto/[slug]: el 404 tiene que decidirse acá, y por eso
  // esta ruta tampoco lleva loading.tsx.
  if (!category) notFound();

  const sortParam = first(query.orden);
  const { min, max } = parsePriceRange(first(query.precio));
  const page = Number.parseInt(first(query.page) ?? "1", 10) || 1;

  const [result, brands] = await Promise.all([
    getCategoryProducts({
      categorySlug: slug,
      brand: first(query.marca),
      minPricePyg: min,
      maxPricePyg: max,
      sort: isCatalogSort(sortParam) ? sortParam : "relevancia",
      page,
    }),
    getBrands(slug),
  ]);

  const buildPageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const single = first(value);
      if (single && key !== "page") next.set(key, single);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          Inicio
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{category.name}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {result.total} {result.total === 1 ? "producto" : "productos"} · precios con IVA incluido
      </p>

      <div className="mt-5">
        <Suspense fallback={null}>
          <CatalogFilters brands={brands} />
        </Suspense>
      </div>

      {result.products.length === 0 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No encontramos productos con esos filtros</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Probá quitando la marca o ampliando el rango de precio.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/categoria/${slug}`}>Ver toda la categoría</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* El h3 de cada ProductCard necesita un h2 arriba para no saltar
              de nivel (regla heading-order de axe) — la grilla no tiene un
              título visible propio, así que va oculto para lectores de
              pantalla. */}
          <h2 className="sr-only">Productos</h2>
          {result.products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Paginación">
          <Button asChild variant="outline" size="sm" disabled={result.page <= 1}>
            <Link href={buildPageHref(result.page - 1)} aria-disabled={result.page <= 1}>
              Anterior
            </Link>
          </Button>
          <span className="text-muted-foreground text-sm">
            Página {result.page} de {result.totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={result.page >= result.totalPages}>
            <Link
              href={buildPageHref(result.page + 1)}
              aria-disabled={result.page >= result.totalPages}
            >
              Siguiente
            </Link>
          </Button>
        </nav>
      ) : null}
    </main>
  );
}
