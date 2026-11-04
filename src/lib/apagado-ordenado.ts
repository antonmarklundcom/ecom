import { log, mensajeDe } from "@/lib/log";

/**
 * Apagado ordenado del servidor: cuando llega SIGTERM o SIGINT, terminar lo
 * que está en curso, **cerrar el pool de MySQL** y salir — todo con un plazo.
 *
 * Lo instala `src/instrumentation.ts` sólo en el servidor de producción (Node,
 * `NODE_ENV=production`): ni `next dev`, ni los tests, ni los scripts de
 * `pnpm` que importan la base pasan por acá, porque ninguno llama a
 * `register()` en producción.
 *
 * Cómo encaja con Next: `next start` ya escucha SIGTERM/SIGINT, deja de
 * aceptar conexiones, espera a que terminen los requests en curso y llama a
 * `process.exit(143)`. Eso tiene dos agujeros, y éste módulo tapa los dos:
 *
 * 1. **Espera sin límite.** Un request colgado (un upstream que no contesta)
 *    deja al proceso vivo para siempre después del SIGTERM. En Hostinger eso
 *    es un proceso huérfano más contra el cupo de la cuenta (DEPLOY.md §
 *    "Procesos que se apilan"). Acá hay un plazo: pasado `plazoMs`, se cierra
 *    el pool y se sale igual.
 * 2. **El pool no se cierra.** `process.exit` corta en seco: las conexiones
 *    a MySQL no se despiden y el servidor de base las ve morir en vez de
 *    cerrarse. Por eso, **sólo después de recibir la señal**, `process.exit`
 *    pasa por acá: primero se cierra el pool (con su propio tope, `cierreMs`)
 *    y después se sale con el código que pidió Next. Antes de la señal no se
 *    toca nada.
 *
 * Idempotente: instalarlo dos veces sobre el mismo proceso no agrega
 * listeners, y una señal repetida (la shell y el guard de `scripts/start.mjs`
 * mandan la misma) no reinicia nada.
 */

/** Lo que espera Next a que terminen los requests antes de que salgamos igual. */
export const PLAZO_APAGADO_MS = 10_000;

/** Lo máximo que se espera a que el pool se despida. */
export const PLAZO_CIERRE_POOL_MS = 2_000;

const CODIGO: Record<Senal, number> = { SIGTERM: 143, SIGINT: 130 };

type Senal = "SIGTERM" | "SIGINT";

/** Lo que se usa del proceso. Inyectable para los tests. */
export type ProcesoApagable = {
  on(evento: Senal, fn: () => void): unknown;
  exit(codigo?: number): never;
};

export type OpcionesApagado = {
  /** Cierra los recursos: en la tienda, `closePool` de `src/db`. */
  cerrar: () => Promise<void>;
  proceso?: ProcesoApagable;
  plazoMs?: number;
  cierreMs?: number;
};

const instalados = new WeakSet<object>();

/**
 * Instala el apagado. Devuelve `false` si ya estaba instalado en ese proceso.
 */
export function instalarApagadoOrdenado(opciones: OpcionesApagado): boolean {
  const proceso = opciones.proceso ?? (process as unknown as ProcesoApagable);
  if (instalados.has(proceso)) return false;
  instalados.add(proceso);

  const plazoMs = opciones.plazoMs ?? PLAZO_APAGADO_MS;
  const cierreMs = opciones.cierreMs ?? PLAZO_CIERRE_POOL_MS;
  const salirDeVerdad = proceso.exit.bind(proceso);

  let senalRecibida = false;
  let saliendo = false;

  const salir = (codigo: number): void => {
    if (saliendo) return;
    saliendo = true;
    let tope: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<void>((resolve) => {
      tope = setTimeout(resolve, cierreMs);
    });
    void Promise.race([
      opciones.cerrar().catch((error: unknown) => {
        log.warn("apagado: no se pudo cerrar el pool", {
          error: mensajeDe(error),
        });
      }),
      limite,
    ]).finally(() => {
      if (tope) clearTimeout(tope);
      salirDeVerdad(codigo);
    });
  };

  const alRecibir = (senal: Senal) => (): void => {
    if (senalRecibida) return;
    senalRecibida = true;
    log.info("apagado: señal recibida, terminando requests en curso", {
      senal,
      plazoMs,
    });

    // Desde acá, el `process.exit` de Next (o de quien sea) cierra el pool
    // antes de salir.
    proceso.exit = ((codigo?: number) => {
      salir(codigo ?? CODIGO[senal]);
    }) as ProcesoApagable["exit"];

    const plazo = setTimeout(() => {
      log.warn("apagado: venció el plazo con requests en curso; se sale igual", {
        senal,
        plazoMs,
      });
      salir(CODIGO[senal]);
    }, plazoMs);
    // El plazo no mantiene vivo a un proceso que ya se iba a ir solo.
    plazo.unref?.();
  };

  proceso.on("SIGTERM", alRecibir("SIGTERM"));
  proceso.on("SIGINT", alRecibir("SIGINT"));
  return true;
}
