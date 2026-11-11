import { describe, expect, it } from 'vitest';

import { edadPr, parseArgs, tablaAtraso, type Fila } from '../../scripts/template-atraso';

/** `pnpm template:atraso`: una fila por tienda, baseline, commits atrás y edad del PR de sync. */

const ahora = new Date('2026-11-20T12:00:00Z');
const releases = [
  { nombre: 'v2.0.0', fecha: '2026-11-01T00:00:00Z' },
  { nombre: 'v2.1.0', fecha: '2026-11-08T00:00:00Z' },
  { nombre: 'v2.2.0', fecha: '2026-11-15T00:00:00Z' },
  { nombre: 'v2.3.0', fecha: '2026-11-19T00:00:00Z' },
];

const fila = (repo: string, extra: Partial<Fila> = {}): Fila => ({
  repo,
  anillo: 1,
  estado: 'activa',
  baseline: 'd2a92a9aabbccddeeff00112233445566778899',
  atras: 12,
  atrasMaquinaria: 7,
  pr: null,
  nota: null,
  ...extra,
});

describe('template:atraso', () => {
  it('una fila por tienda, en el orden de tiendas.json, con baseline, commits atrás y PR', () => {
    const filas = [
      fila('a/canaria', { anillo: 0, pr: { numero: 4, creadoEn: '2026-11-16T00:00:00Z' } }),
      fila('a/vieja', { pr: { numero: 9, creadoEn: '2026-11-02T00:00:00Z' } }),
      fila('a/pausada', { estado: 'pausada', baseline: null, atras: null, atrasMaquinaria: null, pr: undefined, nota: 'no pude leer la tienda' }),
    ];
    const tabla = tablaAtraso(filas, ahora, releases).split('\n');
    expect(tabla).toHaveLength(2 + filas.length);
    expect(tabla[0]).toMatch(/Tienda .*Baseline .*Commits atrás \(maquinaria\) .*PR de sync/);
    expect(tabla[2]).toMatch(/a\/canaria .*\| 0 .*d2a92a9aabbc .*12 \(7\) .*#4: 4 d · 1 versión\(es\) *\|$/);
    expect(tabla[3]).toMatch(/a\/vieja .*#9: 18 d · 3 versión\(es\) ⚠ distribución en rojo/);
    expect(tabla[4]).toMatch(/a\/pausada .*pausada .*— .*\? — no pude leer la tienda/);
  });

  it('edad del PR: sin PR, no se sabe, o días y versiones', () => {
    expect(edadPr(null, ahora, releases)).toBe('sin PR abierto');
    expect(edadPr(undefined, ahora, releases)).toBe('?');
    expect(edadPr({ numero: 1, creadoEn: '2026-11-20T00:00:00Z' }, ahora, releases)).toBe('#1: 0 d · 0 versión(es)');
  });

  it('opciones', () => {
    expect(parseArgs([])).toEqual({ tiendas: null, origen: null, ref: 'main', json: false });
    expect(parseArgs(['--tiendas', 't.json', '--origen', 'x', '--ref', 'v2.0.0', '--json'])).toEqual({
      tiendas: 't.json',
      origen: 'x',
      ref: 'v2.0.0',
      json: true,
    });
    expect(() => parseArgs(['--ref'])).toThrow(/--ref espera/);
    expect(() => parseArgs(['--x'])).toThrow(/no conozco/);
  });
});
