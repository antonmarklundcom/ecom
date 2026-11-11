import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { releasesDelTemplate, versionesDesde, MAX_VERSIONES_SIN_MERGEAR } from './ci/armar-pr-tiendas.mjs';
import { leerTiendas, urlDeClon, type Tienda } from './ensayar-distribucion';
import { commitsClasificados, gitEn, parseBaseline } from './template-shared';

/**
 * `pnpm template:atraso` — cuánto le falta a cada tienda de `tiendas.json`
 * respecto del template, en una tabla: baseline (`.template-baseline` de su
 * rama principal), commits del template que no tiene (y cuántos tocan
 * maquinaria), y la edad del PR de sync abierto (días y versiones del
 * template desde que se abrió; más de dos versiones deja la distribución en
 * rojo, `scripts/ci/armar-pr-tiendas.mjs`).
 *
 *   pnpm template:atraso                       # tiendas.json contra main
 *   pnpm template:atraso --ref v2.0.0          # contra otra punta del template
 *   pnpm template:atraso --tiendas otro.json --origen C:/arnes/stores
 *                                              # repos locales (el arnés), sin GitHub
 *   pnpm template:atraso --json
 *
 * Sólo lee: `gh api` y `gh pr list` contra cada tienda (con tu sesión de gh),
 * o `git show` en el repo local con `--origen`. No escribe nada en ningún lado.
 */

export type Opciones = { tiendas: string | null; origen: string | null; ref: string; json: boolean };

export function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = { tiendas: null, origen: null, ref: 'main', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const v = argv[i + 1];
    const tomar = (que: string): string => {
      if (!v || v.startsWith('--')) throw new Error(`${flag} espera ${que}`);
      i += 1;
      return v;
    };
    if (flag === '--json') opciones.json = true;
    else if (flag === '--tiendas') opciones.tiendas = tomar('la ruta de un tiendas.json');
    else if (flag === '--origen') opciones.origen = tomar('una carpeta con un repo por tienda');
    else if (flag === '--ref') opciones.ref = tomar('una rama, tag o commit del template');
    else throw new Error(`no conozco la opción "${flag}"`);
  }
  return opciones;
}

export type Release = { nombre?: string; fecha?: string };

export type PrDeSync = { numero: number; creadoEn: string } | null;

export type Fila = {
  repo: string;
  anillo: 0 | 1;
  estado: 'activa' | 'pausada';
  baseline: string | null;
  /** Commits del template después del baseline (sin merges), o null si no se pudo contar. */
  atras: number | null;
  atrasMaquinaria: number | null;
  /** null = no hay PR abierto; undefined = no se pudo saber. */
  pr: PrDeSync | undefined;
  nota: string | null;
};

/** "3 d · 1 versión" para un PR abierto el `creadoEn`. */
export function edadPr(pr: PrDeSync | undefined, ahora: Date, releases: Release[]): string {
  if (pr === undefined) return '?';
  if (pr === null) return 'sin PR abierto';
  const dias = Math.max(0, Math.floor((ahora.getTime() - Date.parse(pr.creadoEn)) / 86_400_000));
  const versiones = versionesDesde(pr.creadoEn, releases);
  const alarma = versiones > MAX_VERSIONES_SIN_MERGEAR ? ' ⚠ distribución en rojo' : '';
  return `#${pr.numero}: ${dias} d · ${versiones} versión(es)${alarma}`;
}

/** La tabla, una fila por tienda, en el orden de `tiendas.json`. */
export function tablaAtraso(filas: Fila[], ahora: Date, releases: Release[]): string {
  const encabezado = ['Tienda', 'Anillo', 'Estado', 'Baseline', 'Commits atrás (maquinaria)', 'PR de sync'];
  const cuerpo = filas.map((f) => [
    f.repo,
    String(f.anillo),
    f.estado,
    f.baseline ? f.baseline.slice(0, 12) : '—',
    f.atras === null ? '—' : `${f.atras} (${f.atrasMaquinaria ?? '?'})`,
    edadPr(f.pr, ahora, releases) + (f.nota ? ` — ${f.nota}` : ''),
  ]);
  const anchos = encabezado.map((titulo, i) => Math.max(titulo.length, ...cuerpo.map((fila) => (fila[i] ?? '').length)));
  const linea = (celdas: string[]) => `| ${celdas.map((c, i) => c.padEnd(anchos[i] ?? 0)).join(' | ')} |`;
  return [linea(encabezado), `|${anchos.map((a) => '-'.repeat(a + 2)).join('|')}|`, ...cuerpo.map(linea)].join('\n');
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** El `.template-baseline` de la rama principal de la tienda. */
function leerBaseline(tienda: Tienda, origen: string | null): string | null {
  const contenido = origen
    ? gitEn(urlDeClon(tienda.repo, origen), ['show', 'HEAD:.template-baseline'])
    : Buffer.from(gh(['api', `repos/${tienda.repo}/contents/.template-baseline`, '--jq', '.content']).replace(/\s/g, ''), 'base64').toString('utf8');
  return parseBaseline(contenido);
}

function leerPr(tienda: Tienda, origen: string | null): PrDeSync | undefined {
  if (origen) return null; // un repo local no tiene PRs
  const lista = JSON.parse(
    gh(['pr', 'list', '-R', tienda.repo, '--head', 'template/sync', '--state', 'open', '--json', 'number,createdAt']),
  ) as Array<{ number: number; createdAt: string }>;
  const pr = lista[0];
  return pr ? { numero: pr.number, creadoEn: pr.createdAt } : null;
}

export function filaDe(raiz: string, tienda: Tienda, opciones: Opciones): Fila {
  const fila: Fila = {
    repo: tienda.repo,
    anillo: tienda.anillo,
    estado: tienda.estado,
    baseline: null,
    atras: null,
    atrasMaquinaria: null,
    pr: undefined,
    nota: null,
  };
  try {
    fila.baseline = leerBaseline(tienda, opciones.origen);
    if (!fila.baseline) fila.nota = 'sin .template-baseline legible';
  } catch {
    fila.nota = 'no pude leer la tienda (¿existe? ¿tenés acceso?)';
    return fila;
  }
  if (fila.baseline) {
    try {
      const commits = commitsClasificados(raiz, fila.baseline, opciones.ref);
      fila.atras = commits.length;
      fila.atrasMaquinaria = commits.filter((c) => c.maquinaria).length;
    } catch {
      fila.nota = `el baseline no está en la historia del template (${opciones.ref})`;
    }
  }
  try {
    fila.pr = leerPr(tienda, opciones.origen);
  } catch {
    fila.pr = undefined;
  }
  return fila;
}

function main(): void {
  const opciones = parseArgs(process.argv.slice(2));
  const raiz = process.cwd();
  const ruta = opciones.tiendas ? resolve(opciones.tiendas) : join(raiz, 'tiendas.json');
  const tiendas = leerTiendas(readFileSync(ruta, 'utf8'));
  const releases = releasesDelTemplate(raiz);
  const filas = tiendas.map((tienda) => filaDe(raiz, tienda, opciones));

  if (opciones.json) {
    console.log(JSON.stringify(filas, null, 2));
    return;
  }
  const punta = gitEn(raiz, ['rev-parse', '--short=12', opciones.ref]).trim();
  console.log(`\n  Atraso de cada tienda de ${ruta} respecto de ${opciones.ref} (${punta}), ${releases.length} versión(es) publicadas:\n`);
  if (filas.length === 0) console.log('  tiendas.json está vacío.');
  else console.log(tablaAtraso(filas, new Date(), releases));
  console.log('');
}

if (process.argv[1] && /template-atraso\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
