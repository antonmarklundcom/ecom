import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { orders, type OrderStatus } from "@/db/schema";
import { listOrdersToRecover } from "@/domain/admin-orders";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createOrder as makeOrder } from "../helpers/factories";

/**
 * "Por cobrar" — la lista de recuperación del panel.
 *
 * Junta `pendiente_pago` y `vencido` porque para el dueño son el mismo
 * trabajo, y los ordena del más viejo al más nuevo: el más viejo es el que
 * está más cerca de perderse.
 */

async function ageOrder(orderId: number, days: number): Promise<void> {
  const when = new Date(Date.now() - days * 86_400_000);
  await getTestDb().update(orders).set({ createdAt: when }).where(eq(orders.id, orderId));
}

describe.skipIf(!hasTestDb)("listOrdersToRecover", () => {
  beforeEach(async () => {
    await resetTables();
  });
  afterAll(closeTestDb);

  it("trae sólo los pedidos que se pueden recuperar", async () => {
    const incluidos: OrderStatus[] = ["pendiente_pago", "vencido"];
    const excluidos: OrderStatus[] = [
      "pagado",
      "esperando_verificacion",
      "cancelado",
      "entregado",
      "reembolsado",
    ];

    for (const status of [...incluidos, ...excluidos]) {
      await makeOrder({ status });
    }

    const rows = await listOrdersToRecover();
    expect(rows.map((row) => row.status).sort()).toEqual([...incluidos].sort());
  });

  it("ordena por antigüedad, el más viejo primero", async () => {
    const nuevo = await makeOrder({ status: "pendiente_pago" });
    const viejo = await makeOrder({ status: "vencido" });
    const medio = await makeOrder({ status: "pendiente_pago" });

    await ageOrder(viejo, 9);
    await ageOrder(medio, 3);

    const rows = await listOrdersToRecover();
    expect(rows.map((row) => row.id)).toEqual([viejo, medio, nuevo]);
    expect(rows[0]?.ageDays).toBe(9);
    expect(rows[2]?.ageDays).toBe(0);
  });

  it("trae el token: sin él la fila no puede armar el link del pedido", async () => {
    const orderId = await makeOrder({ status: "pendiente_pago" });

    const [row] = await listOrdersToRecover();
    expect(row?.id).toBe(orderId);
    expect(row?.accessToken).toHaveLength(64);
  });

  it("es sólo lectura: no crea ni modifica reservas", async () => {
    const orderId = await makeOrder({ status: "vencido" });
    const antes = await getTestDb().select().from(orders).where(eq(orders.id, orderId));

    await listOrdersToRecover();

    const despues = await getTestDb().select().from(orders).where(eq(orders.id, orderId));
    // La reserva vence sola (ARCH.md §2): "empujar" un pedido no puede
    // bloquearle la unidad al resto de los compradores.
    expect(despues[0]?.reservedUntil).toEqual(antes[0]?.reservedUntil);
    expect(despues[0]?.status).toBe("vencido");
  });
});
