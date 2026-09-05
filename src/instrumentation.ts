import { log, withRequestContext } from '@/lib/log';

/**
 * `onRequestError` — el único reporte de errores del template
 * (plan-operacion §5.4 D y §1.3).
 *
 * **Sin Sentry ni ningún SDK de terceros**, y no es ideología: un SDK de
 * observabilidad es una dependencia de runtime con acceso a todo lo que pasa
 * por el servidor, que manda datos afuera por defecto y que hay que auditar
 * cada vez que se actualiza. Lo que el comercio necesita es enterarse de que
 * algo se rompió, y eso cabe en un POST.
 *
 * Dos capas, y la segunda está apagada de fábrica:
 *
 * 1. **Siempre**, un `log.error` con el path, el método y el `reqId`. Va al
 *    log del hPanel y no sale de la máquina.
 * 2. **Sólo con `ERROR_REPORT_URL` configurada**, un POST a esa URL con el
 *    error. Sin la variable, **nada sale de la máquina**: no hay un default
 *    "por si acaso", no hay telemetría anónima, no hay nada.
 *
 * Lo que **nunca** viaja, ni con la URL puesta: teléfonos, nombres, tokens de
 * acceso, cuerpos de request, cookies, ni ningún secreto del entorno. Lo que
 * se manda está en `cuerpoDelReporte`, escrito a mano campo por campo — no un
 * `{ ...request }` que mañana crezca solo.
 */

/** Más que esto y el reporte no vale la pena: el error ya quedó en el log. */
const REPORTE_TIMEOUT_MS = 3_000;

/** El stack completo puede tener miles de líneas; en un webhook nadie las lee. */
const STACK_MAX = 4_096;

/**
 * Tope de reportes por minuto.
 *
 * Una tormenta de errores —la base caída, y cada request fallando— no puede
 * ser además una tormenta de POSTs: sumaría carga al servidor que ya está
 * sufriendo y haría que el webhook del otro lado nos corte. Diez alcanzan para
 * enterarse; el resto está en el log igual.
 */
const REPORTES_POR_MINUTO = 10;

let ventanaDesde = 0;
let enviadosEnVentana = 0;

/** Sólo para los tests: el contador es de módulo y sobrevive entre casos. */
export function resetErrorReportLimitForTests(): void {
  ventanaDesde = 0;
  enviadosEnVentana = 0;
}

function hayCupo(ahora = Date.now()): boolean {
  if (ahora - ventanaDesde > 60_000) {
    ventanaDesde = ahora;
    enviadosEnVentana = 0;
  }
  if (enviadosEnVentana >= REPORTES_POR_MINUTO) return false;
  enviadosEnVentana += 1;
  return true;
}

/**
 * La URL del webhook, o `null` si esta tienda no configuró ninguna.
 *
 * **Sólo `https://`**: el reporte lleva el path y el stack de un error del
 * servidor, y mandarlo en claro por http sería regalar el mapa interno a
 * cualquiera en el camino.
 */
export function errorReportUrl(): string | null {
  const raw = process.env.ERROR_REPORT_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') {
      console.error('ERROR_REPORT_URL tiene que ser https:// — se ignora');
      return null;
    }
    return url.toString();
  } catch {
    console.error('ERROR_REPORT_URL no es una URL válida — se ignora');
    return null;
  }
}

export type RequestErrorInfo = { path?: string; method?: string; reqId?: string };

/** Lo que se manda, escrito campo por campo. Ver la regla de arriba. */
export function cuerpoDelReporte(error: unknown, info: RequestErrorInfo): string {
  const err = error instanceof Error ? error : new Error(String(error));
  return JSON.stringify({
    message: err.message.slice(0, 500),
    stack: err.stack?.slice(0, STACK_MAX),
    path: info.path,
    method: info.method,
    reqId: info.reqId,
    sha: process.env.BUILD_SHA ?? 'desconocido',
  });
}

/**
 * El hook de Next. **No tira nunca**: corre en el camino de un error que ya
 * pasó, y hacerlo fallar de nuevo sólo taparía el original.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string | undefined> },
): Promise<void> {
  const reqId = request.headers?.['x-request-id'];
  const info: RequestErrorInfo = { path: request.path, method: request.method, reqId };

  const registrar = () =>
    log.error('request falló', {
      path: info.path,
      method: info.method,
      error: error instanceof Error ? error.message : String(error),
    });

  // El `reqId` viene en el header porque `AsyncLocalStorage` no cruza hasta
  // acá: se lo vuelve a poner para que esta línea se pueda cruzar con las
  // demás del mismo request.
  if (reqId) withRequestContext({ reqId }, registrar);
  else registrar();

  const url = errorReportUrl();
  if (!url) return;
  if (!hayCupo()) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: cuerpoDelReporte(error, info),
      signal: AbortSignal.timeout(REPORTE_TIMEOUT_MS),
    });
  } catch (fallo) {
    // El webhook caído no es noticia dos veces: queda una línea y nada más.
    console.error('no se pudo reportar el error', fallo instanceof Error ? fallo.message : fallo);
  }
}
