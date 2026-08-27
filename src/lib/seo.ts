/**
 * Piezas de SEO técnico: qué se le deja ver a un buscador y qué no.
 *
 * Está en `lib/` y no dentro de las rutas porque son decisiones que no
 * queremos redecidir por tienda: las rutas privadas se bloquean igual en
 * todas, y el JSON-LD tiene que salir con la misma forma en la vidriera
 * entera. Las rutas (`sitemap.ts`, `robots.ts`, la categoría) sólo traen los
 * datos y llaman acá, así que esto se testea sin levantar Next ni la base.
 */

/**
 * Lo que ningún buscador debería recorrer.
 *
 * No es seguridad —los guards son la defensa real— sino higiene: `/admin` y
 * `/api` no tienen nada que indexar, y `/checkout`, `/pedido` y `/cuenta`
 * llevan datos de una compra concreta. `/pedido/<numero>` en particular es un
 * link tokenizado que viaja por WhatsApp: aparecer en un índice sería
 * filtrarlo.
 */
export const RUTAS_PRIVADAS = [
  "/admin",
  "/api",
  "/checkout",
  "/pedido",
  "/cuenta",
  "/dev",
] as const;

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?:
    "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

export type SitemapInput = {
  categories: { slug: string }[];
  products: { slug: string; updatedAt: Date | null }[];
};

/**
 * El sitemap completo, a partir del origen público y del catálogo activo.
 *
 * `origin` es `NEXT_PUBLIC_SITE_URL` (ver `lib/site-url.ts`). Sin esa variable
 * no hay sitemap: una URL relativa no le sirve a nadie y un dominio inventado
 * es peor que no publicar nada. El llamador devuelve la lista vacía y listo.
 */
/**
 * El JSON-LD listo para meter en un `<script type="application/ld+json">`.
 *
 * `JSON.stringify` a secas **no alcanza**: no escapa `/`, así que un nombre de
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

export function buildSitemap(origin: URL, input: SitemapInput): SitemapEntry[] {
  const base = origin.origin;

  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...input.categories.map((category) => ({
      url: `${base}/categoria/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...input.products.map((product) => ({
      url: `${base}/producto/${product.slug}`,
      ...(product.updatedAt ? { lastModified: product.updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
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
