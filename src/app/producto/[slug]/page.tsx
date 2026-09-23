import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AddToCart } from "@/components/add-to-cart";
import { FunnelEvent } from "@/components/funnel-event";
import { ProductDescription } from "@/components/product-description";
import { ProductImage } from "@/components/product-image";
import { ProductCard } from "@/components/product-card";
import { RatingStars, formatRating } from "@/components/rating-stars";
import { RecentlyViewed } from "@/components/recently-viewed";
import { StickyBuyBar } from "@/components/sticky-buy-bar";
import { WishlistButton } from "@/components/wishlist-button";
import { getProductBySlug, getRelatedProducts } from "@/db/queries";
import { getProductRatingSummary, listApprovedReviews } from "@/domain/reviews";
import { stockAlertsEnabled } from "@/domain/stock-alerts";
import { getStoreSettings } from "@/domain/store-settings";
import { t, tPlural } from "@/i18n";
import { analyticsActivo } from "@/lib/analytics";
import { waLinkPublico, whatsappPublico } from "@/lib/comercio";
import { OG_IMAGE_SIZE, productImageUrl } from "@/lib/images";
import { markdownToText } from "@/lib/markdown";
import { formatGs } from "@/lib/money";
import { formatDatePY } from "@/lib/py";
import { jsonLdScript, productJsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
import { TESTIDS } from "@/lib/testids";

/**
 * Ficha de producto.
 *
 * `dynamic`: la disponibilidad es lo que decide la compra, y una reserva
 * ajena de hace treinta segundos ya la cambió. El resto del catálogo sí usa
 * ISR — acá preferimos el dato fresco.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** El bloque de agregar al carrito: a donde vuelve la barra de compra móvil. */
const BLOQUE_COMPRA_ID = "comprar";

/** `cache()` memoiza por request: metadata y página comparten una consulta. */
const loadProduct = cache(async (slug: string) => getProductBySlug(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug).catch(() => null);
  if (!product) return { title: t("producto.noEncontrado") };

  const cheapest = product.variants.reduce<number | undefined>(
    (min, variant) => (min === undefined || variant.pricePyg < min ? variant.pricePyg : min),
    undefined
  );

  // `markdownToText` y no la descripción cruda (O7): desde que el campo acepta
  // markdown, una que empiece con `**Importado**` publicaría literalmente los
  // asteriscos en el resultado de Google. Es el único lugar de la vidriera que
  // O7 toca — el render de la descripción en la página es de S11.
  const description =
    markdownToText(product.description).slice(0, 160) ||
    t("producto.metaDescripcion", {
      nombre: product.name,
      precio: cheapest ? formatGs(cheapest) : "",
    });

  // La foto principal, recortada a la caja que espera WhatsApp. Si el
  // producto todavía no tiene fotos (o falta el cloud de Cloudinary), se
  // omite `images` y Next hereda la del sitio (`app/opengraph-image.tsx`):
  // el link se comparte con la marca en vez de con un rectángulo gris.
  const ogImage = productImageUrl(product.images[0]?.cloudinaryId, "og");

  // == S17 == Mismo criterio que `categoria/[slug]`: canonical a la URL
  // limpia del producto, y sólo si hay origen configurado (`siteOrigin()`,
  // nunca un dominio inventado). Esta ficha no arrastra filtros en la URL
  // hoy, pero declarar el canonical explícito no le hace falta a un futuro
  // parámetro de tracking para dejar de indexarse como página aparte.
  const origin = siteOrigin();
  const canonical = origin ? new URL(`/producto/${slug}`, origin).toString() : undefined;

  return {
    title: product.name,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
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

  // Misma categoría, con stock, precio parecido. Sin nada que mostrar la
  // sección no se dibuja: una fila vacía o con un solo producto de relleno es
  // peor que no tenerla.
  const related = await getRelatedProducts({
    productId: product.id,
    categorySlug: product.categorySlug,
    brand: product.brand,
    pricePyg: cheapest,
  });

  // Reseñas verificadas: sólo las aprobadas (`src/domain/reviews.ts`). Sin
  // ninguna, no se dibuja nada — ni estrellas vacías ni "sé la primera".
  const [rating, reviews, ajustes] = await Promise.all([
    getProductRatingSummary(product.id),
    listApprovedReviews(product.id),
    getStoreSettings(),
  ]);

  // Al WhatsApp **público** (`/admin/ajustes`, o `WHATSAPP_NUMBER`).
  const waHref = await waLinkPublico(t("producto.consultaWhatsApp", { nombre: product.name }));

  // Para el link de consulta por variante (`variant-inquiry-link.tsx`, cliente):
  // el teléfono sale de los ajustes o de una variable sin `NEXT_PUBLIC_`, así
  // que se resuelve acá, en el servidor, y se pasa ya normalizado — el
  // componente cliente nunca lee `process.env` ni la base.
  const whatsappPhone = await whatsappPublico();
  const origin = siteOrigin();
  const productUrl = origin ? `${origin.origin}/producto/${product.slug}` : null;

  // JSON-LD: PYG y priceValidUntil no se inventan — se dejan afuera si no
  // hay dato, que es mejor que un dato falso en el rich result. Lo arma
  // `productJsonLd` (src/lib/seo.ts), que es maquinaria.
  const jsonLd = productJsonLd({
    origin,
    slug: product.slug,
    name: product.name,
    // Mismo motivo que arriba: el JSON-LD que lee Google es texto, no markdown.
    description: markdownToText(product.description),
    brand: product.brand,
    images: product.images
      .slice(0, 5)
      .map((image) => productImageUrl(image.cloudinaryId, "detail"))
      .filter((src): src is string => src !== null),
    variants: product.variants,
    rating,
    // Envío y devoluciones para Google, sólo con lo que el dueño cargó.
    merchant: ajustes.envioDevolucion,
    reviews: reviews.map((review) => ({
      author: review.authorName,
      rating: review.rating,
      title: review.title,
      body: review.body,
      date: review.createdAt,
    })),
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          {t("nav.inicio")}
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
          {rating.count >= 1 ? (
            <a
              href="#resenas"
              data-testid={TESTIDS.productRatingSummary}
              className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-2 text-sm"
            >
              <RatingStars value={rating.average} />
              <span>
                {tPlural("producto.resenas.resumen", rating.count, {
                  promedio: formatRating(rating.average),
                })}
              </span>
            </a>
          ) : null}

          {/* `id` para la barra de compra móvil (`StickyBuyBar`), que trae
              de vuelta hasta acá. */}
          <div id={BLOQUE_COMPRA_ID} className="mt-6 flex scroll-mt-24 flex-wrap items-start gap-3">
            <AddToCart
              product={product}
              stockAlertsEnabled={stockAlertsEnabled()}
              whatsappPhone={whatsappPhone}
              productUrl={productUrl}
            />
            <WishlistButton
              slug={product.slug}
              name={product.name}
              sku={
                (product.variants.find((variant) => variant.pricePyg === cheapest) ??
                  product.variants[0])?.sku
              }
              pricePyg={cheapest ?? product.variants[0]?.pricePyg}
              size="inline"
            />
          </div>

          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground mt-4 inline-block text-sm underline"
            >
              {t("producto.dudaWhatsApp")}
            </a>
          ) : null}

          {product.description ? (
            <div className="border-border mt-8 border-t pt-6">
              <h2 className="text-sm font-medium">{t("producto.descripcion")}</h2>
              <ProductDescription markdown={product.description} className="mt-2 text-sm" />
            </div>
          ) : null}

          <dl className="border-border text-muted-foreground mt-6 grid grid-cols-2 gap-2 border-t pt-6 text-sm">
            <dt>{t("producto.iva")}</dt>
            <dd className="text-foreground">{t("producto.ivaValor", { tasa: product.ivaRate })}</dd>
            <dt>{t("producto.disponibilidad")}</dt>
            <dd className="text-foreground">
              {totalAvailable > 0
                ? t("producto.unidades", { n: totalAvailable })
                : t("stock.sin")}
            </dd>
            {cheapest !== undefined ? (
              <>
                <dt>{t("producto.desde")}</dt>
                <dd className="text-foreground tabular-nums">{formatGs(cheapest)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {reviews.length > 0 ? (
        <section
          id="resenas"
          data-testid={TESTIDS.productReviewsSection}
          className="border-border mt-12 scroll-mt-24 border-t pt-8"
        >
          <h2 className="text-lg font-semibold tracking-tight">{t("producto.resenas.titulo")}</h2>
          <ul className="mt-4 grid gap-6">
            {reviews.map((review) => (
              <li key={review.id} className="text-sm">
                <RatingStars value={review.rating} />
                {review.title ? <p className="mt-1 font-medium">{review.title}</p> : null}
                <p className="mt-1 whitespace-pre-line">{review.body}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {review.authorName} · {formatDatePY(review.createdAt)} ·{" "}
                  {t("producto.resenas.compraVerificada")}
                </p>
                {review.ownerReply ? (
                  <div className="border-border bg-muted/40 mt-2 rounded-lg border p-3">
                    <p className="text-xs font-medium">{t("producto.resenas.respuesta")}</p>
                    <p className="mt-1 whitespace-pre-line">{review.ownerReply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="border-border mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold tracking-tight">{t("producto.relacionados")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {ajustes.vidriera.barraCompraMovil && product.variants.length > 0 ? (
        <StickyBuyBar
          targetId={BLOQUE_COMPRA_ID}
          name={product.name}
          price={cheapest !== undefined ? formatGs(cheapest) : null}
        />
      ) : null}

      <RecentlyViewed
        current={{
          slug: product.slug,
          name: product.name,
          pricePyg: cheapest ?? product.variants[0]?.pricePyg ?? 0,
          imageCloudinaryId: product.images[0]?.cloudinaryId ?? null,
          imageAlt: product.images[0]?.alt ?? null,
        }}
      />

      {/* "Vio el producto" para GA4/Meta (src/lib/funnel.ts), con el SKU de
          la variante más barata — el mismo id que el feed. */}
      {analyticsActivo() && product.variants[0] ? (
        <FunnelEvent
          event="view_item"
          items={[
            {
              id: (
                product.variants.find((variant) => variant.pricePyg === cheapest) ??
                product.variants[0]
              ).sku,
              name: product.name,
              pricePyg: cheapest ?? product.variants[0].pricePyg,
              qty: 1,
            },
          ]}
        />
      ) : null}
    </main>
  );
}
