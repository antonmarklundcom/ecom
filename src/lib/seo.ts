/**
 * Piezas de SEO técnico: qué se le deja ver a un buscador y qué no.
 *
 * Está en `lib/` y no dentro de las rutas porque son decisiones que no
 * queremos redecidir por tienda: las rutas privadas se bloquean igual en
 * todas, y el JSON-LD tiene que salir con la misma forma en la vidriera
 * entera. Las rutas (`sitemap.ts`, `robots.ts`, la categoría) sólo traen los
 * datos y llaman acá, así que esto se testea sin levantar Next ni la base.
 */

import {
  disponibilidad as decidirDisponibilidad,
  SCHEMA_DISPONIBILIDAD,
  type Disponibilidad,
} from "@/domain/disponibilidad";
import type { ModoVenta } from "@/domain/modo-venta";

import { formatDatePY } from "./py";
import { publicIdentifiers } from "./public-product-facts";
import { variantGrouping } from "./variant-grouping";
import { isChargeablePrice } from "./money";
import { variantUrl } from "./variant-url";

/**
 * Lo que ningún buscador debería recorrer.
 *
 * No es seguridad —los guards son la defensa real— sino higiene: `/admin` y
 * `/api` no tienen nada que indexar, y `/checkout`, `/pedido` y `/cuenta`
 * llevan datos de una compra concreta. `/pedido/<numero>` en particular es un
 * link tokenizado que viaja por WhatsApp: aparecer en un índice sería
 * filtrarlo. `/favoritos` es distinta para cada navegador —localStorage, o
 * una lista compartida por `?p=`— y no tiene nada propio que Google deba
 * guardar.
 */
export const RUTAS_PRIVADAS = [
  "/admin",
  "/api",
  "/checkout",
  "/pedido",
  "/cuenta",
  "/dev",
  "/favoritos",
  "/comparar",
  // La configuración inicial (sólo existe con SETUP_SECRET puesto).
  "/setup",
] as const;

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?:
    "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  /** O35: URLs absolutas de fotos públicas (`<image:image>`), hasta `MAX_IMAGENES_SITEMAP`. */
  images?: string[];
};

/** Cuántas fotos por producto van al sitemap (fable/plan-trafico.md §2.4). */
export const MAX_IMAGENES_SITEMAP = 5;

export type SitemapInput = {
  /** `updatedAt`: el último cambio de un producto publicado suyo (ver `getSitemapEntries`). */
  categories: { slug: string; updatedAt?: Date | null }[];
  /** `images`: URLs absolutas de las fotos que pueden salir afuera, en orden. */
  products: { slug: string; updatedAt: Date | null; images?: string[] }[];
  /** Las páginas de políticas prendidas (`/envios`, `/terminos`…), por slug. */
  pages?: string[];
  /** O35: `/contacto` existe (la tienda cargó algún dato de contacto). */
  contacto?: boolean;
};

/**
 * El JSON-LD listo para meter en un `<script type="application/ld+json">`.
 *
 * `JSON.stringify` a secas **no alcanza**: no escapa `<`, así que un nombre de
 * producto que contenga `</script>` cierra la etiqueta antes de tiempo y lo
 * que venga después lo parsea el navegador como HTML. El texto del catálogo lo
 * escribe gente del panel, no un extraño, pero "sólo lo toca gente de
 * confianza" es exactamente la suposición que convierte un typo en un XSS
 * almacenado — y en la home y las categorías, que se cachean, el CSP ya no
 * lleva nonce para atajarlo.
 *
 * Escapar `<` y `>` como `\u003c`/`\u003e` es válido en JSON y en JS: el
 * consumidor lee exactamente el mismo string, y ninguna etiqueta puede
 * cerrarse desde adentro. `&` va por el mismo camino para no dejar entidades a
 * medio interpretar.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * El sitemap completo, a partir del origen público y del catálogo activo.
 *
 * `origin` es `NEXT_PUBLIC_SITE_URL` (ver `lib/site-url.ts`). Sin esa variable
 * no hay sitemap: una URL relativa no le sirve a nadie y un dominio inventado
 * es peor que no publicar nada. El llamador devuelve la lista vacía y listo.
 */
export function buildSitemap(origin: URL, input: SitemapInput): SitemapEntry[] {
  const base = origin.origin;
  // La home lista destacados y categorías: cambia cuando cambia cualquier
  // producto publicado. Sin ninguna fecha, sin `lastModified` (no se inventa).
  const ultima = [...input.products, ...input.categories].reduce<Date | null>(
    (max, entrada) =>
      entrada.updatedAt && (!max || entrada.updatedAt > max)
        ? entrada.updatedAt
        : max,
    null
  );

  return [
    {
      url: `${base}/`,
      ...(ultima ? { lastModified: ultima } : {}),
      changeFrequency: "daily",
      priority: 1,
    },
    ...input.categories.map((category) => ({
      url: `${base}/categoria/${category.slug}`,
      ...(category.updatedAt ? { lastModified: category.updatedAt } : {}),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...input.products.map((product) => ({
      url: `${base}/producto/${product.slug}`,
      ...(product.updatedAt ? { lastModified: product.updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.6,
      ...imagenesSitemap(product.images),
    })),
    ...(input.pages ?? []).map((slug) => ({
      url: `${base}/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    ...entradasContacto(base, input.contacto),
  ];
}

/**
 * O35 — las fotos de un producto en el sitemap: sólo URLs absolutas `https://`
 * (R2), sin repetir, hasta `MAX_IMAGENES_SITEMAP`. Sin ninguna, sin el campo.
 */
function imagenesSitemap(images: readonly string[] | undefined): {
  images?: string[];
} {
  const validas = [
    ...new Set((images ?? []).filter((src) => /^https:\/\//.test(src))),
  ].slice(0, MAX_IMAGENES_SITEMAP);
  return validas.length > 0 ? { images: validas } : {};
}

/** O35 — `/contacto`, sólo si la página existe (`contactoTieneDatos`). */
function entradasContacto(base: string, contacto: boolean | undefined): SitemapEntry[] {
  return contacto
    ? [{ url: `${base}/contacto`, changeFrequency: "monthly", priority: 0.3 }]
    : [];
}

type JsonLd = Record<string, unknown>;

/**
 * `BreadcrumbList` — la miga de pan que ya se dibuja arriba de la página,
 * dicha en el idioma de Google. Las posiciones arrancan en 1 por spec.
 */
export function breadcrumbJsonLd(
  origin: URL | null,
  trail: { name: string; path: string }[]
): JsonLd {
  const base = origin?.origin ?? "";
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: `${base}${step.path}`,
    })),
  };
}

/**
 * `ItemList` de una categoría: qué productos hay y en qué orden.
 *
 * Sin precios ni disponibilidad a propósito — eso vive en el `Product` de la
 * ficha, que es la única página que lo tiene fresco (`force-dynamic`). Repetir
 * un precio acá, con ISR de cinco minutos, es prometer un dato viejo.
 */
export function itemListJsonLd(
  origin: URL | null,
  items: { name: string; slug: string }[],
  options: { name?: string; startPosition?: number } = {}
): JsonLd {
  const base = origin?.origin ?? "";
  const start = options.startPosition ?? 1;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(options.name ? { name: options.name } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: start + index,
      name: item.name,
      url: `${base}/producto/${item.slug}`,
    })),
  };
}

/**
 * `Product` de la ficha. Sin `image` Google no da rich result de producto ni
 * listado de comercio, y sin `url` cada `Offer` queda sin página a la que
 * mandar. Lo que no hay no se inventa: sin foto o sin dominio configurado, el
 * campo se omite (mejor que una URL rota en el rich result).
 */
export function productJsonLd(input: {
  origin: URL | null;
  slug: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  /** URLs absolutas de las fotos (R2), en orden. */
  images: string[];
  variants: {
    sku: string;
    label: string;
    pricePyg: number;
    available: number;
    attributes?: unknown;
    identifiers?: unknown;
  }[];
  saleMode?: "stock" | "enquiry" | "showcase";
  showPrice?: boolean;
  /**
   * La disponibilidad de cada variante por SKU, ya decidida en el servidor
   * (`disponibilidadDelProducto`, `src/domain/disponibilidad-proveedor.ts`):
   * la misma que dice la línea visible de la ficha. Acá no se recalcula. Sin
   * el dato (tests, llamadores viejos) se decide con la misma regla, sin
   * proveedores (`disponibilidad` de `src/domain/disponibilidad.ts`).
   */
  disponibilidad?: Record<string, Disponibilidad | null>;
  /** El modo de venta, sólo para el caso sin `disponibilidad`. */
  modoVenta?: ModoVenta;
  /**
   * Promedio y cantidad de reseñas **aprobadas** (`getProductRatingSummary`).
   * Con `count` 0 o ausente no sale ni `aggregateRating` ni `review`: un
   * `aggregateRating` con cero reseñas es un error de datos estructurados.
   */
  rating?: { average: number; count: number };
  /** Las aprobadas más nuevas primero; se publican las 5 primeras. */
  reviews?: ProductReviewLd[];
  /**
   * Envío y devoluciones, tal como los cargó el dueño en `/admin/ajustes`
   * (sección "Envíos y devoluciones"). Lo que falta no se inventa: ver
   * `offerShippingLd` y `returnPolicyLd`.
   */
  merchant?: MerchantPoliciesLd;
}): JsonLd {
  const url = input.origin
    ? `${input.origin.origin}/producto/${input.slug}`
    : undefined;
  const conResenas = input.rating !== undefined && input.rating.count >= 1;
  const shippingDetails = input.merchant
    ? offerShippingLd(input.merchant)
    : null;
  const returnPolicy = input.merchant ? returnPolicyLd(input.merchant) : null;
  // Los identificadores de arriba describen **el** producto: sólo si tiene
  // una variante. Con varias, cada `Offer` lleva su SKU; tomar los de la
  // "primera con stock" cambiaba el GTIN publicado cada vez que una variante
  // se agotaba (docs/TEMPLATE-IMPROVEMENT-PLAN.md E6).
  const only = input.variants.length === 1 ? input.variants[0] : undefined;
  // Un `Offer` necesita un precio que se muestra y se cobra, también en un
  // producto de consulta (fable/plan-trafico.md §2.4): sin precio no hay
  // oferta, nunca un precio 0. `showcase` no publica oferta: no tiene
  // disponibilidad (`disponibilidad` devuelve `null`).
  const palabra = (variant: (typeof input.variants)[number]) =>
    input.disponibilidad
      ? (input.disponibilidad[variant.sku] ?? null)
      : decidirDisponibilidad({
          saleMode: input.saleMode,
          modo: input.modoVenta,
          disponible: variant.available,
        });
  const priced =
    input.showPrice !== false && input.saleMode !== "showcase"
      ? input.variants.flatMap((variant) => {
          const disponible = palabra(variant);
          return isChargeablePrice(variant.pricePyg) && disponible
            ? [{ variant, disponible }]
            : [];
        })
      : [];
  const result: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description || undefined,
    image: input.images.length > 0 ? input.images : undefined,
    url,
    brand: input.brand ? { "@type": "Brand", name: input.brand } : undefined,
    sku: only?.sku,
    ...publicIdentifierLd(only?.identifiers),
    // Sin ningún precio cobrable no hay `offers`: una lista vacía es un dato
    // estructurado inválido, no "sin ofertas".
    ...(priced.length > 0
      ? {
          offers: priced.map(({ variant, disponible }) => ({
            "@type": "Offer",
            sku: variant.sku,
            name: variant.label,
            price: variant.pricePyg,
            priceCurrency: "PYG",
            itemCondition: "https://schema.org/NewCondition",
            url: url ? variantUrl(url, variant.sku) : undefined,
            availability: SCHEMA_DISPONIBILIDAD[disponible],
            ...(shippingDetails ? { shippingDetails } : {}),
            ...(returnPolicy ? { hasMerchantReturnPolicy: returnPolicy } : {}),
          })),
        }
      : {}),
    ...(conResenas && input.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: input.rating.average,
            reviewCount: input.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
          ...(input.reviews && input.reviews.length > 0
            ? { review: input.reviews.slice(0, MAX_REVIEWS_LD).map(reviewLd) }
            : {}),
        }
      : {}),
  };
  // A group needs a published dimension on every member. Labels alone do not establish one.
  const grouping = variantGrouping(input.variants);
  if (!grouping) return result;
  const { dimensions: usable, facts } = grouping;
  return {
    ...result,
    "@type": "ProductGroup",
    sku: undefined,
    gtin: undefined,
    mpn: undefined,
    productGroupID: input.slug,
    variesBy: usable.map((d) => `https://schema.org/${d.schemaProperty}`),
    offers: undefined,
    hasVariant: input.variants.map((v, i) => ({
      "@type": "Product",
      name: `${input.name} — ${v.label}`,
      sku: v.sku,
      url: url ? variantUrl(url, v.sku) : undefined,
      image: result.image,
      brand: result.brand,
      ...Object.fromEntries(
        usable.map((d) => [d.schemaProperty, facts[i]?.[d.key]])
      ),
      ...publicIdentifierLd(v.identifiers),
      offers: (result.offers as JsonLd[] | undefined)?.find(
        (offer) => offer.sku === v.sku
      ),
    })),
  };
}

function publicIdentifierLd(value: unknown): JsonLd {
  const identifiers = publicIdentifiers(value);
  return identifiers
    ? {
        ...(identifiers.gtin ? { gtin: identifiers.gtin } : {}),
        ...(identifiers.mpn ? { mpn: identifiers.mpn } : {}),
      }
    : {};
}

/** Una reseña aprobada, como la necesita el JSON-LD. */
export type ProductReviewLd = {
  /** El "Nombre I." ya guardado en la reseña, nunca el nombre completo. */
  author: string;
  rating: number;
  title?: string | null;
  body: string;
  date: Date;
};

/** Cuántas reseñas van en el JSON-LD. El resto está en la página, no hace falta repetirlo. */
const MAX_REVIEWS_LD = 5;

function reviewLd(review: ProductReviewLd): JsonLd {
  return {
    "@type": "Review",
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    author: { "@type": "Person", name: review.author },
    datePublished: isoDatePY(review.date),
    ...(review.title ? { name: review.title } : {}),
    reviewBody: review.body,
  };
}

/** `YYYY-MM-DD` del día paraguayo: la reseña de las 22:00 es de ese día y no del siguiente en UTC. */
function isoDatePY(date: Date): string {
  const [dia, mes, anio] = formatDatePY(date).split("/");
  return `${anio}-${mes}-${dia}`;
}

/**
 * Los datos de envío y devolución que Google pide en cada `Offer` (Merchant
 * listings). Todos opcionales: `null` = el dueño no lo cargó.
 */
export type MerchantPoliciesLd = {
  handlingDaysMin: number | null;
  handlingDaysMax: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  shippingFromPyg: number | null;
  acceptsReturns: boolean | null;
  returnDays: number | null;
  returnFees: "cliente" | "gratis" | null;
  returnMethod: "envio" | "local" | "ambos" | null;
};

/**
 * `OfferShippingDetails`, **sólo** con el precio "desde" y los dos rangos de
 * días completos. Un envío a medias (precio sin plazos) Google lo marca como
 * error, y un plazo inventado es una promesa que la tienda no hizo.
 */
export function offerShippingLd(m: MerchantPoliciesLd): JsonLd | null {
  const completo =
    m.shippingFromPyg !== null &&
    m.handlingDaysMin !== null &&
    m.handlingDaysMax !== null &&
    m.transitDaysMin !== null &&
    m.transitDaysMax !== null;
  if (!completo) return null;

  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: m.shippingFromPyg,
      currency: "PYG",
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "PY" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: m.handlingDaysMin,
        maxValue: m.handlingDaysMax,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: m.transitDaysMin,
        maxValue: m.transitDaysMax,
        unitCode: "DAY",
      },
    },
  };
}

/**
 * `MerchantReturnPolicy`, **sólo** si el dueño contestó "¿aceptás
 * devoluciones?". Con "sí" hace falta la cantidad de días: sin ella no hay
 * ventana que publicar y se omite entera antes que inventar una.
 */
export function returnPolicyLd(m: MerchantPoliciesLd): JsonLd | null {
  if (m.acceptsReturns === null) return null;

  if (m.acceptsReturns === false) {
    return {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PY",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    };
  }

  if (m.returnDays === null || m.returnDays <= 0) return null;

  const metodos = {
    envio: "https://schema.org/ReturnByMail",
    local: "https://schema.org/ReturnInStore",
  } as const;

  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "PY",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: m.returnDays,
    ...(m.returnFees === "gratis"
      ? { returnFees: "https://schema.org/FreeReturn" }
      : m.returnFees === "cliente"
        ? { returnFees: "https://schema.org/ReturnFeesCustomerResponsibility" }
        : {}),
    ...(m.returnMethod === "ambos"
      ? { returnMethod: [metodos.envio, metodos.local] }
      : m.returnMethod
        ? { returnMethod: metodos[m.returnMethod] }
        : {}),
  };
}

/**
 * `Organization` de la home: quién es la tienda y cómo contactarla. Sin
 * origen configurado **no sale**: `url` es lo que identifica a la
 * organización, y un JSON-LD sin ella (o con un dominio adivinado) es peor
 * que ninguno. Mismo criterio que la `url` de `productJsonLd`.
 */
export function organizationJsonLd(input: {
  origin: URL | null;
  name: string;
  /**
   * URL absoluta del logo (`marcaEfectiva().logoUrl`, el de `/admin/ajustes`
   * → Identidad). Sin logo cargado no sale: el favicon o una foto de producto
   * no son el logo, y Google lo muestra al lado del nombre.
   */
  logo?: string | null;
  /** Ya normalizado (`+595…`). */
  telephone?: string | null;
  email?: string | null;
  /** Perfiles de redes (`https://…`). */
  sameAs?: string[];
}): JsonLd | null {
  if (!input.origin) return null;

  const contacto =
    input.telephone || input.email
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            ...(input.telephone ? { telephone: input.telephone } : {}),
            ...(input.email ? { email: input.email } : {}),
            areaServed: "PY",
          },
        }
      : {};

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: `${input.origin.origin}/`,
    ...(input.logo && /^https:\/\//.test(input.logo)
      ? { logo: input.logo }
      : {}),
    ...(input.email ? { email: input.email } : {}),
    ...contacto,
    ...(input.sameAs && input.sameAs.length > 0
      ? { sameAs: input.sameAs }
      : {}),
  };
}

/**
 * `WebSite` con el buscador de la tienda (`/buscar?q=`).
 *
 * Es lo que le dice a Google cómo se llama el sitio (el nombre que muestra
 * arriba del resultado en vez del dominio pelado) y dónde está su buscador.
 * Mismo criterio que `organizationJsonLd`: sin origen público no sale —un
 * `SearchAction` con URL relativa no es válido—.
 */
export function websiteJsonLd(input: {
  origin: URL | null;
  name: string;
}): JsonLd | null {
  if (!input.origin) return null;
  const base = input.origin.origin;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: `${base}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/buscar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Lo mínimo de una categoría para armar su camino hasta la raíz. */
export type CategoriaDelArbol = {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
};

/**
 * El camino de una categoría desde la raíz: `[abuela, madre, ella]`.
 *
 * Sale de `categories.parent_id`. Recibe la lista de categorías **activas**
 * (`getCategories()`): si una madre está desactivada el camino se corta ahí,
 * porque su página da 404 y una miga de pan que lleva a un 404 es peor que
 * una más corta. Un ciclo (A madre de B, B madre de A: no lo impide la base)
 * también corta en vez de colgar el render.
 *
 * Sin la categoría en la lista devuelve `[]`.
 */
export function categoryTrail<T extends CategoriaDelArbol>(
  categorias: readonly T[],
  slug: string
): T[] {
  const porId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  let actual = categorias.find((categoria) => categoria.slug === slug);
  const camino: T[] = [];
  const vistas = new Set<number>();
  while (actual && !vistas.has(actual.id)) {
    vistas.add(actual.id);
    camino.unshift(actual);
    actual = actual.parentId === null ? undefined : porId.get(actual.parentId);
  }
  return camino;
}

/**
 * O35 — ¿hay algo que mostrar en `/contacto`? Sólo lo que la tienda cargó
 * (`contactoPublico()`): WhatsApp, e-mail, dirección, horario o redes. Sin
 * ninguno, la página es 404 y no va ni al pie ni al sitemap.
 */
export function contactoTieneDatos(contacto: {
  whatsapp: string | null;
  email: string | null;
  direccion: string | null;
  horario: string | null;
  redes: readonly unknown[];
}): boolean {
  return Boolean(
    contacto.whatsapp ||
      contacto.email ||
      contacto.direccion ||
      contacto.horario ||
      contacto.redes.length > 0
  );
}

// ---------------------------------------------------------------------------
// Guías (O34, fable/plan-trafico.md §2.3). Bloque propio: el sitemap y el
// JSON-LD del resto de la tienda no cambian.
// ---------------------------------------------------------------------------

/** Lo mínimo de una guía para el sitemap y el `Article`. */
export type GuiaSeo = {
  slug: string;
  titulo: string;
  descripcion: string;
  /** `YYYY-MM-DD`. */
  publicada: string;
  /** `YYYY-MM-DD`. */
  actualizada: string;
  imagen?: string | null;
};

/** `YYYY-MM-DD` → la medianoche de ese día en Paraguay. */
function diaPY(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-03:00`);
}

/**
 * Las entradas del sitemap de las guías publicadas: el índice `/guias` (con
 * la `actualizada` más nueva) y una por guía (con su `actualizada`). Sin
 * guías, ninguna: un `/guias` que da 404 no se publica.
 */
export function guiasSitemap(
  origin: URL,
  guias: readonly GuiaSeo[]
): SitemapEntry[] {
  if (guias.length === 0) return [];
  const base = origin.origin;
  const ultima = guias.reduce(
    (max, guia) => (guia.actualizada > max ? guia.actualizada : max),
    guias[0]!.actualizada
  );
  return [
    {
      url: `${base}/guias`,
      lastModified: diaPY(ultima),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    ...guias.map((guia) => ({
      url: `${base}/guias/${guia.slug}`,
      lastModified: diaPY(guia.actualizada),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

/**
 * `Article` de una guía. Autor y editor son **la tienda** (`marcaEfectiva()`):
 * las guías las escribe la tienda, no una persona con nombre, y no se inventa
 * una. Sin calificación ni `FAQPage`: las preguntas se muestran en la página,
 * pero no se le promete a Google un rich result que no da para un comercio.
 * `image` sólo si la guía tiene una (absoluta: una ruta propia se completa con
 * el origen; sin origen, se omite).
 */
export function articleJsonLd(input: {
  origin: URL | null;
  guia: GuiaSeo;
  tienda: { nombre: string; logoUrl?: string | null };
}): JsonLd {
  const base = input.origin?.origin ?? "";
  const url = `${base}/guias/${input.guia.slug}`;
  const organizacion = {
    "@type": "Organization",
    name: input.tienda.nombre,
    ...(base ? { url: `${base}/` } : {}),
    ...(input.tienda.logoUrl && /^https:\/\//.test(input.tienda.logoUrl)
      ? { logo: { "@type": "ImageObject", url: input.tienda.logoUrl } }
      : {}),
  };
  const imagen = input.guia.imagen
    ? /^https:\/\//.test(input.guia.imagen)
      ? input.guia.imagen
      : base && input.guia.imagen.startsWith("/")
        ? `${base}${input.guia.imagen}`
        : null
    : null;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.guia.titulo,
    description: input.guia.descripcion,
    datePublished: input.guia.publicada,
    dateModified: input.guia.actualizada,
    author: organizacion,
    publisher: organizacion,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    ...(imagen ? { image: [imagen] } : {}),
  };
}
