"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { refundPayment, retryOrderRevival } from "@/domain/payment-recovery";
import {
  actorLabel,
  adminActionError,
  requireAdminSession,
  type AdminActionResult,
} from "@/lib/admin-guard";

/**
 * Las dos acciones sobre "Pagos sin pedido vivo" (ARCH.md §4.1).
 *
 * Valen las mismas dos reglas que en `admin-orders.ts`: cada acción re-chequea
 * el rol —una server action es un endpoint HTTP con su propio id, alcanzable
 * con un `fetch` que nunca pasó por `/admin`— y ningún `UPDATE orders SET
 * status` vive acá: el estado lo mueve `transitionOrder`, adentro del dominio.
 *
 * Lo que llega del formulario es un id y nada más. El estado se relee del lado
 * del servidor con el candado tomado (ver `payment-recovery.ts`): la pantalla
 * desde la que se hizo click puede tener minutos de viejo.
 */

const PaymentSchema = z.object({ paymentId: z.number().int().positive() });

/** Refresca las tres vistas que muestran esta plata. */
function revalidatePayment(orderId: number): void {
  revalidatePath("/admin");
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}

export async function retryPaymentRevival(
  input: unknown,
): Promise<AdminActionResult<{ orderNumber: string; changed: boolean }>> {
  try {
    const actor = await requireAdminSession();

    const parsed = PaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "No entendí de qué pago se trata." };
    }

    const result = await retryOrderRevival({
      paymentId: parsed.data.paymentId,
      actor: actorLabel(actor),
    });

    revalidatePayment(result.orderId);
    return { ok: true, orderNumber: result.orderNumber, changed: result.changed };
  } catch (error) {
    return adminActionError("retryPaymentRevival", error);
  }
}

const RefundSchema = PaymentSchema.extend({ reason: z.string().trim().max(500) });

export async function markPaymentRefunded(
  input: unknown,
): Promise<AdminActionResult<{ orderNumber: string; changed: boolean }>> {
  try {
    const actor = await requireAdminSession();

    const parsed = RefundSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Faltan datos para registrar la devolución." };
    }

    const result = await refundPayment({
      paymentId: parsed.data.paymentId,
      reason: parsed.data.reason,
      actor: actorLabel(actor),
    });

    revalidatePayment(result.orderId);
    return { ok: true, orderNumber: result.orderNumber, changed: result.changed };
  } catch (error) {
    return adminActionError("markPaymentRefunded", error);
  }
}
