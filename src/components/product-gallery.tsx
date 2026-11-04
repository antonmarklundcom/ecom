"use client";

import Image from "next/image";
import { useState } from "react";

import { ImagenR2 } from "@/components/imagen-r2";
import { IMAGE_SIZES } from "@/lib/image-sizes";
import type { FuentesR2 } from "@/lib/imagenes-r2";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * `src` identifica la foto (y es la URL si no hay `fuentes`); con `fuentes`
 * (una foto de R2) se dibuja un `<picture>` con el `srcset` de sus cajas.
 */
export type GalleryImage = {
  src: string;
  alt: string;
  illustrative?: boolean;
  fuentes?: FuentesR2;
};

/** Una foto de la galería: `<picture>` si es de R2, `next/image` si es local. */
function Foto({
  image,
  alt,
  sizes,
  className,
  priority = false,
}: {
  image: GalleryImage;
  alt: string;
  sizes: string;
  className: string;
  priority?: boolean;
}) {
  if (image.fuentes) {
    return (
      <ImagenR2
        fuentes={image.fuentes}
        alt={alt}
        sizes={sizes}
        fill
        priority={priority}
        className={className}
      />
    );
  }
  return (
    <Image
      src={image.src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}

export function ProductGallery({
  images,
}: {
  images: readonly GalleryImage[];
}) {
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null);
  const selected = Math.max(
    0,
    images.findIndex((item) => item.src === selectedSrc)
  );
  const current = images[selected];
  if (!current) return null;
  function move(delta: number) {
    const next = images[(selected + delta + images.length) % images.length];
    if (next) setSelectedSrc(next.src);
  }
  return (
    <figure className="product-gallery" aria-label="Galería del producto">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="product-gallery-zoom-trigger"
            aria-label={`Ampliar imagen ${selected + 1}: ${current.alt}`}
          >
            <div className="product-gallery-stage">
              <span className="product-gallery-counter" aria-hidden="true">
                {String(selected + 1).padStart(2, "0")} /{" "}
                {String(images.length).padStart(2, "0")}
              </span>
              <Foto
                key={current.src}
                image={current}
                alt={current.alt}
                priority={selected === 0}
                sizes={IMAGE_SIZES.detail}
                className="product-gallery-image"
              />
              <span className="product-gallery-zoom-label">Ampliar imagen</span>
            </div>
          </button>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="product-gallery-zoom motion-reduce:animate-none motion-reduce:duration-0"
          onKeyDown={(event) => {
            if (images.length < 2) return;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>
              Imagen {selected + 1} de {images.length}
            </DialogTitle>
            <DialogClose className="rounded border px-3 py-2">
              Cerrar
            </DialogClose>
          </div>
          <DialogDescription>
            {current.illustrative
              ? "Imagen ilustrativa: no confirma materiales ni disponibilidad."
              : current.alt}
          </DialogDescription>
          <div className="product-gallery-zoom-image">
            <Foto
              image={current}
              alt={current.alt}
              sizes={IMAGE_SIZES.zoom}
              className="object-contain"
            />
          </div>
          {images.length > 1 ? (
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => move(-1)}
                className="rounded border px-3 py-2"
              >
                Imagen anterior
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                className="rounded border px-3 py-2"
              >
                Imagen siguiente
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {images.length > 1 ? (
        <div className="product-gallery-thumbnails" aria-label="Elegir imagen">
          {images.map((item, index) => (
            <button
              type="button"
              key={item.src}
              onClick={() => setSelectedSrc(item.src)}
              aria-pressed={selected === index}
              aria-label={`Ver imagen ${index + 1}: ${item.alt}`}
              className="product-gallery-thumbnail"
            >
              <Foto
                image={item}
                alt=""
                sizes={IMAGE_SIZES.thumb}
                className="product-gallery-image"
              />
            </button>
          ))}
        </div>
      ) : null}
      {current.illustrative ? (
        <figcaption className="product-gallery-caption">
          Imagen ilustrativa para preparar la galería. No representa este
          producto ni confirma sus características o disponibilidad.
        </figcaption>
      ) : (
        <figcaption className="product-gallery-caption">
          Vista {selected + 1} de {images.length} · {current.alt}
        </figcaption>
      )}
    </figure>
  );
}
