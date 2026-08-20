import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { esPY } from '@/i18n/es-PY';
import { catalogosRegistrados, idiomaActivo, t, tPlural } from '@/i18n';
import { TIENDA } from '@/config/tienda';

import { listSourceFiles, readCode } from '../helpers/source';

/**
 * El catálogo de mensajes (PLAN.md FASE 2, PR P).
 *
 * Traducir un template sale mal siempre por los mismos dos lados, y los dos
 * tienen test acá:
 *
 * - **Claves que faltan**: alguien agrega un `t("checkout.nuevo")` y se olvida
 *   del catálogo. Con el fallback por clave eso no rompe la tienda, y por eso
 *   mismo pasaría desapercibido hasta que una compradora vea `undefined`.
 * - **Claves que sobran**: se borra un componente y su texto queda en el
 *   catálogo para siempre. Nadie las limpia nunca, porque no se sabe cuáles
 *   son. Salvo que un test las liste.
 */

const RAICES = [path.join('src')] as const;

/** Todo `t("clave")` / `tPlural("clave")` que aparece en el código. */
async function clavesUsadas(): Promise<{ simples: Set<string>; plurales: Set<string> }> {
  const simples = new Set<string>();
  const plurales = new Set<string>();

  for (const file of await listSourceFiles(RAICES)) {
    // El catálogo se saltea: ahí las claves están declaradas, no usadas.
    if (file.startsWith(path.join('src', 'i18n'))) continue;

    const code = await readCode(file);
    for (const match of code.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) {
      if (match[1]) simples.add(match[1]);
    }
    for (const match of code.matchAll(/\btPlural\(\s*["'`]([\w.]+)["'`]/g)) {
      if (match[1]) plurales.add(match[1]);
    }
  }

  // `tPlural("x")` usa `x.uno` y `x.varios`; el regex de arriba también lo
  // matchea como simple (`tPlural` termina en `t(`… no, pero por las dudas).
  for (const base of plurales) simples.delete(base);

  return { simples, plurales };
}

describe('catálogo de mensajes', () => {
  it('toda clave usada en el código existe en es-PY', async () => {
    const { simples, plurales } = await clavesUsadas();
    const existentes = new Set(Object.keys(esPY));

    const faltantes = [
      ...[...simples].filter((key) => !existentes.has(key)),
      ...[...plurales].flatMap((base) =>
        ['uno', 'varios']
          .map((sufijo) => `${base}.${sufijo}`)
          .filter((key) => !existentes.has(key)),
      ),
    ].sort();

    expect(faltantes).toEqual([]);
  });

  it('no quedan claves muertas en el catálogo', async () => {
    const { simples, plurales } = await clavesUsadas();

    const usadas = new Set(simples);
    for (const base of plurales) {
      usadas.add(`${base}.uno`);
      usadas.add(`${base}.varios`);
    }

    const muertas = Object.keys(esPY)
      .filter((key) => !usadas.has(key))
      .sort();

    expect(muertas).toEqual([]);
  });

  it('todo catálogo registrado tiene exactamente las claves de es-PY', () => {
    const esperadas = Object.keys(esPY).sort();

    for (const [lang, catalogo] of Object.entries(catalogosRegistrados())) {
      // Con el fallback por clave, un catálogo incompleto "anda" y muestra
      // español salteado. Esto es lo que impide mergear eso: el fallback
      // existe para una traducción en curso, no para una a medio hacer.
      expect(Object.keys(catalogo).sort(), `catálogo ${lang}`).toEqual(esperadas);
    }
  });

  it('ningún mensaje quedó vacío', () => {
    const vacias = Object.entries(esPY)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(vacias).toEqual([]);
  });

  it('los parámetros de un mensaje son los mismos en todos los catálogos', () => {
    // El error clásico de traducir: se pierde un `{n}` y el mensaje queda
    // "Quedan" a secas, o aparece un `{nombre}` que nadie le pasa y sale
    // literal en pantalla. Ninguna de las dos rompe nada, así que sin este
    // test viajan hasta que alguien las ve en producción.
    const huecos = (texto: string): string[] =>
      [...texto.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

    const offenders: string[] = [];
    for (const [lang, catalogo] of Object.entries(catalogosRegistrados())) {
      for (const [key, esperado] of Object.entries(esPY)) {
        const traducido = (catalogo as Record<string, string | undefined>)[key];
        if (traducido === undefined) continue;
        const a = huecos(esperado).join(',');
        const b = huecos(traducido).join(',');
        if (a !== b) offenders.push(`${lang} → ${key}: esperaba [${a}], encontré [${b}]`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('los plurales vienen de a dos', () => {
    const huerfanas: string[] = [];
    for (const key of Object.keys(esPY)) {
      if (key.endsWith('.uno') && !(`${key.slice(0, -4)}.varios` in esPY)) huerfanas.push(key);
      if (key.endsWith('.varios') && !(`${key.slice(0, -7)}.uno` in esPY)) huerfanas.push(key);
    }
    expect(huerfanas).toEqual([]);
  });
});

describe('t()', () => {
  it('devuelve el texto tal cual cuando no hay parámetros', () => {
    expect(t('carrito.vacio')).toBe('Tu carrito está vacío.');
  });

  it('reemplaza los parámetros por nombre', () => {
    expect(t('stock.quedan', { n: 3 })).toBe('Quedan 3');
  });

  it('deja el hueco visible si falta el valor', () => {
    // A propósito: un hueco vacío pasa desapercibido en una revisión y `{n}`
    // en pantalla no.
    expect(t('stock.quedan')).toBe('Quedan {n}');
  });

  it('ignora un parámetro que el mensaje no nombra', () => {
    expect(t('carrito.vacio', { n: 9 })).toBe('Tu carrito está vacío.');
  });
});

describe('tPlural()', () => {
  it('usa el singular con 1 y el plural con el resto', () => {
    expect(tPlural('catalogo.productos', 1)).toBe('1 producto');
    expect(tPlural('catalogo.productos', 0)).toBe('0 productos');
    expect(tPlural('catalogo.productos', 7)).toBe('7 productos');
  });
});

describe('el idioma de la tienda', () => {
  it('el template se instala en es-PY', () => {
    expect(TIENDA.lang).toBe('es-PY');
    expect(idiomaActivo()).toBe('es-PY');
  });

  it('es-PY está registrado y es el fallback', () => {
    expect(catalogosRegistrados()['es-PY']).toBe(esPY);
  });
});
