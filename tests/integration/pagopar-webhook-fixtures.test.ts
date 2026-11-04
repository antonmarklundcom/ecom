import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  orderEvents,
  orderItems,
  orders,
  paymentEvents,
  payments,
  type OrderStatus,
} from "../../src/db/schema";
import { reserveStock } from "../../src/domain/stock";
import { resetRateLimits } from "../../src/lib/rate-limit";
import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createVariant, getOnHand, getStatus } from "../helpers/factories";
import {
  FIXTURE_HASH,
  FIXTURE_TOTAL_PYG,
  fixtureRequest,
  loadPagoparFixtures,
} from "../helpers/pagopar-fixtures";

/**
 * Los avisos grabados de `tests/fixtures/pagopar/` contra la ruta real y
 * MySQL: código HTTP de cada entrega, estado final del pedido, filas de
 * `payment_events`, stock y la fila de auditoría de la transición.
 *
 * Complementa a `pagopar-webhook.test.ts` (los escenarios uno por uno) con
 * todas las formas raras del cable: si una variante del sobre cobra, cobra
 * exactamente igual que la canónica; si no se puede leer, no toca nada.
 */

const PRIVATE_KEY = "clave-privada-de-mentira-para-los-avisos-grabados";
const QTY = 2;
const ON_HAND = 10;

describe.skipIf(!hasTestDb)("avisos grabados de Pagopar contra la ruta real", () => {
  beforeEach(async () => {
    await resetTables();
    resetRateLimits();
    vi.stubEnv("PAGOPAR_PRIVATE_KEY", PRIVATE_KEY);
    vi.stubEnv("PAGOPAR_MODE", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function seed(status: OrderStatus): Promise<{
    orderId: number;
    orderNumber: string;
    variantId: number;
  }> {
    const db = getTestDb();
    const variantId = await createVariant({ onHand: ON_HAND, pricePyg: FIXTURE_TOTAL_PYG / QTY });
    const orderNumber = `PY-F${randomBytes(4).toString("hex").toUpperCase()}`;

    await db.insert(orders).values({
      orderNumber,
      accessToken: randomBytes(32).toString("hex"),
      status,
      customerName: "Ana López",
      customerPhone: "+595981123456",
      shipCity: "Asunción",
      shipAddress: "Av. Mcal. López 1234",
      paymentMethod: "tarjeta",
      subtotalPyg: FIXTURE_TOTAL_PYG,
      totalPyg: FIXTURE_TOTAL_PYG,
      reservedUntil: new Date(Date.now() + 45 * 60_000),
    });
    const orderId = (
      await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orderNumber))
    )[0]?.id;
    if (!orderId) throw new Error("no pude crear el pedido");

    await db.insert(orderItems).values({
      orderId,
      variantId,
      nameSnapshot: "Yerba — Único",
      skuSnapshot: `SKU-${orderNumber}`,
      unitPricePyg: FIXTURE_TOTAL_PYG / QTY,
      qty: QTY,
      ivaRate: 10,
      lineTotalPyg: FIXTURE_TOTAL_PYG,
    });
    await reserveStock(orderId, [{ variantId, qty: QTY }], {
      expiresAt: new Date(Date.now() + 45 * 60_000),
    });
    await db.insert(payments).values({
      orderId,
      provider: "pagopar",
      providerRef: FIXTURE_HASH,
      amountPyg: FIXTURE_TOTAL_PYG,
      status: status === "pagado" ? "paid" : "pending",
    });

    return { orderId, orderNumber, variantId };
  }

  for (const fixture of loadPagoparFixtures()) {
    const { ruta } = fixture.esperado;

    it(`${fixture.nombre} → ${ruta.status}${ruta.pedido ? `, pedido ${ruta.pedido}` : ""}`, async () => {
      const seeded = fixture.sembrar ? await seed(fixture.estadoInicial) : null;
      const { POST } = await import("../../src/app/api/webhooks/pagopar/route");

      for (let i = 0; i < fixture.entregas; i++) {
        const response = await POST(fixtureRequest(fixture, PRIVATE_KEY));
        expect(response.status, `entrega ${i + 1}`).toBe(ruta.status);
        expect(response.headers.get("content-type")).toContain("application/json");
      }

      const db = getTestDb();
      expect(await db.select().from(paymentEvents)).toHaveLength(ruta.eventos);

      if (!seeded) {
        expect(ruta.pedido).toBeNull();
        return;
      }

      expect(await getStatus(seeded.orderId)).toBe(ruta.pedido);

      const cobro = fixture.estadoInicial !== "pagado" && ruta.pedido === "pagado";
      const transiciones = await db
        .select()
        .from(orderEvents)
        .where(and(eq(orderEvents.orderId, seeded.orderId), eq(orderEvents.toStatus, "pagado")));
      // Cobra una sola vez aunque el aviso llegue N veces.
      expect(transiciones).toHaveLength(cobro ? 1 : 0);
      expect(await getOnHand(seeded.variantId)).toBe(cobro ? ON_HAND - QTY : ON_HAND);

      // Lo que se guarda nunca trae el token.
      for (const row of await db.select().from(paymentEvents)) {
        expect(JSON.stringify(row.payload)).not.toContain('"token"');
      }

      if (ruta.logError) {
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(seeded.orderNumber));
      }
    });
  }
});
