import { productInquiryLinks } from "@/domain/product-inquiries";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { AddToCart } from "@/components/add-to-cart";
import { FunnelEvent } from "@/components/funnel-event";
import { ProductDescription } from "@/components/product-description";
import { ProductImage } from "@/components/product-image";
import { ProductGallery } from "@/components/product-gallery";
import { CatalogueEditorial } from "@/components/catalogue-editorial";
import { CATALOGUE } from "@/config/catalogue";
import { getProductSlugRedirect } from "@/domain/product-slugs";
import { variantUrl } from "@/lib/variant-url";
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
import { outsideImages } from "@/lib/image-provenance";
import { nombreTienda } from "@/lib/marca";
import { TIENDA } from "@/config/tienda";
import { markdownToText } from "@/lib/markdown";
import { formatGs, lowestChargeablePrice } from "@/lib/money";
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
type Search = Promise<Record<string, string | string[] | undefined>>;

/** El bloque de agregar al carrito: a donde vuelve la barra de compra móvil. */
const BLOQUE_COMPRA_ID = "comprar";

/** `cache()` memoiza por request: metadata y página comparten una consulta. */
const loadProduct = cache(async (slug: string) => getProductBySlug(slug));

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: t("producto.noEncontrado") };

  const cheapest = lowestChargeablePrice(product.variants);

  // `markdownToText` y no la descripción cruda (O7): desde que el campo acepta
  // markdown, una que empiece con `**Importado**` publicaría literalmente los
  // asteriscos en el resultado de Google. Es el único lugar de la vidriera que
  // O7 toca — el render de la descripción en la página es de S11.
  const description =
    product.seoDescription ||
    markdownToText(product.description).slice(0, 160) ||
    (cheapest !== undefined
      ? t("producto.metaDescripcion", {
          nombre: product.name,
          precio: formatGs(cheapest),
        })
      : product.name);

  // La primera foto que puede salir afuera (ni ilustrativa ni, si la tienda
  // lo pide, sin procedencia: docs/TEMPLATE-IMPROVEMENT-PLAN.md E2),
  // recortada a la caja que espera WhatsApp.
  const sharePhoto = outsideImages(product.images)[0];
  const ogImage = productImageUrl(sharePhoto?.cloudinaryId, "og");

  // == S17 == Mismo criterio que `categoria/[slug]`: canonical a la URL
  // limpia del producto, y sólo si hay origen configurado (`siteOrigin()`,
  // nunca un dominio inventado). Esta ficha no arrastra filtros en la URL
  // hoy, pero declarar el canonical explícito no le hace falta a un futuro
  // parámetro de tracking para dejar de indexarse como página aparte.
  const origin = siteOrigin();
  const canonical = origin
    ? new URL(`/producto/${product.slug}`, origin).toString()
    : undefined;

  const query = await searchParams;
  return {
    robots: Object.keys(query).length
      ? { index: false, follow: true }
      : undefined,
    title: product.seoTitle || product.name,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    // El `openGraph` de una página **reemplaza** el del layout, no se fusiona
    // (E3): sin repetir acá el nombre del sitio, el idioma y una imagen, el
    // link se compartía sin ninguno de los tres. Sin foto publicable, la
    // imagen es la del sitio (`app/opengraph-image.tsx`).
    openGraph: {
      title: product.seoTitle || product.name,
      description,
      type: "website",
      siteName: await nombreTienda(),
      locale: TIENDA.ogLocale,
      images: [
        ogImage
          ? {
              url: ogImage,
              width: OG_IMAGE_SIZE.width,
              height: OG_IMAGE_SIZE.height,
              alt: sharePhoto?.alt ?? product.name,
            }
          : {
              url: "/opengraph-image",
              width: OG_IMAGE_SIZE.width,
              height: OG_IMAGE_SIZE.height,
              alt: product.name,
            },
      ],
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const product = await loadProduct(slug);
  // El notFound() va acá y no en generateMetadata: lanzado desde el metadata,
  // Next dibuja el 404 pero responde 200. Por lo mismo esta ruta no tiene
  // loading.tsx — ese Suspense manda el shell, y con él el status, antes de
  // que sepamos si el producto existe.
  if (!product) {
    const redirect = await getProductSlugRedirect(slug);
    if (redirect)
      permanentRedirect(
        typeof query.variante === "string" && query.variante.length <= 64
          ? variantUrl(`/producto/${redirect}`, query.variante)
          : `/producto/${redirect}`
      );
    notFound();
  }
  const recentPhoto =
    product.images.find((image) => image.provenance !== "illustrative") ??
    product.images[0];
  const initialVariantSku =
    typeof query.variante === "string" &&
    query.variante.length > 0 &&
    query.variante.length <= 64
      ? query.variante
      : query.variante === undefined
        ? null
        : "__invalid_variant_link__";
  // Sólo precios que se cobran: con el precio oculto `hydrate` los deja en 0,
  // y una fila vieja en ₲0 tampoco es "desde ₲0". Sin ninguno, `undefined`:
  // no hay "desde", ni precio en la barra fija, ni en vistos recientemente.
  const cheapest = lowestChargeablePrice(product.variants);
  const totalAvailable = product.variants.reduce(
    (total, variant) => total + variant.available,
    0
  );

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
  const waHref =
    product.saleMode === "showcase"
      ? null
      : await waLinkPublico(
          t("producto.consultaWhatsApp", { nombre: product.name })
        );

  // Para el link de consulta por variante (`variant-inquiry-link.tsx`, cliente):
  // el teléfono sale de los ajustes o de una variable sin `NEXT_PUBLIC_`, así
  // que se resuelve acá, en el servidor, y se pasa ya normalizado — el
  // componente cliente nunca lee `process.env` ni la base.
  const whatsappPhone =
    product.saleMode === "showcase" ? null : await whatsappPublico();
  const inquiryLinks = await productInquiryLinks(product);
  const origin = siteOrigin();
  const productUrl = origin
    ? `${origin.origin}/producto/${product.slug}`
    : null;

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
    images: outsideImages(product.images)
      .slice(0, 5)
      .map((image) => productImageUrl(image.cloudinaryId, "detail"))
      .filter((src): src is string => src !== null),
    variants: product.variants,
    saleMode: product.saleMode,
    showPrice: product.showPrice,
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
        <Link
          href={`/categoria/${product.categorySlug}`}
          className="hover:text-foreground"
        >
          {product.categoryName}
        </Link>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <div>
          {product.images.length ? (
            <ProductGallery
              images={product.images
                .map((image) => ({
                  src: productImageUrl(image.cloudinaryId, "detail"),
                  alt: image.alt || product.name,
                  illustrative: image.provenance === "illustrative",
                }))
                .filter(
                  (
                    image
                  ): image is {
                    src: string;
                    alt: string;
                    illustrative: boolean;
                  } => image.src !== null
                )}
            />
          ) : (
            <ProductImage
              image={null}
              alt={product.name}
              categorySlug={product.categorySlug}
              size="detail"
              priority
              sizes="(max-width: 1024px) 100vw, 550px"
            />
          )}
        </div>

        <div>
          <p className="text-muted-foreground text-sm">
            {product.brand ?? product.categoryName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {product.name}
          </h1>
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
          <div
            id={BLOQUE_COMPRA_ID}
            className="mt-6 flex scroll-mt-24 flex-wrap items-start gap-3"
          >
            <AddToCart
              product={product}
              inquiryLinks={inquiryLinks}
              stockAlertsEnabled={stockAlertsEnabled()}
              whatsappPhone={whatsappPhone}
              productUrl={productUrl}
              initialVariantSku={initialVariantSku}
            />
            <WishlistButton
              slug={product.slug}
              name={product.name}
              sku={
                (
                  product.variants.find(
                    (variant) => variant.pricePyg === cheapest
                  ) ?? product.variants[0]
                )?.sku
              }
              pricePyg={
                product.showPrice === false
                  ? undefined
                  : (cheapest ?? product.variants[0]?.pricePyg)
              }
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
              <h2 className="text-sm font-medium">
                {t("producto.descripcion")}
              </h2>
              <ProductDescription
                markdown={product.description}
                className="mt-2 text-sm"
              />
            </div>
          ) : null}

          {(product.saleMode ?? "stock") === "stock" &&
          product.showPrice !== false ? (
            <dl className="border-border text-muted-foreground mt-6 grid grid-cols-2 gap-2 border-t pt-6 text-sm">
              <dt>{t("producto.iva")}</dt>
              <dd className="text-foreground">
                {t("producto.ivaValor", { tasa: product.ivaRate })}
              </dd>
              <dt>{t("producto.disponibilidad")}</dt>
              <dd className="text-foreground">
                {totalAvailable > 0
                  ? t("producto.unidades", { n: totalAvailable })
                  : t("stock.sin")}
              </dd>
              {cheapest !== undefined ? (
                <>
                  <dt>{t("producto.desde")}</dt>
                  <dd className="text-foreground tabular-nums">
                    {formatGs(cheapest)}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>

      {product.verifiedSpecifications ? (
        <section className="mt-8 rounded border p-4">
          <h2 className="font-semibold">Ficha técnica verificada</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {product.verifiedSpecifications.unit ? (
              <>
                <dt>Unidad</dt>
                <dd>{product.verifiedSpecifications.unit}</dd>
              </>
            ) : null}
            {CATALOGUE.attributes
              .filter(
                (d) =>
                  d.scope === "product" &&
                  product.verifiedSpecifications?.values?.[d.key] !== undefined
              )
              .map((d) => (
                <div key={d.key}>
                  <dt>{d.label}</dt>
                  <dd>
                    {String(product.verifiedSpecifications?.values?.[d.key])}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}
      <CatalogueEditorial content={CATALOGUE.products[product.slug]} />
      <Link
        href={`/comparar?p=${encodeURIComponent(product.slug)}`}
        className="mt-6 inline-block underline"
      >
        Comparar productos
      </Link>
      {reviews.length > 0 ? (
        <section
          id="resenas"
          data-testid={TESTIDS.productReviewsSection}
          className="border-border mt-12 scroll-mt-24 border-t pt-8"
        >
          <h2 className="text-lg font-semibold tracking-tight">
            {t("producto.resenas.titulo")}
          </h2>
          <ul className="mt-4 grid gap-6">
            {reviews.map((review) => (
              <li key={review.id} className="text-sm">
                <RatingStars value={review.rating} />
                {review.title ? (
                  <p className="mt-1 font-medium">{review.title}</p>
                ) : null}
                <p className="mt-1 whitespace-pre-line">{review.body}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {review.authorName} · {formatDatePY(review.createdAt)} ·{" "}
                  {t("producto.resenas.compraVerificada")}
                </p>
                {review.ownerReply ? (
                  <div className="border-border bg-muted/40 mt-2 rounded-lg border p-3">
                    <p className="text-xs font-medium">
                      {t("producto.resenas.respuesta")}
                    </p>
                    <p className="mt-1 whitespace-pre-line">
                      {review.ownerReply}
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="border-border mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("producto.relacionados")}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {ajustes.vidriera.barraCompraMovil &&
      (product.saleMode ?? "stock") === "stock" &&
      product.showPrice !== false &&
      product.variants.length > 0 ? (
        <StickyBuyBar
          targetId={BLOQUE_COMPRA_ID}
          name={product.name}
          price={cheapest !== undefined ? formatGs(cheapest) : null}
        />
      ) : null}

      {product.showPrice !== false ? (
        <RecentlyViewed
          current={{
            slug: product.slug,
            name: product.name,
            pricePyg: cheapest ?? null,
            // La primera foto que no es ilustrativa; si todas lo son, la
            // primera, con su leyenda (F6).
            imageCloudinaryId: recentPhoto?.cloudinaryId ?? null,
            imageAlt: recentPhoto?.alt ?? null,
            imageIllustrative: recentPhoto?.provenance === "illustrative",
          }}
        />
      ) : null}

      {/* "Vio el producto" para GA4/Meta (src/lib/funnel.ts), con el SKU de
          la variante más barata — el mismo id que el feed. */}
      {analyticsActivo() &&
      product.showPrice !== false &&
      product.variants[0] ? (
        <FunnelEvent
          event="view_item"
          items={[
            {
              id: (
                product.variants.find(
                  (variant) => variant.pricePyg === cheapest
                ) ?? product.variants[0]
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
