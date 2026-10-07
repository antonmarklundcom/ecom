import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { receipts, stockReservations, users } from "@/db/schema";
import { transitionOrder } from "@/domain/orders";
import { reviewReceipt } from "@/domain/receipt-review";
import {
  RECEIPT_MAX_PER_ORDER,
  finalizeUploadedReceipt,
} from "@/domain/receipts";
import { getAvailability, reserveStock } from "@/domain/stock";
import { RECEIPT_REVIEW } from "@/config/receipt-review";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createOrder, createVariant, getStatus } from "../helpers/factories";

/**
 * El comprobante se registra **adentro del lock del pedido**
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md D4, D5).
 *
 * Antes, la acción miraba el estado y el cupo de comprobantes sin lock,
 * subía el archivo (lento), lo registraba en autocommit y movía el pedido en
 * otra transacción: dos subidas en paralelo pasaban el cupo, y una que
 * terminaba después de que el dueño cancelara o cobrara dejaba un
 * comprobante pendiente colgado de un pedido cerrado. Y la reserva de stock
 * vencía mientras el comprobante esperaba revisión.
 */
function subida(orderId: number) {
  return {
    orderId,
    cloudinaryId: `comprobantes/${randomBytes(6).toString("hex")}`,
    mime: "image/jpeg",
    bytes: 12_345,
  };
}

async function receiptCount(orderId: number): Promise<number> {
  return (
    await getTestDb()
      .select()
      .from(receipts)
      .where(eq(receipts.orderId, orderId))
  ).length;
}

async function holdUntil(orderId: number): Promise<Date> {
  const row = (
    await getTestDb()
      .select({ expiresAt: stockReservations.expiresAt })
      .from(stockReservations)
      .where(eq(stockReservations.orderId, orderId))
  )[0];
  if (!row) throw new Error("sin reserva");
  return row.expiresAt;
}

describe.skipIf(!hasTestDb)("finalizar un comprobante subido", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it("registra el comprobante y mueve el pedido en la misma transacción", async () => {
    const orderId = await createOrder();

    await finalizeUploadedReceipt(subida(orderId));

    expect(await getStatus(orderId)).toBe("esperando_verificacion");
    expect(await receiptCount(orderId)).toBe(1);
  });

  it("dos subidas en paralelo no pasan el cupo", async () => {
    const orderId = await createOrder();
    for (let i = 0; i < RECEIPT_MAX_PER_ORDER - 1; i += 1) {
      await finalizeUploadedReceipt(subida(orderId));
    }

    const resultados = await Promise.allSettled([
      finalizeUploadedReceipt(subida(orderId)),
      finalizeUploadedReceipt(subida(orderId)),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "error.comprobante.demasiados" },
    });
    expect(await receiptCount(orderId)).toBe(RECEIPT_MAX_PER_ORDER);
  });

  it.each(["cancelado", "pagado"] as const)(
    "un pedido que pasó a %s mientras se subía no recibe el comprobante",
    async (estado) => {
      const orderId = await createOrder();
      // El dueño lo movió (por la máquina de estados) mientras la compradora
      // subía el archivo.
      await transitionOrder(orderId, estado, "admin:test", "fuera de banda");

      await expect(
        finalizeUploadedReceipt(subida(orderId))
      ).rejects.toMatchObject({
        code: "error.comprobante.noEsperaComprobante",
      });
      expect(await receiptCount(orderId)).toBe(0);
      expect(await getStatus(orderId)).toBe(estado);
    }
  );

  it("un pedido que no es por transferencia no recibe comprobantes", async () => {
    const orderId = await createOrder({ paymentMethod: "contra_entrega" });
    await expect(
      finalizeUploadedReceipt(subida(orderId))
    ).rejects.toMatchObject({
      code: "error.comprobante.noEsTransferencia",
    });
  });

  describe("la reserva mientras se revisa (D5)", () => {
    it("se extiende hasta el primer comprobante + la ventana de revisión, y no más", async () => {
      const variantId = await createVariant({ onHand: 1 });
      const orderId = await createOrder();
      const casiVencida = new Date(Date.now() + 60_000);
      await reserveStock(orderId, [{ variantId, qty: 1 }], {
        expiresAt: casiVencida,
      });

      const primera = new Date();
      await finalizeUploadedReceipt(subida(orderId));
      const ventana = RECEIPT_REVIEW.holdHours * 3_600_000;
      const tope = (await holdUntil(orderId)).getTime();
      expect(tope).toBeGreaterThanOrEqual(primera.getTime() + ventana - 5_000);
      expect(tope).toBeLessThanOrEqual(Date.now() + ventana + 5_000);

      // Otra subida no corre la ventana: el ancla es el primer comprobante.
      await getTestDb()
        .update(receipts)
        .set({ uploadedAt: new Date(Date.now() - 10 * 3_600_000) })
        .where(eq(receipts.orderId, orderId));
      await finalizeUploadedReceipt(subida(orderId));
      expect((await holdUntil(orderId)).getTime()).toBe(tope);

      // Y mientras se revisa, nadie más se lleva la unidad.
      expect(await getAvailability(variantId)).toBe(0);
    });

    it("una reserva que ya venció no se revive sin mirar el stock", async () => {
      const variantId = await createVariant({ onHand: 1 });
      const orderId = await createOrder();
      const vencida = new Date(Date.now() - 60_000);
      await reserveStock(orderId, [{ variantId, qty: 1 }], {
        expiresAt: new Date(Date.now() + 60_000),
      });
      await getTestDb()
        .update(stockReservations)
        .set({ expiresAt: vencida })
        .where(eq(stockReservations.orderId, orderId));

      await finalizeUploadedReceipt(subida(orderId));

      // Sigue vencida, con la misma fecha. La columna guarda segundos y cada
      // motor redondea distinto (MySQL redondea, MariaDB trunca): se compara
      // con margen de un segundo.
      const sigue = (await holdUntil(orderId)).getTime();
      expect(sigue).toBeLessThan(Date.now());
      expect(Math.abs(sigue - vencida.getTime())).toBeLessThanOrEqual(1_000);
    });
  });

  it("revisar y finalizar a la vez sobre el mismo pedido no se traban (mismo orden de locks)", async () => {
    const orderId = await createOrder();
    await finalizeUploadedReceipt(subida(orderId));
    const receiptId = (
      await getTestDb()
        .select()
        .from(receipts)
        .where(eq(receipts.orderId, orderId))
    )[0]!.id;
    const email = `duena-${randomBytes(4).toString("hex")}@tienda.py`;
    await getTestDb()
      .insert(users)
      .values({ email, passwordHash: "x", name: "Dueña", role: "owner" });
    const reviewerId = (
      await getTestDb().select().from(users).where(eq(users.email, email))
    )[0]!.id;

    const resultados = await Promise.allSettled([
      reviewReceipt({
        receiptId,
        decision: "rejected",
        note: "No se lee el monto",
        reviewerId,
        actor: "admin:duena",
      }),
      finalizeUploadedReceipt(subida(orderId)),
    ]);

    // Sin deadlock: las dos terminan (en el orden que sea) o una rechaza con
    // un error de dominio, nunca con ER_LOCK_DEADLOCK.
    for (const r of resultados) {
      if (r.status === "rejected") {
        expect(String((r.reason as Error).message)).not.toMatch(/deadlock/i);
      }
    }
    expect(["rechazado", "esperando_verificacion"]).toContain(
      await getStatus(orderId)
    );
  });

  it("transitionOrder sigue rechazando un comprobante sobre un pedido cerrado", async () => {
    // Guarda de regresión: la verificación nueva no reemplaza la de la
    // máquina de estados.
    const orderId = await createOrder({ status: "cancelado" });
    await expect(
      transitionOrder(orderId, "esperando_verificacion", "buyer")
    ).rejects.toThrow();
  });
});
