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
import { formatGs } from "@/lib/money";
import { normalizePhonePY, validateDoc } from "@/lib/py";

import type { CartInput } from "./cart";
import { nextOrderNumber } from "./order-number";
import { computeOrderTotals } from "./order-totals";
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
  /**
   * Novedades y promociones. `null`/`undefined` = no se preguntó; se guarda
   * tal cual, sin convertirlo a `false` (ver `orders.marketing_opt_in`).
   */
  marketingOptIn?: boolean | null;
  /** Pedido para regalar, con un mensaje opcional para la tarjeta. */
  isGift?: boolean;
  giftNote?: string | null;
  /**
   * El total que el navegador venía **mostrando**, para poder avisar si
   * cambió. Se compara, nunca se cobra: lo que se cobra sale de
   * `computeOrderTotals` unas líneas más abajo, contra la DB y adentro de
   * esta transacción (ARCH.md §1 regla 1). Mismo criterio que
   * `expectedPrices` en `priceCart`.
   *
   * `undefined` = no se le mostró ningún total (no llegó a poner la ciudad),
   * así que no hay nada que comparar y el pedido sigue de largo.
   */
  expectedTotalPyg?: number | null;
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

/**
 * El total cambió entre lo que ella vio y lo que corresponde cobrar.
 *
 * Existe porque el umbral de envío gratis hace que el total **no** sea
 * monótono en el precio: un producto de ₲500.000 con envío gratis a partir de
 * ₲500.000 que el comercio baja a ₲490.000 cae abajo del umbral y pasa a
 * pagar flete — más barato el producto, más caro el total. Sin este aviso,
 * cobrarle de más después de una rebaja es indistinguible de un error.
 *
 * No se cobra ninguno de los dos números por venir del navegador: `after` es
 * el que acaba de calcular el servidor, y es el que se cobra si ella
 * confirma de nuevo.
 */
export class TotalChangedError extends CheckoutError {
  constructor(
    readonly before: number,
    readonly after: number
  ) {
    super(
      `El total cambió de ${formatGs(before)} a ${formatGs(after)} mientras completabas los datos. ` +
        "Revisalo y confirmá de nuevo."
    );
    this.name = "TotalChangedError";
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
    // 1 y 2. Re-precio y envío, con el executor de **esta** transacción. Es la
    //    misma función que usa la cotización pública (`computeOrderTotals`),
    //    corrida de nuevo acá: lo que la compradora vio en pantalla no viaja
    //    en el input y no se compara con nada, se recalcula.
    const { cart, shipping, subtotalPyg, shippingPyg, totalPyg, iva10Pyg, iva5Pyg } =
      await computeOrderTotals(input.items, input.shipCity, { executor: tx });

    const blocking = cart.issues.filter((issue) => issue.type !== "precio_cambio");
    if (cart.lines.length === 0 || blocking.length > 0) {
      throw new CheckoutError(
        "Algunos productos ya no están disponibles. Revisá tu carrito.",
        cart.issues
      );
    }

    // 2.b. ¿Le estamos por cobrar algo distinto de lo que vio?
    //
    //      La comparación va **adentro** de la transacción y antes de
    //      escribir nada: si no coincide, esto tira y no queda ni el pedido,
    //      ni el número consumido, ni la reserva. El número del navegador no
    //      participa del cobro en ningún caso — sólo dice qué había en
    //      pantalla.
    if (
      input.expectedTotalPyg !== undefined &&
      input.expectedTotalPyg !== null &&
      input.expectedTotalPyg !== totalPyg
    ) {
      throw new TotalChangedError(input.expectedTotalPyg, totalPyg);
    }

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
      isGift: input.isGift ?? false,
      // La nota se descarta si el pedido no es un regalo: si no, destildar la
      // casilla dejaría el mensaje viejo colgado y alguien lo imprimiría.
      giftNote: input.isGift ? input.giftNote?.trim() || null : null,
      marketingOptIn: input.marketingOptIn ?? null,
      // La fecha acompaña a cualquier respuesta explícita, no sólo al "sí":
      // saber cuándo dijo que no es lo que después evita mandarle igual.
      marketingOptInAt: input.marketingOptIn === null || input.marketingOptIn === undefined
        ? null
        : new Date(),
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
