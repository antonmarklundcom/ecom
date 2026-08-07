"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { removeProductImage, uploadProductImage } from "@/app/actions/admin-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productImageUrl } from "@/lib/images";

type ImageCard = { id: number; cloudinaryId: string; alt: string | null };

export function ProductImages({
  productId,
  images,
}: {
  productId: number;
  images: ImageCard[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => {
            const url = productImageUrl(image.cloudinaryId, "card");
            return (
              <li key={image.id} className="border-border overflow-hidden rounded-lg border">
                <div className="bg-muted relative aspect-square">
                  {url ? (
                    <Image
                      src={url}
                      alt={image.alt ?? "Foto del producto"}
                      fill
                      unoptimized
                      sizes="200px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeProductImage({ imageId: image.id, productId });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      toast.success("Foto quitada.");
                      router.refresh();
                    });
                  }}
                >
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Todavía no hay fotos: en la tienda se ve un placeholder de color.
        </p>
      )}

      <form
        ref={formRef}
        className="border-border grid gap-3 rounded-xl border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const data = new FormData(event.currentTarget);
          data.set("productId", String(productId));

          startTransition(async () => {
            const result = await uploadProductImage(data);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            formRef.current?.reset();
            toast.success("Foto subida.");
            router.refresh();
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="file">Agregar foto (JPG, PNG o WebP, hasta 5 MB)</Label>
          <Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="alt">Descripción de la foto (accesibilidad y SEO)</Label>
          <Input id="alt" name="alt" maxLength={255} placeholder="Remera azul de frente" />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Subiendo…" : "Subir foto"}
        </Button>
      </form>
    </div>
  );
}
