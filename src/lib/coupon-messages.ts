import type { CouponRejection } from '@/domain/coupons';

import { formatGs } from './money';

/**
 * Por qué no anduvo el código, en castellano y sin culpar a nadie.
 *
 * "No existe" e "inactivo" dicen **lo mismo** hacia afuera: si se
 * distinguieran, el campo del checkout se convertiría en un buscador de qué
 * códigos existen en esta tienda, y probar mil combinaciones es gratis.
 *
 * Los demás sí se distinguen, y a propósito: "te falta ₲20.000 para llegar al
 * mínimo" es información que la hace agregar algo al carrito. "Ese código no
 * sirve" ahí sería esconder una venta.
 */
export function couponRejectionMessage(
  reason: CouponRejection,
  options: { minOrderPyg?: number | null; subtotalPyg?: number | null } = {},
): string {
  switch (reason) {
    case 'no_existe':
    case 'inactivo':
      return 'Ese código no existe o ya no está disponible.';

    case 'no_empezo':
      return 'Ese código todavía no está vigente.';

    case 'vencido':
      return 'Ese código ya venció.';

    case 'agotado':
      return 'Ese código ya se usó todas las veces disponibles.';

    case 'agotado_para_vos':
      return 'Ya usaste ese código la cantidad de veces permitida.';

    case 'minimo_no_alcanzado': {
      const min = options.minOrderPyg;
      if (!min) return 'Tu compra no llega al mínimo que pide ese código.';

      const falta = options.subtotalPyg != null ? min - options.subtotalPyg : null;
      return falta && falta > 0
        ? `Ese código pide una compra mínima de ${formatGs(min)}: te faltan ${formatGs(falta)}.`
        : `Ese código pide una compra mínima de ${formatGs(min)}.`;
    }

    case 'solo_clientes':
      return 'Ese código es sólo para quienes tienen cuenta.';
  }
}
