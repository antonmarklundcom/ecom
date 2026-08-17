"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { freeShippingForZone, type FreeShippingProgress } from "@/domain/free-shipping";
import { computeOrderTotals } from "@/domain/order-totals";
import type { CartIssue } from "@/lib/cart-issues";
import { QUOTE_LIMIT, QUOTE_WINDOW_MS, clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Cotización de envío **antes** de crear el pedido.
 *
 * Hasta acá el envío se conocía recién con el pedido creado, y el checkout lo
 * decía con todas las letras ("se confirma en la próxima pantalla"). Un monto
 * que aparece después de confirmar es la clase de sorpresa que hace abandonar
 * el carrito, y es un precio que el comercio ya conoce: sale de
 * `shipping_zones`, que es una tabla, no una negociación.
 *
 * Tres cosas que esta acción NO es:
 *
 * 1. **No crea nada.** No hay pedido, no hay reserva, no se toca `on_hand`.
 *    Es sólo lectura, y por eso se puede llamar cada vez que la compradora
 *    corrige la ciudad.
 * 2. **No es una segunda fuente de verdad.** La cuenta la hace
 *    `computeOrderTotals`, la misma función que corre `createOrder` adentro de
 *    su transacción. Acá no hay aritmética de dinero: sólo se transporta.
 * 3. **No vuelve.** El total cotizado no viaja de vuelta al confirmar y nadie
 *    lo compara con nada. Si entre la cotización y el pedido cambia un precio,
 *    manda el pedido — que es exactamente la regla 1 de ARCH.md §1.
 *
 * Tiene rate limit igual, aunque no escriba: cada llamada son tres consultas y
 * la ruta es pública y anónima.
 */

const QuoteInputSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.number().int().positive(),
      qty: z.number().int().min(1).max(99),
    })
  ),
  /** Vacía = todavía no la eligió; se cotiza sólo el subtotal. */
  city: z.string().trim().max(120).optional(),
});

export type ShippingQuoteView = {
  zoneName: string;
  shippingPyg: number;
  isFree: boolean;
  /** `false` = la ciudad no está en ninguna zona y se cotizó la tarifa más cara. */
  matched: boolean;
};

export type CartQuote = {
  subtotalPyg: number;
  /** `null` mientras no haya ciudad: no se muestra un total que no se puede afirmar. */
  totalPyg: number | null;
  shipping: ShippingQuoteView | null;
  freeShipping: FreeShippingProgress;
  issues: CartIssue[];
};

const EMPTY_QUOTE: CartQuote = {
  subtotalPyg: 0,
  totalPyg: null,
  shipping: null,
  freeShipping: { kind: "sin_umbral" },
  issues: [],
};

export async function quoteCartShipping(input: unknown): Promise<CartQuote> {
  const ip = clientIp(await headers());
  if (!rateLimit(`quote:${ip}`, { limit: QUOTE_LIMIT, windowMs: QUOTE_WINDOW_MS }).ok) {
    // Sin número en vez de un número viejo: la pantalla vuelve a decir que el
    // envío se confirma al crear el pedido, que es lo que decía antes.
    return EMPTY_QUOTE;
  }

  const parsed = QuoteInputSchema.safeParse(input);
  if (!parsed.success) return EMPTY_QUOTE;

  const city = parsed.data.city?.trim() ?? "";
  if (parsed.data.items.length === 0 || city === "") {
    // Sin ciudad no hay zona, y sin zona no hay envío que cotizar. El carrito
    // usa `revalidateCart` para su parte (subtotal + envío gratis).
    return EMPTY_QUOTE;
  }

  const totals = await computeOrderTotals(parsed.data.items, city);

  return {
    subtotalPyg: totals.subtotalPyg,
    totalPyg: totals.totalPyg,
    shipping: {
      zoneName: totals.shipping.zoneName,
      shippingPyg: totals.shippingPyg,
      isFree: totals.shipping.isFree,
      matched: totals.shipping.matched,
    },
    freeShipping: freeShippingForZone(totals.shipping, totals.subtotalPyg),
    issues: totals.cart.issues,
  };
}
