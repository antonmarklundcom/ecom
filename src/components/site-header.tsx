import { Suspense } from "react";
import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { CartButton } from "@/components/cart-button";
import { CuentaHeaderEntry } from "@/components/cuenta/header-entry";
import { SearchBox } from "@/components/search-box";
import { getCategories } from "@/db/queries";
import { t } from "@/i18n";
import { TESTIDS } from "@/lib/testids";

export async function SiteHeader() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    // Sin base todavía: el header se dibuja igual, sin el menú.
  }

  return (
    <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {TIENDA.nombre}
        </Link>

        <Suspense fallback={null}>
          <SearchBox className="ml-auto hidden w-full max-w-sm sm:block" />
        </Suspense>

        <div className="ml-auto flex items-center gap-3 sm:ml-0">
          {/* Devuelve null con `TIENDA.cuentasClientes` apagado: sin el flag,
              este header es idéntico al de antes de la feature. */}
          <Suspense fallback={null}>
            <CuentaHeaderEntry />
          </Suspense>
          <CartButton />
        </div>
      </div>

      <nav aria-label={t("header.categorias")} className="border-border/60 border-t">
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
          className="mx-auto flex w-full max-w-6xl gap-4 overflow-x-auto px-4 py-2 text-sm"
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

      <div className="border-border/60 border-t px-4 py-2 sm:hidden">
        <Suspense fallback={null}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}
