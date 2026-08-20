import { ProductCardSkeleton } from "@/components/product-card";

/**
 * Esqueleto de la home.
 *
 * La home hace dos consultas (categorías y destacados) antes de pintar nada, y
 * en una conexión móvil paraguaya eso es medio segundo de pantalla en blanco.
 * El esqueleto copia la grilla real —hero, categorías, 8 tarjetas— para que el
 * contenido no salte cuando llega.
 *
 * `/categoria/[slug]` y `/producto/[slug]` **no** llevan `loading.tsx` a
 * propósito: ambas deciden su 404 en el cuerpo, y el Suspense de un
 * `loading.tsx` manda el shell —y con él un 200— antes de que se sepa si la
 * página existe (ver el comentario en `producto/[slug]/page.tsx`).
 */
export default function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="border-border bg-muted/30 rounded-2xl border p-6 sm:p-10">
        <div className="bg-muted h-8 w-3/4 animate-pulse rounded sm:h-10 sm:w-2/3" />
        <div className="bg-muted mt-4 h-4 w-full max-w-xl animate-pulse rounded" />
        <div className="bg-muted mt-2 h-4 w-2/3 max-w-md animate-pulse rounded" />
        <div className="bg-muted mt-6 h-10 w-40 animate-pulse rounded-md" />
      </section>

      <section className="mt-10">
        <div className="bg-muted h-6 w-32 animate-pulse rounded" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="border-border rounded-xl border p-4">
              <div className="bg-muted h-5 w-2/3 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-4 w-1/3 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="bg-muted h-6 w-28 animate-pulse rounded" />
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
