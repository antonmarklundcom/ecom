"use server";

import { revalidatePath } from "next/cache";
import { revalidarVidriera } from "@/lib/revalidar-vidriera";
import { z } from "zod";

import { moderateReview, replyToReview, REVIEW_REPLY_MAX } from "@/domain/reviews";
import { adminActionError, requireStaffSession, type AdminActionResult } from "@/lib/admin-guard";
import { t } from "@/i18n";

/**
 * Moderación de reseñas (`/admin/resenas`). Owner y staff, como `productos`.
 *
 * Dos acciones y ninguna más: aprobar/rechazar y responder. **No hay acción
 * para crear ni para editar una reseña**, y no es un olvido — ver la regla del
 * encabezado de `src/domain/reviews.ts`.
 */

function revalidarResenas(): void {
  revalidatePath("/admin/resenas");
  // Una reseña publicada (o su respuesta) tiene que aparecer en la ficha y en
  // las estrellas de las tarjetas sin esperar al ISR.
  revalidarVidriera();
}

const ModerateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["approved", "rejected"]),
});

export async function moderarResena(input: unknown): Promise<AdminActionResult> {
  try {
    const actor = await requireStaffSession();

    const parsed = ModerateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.resena") };

    await moderateReview(parsed.data.id, parsed.data.status, { actorUserId: actor.userId });

    revalidarResenas();
    return { ok: true };
  } catch (error) {
    return adminActionError("moderarResena", error);
  }
}

const ReplySchema = z.object({
  id: z.number().int().positive(),
  reply: z.string().max(REVIEW_REPLY_MAX * 2).nullable(),
});

export async function responderResena(input: unknown): Promise<AdminActionResult> {
  try {
    const actor = await requireStaffSession();

    const parsed = ReplySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.resena") };

    await replyToReview(parsed.data.id, parsed.data.reply, { actorUserId: actor.userId });

    revalidarResenas();
    return { ok: true };
  } catch (error) {
    return adminActionError("responderResena", error);
  }
}
