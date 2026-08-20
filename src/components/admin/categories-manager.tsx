"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cambiarEstadoCategoria,
  crearCategoria,
  editarCategoria,
  moverCategoria,
} from "@/app/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";

export type AdminCategoryCard = {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  productos: number;
  publicados: number;
  /** Para no ofrecer "subir" en la primera fila ni "bajar" en la última. */
  esPrimera: boolean;
  esUltima: boolean;
};

export function CategoriesManager({ categories }: { categories: AdminCategoryCard[] }) {
  const [editing, setEditing] = useState<number | "nueva" | null>(null);

  return (
    <div className="grid gap-6">
      {editing === "nueva" ? (
        <CategoryForm onDone={() => setEditing(null)} />
      ) : (
        <div>
          <Button type="button" onClick={() => setEditing("nueva")}>
            Crear categoría
          </Button>
        </div>
      )}

      {categories.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          Todavía no hay categorías. Sin al menos una, no se puede cargar ningún
          producto: cada producto pertenece a una.
        </p>
      ) : (
        <ul className="grid gap-3">
          {categories.map((category) =>
            editing === category.id ? (
              <li key={category.id}>
                <CategoryForm category={category} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <CategoryRow
                key={category.id}
                category={category}
                onEdit={() => setEditing(category.id)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
}: {
  category: AdminCategoryCard;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ): void => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No pudimos hacer eso.");
        return;
      }
      toast.success(done);
      setConfirmando(false);
      router.refresh();
    });
  };

  return (
    <li className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium">
          {category.name}
          {category.isActive ? null : (
            <span className="text-muted-foreground font-normal"> · desactivada</span>
          )}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {category.productos} producto{category.productos === 1 ? "" : "s"}
          {category.publicados !== category.productos
            ? ` · ${category.publicados} en la vidriera`
            : ""}
        </span>
      </div>

      <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
        /categoria/{category.slug}
      </p>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-2 rounded-lg border p-2 text-xs"
        >
          {error}
        </p>
      ) : null}

      {confirmando ? (
        /*
          El plan pide que desactivar con productos adentro "explique qué pasa
          con ellos", y la respuesta cambió con este PR: desde ahora apagar la
          categoría también los saca a ellos de la vidriera. Decirlo con el
          número exacto adelante es la diferencia entre una decisión y una
          sorpresa que se descubre por las ventas que no llegan.
        */
        <div className="border-border mt-3 grid gap-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">¿Desactivar “{category.name}”?</p>
          <p className="text-muted-foreground text-xs">
            {category.publicados === 0 ? (
              <>
                No hay productos publicados en esta categoría, así que la
                vidriera no cambia. Sólo desaparece del menú y{" "}
                <span className="font-mono">/categoria/{category.slug}</span>{" "}
                pasa a dar 404.
              </>
            ) : (
              <>
                Sus <strong>{category.publicados}</strong> producto
                {category.publicados === 1 ? "" : "s"} publicado
                {category.publicados === 1 ? "" : "s"} dejan de verse en toda la
                tienda: home, buscador, sitemap y sus propias fichas. No se
                borra nada — los productos quedan como están y vuelven solos
                cuando reactivés la categoría.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  () => cambiarEstadoCategoria({ categoryId: category.id, isActive: false }),
                  "Categoría desactivada.",
                )
              }
            >
              {isPending ? "Desactivando…" : "Sí, desactivar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmando(false)}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={isPending}>
            Editar
          </Button>

          <Button
            type="button"
            size="sm"
            variant={category.isActive ? "outline" : "default"}
            disabled={isPending}
            onClick={() => {
              if (category.isActive) {
                setConfirmando(true);
                return;
              }
              run(
                () => cambiarEstadoCategoria({ categoryId: category.id, isActive: true }),
                "Categoría reactivada.",
              );
            }}
          >
            {category.isActive ? "Desactivar" : "Reactivar"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Subir ${category.name}`}
            disabled={isPending || category.esPrimera}
            onClick={() =>
              run(
                () => moverCategoria({ categoryId: category.id, direction: "up" }),
                "Orden actualizado.",
              )
            }
          >
            ↑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Bajar ${category.name}`}
            disabled={isPending || category.esUltima}
            onClick={() =>
              run(
                () => moverCategoria({ categoryId: category.id, direction: "down" }),
                "Orden actualizado.",
              )
            }
          >
            ↓
          </Button>
        </div>
      )}
    </li>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category?: AdminCategoryCard;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  /*
    Mientras nadie toque el slug, sale del nombre. En cuanto lo tocan, deja de
    seguirlo: pisarle a alguien lo que acaba de escribir es la peor clase de
    "ayuda". Misma mecánica que el formulario de productos.
  */
  const [slugTocado, setSlugTocado] = useState(Boolean(category));

  const slugFinal = slugify(slug || name);
  const cambiaLaUrl = category !== undefined && slugFinal !== category.slug;

  return (
    <form
      className="border-border grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const payload = { name, slug };

        startTransition(async () => {
          const result = category
            ? await editarCategoria({ ...payload, categoryId: category.id })
            : await crearCategoria(payload);

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(category ? "Categoría actualizada." : "Categoría creada.");
          onDone();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">
        {category ? `Editar ${category.name}` : "Nueva categoría"}
      </h2>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="categoria-name">Nombre</Label>
          <Input
            id="categoria-name"
            value={name}
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTocado) setSlug(slugify(event.target.value));
            }}
          />
          <p className="text-muted-foreground text-xs">
            Lo que se lee en el menú de la tienda.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="categoria-slug">URL</Label>
          <Input
            id="categoria-slug"
            value={slug}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => {
              setSlugTocado(true);
              setSlug(event.target.value);
            }}
          />
          <p className="text-muted-foreground text-xs break-all">
            Queda <span className="font-mono">/categoria/{slugFinal || "…"}</span>
          </p>
        </div>
      </div>

      {cambiaLaUrl ? (
        /*
          No se prohíbe —a veces cambiar el slug es justo lo que hace falta—
          pero se avisa: el schema no guarda los slugs viejos, así que no hay
          redirección posible y la URL anterior pasa a 404 para siempre.
        */
        <p className="border-border rounded-lg border p-3 text-xs">
          Estás cambiando la URL. La anterior (
          <span className="font-mono break-all">/categoria/{category?.slug}</span>) va a
          dar 404: los links compartidos por WhatsApp y lo que Google tenga
          indexado dejan de funcionar. El nombre se puede cambiar sin tocar la
          URL — para eso son dos campos.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
