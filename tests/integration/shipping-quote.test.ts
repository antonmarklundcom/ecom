import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { orders, shippingZones, stockReservations, variants } from "@/db/schema";
import { createOrder } from "@/domain/create-order";
import { computeOrderTotals } from "@/domain/order-totals";
import { getAvailability } from "@/domain/stock";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createVariant, getOnHand } from "../helpers/factories";

/**
 * Cotización de envío antes de crear el pedido.
 *
 * Lo que hay que probar no es que la cuenta dé bien —eso ya lo prueban los
 * tests de `createOrder`— sino las dos propiedades que hacen que la
 * cotización no sea una segunda fuente de verdad:
 *
 * 1. Cotizar **no escribe nada**: ni pedido, ni reserva, ni stock movido.
 * 2. Lo cotizado y lo cobrado **coinciden hasta el guaraní**, porque salen de
 *    la misma función. El test compara los dos números, que es la forma de
 *    que la próxima persona que meta un descuento en un solo lado se entere.
 */

describe.skipIf(!hasTestDb)("cotización de envío", () => {
  beforeEach(async () => {
    await resetTables();
    await getTestDb()
      .insert(shippingZones)
      .values([
        {
          slug: "asuncion",
          name: "Asunción",
          cities: ["Asunción", "Fernando de la Mora"],
          pricePyg: 25_000,
          freeThresholdPyg: 500_000,
          position: 1,
        },
        {
          slug: "interior",
          name: "Interior",
          cities: ["Encarnación"],
          pricePyg: 60_000,
          freeThresholdPyg: null,
          position: 2,
        },
      ]);
  });
  afterAll(closeTestDb);

  it("no crea el pedido ni toca el stock", async () => {
    const db = getTestDb();
    const variantId = await createVariant({ onHand: 4, pricePyg: 110_000 });

    const quote = await computeOrderTotals([{ variantId, qty: 2 }], "Asunción");

    expect(quote.totalPyg).toBe(245_000);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await db.select().from(stockReservations)).toHaveLength(0);
    expect(await getOnHand(variantId)).toBe(4);
    // Lo importante: la unidad sigue disponible para todo el mundo. Una
    // cotización que reservara sería una forma silenciosa de agotar la
    // vidriera.
    expect(await getAvailability(variantId)).toBe(4);
  });

  it("lo cotizado es exactamente lo que después se cobra", async () => {
    const variantId = await createVariant({ onHand: 4, pricePyg: 110_000 });
    const items = [{ variantId, qty: 2 }];

    const quote = await computeOrderTotals(items, "Asunción");
    const order = await createOrder({
      items,
      customerName: "Rosa Giménez",
      customerPhone: "0981 123 456",
      docType: "NINGUNO",
      isConsumidorFinal: true,
      shipCity: "Asunción",
      shipAddress: "Av. Mcal. López 1234",
      paymentMethod: "transferencia",
    });

    expect(order.subtotalPyg).toBe(quote.subtotalPyg);
    expect(order.shippingPyg).toBe(quote.shippingPyg);
    expect(order.totalPyg).toBe(quote.totalPyg);
    expect(order.iva10Pyg).toBe(quote.iva10Pyg);
    expect(order.iva5Pyg).toBe(quote.iva5Pyg);

    const [row] = await getTestDb().select().from(orders).where(eq(orders.id, order.orderId));
    expect(row?.totalPyg).toBe(quote.totalPyg);
  });

  it("manda el pedido, no la cotización: si el precio cambia en el medio, se cobra el nuevo", async () => {
    const variantId = await createVariant({ onHand: 4, pricePyg: 110_000 });
    const items = [{ variantId, qty: 1 }];

    const quote = await computeOrderTotals(items, "Asunción");
    expect(quote.totalPyg).toBe(135_000);

    // El comercio sube el precio mientras la compradora completa el formulario.
    await getTestDb()
      .update(variants)
      .set({ pricePyg: 150_000 })
      .where(eq(variants.id, variantId));

    const order = await createOrder({
      items,
      customerName: "Rosa Giménez",
      customerPhone: "0981 123 456",
      docType: "NINGUNO",
      isConsumidorFinal: true,
      shipCity: "Asunción",
      shipAddress: "Av. Mcal. López 1234",
      paymentMethod: "transferencia",
    });

    // La cotización no viaja de vuelta ni se compara con nada: el pedido se
    // arma con lo que dice la DB en ese momento (ARCH.md §1 regla 1).
    expect(order.totalPyg).toBe(175_000);
  });

  it("una tienda sin zonas configuradas no cobra envío, y no lo confunde con la tarifa más cara", async () => {
    // Es el estado en el que sale toda tienda recién clonada del template.
    // `sin_zonas` existe para que el checkout no diga "Gratis" y "te cobramos
    // la tarifa más alta" en la misma pantalla.
    await getTestDb().delete(shippingZones);
    const variantId = await createVariant({ onHand: 4, pricePyg: 100_000 });

    const quote = await computeOrderTotals([{ variantId, qty: 1 }], "Asunción");

    expect(quote.shipping.match).toBe("sin_zonas");
    expect(quote.shippingPyg).toBe(0);
    expect(quote.totalPyg).toBe(100_000);
  });

  it("una ciudad que no está en ninguna zona cotiza la tarifa más cara, y lo dice", async () => {
    const variantId = await createVariant({ onHand: 4, pricePyg: 100_000 });

    const quote = await computeOrderTotals([{ variantId, qty: 1 }], "Pedro Juan Caballero");

    expect(quote.shipping.match).toBe("mas_cara");
    expect(quote.shippingPyg).toBe(60_000);
  });

  it("pasado el umbral de la zona, el envío cotiza gratis", async () => {
    const variantId = await createVariant({ onHand: 10, pricePyg: 250_000 });

    const quote = await computeOrderTotals([{ variantId, qty: 2 }], "Asunción");

    expect(quote.shipping.isFree).toBe(true);
    expect(quote.shippingPyg).toBe(0);
    expect(quote.totalPyg).toBe(500_000);
  });
});
