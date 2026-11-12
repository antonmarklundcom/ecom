import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  armarPr,
  commitsAMano,
  decidir,
  MAX_VERSIONES_SIN_MERGEAR,
  versionesDesde,
} from '../../scripts/ci/armar-pr-tiendas.mjs';
import { distribuirLote, tablaResumen } from '../../scripts/ci/distribuir-lote.mjs';
import { sacarGitDelEntorno } from '../../scripts/ci/entorno-sin-git.mjs';
import { envSinGit } from '../helpers/git-sin-entorno';
import {
  anilloDeLaCorrida,
  armarLotes,
  describirPlan,
  MAX_JOBS,
  planDistribucion,
  TIENDAS_POR_JOB,
  validarTag,
} from '../../scripts/ci/elegir-tiendas.mjs';

/**
 * `distribuir.yml` a escala (O28): anillos, pausa, lotes bajo el tope de 256
 * jobs de una matrix, y el rojo de una rama de sync editada a mano o de un PR
 * que sobrevivió a más de dos versiones. GitHub Actions está apagado en el
 * template, así que nada de esto se probó corriendo el workflow: estos tests
 * leen el `distribuir.yml` de verdad y evalúan sus expresiones (`env:`, `if:`,
 * `matrix:`) con el mismo `elegir-tiendas.mjs` que corre `preparar`.
 */

const raiz = process.cwd();
const yaml = readFileSync(join(raiz, '.github/workflows/distribuir.yml'), 'utf8');

/** El bloque de un job (desde `  nombre:` hasta el próximo job o el final). */
function bloqueDeJob(job: string): string {
  const inicio = yaml.indexOf(`\n  ${job}:\n`);
  if (inicio === -1) throw new Error(`no encontré el job ${job}`);
  const resto = yaml.slice(inicio + 1);
  const siguiente = resto.slice(1).search(/\n {2}[a-z0-9_-]+:\n/);
  return siguiente === -1 ? resto : resto.slice(0, siguiente + 1);
}

/** El bloque de un paso por su `name:`. */
function bloqueDePaso(job: string, nombre: string): string {
  const bloque = bloqueDeJob(job);
  const inicio = bloque.indexOf(`- name: ${nombre}\n`);
  if (inicio === -1) throw new Error(`no encontré el paso "${nombre}" en ${job}`);
  const resto = bloque.slice(inicio);
  const siguiente = resto.slice(1).search(/\n {6}- /);
  return siguiente === -1 ? resto : resto.slice(0, siguiente + 1);
}

/** Una línea `clave: valor` con la sangría dada, dentro de un bloque. */
function valor(bloque: string, clave: string, sangria: number): string {
  const re = new RegExp(`\\n {${sangria}}${clave}: (.+)\\n`);
  const m = re.exec(`\n${bloque}`);
  if (!m?.[1]) throw new Error(`no encontré ${clave}`);
  return m[1].trim();
}

type Contexto = {
  github: { event_name: string; ref_name: string; repository: string; event: { repository: { default_branch: string } } };
  inputs: Record<string, string>;
  needs?: Record<string, { outputs: Record<string, string> }>;
  matrix?: Record<string, unknown>;
  steps?: Record<string, { outputs: Record<string, string> }>;
};

/**
 * Evalúa una expresión `${{ … }}` de GitHub Actions como JS. Alcanza para lo
 * que usa `distribuir.yml`: contextos, `==`, `!=`, `&&`, `||`, `fromJson`,
 * `toJson`. Un input que no existe en el evento da `''`, como en GitHub.
 */
function evaluar(expresion: string, ctx: Contexto): unknown {
  const js = expresion
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/!=/g, '!==')
    .replace(/([^!=])==/g, '$1===');
  const inputs = new Proxy(ctx.inputs, { get: (o, k: string) => o[k] ?? '' });
  const fn = new Function('github', 'inputs', 'needs', 'matrix', 'steps', 'fromJson', 'toJson', `return (${js});`) as (
    ...args: unknown[]
  ) => unknown;
  return fn(ctx.github, inputs, ctx.needs ?? {}, ctx.matrix ?? {}, ctx.steps ?? {}, JSON.parse, JSON.stringify);
}

const push = (tag: string): Contexto => ({
  github: { event_name: 'push', ref_name: tag, repository: 'antonmarklundcom/ecom', event: { repository: { default_branch: 'main' } } },
  inputs: {},
});
const aMano = (tag: string, anillo: string): Contexto => ({
  github: { event_name: 'workflow_dispatch', ref_name: 'main', repository: 'antonmarklundcom/ecom', event: { repository: { default_branch: 'main' } } },
  inputs: { tag, anillo },
});

const REGISTRO = JSON.stringify([
  { repo: 'a/canaria', anillo: 0 },
  { repo: 'a/canaria-pausada', anillo: 0, estado: 'pausada' },
  { repo: 'a/resto-1', anillo: 1 },
  { repo: 'a/resto-pausada', anillo: 1, estado: 'pausada' },
  { repo: 'a/vieja-sin-campos' },
]);

/** Lo que hace el paso "Elegir las tiendas": su `env:` real evaluado, y el script. */
function correrPreparar(ctx: Contexto, contenido: string | null = REGISTRO) {
  const paso = bloqueDePaso('preparar', 'Elegir las tiendas de esta corrida');
  expect(paso).toContain('run: node scripts/ci/elegir-tiendas.mjs');
  const env = {
    EVENTO: String(evaluar(valor(paso, 'EVENTO', 10), ctx)),
    TAG: String(evaluar(valor(paso, 'TAG', 10), ctx)),
    ANILLO: String(evaluar(valor(paso, 'ANILLO', 10), ctx)),
  };
  return planDistribucion({ contenido, evento: env.EVENTO, anillo: env.ANILLO, tag: env.TAG });
}

const repos = (n: number) => Array.from({ length: n }, (_, i) => `antonmarklundcom/tienda-${i + 1}`);

describe('distribuir.yml: cuándo corre y qué anillo', () => {
  it('corre sólo con un tag v* o a mano, nombrando el tag y el anillo', () => {
    expect(yaml).toMatch(/\non:\n {2}push:\n {4}tags: \["v\*"\]\n {2}workflow_dispatch:\n/);
    expect(yaml).not.toMatch(/\n {4}branches:/);
    expect(yaml).toMatch(/\n {6}tag:\n(?: {8}.*\n)*? {8}required: true\n/);
    expect(yaml).toMatch(/\n {6}anillo:\n(?: {8}.*\n)*? {8}options: \["1", "0"\]\n/);
  });

  it('un tag llega sólo a las canarias activas (anillo 0)', () => {
    const plan = correrPreparar(push('v2.1.0'));
    expect(plan.version).toBe('v2.1.0');
    expect(plan.anillo).toBe(0);
    expect(plan.elegidas.map((t) => t.repo)).toEqual(['a/canaria']);
    expect(plan.pausadas.map((t) => t.repo)).toEqual(['a/canaria-pausada']);
    expect(describirPlan(plan)).toMatch(/anillo 1 \(3\) espera.*tag v2\.1\.0 y anillo 1/i);
  });

  it('el anillo 1 sólo con un Run workflow que nombra el tag; una entrada vieja cae en el anillo 1', () => {
    const plan = correrPreparar(aMano('v2.1.0', '1'));
    expect(plan.version).toBe('v2.1.0');
    expect(plan.elegidas.map((t) => t.repo)).toEqual(['a/resto-1', 'a/vieja-sin-campos']);
    expect(plan.pausadas.map((t) => t.repo)).toEqual(['a/resto-pausada']);
    // A mano con anillo 0 repite las canarias, nunca suma el resto.
    expect(correrPreparar(aMano('v2.1.0', '0')).elegidas.map((t) => t.repo)).toEqual(['a/canaria']);
  });

  it('una tienda pausada no recibe nada en ningún anillo', () => {
    for (const ctx of [push('v2.1.0'), aMano('v2.1.0', '0'), aMano('v2.1.0', '1')]) {
      const elegidas = correrPreparar(ctx).lotes.flatMap((l) => l.repos);
      expect(elegidas).not.toContain('a/canaria-pausada');
      expect(elegidas).not.toContain('a/resto-pausada');
    }
  });

  it('a mano sin un tag de versión, o con algo que el shell interpretaría, falla en preparar', () => {
    expect(() => correrPreparar(aMano('', '1'))).toThrow(/tag de versión/);
    expect(() => correrPreparar(aMano('main', '1'))).toThrow(/tag de versión/);
    expect(() => correrPreparar(aMano('v1; rm -rf /', '1'))).toThrow(/tag de versión/);
    expect(validarTag('refs/tags/v2.0.0')).toBe('v2.0.0');
    expect(validarTag('v2.0.0-rc.1')).toBe('v2.0.0-rc.1');
  });

  it('el paso que verifica que el tag existe corre sólo a mano (en un push el tag es el evento)', () => {
    expect(valor(bloqueDePaso('preparar', 'El tag existe'), 'if', 8)).toBe("github.event_name == 'workflow_dispatch'");
  });

  it('tiendas.json se lee de la rama principal, la versión se distribuye desde el tag', () => {
    const preparar = bloqueDeJob('preparar');
    expect(evaluar(valor(preparar, 'ref', 10), push('v2.1.0'))).toBe('main');
    const checkout = bloqueDePaso('distribuir', 'Checkout del template');
    expect(evaluar(valor(checkout, 'ref', 10).replace(/^refs\/tags\//, ''), {
      ...push('v2.1.0'),
      needs: { preparar: { outputs: { version: 'v2.1.0' } } },
    })).toBe('v2.1.0');
    expect(valor(checkout, 'ref', 10).startsWith('refs/tags/')).toBe(true);
    expect(valor(checkout, 'fetch-depth', 10)).toBe('0');
  });

  it('sólo en el template, y dos corridas nunca a la vez ni canceladas a medias', () => {
    expect(valor(bloqueDeJob('preparar'), 'if', 4)).toBe("github.repository == 'antonmarklundcom/ecom'");
    expect(yaml).toMatch(/\nconcurrency:\n {2}group: distribuir\n {2}cancel-in-progress: false\n/);
  });
});

describe('distribuir.yml: la matrix', () => {
  const distribuir = bloqueDeJob('distribuir');
  const si = valor(distribuir, 'if', 4);
  const expresionMatrix = valor(distribuir, 'lote', 8);

  const needs = (lotes: string, token: string) => ({ preparar: { outputs: { lotes, version: 'v2.1.0', hay_token: token } } });

  it('sin lotes o sin token no se arma (y preparar ya dijo por qué)', () => {
    expect(evaluar(si, { ...push('v2'), needs: needs('[]', 'true') })).toBe(false);
    expect(evaluar(si, { ...push('v2'), needs: needs('[{"numero":1,"repos":["a/b"]}]', 'false') })).toBe(false);
    expect(evaluar(si, { ...push('v2'), needs: needs('[{"numero":1,"repos":["a/b"]}]', 'true') })).toBe(true);
    const sinToken = bloqueDePaso('preparar', 'Sin TIENDAS_TOKEN, falla');
    expect(valor(sinToken, 'if', 8)).toBe("steps.elegir.outputs.lotes != '[]' && steps.token.outputs.hay != 'true'");
  });

  it.each([0, 1, 256, 300])('con %i tiendas activas la matrix real entra bajo el tope de 256 jobs', (n) => {
    const registro = JSON.stringify(repos(n).map((repo) => ({ repo, anillo: 1 })));
    const plan = correrPreparar(aMano('v2.1.0', '1'), registro);
    const salidaLotes = JSON.stringify(plan.lotes);
    const matrix = evaluar(expresionMatrix, { ...aMano('v2.1.0', '1'), needs: needs(salidaLotes, 'true') }) as Array<{
      numero: number;
      repos: string[];
    }>;
    expect(matrix.length).toBeLessThanOrEqual(MAX_JOBS);
    expect(matrix.flatMap((l) => l.repos)).toEqual(repos(n));
    expect(evaluar(si, { ...push('v2'), needs: needs(salidaLotes, 'true') })).toBe(n > 0);
    // Cada job recibe sus repos por el `env:` del paso, con la expresión real.
    for (const lote of matrix) {
      const env = valor(bloqueDePaso('distribuir', 'Sincronizar y abrir (o actualizar) los PRs del lote'), 'REPOS', 10);
      expect(JSON.parse(String(evaluar(env, { ...push('v2'), matrix: { lote } })))).toEqual(lote.repos);
    }
  });

  it('max-parallel fijo y fail-fast apagado: una tienda en rojo no corta las demás', () => {
    const paralelo = Number(valor(distribuir, 'max-parallel', 6));
    expect(Number.isInteger(paralelo) && paralelo >= 1 && paralelo <= 20).toBe(true);
    expect(valor(distribuir, 'fail-fast', 6)).toBe('false');
    expect(Number(valor(distribuir, 'timeout-minutes', 4))).toBeGreaterThanOrEqual(TIENDAS_POR_JOB * 2);
  });
});

describe('armarLotes', () => {
  it('0 tiendas: ningún lote', () => {
    expect(armarLotes([])).toEqual([]);
    expect(armarLotes([], { porJob: 1 })).toEqual([]);
  });

  it('1 tienda: un lote', () => {
    expect(armarLotes(['a/b'])).toEqual([{ numero: 1, repos: ['a/b'] }]);
  });

  it('256 tiendas: 256 jobs de una con porJob 1; con el default, lotes de 8', () => {
    expect(armarLotes(repos(256), { porJob: 1 })).toHaveLength(256);
    const lotes = armarLotes(repos(256));
    expect(lotes).toHaveLength(256 / TIENDAS_POR_JOB);
    expect(lotes.every((l) => l.repos.length === TIENDAS_POR_JOB)).toBe(true);
  });

  it('300 tiendas: con porJob 1 no pasa de 256 jobs (lotes de 2); con el default, 38', () => {
    const deUna = armarLotes(repos(300), { porJob: 1 });
    expect(deUna).toHaveLength(150);
    expect(deUna.every((l) => l.repos.length === 2)).toBe(true);
    expect(armarLotes(repos(300))).toHaveLength(Math.ceil(300 / TIENDAS_POR_JOB));
  });

  it('cada tienda una sola vez, en el orden de tiendas.json, numerados desde 1, y nunca más de 256 lotes', () => {
    for (const n of [7, 2049, 5000]) {
      const lotes = armarLotes(repos(n));
      expect(lotes.length).toBeLessThanOrEqual(256);
      expect(lotes.flatMap((l) => l.repos)).toEqual(repos(n));
      expect(lotes.map((l) => l.numero)).toEqual(lotes.map((_, i) => i + 1));
    }
    expect(() => armarLotes(['a/b'], { porJob: 0 })).toThrow(/porJob/);
  });
});

describe('anilloDeLaCorrida', () => {
  it('push = 0 siempre (aunque venga un anillo); a mano, 0 o 1', () => {
    expect(anilloDeLaCorrida({ evento: 'push', anillo: '1' })).toBe(0);
    expect(anilloDeLaCorrida({ evento: 'workflow_dispatch', anillo: '1' })).toBe(1);
    expect(anilloDeLaCorrida({ evento: 'workflow_dispatch', anillo: 0 })).toBe(0);
    expect(() => anilloDeLaCorrida({ evento: 'workflow_dispatch', anillo: '' })).toThrow(/anillo/);
    expect(() => anilloDeLaCorrida({ evento: 'pull_request' })).toThrow(/tag o a mano/);
  });
});

describe('el tiendas.json del template', () => {
  const ruta = join(raiz, 'tiendas.json');

  // Review Q4 (respondida 2026-11-11: lenceria, mascota y anillos pausadas) y F13: ninguna tienda real recibe nada hasta
  // adoptar la historia de migraciones del template (O24).
  it.runIf(existsSync(ruta))('hoy no distribuye a nadie: todas pausadas', () => {
    const contenido = readFileSync(ruta, 'utf8');
    for (const ctx of [push('v2.0.0'), aMano('v2.0.0', '1')]) {
      const plan = correrPreparar(ctx, contenido);
      expect(plan.lotes).toEqual([]);
    }
    const repos = planDistribucion({ contenido, evento: 'push', tag: 'v2.0.0' }).tiendas.map((t) => t.repo);
    expect(repos).toEqual(['antonmarklundcom/lenceria', 'antonmarklundcom/mascota', 'antonmarklundcom/anillos']);
  });
});

// ---------------------------------------------------------------------------
// armar-pr-tiendas.mjs: el rojo
// ---------------------------------------------------------------------------

const completado = {
  estado: 'completado',
  resumen: { traidos: ['src/lib/x.ts'], fusionados: [], restaurados: [], reemplazados: [], conservados: [], conflictos: [] },
  commits: [{ sha: 'a'.repeat(40), asunto: 'arreglo' }],
};
const BOT = 'actions@users.noreply.github.com';

/** Un `sh` falso que graba lo que se le pide y contesta como gh/git. */
function falso({ pr = null as null | { number: number; isDraft: boolean; createdAt: string }, aManoLog = '' } = {}) {
  const llamadas: string[] = [];
  const sh = (cmd: string, args: string[]) => {
    llamadas.push(`${cmd} ${args.join(' ')}`);
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'list') return JSON.stringify(pr ? [pr] : []);
    if (cmd === 'git' && args[0] === 'log') return aManoLog;
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') return 'https://github.com/a/b/pull/9';
    return '';
  };
  const salida: string[] = [];
  return { sh, llamadas, salida, deps: { sh, log: (t: string) => salida.push(t), error: (t: string) => salida.push(t) } };
}

const releases = (...fechas: string[]) => fechas.map((fecha, i) => ({ nombre: `v2.${i}.0`, fecha }));

describe('armar-pr-tiendas: rama editada a mano y PR viejo dejan la tienda en rojo', () => {
  const opciones = { repo: 'a/b', rama: 'template/sync', base: 'main', resultado: completado, sha: 'f'.repeat(40), version: 'v2.3.0' };

  it('PR abierto con commits a mano: rojo, y no se empuja nada', () => {
    const f = falso({
      pr: { number: 7, isDraft: true, createdAt: '2026-11-01T00:00:00Z' },
      aManoLog: `abc1234 ${BOT} Sincronizar maquinaria\ndef5678 dueña@tienda.test Resolver conflicto en checkout\n`,
    });
    expect(armarPr(opciones, f.deps)).toBe(1);
    expect(f.llamadas.some((l) => l.startsWith('git push'))).toBe(false);
    expect(f.llamadas.some((l) => l.startsWith('gh pr edit'))).toBe(false);
    expect(f.salida.join('\n')).toMatch(/::error::a\/b: el PR #7 .*commits hechos a mano/);
    expect(f.salida.join('\n')).toContain('def5678 dueña@tienda.test');
  });

  it('commits a mano pero el PR ya se cerró: la rama se rearma y queda verde', () => {
    const f = falso({ pr: null, aManoLog: 'def5678 dueña@tienda.test algo\n' });
    expect(armarPr(opciones, f.deps)).toBe(0);
    expect(f.llamadas.some((l) => l.startsWith('git push --force origin HEAD:refs/heads/template/sync'))).toBe(true);
    expect(f.llamadas.some((l) => l.startsWith('gh pr create'))).toBe(true);
  });

  it(`PR que sobrevivió a más de ${MAX_VERSIONES_SIN_MERGEAR} versiones: se actualiza igual, y rojo`, () => {
    const pr = { number: 7, isDraft: false, createdAt: '2026-11-01T00:00:00Z' };
    const tres = releases('2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z', '2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z');
    const f = falso({ pr });
    expect(armarPr({ ...opciones, releases: tres }, f.deps)).toBe(1);
    expect(f.llamadas.some((l) => l.startsWith('git push --force'))).toBe(true);
    expect(f.llamadas.some((l) => l.startsWith('gh pr edit 7'))).toBe(true);
    expect(f.salida.at(-1)).toMatch(/::error::a\/b: el PR #7 de sync está abierto desde hace 3 versiones/);

    // Con dos versiones nuevas todavía es verde.
    const g = falso({ pr });
    expect(armarPr({ ...opciones, releases: tres.slice(0, 3) }, g.deps)).toBe(0);
  });

  it('sin cambios no mira PRs ni empuja; una precondición es rojo', () => {
    const f = falso();
    expect(armarPr({ ...opciones, resultado: { estado: 'sin-cambios' } }, f.deps)).toBe(0);
    expect(f.llamadas).toEqual([]);
    expect(armarPr({ ...opciones, resultado: { estado: 'precondicion', mensaje: 'migraciones propias' } }, falso().deps)).toBe(1);
  });

  it('versionesDesde cuenta los tags posteriores a la apertura del PR', () => {
    const r = releases('2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z', '2026-11-12T00:00:00Z');
    expect(versionesDesde('2026-11-01T00:00:00Z', r)).toBe(2);
    expect(versionesDesde('2026-12-01T00:00:00Z', r)).toBe(0);
    expect(versionesDesde(undefined, r)).toBe(0);
    expect(decidir({ repo: 'a/b', rama: 'r', resultado: completado, existente: { number: 1 }, versiones: 3 }).vencido).toMatch(
      /3 versiones/,
    );
  });
});

describe('commitsAMano contra un repo de verdad', () => {
  const dir = mkdtempSync(join(tmpdir(), 'o28-a-mano-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Sin las GIT_* del entorno (ver el helper): dentro del pre-push, un
  // `git init` acá reinicializaba el repo del template.
  const env = envSinGit();
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (cwd: string, email: string, archivo: string, asunto: string) => {
    writeFileSync(join(cwd, archivo), asunto);
    git(cwd, 'add', archivo);
    git(cwd, '-c', `user.name=x`, '-c', `user.email=${email}`, 'commit', '-q', '-m', asunto);
  };

  it('ve el commit de la dueña en template/sync y no los del bot', () => {
    const origen = join(dir, 'origen');
    git(dir, 'init', '-q', '-b', 'main', origen);
    commit(origen, 'dueña@tienda.test', 'a.txt', 'inicio');
    git(origen, 'checkout', '-q', '-b', 'template/sync');
    commit(origen, BOT, 'b.txt', 'Sincronizar maquinaria del template');
    commit(origen, 'dueña@tienda.test', 'c.txt', 'Resolver conflicto a mano');
    git(origen, 'checkout', '-q', 'main');

    const clon = join(dir, 'clon');
    git(dir, 'clone', '-q', origen, clon);
    const correr = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: clon, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const aMano = commitsAMano('main', 'template/sync', BOT, correr);
    expect(aMano).toHaveLength(1);
    expect(aMano[0]).toMatch(/dueña@tienda\.test Resolver conflicto a mano$/);
    // Una rama que no existe todavía: nada a mano.
    expect(commitsAMano('main', 'template/otra', BOT, correr)).toEqual([]);
  });
});

describe('distribuir-lote', () => {
  it('una tienda en rojo no frena a las otras del lote, y el lote sale en rojo', () => {
    const vistas: string[] = [];
    const { resultados, codigo } = distribuirLote(['a/uno', 'a/dos', 'a/tres'], (repo) => {
      vistas.push(repo);
      if (repo === 'a/dos') throw new Error('no pude clonarla\nmás detalle');
      return { ok: true, detalle: 'PR #3 actualizado' };
    });
    expect(vistas).toEqual(['a/uno', 'a/dos', 'a/tres']);
    expect(codigo).toBe(1);
    expect(resultados.map((r) => r.ok)).toEqual([true, false, true]);
    expect(tablaResumen(resultados, 'v2.1.0')).toContain('| `a/dos` | ✗ | no pude clonarla |');
    expect(distribuirLote(['a/uno'], () => ({ ok: true, detalle: 'al día' })).codigo).toBe(0);
  });
});

describe('envSinGit', () => {
  it('saca todas las GIT_* (las que exporta un hook) y deja el resto', () => {
    const env = envSinGit({
      PATH: '/bin',
      GIT_DIR: '/repo/.git',
      GIT_WORK_TREE: '/repo',
      GIT_INDEX_FILE: '/repo/.git/index',
      GIT_COMMON_DIR: '/repo/.git',
      GIT_PREFIX: '',
      GIT_CONFIG_COUNT: '1',
      git_dir: 'en Windows las variables no distinguen mayúsculas',
    });
    expect(env).toEqual({ PATH: '/bin' });
  });

  it('sacarGitDelEntorno limpia un entorno en el lugar', () => {
    const env: Record<string, string | undefined> = { PATH: '/bin', GIT_DIR: '/repo/.git', Git_Work_Tree: '/repo' };
    sacarGitDelEntorno(env);
    expect(env).toEqual({ PATH: '/bin' });
  });

  it.each(['scripts/ci/distribuir-lote.mjs', 'scripts/ci/armar-pr-tiendas.mjs', 'scripts/template-atraso.ts', 'scripts/ensayar-distribucion.ts'])(
    '%s limpia las GIT_* al arrancar como CLI',
    (ruta) => {
      const fuente = readFileSync(join(process.cwd(), ruta), 'utf8');
      expect(fuente).toMatch(/if \(process\.argv\[1\][^\n]*\{\s*(\/\/[^\n]*\s*)?sacarGitDelEntorno\(\);/);
    },
  );
});
