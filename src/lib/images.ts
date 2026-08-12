/**
 * URLs de entrega de imágenes públicas de producto.
 *
 * A propósito NO importa `src/lib/cloudinary.ts`: ese módulo configura el SDK
 * con el api_secret y explota al importarse si falta una variable. Armar una
 * URL de entrega pública no necesita ningún secreto, y la vidriera no puede
 * caerse porque el comercio todavía no cargó las credenciales.
 */

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

/** Transformaciones por defecto: formato y calidad los decide Cloudinary. */
const DEFAULT_TRANSFORMS = "f_auto,q_auto";

export type ImageSize = "thumb" | "card" | "detail";

const SIZE_TRANSFORMS: Record<ImageSize, string> = {
  thumb: "c_fill,w_160,h_160",
  card: "c_fill,w_600,h_600",
  detail: "c_fit,w_1200,h_1200",
};

/**
 * `productImageUrl("productos/remera-azul", "card")`.
 * Devuelve `null` si no hay cloud configurado o el id está vacío — quien
 * llama muestra el placeholder.
 */
export function productImageUrl(
  cloudinaryId: string | null | undefined,
  size: ImageSize = "card"
): string | null {
  if (!CLOUD_NAME || !cloudinaryId) return null;
  const transforms = `${DEFAULT_TRANSFORMS},${SIZE_TRANSFORMS[size]}`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transforms}/${cloudinaryId}`;
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
