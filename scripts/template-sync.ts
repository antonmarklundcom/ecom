import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import {
  BASELINE_FILE,
  commitsClasificados,
  type Commit,
  contenidoBaseline,
  gitEn,
  parseBaseline,
  remotoExiste,
} from './template-shared';

/**
 * `pnpm template:sync` — traer la maquinaria del template con un comando.
 *
 * `pnpm template:diff` dice qué le falta a esta tienda; traerlo seguía siendo
 * cherry-pick manual, commit por commit. Sincronizar tres tiendas costó tres
 * sesiones de IA, y los conflictos fueron siempre los mismos y aburridos:
 * `fable/` (las tiendas no lo tienen — es el plan de endurecimiento del
 * template), `pnpm-lock.yaml` (nunca se resuelve a mano) y los workflows de
 * CI (la tienda gana o pierde según lo que decida cada una, pero en la
 * práctica siempre gana el del template). Los conflictos reales en `src/`
 * fueron cero.
 *
 * Esto automatiza exactamente eso: cherry-pickea, del más viejo al más nuevo,
 * sólo los commits marcados como maquinaria por `template-shared.ts`;
 * resuelve esos tres casos solo; y para en seco —dejando todo aplicado hasta
 * ahí, sin tocar el baseline— ante cualquier otro conflicto, con instrucciones
 * para terminarlo a mano y retomar.
 *
 *   pnpm template:sync                    # trae todo lo pendiente
 *   pnpm template:sync --dry-run          # qué haría, sin tocar nada
 *   pnpm template:sync --hasta <sha>      # para en un commit dado
 *   pnpm template:sync --sin-tests        # no corre typecheck/lint/test al final
 */

const URL_TEMPLATE = 'https://github.com/antonmarklundcom/ecom.git';

export type Opciones = {
  remoto: string;
  rama: string;
  dryRun: boolean;
  hasta: string | null;
  sinTests: boolean;
};

export function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = {
    remoto: 'template',
    rama: 'main',
    dryRun: false,
    hasta: null,
    sinTests: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];

    if (flag === '--dry-run') {
      opciones.dryRun = true;
      continue;
    }
    if (flag === '--sin-tests') {
      opciones.sinTests = true;
      continue;
    }
    if (flag === '--hasta' || flag === '--remoto' || flag === '--rama') {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith('--')) throw new Error(`${flag} espera un valor`);
      if (flag === '--hasta') opciones.hasta = valor;
      else if (flag === '--remoto') opciones.remoto = valor;
      else opciones.rama = valor;
      i += 1;
      continue;
    }

    throw new Error(`no conozco la opción "${flag}"`);
  }

  return opciones;
}

/** Sólo los de maquinaria, del más viejo al más nuevo (`git log` da lo nuevo primero). */
export function ordenarParaAplicar(commits: Commit[]): Commit[] {
  return commits
    .filter((commit) => commit.maquinaria)
    .slice()
    .reverse();
}

const TRAILER_CHERRY_PICK = /cherry picked from commit ([0-9a-f]{40})/g;

/**
 * SHAs del template que ya están en esta rama, leyendo los trailers que deja
 * `git cherry-pick -x` en el mensaje de cada commit.
 *
 * Esto es lo que hace que `template:sync` sea reanudable sin guardar estado
 * propio: si una corrida anterior se cortó a mitad de camino (conflicto
 * resuelto a mano, `--hasta`, lo que sea), la próxima corrida vuelve a mirar
 * el log y salta lo que ya está.
 */
export function shasYaAplicados(logDesdeBaseline: string): Set<string> {
  const shas = new Set<string>();
  for (const match of logDesdeBaseline.matchAll(TRAILER_CHERRY_PICK)) {
    if (match[1]) shas.add(match[1]);
  }
  return shas;
}

export function commitsPendientes(ordenados: Commit[], yaAplicados: ReadonlySet<string>): Commit[] {
  return ordenados.filter((commit) => !yaAplicados.has(commit.sha));
}

/** Corta la lista en (e incluyendo) el commit pedido. Tira si no está. */
export function cortarHasta(ordenados: Commit[], hasta: string | null): Commit[] {
  if (!hasta) return ordenados;
  const normalizado = hasta.toLowerCase();
  const indice = ordenados.findIndex((commit) => commit.sha.toLowerCase().startsWith(normalizado));
  if (indice === -1) {
    throw new Error(
      `"${hasta}" no está entre los commits de maquinaria pendientes ` +
        '(¿ya se aplicó, no es un SHA del template, o no toca la maquinaria?).',
    );
  }
  return ordenados.slice(0, indice + 1);
}

export type AccionConflicto = 'eliminar' | 'lockfile' | 'usar-template' | 'manual';

/**
 * Los tres conflictos aburridos que se repiten en cada sync (ver el comentario
 * de arriba), y todo lo demás cae en "manual" — que es la señal de parar.
 */
export function clasificarConflicto(archivo: string): AccionConflicto {
  if (archivo.startsWith('fable/')) return 'eliminar';
  if (archivo === 'pnpm-lock.yaml') return 'lockfile';
  if (archivo.startsWith('.github/workflows/') && /\.ya?ml$/.test(archivo)) return 'usar-template';
  return 'manual';
}

export function necesitaInstall(archivosTocados: readonly string[]): boolean {
  return archivosTocados.includes('package.json');
}

// ---------------------------------------------------------------------------
// De acá para abajo, git (y pnpm) de verdad.
// ---------------------------------------------------------------------------

export type ResultadoSync =
  | { estado: 'sin-cambios' }
  | { estado: 'dry-run'; pendientes: Commit[] }
  | { estado: 'precondicion'; mensaje: string }
  | { estado: 'conflicto-manual'; sha: string; asunto: string; archivos: string[]; mensaje: string }
  | { estado: 'fallo-post'; mensaje: string; aplicados: Commit[]; salteados: Commit[] }
  | { estado: 'completado'; aplicados: Commit[]; salteados: Commit[]; baseline: string };

function ramaActual(cwd: string): string {
  return gitEn(cwd, ['branch', '--show-current']).trim();
}

function treeSucio(cwd: string): boolean {
  return gitEn(cwd, ['status', '--porcelain']).trim() !== '';
}

function rutaGit(cwd: string, nombre: string): string {
  const salida = gitEn(cwd, ['rev-parse', '--git-path', nombre]).trim();
  return isAbsolute(salida) ? salida : join(cwd, salida);
}

function cherryPickEnCurso(cwd: string): boolean {
  return existsSync(rutaGit(cwd, 'CHERRY_PICK_HEAD'));
}

function archivosEnConflicto(cwd: string): string[] {
  return gitEn(cwd, ['diff', '--name-only', '--diff-filter=U'])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

type ResultadoIntento = 'ok' | 'conflicto' | 'vacio';

function intentarCherryPick(cwd: string, sha: string): ResultadoIntento {
  try {
    gitEn(cwd, ['cherry-pick', '-x', sha]);
    return 'ok';
  } catch {
    if (archivosEnConflicto(cwd).length > 0) return 'conflicto';
    if (cherryPickEnCurso(cwd)) return 'vacio';
    throw new Error(`git cherry-pick -x ${sha.slice(0, 12)} falló de una forma que no reconozco.`);
  }
}

function resolverArchivoConflicto(cwd: string, archivo: string, accion: AccionConflicto): void {
  if (accion === 'eliminar') {
    gitEn(cwd, ['rm', '-f', '--', archivo]);
    return;
  }
  if (accion === 'usar-template') {
    gitEn(cwd, ['checkout', '--theirs', '--', archivo]);
    gitEn(cwd, ['add', '--', archivo]);
    return;
  }
  // 'lockfile' se resuelve aparte (regenerarLockfile), no archivo por archivo.
}

function regenerarLockfile(cwd: string): void {
  execFileSync('pnpm', ['install', '--lockfile-only'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function continuarCherryPick(cwd: string): void {
  gitEn(cwd, ['-c', 'core.editor=true', 'cherry-pick', '--continue']);
}

function saltarCherryPick(cwd: string): void {
  gitEn(cwd, ['cherry-pick', '--skip']);
}

/**
 * Resolver un conflicto puede dejar el commit vacío — típicamente `fable/`:
 * si se descarta el lado del template y no queda otro archivo con cambios
 * reales, el diff contra HEAD es nulo. `--continue` rechaza eso ("nothing to
 * commit"); hay que `--skip` en su lugar, igual que un commit que ya estaba
 * aplicado bajo otro SHA.
 */
function quedanCambiosParaCommitear(cwd: string): boolean {
  try {
    execFileSync('git', ['-C', cwd, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
}

function mensajeDeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const conSalida = error as { stderr?: unknown; message?: unknown };
    const stderr =
      typeof conSalida.stderr === 'string'
        ? conSalida.stderr
        : conSalida.stderr instanceof Buffer
          ? conSalida.stderr.toString('utf8')
          : '';
    if (stderr.trim() !== '') return stderr.trim();
    if (typeof conSalida.message === 'string') return conSalida.message;
  }
  return String(error);
}

/**
 * El corazón del comando. Nada de esto imprime a consola ni llama a
 * `process.exit`: eso es cosa de `main()`, para que esta función se pueda
 * llamar directo desde un test de integración contra un repo temporal.
 */
export function ejecutarSync(cwd: string, opciones: Opciones): ResultadoSync {
  if (ramaActual(cwd) === 'main') {
    return {
      estado: 'precondicion',
      mensaje:
        'Estás parado en "main". `template:sync` trae commits con `git cherry-pick`: ' +
        'creá o cambiá a una rama de feature y volvé a correrlo ahí.',
    };
  }

  if (cherryPickEnCurso(cwd)) {
    return {
      estado: 'precondicion',
      mensaje:
        'Hay un cherry-pick sin terminar de una corrida anterior.\n\n' +
        '  Resolvé el conflicto, `git add` lo que corresponda y:\n\n' +
        '    git cherry-pick --continue\n\n' +
        '  Después volvé a correr `pnpm template:sync` — retoma solo desde el primer\n' +
        '  commit no aplicado.',
    };
  }

  if (treeSucio(cwd)) {
    return {
      estado: 'precondicion',
      mensaje: 'El working tree tiene cambios sin commitear. Commiteá o guardalos antes de sincronizar.',
    };
  }

  if (!remotoExiste(cwd, opciones.remoto)) {
    gitEn(cwd, ['remote', 'add', opciones.remoto, URL_TEMPLATE]);
  }

  try {
    gitEn(cwd, ['fetch', opciones.remoto, opciones.rama]);
  } catch {
    return {
      estado: 'precondicion',
      mensaje: `No pude traer ${opciones.remoto}/${opciones.rama}. ¿Tenés acceso al repo del template?`,
    };
  }

  const ref = `${opciones.remoto}/${opciones.rama}`;
  const cabezaTemplate = gitEn(cwd, ['rev-parse', ref]).trim();

  if (!existsSync(join(cwd, BASELINE_FILE))) {
    return {
      estado: 'precondicion',
      mensaje:
        `No hay ${BASELINE_FILE} en este repo, así que no sé desde dónde traer.\n\n` +
        '  Marcá primero un punto de partida conocido:\n\n' +
        '    pnpm template:diff --marcar\n',
    };
  }

  const baseline = parseBaseline(readFileSync(join(cwd, BASELINE_FILE), 'utf8'));
  if (!baseline) {
    return {
      estado: 'precondicion',
      mensaje: `${BASELINE_FILE} existe pero no tiene un SHA válido. Corré \`pnpm template:diff --marcar\` para reescribirlo.`,
    };
  }

  const ordenados = ordenarParaAplicar(commitsClasificados(cwd, baseline, ref));
  const logDesdeBaseline =
    ordenados.length > 0 ? gitEn(cwd, ['log', '--format=%B', `${baseline}..HEAD`]) : '';
  let pendientes = commitsPendientes(ordenados, shasYaAplicados(logDesdeBaseline));

  if (opciones.hasta) {
    try {
      pendientes = cortarHasta(pendientes, opciones.hasta);
    } catch (error) {
      return { estado: 'precondicion', mensaje: mensajeDeError(error) };
    }
  }

  if (pendientes.length === 0) {
    return { estado: 'sin-cambios' };
  }

  if (opciones.dryRun) {
    return { estado: 'dry-run', pendientes };
  }

  const headInicial = gitEn(cwd, ['rev-parse', 'HEAD']).trim();
  const aplicados: Commit[] = [];
  const salteados: Commit[] = [];

  for (const commit of pendientes) {
    const resultado = intentarCherryPick(cwd, commit.sha);

    if (resultado === 'vacio') {
      saltarCherryPick(cwd);
      salteados.push(commit);
      continue;
    }

    if (resultado === 'conflicto') {
      const acciones = archivosEnConflicto(cwd).map(
        (archivo) => [archivo, clasificarConflicto(archivo)] as const,
      );
      const manuales = acciones.filter(([, accion]) => accion === 'manual').map(([archivo]) => archivo);

      if (manuales.length > 0) {
        return {
          estado: 'conflicto-manual',
          sha: commit.sha,
          asunto: commit.asunto,
          archivos: manuales,
          mensaje:
            `Conflicto en ${commit.sha.slice(0, 12)} "${commit.asunto}" que no puedo resolver solo:\n\n` +
            manuales.map((archivo) => `    - ${archivo}`).join('\n') +
            '\n\n  Resolvelo a mano y seguí:\n\n' +
            '    1. Editá esos archivos y sacá los marcadores de conflicto\n' +
            '    2. git add <archivo(s)>\n' +
            '    3. git cherry-pick --continue\n' +
            '    4. pnpm template:sync   # retoma desde acá\n',
        };
      }

      for (const [archivo, accion] of acciones) resolverArchivoConflicto(cwd, archivo, accion);
      if (acciones.some(([, accion]) => accion === 'lockfile')) {
        regenerarLockfile(cwd);
        gitEn(cwd, ['add', '--', 'pnpm-lock.yaml']);
      }

      if (!quedanCambiosParaCommitear(cwd)) {
        saltarCherryPick(cwd);
        salteados.push(commit);
        continue;
      }

      continuarCherryPick(cwd);
    }

    aplicados.push(commit);
  }

  const tocados = gitEn(cwd, ['diff', '--name-only', `${headInicial}..HEAD`])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');

  if (necesitaInstall(tocados)) {
    try {
      execFileSync('pnpm', ['install'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return {
        estado: 'fallo-post',
        mensaje: `\`pnpm install\` falló después de traer la maquinaria:\n\n${mensajeDeError(error)}`,
        aplicados,
        salteados,
      };
    }
  }

  if (!opciones.sinTests) {
    for (const comando of [
      ['pnpm', 'typecheck'],
      ['pnpm', 'lint'],
      ['pnpm', 'test'],
    ]) {
      try {
        execFileSync(comando[0]!, comando.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        return {
          estado: 'fallo-post',
          mensaje: `\`${comando.join(' ')}\` falló después de traer la maquinaria:\n\n${mensajeDeError(error)}`,
          aplicados,
          salteados,
        };
      }
    }
  }

  const objetivo = opciones.hasta ? pendientes[pendientes.length - 1]!.sha : cabezaTemplate;
  writeFileSync(join(cwd, BASELINE_FILE), contenidoBaseline(objetivo));
  gitEn(cwd, ['add', '--', BASELINE_FILE]);
  gitEn(cwd, [
    '-c',
    'core.editor=true',
    'commit',
    '-m',
    `Sincronizar maquinaria del template hasta ${objetivo.slice(0, 12)}`,
  ]);

  return { estado: 'completado', aplicados, salteados, baseline: objetivo };
}

function main(): void {
  let opciones: Opciones;
  try {
    opciones = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    console.error('\n  pnpm template:sync [--dry-run] [--hasta <sha>] [--sin-tests]\n');
    process.exitCode = 1;
    return;
  }

  const resultado = ejecutarSync(process.cwd(), opciones);

  switch (resultado.estado) {
    case 'precondicion':
      console.error(`\n✗ ${resultado.mensaje}\n`);
      process.exitCode = 1;
      return;
    case 'sin-cambios':
      console.log('\n✓ No hay maquinaria pendiente del template.\n');
      return;
    case 'dry-run':
      console.log(
        `\n(dry-run) ${resultado.pendientes.length} commit(s) de maquinaria que traería, del más viejo al más nuevo:\n`,
      );
      for (const commit of resultado.pendientes) {
        console.log(`    ${commit.sha.slice(0, 12)}  ${commit.asunto}`);
      }
      console.log('\nSacá --dry-run para aplicarlos de verdad.\n');
      return;
    case 'conflicto-manual':
      console.error(`\n✗ ${resultado.mensaje}\n`);
      process.exitCode = 1;
      return;
    case 'fallo-post':
      console.error(
        `\n✗ ${resultado.mensaje}\n\n` +
          `  ${resultado.aplicados.length} commit(s) quedaron aplicados, ${resultado.salteados.length} salteado(s) por vacíos.\n` +
          `  ${BASELINE_FILE} NO se actualizó — arreglá lo que falló y volvé a correr \`pnpm template:sync\`.\n`,
      );
      process.exitCode = 1;
      return;
    case 'completado':
      console.log(
        `\n✓ ${resultado.aplicados.length} commit(s) de maquinaria sincronizados` +
          (resultado.salteados.length > 0 ? `, ${resultado.salteados.length} salteado(s) por vacíos` : '') +
          `.\n  ${BASELINE_FILE} → ${resultado.baseline.slice(0, 12)}, commiteado.\n`,
      );
      return;
    default:
      return;
  }
}

if (process.argv[1] && /template-sync\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
