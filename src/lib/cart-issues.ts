/**
 * Diferencias entre lo que muestra el navegador y lo que dice la DB.
 *
 * Vive en `lib/` y no en `domain/cart.ts` a propósito: el carrito del cliente
 * necesita el tipo y el texto, y `domain/cart` importa el pool de MySQL. Sin
 * esta separación, `mysql2` termina en el bundle del navegador (el build lo
 * corta, pero recién al final).
 */
import { TEXTOS } from "@/i18n";

export type CartIssue =
  | { type: "no_disponible"; variantId: number; name: string }
  | { type: "stock_parcial"; variantId: number; name: string; requested: number; available: number }
  | { type: "precio_cambio"; variantId: number; name: string; before: number; after: number };

/** El problema, en el idioma de la tienda (`TIENDA.lang`). */
export function describeIssue(issue: CartIssue): string {
  const textos = TEXTOS.carrito.problemas;
  switch (issue.type) {
    case "no_disponible":
      return textos.noDisponible(issue.name);
    case "stock_parcial":
      return textos.stockParcial(issue.name, issue.available, issue.requested);
    case "precio_cambio":
      return textos.precioCambio(issue.name);
  }
}
