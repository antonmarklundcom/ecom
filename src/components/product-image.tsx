import Image from "next/image";

import { placeholderHue, productImageUrl, type ImageSize } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { CatalogImage } from "@/db/queries";

/**
 * Imagen de producto con placeholder.
 *
 * `unoptimized`: Cloudinary ya entrega `f_auto,q_auto` en el tamaño pedido,
 * así que pasarlo otra vez por el optimizador de Next sólo gasta CPU del slot
 * de Hostinger (ARCH.md §6).
 */
export function ProductImage({
  image,
  alt,
  seed,
  size = "card",
  className,
  priority = false,
  sizes,
}: {
  image: CatalogImage | null;
  alt: string;
  seed: string;
  size?: ImageSize;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const url = productImageUrl(image?.cloudinaryId, size);
  const wrapper = cn("bg-muted relative aspect-square overflow-hidden rounded-lg", className);

  if (!url) {
    const hue = placeholderHue(seed);
    return (
      <div
        className={wrapper}
        style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 88%), hsl(${hue} 45% 76%))` }}
        role="img"
        aria-label={`${alt} (sin foto todavía)`}
      />
    );
  }

  return (
    <div className={wrapper}>
      <Image
        src={url}
        alt={image?.alt ?? alt}
        fill
        unoptimized
        priority={priority}
        sizes={sizes ?? "(max-width: 640px) 50vw, 300px"}
        className="object-cover"
        placeholder={image?.blurDataUrl ? "blur" : "empty"}
        blurDataURL={image?.blurDataUrl ?? undefined}
      />
    </div>
  );
}
