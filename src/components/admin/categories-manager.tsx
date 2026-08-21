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
import { t, tPlural } from "@/i18n";

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
            {t("panel.categoria.crear")}
          </Button>
        </div>
      )}

      {categories.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          {t("panel.categoria.vacio")}
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
        setError(result.error ?? t("panel.abm.noPudimos"));
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
            <span className="text-muted-foreground font-normal">
              {t("panel.categoria.desactivada")}
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {tPlural("panel.categoria.productos", category.productos)}
          {category.publicados !== category.productos
            ? t("panel.categoria.enVidriera", { n: category.publicados })
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
          <p className="font-medium">{t("panel.categoria.confirmar", { nombre: category.name })}</p>
          <p className="text-muted-foreground text-xs">
            {category.publicados === 0
              ? t("panel.categoria.confirmar.sinPublicados", { slug: category.slug })
              : tPlural("panel.categoria.confirmar.conPublicados", category.publicados)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  () => cambiarEstadoCategoria({ categoryId: category.id, isActive: false }),
                  t("panel.categoria.desactivadaOk"),
                )
              }
            >
              {isPending ? t("panel.categoria.desactivando") : t("panel.categoria.siDesactivar")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmando(false)}
            >
              {t("panel.acciones.volver")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={isPending}>
            {t("panel.abm.editar")}
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
                t("panel.categoria.reactivadaOk"),
              );
            }}
          >
            {category.isActive ? t("panel.abm.desactivar") : t("panel.abm.reactivar")}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("panel.abm.subir", { nombre: category.name })}
            disabled={isPending || category.esPrimera}
            onClick={() =>
              run(
                () => moverCategoria({ categoryId: category.id, direction: "up" }),
                t("panel.abm.ordenActualizado"),
              )
            }
          >
            ↑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("panel.abm.bajar", { nombre: category.name })}
            disabled={isPending || category.esUltima}
            onClick={() =>
              run(
                () => moverCategoria({ categoryId: category.id, direction: "down" }),
                t("panel.abm.ordenActualizado"),
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
          toast.success(category ? t("panel.categoria.actualizada") : t("panel.categoria.creada"));
          onDone();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">
        {category
          ? t("panel.categoria.editarTitulo", { nombre: category.name })
          : t("panel.categoria.nueva")}
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
          <Label htmlFor="categoria-name">{t("panel.categoria.nombre")}</Label>
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
            {t("panel.categoria.nombreAyuda")}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="categoria-slug">{t("panel.categoria.url")}</Label>
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
            {t("panel.categoria.urlPreview", { slug: slugFinal || "…" })}
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
          {t("panel.categoria.avisoUrl", { slug: category?.slug ?? "" })}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("panel.acciones.guardando")
            : category
              ? t("panel.abm.guardarCambios")
              : t("panel.categoria.crear")}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
          {t("panel.abm.cancelar")}
        </Button>
      </div>
    </form>
  );
}
