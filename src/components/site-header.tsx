import { Suspense } from "react";
import Link from "next/link";

import { CartButton } from "@/components/cart-button";
import { CuentaHeaderEntry } from "@/components/cuenta/header-entry";
import { SearchBox } from "@/components/search-box";
import { WishlistHeaderLink } from "@/components/wishlist-header-link";
import { getCategories } from "@/db/queries";
import { t } from "@/i18n/client";
import { marcaEfectiva } from "@/lib/marca";
import { tiendaTomaPedidos } from "@/lib/modo-venta";
import { TESTIDS } from "@/lib/testids";
import { temaActivo } from "@/themes";
import type { VarianteHeader } from "@/themes/tipos";

type Categoria = { id: number | string; slug: string; name: string };
type MarcaHeader = { nombre: string; logoUrl: string | null };

export async function SiteHeader() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    // Sin base todavía: el header se dibuja igual, sin el menú.
  }
  // Nombre y logo de /admin/ajustes → Identidad, o los de `tienda.ts`.
  const marca = await marcaEfectiva();
  // Modo consulta (`src/lib/modo-venta.ts`): sin carrito en el header.
  const conCarrito = await tiendaTomaPedidos();

  return (
    <HeaderVariante
      variante={temaActivo().header}
      categories={categories}
      marca={marca}
      conCarrito={conCarrito}
    />
  );
}

/**
 * La variante de header que pide el tema (`src/themes/`). Las variantes son
 * **composiciones de las mismas piezas** (`MarcaLink`, `Acciones`,
 * `MenuCategorias`, `BuscadorMovil`): por eso dibujan los mismos
 * `data-testid` (`src/lib/testids.ts`) y los specs de `tests/e2e/**` andan
 * con cualquier tema. Una variante nueva se arma con estas piezas, no
 * copiándolas.
 *
 * Un header de tienda que guarda las categorías en un desplegable o un menú
 * lateral marca el botón que lo abre con `TESTIDS.headerCategoriesTrigger`
 * (o `headerMenuTrigger` si es el menú entero): `irAPrimeraCategoria()` de
 * `tests/e2e/helpers.ts` lo abre antes de buscar `headerCategoryLink`.
 *
 * `conCarrito` (de `tiendaTomaPedidos()`): en modo consulta, `false`, y el
 * header no dibuja el carrito. Sin el dato, `true`: el de siempre.
 */
export function HeaderVariante({
  variante,
  categories,
  marca,
  conCarrito = true,
}: {
  variante: VarianteHeader;
  categories: readonly Categoria[];
  marca: MarcaHeader;
  conCarrito?: boolean;
}) {
  return variante === "centrado" ? (
    <HeaderCentrado
      categories={categories}
      marca={marca}
      conCarrito={conCarrito}
    />
  ) : (
    <HeaderClasico
      categories={categories}
      marca={marca}
      conCarrito={conCarrito}
    />
  );
}

/** El header de siempre: logo a la izquierda, buscador y acciones a la derecha. */
function HeaderClasico({
  categories,
  marca,
  conCarrito,
}: {
  categories: readonly Categoria[];
  marca: MarcaHeader;
  conCarrito: boolean;
}) {
  return (
    <header
      data-site-header=""
      className="s9-no-print border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <MarcaLink
          marca={marca}
          className="text-lg font-semibold tracking-tight"
        />

        <Suspense fallback={null}>
          <SearchBox className="ml-auto hidden w-full max-w-sm sm:block" />
        </Suspense>

        <Acciones
          className="ml-auto flex items-center gap-3 sm:ml-0"
          conCarrito={conCarrito}
        />
      </div>

      <MenuCategorias
        categories={categories}
        className="mx-auto flex w-full max-w-6xl gap-4 overflow-x-auto px-4 py-2 text-sm"
      />

      <BuscadorMovil />
    </header>
  );
}

/**
 * Logo al centro, buscador a la izquierda (desde `sm`) y acciones a la
 * derecha; el menú de categorías abajo, centrado. Es el de `vitrina`.
 */
function HeaderCentrado({
  categories,
  marca,
  conCarrito,
}: {
  categories: readonly Categoria[];
  marca: MarcaHeader;
  conCarrito: boolean;
}) {
  return (
    <header
      data-site-header=""
      className="s9-no-print border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur"
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
        <div className="min-w-0">
          <Suspense fallback={null}>
            <SearchBox className="hidden w-full max-w-xs sm:block" />
          </Suspense>
        </div>

        <MarcaLink
          marca={marca}
          className="text-center text-xl font-semibold tracking-[0.2em] uppercase"
        />

        <Acciones
          className="flex items-center justify-end gap-3"
          conCarrito={conCarrito}
        />
      </div>

      <MenuCategorias
        categories={categories}
        className="mx-auto flex w-full max-w-6xl gap-6 overflow-x-auto px-4 py-2 text-sm sm:justify-center"
      />

      <BuscadorMovil />
    </header>
  );
}

function MarcaLink({
  marca,
  className,
}: {
  marca: MarcaHeader;
  className: string;
}) {
  return (
    <Link href="/" className={className}>
      {marca.logoUrl ? (
        // `<img>` y no `next/image`: el archivo de R2 ya viene al tamaño justo.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={marca.logoUrl}
          alt={marca.nombre}
          className="h-8 w-auto sm:h-10"
        />
      ) : (
        marca.nombre
      )}
    </Link>
  );
}

function Acciones({
  className,
  conCarrito,
}: {
  className: string;
  conCarrito: boolean;
}) {
  return (
    <div className={className}>
      {/* Devuelve null con `TIENDA.cuentasClientes` apagado: sin el flag,
          este header es idéntico al de antes de la feature. */}
      <Suspense fallback={null}>
        <CuentaHeaderEntry />
      </Suspense>
      <WishlistHeaderLink />
      {conCarrito ? <CartButton /> : null}
    </div>
  );
}

function MenuCategorias({
  categories,
  className,
}: {
  categories: readonly Categoria[];
  className: string;
}) {
  return (
    <nav
      aria-label={t("header.categorias")}
      className="border-border/60 border-t"
    >
      {/* == S18 ==
          Fade del borde derecho (plan-crecimiento §6.2.C) con el truco de
          "scroll shadows" — dos degradés a `--background`, uno pegado al
          borde visible del contenedor (`background-attachment: scroll`,
          no se mueve) y otro pegado al final real del contenido
          (`background-attachment: local`, se mueve con el scroll). Cuando
          no hay overflow (desktop, pocas categorías) los dos coinciden
          desde el arranque y el degradé nunca se ve; a medida que se
          hace scroll el de "local" se acerca al de "scroll" y lo tapa
          justo al llegar al final. Sin JS, sin listeners de scroll, y sin
          tocar los `data-testid` de los links de abajo. */}
      <div
        className={className}
        style={{
          backgroundImage:
            "linear-gradient(to left, var(--background), var(--background) 60%, transparent), " +
            "linear-gradient(to left, var(--background), transparent)",
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundPosition: "100% 0, 100% 0",
          backgroundSize: "48px 100%, 48px 100%",
          backgroundAttachment: "local, scroll",
        }}
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/categoria/${category.slug}`}
            data-testid={TESTIDS.headerCategoryLink}
            data-slug={category.slug}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          >
            {category.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * Las categorías en un desplegable, para el header de una tienda que no
 * quiere la tira de categorías siempre a la vista. Sin JS (`<details>`), con
 * el mismo `headerCategoryLink` en cada link y `headerCategoriesTrigger` (o
 * `headerMenuTrigger`, con `como="menu"`) en el botón: así los specs de
 * `tests/e2e/**` lo abren solos (`irAPrimeraCategoria()`). Ninguna variante
 * del template lo usa; es una pieza para armar la propia.
 */
export function CategoriasDesplegable({
  categories,
  etiqueta,
  como = "categorias",
  className,
}: {
  categories: readonly Categoria[];
  etiqueta?: string;
  como?: "categorias" | "menu";
  className?: string;
}) {
  return (
    <details className={className ?? "relative"}>
      <summary
        data-testid={
          como === "menu"
            ? TESTIDS.headerMenuTrigger
            : TESTIDS.headerCategoriesTrigger
        }
        className="cursor-pointer list-none text-sm font-medium"
      >
        {etiqueta ?? t("header.categorias")}
      </summary>
      <nav
        aria-label={t("header.categorias")}
        className="border-border bg-background absolute z-40 mt-2 grid min-w-48 gap-2 rounded-lg border p-3 text-sm shadow-md"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/categoria/${category.slug}`}
            data-testid={TESTIDS.headerCategoryLink}
            data-slug={category.slug}
            className="text-muted-foreground hover:text-foreground"
          >
            {category.name}
          </Link>
        ))}
      </nav>
    </details>
  );
}

function BuscadorMovil() {
  return (
    <div className="border-border/60 border-t px-4 py-2 sm:hidden">
      <Suspense fallback={null}>
        <SearchBox />
      </Suspense>
    </div>
  );
}
