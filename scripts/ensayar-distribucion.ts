import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { armarLotes, elegirTiendas, leerTiendas as leerTiendasCi } from './ci/elegir-tiendas.mjs';
import { gitEn } from './template-shared';
import { ejecutarSync, type ResultadoSync } from './template-sync';

/**
 * `pnpm template:ensayar-distribucion` — lo que haría `distribuir.yml` con
 * cada tienda, sin empujar nada y sin gastar minutos de Actions.
 *
 * Primero muestra el plan, con la misma elección que el workflow
 * (`scripts/ci/elegir-tiendas.mjs`): qué tiendas recibiría un tag (anillo 0),
 * cuáles el "Run workflow" del anillo 1, cuáles están pausadas, y en cuántos
 * jobs. Después clona cada tienda elegida en una carpeta temporal, le corre
 * `template:sync` desde **esta** rama del template (igual que el workflow, que
 * corre la versión del tag), y cuenta qué pasó. Con `--verificar`, además
 * instala y corre `typecheck`, `lint` y los unitarios de cada tienda ya
 * sincronizada: es la mejor aproximación local a lo que va a decir el CI de
 * cada tienda cuando llegue el PR.
 *
 *   pnpm template:ensayar-distribucion                    # las activas de tiendas.json, los dos anillos
 *   pnpm template:ensayar-distribucion --anillo 0         # sólo lo que recibiría el tag
 *   pnpm template:ensayar-distribucion --incluir-pausadas # también las pausadas
 *   pnpm template:ensayar-distribucion --verificar        # + typecheck/lint/unitarios
 *   pnpm template:ensayar-distribucion --repo dueño/tienda  # una sola (repetible), pausada o no
 *   pnpm template:ensayar-distribucion --tiendas otro.json --origen C:/arnes/stores
 *                                       # otro registro; clona <origen>/<nombre> en vez de GitHub
 *   pnpm template:ensayar-distribucion --conservar        # no borra los clones
 *
 * Sólo mira lo commiteado en la rama actual: commiteá antes de correrlo.
 * Las tiendas privadas se clonan con tus credenciales de git.
 */

export type Tienda = {
  repo: string;
  dominio?: string;
  notas?: string;
  anillo: 0 | 1;
  estado: 'activa' | 'pausada';
};

/** `tiendas.json` validado y con `anillo`/`estado` completos (ver `scripts/ci/elegir-tiendas.mjs`). */
export function leerTiendas(contenido: string): Tienda[] {
  return leerTiendasCi(contenido) as Tienda[];
}

export type Opciones = {
  verificar: boolean;
  conservar: boolean;
  repos: string[];
  tiendas: string | null;
  origen: string | null;
  anillo: 0 | 1 | null;
  incluirPausadas: boolean;
};

export function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = {
    verificar: false,
    conservar: false,
    repos: [],
    tiendas: null,
    origen: null,
    anillo: null,
    incluirPausadas: false,
  };
  const valor = (i: number, que: string): string => {
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) throw new Error(`${argv[i]} espera ${que}`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--verificar') opciones.verificar = true;
    else if (flag === '--conservar') opciones.conservar = true;
    else if (flag === '--incluir-pausadas') opciones.incluirPausadas = true;
    else if (flag === '--repo') {
      opciones.repos.push(valor(i, '"dueño/nombre"'));
      i += 1;
    } else if (flag === '--tiendas') {
      opciones.tiendas = valor(i, 'la ruta de un tiendas.json');
      i += 1;
    } else if (flag === '--origen') {
      opciones.origen = valor(i, 'una carpeta con un repo por tienda');
      i += 1;
    } else if (flag === '--anillo') {
      const v = valor(i, '0 o 1');
      if (v !== '0' && v !== '1') throw new Error('--anillo espera 0 o 1');
      opciones.anillo = v === '0' ? 0 : 1;
      i += 1;
    } else throw new Error(`no conozco la opción "${flag}"`);
  }
  return opciones;
}

/** De dónde se clona una tienda: GitHub, o `<origen>/<nombre>` (el arnés). */
export function urlDeClon(repo: string, origen: string | null): string {
  if (!origen) return `https://github.com/${repo}.git`;
  const nombre = repo.split('/')[1] ?? repo;
  return resolve(origen, nombre);
}

export type PlanEnsayo = {
  porAnillo: Array<{ anillo: 0 | 1; elegidas: string[]; pausadas: string[]; jobs: number }>;
  aSincronizar: string[];
};

/** Qué recibiría cada anillo y qué se sincroniza en este ensayo. */
export function planEnsayo(tiendas: Tienda[], opciones: Pick<Opciones, 'anillo' | 'incluirPausadas'>): PlanEnsayo {
  const anillos: Array<0 | 1> = opciones.anillo === null ? [0, 1] : [opciones.anillo];
  const porAnillo = anillos.map((anillo) => {
    const { elegidas, pausadas } = elegirTiendas(tiendas, anillo);
    const repos = elegidas.map((t: Tienda) => t.repo);
    return { anillo, elegidas: repos, pausadas: pausadas.map((t: Tienda) => t.repo), jobs: armarLotes(repos).length };
  });
  const aSincronizar = porAnillo.flatMap((a) => (opciones.incluirPausadas ? [...a.elegidas, ...a.pausadas] : a.elegidas));
  return { porAnillo, aSincronizar };
}

function correr(comando: string, args: string[], cwd: string): { ok: boolean; salida: string } {
  try {
    const salida = execFileSync(comando, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Igual que probar-tienda-nueva.ts: sin base de tests, los de
      // integración se saltan en vez de intentar conectarse.
      env: { ...process.env, TEST_DATABASE_URL: '' },
      // pnpm es pnpm.cmd en Windows.
      shell: process.platform === 'win32' && comando === 'pnpm',
    });
    return { ok: true, salida };
  } catch (error) {
    const fallo = error as { stdout?: string; stderr?: string };
    return { ok: false, salida: `${fallo.stdout ?? ''}${fallo.stderr ?? ''}` };
  }
}

function describir(resultado: ResultadoSync): string {
  switch (resultado.estado) {
    case 'sin-cambios':
      return 'al día, no abriría PR';
    case 'precondicion':
      return `no arranca: ${resultado.mensaje.split('\n')[0]}`;
    case 'dry-run':
      return 'dry-run';
    default: {
      const r = resultado.resumen;
      const partes = [
        `${r.traidos.length} traídos`,
        `${r.fusionados.length} fusionados`,
        `${r.restaurados.length} restaurados`,
        `${r.reemplazados.length} pisados por el template`,
        `${r.conservados.length} de la tienda sin tocar`,
      ];
      if (resultado.estado === 'conflicto') {
        return `PR en DRAFT, ${r.conflictos.length} conflicto(s): ${r.conflictos.map((c) => c.ruta).join(', ')} — ${partes.join(', ')}`;
      }
      return `PR listo — ${partes.join(', ')}`;
    }
  }
}

function imprimirPlan(plan: PlanEnsayo): void {
  for (const a of plan.porAnillo) {
    const quien = a.anillo === 0 ? 'anillo 0 (lo que recibe un tag)' : 'anillo 1 (Run workflow con el tag y anillo 1)';
    console.log(`  ${quien}: ${a.elegidas.length} activa(s) en ${a.jobs} job(s)${a.elegidas.length ? ` — ${a.elegidas.join(', ')}` : ''}`);
    if (a.pausadas.length) console.log(`      pausadas, no reciben nada: ${a.pausadas.join(', ')}`);
  }
  console.log('');
}

function main(): void {
  const opciones = parseArgs(process.argv.slice(2));
  const raiz = process.cwd();

  const rama = gitEn(raiz, ['branch', '--show-current']).trim();
  if (!rama) throw new Error('Estás con el HEAD suelto: pasate a una rama (el ensayo sincroniza contra una rama del template).');

  let repos = opciones.repos;
  if (repos.length === 0) {
    const ruta = opciones.tiendas ? resolve(opciones.tiendas) : join(raiz, 'tiendas.json');
    const plan = planEnsayo(leerTiendas(readFileSync(ruta, 'utf8')), opciones);
    console.log(`\n  Plan de ${ruta} (la misma elección que distribuir.yml):`);
    imprimirPlan(plan);
    repos = plan.aSincronizar;
    if (repos.length === 0) {
      console.log('  Ninguna tienda para ensayar (pasá --incluir-pausadas, o --repo dueño/tienda para probar una).\n');
      return;
    }
  }

  console.log(`  Ensayo de la distribución desde la rama "${rama}" del template (nada se empuja).\n`);
  let fallas = 0;

  for (const repo of repos) {
    const carpeta = mkdtempSync(join(tmpdir(), `ensayo-${repo.replace('/', '-')}-`));
    const tienda = join(carpeta, 'tienda');
    try {
      const clon = correr('git', ['clone', '-q', urlDeClon(repo, opciones.origen), tienda], carpeta);
      if (!clon.ok) {
        console.log(`  ✗ ${repo}: no pude clonarlo\n${clon.salida}`);
        fallas += 1;
        continue;
      }
      gitEn(tienda, ['config', 'user.name', 'ensayo']);
      gitEn(tienda, ['config', 'user.email', 'ensayo@example.com']);
      gitEn(tienda, ['remote', 'add', 'template', raiz]);

      const resultado = ejecutarSync(tienda, {
        remoto: 'template',
        rama,
        dryRun: false,
        hasta: null,
        sinTests: true,
        ramaDestino: 'template/sync',
        commitearConflictos: true,
      });
      const marca = resultado.estado === 'completado' || resultado.estado === 'sin-cambios' ? '✓' : '✗';
      if (marca === '✗') fallas += 1;
      console.log(`  ${marca} ${repo}: ${describir(resultado)}`);

      if (opciones.verificar && (resultado.estado === 'completado' || resultado.estado === 'conflicto')) {
        const instalar = existsSync(join(tienda, 'pnpm-lock.yaml'))
          ? correr('pnpm', ['install', '--frozen-lockfile'], tienda)
          : { ok: false, salida: 'sin pnpm-lock.yaml' };
        const pasos: Array<[string, { ok: boolean; salida: string }]> = [['install', instalar]];
        if (instalar.ok) {
          pasos.push(['typecheck', correr('pnpm', ['typecheck'], tienda)]);
          pasos.push(['lint', correr('pnpm', ['lint'], tienda)]);
          pasos.push(['test', correr('pnpm', ['test'], tienda)]);
        }
        for (const [nombre, paso] of pasos) {
          console.log(`      ${paso.ok ? '✓' : '✗'} ${nombre}`);
          if (!paso.ok) {
            fallas += 1;
            const cola = paso.salida.trim().split('\n').slice(-15);
            for (const linea of cola) console.log(`          ${linea}`);
          }
        }
      }
    } finally {
      if (opciones.conservar) console.log(`      (clon en ${tienda})`);
      else rmSync(carpeta, { recursive: true, force: true });
    }
  }

  console.log('');
  if (fallas > 0) process.exitCode = 1;
}

if (process.argv[1] && /ensayar-distribucion\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
