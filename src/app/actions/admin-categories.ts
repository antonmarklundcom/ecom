"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminCategoryError,
  createCategory,
  moveCategory,
  setCategoryActive,
  setCategoryImage,
  updateCategory,
} from "@/domain/admin-categories";
import { subirFotoDelPanel } from "@/domain/product-images";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  adminActionError,
  fieldFor,
  requireOwnerSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
import { parseEs, zodFieldErrors } from "@/lib/field-errors";
import { t } from "@/i18n";

/**
 * ABM de categorías (PLAN.md FASE 2, PR J). **Todas owner-only.**
 *
 * Que sea el dueño y no el encargado no es desconfianza: apagar una categoría
 * saca de la vidriera todos sus productos de una vez (ver `PUBLISHED()` en
 * `src/db/queries.ts`), y cambiarle el slug rompe todas las URLs de esa
 * sección que anden dando vueltas por WhatsApp. Son decisiones que se toman
 * una vez por año y cuyo error se paga en ventas que no llegan.
 *
 * Las validaciones de verdad —slug único, renumerado de posiciones— viven en
 * `src/domain/admin-categories.ts`, adentro de la transacción. Acá arriba
 * serían una carrera.
 *
 * Se revalida `/` y `/categoria/[slug]` además de la pantalla del panel: lo
 * que cambia acá es lo que ve la compradora, y una vidriera cacheada con la
 * categoría vieja es el bug que después se reporta como "no me tomó el cambio".
 */

function revalidarVidriera(): void {
  revalidatePath("/admin/categorias");
  revalidatePath("/", "layout");
}

const CreateSchema = z.object({
  seoTitle: z.string().trim().max(200).nullish(),
  seoDescription: z.string().trim().max(500).nullish(),
  name: z.string().trim().min(1, t("adminForm.nombreCategoria")).max(120),
  slug: z.string().trim().max(120).optional(),
  /**
   * Presentación de la categoría (O7). Los `.max()` son el largo exacto de las
   * columnas; `null` borra el campo y **ausente no lo toca**, que es lo que
   * necesita el formulario de hoy (S10 dibuja los campos).
   */
  description: z.string().trim().max(5000).nullish(),
  imageRef: z.string().trim().max(255).nullish(),
  imageAlt: z.string().trim().max(200).nullish(),
});

const CAMPOS_CATEGORIA = {
  "adminError.categoria.nombreCorto": "name",
  "adminError.categoria.nombreLargo": "name",
  "adminError.categoria.sinUrl": "slug",
  "adminError.categoria.slugLargo": "slug",
  "adminError.categoria.urlRepetida": "slug",
  "adminError.categoria.urlRepetidaOtra": "slug",
} as const;

export async function crearCategoria(
  input: unknown
): Promise<AdminActionResult<{ id: number }>> {
  try {
    await requireOwnerSession();

    const parsed = parseEs(CreateSchema, input);
    if (!parsed.success) {
      return {
        ok: false,
        error: t("adminForm.revisaCampos"),
        fields: zodFieldErrors(parsed.error),
      };
    }

    const created = await createCategory({
      seoTitle: parsed.data.seoTitle,
      seoDescription: parsed.data.seoDescription,
      name: parsed.data.name,
      slug: parsed.data.slug || null,
      description: parsed.data.description,
      imageRef: parsed.data.imageRef,
      imageAlt: parsed.data.imageAlt,
    });

    revalidarVidriera();
    return { ok: true, id: created.id };
  } catch (error) {
    // Los errores de la categoría van al campo que los causa (F1).
    if (error instanceof AdminCategoryError) {
      const fields = fieldFor(error, CAMPOS_CATEGORIA);
      return { ok: false, error: error.message, ...(fields ? { fields } : {}) };
    }
    return adminActionError("crearCategoria", error);
  }
}

const UpdateSchema = z.object({
  seoTitle: z.string().trim().max(200).nullish(),
  seoDescription: z.string().trim().max(500).nullish(),
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1, t("adminForm.nombreCategoria")).max(120),
  slug: z.string().trim().max(120).optional(),
  /**
   * Presentación de la categoría (O7). Los `.max()` son el largo exacto de las
   * columnas; `null` borra el campo y **ausente no lo toca**, que es lo que
   * necesita el formulario de hoy (S10 dibuja los campos).
   */
  description: z.string().trim().max(5000).nullish(),
  imageRef: z.string().trim().max(255).nullish(),
  imageAlt: z.string().trim().max(200).nullish(),
});

export async function editarCategoria(
  input: unknown
): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = parseEs(UpdateSchema, input);
    if (!parsed.success) {
      return {
        ok: false,
        error: t("adminForm.revisaCampos"),
        fields: zodFieldErrors(parsed.error),
      };
    }

    await updateCategory({
      seoTitle: parsed.data.seoTitle,
      seoDescription: parsed.data.seoDescription,
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      slug: parsed.data.slug || null,
      description: parsed.data.description,
      imageRef: parsed.data.imageRef,
      imageAlt: parsed.data.imageAlt,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    // Los errores de la categoría van al campo que los causa (F1).
    if (error instanceof AdminCategoryError) {
      const fields = fieldFor(error, CAMPOS_CATEGORIA);
      return { ok: false, error: error.message, ...(fields ? { fields } : {}) };
    }
    return adminActionError("editarCategoria", error);
  }
}

/**
 * La foto de una categoría, subida de verdad.
 *
 * Mismo camino que `uploadProductImage` (set preparado en el navegador,
 * verificado por los bytes, escrito en R2 con claves inmutables) y el destino
 * es la columna de la categoría, que se actualiza **después** de que los
 * objetos quedaron escritos. Owner-only como el resto de este archivo: la foto
 * de una categoría es la portada de una sección entera de la vidriera.
 *
 * La foto anterior **no** se borra de R2: la clave sale del contenido, así
 * que la misma foto puede estar en un producto o en otra categoría.
 */
export async function uploadCategoryImage(
  formData: FormData
): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const categoryId = Number(formData.get("categoryId"));
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return { ok: false, error: t("adminError.categoria.noExiste") };
    }

    const [categoria] = await getDb()
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!categoria) {
      return { ok: false, error: t("adminError.categoria.noExiste") };
    }

    const imageRef = await subirFotoDelPanel(formData, categoria.slug, "categoria");

    const altRaw = String(formData.get("alt") ?? "").trim();
    await setCategoryImage({
      categoryId,
      imageRef,
      // Ausente = no se toca el alt que ya había.
      imageAlt: formData.has("alt")
        ? altRaw === ""
          ? null
          : altRaw.slice(0, 200)
        : undefined,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError)
      return { ok: false, error: error.message };
    return adminActionError("uploadCategoryImage", error);
  }
}

const ActiveSchema = z.object({
  categoryId: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function cambiarEstadoCategoria(
  input: unknown
): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = ActiveSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: t("adminError.noEntendi.categoria") };

    await setCategoryActive({
      categoryId: parsed.data.categoryId,
      isActive: parsed.data.isActive,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError)
      return { ok: false, error: error.message };
    return adminActionError("cambiarEstadoCategoria", error);
  }
}

const MoveSchema = z.object({
  categoryId: z.number().int().positive(),
  direction: z.enum(["up", "down"]),
});

export async function moverCategoria(
  input: unknown
): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: t("adminError.noEntendi.mover") };

    await moveCategory({
      categoryId: parsed.data.categoryId,
      direction: parsed.data.direction,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError)
      return { ok: false, error: error.message };
    return adminActionError("moverCategoria", error);
  }
}
