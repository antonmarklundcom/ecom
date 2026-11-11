import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { leerTiendas, parseArgs, planEnsayo, urlDeClon } from '../../scripts/ensayar-distribucion';

/**
 * `tiendas.json` es el registro de tiendas del template, y el template es
 * público: acá no puede entrar nada que ayude a entrar a una tienda. Sólo
 * existe en el template (`SOLO_TEMPLATE`); en una tienda este test no mira nada.
 */

describe('tiendas.json', () => {
  const ruta = join(process.cwd(), 'tiendas.json');

  it.runIf(existsSync(ruta))('el del repo es válido: repo, dominio, notas, anillo y estado, sin credenciales', () => {
    expect(() => leerTiendas(readFileSync(ruta, 'utf8'))).not.toThrow();
  });
});

describe('leerTiendas', () => {
  const leer = (valor: unknown) => leerTiendas(JSON.stringify(valor));

  it('acepta la lista vacía y entradas con repo, dominio y notas', () => {
    expect(leer([])).toEqual([]);
    expect(leer([{ repo: 'antonmarklundcom/mascota', dominio: 'mascota.com.py', notas: 'Pagopar en sandbox' }])).toHaveLength(1);
  });

  it('una entrada vieja, sin anillo ni estado, es activa y del anillo 1', () => {
    expect(leer([{ repo: 'a/b' }])).toEqual([{ repo: 'a/b', anillo: 1, estado: 'activa' }]);
    expect(leer([{ repo: 'a/b', anillo: 0, estado: 'pausada' }])).toEqual([{ repo: 'a/b', anillo: 0, estado: 'pausada' }]);
  });

  it('anillo 0 o 1 como número, estado activa o pausada', () => {
    expect(() => leer([{ repo: 'a/b', anillo: '0' }])).toThrow(/anillo/);
    expect(() => leer([{ repo: 'a/b', anillo: 2 }])).toThrow(/anillo/);
    expect(() => leer([{ repo: 'a/b', estado: 'apagada' }])).toThrow(/estado/);
  });

  it('exige repo "dueño/nombre" y no lo acepta dos veces', () => {
    expect(() => leer([{ dominio: 'x.com.py' }])).toThrow(/dueño\/nombre/);
    expect(() => leer([{ repo: 'mascota' }])).toThrow(/dueño\/nombre/);
    expect(() => leer([{ repo: 'a/b' }, { repo: 'A/b' }])).toThrow(/dos veces/);
  });

  it('rechaza campos de infraestructura: el archivo es público', () => {
    expect(() => leer([{ repo: 'a/b', base: 'u123_tienda' }])).toThrow(/sólo van repo, dominio, notas, anillo y estado/);
    expect(() => leer([{ repo: 'a/b', hosting: 'cuenta 2, slot 3' }])).toThrow(/sólo van/);
  });

  it('rechaza lo que parece una credencial aunque venga en notas', () => {
    expect(() => leer([{ repo: 'a/b', notas: ['mysql://u', 'clave@host/db'].join(':') }])).toThrow(/credencial/);
    expect(() => leer([{ repo: 'a/b', notas: 'la base es u123456_mascota' }])).toThrow(/credencial/);
    expect(() => leer([{ repo: 'a/b', notas: `token ghp_${'x'.repeat(36)}` }])).toThrow(/credencial/);
  });

  it('no es JSON o no es un array: error claro', () => {
    expect(() => leerTiendas('{')).toThrow(/JSON válido/);
    expect(() => leerTiendas('{}')).toThrow(/array/);
  });
});

describe('parseArgs de template:ensayar-distribucion', () => {
  it('flags y --repo repetible', () => {
    expect(parseArgs(['--verificar', '--repo', 'a/b', '--repo', 'c/d', '--conservar'])).toEqual({
      verificar: true,
      conservar: true,
      repos: ['a/b', 'c/d'],
      tiendas: null,
      origen: null,
      anillo: null,
      incluirPausadas: false,
    });
    expect(parseArgs(['--tiendas', 'x.json', '--origen', 'C:/arnes/stores', '--anillo', '0', '--incluir-pausadas'])).toMatchObject({
      tiendas: 'x.json',
      origen: 'C:/arnes/stores',
      anillo: 0,
      incluirPausadas: true,
    });
    expect(() => parseArgs(['--repo'])).toThrow(/dueño\/nombre/);
    expect(() => parseArgs(['--anillo', '2'])).toThrow(/0 o 1/);
    expect(() => parseArgs(['--nada'])).toThrow(/no conozco/);
  });
});

describe('planEnsayo', () => {
  const tiendas = leerTiendas(
    JSON.stringify([
      { repo: 'a/canaria', anillo: 0 },
      { repo: 'a/resto', anillo: 1 },
      { repo: 'a/pausada', anillo: 1, estado: 'pausada' },
    ]),
  );

  it('elige lo mismo que distribuir.yml, por anillo; las pausadas sólo si se piden', () => {
    const plan = planEnsayo(tiendas, { anillo: null, incluirPausadas: false });
    expect(plan.porAnillo).toEqual([
      { anillo: 0, elegidas: ['a/canaria'], pausadas: [], jobs: 1 },
      { anillo: 1, elegidas: ['a/resto'], pausadas: ['a/pausada'], jobs: 1 },
    ]);
    expect(plan.aSincronizar).toEqual(['a/canaria', 'a/resto']);
    expect(planEnsayo(tiendas, { anillo: 1, incluirPausadas: true }).aSincronizar).toEqual(['a/resto', 'a/pausada']);
    expect(planEnsayo(tiendas, { anillo: 0, incluirPausadas: false }).aSincronizar).toEqual(['a/canaria']);
  });

  it('clona de GitHub, o de <origen>/<nombre> en el arnés', () => {
    expect(urlDeClon('a/b', null)).toBe('https://github.com/a/b.git');
    expect(urlDeClon('arnes/norte', join('x', 'stores'))).toMatch(/stores[\\/]norte$/);
  });
});
