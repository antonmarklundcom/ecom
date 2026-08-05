import { describe, expect, it } from "vitest";

import { CartItemSchema } from "@/lib/schemas";

describe("CartItemSchema", () => {
  it("acepta un ítem válido", () => {
    const result = CartItemSchema.safeParse({ variantId: 1, qty: 2 });
    expect(result.success).toBe(true);
  });

  it("rechaza cantidades no enteras", () => {
    const result = CartItemSchema.safeParse({ variantId: 1, qty: 1.5 });
    expect(result.success).toBe(false);
  });
});
