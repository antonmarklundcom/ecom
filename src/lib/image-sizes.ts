/**
 * El `sizes` de cada lugar de la vidriera donde se dibuja una foto.
 *
 * `sizes` le dice al navegador **qué ancho va a ocupar la imagen** antes de
 * que exista el CSS, y con eso elige del `srcset` la versión más chica que
 * alcanza. Equivocarse para arriba manda fotos de 1000 px a una tarjeta de
 * 150 px en un celular con 4G de Tigo; equivocarse para abajo se ve borroso
 * en una tablet. Un `sizes` que falta es lo peor de los dos: el navegador
 * asume `100vw` y baja la foto más grande de la lista.
 *
 * Los números salen de la grilla real (no de un "más o menos"):
 *
 * - el contenedor de la vidriera es `max-w-6xl` (1152 px) con `px-4`: el
 *   contenido mide `100vw - 32px` hasta 1152 px de pantalla y 1120 px de ahí
 *   para arriba;
 * - las grillas de tarjetas son `grid-cols-2 lg:grid-cols-4` con `gap-4` y la
 *   tarjeta tiene `p-3` (24 px de borde a borde);
 * - la ficha es `lg:grid-cols-2` con `gap-8`.
 *
 * Una tienda que rediseña la grilla (piel) cambia el número acá y no en cada
 * componente. `tests/unit/image-sizes.test.ts` falla si una imagen de la
 * vidriera se dibuja sin `sizes`.
 *
 * Hoy `next.config.ts` tiene `images.unoptimized` (Cloudinary arma el tamaño)
 * y el `<img>` sale sin `srcset`; el `sizes` correcto ya queda puesto para el
 * día que la imagen traiga varias resoluciones.
 */
export const IMAGE_SIZES = {
  /** Tarjeta de producto en la grilla de la home, categoría, relacionados y vistos. */
  card: "(min-width: 1152px) 244px, (min-width: 1024px) calc(25vw - 44px), calc(50vw - 48px)",
  /** La foto grande de la ficha (columna izquierda en desktop). */
  detail: "(min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 32px), calc(100vw - 32px)",
  /** Las miniaturas de la galería: caja fija de 88 px (`.product-gallery-thumbnail`). */
  thumb: "88px",
  /** La foto ampliada del diálogo de la galería: `min(95vw, 960px)`. */
  zoom: "(min-width: 1011px) 960px, 95vw",
  /** Portada de la home y foto de categoría: el ancho entero del contenedor. */
  hero: "(min-width: 1152px) 1120px, calc(100vw - 32px)",
  /** El QR de transferencia del pedido: caja fija `size-56` (224 px). */
  qr: "224px",
} as const;

export type ImageSlot = keyof typeof IMAGE_SIZES;
