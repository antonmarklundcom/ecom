import type { FuentesR2 } from "@/lib/imagenes-r2";
import { cn } from "@/lib/utils";

/**
 * Una foto de R2 como `<picture>`: los WebP de cada caja en `srcset` (el
 * navegador elige el más chico que alcance para `sizes`) y el JPEG de
 * respaldo en el `<img>`, para el navegador que no habla WebP.
 *
 * `sizes` lo pasa quien llama porque sólo quien dibuja sabe cuánto ocupa la
 * foto en pantalla; sin él, el navegador asume el ancho entero de la ventana
 * y baja la foto más grande en una tarjeta de 160 px.
 *
 * `<img>` y no `next/image`: el optimizador de Next no puede emitir un
 * `srcset` de archivos ya achicados, y pasarlos otra vez por él sólo gasta CPU
 * del slot (ARCH.md §6).
 */
export function ImagenR2({
  fuentes,
  alt,
  sizes,
  priority = false,
  fill = false,
  className,
  pictureClassName,
  onError,
}: {
  fuentes: FuentesR2;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** Ocupa el contenedor (que tiene que ser `relative`), como `next/image` con `fill`. */
  fill?: boolean;
  className?: string;
  pictureClassName?: string;
  onError?: () => void;
}) {
  return (
    <picture className={cn(fill && "absolute inset-0", pictureClassName)}>
      <source type="image/webp" srcSet={fuentes.srcSet} sizes={sizes} />
      <img
        src={fuentes.jpeg}
        alt={alt}
        width={fuentes.width}
        height={fuentes.height}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onError={onError}
        className={cn(fill && "h-full w-full", className)}
      />
    </picture>
  );
}
