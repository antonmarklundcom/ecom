import { TIENDA } from "@/config/tienda";
import type { Executor } from "@/domain/executor";
import {
  MODO_VENTA_POR_DEFECTO,
  tomaPedidos,
  type ModoVenta,
} from "@/domain/modo-venta";
import { getStoreSettings, readStoreSettings } from "@/domain/store-settings";
import { ventasEfectivas } from "@/domain/store-settings-schema";

/**
 * El único lugar que decide cómo vende la tienda: `"carrito"` o `"consulta"`
 * (`src/domain/modo-venta.ts`, fable/plan-trafico.md §2.1).
 *
 * Lo decide el dueño en `/admin/ajustes` → Modo de venta; si nunca lo tocó,
 * manda `TIENDA.modoVenta` de `src/config/tienda.ts` (y sin el campo,
 * `"carrito"`). Mismo patrón que `cuentasClientesHabilitadas()` de
 * `src/lib/cuentas.ts`.
 *
 * - Sin `executor`: los ajustes de la vidriera (`getStoreSettings`, una
 *   consulta por request y nunca tira: sin base, manda `tienda.ts`).
 * - Con `executor` (la transacción del pedido): lee la fila con ese executor
 *   y **sí** tira si la base falla — el pedido no se crea a ciegas.
 *
 * **Async**: siempre con `await`.
 */
export async function modoVentaEfectivo(
  executor?: Executor
): Promise<ModoVenta> {
  const { ventas } = executor
    ? (await readStoreSettings(executor)).settings
    : await getStoreSettings();
  return ventasEfectivas(ventas, TIENDA.modoVenta ?? MODO_VENTA_POR_DEFECTO);
}

/** ¿La tienda toma pedidos ahora? (`"carrito"`). */
export async function tiendaTomaPedidos(executor?: Executor): Promise<boolean> {
  return tomaPedidos(await modoVentaEfectivo(executor));
}
