import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * `pnpm doctor` — ¿esta máquina puede correr `pnpm nueva-tienda` ahora mismo?
 *
 * `preflight` revisa si una tienda ya armada puede cobrar plata; esto revisa
 * lo anterior a eso, la laptop de quien va a crear la tienda. Nace de una
 * sesión real: Docker Desktop cerrado, la SSH key de GitHub sin cargar y el
 * Node del sistema por debajo del mínimo, los tres descubiertos uno por uno
 * a mitad del wizard en vez de todos juntos antes de empezar.
 *
 * No toca nada — sólo lee versiones y prueba conexiones. Sale con código 1
 * si algo bloquea, 0 si sólo hay advertencias o todo está bien.
 */

type Severidad = 'bloquea' | 'advierte' | 'ok';
type Check = { title: string; detail: string; severity: Severidad };

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

export function checkNode(nodeVersion: string, nvmrc: string | null): Check {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  const esperado = nvmrc?.trim() ?? null;

  if (Number.isNaN(major) || major < 20 || major >= 25) {
    return {
      title: 'Node',
      detail: `tenés ${nodeVersion}, el template pide >=20 <25${esperado ? ` (.nvmrc pide ${esperado})` : ''}.`,
      severity: 'bloquea',
    };
  }
  return { title: 'Node', detail: `${nodeVersion} — ok.`, severity: 'ok' };
}

export function checkPnpm(pnpmVersion: string | null, esperado: string | null): Check {
  if (!pnpmVersion) {
    return {
      title: 'pnpm',
      detail: 'no encontrado. `corepack enable && corepack prepare pnpm@11 --activate`.',
      severity: 'bloquea',
    };
  }
  const major = Number(pnpmVersion.split('.')[0]);
  const esperadoMajor = esperado ? Number(esperado.split('@')[1]?.split('.')[0]) : null;
  if (esperadoMajor && major !== esperadoMajor) {
    return {
      title: 'pnpm',
      detail: `tenés ${pnpmVersion}, el repo pinea ${esperado}. \`corepack prepare pnpm@${esperadoMajor} --activate\`.`,
      severity: 'advierte',
    };
  }
  return { title: 'pnpm', detail: `${pnpmVersion} — ok.`, severity: 'ok' };
}

export function checkDocker(dockerInfoOk: boolean, dockerFound: boolean): Check {
  if (!dockerFound) {
    return {
      title: 'Docker',
      detail: 'no encontrado. Instalá Docker Desktop — hace falta para la base local.',
      severity: 'bloquea',
    };
  }
  if (!dockerInfoOk) {
    return {
      title: 'Docker',
      detail: 'instalado pero el daemon no responde. Abrí Docker Desktop y esperá a que arranque.',
      severity: 'bloquea',
    };
  }
  return { title: 'Docker', detail: 'daemon corriendo — ok.', severity: 'ok' };
}

export function checkGitRemote(nombre: string, url: string | null, alcanzable: boolean | null): Check {
  if (!url) {
    return {
      title: `Remoto "${nombre}"`,
      detail:
        nombre === 'template'
          ? 'no configurado. `git remote add template git@github.com:antonmarklundcom/ecom.git` (NEW-STORE.md §1).'
          : 'no configurado.',
      severity: nombre === 'template' ? 'advierte' : 'bloquea',
    };
  }
  if (alcanzable === false) {
    const esSsh = url.startsWith('git@') || url.startsWith('ssh://');
    return {
      title: `Remoto "${nombre}"`,
      detail: esSsh
        ? `${url} configurado pero no responde. ¿Tenés una SSH key cargada en GitHub? Probá con la URL https:// si no.`
        : `${url} configurado pero no responde.`,
      severity: 'bloquea',
    };
  }
  return { title: `Remoto "${nombre}"`, detail: `${url} — alcanzable.`, severity: 'ok' };
}

function main(): void {
  const nvmrc = existsSync('.nvmrc') ? readFileSync('.nvmrc', 'utf8') : null;
  const pkg = existsSync('package.json')
    ? (JSON.parse(readFileSync('package.json', 'utf8')) as { packageManager?: string })
    : {};

  const dockerFound = run('docker', ['--version']) !== null;
  const dockerInfoOk = dockerFound && run('docker', ['info']) !== null;

  const origenUrl = run('git', ['remote', 'get-url', 'origin']);
  const origenOk = origenUrl ? run('git', ['ls-remote', '--exit-code', 'origin']) !== null : null;

  const templateUrl = run('git', ['remote', 'get-url', 'template']);
  const templateOk = templateUrl ? run('git', ['ls-remote', '--exit-code', 'template']) !== null : null;

  const checks: Check[] = [
    checkNode(process.version, nvmrc),
    checkPnpm(run('pnpm', ['--version']), pkg.packageManager ?? null),
    checkDocker(dockerInfoOk, dockerFound),
    checkGitRemote('origin', origenUrl, origenOk),
    checkGitRemote('template', templateUrl, templateOk),
  ];

  const ICON: Record<Severidad, string> = { bloquea: '✗', advierte: '!', ok: '✓' };
  console.log('\nDoctor — ¿esta máquina puede correr `pnpm nueva-tienda` ahora?\n');

  const order: Severidad[] = ['bloquea', 'advierte', 'ok'];
  for (const severity of order) {
    for (const check of checks.filter((c) => c.severity === severity)) {
      console.log(`  ${ICON[check.severity]} ${check.title}`);
      console.log(`      ${check.detail}`);
    }
  }

  const bloquea = checks.filter((c) => c.severity === 'bloquea').length;
  console.log('');
  if (bloquea === 0) {
    console.log('✓ Nada bloquea. Seguí con `pnpm install` y `pnpm nueva-tienda`.');
    return;
  }
  console.error(`✗ ${bloquea} cosa(s) bloquean. Arreglalas antes de \`pnpm nueva-tienda\`.`);
  process.exitCode = 1;
}

if (process.argv[1] && /doctor\.ts$/.test(process.argv[1])) {
  main();
}
