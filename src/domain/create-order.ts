import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  orderEvents,
  orderItems,
  orders,
  type DocType,
  type PaymentMethod,
} from "@/db/schema";
import { assertGs, ivaIncluded } from "@/lib/money";
import { normalizePhonePY, validateDoc } from "@/lib/py";

import { priceCart, type CartInput } from "./cart";
import { nextOrderNumber } from "./order-number";
import { SHIPPING_IVA_RATE, quoteShipping } from "./shipping";
import { RESERVATION_TTL_MINUTES, reserveStock } from "./stock";
import type { CartIssue } from "@/lib/cart-issues";

/**
 * Creación del pedido (PLAN.md 3.3).
 *
 * Todo pasa en UNA transacción: re-precia el carrito contra la DB, cotiza el
 * envío, saca el número de pedido del contador, inserta el pedido con sus
 * ítems y toma las reservas de stock. Si algo falla, no queda ni el número
 * consumido con un pedido a medias.
 *
 * El navegador no decide nada acá: manda variantes, cantidades y datos de
 * envío; los montos salen de la base.
 */

export type CreateOrderInput = {
  items: readonly CartInput[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  docType: DocType;
  docNumber?: string | null;
  isConsumidorFinal: boolean;
  shipCity: string;
  shipBarrio?: string | null;
  shipAddress: string;
  shipReference?: string | null;
  shipMapsUrl?: string | null;
  paymentMethod: PaymentMethod;
};

export type CreatedOrder = {
  orderId: number;
  orderNumber: string;
  accessToken: string;
  subtotalPyg: number;
  shippingPyg: number;
  totalPyg: number;
  iva10Pyg: number;
  iva5Pyg: number;
  reservedUntil: Date;
};

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly issues: CartIssue[] = []
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/** 32 bytes de aleatoriedad: el link de WhatsApp es la única llave del pedido. */
function mintAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const phone = normalizePhonePY(input.customerPhone);
  if (!phone) {
    throw new CheckoutError("El número de WhatsApp no parece paraguayo.");
  }

  const doc = validateDoc(input.docType, input.docNumber);
  if (!doc.ok) {
    throw new CheckoutError(
      input.docType === "RUC" ? `RUC inválido: ${doc.reason}` : `CI inválida: ${doc.reason}`
    );
  }

  if (input.items.length === 0) {
    throw new CheckoutError("El carrito está vacío.");
  }

  return getDb().transaction(async (tx) => {
    // 1. Re-precio: precio, IVA y stock salen de la DB.
    const cart = await priceCart(input.items, { executor: tx });

    const blocking = cart.issues.filter((issue) => issue.type !== "precio_cambio");
    if (cart.lines.length === 0 || blocking.length > 0) {
      throw new CheckoutError(
        "Algunos productos ya no están disponibles. Revisá tu carrito.",
        cart.issues
      );
    }

    // 2. Envío por zona, con umbral de envío gratis.
    const shipping = await quoteShipping(input.shipCity, cart.subtotalPyg, tx);

    const subtotalPyg = assertGs(cart.subtotalPyg, "subtotal_pyg");
    const shippingPyg = assertGs(shipping.shippingPyg, "shipping_pyg");
    const totalPyg = assertGs(subtotalPyg + shippingPyg, "total_pyg");
    // El flete también viene con IVA incluido (ver SHIPPING_IVA_RATE).
    const iva10Pyg = cart.iva10Pyg + ivaIncluded(shippingPyg, SHIPPING_IVA_RATE);
    const iva5Pyg = cart.iva5Pyg;

    // 3. Número de pedido del contador, adentro de la misma transacción.
    const orderNumber = await nextOrderNumber(tx);
    const accessToken = mintAccessToken();
    const reservedUntil = new Date(
      Date.now() + RESERVATION_TTL_MINUTES[input.paymentMethod] * 60_000
    );

    await tx.insert(orders).values({
      orderNumber,
      accessToken,
      status: "pendiente_pago",
      customerName: input.customerName.trim(),
      customerPhone: phone,
      customerEmail: input.customerEmail?.trim() || null,
      docType: input.docType,
      docNumber: doc.normalized ?? null,
      isConsumidorFinal: input.isConsumidorFinal,
      shipCity: input.shipCity.trim(),
      shipBarrio: input.shipBarrio?.trim() || null,
      shipAddress: input.shipAddress.trim(),
      shipReference: input.shipReference?.trim() || null,
      shipMapsUrl: input.shipMapsUrl?.trim() || null,
      shippingZoneId: shipping.zoneId,
      subtotalPyg,
      shippingPyg,
      totalPyg,
      iva10Pyg,
      iva5Pyg,
      paymentMethod: input.paymentMethod,
      reservedUntil,
    });

    const inserted = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    const orderId = inserted[0]?.id;
    if (!orderId) throw new CheckoutError("No pude crear el pedido. Probá de nuevo.");

    // 4. Ítems con snapshot: lo que el comprador aceptó, congelado.
    await tx.insert(orderItems).values(
      cart.lines.map((line) => ({
        orderId,
        variantId: line.variantId,
        nameSnapshot: `${line.name} — ${line.variantLabel}`,
        skuSnapshot: line.sku,
        unitPricePyg: line.unitPricePyg,
        qty: line.qty,
        ivaRate: line.ivaRate,
        lineTotalPyg: line.lineTotalPyg,
      }))
    );

    // 5. Reservas: FOR UPDATE sobre cada variante y re-chequeo adentro de la
    //    misma transacción. Acá se corta el sobreventa.
    await reserveStock(
      orderId,
      cart.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
      { expiresAt: reservedUntil, executor: tx }
    );

    // 6. Primera fila del log. No es una transición (no hubo cambio de
    //    estado), así que no pasa por transitionOrder.
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: null,
      toStatus: "pendiente_pago",
      actor: "buyer",
      reason: `pedido creado (${input.paymentMethod})`,
    });

    return {
      orderId,
      orderNumber,
      accessToken,
      subtotalPyg,
      shippingPyg,
      totalPyg,
      iva10Pyg,
      iva5Pyg,
      reservedUntil,
    };
  });
}
