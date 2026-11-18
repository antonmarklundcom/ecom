import { count } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TIENDA } from "@/config/tienda";
import { orders, products, stockReservations } from "@/db/schema";
import {
  VentasCerradasError,
  createOrder,
  type CreateOrderInput,
} from "@/domain/create-order";
import { saveStoreSettingsSection } from "@/domain/store-settings";
import { modoVentaDeFabrica } from "@/domain/modo-venta";
import { modoVentaEfectivo, tiendaTomaPedidos } from "@/lib/modo-venta";

import {
  closeTestDb,
  getTestDb,
  hasTestDb,
  resetTables,
  seedPaymentReadiness,
} from "../helpers/db";
import { createVariant, getOnHand } from "../helpers/factories";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Modo consulta contra la base (O32, fable/plan-trafico.md §2.1): el ajuste
 * se lee por `modoVentaEfectivo()` y, en consulta, el pedido se rechaza en el
 * dominio aunque el POST llegue armado a mano — sin reservar stock, sin
 * escribir un pedido y sin tocar el `sale_mode` de nadie.
 */
function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    items: [],
    customerName: "Rosa Giménez",
    customerPhone: "0981 123 456",
    docType: "NINGUNO",
    isConsumidorFinal: true,
    shipCity: "Asunción",
    shipAddress: "Av. Mcal. López 1234",
    paymentMethod: "transferencia",
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)("modo de venta", () => {
  beforeEach(async () => {
    await resetTables();
    await seedPaymentReadiness();
  });
  afterAll(closeTestDb);

  it("sin fila manda tienda.ts; el panel lo cambia y 'vacío' vuelve a tienda.ts", async () => {
    const deFabrica = modoVentaDeFabrica(TIENDA);
    expect(await modoVentaEfectivo()).toBe(deFabrica);
    expect(await modoVentaEfectivo(getTestDb())).toBe(deFabrica);

    await saveStoreSettingsSection("ventas", { modo: "consulta" }, { userId: null });
    expect(await modoVentaEfectivo(getTestDb())).toBe("consulta");
    expect(await tiendaTomaPedidos(getTestDb())).toBe(false);

    await saveStoreSettingsSection("ventas", { modo: "" }, { userId: null });
    expect(await modoVentaEfectivo(getTestDb())).toBe(deFabrica);
  });

  it("en consulta el pedido se rechaza entero: sin pedido, sin reserva, stock y sale_mode intactos", async () => {
    const db = getTestDb();
    const variantId = await createVariant({ onHand: 5, pricePyg: 100_000 });
    await saveStoreSettingsSection("ventas", { modo: "consulta" }, { userId: null });

    await expect(
      createOrder(input({ items: [{ variantId, qty: 1 }] }))
    ).rejects.toBeInstanceOf(VentasCerradasError);

    const [pedidos] = await db.select({ n: count() }).from(orders);
    const [reservas] = await db.select({ n: count() }).from(stockReservations);
    expect(Number(pedidos?.n)).toBe(0);
    expect(Number(reservas?.n)).toBe(0);
    expect(await getOnHand(variantId)).toBe(5);
    const modos = await db.select({ saleMode: products.saleMode }).from(products);
    expect(modos.every((fila) => fila.saleMode === "stock")).toBe(true);
  });

  it("de vuelta en carrito, el mismo pedido se crea", async () => {
    const variantId = await createVariant({ onHand: 5, pricePyg: 100_000 });
    await saveStoreSettingsSection("ventas", { modo: "consulta" }, { userId: null });
    await saveStoreSettingsSection("ventas", { modo: "carrito" }, { userId: null });

    const order = await createOrder(input({ items: [{ variantId, qty: 1 }] }));
    expect(order.orderNumber).toMatch(/^PY-/);
  });
});
