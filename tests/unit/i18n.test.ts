import { describe, expect, it, vi } from 'vitest';

import { CATALOGS, DEFAULT_LANG, TEXTOS } from '@/i18n';
import { esPY } from '@/i18n/es-py';
import { ORDER_STATUSES } from '@/db/schema';

/**
 * i18n del template (PLAN.md FASE 2, PR P y Q).
 *
 * Tres cosas que fallan calladas: una clave que un catálogo inventa y ninguna
 * pantalla usa, un catálogo que se queda corto y deja huecos en pantalla, y
 * —la que importa— que la tienda que **no** cambió `TIENDA.lang` vea
 * exactamente los textos de siempre.
 */

type Nodo = Record<string, unknown>;

/** `["home.destacados", "carrito.titulo", …]` — las hojas, en orden. */
function claves(objeto: Nodo, prefijo = ''): string[] {
  return Object.entries(objeto)
    .flatMap(([key, value]) => {
      const ruta = prefijo ? `${prefijo}.${key}` : key;
      return value !== null && typeof value === 'object'
        ? claves(value as Nodo, ruta)
        : [ruta];
    })
    .sort();
}

describe('catálogos de mensajes', () => {
  it('es-PY es el default y está completo', () => {
    expect(DEFAULT_LANG).toBe('es-PY');
    expect(CATALOGS[DEFAULT_LANG]).toBe(esPY);
    expect(claves(esPY as Nodo).length).toBeGreaterThan(100);
  });

  /**
   * Una clave que sólo existe en el catálogo traducido es una clave que nadie
   * lee: o la pantalla la perdió, o está mal escrita. Las dos se arreglan
   * borrándola, y ninguna se nota en pantalla.
   */
  it('ningún catálogo inventa claves que es-PY no tenga', () => {
    const esperadas = new Set(claves(esPY as Nodo));

    for (const [lang, catalogo] of Object.entries(CATALOGS)) {
      if (lang === DEFAULT_LANG) continue;
      const sobrantes = claves(catalogo as Nodo).filter((clave) => !esperadas.has(clave));
      expect({ lang, sobrantes }).toEqual({ lang, sobrantes: [] });
    }
  });

  it('todo lo que falte en otro idioma cae en es-PY, sin huecos', () => {
    for (const clave of claves(esPY as Nodo)) {
      const valor = clave.split('.').reduce<unknown>(
        (nodo, parte) => (nodo as Nodo)[parte],
        TEXTOS,
      );
      expect(valor, clave).toBeDefined();
      expect(['string', 'function'], clave).toContain(typeof valor);
    }
  });

  it('cada estado del pedido tiene su texto para el comprador', () => {
    for (const status of ORDER_STATUSES) {
      expect(TEXTOS.estados.comprador[status]).toBeTruthy();
    }
  });

  /**
   * El guardarraíl que importa para una tienda que ya está vendiendo: sin
   * tocar `TIENDA.lang`, los textos son los mismos de siempre.
   */
  it('con el lang de fábrica la tienda ve el catálogo es-PY', () => {
    expect(TEXTOS.home.heroTitulo).toBe(esPY.home.heroTitulo);
    expect(TEXTOS.carrito.titulo).toBe(esPY.carrito.titulo);
    expect(TEXTOS.formulario.confirmarPedido).toBe(esPY.formulario.confirmarPedido);
  });

  it('un idioma sin catálogo cae entero en es-PY en vez de romper', async () => {
    vi.resetModules();
    vi.doMock('@/config/tienda', async () => {
      const real = await vi.importActual<typeof import('@/config/tienda')>('@/config/tienda');
      return { ...real, TIENDA: { ...real.TIENDA, lang: 'gn-PY' } };
    });

    const { TEXTOS: conIdiomaRaro } = await import('@/i18n');
    expect(conIdiomaRaro.home.heroTitulo).toBe(esPY.home.heroTitulo);

    vi.doUnmock('@/config/tienda');
    vi.resetModules();
  });

  /**
   * El criterio de salida del plan: un segundo idioma renderiza la vidriera
   * entera. Se comparan **claves declaradas**, no valores: "Total", "RUC",
   * "WhatsApp" y "Checkout" se escriben igual en los dos idiomas, y pedir que
   * el texto difiera obligaría a inventar traducciones peores que la palabra.
   * Lo que sí importa es que ninguna clave falte — una clave nueva sin
   * traducir se ve en pantalla, en castellano, en medio de una tienda inglesa.
   */
  it('el catálogo en inglés declara todas las claves de la vidriera', () => {
    const faltantes = claves(esPY as Nodo).filter(
      (clave) => !claves(CATALOGS.en as Nodo).includes(clave),
    );
    expect(faltantes).toEqual([]);
  });
});
