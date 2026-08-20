import type { CouponRejection } from '@/domain/coupons';
import { TEXTOS } from '@/i18n';

import { formatGs } from './money';

/**
 * Por qué no anduvo el código, en el idioma de la tienda y sin culpar a nadie.
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
      return TEXTOS.cupones.noExiste;

    case 'no_empezo':
      return TEXTOS.cupones.noEmpezo;

    case 'vencido':
      return TEXTOS.cupones.vencido;

    case 'agotado':
      return TEXTOS.cupones.agotado;

    case 'agotado_para_vos':
      return TEXTOS.cupones.agotadoParaVos;

    case 'minimo_no_alcanzado': {
      const min = options.minOrderPyg;
      if (!min) return TEXTOS.cupones.minimoSinMonto;

      const falta = options.subtotalPyg != null ? min - options.subtotalPyg : null;
      return falta && falta > 0
        ? TEXTOS.cupones.minimoConFalta(formatGs(min), formatGs(falta))
        : TEXTOS.cupones.minimo(formatGs(min));
    }

    case 'solo_clientes':
      return TEXTOS.cupones.soloClientes;
  }
}
