import { Suspense } from "react";
import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { CartButton } from "@/components/cart-button";
import { CuentaHeaderEntry } from "@/components/cuenta/header-entry";
import { SearchBox } from "@/components/search-box";
import { getCategories } from "@/db/queries";
import { t } from "@/i18n";

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
        <div className="mx-auto flex w-full max-w-6xl gap-4 overflow-x-auto px-4 py-2 text-sm">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categoria/${category.slug}`}
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
