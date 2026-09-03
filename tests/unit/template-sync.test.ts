import { describe, expect, it } from 'vitest';

import type { Commit } from '../../scripts/template-shared';
import {
  clasificarConflicto,
  commitsPendientes,
  cortarHasta,
  necesitaInstall,
  ordenarParaAplicar,
  parseArgs,
  shasYaAplicados,
} from '../../scripts/template-sync';

/**
 * `pnpm template:sync` (fable/plan.md §9). Todo acá es cálculo puro sobre
 * fixtures de `git log` — nada de red, nada de un repo real. El comportamiento
 * de git de verdad (cherry-pick, conflictos, `--continue`) lo cubre el test de
 * integración en tests/integration/template-sync.test.ts.
 */

describe('parseArgs', () => {
  it('por defecto no hace dry-run, no para en ningún sha, y corre los tests', () => {
    expect(parseArgs([])).toEqual({
      remoto: 'template',
      rama: 'main',
      dryRun: false,
      hasta: null,
      sinTests: false,
    });
  });

  it('--dry-run y --sin-tests son flags sueltos', () => {
    const opciones = parseArgs(['--dry-run', '--sin-tests']);
    expect(opciones.dryRun).toBe(true);
    expect(opciones.sinTests).toBe(true);
  });

  it('--hasta toma el sha que sigue', () => {
    expect(parseArgs(['--hasta', 'abc1234']).hasta).toBe('abc1234');
  });

  it('acepta --remoto y --rama, igual que template:diff', () => {
    expect(parseArgs(['--remoto', 'upstream', '--rama', 'produccion'])).toMatchObject({
      remoto: 'upstream',
      rama: 'produccion',
    });
  });

  it('una opción desconocida o sin valor no se ignora', () => {
    expect(() => parseArgs(['--hasta'])).toThrow(/espera un valor/);
    expect(() => parseArgs(['--hasta', '--sin-tests'])).toThrow(/espera un valor/);
    expect(() => parseArgs(['--marcar'])).toThrow(/no conozco/);
  });
});

function commit(sha: string, asunto: string, maquinaria: boolean, mixto = false): Commit {
  return { sha, asunto, maquinaria, mixto };
}

describe('ordenarParaAplicar', () => {
  it('se queda sólo con la maquinaria y la da vuelta: git log da lo nuevo primero', () => {
    // Orden de `git log baseline..ref`: del más nuevo (aaa) al más viejo (ccc).
    const commits = [
      commit('aaa', 'Nueva foto en la home', false),
      commit('bbb', 'Arreglo de stock', true),
      commit('ccc', 'Cotización de envío', true),
    ];

    expect(ordenarParaAplicar(commits)).toEqual([
      commit('ccc', 'Cotización de envío', true),
      commit('bbb', 'Arreglo de stock', true),
    ]);
  });

  it('sin maquinaria pendiente, lista vacía', () => {
    expect(ordenarParaAplicar([commit('aaa', 'Piel', false)])).toEqual([]);
  });
});

// SHA-1 de verdad (40 hex), no inventados a mano — un solo carácter de menos
// y la regex de `shasYaAplicados` no matchea nada, en silencio.
const SHA_A = '86f7e437faa5a7fce15d1ddcb9eaeaea377667b8';
const SHA_B = 'e9d71f5ee7c92d6dc9e92ffdad17b8bd49418f98';

describe('shasYaAplicados', () => {
  it('junta los SHA de los trailers que deja `cherry-pick -x`', () => {
    const log =
      `Arreglo de stock\n\n(cherry picked from commit ${SHA_A})\n\n` +
      `Cotización de envío\n\n(cherry picked from commit ${SHA_B})\n`;

    expect(shasYaAplicados(log)).toEqual(new Set([SHA_A, SHA_B]));
  });

  it('un log sin trailers no aporta nada', () => {
    expect(shasYaAplicados('Un commit cualquiera de la tienda\n')).toEqual(new Set());
  });

  it('un mismo sha repetido dos veces no se duplica', () => {
    const sha = SHA_A;
    const log = `(cherry picked from commit ${sha})\n(cherry picked from commit ${sha})\n`;
    expect(shasYaAplicados(log).size).toBe(1);
  });
});

describe('commitsPendientes', () => {
  const ordenados = [commit('ccc', 'Cotización de envío', true), commit('bbb', 'Arreglo de stock', true)];

  it('descarta los que ya tienen trailer', () => {
    expect(commitsPendientes(ordenados, new Set(['ccc']))).toEqual([
      commit('bbb', 'Arreglo de stock', true),
    ]);
  });

  it('sin nada aplicado, la lista pasa entera', () => {
    expect(commitsPendientes(ordenados, new Set())).toEqual(ordenados);
  });
});

describe('cortarHasta', () => {
  const ordenados = [
    commit('ccc3333', 'Cotización de envío', true),
    commit('bbb2222', 'Arreglo de stock', true),
    commit('aaa1111', 'Migración de stock', true),
  ];

  it('sin --hasta, la lista completa', () => {
    expect(cortarHasta(ordenados, null)).toEqual(ordenados);
  });

  it('corta e incluye el commit pedido', () => {
    expect(cortarHasta(ordenados, 'bbb2222')).toEqual([
      commit('ccc3333', 'Cotización de envío', true),
      commit('bbb2222', 'Arreglo de stock', true),
    ]);
  });

  it('acepta un prefijo corto del sha', () => {
    expect(cortarHasta(ordenados, 'bbb')).toHaveLength(2);
  });

  it('no es sensible a mayúsculas', () => {
    expect(cortarHasta(ordenados, 'BBB2222')).toHaveLength(2);
  });

  it('un sha que no está en la lista pendiente, tira', () => {
    // Cubre tanto "no existe" como "ya se aplicó" (por eso ya no está pendiente).
    expect(() => cortarHasta(ordenados, 'zzz9999')).toThrow(/no está entre los commits/);
  });
});

describe('clasificarConflicto', () => {
  it('fable/ se descarta del lado del template', () => {
    expect(clasificarConflicto('fable/plan.md')).toBe('eliminar');
    expect(clasificarConflicto('fable/prompts/o1.md')).toBe('eliminar');
  });

  it('pnpm-lock.yaml se regenera, nunca se resuelve a mano', () => {
    expect(clasificarConflicto('pnpm-lock.yaml')).toBe('lockfile');
  });

  it('los workflows de CI toman la versión del template', () => {
    expect(clasificarConflicto('.github/workflows/ci.yml')).toBe('usar-template');
    expect(clasificarConflicto('.github/workflows/deploy.yaml')).toBe('usar-template');
  });

  it('cualquier otra cosa es manual — la señal de parar', () => {
    for (const archivo of ['src/domain/stock.ts', 'src/components/checkout-form.tsx', 'package.json']) {
      expect(clasificarConflicto(archivo), archivo).toBe('manual');
    }
  });
});

describe('necesitaInstall', () => {
  it('sólo si package.json está entre los archivos tocados', () => {
    expect(necesitaInstall(['src/domain/stock.ts', 'package.json'])).toBe(true);
    expect(necesitaInstall(['src/domain/stock.ts'])).toBe(false);
    expect(necesitaInstall([])).toBe(false);
  });
});
