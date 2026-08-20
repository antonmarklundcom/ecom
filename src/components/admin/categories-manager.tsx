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
  productCount: number;
  visibleCount: number;
};

export function CategoriesManager({ categories }: { categories: AdminCategoryCard[] }) {
  const [editing, setEditing] = useState<number | "nueva" | null>(null);
  const activas = categories.filter((category) => category.isActive).length;

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
          Todavía no hay categorías. Sin ninguna activa, la vidriera queda vacía.
        </p>
      ) : (
        <ul className="grid gap-3">
          {categories.map((category, index) =>
            editing === category.id ? (
              <li key={category.id}>
                <CategoryForm category={category} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <CategoryRow
                key={category.id}
                category={category}
                esPrimera={index === 0}
                esUltima={index === categories.length - 1}
                ultimaActiva={category.isActive && activas === 1}
                onEdit={() => setEditing(category.id)}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  esPrimera,
  esUltima,
  ultimaActiva,
  onEdit,
}: {
  category: AdminCategoryCard;
  esPrimera: boolean;
  esUltima: boolean;
  ultimaActiva: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => {
    setError(null);
    startTransition(async () => {
      const result = await accion();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ok);
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
        <span className="text-muted-foreground font-mono text-xs">/categoria/{category.slug}</span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        {category.productCount} producto{category.productCount === 1 ? "" : "s"}
        {category.visibleCount !== category.productCount
          ? ` · ${category.visibleCount} en la vidriera`
          : ""}
      </p>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-2 rounded-lg border p-2 text-xs"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending || esPrimera}
          onClick={() => run(() => moverCategoria({ id: category.id, direction: "arriba" }), "Orden actualizado.")}
        >
          Subir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending || esUltima}
          onClick={() => run(() => moverCategoria({ id: category.id, direction: "abajo" }), "Orden actualizado.")}
        >
          Bajar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={isPending}>
          Editar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={category.isActive ? "outline" : "default"}
          disabled={isPending}
          onClick={() => {
            // La confirmación que pide el plan. Se dice el número concreto de
            // productos que se van a esconder, no un "¿estás seguro?": lo
            // segundo se contesta que sí sin leerlo.
            if (category.isActive && !confirm(mensajeDesactivar(category, ultimaActiva))) return;
            run(
              () => cambiarEstadoCategoria({ id: category.id, isActive: !category.isActive }),
              category.isActive ? "Categoría desactivada." : "Categoría activada."
            );
          }}
        >
          {category.isActive ? "Desactivar" : "Activar"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Qué le pasa a los productos de adentro, dicho antes de apretar.
 *
 * Los productos **no** se modifican: siguen publicados en la base y vuelven
 * enteros al reactivar la categoría. Lo que cambia es que salen de la
 * vidriera —home, buscador, su propia ficha— y dejan de poder comprarse.
 */
function mensajeDesactivar(category: AdminCategoryCard, ultimaActiva: boolean): string {
  const partes = [`Vas a desactivar "${category.name}".`];

  if (category.visibleCount > 0) {
    partes.push(
      `Sus ${category.visibleCount} producto${category.visibleCount === 1 ? "" : "s"} en vidriera ` +
        `dejan de verse y de poder comprarse. No se modifican: al reactivarla vuelven como estaban.`
    );
  } else {
    partes.push("No tiene productos en la vidriera, así que no desaparece nada de la tienda.");
  }

  if (ultimaActiva) {
    partes.push("Es la última categoría activa: la tienda queda sin nada para mostrar.");
  }

  return partes.join("\n\n");
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
  // Una categoría existente ya tiene su URL circulando: no se le toca sola.
  const [slugTouched, setSlugTouched] = useState(Boolean(category));

  return (
    <form
      className="border-border grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        if (category && slug !== category.slug) {
          const seguir = confirm(
            `Vas a cambiar la URL de "${category.name}" de /categoria/${category.slug} a ` +
              `/categoria/${slug}.\n\nLos links que ya se compartieron y lo que Google indexó ` +
              `van a dar 404.`
          );
          if (!seguir) return;
        }

        const payload = { name, slug };

        startTransition(async () => {
          const result = category
            ? await editarCategoria({ ...payload, id: category.id })
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
      <h2 className="font-medium">{category ? `Editar ${category.name}` : "Nueva categoría"}</h2>

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
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            required
            minLength={2}
            maxLength={120}
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
          <p className="text-muted-foreground text-xs">Es lo que se lee en el menú de la tienda.</p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="slug">Enlace</Label>
          <Input
            id="slug"
            required
            minLength={2}
            maxLength={120}
            value={slug}
            autoComplete="off"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
          <p className="text-muted-foreground text-xs">
            /categoria/{slug || "…"} — cambiarlo rompe los links ya compartidos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
