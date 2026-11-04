import Link from "next/link";
import type React from "react";
import { Suspense } from "react";
import HomeLoading from "@/components/home-loading";

import { HomeHero } from "@/components/home-hero";
import { ProductCard } from "@/components/product-card";
import { TIENDA, type Hero } from "@/config/tienda";
import { getCatalog, getCategories, type CatalogProduct } from "@/db/queries";
import { getStoreSettings } from "@/domain/store-settings";
import { heroEfectivo } from "@/domain/store-settings-schema";
import { t } from "@/i18n";
import { log } from "@/lib/log";
import { safeError } from "@/lib/safe-error";
import { temaActivo } from "@/themes";
import type { SeccionHome } from "@/themes/tipos";

/**
 * Home. ISR: el catálogo cambia poco y las redes móviles paraguayas
 * agradecen el HTML ya armado. Se rearma cuando el panel cambia algo o entra
 * un pedido (`revalidarVidriera()`), o a los 5 minutos como mucho (ARCH.md
 * §6, "Caché de la vidriera").
 *
 * `force-static` no es redundante: sin él, cualquier `headers()` del layout
 * —el de los medidores, con GA4 o el Pixel prendidos— volvía dinámica la
 * vidriera entera sin que nada lo avisara.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let featured: CatalogProduct[] = [];
  let isChosen = false;
  let error: string | null = null;

  try {
    // `getFeaturedProducts` (O7) ya resuelve destacados-o-fallback, pero no
    // dice cuál rama tomó — y el título de la sección tiene que ser distinto
    // en cada caso ("Destacados" elegidos a mano vs. "Novedades" de
    // `getCatalog({ limit })` de siempre). Se pide la rama elegida aparte, con
    // el mismo `getCatalog({ featured: true })` que usa por dentro, y sólo se
    // cae al catálogo de siempre cuando viene vacía.
    let destacados: CatalogProduct[];
    [categories, destacados] = await Promise.all([
      getCategories(),
      getCatalog({ featured: true, limit: 8 }),
    ]);
    isChosen = destacados.length > 0;
    featured = isChosen ? destacados : await getCatalog({ limit: 8 });
  } catch (cause) {
    log.error("catalogue: home unavailable", {
      error: safeError(cause).message,
    });
    error =
      "El catálogo no está disponible temporalmente. Probá de nuevo en unos minutos.";
  }

  // Los ajustes del panel (`/admin/ajustes`) pisan campo por campo la portada
  // de `TIENDA.hero` (o la del template); `null` = el dueño la apagó.
  const ajustes = await getStoreSettings();
  const hero = heroEfectivo(
    ajustes.marca,
    TIENDA.hero ?? heroPorDefecto(categories[0]?.slug)
  );

  /*
    La portada. Sin `TIENDA.hero` configurado sale la de siempre, con el
    texto del template: una tienda recién clonada no tiene foto de
    portada, y un hueco gris arriba de todo es peor que un párrafo
    honesto. Configurarlo la reemplaza entera — ver `src/config/tienda.ts`.

    El "Ver productos" apunta a la primera categoría porque es lo único
    que se sabe seguro que existe; sin categorías todavía, no se dibuja un
    botón que lleve a un 404.
  */
  // Sin portada, el `<h1>` de la página sigue existiendo para lectores de
  // pantalla y buscadores.
  const tituloOculto = (
    <h1 key="hero" className="sr-only">
      {ajustes.marca.seoTitulo ?? TIENDA.titulo}
    </h1>
  );

  // Cada sección de la home, por su id. El orden —y cuáles van— lo decide el
  // tema (`home` en `src/themes/presets/*.ts`); el default es el de siempre:
  // portada, categorías, destacados.
  const secciones: Record<SeccionHome, () => React.ReactNode> = {
    hero: () => (hero ? <HomeHero key="hero" hero={hero} /> : tituloOculto),
    categorias: () =>
      categories.length > 0 ? (
        <section key="categorias" className="mt-10">
          <h2 className="text-lg font-semibold">{t("home.categorias")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/categoria/${category.slug}`}
                className="border-border hover:border-foreground/30 rounded-xl border p-4 transition-colors"
              >
                <p className="font-medium">{category.name}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("home.categorias.verTodo")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null,
    destacados: () =>
      featured.length > 0 ? (
        <section key="destacados" className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {isChosen ? t("home.destacados") : t("home.novedades")}
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featured.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index < 4}
                showRating={ajustes.vidriera.estrellasEnTarjetas}
              />
            ))}
          </div>
        </section>
      ) : (
        <p key="destacados" className="text-muted-foreground mt-10 text-sm">
          {t("home.sinProductos")}
        </p>
      ),
  };
  const orden = temaActivo().home;
  const conPortada = orden.includes("hero");

  return (
    // `data-vidriera`: la escala del tema (espaciado, letra, ancho) vale acá
    // adentro, no en el resto de la tienda (`src/themes/tipos.ts`).
    <main data-vidriera="" className="mx-auto w-full max-w-6xl px-4 py-8">
      {conPortada ? null : tituloOculto}

      {error ? (
        <>
          {conPortada ? secciones.hero() : null}
          <div className="border-border border-l-primary mt-8 rounded-lg border border-l-2 p-4">
            <p className="text-sm">{t("home.errorCatalogo")}</p>
            <p className="mt-1 font-mono text-xs break-all">{error}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {t("home.errorCatalogo.ayuda")}
            </p>
          </div>
        </>
      ) : (
        orden.map((seccion) => secciones[seccion]())
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
