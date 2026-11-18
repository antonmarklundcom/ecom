/**
 * El modo de venta de la tienda (fable/plan-trafico.md §2.1). **Puro**: sin
 * base, sin Next, sin imports — lo usan la vidriera (también componentes
 * cliente), el dominio del pedido, `pnpm preflight` y los tests.
 *
 * - `"carrito"`: la tienda de siempre. Cada producto se vende según su
 *   `sale_mode` (`stock` se compra, `enquiry` se consulta, `showcase` se
 *   muestra). Es el default del template.
 * - `"consulta"`: la tienda no toma pedidos. Un producto `stock` se comporta
 *   como `enquiry` en todos lados; `showcase` sigue siendo `showcase`.
 *
 * El `sale_mode` de la base **nunca** se reescribe: prender la venta después
 * es un interruptor (`/admin/ajustes` → Modo de venta), no un cambio de datos.
 *
 * Quién decide el modo: `modoVentaEfectivo()` de `src/lib/modo-venta.ts`, el
 * único que lee el ajuste. Acá sólo están las reglas.
 */

export const MODOS_VENTA = ["carrito", "consulta"] as const;
export type ModoVenta = (typeof MODOS_VENTA)[number];

/** El de fábrica: la tienda que vende con carrito, como antes de O32. */
export const MODO_VENTA_POR_DEFECTO: ModoVenta = "carrito";

export function esModoVenta(valor: unknown): valor is ModoVenta {
  return (MODOS_VENTA as readonly unknown[]).includes(valor);
}

export type SaleMode = "stock" | "enquiry" | "showcase";

/**
 * **La** regla: el `sale_mode` con el que se dibuja y se trata un producto.
 *
 * En `"consulta"`, `stock` (o sin dato, que es `stock`) pasa a `enquiry`. El
 * resto queda igual, y en `"carrito"` no cambia nada: devuelve lo mismo que
 * recibió, también `undefined`, para que el código de siempre siga viendo lo
 * de siempre.
 */
export function saleModeEfectivo<S extends SaleMode | undefined>(
  saleMode: S,
  modo: ModoVenta = MODO_VENTA_POR_DEFECTO
): S | "enquiry" {
  if (modo === "consulta" && (saleMode ?? "stock") === "stock")
    return "enquiry";
  return saleMode;
}

/**
 * El producto tal como lo ve la vidriera en este modo: el mismo objeto si no
 * cambia nada (`"carrito"`, o un producto que ya no era `stock`), o una copia
 * con el `saleMode` efectivo. No toca nada más.
 */
export function conModoVenta<P extends { saleMode?: SaleMode }>(
  producto: P,
  modo: ModoVenta = MODO_VENTA_POR_DEFECTO
): P {
  const efectivo = saleModeEfectivo(producto.saleMode, modo);
  return efectivo === producto.saleMode
    ? producto
    : { ...producto, saleMode: efectivo };
}

/** ¿La tienda toma pedidos? Sólo en `"carrito"`. */
export function tomaPedidos(modo: ModoVenta): boolean {
  return modo === "carrito";
}
