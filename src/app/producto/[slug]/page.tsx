import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { getProductBySlug, getRelatedProducts } from "@/db/queries";
import { TEXTOS } from "@/i18n";
import { comercioWaLink } from "@/lib/comercio";
import { jsonLdScript } from "@/lib/seo";
import { OG_IMAGE_SIZE, productImageUrl } from "@/lib/images";
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
  if (!product) return { title: TEXTOS.producto.noEncontrado };

  const cheapest = product.variants.reduce<number | undefined>(
    (min, variant) => (min === undefined || variant.pricePyg < min ? variant.pricePyg : min),
    undefined
  );

  const description =
    product.description?.slice(0, 160) ??
    TEXTOS.producto.descripcionMeta(product.name, cheapest ? formatGs(cheapest) : "");

  // La foto principal, recortada a la caja que espera WhatsApp. Si el
  // producto todavía no tiene fotos (o falta el cloud de Cloudinary), se
  // omite `images` y Next hereda la del sitio (`app/opengraph-image.tsx`):
  // el link se comparte con la marca en vez de con un rectángulo gris.
  const ogImage = productImageUrl(product.images[0]?.cloudinaryId, "og");

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      ...(ogImage
        ? {
            images: [
              {
                url: ogImage,
                width: OG_IMAGE_SIZE.width,
                height: OG_IMAGE_SIZE.height,
                alt: product.images[0]?.alt ?? product.name,
              },
            ],
          }
        : {}),
    },
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

  // Misma categoría, con stock, sin el que se está mirando. Se pide después
  // del producto y no en paralelo porque hace falta su id y su categoría.
  const related = await getRelatedProducts({
    categorySlug: product.categorySlug,
    excludeProductId: product.id,
  }).catch(() => []);

  const waHref = comercioWaLink(TEXTOS.producto.consultaWhatsApp(product.name));

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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          {TEXTOS.comunes.inicio}
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
              {TEXTOS.producto.consultarWhatsApp}
            </a>
          ) : null}

          {product.description ? (
            <div className="border-border mt-8 border-t pt-6">
              <h2 className="text-sm font-medium">{TEXTOS.producto.descripcion}</h2>
              <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
                {product.description}
              </p>
            </div>
          ) : null}

          <dl className="border-border text-muted-foreground mt-6 grid grid-cols-2 gap-2 border-t pt-6 text-sm">
            <dt>{TEXTOS.producto.iva}</dt>
            <dd className="text-foreground">
              {TEXTOS.producto.ivaIncluidoEnPrecio(product.ivaRate)}
            </dd>
            <dt>{TEXTOS.producto.disponibilidad}</dt>
            <dd className="text-foreground">
              {totalAvailable > 0
                ? TEXTOS.producto.unidadesDisponibles(totalAvailable)
                : TEXTOS.producto.sinStock}
            </dd>
            {cheapest !== undefined ? (
              <>
                <dt>{TEXTOS.producto.desde}</dt>
                <dd className="text-foreground tabular-nums">{formatGs(cheapest)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-lg font-semibold">{TEXTOS.producto.relacionados}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
