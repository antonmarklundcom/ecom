import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { getCategories, searchProducts } from "@/db/queries";
import { TEXTOS } from "@/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TEXTOS.buscar.titulo,
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const raw = Array.isArray(query.q) ? query.q[0] : query.q;
  const term = (raw ?? "").trim();

  const results = term.length >= 2 ? await searchProducts(term) : [];
  const categories = results.length === 0 ? await getCategories().catch(() => []) : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {term ? TEXTOS.buscar.resultadosPara(term) : TEXTOS.buscar.titulo}
      </h1>

      {term.length < 2 ? (
        <p className="text-muted-foreground mt-2 text-sm">{TEXTOS.buscar.minimo}</p>
      ) : (
        <p className="text-muted-foreground mt-1 text-sm">
          {TEXTOS.comunes.productos(results.length)}
        </p>
      )}

      {results.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {results.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      ) : term.length >= 2 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{TEXTOS.buscar.sinResultados(term)}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {TEXTOS.buscar.sinResultadosAyuda}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <Button key={category.id} asChild variant="outline" size="sm">
                <Link href={`/categoria/${category.slug}`}>{category.name}</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
