/**
 * URLs de entrega de las imágenes públicas (R2, formato `p1`:
 * `src/lib/imagenes-r2.ts`).
 *
 * Armar una URL pública no necesita ningún secreto: sólo la **base pública**
 * del bucket (`R2_PUBLIC_URL`, o la cargada en `/admin/integraciones`). La
 * vidriera no se puede caer porque el comercio todavía no cargó las
 * credenciales: sin base, o con una referencia que no es de R2 (un id viejo de
 * antes de la migración, un texto pegado a mano), todo da `null` y quien
 * llama muestra el placeholder — nunca una URL rota.
 */

import {
  fuentesR2,
  normalizarBasePublica,
  urlR2,
  type FuentesR2,
  type ImageSize,
} from "./imagenes-r2";

export type { ImageSize } from "./imagenes-r2";

/** Lo registra `src/lib/integraciones.ts` al cargarse (ver `basePublicaImagenes`). */
const LECTOR_BASE_PUBLICA = Symbol.for("ecom.integraciones.r2PublicUrl");

/** El `<meta>` que deja el layout para los componentes cliente. */
export const META_BASE_IMAGENES = "ecom-imagenes";

let baseDelDocumento: string | null | undefined;

/**
 * La base pública de las imágenes, panel > entorno. Se lee en cada llamada: el
 * dueño la puede cargar desde el panel sin redeploy.
 *
 * **No importa `integraciones.ts`**, a propósito: este archivo lo usan
 * componentes cliente, y ese módulo (con la tabla de campos de todas las
 * integraciones) inflaba el JS de la home por encima del presupuesto de
 * `tests/e2e/presupuesto.spec.ts`. En el servidor, `integraciones.ts` deja un
 * lector en `globalThis` al cargarse (lo carga `instrumentation.ts` al
 * arrancar); sin él, el entorno. En el navegador la lee del
 * `<meta name="ecom-imagenes">` que dibuja el layout con el mismo valor que
 * usó el servidor, así el primer render del cliente da lo mismo que el HTML.
 */
export function basePublicaImagenes(): string | null {
  // En el navegador manda el `<meta>`, siempre: aunque algún módulo cliente
  // haya cargado `integraciones.ts` (y su lector), ahí no hay foto ni entorno.
  if (typeof document !== "undefined") {
    if (baseDelDocumento === undefined) {
      const meta = document.querySelector<HTMLMetaElement>(
        `meta[name="${META_BASE_IMAGENES}"]`
      );
      // Sin `<meta>` todavía no se cachea: un test que lo agrega después lo ve.
      if (!meta) return null;
      baseDelDocumento = normalizarBasePublica(meta.content);
    }
    return baseDelDocumento;
  }
  const lector = (globalThis as { [LECTOR_BASE_PUBLICA]?: () => string | null })[
    LECTOR_BASE_PUBLICA
  ];
  if (lector) return normalizarBasePublica(lector());
  if (typeof process === "undefined") return null;
  return normalizarBasePublica(process.env.R2_PUBLIC_URL);
}

/** Sólo tests: olvida la base leída del documento. */
export function resetBaseImagenesForTests(): void {
  baseDelDocumento = undefined;
}

/**
 * 1200×630 es la caja que esperan WhatsApp, Instagram y Facebook para la
 * imagen de Open Graph que se dibuja (`opengraph-image.tsx`).
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/**
 * `productImageUrl("r2:p1/remera-azul-3f9a0c12de@1200x1200", "card")`.
 * Devuelve `null` si no hay base pública o la referencia no es de R2 — quien
 * llama muestra el placeholder.
 */
export function productImageUrl(
  imageRef: string | null | undefined,
  size: ImageSize = "card",
  base: string | null = basePublicaImagenes()
): string | null {
  return urlR2(imageRef, size, base);
}

/** Todo lo que necesita un `<picture>` (WebP por caja + JPEG). `null` = placeholder. */
export function productImageSources(
  imageRef: string | null | undefined,
  size: ImageSize = "card",
  base: string | null = basePublicaImagenes()
): FuentesR2 | null {
  return fuentesR2(imageRef, base, size);
}

/**
 * Ilustraciones placeholder commiteadas (`public/placeholders/`), una por
 * categoría del seed — evita que la demo se muestre con cajas de color liso
 * antes de que el comercio cargue fotos reales. A propósito son dibujos de
 * línea simples y genéricos, sin logos de marca: son un "todavía no hay
 * foto", no un producto de mentira disfrazado de real.
 */
const CATEGORY_PLACEHOLDERS = new Set([
  "electronica",
  "hogar-y-cocina",
  "moda",
  "deportes",
]);

/** `categoryPlaceholderSrc("moda")` → `/placeholders/moda.svg`. */
export function categoryPlaceholderSrc(categorySlug: string): string {
  const slug = CATEGORY_PLACEHOLDERS.has(categorySlug) ? categorySlug : "generico";
  return `/placeholders/${slug}.svg`;
}

/**
 * El QR SPI del comercio, subido desde `/admin/banco` (PLAN.md FASE 2, PR T).
 *
 * El archivo más grande, sin recortar: recortar un QR lo rompe —deja de
 * escanear— y ahí no hay "se ve un poco mal", hay una compradora parada frente
 * a la app del banco que no puede pagar.
 */
export function bankQrUrl(imageRef: string | null | undefined): string | null {
  return productImageUrl(imageRef, "qr");
}
