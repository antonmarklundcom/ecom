import Image from "next/image";
import { IMAGE_SIZES } from "@/lib/image-sizes";

import { t } from "@/i18n/client";
import { ImagenR2 } from "@/components/imagen-r2";
import {
  categoryPlaceholderSrc,
  productImageSources,
  type ImageSize,
} from "@/lib/images";
import { cn } from "@/lib/utils";
import type { CatalogImage } from "@/db/queries";

/**
 * == S18 ==
 * Las cuatro categorías del seed, tal como las conoce
 * `CATEGORY_PLACEHOLDERS` de `src/lib/images.ts` — duplicado acá a
 * propósito y no importado: ese archivo es `src/lib/**`, fuera de los
 * límites duros de esta fase (plan-crecimiento §4.7), así que no se puede
 * exportar la lista desde ahí sin tocarlo. Si una tienda le agrega una
 * quinta categoría "conocida" en `images.ts`, este set no se entera —está
 * documentado acá para que quien la agregue sepa dónde mirar.
 */
const CATEGORIAS_CONOCIDAS = new Set([
  "electronica",
  "hogar-y-cocina",
  "moda",
  "deportes",
]);

/** `"hogar-y-cocina"` → `"Hogar y cocina"`. Sólo para el texto del placeholder. */
function nombreLegible(categorySlug: string): string {
  const palabras = categorySlug.split("-").filter(Boolean);
  if (palabras.length === 0) return categorySlug;
  return palabras
    .map((palabra, index) =>
      index === 0 ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra
    )
    .join(" ");
}

/**
 * Imagen de producto con placeholder.
 *
 * Con una referencia de R2 y la base pública configurada, un `<picture>` con
 * los WebP de cada caja y el JPEG de respaldo (`ImagenR2`). Sin eso —sin
 * foto, sin base pública, o una referencia vieja que no es de R2— el
 * placeholder de la categoría: nunca una URL rota.
 */
export function ProductImage({
  image,
  alt,
  categorySlug,
  size = "card",
  className,
  priority = false,
  sizes,
}: {
  image: CatalogImage | null;
  alt: string;
  categorySlug: string;
  size?: ImageSize;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const fuentes = productImageSources(image?.imageRef, size);
  const wrapper = cn(
    "bg-muted relative aspect-square overflow-hidden rounded-lg",
    className
  );

  if (!fuentes) {
    // == S18 == Una categoría fuera de las cuatro del seed (una tienda que
    // agregó las suyas) no cae en `categoryPlaceholderSrc`, que sin
    // conocerla mostraría el mismo dibujo genérico de "producto" sin decir
    // de qué categoría es: acá se muestra un placeholder propio, con el
    // nombre de la categoría en texto, para que la vidriera nunca se vea
    // como un error mientras el comercio no subió fotos.
    if (!CATEGORIAS_CONOCIDAS.has(categorySlug)) {
      return (
        <div className={wrapper}>
          <Image
            src="/placeholders/categoria.svg"
            alt=""
            fill
            aria-hidden
            priority={priority}
            sizes={sizes ?? IMAGE_SIZES.card}
            className="object-cover"
          />
          <span className="text-muted-foreground bg-background/80 absolute inset-x-3 bottom-3 truncate rounded px-2 py-1 text-center text-xs font-medium">
            {t("catalogo.sinFoto", { nombre: nombreLegible(categorySlug) })}
          </span>
        </div>
      );
    }

    return (
      <div className={wrapper}>
        <Image
          src={categoryPlaceholderSrc(categorySlug)}
          alt={t("catalogo.sinFoto", { nombre: alt })}
          fill
          priority={priority}
          sizes={sizes ?? IMAGE_SIZES.card}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <ImagenR2
        fuentes={fuentes}
        alt={image?.alt ?? alt}
        fill
        priority={priority}
        sizes={sizes ?? IMAGE_SIZES.card}
        className="object-cover"
      />
      {/* Una foto ilustrativa no es este producto: lo dice donde se vea
          (docs/TEMPLATE-IMPROVEMENT-PLAN.md F6), como la galería de la ficha. */}
      {image?.provenance === "illustrative" ? (
        <span className="bg-background/85 text-foreground absolute inset-x-2 bottom-2 truncate rounded px-2 py-0.5 text-center text-xs">
          {t("catalogo.imagenIlustrativa")}
        </span>
      ) : null}
    </div>
  );
}
