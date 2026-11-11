// `tiendas.json` → qué tiendas recibe esta corrida de `distribuir.yml`, en
// lotes que entran en una matrix de GitHub. Lo usa el job `preparar` (con
// `node`, sin instalar nada) y lo reusan `pnpm template:ensayar-distribucion`
// y `pnpm template:atraso`, así el ensayo elige exactamente lo mismo que el
// workflow.
//
// Anillos (NEW-STORE.md § "La distribución automática del template"):
//   - un tag `v*` distribuye sólo al anillo 0 (las canarias);
//   - el anillo 1 (el resto) recibe la versión sólo con un "Run workflow" a
//     mano que nombra el tag y pide `anillo: 1`;
//   - una tienda `"estado": "pausada"` no recibe nada, en ningún anillo.
//
// Uso en el workflow (escribe `lotes`, `version` y `cantidad` en $GITHUB_OUTPUT):
//   EVENTO=push TAG=v2.0.0 ANILLO= node scripts/ci/elegir-tiendas.mjs
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Los campos que puede tener una entrada. El archivo es público. */
export const CAMPOS = new Set(['repo', 'dominio', 'notas', 'anillo', 'estado']);
const CAMPOS_TEXTO = new Set(['repo', 'dominio', 'notas']);

/** 0 = canarias (las primeras en recibir una versión), 1 = el resto. */
export const ANILLOS = [0, 1];
export const ESTADOS = ['activa', 'pausada'];

/** Lo que vale una entrada vieja, sin `anillo` ni `estado` (compatibilidad). */
export const ANILLO_POR_DEFECTO = 1;
export const ESTADO_POR_DEFECTO = 'activa';

/** GitHub no arma una matrix de más de 256 jobs. */
export const MAX_JOBS = 256;
/**
 * Tiendas por job. Cada job instala las dependencias del template una vez
 * (~1 min) y cada job se cobra redondeado al minuto: varias tiendas por job
 * cuestan menos minutos que un job por tienda. Una tienda tarda menos de un
 * minuto (clon + sync sin tests + push).
 */
export const TIENDAS_POR_JOB = 8;
/** Jobs a la vez: no satura la API de GitHub (límite secundario al crear PRs). */
export const MAX_PARALELO = 8;

// Lo que no puede aparecer en un archivo público: URLs con credenciales,
// nombres de base/usuario de Hostinger (u123456_algo), tokens de GitHub.
const PARECE_SECRETO = [/:\/\/[^\s/]*:[^\s/]*@/, /\bu\d{5,}_\w+/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_/];

/**
 * @typedef {{ repo: string, dominio?: string, notas?: string, anillo: 0 | 1, estado: 'activa' | 'pausada' }} Tienda
 */

/**
 * `tiendas.json` validado y con `anillo`/`estado` completos: tira con un
 * mensaje claro si algo no va.
 * @param {string} contenido
 * @returns {Tienda[]}
 */
export function leerTiendas(contenido) {
  let datos;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new Error('tiendas.json no es JSON válido');
  }
  if (!Array.isArray(datos)) throw new Error('tiendas.json tiene que ser un array');

  const vistos = new Set();
  return datos.map((entrada, i) => {
    if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
      throw new Error(`tiendas.json[${i}] tiene que ser un objeto`);
    }
    for (const [clave, valor] of Object.entries(entrada)) {
      if (!CAMPOS.has(clave)) {
        throw new Error(
          `tiendas.json[${i}].${clave}: sólo van repo, dominio, notas, anillo y estado — este archivo es público ` +
            '(la cuenta, el slot o la base de Hostinger van a un lugar privado)',
        );
      }
      if (!CAMPOS_TEXTO.has(clave)) continue;
      if (typeof valor !== 'string') throw new Error(`tiendas.json[${i}].${clave} tiene que ser texto`);
      if (PARECE_SECRETO.some((patron) => patron.test(valor))) {
        throw new Error(`tiendas.json[${i}].${clave} parece una credencial o un dato de la base: sacalo`);
      }
    }
    const { repo } = entrada;
    if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error(`tiendas.json[${i}] necesita "repo": "dueño/nombre"`);
    }
    if (vistos.has(repo.toLowerCase())) throw new Error(`tiendas.json: ${repo} está dos veces`);
    vistos.add(repo.toLowerCase());

    const anillo = entrada.anillo ?? ANILLO_POR_DEFECTO;
    if (!ANILLOS.includes(anillo)) {
      throw new Error(`tiendas.json[${i}].anillo: 0 (canaria) o 1 (el resto), como número — no ${JSON.stringify(entrada.anillo)}`);
    }
    const estado = entrada.estado ?? ESTADO_POR_DEFECTO;
    if (!ESTADOS.includes(estado)) {
      throw new Error(`tiendas.json[${i}].estado: "activa" o "pausada" — no ${JSON.stringify(entrada.estado)}`);
    }
    return { ...entrada, anillo, estado };
  });
}

/**
 * El anillo que toca según el evento: un tag sólo llega a las canarias; a
 * mano, el que se pidió.
 * @param {{ evento: string, anillo?: string | number | null }} corrida
 * @returns {0 | 1}
 */
export function anilloDeLaCorrida({ evento, anillo }) {
  if (evento === 'push') return 0;
  if (evento === 'workflow_dispatch') {
    const pedido = typeof anillo === 'number' ? anillo : Number.parseInt(String(anillo ?? '').trim(), 10);
    if (pedido === 0 || pedido === 1) return pedido;
    throw new Error(`anillo: 0 o 1 — no ${JSON.stringify(anillo)}`);
  }
  throw new Error(`distribuir.yml corre con un tag o a mano, no con "${evento}"`);
}

/**
 * Qué tiendas reciben la versión: las activas del anillo que toca.
 * @param {Tienda[]} tiendas
 * @param {0 | 1} anillo
 */
export function elegirTiendas(tiendas, anillo) {
  const elegidas = [];
  const pausadas = [];
  const otroAnillo = [];
  for (const tienda of tiendas) {
    if (tienda.anillo !== anillo) otroAnillo.push(tienda);
    else if (tienda.estado === 'pausada') pausadas.push(tienda);
    else elegidas.push(tienda);
  }
  return { elegidas, pausadas, otroAnillo };
}

/**
 * Parte los repos en lotes para la matrix: nunca más de `maxJobs` lotes, y
 * `porJob` tiendas por lote salvo que haga falta meter más para no pasarse.
 * @param {string[]} repos
 * @param {{ porJob?: number, maxJobs?: number }} [opciones]
 * @returns {{ numero: number, repos: string[] }[]}
 */
export function armarLotes(repos, { porJob = TIENDAS_POR_JOB, maxJobs = MAX_JOBS } = {}) {
  if (!Number.isInteger(porJob) || porJob < 1) throw new Error('porJob tiene que ser un entero ≥ 1');
  if (!Number.isInteger(maxJobs) || maxJobs < 1) throw new Error('maxJobs tiene que ser un entero ≥ 1');
  if (repos.length === 0) return [];
  const tamano = Math.max(porJob, Math.ceil(repos.length / maxJobs));
  const lotes = [];
  for (let i = 0; i < repos.length; i += tamano) {
    lotes.push({ numero: lotes.length + 1, repos: repos.slice(i, i + tamano) });
  }
  return lotes;
}

/** Un tag de versión: `v` + algo razonable, sin nada que el shell interprete. */
export function validarTag(tag) {
  const limpio = String(tag ?? '').trim().replace(/^refs\/tags\//, '');
  if (!/^v\d+(\.\d+){0,2}([-.+][0-9A-Za-z.-]+)?$/.test(limpio)) {
    throw new Error(`"${tag}" no es un tag de versión (v2.0.0): el anillo 1 se distribuye nombrando el tag que ya llegó a las canarias`);
  }
  return limpio;
}

/**
 * Todo lo que decide `preparar`.
 * @param {{ contenido: string | null, evento: string, anillo?: string | number | null, tag?: string | null, porJob?: number, maxJobs?: number }} entrada
 */
export function planDistribucion({ contenido, evento, anillo, tag, porJob, maxJobs }) {
  const anilloCorrida = anilloDeLaCorrida({ evento, anillo });
  const version = validarTag(tag);
  const tiendas = contenido === null ? [] : leerTiendas(contenido);
  const { elegidas, pausadas, otroAnillo } = elegirTiendas(tiendas, anilloCorrida);
  const lotes = armarLotes(
    elegidas.map((t) => t.repo),
    { porJob, maxJobs },
  );
  return { anillo: anilloCorrida, version, tiendas, elegidas, pausadas, otroAnillo, lotes };
}

/** Lo que el log de `preparar` dice, para que "0 jobs" nunca sea un misterio. */
export function describirPlan(plan) {
  const lineas = [`Versión ${plan.version}, anillo ${plan.anillo} (${plan.anillo === 0 ? 'canarias' : 'el resto'}).`];
  if (plan.tiendas.length === 0) lineas.push('tiendas.json está vacío o no existe: nada que distribuir.');
  if (plan.elegidas.length > 0) {
    lineas.push(`Reciben esta versión (${plan.elegidas.length}, en ${plan.lotes.length} job(s)): ${plan.elegidas.map((t) => t.repo).join(', ')}`);
  } else if (plan.tiendas.length > 0) {
    lineas.push(`Ninguna tienda activa en el anillo ${plan.anillo}: nada que distribuir.`);
  }
  if (plan.pausadas.length > 0) {
    lineas.push(`Pausadas, no reciben nada (${plan.pausadas.length}): ${plan.pausadas.map((t) => t.repo).join(', ')}`);
  }
  if (plan.anillo === 0 && plan.otroAnillo.length > 0) {
    lineas.push(
      `Anillo 1 (${plan.otroAnillo.length}) espera: cuando las canarias estén bien, Actions → "Distribuir a las tiendas" → Run workflow con tag ${plan.version} y anillo 1.`,
    );
  }
  return lineas.join('\n');
}

function main() {
  const evento = process.env.EVENTO ?? '';
  const contenido = existsSync('tiendas.json') ? readFileSync('tiendas.json', 'utf8') : null;
  const plan = planDistribucion({ contenido, evento, anillo: process.env.ANILLO, tag: process.env.TAG });
  console.log(describirPlan(plan));
  const salida = [`lotes=${JSON.stringify(plan.lotes)}`, `version=${plan.version}`, `cantidad=${plan.elegidas.length}`].join('\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${salida}\n`);
  else console.log(salida);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
