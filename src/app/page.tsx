import Link from "next/link";

import { HomeHero } from "@/components/home-hero";
import { ProductCard } from "@/components/product-card";
import { TIENDA, type Hero } from "@/config/tienda";
import { getCatalog, getCategories, type CatalogProduct } from "@/db/queries";
import { t } from "@/i18n";

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
      {/*
        La portada. Sin `TIENDA.hero` configurado sale la de siempre, con el
        texto del template: una tienda recién clonada no tiene foto de
        portada, y un hueco gris arriba de todo es peor que un párrafo
        honesto. Configurarlo la reemplaza entera — ver `src/config/tienda.ts`.

        El "Ver productos" apunta a la primera categoría porque es lo único
        que se sabe seguro que existe; sin categorías todavía, no se dibuja un
        botón que lleve a un 404.
      */}
      <HomeHero hero={TIENDA.hero ?? heroPorDefecto(categories[0]?.slug)} />

      {error ? (
        <div className="border-border border-l-primary mt-8 rounded-lg border border-l-2 p-4">
          <p className="text-sm">{t("home.errorCatalogo")}</p>
          <p className="mt-1 font-mono text-xs break-all">{error}</p>
          <p className="text-muted-foreground mt-2 text-sm">{t("home.errorCatalogo.ayuda")}</p>
        </div>
      ) : (
        <>
          {categories.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">{t("home.categorias")}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categoria/${category.slug}`}
                    className="border-border hover:border-foreground/30 rounded-xl border p-4 transition-colors"
                  >
                    <p className="font-medium">{category.name}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{t("home.categorias.verTodo")}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {featured.length > 0 ? (
            <section className="mt-12">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{t("home.destacados")}</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {featured.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>
            </section>
          ) : (
            <p className="text-muted-foreground mt-10 text-sm">{t("home.sinProductos")}</p>
          )}
        </>
      )}
    </main>
  );
}

/**
 * La portada con la que sale el template. Es exactamente el bloque que la home
 * tenía escrito a mano antes del PR O: una tienda que se actualiza y no
 * configura nada no ve ningún cambio.
 *
 * El botón necesita un destino que exista, y lo único que se sabe seguro es la
 * primera categoría. Sin ninguna categoría todavía —el estado de una tienda
 * recién instalada— el hero sale sin botón, que es mejor que uno que lleva a
 * un 404.
 */
function heroPorDefecto(primeraCategoria: string | undefined): Hero {
  return {
    titulo: t("home.hero.titulo"),
    texto: t("home.hero.texto"),
    cta: primeraCategoria
      ? { label: t("home.hero.cta"), href: `/categoria/${primeraCategoria}` }
      : undefined,
  };
}
