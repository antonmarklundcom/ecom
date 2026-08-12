import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AddToCart } from "@/components/add-to-cart";
import { ProductImage } from "@/components/product-image";
import { getProductBySlug } from "@/db/queries";
import { comercioWaLink } from "@/lib/comercio";
import { formatGs } from "@/lib/money";

/**
 * Ficha de producto.
 *
 * `dynamic`: la disponibilidad es lo que decide la compra, y una reserva
 * ajena de hace treinta segundos ya la cambió. El resto del catálogo sí usa
 * ISR — acá preferimos el dato fresco.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** `cache()` memoiza por request: metadata y página comparten una consulta. */
const loadProduct = cache(async (slug: string) => getProductBySlug(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug).catch(() => null);
  if (!product) return { title: "Producto no encontrado" };

  const cheapest = product.variants.reduce<number | undefined>(
    (min, variant) => (min === undefined || variant.pricePyg < min ? variant.pricePyg : min),
    undefined
  );

  return {
    title: product.name,
    description:
      product.description?.slice(0, 160) ??
      `${product.name} — ${cheapest ? formatGs(cheapest) : ""}, IVA incluido.`,
    openGraph: { title: product.name, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  // El notFound() va acá y no en generateMetadata: lanzado desde el metadata,
  // Next dibuja el 404 pero responde 200. Por lo mismo esta ruta no tiene
  // loading.tsx — ese Suspense manda el shell, y con él el status, antes de
  // que sepamos si el producto existe.
  if (!product) notFound();

  const cheapest = product.variants.reduce<number | undefined>(
    (min, variant) => (min === undefined || variant.pricePyg < min ? variant.pricePyg : min),
    undefined
  );
  const totalAvailable = product.variants.reduce((total, variant) => total + variant.available, 0);

  const waHref = comercioWaLink(
    `¡Hola! Me interesa "${product.name}". ¿Está disponible?`
  );

  // JSON-LD: PYG y priceValidUntil no se inventan — se dejan afuera si no
  // hay dato, que es mejor que un dato falso en el rich result.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    sku: product.variants[0]?.sku,
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      name: variant.label,
      price: variant.pricePyg,
      priceCurrency: "PYG",
      availability:
        variant.available > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          Inicio
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/categoria/${product.categorySlug}`} className="hover:text-foreground">
          {product.categoryName}
        </Link>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <div>
          <ProductImage
            image={product.images[0] ?? null}
            alt={product.name}
            categorySlug={product.categorySlug}
            size="detail"
            priority
            sizes="(max-width: 1024px) 100vw, 550px"
          />
          {product.images.length > 1 ? (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {product.images.slice(1, 5).map((image) => (
                <ProductImage
                  key={image.cloudinaryId}
                  image={image}
                  alt={product.name}
                  categorySlug={product.categorySlug}
                  size="thumb"
                  sizes="120px"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-muted-foreground text-sm">{product.brand ?? product.categoryName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>

          <div className="mt-6">
            <AddToCart product={product} />
          </div>

          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground mt-4 inline-block text-sm underline"
            >
              ¿Tenés una duda? Consultanos por WhatsApp
            </a>
          ) : null}

          {product.description ? (
            <div className="border-border mt-8 border-t pt-6">
              <h2 className="text-sm font-medium">Descripción</h2>
              <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
                {product.description}
              </p>
            </div>
          ) : null}

          <dl className="border-border text-muted-foreground mt-6 grid grid-cols-2 gap-2 border-t pt-6 text-sm">
            <dt>IVA</dt>
            <dd className="text-foreground">{product.ivaRate}% incluido en el precio</dd>
            <dt>Disponibilidad</dt>
            <dd className="text-foreground">
              {totalAvailable > 0 ? `${totalAvailable} unidades` : "Sin stock"}
            </dd>
            {cheapest !== undefined ? (
              <>
                <dt>Desde</dt>
                <dd className="text-foreground tabular-nums">{formatGs(cheapest)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </main>
  );
}
