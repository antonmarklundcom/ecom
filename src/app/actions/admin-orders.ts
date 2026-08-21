"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ORDER_STATUSES } from "@/db/schema";
import { transitionOrder } from "@/domain/orders";
import { receiptPreview, reviewReceipt } from "@/domain/receipt-review";
import {
  actorLabel,
  adminActionError,
  assertCanTransitionTo,
  requireAdminSession,
  requireStaffSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
import { t } from "@/i18n";

/**
 * Acciones del panel sobre un pedido (PLAN.md 4.4 y 4.5).
 *
 * Dos reglas que valen para todo este archivo:
 *
 * 1. **Cada acción vuelve a chequear el rol.** Una server action es un
 *    endpoint HTTP con su propio id; se la puede llamar con un `fetch` sin
 *    pasar por ninguna ruta `/admin`, así que el middleware no la cubre.
 * 2. **Ningún `UPDATE orders SET status` acá adentro.** El estado sólo lo
 *    mueve `transitionOrder`, que valida la arista, descuenta stock una sola
 *    vez y escribe `order_events`. Hay un test que grepea el repo entero para
 *    que esto siga siendo cierto.
 */

const AdvanceSchema = z.object({
  orderId: z.number().int().positive(),
  to: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export async function advanceOrder(input: unknown): Promise<AdminActionResult> {
  try {
    const actor = await requireAdminSession();

    const parsed = AdvanceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: t("adminError.noEntendi.pedido") };
    }

    // El destino es lo que decide el permiso: los tres roles usan esta misma
    // acción, y el vendedor sólo puede despachar (ARCH.md §1).
    assertCanTransitionTo(actor, parsed.data.to);

    await transitionOrder(
      parsed.data.orderId,
      parsed.data.to,
      actorLabel(actor),
      parsed.data.reason || null,
      // El string `admin:email` es la verdad histórica; el id es lo que hace
      // consultable "qué hizo esta persona" (PR D).
      { actorUserId: actor.userId },
    );

    revalidatePath(`/admin/pedidos/${parsed.data.orderId}`);
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return adminActionError("advanceOrder", error);
  }
}

const ReviewSchema = z.object({
  receiptId: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

/** Aprobar / rechazar un comprobante. El estado lo mueve `reviewReceipt`. */
export async function decideReceipt(input: unknown): Promise<AdminActionResult> {
  try {
    const actor = await requireStaffSession();

    const parsed = ReviewSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: t("adminError.noEntendi.comprobante") };
    }

    const result = await reviewReceipt({
      receiptId: parsed.data.receiptId,
      decision: parsed.data.decision,
      note: parsed.data.note ?? null,
      reviewerId: actor.userId,
      actor: actorLabel(actor),
    });

    revalidatePath(`/admin/pedidos/${result.orderId}`);
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return adminActionError("decideReceipt", error);
  }
}

const PreviewSchema = z.object({ receiptId: z.number().int().positive() });

/**
 * Devuelve una URL firmada y de vida corta para ver el comprobante.
 *
 * Se pide en el momento en que el dueño toca "Ver comprobante" y no al
 * renderizar la página: una URL firmada embebida en el HTML sobrevive en el
 * historial, en la caché del navegador y en cualquier captura de pantalla del
 * listado. Dos minutos alcanzan para mirarla y no para repartirla.
 */
export async function previewReceipt(
  input: unknown,
): Promise<AdminActionResult<{ url: string; mime: string }>> {
  try {
    await requireStaffSession();

    const parsed = PreviewSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: t("adminError.comprobanteInvalido") };
    }

    const preview = await receiptPreview(parsed.data.receiptId);
    return { ok: true, url: preview.url, mime: preview.mime };
  } catch (error) {
    return adminActionError("previewReceipt", error);
  }
}
