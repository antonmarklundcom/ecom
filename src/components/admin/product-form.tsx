"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProduct } from "@/app/actions/admin-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEXTOS } from "@/i18n";
import { slugify } from "@/lib/slug";

export type ProductFormValues = {
  productId?: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  brand: string;
  ivaRate: number;
  isActive: boolean;
  published: boolean;
};

export function ProductForm({
  defaults,
  categories,
}: {
  defaults: ProductFormValues;
  categories: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(defaults.slug);
  // Sólo se autocompleta el slug de un producto nuevo: cambiarlo en uno ya
  // publicado le rompe la URL y el SEO.
  const [slugTouched, setSlugTouched] = useState(defaults.productId !== undefined);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await saveProduct({
            productId: defaults.productId,
            slug: String(data.get("slug") ?? ""),
            name: String(data.get("name") ?? ""),
            description: String(data.get("description") ?? ""),
            categoryId: Number(data.get("categoryId")),
            brand: String(data.get("brand") ?? ""),
            ivaRate: Number(data.get("ivaRate")),
            isActive: data.get("isActive") === "on",
            published: data.get("published") === "on",
          });

          if (!result.ok) {
            setError(result.error);
            return;
          }

          toast.success(TEXTOS.panel.productos.guardado);
          if (defaults.productId === undefined) {
            router.push(`/admin/productos/${result.productId}`);
            return;
          }
          router.refresh();
        });
      }}
    >
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="name">{TEXTOS.panel.comunes.nombre}</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults.name}
          onChange={(event) => {
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="slug">{TEXTOS.panel.productos.slug}</Label>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">{TEXTOS.panel.productos.descripcion}</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults.description}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="categoryId">{TEXTOS.panel.productos.categoria}</Label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={String(defaults.categoryId || "")}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="" disabled>
              {TEXTOS.panel.productos.elegiUna}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="brand">{TEXTOS.panel.productos.marca}</Label>
          <Input id="brand" name="brand" defaultValue={defaults.brand} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ivaRate">{TEXTOS.panel.productos.iva}</Label>
          <select
            id="ivaRate"
            name="ivaRate"
            defaultValue={String(defaults.ivaRate)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="10">{TEXTOS.panel.productos.iva10}</option>
            <option value="5">{TEXTOS.panel.productos.iva5}</option>
            <option value="0">{TEXTOS.panel.productos.ivaExento}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          {TEXTOS.panel.productos.activo}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={defaults.published} />
          {TEXTOS.panel.productos.publicado}
        </label>
        <p className="text-muted-foreground text-xs">
          {TEXTOS.panel.productos.publicadoAyuda}
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? TEXTOS.panel.comunes.guardando : TEXTOS.panel.productos.guardarProducto}
      </Button>
    </form>
  );
}
