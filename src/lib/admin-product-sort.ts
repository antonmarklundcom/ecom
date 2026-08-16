/**
 * Órdenes del listado de productos del panel.
 *
 * Vive en `lib/` y no en `domain/admin-products.ts` a propósito: el selector
 * es un componente cliente, y cualquier `import` suyo al módulo de dominio se
 * lleva el pool de MySQL al bundle del navegador — el build de Next falla
 * pidiendo `tls`. Mismo motivo por el que `lib/price-ranges.ts` está separado
 * de las consultas del catálogo.
 *
 * `stock` es ascendente a propósito: nadie entra a productos a mirar lo que le
 * sobra, se entra a ver qué se está por acabar.
 */
export const ADMIN_PRODUCT_SORTS = ["recientes", "stock", "precio-asc", "precio-desc"] as const;

export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

export const ADMIN_PRODUCT_SORT_LABEL: Record<AdminProductSort, string> = {
  recientes: "Editados hace poco",
  stock: "Stock: menor primero",
  "precio-asc": "Precio: menor a mayor",
  "precio-desc": "Precio: mayor a menor",
};

export function isAdminProductSort(value: string | undefined): value is AdminProductSort {
  return value !== undefined && (ADMIN_PRODUCT_SORTS as readonly string[]).includes(value);
}
