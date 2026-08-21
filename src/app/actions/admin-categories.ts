"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminCategoryError,
  createCategory,
  moveCategory,
  setCategoryActive,
  updateCategory,
} from "@/domain/admin-categories";
import {
  adminActionError,
  requireOwnerSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
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
  name: z.string().trim().min(1, t("adminForm.nombreCategoria")).max(120),
  slug: z.string().trim().max(120).optional(),
});

export async function crearCategoria(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  try {
    await requireOwnerSession();

    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t("adminError.revisaDatos") };
    }

    const created = await createCategory({
      name: parsed.data.name,
      slug: parsed.data.slug || null,
    });

    revalidarVidriera();
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("crearCategoria", error);
  }
}

const UpdateSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1, t("adminForm.nombreCategoria")).max(120),
  slug: z.string().trim().max(120).optional(),
});

export async function editarCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t("adminError.revisaDatos") };
    }

    await updateCategory({
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      slug: parsed.data.slug || null,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("editarCategoria", error);
  }
}

const ActiveSchema = z.object({
  categoryId: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function cambiarEstadoCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = ActiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.categoria") };

    await setCategoryActive({
      categoryId: parsed.data.categoryId,
      isActive: parsed.data.isActive,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("cambiarEstadoCategoria", error);
  }
}

const MoveSchema = z.object({
  categoryId: z.number().int().positive(),
  direction: z.enum(["up", "down"]),
});

export async function moverCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.mover") };

    await moveCategory({
      categoryId: parsed.data.categoryId,
      direction: parsed.data.direction,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("moverCategoria", error);
  }
}
