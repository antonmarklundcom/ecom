import { describe, expect, it } from 'vitest';

import {
  BASELINE_FILE,
  clasificar,
  contenidoBaseline,
  MAQUINARIA,
  parseArgs,
  parseBaseline,
  parseCommits,
} from '../../scripts/template-diff';

/**
 * `pnpm template:diff` (NEW-STORE.md).
 *
 * Los repos hechos con "Use this template" no comparten historia con el
 * original, así que todo el comando se apoya en el SHA guardado en
 * `.template-baseline`. Si ese archivo se lee mal —y "mal" incluye leer basura
 * como si fuera un SHA— el comando o miente diciendo que está todo al día, o
 * lista la historia entera y se vuelve inusable. Eso es lo que se fija acá.
 */

describe('parseArgs', () => {
  it('por defecto mira template/main sin marcar nada', () => {
    expect(parseArgs([])).toEqual({ remoto: 'template', rama: 'main', marcar: false });
  });

  it('acepta otro remoto y otra rama', () => {
    expect(parseArgs(['--remoto', 'upstream', '--rama', 'produccion'])).toEqual({
      remoto: 'upstream',
      rama: 'produccion',
      marcar: false,
    });
  });

  it('--marcar es un flag suelto', () => {
    expect(parseArgs(['--marcar']).marcar).toBe(true);
  });

  it('una opción desconocida o sin valor no se ignora', () => {
    // `--remoto --marcar` tomaría "--marcar" como nombre de remoto y fallaría
    // después, con un error de git que no dice nada.
    expect(() => parseArgs(['--remto', 'x'])).toThrow(/no conozco/);
    expect(() => parseArgs(['--remoto'])).toThrow(/espera un valor/);
    expect(() => parseArgs(['--remoto', '--marcar'])).toThrow(/espera un valor/);
  });
});

describe('parseBaseline', () => {
  it('lee el SHA salteando comentarios y espacios', () => {
    expect(parseBaseline(contenidoBaseline('abc1234def5678'))).toBe('abc1234def5678');
    expect(parseBaseline('\n\n  # nota\n  4c31eeb  \n')).toBe('4c31eeb');
  });

  it('lo que no es un SHA es null, no un SHA inventado', () => {
    // Devolver basura acá terminaría en `git log basura..template/main`, que
    // falla con un error de git incomprensible. Null cae al camino de "todavía
    // no hay baseline", que explica qué hacer.
    for (const basura of ['', '# sólo comentarios\n', 'HEAD', 'no-es-un-sha', 'zzzz123']) {
      expect(parseBaseline(basura), JSON.stringify(basura)).toBeNull();
    }
  });

  it('el archivo que escribe es el que sabe leer', () => {
    // Ida y vuelta: si alguien cambia el formato de un lado, este test cae.
    const sha = 'e5f81f9333ab91ba452e32546567e62ecf68a384';
    expect(parseBaseline(contenidoBaseline(sha))).toBe(sha);
    expect(contenidoBaseline(sha)).toContain('#');
    expect(BASELINE_FILE).toBe('.template-baseline');
  });
});

describe('parseCommits', () => {
  it('parte cada línea en sha y asunto', () => {
    expect(parseCommits('4c31eeb Runbook del deploy\nc48b403 Toolchain fijada\n')).toEqual([
      { sha: '4c31eeb', asunto: 'Runbook del deploy' },
      { sha: 'c48b403', asunto: 'Toolchain fijada' },
    ]);
  });

  it('la salida vacía de git es cero commits, no uno vacío', () => {
    // `git log a..b` sin nada devuelve "" — leerlo como un commit haría que el
    // comando diga "1 commit pendiente" para siempre.
    expect(parseCommits('')).toEqual([]);
    expect(parseCommits('\n  \n')).toEqual([]);
  });

  it('un asunto con espacios no se corta', () => {
    const [commit] = parseCommits('abc1234 Pagos sin pedido vivo: las dos acciones');
    expect(commit?.asunto).toBe('Pagos sin pedido vivo: las dos acciones');
  });
});

describe('clasificar', () => {
  const commits = [
    { sha: 'aaa1111', asunto: 'Arreglo de stock' },
    { sha: 'bbb2222', asunto: 'Nueva foto en la home' },
  ];

  it('marca los que tocan la maquinaria', () => {
    expect(clasificar(commits, ['aaa1111'])).toEqual([
      { sha: 'aaa1111', asunto: 'Arreglo de stock', maquinaria: true },
      { sha: 'bbb2222', asunto: 'Nueva foto en la home', maquinaria: false },
    ]);
  });

  it('sin maquinaria tocada, ninguno queda marcado', () => {
    expect(clasificar(commits, []).every((commit) => !commit.maquinaria)).toBe(true);
  });

  it('la lista de maquinaria es la de NEW-STORE.md', () => {
    // Si mañana se agrega una carpeta de dominio y no entra acá, los arreglos
    // de esa carpeta van a salir listados como si fueran piel.
    expect(MAQUINARIA).toContain('src/domain');
    expect(MAQUINARIA).toContain('src/lib');
    expect(MAQUINARIA).toContain('src/db');
    expect(MAQUINARIA).toContain('src/app/api');
    expect(MAQUINARIA).toContain('drizzle');
  });
});
