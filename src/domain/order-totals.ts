import { assertGs, ivaBreakdown, ivaIncluded } from "@/lib/money";

import { priceCart, type CartInput, type PricedCart } from "./cart";
import {
  distributeDiscount,
  validateCoupon,
  type CouponRejection,
  type CouponSnapshot,
} from "./coupons";
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

export type AppliedCoupon = {
  coupon: CouponSnapshot;
  discountPyg: number;
};

export type OrderTotals = {
  cart: PricedCart;
  shipping: ShippingQuote;
  subtotalPyg: number;
  /** Lo que descuenta el cupón. 0 cuando no hay ninguno — el caso normal. */
  discountPyg: number;
  shippingPyg: number;
  totalPyg: number;
  iva10Pyg: number;
  iva5Pyg: number;
  /** El cupón que se aplicó, si alguno lo hizo. */
  coupon: AppliedCoupon | null;
  /** Por qué **no** se aplicó el código que mandaron. El checkout lo traduce. */
  couponRejection: CouponRejection | null;
  /** El mínimo del cupón, cuando lo rechazado fue justamente no alcanzarlo. */
  couponMinOrderPyg: number | null;
};

export async function computeOrderTotals(
  items: readonly CartInput[],
  shipCity: string,
  options: {
    executor?: Executor;
    expectedPrices?: Map<number, number>;
    /**
     * El **código** que tipeó la compradora. Nunca un monto: el descuento se
     * calcula acá adentro, contra la DB (README §"Reglas no negociables").
     */
    couponCode?: string | null;
    /** Para `solo_clientes` y para el tope de usos por persona. */
    customerId?: number | null;
    customerPhone?: string | null;
  } = {}
): Promise<OrderTotals> {
  // 1. Precio, IVA y stock salen de la DB; el navegador sólo dijo qué y cuánto.
  const cart = await priceCart(items, {
    executor: options.executor,
    expectedPrices: options.expectedPrices,
  });

  const subtotalPyg = assertGs(cart.subtotalPyg, "subtotal_pyg");

  // 2. El cupón, si mandaron uno. Se valida contra el subtotal **ya
  //    re-preciado**: el mínimo de compra tiene que mirar lo que se va a
  //    cobrar, no lo que el navegador creía que costaba el carrito.
  let coupon: AppliedCoupon | null = null;
  let couponRejection: CouponRejection | null = null;
  let couponMinOrderPyg: number | null = null;

  if (options.couponCode) {
    const result = await validateCoupon(
      options.couponCode,
      {
        subtotalPyg,
        customerId: options.customerId ?? null,
        customerPhone: options.customerPhone ?? null,
      },
      options.executor,
    );

    if (result.ok) {
      coupon = { coupon: result.coupon, discountPyg: result.discountPyg };
    } else {
      couponRejection = result.reason;
      couponMinOrderPyg = result.minOrderPyg ?? null;
    }
  }

  const discountPyg = assertGs(coupon?.discountPyg ?? 0, "discount_pyg");

  // 3. Envío por zona. El umbral de envío gratis se mira contra el subtotal
  //    **sin** descontar, y es una decisión, no un descuido: si el descuento
  //    bajara el subtotal por debajo del umbral, un cupón le sacaría el envío
  //    gratis que la compradora ya tenía en pantalla. Un cupón nunca puede
  //    empeorar el total.
  const shipping = await quoteShipping(shipCity, subtotalPyg, options.executor);
  const shippingPyg = assertGs(shipping.shippingPyg, "shipping_pyg");

  const totalPyg = assertGs(subtotalPyg - discountPyg + shippingPyg, "total_pyg");

  // 4. IVA. El descuento se reparte entre las líneas en proporción a lo que
  //    pesa cada una y **el IVA se sigue calculando por línea**, con el mismo
  //    `ivaIncluded` de siempre (ARCH.md §2). Recalcularlo sobre el total
  //    descontado daría un desglose que no corresponde a ninguna línea real.
  const lineTotals = cart.lines.map((line) => line.lineTotalPyg);
  const shares = distributeDiscount(lineTotals, discountPyg);
  const descontadas = cart.lines.map((line, index) => ({
    lineTotalPyg: line.lineTotalPyg - (shares[index] ?? 0),
    ivaRate: line.ivaRate,
  }));

  const ivaDeLasLineas = ivaBreakdown(descontadas);

  // El flete también viene con IVA incluido (ver SHIPPING_IVA_RATE).
  const iva10Pyg = ivaDeLasLineas.iva10Pyg + ivaIncluded(shippingPyg, SHIPPING_IVA_RATE);
  const iva5Pyg = ivaDeLasLineas.iva5Pyg;

  return {
    cart,
    shipping,
    subtotalPyg,
    discountPyg,
    shippingPyg,
    totalPyg,
    iva10Pyg,
    iva5Pyg,
    coupon,
    couponRejection,
    couponMinOrderPyg,
  };
}
