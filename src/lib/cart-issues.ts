/**
 * Diferencias entre lo que muestra el navegador y lo que dice la DB.
 *
 * Vive en `lib/` y no en `domain/cart.ts` a propósito: el carrito del cliente
 * necesita el tipo y el texto, y `domain/cart` importa el pool de MySQL. Sin
 * esta separación, `mysql2` termina en el bundle del navegador (el build lo
 * corta, pero recién al final).
 */
export type CartIssue =
  | { type: "no_disponible"; variantId: number; name: string }
  | { type: "stock_parcial"; variantId: number; name: string; requested: number; available: number }
  | { type: "precio_cambio"; variantId: number; name: string; before: number; after: number };

/** Texto en español para mostrarle el problema al comprador. */
export function describeIssue(issue: CartIssue): string {
  switch (issue.type) {
    case "no_disponible":
      return `${issue.name} se quedó sin stock y lo sacamos del carrito.`;
    case "stock_parcial":
      return `De ${issue.name} quedan ${issue.available} (pediste ${issue.requested}).`;
    case "precio_cambio":
      return `El precio de ${issue.name} cambió mientras estaba en tu carrito.`;
  }
}
