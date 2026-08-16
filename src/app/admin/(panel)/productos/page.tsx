import type { Metadata } from "next";
import Link from "next/link";

import { CsvDownloadButton } from "@/components/admin/csv-download";
import { ProductFilters } from "@/components/admin/product-filters";
import { ProductImage } from "@/components/product-image";
import { listAdminProducts, listCategories } from "@/domain/admin-products";
import { isAdminProductSort } from "@/lib/admin-product-sort";
import { formatGs } from "@/lib/money";

export const metadata: Metadata = { title: "Productos" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const search = first(query.q);
  const rawCategory = Number(first(query.categoria));
  const categoryId = Number.isInteger(rawCategory) && rawCategory > 0 ? rawCategory : undefined;
  const rawSort = first(query.orden);
  const sort = isAdminProductSort(rawSort) ? rawSort : "recientes";
  const rawPage = Number(first(query.pagina) ?? 1);

  const [result, categories] = await Promise.all([
    listAdminProducts({
      search,
      categoryId,
      sort,
      page: Number.isFinite(rawPage) ? rawPage : 1,
    }),
    listCategories(),
  ]);

  const href = (page: number): string => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (categoryId) params.set("categoria", String(categoryId));
    if (sort !== "recientes") params.set("orden", sort);
    if (page > 1) params.set("pagina", String(page));
    const qs = params.toString();
    return qs === "" ? "/admin/productos" : `/admin/productos?${qs}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Productos</h1>
        <Link
          href="/admin/productos/nuevo"
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        >
          Nuevo producto
        </Link>
      </div>

      <form className="mt-4 flex gap-2" action="/admin/productos">
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Buscar por nombre o slug"
          aria-label="Buscar producto"
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        {/* La búsqueda es un form nativo: sin estos hidden, buscar dentro de
            una categoría la perdería y devolvería el catálogo entero. */}
        {categoryId ? <input type="hidden" name="categoria" value={String(categoryId)} /> : null}
        {sort !== "recientes" ? <input type="hidden" name="orden" value={sort} /> : null}
        <button type="submit" className="border-border rounded-lg border px-4 text-sm">
          Buscar
        </button>
      </form>

      <ProductFilters
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        categoryId={categoryId}
        sort={sort}
        search={search}
      />

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          No hay productos que coincidan.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {result.rows.map((product) => (
            <li key={product.id}>
              <Link
                href={`/admin/productos/${product.id}`}
                className="border-border hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-3"
              >
                {/* Miniatura chica: el dueño reconoce el producto por la foto
                    mucho antes que por el nombre, y son 24 filas en un
                    celular. */}
                <ProductImage
                  image={
                    product.imageCloudinaryId
                      ? {
                          cloudinaryId: product.imageCloudinaryId,
                          alt: product.imageAlt,
                          blurDataUrl: null,
                        }
                      : null
                  }
                  alt={product.name}
                  categorySlug={product.categorySlug}
                  size="thumb"
                  className="w-14 shrink-0"
                  sizes="56px"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="font-medium">{product.name}</span>
                    <span className="text-sm tabular-nums">
                      {product.minPricePyg === null ? "Sin precio" : formatGs(product.minPricePyg)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {product.categoryName} · {product.variantCount}{" "}
                    {product.variantCount === 1 ? "variante" : "variantes"} ·{" "}
                    <span className={product.onHand === 0 ? "text-destructive font-medium" : ""}>
                      {product.onHand} en stock
                    </span>
                    {!product.isActive || product.publishedAt === null ? (
                      <span className="text-foreground font-medium"> · sin publicar</span>
                    ) : null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginación">
          {result.page > 1 ? (
            <Link href={href(result.page - 1)} className="border-border rounded-lg border px-3 py-2">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">
            Página {result.page} de {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Link href={href(result.page + 1)} className="border-border rounded-lg border px-3 py-2">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {/* Una fila por variante: es la unidad que tiene SKU, precio y stock, y
          es con lo que se cuenta el depósito. */}
      <div className="border-border mt-6 border-t pt-4">
        <CsvDownloadButton
          kind="productos"
          params={{ q: search, categoria: categoryId ? String(categoryId) : undefined }}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Una fila por variante, con los filtros puestos.
        </p>
      </div>
    </div>
  );
}
