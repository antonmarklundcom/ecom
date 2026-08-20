import type { UserRole } from "@/db/schema";

/**
 * La matriz de permisos del panel, en un solo lugar (ARCH.md §1).
 *
 * **Esto no es la defensa.** La defensa son los guards (`requireStaffSession`,
 * `requireOwnerSession`) adentro de cada server action: una acción es un
 * endpoint HTTP con su propio id y se la puede llamar sin abrir jamás una
 * página. Esta tabla existe para que el panel no le dibuje a nadie un botón
 * que le va a contestar 403, y para que la matriz esté escrita una vez en vez
 * de repartida entre diez `role === "owner"` sueltos.
 *
 * Regla al agregar una capacidad: primero el guard en la acción, después la
 * fila acá. Al revés se llega a un botón oculto que igual funciona.
 */
export const CAPABILITIES = [
  /** El resumen de `/admin`: ventas del día y del mes. Es plata. */
  "dashboard",
  /** Ver el listado y la ficha de un pedido. */
  "pedidos.ver",
  /** Preparar, despachar y dar por entregado. El trabajo del mostrador. */
  "pedidos.despachar",
  /** Dar por cobrado, cancelar, vencer, rechazar. Mueve plata o suelta stock. */
  "pedidos.cobrar",
  /** Ver y decidir comprobantes de transferencia. */
  "comprobantes",
  /** Ver montos: totales, desglose de IVA, precios del catálogo. */
  "precios",
  /** ABM de productos y variantes. */
  "productos",
  /** Ajustar `on_hand` a mano. */
  "stock",
  /** El listado de compradores con lo que gastó cada uno. */
  "clientes",
  /** Bajar CSV: la base del comercio en un archivo que sale del edificio. */
  "exports",
  /** Registrar una devolución. Plata que sale. */
  "reembolsos",
  /** Alta, baja y cambio de rol de los usuarios del panel (PR C). */
  "usuarios",
  /** ABM de cupones (PR G): plata que la tienda resigna en cada venta. */
  "cupones",
  /**
   * ABM de categorías (PR J). Owner-only: apagar una categoría esconde de la
   * vidriera todos sus productos de un clic — es la forma más barata que tiene
   * el panel de dejar de vender sin querer.
   */
  "categorias",
  /**
   * ABM de zonas de envío (PR K). Owner-only por lo mismo que los cupones: el
   * flete es plata, y poner una zona en ₲0 regala la logística de la tienda.
   */
  "envios",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Qué puede cada rol.
 *
 * `owner` está escrito como "todas" y no como una lista: la lista se
 * desactualiza, y el dueño por definición puede todo lo que exista.
 */
export const ROLE_CAPABILITIES: Readonly<Record<UserRole, readonly Capability[]>> = {
  owner: CAPABILITIES,

  // La operación diaria completa, sin lo que no se delega: nada de plata que
  // sale (`reembolsos`), nada de la base en un archivo (`exports`), nada de
  // repartir accesos (`usuarios`).
  staff: [
    "dashboard",
    "pedidos.ver",
    "pedidos.despachar",
    "pedidos.cobrar",
    "comprobantes",
    "precios",
    "productos",
    "stock",
    "clientes",
  ],

  // El mostrador y nada más: ve los pedidos y los despacha. Sin montos, sin
  // comprobantes, sin stock, sin el resumen de ventas.
  vendedor: ["pedidos.ver", "pedidos.despachar"],
};

export function can(role: UserRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
