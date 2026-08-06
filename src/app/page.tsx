import { getCatalog } from "@/db/queries";
import { formatGs } from "@/lib/money";

/**
 * Server Component: lee el catálogo sembrado directo de MySQL.
 * La vidriera de verdad (grillas, filtros, carrito) es el PR #2 — esto
 * demuestra que el dato viaja de la base a la página.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let catalog: Awaited<ReturnType<typeof getCatalog>> = [];
  let error: string | null = null;

  try {
    catalog = await getCatalog({ limit: 100 });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const variantCount = catalog.reduce(
    (total, product) => total + product.variants.length,
    0
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tienda PY</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Catálogo servido desde MySQL. Todos los precios están en guaraníes,{" "}
        <strong>IVA incluido</strong>.
      </p>

      {error ? (
        <div className="border-border border-l-primary mt-6 rounded-lg border border-l-2 p-4">
          <p className="text-sm">No pude leer el catálogo:</p>
          <p className="mt-1 font-mono text-xs break-all">{error}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Levantá la base con <code>docker compose up -d</code>, después{" "}
            <code>pnpm db:push &amp;&amp; pnpm db:seed</code>.
          </p>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mt-4 text-sm">
            {catalog.length} productos · {variantCount} variantes
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((product) => (
              <article
                key={product.id}
                className="border-border rounded-xl border p-4"
              >
                <p className="text-muted-foreground text-xs uppercase">
                  {product.categoryName}
                </p>
                <h2 className="mt-1 font-medium">{product.name}</h2>
                <p className="text-muted-foreground text-xs">
                  {product.brand ?? "Sin marca"} · IVA {product.ivaRate}%
                </p>
                <ul className="mt-3 space-y-1">
                  {product.variants.map((variant) => (
                    <li
                      key={variant.id}
                      className="border-border flex items-center justify-between gap-3 border-t pt-1 text-sm"
                    >
                      <span>{variant.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatGs(variant.pricePyg)}
                        </span>
                        {variant.available > 0 ? (
                          <span className="text-muted-foreground text-xs">
                            {variant.available} disp.
                          </span>
                        ) : (
                          <span className="text-destructive text-xs">
                            sin stock
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
