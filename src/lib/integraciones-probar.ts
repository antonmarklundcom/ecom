import { safeError } from "@/lib/safe-error";
import { isPagoparMockMode } from "@/domain/pagopar/mode";
import { WHATSAPP_API_VERSION_DEFAULT } from "@/domain/messaging/whatsapp-cloud";
import { t } from "@/i18n";

import {
  CAMPOS,
  integracion,
  type CampoDef,
  type Integracion,
} from "./integraciones";
import {
  PREFIJO_COMPROBANTES,
  clavePrivada,
  crearClienteR2,
  leerConfigR2,
  mensajeR2,
} from "./r2";

/**
 * "Probar conexión" de `/admin/integraciones`: una llamada real, de sólo
 * lectura, con la config **efectiva** (la que la tienda está usando: panel >
 * entorno).
 *
 * - **R2**: escribe un archivo de prueba chiquito bajo `comprobantes/` (una
 *   clave privada con 128 bits aleatorios), lo vuelve a leer, prueba que el
 *   dominio público **no** lo sirva y lo borra. Es la única prueba que
 *   escribe: un bucket que se lee pero no deja escribir no sirve para nada,
 *   y no hay forma de saberlo sin intentarlo.
 * - **WhatsApp**: `GET /<version>/<phone_number_id>` de la Graph API con el
 *   token. Devuelve el número y el nombre verificado; no manda ningún mensaje.
 * - **Pagopar**: sólo que el host configurado conteste por https. La API de
 *   Pagopar no tiene un endpoint de sólo lectura que valide las claves sin
 *   iniciar una transacción, y **no se inventa uno**: el mensaje lo dice, y
 *   las claves se verifican con el test del sandbox.
 *
 * El resultado es texto para el dueño. **Nunca lleva un secreto**: el
 * `detalle` que viene del otro lado se recorta y se le borra cualquier
 * aparición de los valores secretos, por si el tercero los devolviera en el
 * mensaje de error.
 */

export type ResultadoPrueba = { ok: boolean; mensaje: string };

type Fetch = typeof fetch;

const TIMEOUT_MS = 8_000;
const DETALLE_MAX = 200;

/** Borra los secretos de un texto que viene de afuera, y lo recorta. */
export function sanearDetalle(
  texto: string,
  secretos: readonly (string | null)[]
): string {
  let salida = texto.replace(/\s+/g, " ").trim();
  for (const secreto of secretos) {
    if (secreto && secreto.length >= 4)
      salida = salida.split(secreto).join("••••");
  }
  return salida.length > DETALLE_MAX
    ? `${salida.slice(0, DETALLE_MAX)}…`
    : salida;
}

function secretosDe(nombre: Integracion): (string | null)[] {
  const { valores } = integracion(nombre);
  const defs: readonly CampoDef[] = CAMPOS[nombre];
  return defs
    .filter((def) => def.secreto)
    .map(
      (def) => (valores as Record<string, string | null>)[def.campo] ?? null
    );
}

async function llamar(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit
): Promise<{ status: number; cuerpo: string } | { error: string }> {
  try {
    const respuesta = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "manual",
    });
    return {
      status: respuesta.status,
      cuerpo: await respuesta.text().catch(() => ""),
    };
  } catch (error) {
    return { error: safeError(error).message };
  }
}

/** El mensaje de error de un JSON de Meta, si lo hay. */
function mensajeDelCuerpo(cuerpo: string, status: number): string {
  try {
    const json = JSON.parse(cuerpo) as {
      error?: { message?: unknown } | string;
    };
    const mensaje =
      typeof json.error === "string" ? json.error : json.error?.message;
    if (typeof mensaje === "string" && mensaje.trim() !== "")
      return `${mensaje} (HTTP ${status})`;
  } catch {
    // No era JSON: queda el status.
  }
  return `HTTP ${status}`;
}

export async function probarIntegracion(
  nombre: Integracion,
  fetchImpl: Fetch = fetch
): Promise<ResultadoPrueba> {
  const secretos = secretosDe(nombre);
  const resultado = await probar(nombre, fetchImpl);
  // Cinturón y tirantes: aunque cada rama ya sanea, el mensaje final tampoco
  // puede llevar un secreto.
  return {
    ok: resultado.ok,
    mensaje: sanearDetalle(resultado.mensaje, secretos),
  };
}

async function probar(
  nombre: Integracion,
  fetchImpl: Fetch
): Promise<ResultadoPrueba> {
  if (nombre === "r2") return probarR2(fetchImpl);
  if (nombre === "whatsapp") return probarWhatsApp(fetchImpl);
  if (nombre === "pagopar") return probarPagopar(fetchImpl);
  return { ok: false, mensaje: t("panel.integraciones.prueba.noAplica") };
}

function incompleta(faltan: string[]): ResultadoPrueba {
  return {
    ok: false,
    mensaje: t("panel.integraciones.prueba.incompleta", {
      faltan: faltan.join(", "),
    }),
  };
}

/**
 * ¿El dominio público sirve una clave privada? Un 2xx con los mismos bytes es
 * que sí (falta la regla que bloquea `/comprobantes/*`); cualquier otra cosa
 * —403 de la regla, 404, error de red— es que no. Exportada para
 * `pnpm preflight`, que hace la misma pregunta.
 */
export async function clavePrivadaEsPublica(
  fetchImpl: Fetch,
  base: string,
  key: string,
  esperado: Uint8Array
): Promise<boolean> {
  try {
    const respuesta = await fetchImpl(`${base}/${key}`, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (respuesta.status < 200 || respuesta.status >= 300) {
      await respuesta.body?.cancel().catch(() => {});
      return false;
    }
    const cuerpo = new Uint8Array(await respuesta.arrayBuffer());
    return (
      cuerpo.byteLength === esperado.byteLength &&
      cuerpo.every((byte, index) => byte === esperado[index])
    );
  } catch {
    return false;
  }
}

async function probarR2(fetchImpl: Fetch): Promise<ResultadoPrueba> {
  const { config, faltan } = leerConfigR2();
  if (!config || faltan.length > 0) return incompleta(faltan);

  const cliente = crearClienteR2(config, { fetchImpl, timeoutMs: TIMEOUT_MS });
  const key = clavePrivada(PREFIJO_COMPROBANTES, ".prueba-conexion.txt");
  const contenido = new TextEncoder().encode(`prueba ${new Date().toISOString()}\n`);
  const secretos = [config.secretAccessKey];
  let escrito = false;
  try {
    await cliente.put(key, contenido, {
      contentType: "text/plain",
      cacheControl: "private, no-store",
    });
    escrito = true;
    const leido = await cliente.get(key, { maxBytes: 1024 });
    if (
      !leido ||
      leido.byteLength !== contenido.byteLength ||
      !leido.every((byte, index) => byte === contenido[index])
    ) {
      return {
        ok: false,
        mensaje: t("panel.integraciones.prueba.r2Error", {
          detalle: "el archivo de prueba no volvió igual",
        }),
      };
    }
    if (
      config.publicUrl &&
      (await clavePrivadaEsPublica(fetchImpl, config.publicUrl, key, contenido))
    ) {
      return {
        ok: false,
        mensaje: t("panel.integraciones.prueba.r2Publico", {
          host: new URL(config.publicUrl).host,
        }),
      };
    }
    return {
      ok: true,
      mensaje: t("panel.integraciones.prueba.r2Ok", { bucket: config.bucket }),
    };
  } catch (error) {
    return {
      ok: false,
      mensaje: t("panel.integraciones.prueba.r2Error", {
        detalle: sanearDetalle(mensajeR2(error), secretos),
      }),
    };
  } finally {
    if (escrito) await cliente.delete(key).catch(() => {});
  }
}

async function probarWhatsApp(fetchImpl: Fetch): Promise<ResultadoPrueba> {
  const { valores } = integracion("whatsapp");
  const faltan = [
    ...(valores.phoneNumberId ? [] : ["phone number ID"]),
    ...(valores.accessToken ? [] : ["token"]),
  ];
  if (faltan.length > 0 || !valores.phoneNumberId || !valores.accessToken)
    return incompleta(faltan);

  const version = valores.apiVersion || WHATSAPP_API_VERSION_DEFAULT;
  const respuesta = await llamar(
    fetchImpl,
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(valores.phoneNumberId)}` +
      "?fields=display_phone_number,verified_name",
    {
      method: "GET",
      headers: { authorization: `Bearer ${valores.accessToken}` },
    }
  );
  const secretos = [valores.accessToken];

  if ("error" in respuesta) {
    return {
      ok: false,
      mensaje: t("panel.integraciones.prueba.whatsappError", {
        detalle: t("panel.integraciones.prueba.red", {
          detalle: sanearDetalle(respuesta.error, secretos),
        }),
      }),
    };
  }
  if (respuesta.status === 200) {
    let numero = "?";
    let nombre = "?";
    try {
      const json = JSON.parse(respuesta.cuerpo) as {
        display_phone_number?: unknown;
        verified_name?: unknown;
      };
      if (typeof json.display_phone_number === "string")
        numero = json.display_phone_number;
      if (typeof json.verified_name === "string") nombre = json.verified_name;
    } catch {
      // Un 200 que no es JSON igual prueba que el token abre.
    }
    return {
      ok: true,
      mensaje: t("panel.integraciones.prueba.whatsappOk", {
        numero: sanearDetalle(numero, secretos),
        nombre: sanearDetalle(nombre, secretos),
      }),
    };
  }
  return {
    ok: false,
    mensaje: t("panel.integraciones.prueba.whatsappError", {
      detalle: sanearDetalle(
        mensajeDelCuerpo(respuesta.cuerpo, respuesta.status),
        secretos
      ),
    }),
  };
}

async function probarPagopar(fetchImpl: Fetch): Promise<ResultadoPrueba> {
  if (isPagoparMockMode())
    return { ok: true, mensaje: t("panel.integraciones.prueba.pagoparMock") };

  const { valores } = integracion("pagopar");
  const faltan = [
    ...(valores.publicKey ? [] : [t("panel.integraciones.campo.publicKey")]),
    ...(valores.privateKey ? [] : [t("panel.integraciones.campo.privateKey")]),
    ...(valores.baseUrl ? [] : ["URL"]),
  ];
  if (faltan.length > 0 || !valores.baseUrl) return incompleta(faltan);

  let host: string;
  try {
    const url = new URL(valores.baseUrl);
    if (url.protocol !== "https:") throw new Error("no https");
    host = url.host;
  } catch {
    return {
      ok: false,
      mensaje: t("panel.integraciones.prueba.pagoparError", {
        host: valores.baseUrl,
        detalle: "no es https://",
      }),
    };
  }

  // Sin credenciales en el request: esto sólo mira que el host conteste.
  const respuesta = await llamar(fetchImpl, valores.baseUrl, { method: "GET" });
  if ("error" in respuesta) {
    return {
      ok: false,
      mensaje: t("panel.integraciones.prueba.pagoparError", {
        host,
        detalle: t("panel.integraciones.prueba.red", {
          detalle: respuesta.error,
        }),
      }),
    };
  }
  // Cualquier respuesta HTTP —hasta un 404 en la raíz— prueba que el host
  // existe y habla https. Un 5xx no.
  if (respuesta.status >= 500) {
    return {
      ok: false,
      mensaje: t("panel.integraciones.prueba.pagoparError", {
        host,
        detalle: `HTTP ${respuesta.status}`,
      }),
    };
  }
  return {
    ok: true,
    mensaje: t("panel.integraciones.prueba.pagoparOk", { host }),
  };
}
