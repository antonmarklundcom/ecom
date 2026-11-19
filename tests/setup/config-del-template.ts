import { vi } from "vitest";

/**
 * La suite del template prueba **maquinaria** con la política comercial del
 * template, no con la de la tienda que la corre (docs/TEMPLATE-INHERITANCE.md
 * § "Tests y la config de la tienda").
 *
 * `src/config/checkout.ts` es de la tienda y `template:sync` nunca lo pisa: una
 * tienda que no cobra con tarjeta (Norte, en el arnés de O23) lo deja en
 * `["transferencia", "contra_entrega"]`, y lo mismo con `STORE_PAYMENT_METHODS`
 * en su `.env.local` (Sur). Los tests de checkout, recuperación de pagos o
 * conciliación que crean un pedido con tarjeta la ponían en rojo sin que
 * nada de su maquinaria estuviera mal. Lo que la tienda eligió lo prueban su
 * `pnpm preflight` y su suite de navegador.
 *
 * Corre antes de cada archivo de `unit` e `integration` (vitest.config.mts).
 * Un test que quiera la config real usa `vi.importActual`.
 */
vi.mock("@/config/checkout", () => ({
  CHECKOUT: { paymentMethods: ["transferencia", "contra_entrega", "tarjeta"] },
}));

// Lo mismo con el modo de venta (O36): `src/config/tienda.ts` es de la tienda,
// y una nacida con `pnpm nueva-tienda --modo consulta` lo deja en "consulta",
// donde ningún pedido se crea y la suite de checkout entera quedaba en rojo
// (tienda "Este" del arnés). El resto de `TIENDA` es el de la tienda.
vi.mock("@/config/tienda", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/config/tienda")>();
  return { ...real, TIENDA: { ...real.TIENDA, modoVenta: "carrito" } };
});

// Vacía = "no está" (src/domain/payment-policy.ts). Un test que la necesita
// la pone él mismo.
process.env.STORE_PAYMENT_METHODS = "";
