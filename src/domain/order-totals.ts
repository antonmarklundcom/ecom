import { assertGs, ivaIncluded } from "@/lib/money";

import { priceCart, type CartInput, type PricedCart } from "./cart";
import type { Executor } from "./executor";
import { SHIPPING_IVA_RATE, quoteShipping, type ShippingQuote } from "./shipping";

/**
 * La cuenta del pedido, en un solo lugar.
 *
 * Existe porque hay **dos** momentos en que hace falta: la cotización que ve
 * la compradora antes de confirmar, y `createOrder`, que es el único que
 * cobra. Si cada uno hiciera la suma por su lado, tarde o temprano se
 * separan —alcanza con que uno sume el IVA del flete y el otro no— y la
 * pantalla prometería un total distinto del que termina en la factura.
 *
 * La cotización pública es **sólo para mostrar**: no crea nada, no toca
 * stock, y su resultado no viaja al servidor cuando se confirma. `createOrder`
 * vuelve a llamar a esta misma función adentro de su transacción, con el
 * executor de la transacción, y cobra lo que salga de ahí. Que no puedan
 * discrepar no es una convención que haya que respetar: es que son la misma
 * función corriendo dos veces.
 */

export type OrderTotals = {
  cart: PricedCart;
  shipping: ShippingQuote;
  subtotalPyg: number;
  shippingPyg: number;
  totalPyg: number;
  iva10Pyg: number;
  iva5Pyg: number;
};

export async function computeOrderTotals(
  items: readonly CartInput[],
  shipCity: string,
  options: { executor?: Executor; expectedPrices?: Map<number, number> } = {}
): Promise<OrderTotals> {
  // 1. Precio, IVA y stock salen de la DB; el navegador sólo dijo qué y cuánto.
  const cart = await priceCart(items, {
    executor: options.executor,
    expectedPrices: options.expectedPrices,
  });

  // 2. Envío por zona, con el umbral de envío gratis aplicado sobre el
  //    subtotal ya re-preciado.
  const shipping = await quoteShipping(shipCity, cart.subtotalPyg, options.executor);

  const subtotalPyg = assertGs(cart.subtotalPyg, "subtotal_pyg");
  const shippingPyg = assertGs(shipping.shippingPyg, "shipping_pyg");
  const totalPyg = assertGs(subtotalPyg + shippingPyg, "total_pyg");
  // El flete también viene con IVA incluido (ver SHIPPING_IVA_RATE).
  const iva10Pyg = cart.iva10Pyg + ivaIncluded(shippingPyg, SHIPPING_IVA_RATE);
  const iva5Pyg = cart.iva5Pyg;

  return { cart, shipping, subtotalPyg, shippingPyg, totalPyg, iva10Pyg, iva5Pyg };
}
