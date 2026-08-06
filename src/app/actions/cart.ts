"use server";

import { z } from "zod";

import { priceCart, type PricedCart } from "@/domain/cart";

/**
 * Server action que revalida el carrito. La llama el slide-over al abrirse y
 * el checkout al entrar: es el único momento en que los precios que ve el
 * comprador vuelven a coincidir con la DB.
 */

const RevalidateInputSchema = z.array(
  z.object({
    variantId: z.number().int().positive(),
    qty: z.number().int().min(1).max(99),
    // Lo que el navegador venía mostrando: sirve para avisar del cambio,
    // nunca para cobrar.
    unitPricePyg: z.number().int().nonnegative().optional(),
  })
);

export async function revalidateCart(input: unknown): Promise<PricedCart> {
  const parsed = RevalidateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { lines: [], subtotalPyg: 0, iva10Pyg: 0, iva5Pyg: 0, issues: [] };
  }

  const expectedPrices = new Map<number, number>();
  for (const item of parsed.data) {
    if (item.unitPricePyg !== undefined) expectedPrices.set(item.variantId, item.unitPricePyg);
  }

  return priceCart(
    parsed.data.map((item) => ({ variantId: item.variantId, qty: item.qty })),
    { expectedPrices }
  );
}
