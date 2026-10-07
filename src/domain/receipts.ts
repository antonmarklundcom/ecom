import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { MessageKey, Params } from "@/i18n";

import { DomainError } from "./errors";

import { getDb } from "@/db";
import {
  orders,
  receipts,
  stockReservations,
  type OrderStatus,
} from "@/db/schema";
import { withLockRetry } from "@/db/retry";
import { RECEIPT_REVIEW } from "@/config/receipt-review";

import { transitionOrder } from "./orders";

import type { Executor } from "./executor";
import { RECEIPT_MAX_BYTES } from "@/lib/upload-limits";

/**
 * Comprobantes de transferencia (PLAN.md 3.5).
 *
 * La validación vive acá y no en el componente: el formulario se puede
 * saltear con un `fetch`, así que el límite real es este.
 */

// El límite vive en `@/lib/upload-limits`: `next.config.ts` lo necesita para
// dejar pasar el body de la server action.
export { RECEIPT_MAX_BYTES } from "@/lib/upload-limits";
export const RECEIPT_MAX_PER_ORDER = 3;
export const RECEIPT_ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;

/** Firmas de archivo: el `type` que manda el navegador es sólo una sugerencia. */
const MAGIC_NUMBERS: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

export class ReceiptError extends DomainError {
  constructor(code: MessageKey, params?: Params) {
    super(code, params);
    this.name = "ReceiptError";
  }
}

/** Detecta el tipo real por los primeros bytes. `null` si no reconoce ninguno. */
export function sniffMime(buffer: Buffer | Uint8Array): string | null {
  for (const candidate of MAGIC_NUMBERS) {
    const matches = candidate.bytes.every((byte, index) => buffer[index] === byte);
    if (matches) return candidate.mime;
  }
  return null;
}

export function validateReceipt(input: {
  declaredMime: string;
  bytes: number;
  content: Buffer | Uint8Array;
}): { mime: string } {
  if (input.bytes <= 0) {
    throw new ReceiptError("error.comprobante.vacio");
  }
  if (input.bytes > RECEIPT_MAX_BYTES) {
    throw new ReceiptError("error.comprobante.pesado");
  }

  const sniffed = sniffMime(input.content);
  if (!sniffed) {
    throw new ReceiptError("error.comprobante.formato");
  }
  // Si el navegador declaró otra cosa, mandan los bytes.
  if (!(RECEIPT_ALLOWED_MIME as readonly string[]).includes(sniffed)) {
    throw new ReceiptError("error.comprobante.formato");
  }

  return { mime: sniffed };
}

export async function countReceipts(orderId: number, executor?: Executor): Promise<number> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select({ id: receipts.id })
    .from(receipts)
    .where(eq(receipts.orderId, orderId));
  return rows.length;
}

export async function assertCanUpload(orderId: number, executor?: Executor): Promise<void> {
  const already = await countReceipts(orderId, executor);
  if (already >= RECEIPT_MAX_PER_ORDER) {
    throw new ReceiptError("error.comprobante.demasiados", {
      maximo: RECEIPT_MAX_PER_ORDER,
    });
  }
}

export async function recordReceipt(
  input: { orderId: number; cloudinaryId: string; mime: string; bytes: number },
  executor?: Executor
): Promise<void> {
  const tx = executor ?? getDb();
  await tx.insert(receipts).values({
    orderId: input.orderId,
    cloudinaryId: input.cloudinaryId,
    mime: input.mime,
    bytes: input.bytes,
    review: "pending",
  });
}

export async function listReceipts(orderId: number, executor?: Executor) {
  const tx = executor ?? getDb();
  return tx.select().from(receipts).where(eq(receipts.orderId, orderId));
}

export async function pendingReceipts(executor?: Executor) {
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.review, "pending")));
}

/**
 * Registra un comprobante **ya subido** y mueve el pedido, todo bajo el lock
 * del pedido (docs/TEMPLATE-IMPROVEMENT-PLAN.md D4).
 *
 * La acción mira estado y cupo antes de subir (es lo barato, y evita subir de
 * más), pero la subida tarda: entre ese vistazo y el final, otra pestaña pudo
 * subir el tercero, o el dueño pudo cancelar o cobrar el pedido. Por eso acá
 * se vuelve a decidir todo con los locks tomados, en este orden —el mismo de
 * `reviewReceipt`, `transitionOrder` y el cron—: **pedido → comprobantes →
 * reservas**. Si algo no da, no queda nada escrito y quien llama borra el
 * archivo que subió.
 *
 * Además sostiene la reserva de stock durante la revisión (D5): hasta el
 * primer comprobante + `RECEIPT_REVIEW.holdHours`, sin renovarla con cada
 * subida y sin revivir una reserva que ya venció (eso lo decide la
 * aprobación, que vuelve a pedir stock si hace falta).
 */
export async function finalizeUploadedReceipt(input: {
  orderId: number;
  cloudinaryId: string;
  mime: string;
  bytes: number;
}): Promise<void> {
  await withLockRetry(() =>
    getDb().transaction(async (tx) => {
      const order = (
        await tx
          .select({ status: orders.status, paymentMethod: orders.paymentMethod })
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update")
      )[0];
      if (!order) throw new ReceiptError("error.comprobante.pedidoNoEncontrado");
      if (order.paymentMethod !== "transferencia") {
        throw new ReceiptError("error.comprobante.noEsTransferencia");
      }
      if (!ACCEPTS_RECEIPT.includes(order.status)) {
        throw new ReceiptError("error.comprobante.noEsperaComprobante");
      }

      const existing = await tx
        .select({ id: receipts.id })
        .from(receipts)
        .where(eq(receipts.orderId, input.orderId))
        .for("update");
      if (existing.length >= RECEIPT_MAX_PER_ORDER) {
        throw new ReceiptError("error.comprobante.demasiados", {
          maximo: RECEIPT_MAX_PER_ORDER,
        });
      }

      await recordReceipt(input, tx);
      // Si ya estaba esperando verificación (segundo comprobante),
      // transitionOrder lo trata como no-op.
      await transitionOrder(
        input.orderId,
        "esperando_verificacion",
        "buyer",
        "comprobante subido",
        { executor: tx }
      );
      await holdStockForReview(tx, input.orderId);
    })
  );
}

/** Los estados en que un pedido por transferencia espera (otro) comprobante. */
export const ACCEPTS_RECEIPT: readonly OrderStatus[] = [
  "pendiente_pago",
  "rechazado",
  "esperando_verificacion",
];

/**
 * Lleva las reservas **vivas** del pedido hasta el primer comprobante + la
 * ventana de revisión. Nunca las acorta, nunca revive una vencida.
 */
async function holdStockForReview(tx: Executor, orderId: number): Promise<void> {
  const first = (
    await tx
      .select({ at: sql<Date>`MIN(${receipts.uploadedAt})` })
      .from(receipts)
      .where(eq(receipts.orderId, orderId))
  )[0]?.at;
  if (!first) return;
  const until = new Date(
    new Date(first).getTime() + RECEIPT_REVIEW.holdHours * 3_600_000
  );
  const now = new Date();
  await tx
    .update(stockReservations)
    .set({ expiresAt: until })
    .where(
      and(
        eq(stockReservations.orderId, orderId),
        eq(stockReservations.state, "held"),
        gt(stockReservations.expiresAt, now),
        lt(stockReservations.expiresAt, until)
      )
    );
}
