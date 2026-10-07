import type { Metadata } from "next";
import Link from "next/link";
import { CATALOGUE } from "@/config/catalogue";
import { getComparisonCandidates, getProductBySlug } from "@/db/queries";
import { ComparisonPicker } from "@/components/comparison-picker";
import { comparisonLimit, comparisonSlugs } from "@/lib/comparison";
import { formatGs, lowestChargeablePrice } from "@/lib/money";
import { siteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";
const origin = siteOrigin();
export const metadata: Metadata = {
  title: "Comparar productos",
  robots: { index: false, follow: true },
  ...(origin
    ? { alternates: { canonical: new URL("/comparar", origin).toString() } }
    : {}),
};
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const limit = comparisonLimit(CATALOGUE.comparisonLimit);
  const slugs = comparisonSlugs(query.p, limit);
  const [candidates, records] = await Promise.all([
    getComparisonCandidates(100),
    Promise.all(slugs.map((slug) => getProductBySlug(slug))),
  ]);
  const products = records.filter((p) => p !== null);
  // Lo elegido va primero aunque no esté entre los cien de la lista, para
  // poder sacarlo; al cliente viajan sólo slug y nombre (F5).
  const elegidos = new Set(products.map((p) => p.slug));
  const catalogue = [
    ...products.map((p) => ({ slug: p.slug, name: p.name })),
    ...candidates.filter((c) => !elegidos.has(c.slug)),
  ];
  const facts = CATALOGUE.attributes.filter((d) => d.compare).slice(0, 30);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Comparar productos</h1>
      <p>
        Se muestran datos públicos verificados. Un dato ausente no confirma una
        característica.
      </p>
      <ComparisonPicker
        products={catalogue}
        selected={products.map((p) => p.slug)}
        limit={limit}
      />
      {products.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Características de los productos seleccionados
            </caption>
            <thead>
              <tr>
                <th scope="col" className="p-3">
                  Característica
                </th>
                {products.map((p) => (
                  <th scope="col" className="p-3" key={p.id}>
                    <Link className="underline" href={`/producto/${p.slug}`}>
                      {p.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="p-3">
                  Unidad
                </th>
                {products.map((p) => (
                  <td className="p-3" key={p.id}>
                    {p.verifiedSpecifications?.unit ?? "Sin verificar"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-3">
                  Precio desde
                </th>
                {products.map((p) => {
                  // Sólo precios cobrables: un ₲0 no es "desde ₲0".
                  const desde =
                    p.saleMode === "stock" && p.showPrice !== false
                      ? lowestChargeablePrice(p.variants)
                      : undefined;
                  return (
                    <td className="p-3" key={p.id}>
                      {desde !== undefined ? formatGs(desde) : "Consultar"}
                    </td>
                  );
                })}
              </tr>
              {facts.map((d) => (
                <tr key={d.key}>
                  <th scope="row" className="p-3">
                    {d.label}
                  </th>
                  {products.map((p) => (
                    <td className="p-3" key={p.id}>
                      {d.scope === "product"
                        ? String(
                            p.verifiedSpecifications?.values?.[d.key] ??
                              "Sin verificar"
                          )
                        : [
                            ...new Set(
                              p.variants
                                .map((v) => v.attributes?.values?.[d.key])
                                .filter((v) => v !== undefined)
                                .map(String)
                            ),
                          ].join(", ") || "Sin verificar"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No hay productos públicos seleccionados.</p>
      )}
    </main>
  );
}
