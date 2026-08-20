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

/**
 * ABM de categorías (PLAN.md FASE 2, PR J).
 *
 * **Owner-only.** Una categoría apagada esconde todos sus productos de la
 * vidriera de un clic: es la acción más barata que tiene el panel para dejar
 * de vender sin querer. No es trabajo de mostrador.
 *
 * Como en el resto del panel, las reglas de verdad —slug libre, orden, "esta
 * categoría no existe"— viven en `src/domain/admin-categories.ts`, adentro de
 * la transacción. Acá arriba sólo se valida forma.
 */

/** Todas las pantallas que muestran el menú de categorías. */
function revalidarVidriera(): void {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
}

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre").max(120),
  slug: z.string().trim().max(120).optional(),
});

export async function crearCategoria(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  try {
    await requireOwnerSession();

    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    const id = await createCategory(parsed.data);

    revalidarVidriera();
    return { ok: true, id };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("crearCategoria", error);
  }
}

const EditSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(2, "Poné un nombre").max(120),
  slug: z.string().trim().max(120).optional(),
});

export async function editarCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = EditSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    await updateCategory(parsed.data.id, {
      name: parsed.data.name,
      slug: parsed.data.slug,
    });

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("editarCategoria", error);
  }
}

const ActiveSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function cambiarEstadoCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = ActiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "No entendí qué categoría cambiar." };

    await setCategoryActive(parsed.data.id, parsed.data.isActive);

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("cambiarEstadoCategoria", error);
  }
}

const MoveSchema = z.object({
  id: z.number().int().positive(),
  direction: z.enum(["arriba", "abajo"]),
});

export async function moverCategoria(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "No entendí hacia dónde moverla." };

    await moveCategory(parsed.data.id, parsed.data.direction);

    revalidarVidriera();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminCategoryError) return { ok: false, error: error.message };
    return adminActionError("moverCategoria", error);
  }
}
