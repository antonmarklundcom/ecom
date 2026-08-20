import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";

import { CatalogFilters } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { t, tPlural } from "@/i18n";
import { parsePriceRange } from "@/lib/price-ranges";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
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
  if (!category) return { title: t("categoria.meta") };
  return {
    title: category.name,
    description: t("categoria.metaDescripcion", { nombre: category.name }),
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

  // JSON-LD. La miga de pan es la misma que se dibuja abajo, y el ItemList
  // numera desde la página actual: en la página 2 el primer producto es el 13,
  // no el 1. Sin `NEXT_PUBLIC_SITE_URL` las URLs salen relativas — Google las
  // resuelve contra la página, así que sigue siendo válido.
  const origin = siteOrigin();
  const jsonLd = [
    breadcrumbJsonLd(origin, [
      { name: t("nav.inicio"), path: "/" },
      { name: category.name, path: `/categoria/${slug}` },
    ]),
    itemListJsonLd(origin, result.products, {
      name: category.name,
      startPosition: (result.page - 1) * result.perPage + 1,
    }),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          {t("nav.inicio")}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{category.name}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {tPlural("catalogo.productos", result.total)} · {t("catalogo.ivaIncluidoNota")}
      </p>

      <div className="mt-5">
        <Suspense fallback={null}>
          <CatalogFilters brands={brands} />
        </Suspense>
      </div>

      {result.products.length === 0 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{t("categoria.sinResultados")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("categoria.sinResultados.ayuda")}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/categoria/${slug}`}>{t("categoria.verTodo")}</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* El h3 de cada ProductCard necesita un h2 arriba para no saltar
              de nivel (regla heading-order de axe) — la grilla no tiene un
              título visible propio, así que va oculto para lectores de
              pantalla. */}
          <h2 className="sr-only">{t("catalogo.tituloOculto")}</h2>
          {result.products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label={t("nav.paginacion")}>
          <Button asChild variant="outline" size="sm" disabled={result.page <= 1}>
            <Link href={buildPageHref(result.page - 1)} aria-disabled={result.page <= 1}>
              {t("nav.anterior")}
            </Link>
          </Button>
          <span className="text-muted-foreground text-sm">
            {t("nav.pagina", { actual: result.page, total: result.totalPages })}
          </span>
          <Button asChild variant="outline" size="sm" disabled={result.page >= result.totalPages}>
            <Link
              href={buildPageHref(result.page + 1)}
              aria-disabled={result.page >= result.totalPages}
            >
              {t("nav.siguiente")}
            </Link>
          </Button>
        </nav>
      ) : null}
    </main>
  );
}
