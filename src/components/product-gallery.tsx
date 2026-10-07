"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type GalleryImage = { src: string; alt: string; illustrative?: boolean };

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
              <Image
                key={current.src}
                src={current.src}
                alt={current.alt}
                fill
                priority={selected === 0}
                unoptimized={current.src.startsWith("https://")}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 55vw, 720px"
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
            <Image
              src={current.src}
              alt={current.alt}
              fill
              sizes="95vw"
              unoptimized={current.src.startsWith("https://")}
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
              <Image
                src={item.src}
                alt=""
                fill
                sizes="(max-width: 640px) 20vw, 110px"
                unoptimized={item.src.startsWith("https://")}
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
