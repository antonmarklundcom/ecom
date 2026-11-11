import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { envSinGit } from './ci/entorno-sin-git.mjs';
import { ANILLO_POR_DEFECTO, ANILLOS, ESTADO_POR_DEFECTO, ESTADOS, leerTiendas } from './ci/elegir-tiendas.mjs';

/**
 * `pnpm registrar-tienda <dueño/nombre>` — se corre en el checkout del
 * TEMPLATE. Agrega la tienda a `tiendas.json` en una rama y abre el PR que la
 * registra, para que le lleguen las versiones (NEW-STORE.md § "La distribución
 * automática del template").
 *
 * Lo único que no puede hacer por vos es darle al token `TIENDAS_TOKEN` acceso
 * a la tienda nueva (es de tu cuenta de GitHub): lo imprime al final y lo deja
 * en el cuerpo del PR.
 *
 * `--dry-run` muestra la entrada y los comandos y no toca nada. Los tests
 * mockean `gh`/`git` (`ejecutar` inyectado): nunca se crea nada en GitHub.
 *
 * Todo `git` hijo corre sin ninguna `GIT_*` (`envSinGit`): dentro de un hook
 * git exporta `GIT_DIR` y un hijo operaría sobre el repo equivocado.
 */

export const ARCHIVO_TIENDAS = 'tiendas.json';
const REPO_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

export type OpcionesRegistro = {
  repo: string;
  dominio?: string;
  anillo: number;
  estado: string;
  notas?: string;
};

/** `--anillo 0 --estado pausada --dominio x.com.py --notas "…"` + el repo. */
export function parsearArgumentos(entrada: readonly string[]): OpcionesRegistro & { dryRun: boolean } {
  const argv = entrada.filter((arg) => arg !== '--');
  const salida: OpcionesRegistro & { dryRun: boolean } = {
    repo: '',
    anillo: ANILLO_POR_DEFECTO,
    estado: ESTADO_POR_DEFECTO,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--dry-run') {
      salida.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) throw new Error(`${arg} espera un valor`);
      i += 1;
      if (arg === '--anillo') salida.anillo = Number(valor);
      else if (arg === '--estado') salida.estado = valor;
      else if (arg === '--dominio') salida.dominio = valor;
      else if (arg === '--notas') salida.notas = valor;
      else throw new Error(`no conozco la opción "${arg}"`);
      continue;
    }
    if (salida.repo !== '') throw new Error(`sobra el argumento "${arg}": se registra una tienda por vez`);
    salida.repo = arg;
  }
  if (!REPO_REGEX.test(salida.repo)) {
    throw new Error('Pasá el repo como dueño/nombre: pnpm registrar-tienda antonmarklundcom/mi-tienda');
  }
  if (!ANILLOS.includes(salida.anillo)) throw new Error(`--anillo tiene que ser ${ANILLOS.join(' o ')}`);
  if (!ESTADOS.includes(salida.estado)) throw new Error(`--estado tiene que ser ${ESTADOS.join(' o ')}`);
  return salida;
}

/** La rama del PR: `registrar-tienda/<dueño>-<nombre>`. */
export function ramaDe(repo: string): string {
  return `registrar-tienda/${repo.replace('/', '-').toLowerCase()}`;
}

/**
 * Agrega la entrada a `tiendas.json` (texto) y valida el resultado con el
 * mismo `leerTiendas` que usa el workflow. Falla si el repo ya está.
 */
export function agregarTienda(contenido: string, opciones: OpcionesRegistro): string {
  const lista = JSON.parse(contenido) as Record<string, unknown>[];
  if (lista.some((t) => String(t.repo).toLowerCase() === opciones.repo.toLowerCase())) {
    throw new Error(`${opciones.repo} ya está en ${ARCHIVO_TIENDAS}.`);
  }
  const entrada: Record<string, unknown> = { repo: opciones.repo };
  if (opciones.dominio) entrada.dominio = opciones.dominio;
  entrada.anillo = opciones.anillo;
  entrada.estado = opciones.estado;
  if (opciones.notas) entrada.notas = opciones.notas;
  const nuevo = `${JSON.stringify([...lista, entrada], null, 2)}\n`;
  leerTiendas(nuevo); // lanza si algo no valida
  return nuevo;
}

/** Lo que queda a mano, en una línea que se imprime y va al PR. */
export function pasoManual(repo: string): string {
  return (
    `Falta un paso a mano: sumar ${repo} al token TIENDAS_TOKEN ` +
    '(GitHub → Settings → Developer settings → Fine-grained tokens → el token → Repository access → ' +
    `agregar ${repo}; Contents, Pull requests y Workflows en Read and write). ` +
    'Sin eso la distribución falla en esa tienda con "no pude clonarla".'
  );
}

export function cuerpoPr(opciones: OpcionesRegistro): string {
  const filas = [
    `- repo: \`${opciones.repo}\``,
    `- anillo: ${opciones.anillo} (${opciones.anillo === 0 ? 'canaria' : 'el resto'})`,
    `- estado: ${opciones.estado}`,
  ];
  if (opciones.dominio) filas.push(`- dominio: ${opciones.dominio}`);
  return [
    `Registra \`${opciones.repo}\` en \`${ARCHIVO_TIENDAS}\` para que reciba las versiones del template.`,
    '',
    ...filas,
    '',
    `**${pasoManual(opciones.repo)}**`,
    '',
    'Con `"estado": "pausada"` no recibe nada hasta que se cambie a `"activa"`.',
    '',
  ].join('\n');
}

export type Comando = { cmd: string; args: string[] };

/** Los comandos, en orden, que abren el PR (sin ejecutarlos). */
export function comandosRegistro(opciones: OpcionesRegistro): Comando[] {
  const rama = ramaDe(opciones.repo);
  return [
    { cmd: 'git', args: ['switch', '-c', rama] },
    { cmd: 'git', args: ['add', ARCHIVO_TIENDAS] },
    { cmd: 'git', args: ['commit', '-m', `Registrar tienda ${opciones.repo}`] },
    { cmd: 'git', args: ['push', '-u', 'origin', rama] },
    {
      cmd: 'gh',
      args: [
        'pr', 'create',
        '--base', 'main',
        '--head', rama,
        '--title', `Registrar tienda ${opciones.repo}`,
        '--body', cuerpoPr(opciones),
      ],
    },
  ];
}

export type Ejecutar = (comando: Comando) => string;

function ejecutarReal({ cmd, args }: Comando): string {
  return execFileSync(cmd, args, { encoding: 'utf8', env: envSinGit(), stdio: ['ignore', 'pipe', 'inherit'] });
}

/**
 * El flujo completo con `ejecutar` y el sistema de archivos inyectados.
 * Devuelve las líneas a imprimir.
 */
export function registrar(
  opciones: OpcionesRegistro & { dryRun: boolean },
  io: {
    ejecutar: Ejecutar;
    leer: () => string;
    escribir: (contenido: string) => void;
  },
): string[] {
  const nuevo = agregarTienda(io.leer(), opciones);
  const salida: string[] = [];
  if (opciones.dryRun) {
    salida.push('--dry-run: no se toca nada. Agregaría a tiendas.json:', nuevo, 'y correría:');
    for (const c of comandosRegistro(opciones)) salida.push(`  ${c.cmd} ${c.args.join(' ')}`);
    salida.push('', pasoManual(opciones.repo));
    return salida;
  }
  const estado = io.ejecutar({ cmd: 'git', args: ['status', '--porcelain'] }).trim();
  if (estado !== '') throw new Error('El checkout del template tiene cambios sin commitear: limpialo antes de registrar una tienda.');
  const [crearRama, ...resto] = comandosRegistro(opciones);
  io.ejecutar(crearRama as Comando);
  io.escribir(nuevo);
  for (const c of resto) {
    const texto = io.ejecutar(c).trim();
    if (c.cmd === 'gh' && texto !== '') salida.push(`PR: ${texto}`);
  }
  salida.push('', pasoManual(opciones.repo));
  return salida;
}

function main(): void {
  const opciones = parsearArgumentos(process.argv.slice(2));
  const salida = registrar(opciones, {
    ejecutar: ejecutarReal,
    leer: () => readFileSync(ARCHIVO_TIENDAS, 'utf8'),
    escribir: (contenido) => writeFileSync(ARCHIVO_TIENDAS, contenido),
  });
  for (const linea of salida) console.log(linea);
}

if (process.argv[1] && /registrar-tienda\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error: unknown) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
