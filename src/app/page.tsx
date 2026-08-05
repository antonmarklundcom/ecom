import { getCatalog } from '@/db/queries';
import { formatGs } from '@/lib/money';

/**
 * Server Component: lee el catálogo sembrado directo de MySQL.
 * Sin estilo de tienda todavía — la vidriera real es el PR #2.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let catalog: Awaited<ReturnType<typeof getCatalog>> = [];
  let error: string | null = null;

  try {
    catalog = await getCatalog({ limit: 100 });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const variantCount = catalog.reduce((total, product) => total + product.variants.length, 0);

  return (
    <main>
      <h1>Tienda PY</h1>
      <p className="muted">
        Catálogo servido desde MySQL. Todos los precios están en guaraníes, <strong>IVA incluido</strong>.
      </p>

      {error ? (
        <div className="notice">
          <p>No pude leer el catálogo:</p>
          <p>
            <code>{error}</code>
          </p>
          <p className="muted">
            Levantá la base con <code>docker compose up -d</code>, después{' '}
            <code>pnpm db:push &amp;&amp; pnpm db:seed</code>.
          </p>
        </div>
      ) : (
        <>
          <p className="muted">
            {catalog.length} productos · {variantCount} variantes
          </p>
          <div className="grid">
            {catalog.map((product) => (
              <article className="card" key={product.id}>
                <p className="muted">{product.categoryName}</p>
                <h2>{product.name}</h2>
                <p className="muted">
                  {product.brand ?? 'Sin marca'} · IVA {product.ivaRate}%
                </p>
                {product.variants.map((variant) => (
                  <div className="variant" key={variant.id}>
                    <span>{variant.label}</span>
                    <span>
                      <span className="price">{formatGs(variant.pricePyg)}</span>{' '}
                      {variant.available > 0 ? (
                        <span className="muted">({variant.available} disp.)</span>
                      ) : (
                        <span className="stock-out">sin stock</span>
                      )}
                    </span>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
