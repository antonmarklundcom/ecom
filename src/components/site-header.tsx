import { Suspense } from "react";
import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { CartButton } from "@/components/cart-button";
import { SearchBox } from "@/components/search-box";
import { getCategories } from "@/db/queries";

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

        <div className="ml-auto sm:ml-0">
          <CartButton />
        </div>
      </div>

      <nav aria-label="Categorías" className="border-border/60 border-t">
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
