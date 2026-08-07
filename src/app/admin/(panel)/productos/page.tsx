import type { Metadata } from "next";
import Link from "next/link";

import { listAdminProducts } from "@/domain/admin-products";
import { formatGs } from "@/lib/money";

export const metadata: Metadata = { title: "Productos" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const rawSearch = Array.isArray(query.q) ? query.q[0] : query.q;
  const rawPage = Array.isArray(query.pagina) ? query.pagina[0] : query.pagina;
  const page = Number(rawPage ?? 1);

  const result = await listAdminProducts({
    search: rawSearch,
    page: Number.isFinite(page) ? page : 1,
  });

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
          defaultValue={rawSearch ?? ""}
          placeholder="Buscar por nombre o slug"
          aria-label="Buscar producto"
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="border-border rounded-lg border px-4 text-sm">
          Buscar
        </button>
      </form>

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
                className="border-border hover:bg-muted/50 block rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{product.name}</span>
                  <span className="text-sm tabular-nums">
                    {product.minPricePyg === null ? "Sin precio" : formatGs(product.minPricePyg)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {product.categoryName} · {product.variantCount}{" "}
                  {product.variantCount === 1 ? "variante" : "variantes"} · {product.onHand} en
                  stock
                  {!product.isActive || product.publishedAt === null ? (
                    <span className="text-foreground font-medium"> · sin publicar</span>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginación">
          {result.page > 1 ? (
            <Link
              href={`/admin/productos?${new URLSearchParams({ ...(rawSearch ? { q: rawSearch } : {}), pagina: String(result.page - 1) })}`}
              className="border-border rounded-lg border px-3 py-2"
            >
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">
            Página {result.page} de {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Link
              href={`/admin/productos?${new URLSearchParams({ ...(rawSearch ? { q: rawSearch } : {}), pagina: String(result.page + 1) })}`}
              className="border-border rounded-lg border px-3 py-2"
            >
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
