// La lógica de `scripts/start.mjs` —el `pnpm start` de producción—, separada
// para poder testearla sin levantar Next (tests/unit/start-guard.test.ts).
//
// Node pelado, sin tsx ni dependencias: esto corre en el servidor de
// Hostinger, donde `tsx` panica bajo el límite de threads (DEPLOY.md §2) y
// donde lo único seguro que hay es `node`.
//
// Qué resuelve (DEPLOY.md § "Procesos que se apilan"): Hostinger cuenta los
// procesos de **toda la cuenta** contra un cupo compartido, y un redeploy que
// mata al proceso de arriba (pnpm) sin matar a sus hijos deja un `next-server`
// huérfano vivo, con su pool de MySQL abierto. Con varios redeploys los
// huérfanos se apilan, el cupo se llena y el hosting empieza a contestar 429
// a todas las tiendas de la cuenta. Acá, al arrancar:
//
//   1. se lee el pidfile de la instancia anterior de **esta** app;
//   2. si ese proceso sigue vivo **y se puede verificar que es nuestro**, se le
//      manda SIGTERM, se espera un rato acotado y, si no se fue, SIGKILL;
//   3. se arranca `next start` y se anota su pid en el pidfile;
//   4. las señales que llegan acá se reenvían al hijo, y cuando el hijo sale,
//      se sale con su código y se borra el pidfile sólo si sigue siendo el
//      nuestro.
//
// La regla que no se negocia: **nunca se mata un pid que no se pudo
// verificar.** Un pid se recicla; el pidfile puede ser de hace una semana y
// ese número ser hoy el proceso de otra tienda de la misma cuenta. Por eso no
// alcanza con "está vivo": el hijo arranca con una ficha al azar en su entorno
// (`ECOM_SERVIDOR_FICHA`), la ficha va al pidfile, y antes de matar se lee
// `/proc/<pid>/environ` buscándola. El entorno inicial no cambia aunque Next
// le cambie el título al proceso (`next-server (v16…)`), y un proceso ajeno
// con el mismo pid no puede tener la ficha. Sin `/proc` (macOS, Windows), no
// hay forma de verificar y no se mata nada: se avisa y se sigue.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** La variable con la ficha del servidor. La pone el guard, nadie más. */
export const VARIABLE_FICHA = 'ECOM_SERVIDOR_FICHA';

/**
 * Cuánto se le da a la instancia anterior para irse sola después del SIGTERM.
 * Más que el plazo de apagado del propio servidor (`src/lib/apagado-ordenado.ts`,
 * 10 s), así un servidor sano termina sus requests y cierra el pool antes del
 * SIGKILL.
 */
export const ESPERA_TERM_MS = 15_000;

/** Después del SIGKILL, cuánto se espera a que el kernel lo saque. */
export const ESPERA_KILL_MS = 2_000;

/**
 * Si al hijo le llega una señal y no sale en este plazo, SIGKILL. Es el
 * respaldo del plazo de adentro (10 s): un servidor colgado en algo que no es
 * JavaScript no tiene que quedar vivo para siempre.
 */
export const PLAZO_HIJO_MS = 15_000;

const SONDEO_MS = 200;

const NUMERO_SENAL = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };

/**
 * Una línea JSON, igual que `src/lib/log.ts`, para que en el log del hPanel se
 * grepee igual que el resto (`grep '"level":"warn"'`).
 *
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} msg
 * @param {Record<string, unknown>} [campos]
 */
export function avisar(level, msg, campos = {}) {
  const linea = JSON.stringify({ ts: new Date().toISOString(), level, msg, origen: 'start', ...campos });
  if (level === 'info') console.info(linea);
  else console.error(linea);
}

/**
 * Dónde vive el pidfile de esta app.
 *
 * `START_PIDFILE` manda si está (docs/ENV-OPCIONAL.md). Si no, uno en el
 * directorio temporal del sistema con nombre derivado de la ruta real de la
 * app: estable entre reinicios del mismo deploy, distinto para cada tienda de
 * la cuenta, y afuera de `.next/` (que `next build` borra).
 *
 * @param {{ appDir: string, env?: Record<string, string | undefined>, tmpdir?: string }} opciones
 */
export function rutaPidfile({ appDir, env = process.env, tmpdir = os.tmpdir() }) {
  const propia = (env.START_PIDFILE ?? '').trim();
  if (propia) return path.resolve(propia);
  const clave = createHash('sha256').update(appDir).digest('hex').slice(0, 16);
  return path.join(tmpdir, `ecom-start-${clave}.pid`);
}

/**
 * @typedef {{ v: 1, ficha: string, servidorPid: number, guardPid: number, appDir: string, desde: string }} Registro
 */

/**
 * El registro del pidfile, o `null` si no hay o no se entiende. Un pidfile
 * roto no frena el arranque: se trata como si no hubiera.
 *
 * @param {string} ruta
 * @param {{ readFileSync: (ruta: string, enc: 'utf8') => string }} [sfs]
 * @returns {Registro | null}
 */
export function leerPidfile(ruta, sfs = fs) {
  let crudo;
  try {
    crudo = sfs.readFileSync(ruta, 'utf8');
  } catch {
    return null;
  }
  try {
    const dato = JSON.parse(crudo);
    if (
      dato &&
      dato.v === 1 &&
      typeof dato.ficha === 'string' &&
      dato.ficha.length >= 16 &&
      Number.isInteger(dato.servidorPid) &&
      dato.servidorPid > 1
    ) {
      return dato;
    }
  } catch {
    // cae abajo
  }
  return null;
}

/**
 * Escribe el pidfile de una vez (archivo temporal + rename): un arranque
 * concurrente nunca lee la mitad de un JSON.
 *
 * @param {string} ruta
 * @param {Registro} registro
 * @param {Pick<typeof fs, 'writeFileSync' | 'renameSync'>} [sfs]
 */
export function escribirPidfile(ruta, registro, sfs = fs) {
  const tmp = `${ruta}.${process.pid}.tmp`;
  sfs.writeFileSync(tmp, `${JSON.stringify(registro)}\n`, { mode: 0o600 });
  sfs.renameSync(tmp, ruta);
}

/**
 * Borra el pidfile **sólo si sigue siendo el nuestro**: si ya arrancó otra
 * instancia y lo reescribió, borrarlo la dejaría sin protección.
 *
 * @param {string} ruta
 * @param {string} ficha
 * @param {Pick<typeof fs, 'readFileSync' | 'unlinkSync'>} [sfs]
 * @returns {boolean} si lo borró
 */
export function borrarPidfileSiEsNuestro(ruta, ficha, sfs = fs) {
  const actual = leerPidfile(ruta, sfs);
  if (!actual || actual.ficha !== ficha) return false;
  try {
    sfs.unlinkSync(ruta);
    return true;
  } catch {
    return false;
  }
}

/**
 * ¿El pid existe? `kill(pid, 0)` no manda nada: sólo pregunta. `EPERM` es
 * "existe y es de otro usuario" — vivo, y obviamente no nuestro (lo descarta
 * la verificación de la ficha).
 *
 * @param {number} pid
 * @param {Deps['kill']} kill
 */
export function estaVivo(pid, kill) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'EPERM';
  }
}

/**
 * ¿Ese pid es el servidor que arrancó este guard?
 *
 * - `"si"`: su entorno inicial tiene nuestra ficha.
 * - `"no"`: se pudo leer y no la tiene (un pid reciclado), o ya no existe.
 * - `"no_verificable"`: no hay `/proc` (no es Linux) o no se pudo leer
 *   (otro usuario). En la duda, no se mata.
 *
 * @param {number} pid
 * @param {string} ficha
 * @param {{ hayProc: () => boolean, leerEnviron: (pid: number) => string }} deps
 * @returns {'si' | 'no' | 'no_verificable'}
 */
export function esNuestroServidor(pid, ficha, deps) {
  if (!deps.hayProc()) return 'no_verificable';
  let environ;
  try {
    environ = deps.leerEnviron(pid);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error)?.code;
    // ENOENT/ESRCH: el proceso se fue entre el kill(0) y la lectura.
    if (code === 'ENOENT' || code === 'ESRCH') return 'no';
    return 'no_verificable';
  }
  return environ.split('\0').includes(`${VARIABLE_FICHA}=${ficha}`) ? 'si' : 'no';
}

/**
 * Lo que toca el sistema operativo, inyectable para los tests.
 *
 * @typedef {{
 *   kill: (pid: number, senal: string | number) => unknown,
 *   hayProc: () => boolean,
 *   leerEnviron: (pid: number) => string,
 *   esperar: (ms: number) => Promise<unknown>,
 *   ahora: () => number,
 *   pidPropio: number,
 * }} Deps
 */

/**
 * Lo de verdad, para `scripts/start.mjs`. Los tests inyectan los suyos.
 *
 * @type {Deps}
 */
export const DEPS_REALES = {
  kill: (/** @type {number} */ pid, /** @type {string | number} */ senal) => process.kill(pid, senal),
  hayProc: () => process.platform === 'linux' && fs.existsSync('/proc/self/environ'),
  leerEnviron: (/** @type {number} */ pid) => fs.readFileSync(`/proc/${pid}/environ`, 'latin1'),
  esperar: (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ahora: () => Date.now(),
  pidPropio: process.pid,
};

/**
 * @typedef {'sin_registro' | 'propia' | 'muerta' | 'ajena' | 'no_verificable' | 'terminada' | 'forzada' | 'sobrevivio'} Resultado
 */

/**
 * Si la instancia anterior de esta app sigue viva, la cierra.
 *
 * @param {Registro | null} registro
 * @param {Deps} deps
 * @param {{ esperaTermMs?: number, esperaKillMs?: number }} [plazos]
 * @returns {Promise<Resultado>}
 */
export async function cerrarInstanciaAnterior(registro, deps, plazos = {}) {
  if (!registro) return 'sin_registro';
  const pid = registro.servidorPid;
  // Nunca a uno mismo (un pidfile copiado, o un pid reciclado justo por éste).
  if (pid === deps.pidPropio) return 'propia';
  if (!estaVivo(pid, deps.kill)) return 'muerta';

  const verificado = esNuestroServidor(pid, registro.ficha, deps);
  if (verificado === 'no') return 'ajena';
  if (verificado === 'no_verificable') return 'no_verificable';

  const esperaTerm = plazos.esperaTermMs ?? ESPERA_TERM_MS;
  const esperaKill = plazos.esperaKillMs ?? ESPERA_KILL_MS;

  try {
    deps.kill(pid, 'SIGTERM');
  } catch {
    return 'muerta';
  }
  if (await esperarQueMuera(pid, deps, esperaTerm)) return 'terminada';

  // Antes del SIGKILL se verifica de nuevo: en 15 s el pid pudo morir y
  // reciclarse.
  if (esNuestroServidor(pid, registro.ficha, deps) !== 'si') return 'terminada';
  try {
    deps.kill(pid, 'SIGKILL');
  } catch {
    return 'terminada';
  }
  return (await esperarQueMuera(pid, deps, esperaKill)) ? 'forzada' : 'sobrevivio';
}

/**
 * @param {number} pid
 * @param {Deps} deps
 * @param {number} plazoMs
 */
async function esperarQueMuera(pid, deps, plazoMs) {
  const limite = deps.ahora() + plazoMs;
  while (deps.ahora() < limite) {
    if (!estaVivo(pid, deps.kill)) return true;
    await deps.esperar(SONDEO_MS);
  }
  return !estaVivo(pid, deps.kill);
}

/**
 * Reenvía al hijo las señales que llegan acá.
 *
 * SIGTERM y SIGINT van tal cual. **SIGHUP se reenvía como SIGTERM**: `next
 * start` no escucha SIGHUP, y un SIGHUP sin listener lo mata en seco —sin
 * terminar los requests ni cerrar el pool—, que es justo lo que este archivo
 * quiere evitar. Si después de la señal el hijo no salió en `plazoHijoMs`,
 * SIGKILL.
 *
 * @param {{ proceso: { on: (senal: string, fn: () => void) => unknown, off: (senal: string, fn: () => void) => unknown }, hijo: { kill: (senal: NodeJS.Signals) => unknown, exitCode: number | null, signalCode: string | null }, plazoHijoMs?: number, alRecibir?: (senal: string) => void }} opciones
 * @returns {() => void} saca los listeners
 */
export function reenviarSenales({ proceso, hijo, plazoHijoMs = PLAZO_HIJO_MS, alRecibir }) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let respaldo;
  const terminado = () => hijo.exitCode !== null || hijo.signalCode !== null;

  /** @type {Array<[string, () => void]>} */
  const listeners = ['SIGTERM', 'SIGINT', 'SIGHUP'].map((senal) => {
    const fn = () => {
      alRecibir?.(senal);
      if (terminado()) return;
      try {
        hijo.kill(senal === 'SIGHUP' ? 'SIGTERM' : senal);
      } catch {
        // Ya se fue.
      }
      if (!respaldo) {
        respaldo = setTimeout(() => {
          if (terminado()) return;
          try {
            hijo.kill('SIGKILL');
          } catch {
            // Ya se fue.
          }
        }, plazoHijoMs);
        respaldo.unref?.();
      }
    };
    proceso.on(senal, fn);
    return [senal, fn];
  });

  return () => {
    if (respaldo) clearTimeout(respaldo);
    for (const [senal, fn] of listeners) proceso.off(senal, fn);
  };
}

/**
 * El código con que sale el guard: el del hijo, o 128 + la señal que lo mató
 * (la convención de la shell, así el supervisor ve lo mismo que vería con
 * `next start` pelado).
 *
 * @param {number | null} code
 * @param {string | null} signal
 */
export function codigoDeSalida(code, signal) {
  if (typeof code === 'number') return code;
  if (signal && signal in NUMERO_SENAL) return 128 + NUMERO_SENAL[/** @type {keyof typeof NUMERO_SENAL} */ (signal)];
  return 1;
}

/**
 * Todo el arranque: cerrar la anterior, lanzar el hijo, anotarlo, reenviar
 * señales y salir con su código. `scripts/start.mjs` le pasa `next start`; los
 * tests, un hijo de mentira.
 *
 * Nada de esto puede impedir que la tienda arranque: si el pidfile no se
 * puede leer o escribir, se avisa y se arranca igual.
 *
 * @param {{
 *   comando: string,
 *   args: string[],
 *   appDir: string,
 *   rutaPidfile: string,
 *   ficha: string,
 *   env?: Record<string, string | undefined>,
 *   proceso?: NodeJS.Process,
 *   deps?: Deps,
 *   plazos?: { esperaTermMs?: number, esperaKillMs?: number, plazoHijoMs?: number },
 *   stdio?: import('node:child_process').StdioOptions,
 *   salir?: (codigo: number) => void,
 * }} opciones
 * @returns {Promise<{ hijo: import('node:child_process').ChildProcess, anterior: Resultado, terminado: Promise<number> }>}
 */
export async function arrancar(opciones) {
  const {
    comando,
    args,
    appDir,
    rutaPidfile: ruta,
    ficha,
    env = process.env,
    proceso = process,
    deps = DEPS_REALES,
    plazos = {},
    stdio = 'inherit',
    salir = (codigo) => proceso.exit(codigo),
  } = opciones;

  const registro = leerPidfile(ruta);
  let anterior = /** @type {Resultado} */ ('sin_registro');
  try {
    anterior = await cerrarInstanciaAnterior(registro, deps, plazos);
  } catch (error) {
    avisar('warn', 'no se pudo revisar la instancia anterior; se arranca igual', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (registro) {
    const nivel = anterior === 'sobrevivio' || anterior === 'no_verificable' ? 'warn' : 'info';
    avisar(nivel, `instancia anterior: ${anterior}`, { pid: registro.servidorPid, desde: registro.desde, pidfile: ruta });
  }

  const hijo = spawn(comando, args, {
    cwd: appDir,
    env: { ...env, [VARIABLE_FICHA]: ficha },
    stdio,
  });

  if (hijo.pid) {
    try {
      escribirPidfile(ruta, {
        v: 1,
        ficha,
        servidorPid: hijo.pid,
        guardPid: deps.pidPropio,
        appDir,
        desde: new Date().toISOString(),
      });
      avisar('info', 'servidor arrancado', { pid: hijo.pid, pidfile: ruta });
    } catch (error) {
      avisar('warn', 'no se pudo escribir el pidfile; el próximo arranque no va a poder cerrar éste', {
        pidfile: ruta,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const soltar = reenviarSenales({ proceso, hijo, plazoHijoMs: plazos.plazoHijoMs });

  const terminado = new Promise((resolve) => {
    let listo = false;
    /** @param {number} codigo */
    const fin = (codigo) => {
      if (listo) return;
      listo = true;
      soltar();
      borrarPidfileSiEsNuestro(ruta, ficha);
      resolve(codigo);
      salir(codigo);
    };
    hijo.on('error', (error) => {
      avisar('error', 'no se pudo lanzar el servidor', { error: error.message });
      fin(1);
    });
    hijo.on('exit', (code, signal) => fin(codigoDeSalida(code, signal)));
  });

  return { hijo, anterior, terminado };
}
