import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { infoImagen } from "./imagen-bytes";

/**
 * Bajar una foto de una URL que escribió una persona (la columna Fotos de la
 * planilla, la migración de fotos viejas) **desde el servidor**, con todos
 * los topes:
 *
 * - sólo `https://`, sin usuario/contraseña en la URL, sin hosts locales ni
 *   IPs privadas (`localhost`, `10.x`, `192.168.x`, `169.254.x`, `::1`,
 *   `fc00::/7`, IPv4 mapeadas en IPv6…), ni escritas en la URL ni **a donde
 *   resuelve el nombre**: antes de cada pedido y de cada redirección se
 *   resuelven todas sus direcciones (IPv4 e IPv6) y basta una privada para
 *   rechazarlo;
 * - redirecciones seguidas a mano, como mucho `maxRedirects`, cada una
 *   revisada con las mismas reglas;
 * - timeout por pedido y tope de bytes (se corta al leer, no se confía en el
 *   `Content-Length`);
 * - el contenido tiene que ser una imagen por **sus bytes** (JPEG, PNG, WebP
 *   o GIF): un HTML de "no encontrado" con status 200 no pasa.
 *
 * Queda una ventana de *DNS rebinding*: entre la resolución de acá y la que
 * hace `fetch` al conectar, un DNS hostil podría cambiar la respuesta. Cerrarla
 * exige fijar la IP en la conexión (un agente propio), y para una función que
 * sólo usa el dueño o el encargado del panel —no cualquiera de internet— no
 * vale esa complejidad.
 */

export class DescargaError extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "DescargaError";
  }
}

type Fetch = typeof fetch;

export type OpcionesDescarga = {
  fetchImpl?: Fetch;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * Qué contenido se acepta (por los bytes). Por defecto, una imagen JPEG,
   * PNG, WebP o GIF; la migración de comprobantes acepta también PDF.
   */
  validar?: { acepta: (bytes: Uint8Array) => boolean; motivo: string };
  /** Cómo resolver nombres (los tests lo reemplazan). Por defecto, el DNS del sistema. */
  resolver?: Resolver;
};

export const DESCARGA_MAX_BYTES = 15 * 1024 * 1024;
export const DESCARGA_TIMEOUT_MS = 20_000;
export const DESCARGA_MAX_REDIRECTS = 3;

/** `a.b.c.d` → sus cuatro números, o `null`. */
function octetos(ip: string): number[] | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  const n = partes.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}

function ipv4Privada([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "esta red" / no especificada
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b! >= 64 && b! <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (metadatos de la nube)
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // asignaciones IETF
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a! >= 224 // multicast, reservadas y broadcast
  );
}

/** Una IPv6 (sin corchetes) → sus ocho grupos de 16 bits, o `null`. */
function hextetos(ip: string): number[] | null {
  let texto = ip.toLowerCase().split("%")[0]!;
  // Una IPv4 al final (`::ffff:127.0.0.1`) pasa a dos grupos hex.
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(texto);
  if (v4) {
    const o = octetos(v4[1]!);
    if (!o) return null;
    texto =
      texto.slice(0, -v4[1]!.length) +
      `${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const mitades = texto.split("::");
  if (mitades.length > 2) return null;
  const grupos = (parte: string) => (parte === "" ? [] : parte.split(":"));
  const izq = grupos(mitades[0]!);
  const der = mitades.length === 2 ? grupos(mitades[1]!) : [];
  const faltan = 8 - izq.length - der.length;
  if ((mitades.length === 1 && faltan !== 0) || faltan < 0) return null;
  const todos = [...izq, ...Array(mitades.length === 2 ? faltan : 0).fill("0"), ...der];
  const n = todos.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return n.length === 8 && n.every((x) => !Number.isNaN(x)) ? n : null;
}

function ipv6Privada(h: number[]): boolean {
  const ceros = (desde: number, hasta: number) => h.slice(desde, hasta).every((x) => x === 0);
  const v4De = (alto: number, bajo: number) => [alto >> 8, alto & 0xff, bajo >> 8, bajo & 0xff];
  if (ceros(0, 8)) return true; // ::
  if (ceros(0, 7) && h[7] === 1) return true; // ::1
  // IPv4 mapeada (::ffff:a.b.c.d) o compatible (::a.b.c.d): manda la IPv4.
  if (ceros(0, 5) && (h[5] === 0xffff || h[5] === 0)) return ipv4Privada(v4De(h[6]!, h[7]!));
  // NAT64 (64:ff9b::/96) y 6to4 (2002::/16) llevan una IPv4 adentro.
  if (h[0] === 0x64 && h[1] === 0xff9b && ceros(2, 6)) return ipv4Privada(v4De(h[6]!, h[7]!));
  if (h[0] === 0x2002) return ipv4Privada(v4De(h[1]!, h[2]!));
  const primero = h[0]!;
  return (
    (primero & 0xfe00) === 0xfc00 || // fc00::/7, únicas locales
    (primero & 0xffc0) === 0xfe80 || // fe80::/10, link-local
    (primero & 0xff00) === 0xff00 // ff00::/8, multicast
  );
}

/** ¿Esta dirección IP (literal) es privada, local o no enrutable? */
export function ipNoPublica(ip: string): boolean {
  const limpia = ip.replace(/^\[|\]$/g, "");
  const familia = isIP(limpia);
  if (familia === 4) return ipv4Privada(octetos(limpia)!);
  if (familia === 6) {
    const h = hextetos(limpia);
    return h === null || ipv6Privada(h);
  }
  return true; // no es una IP: no se puede afirmar que sea pública
}

function nombreLocal(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal");
}

/** Resuelve un nombre a **todas** sus direcciones, IPv4 e IPv6. */
export type Resolver = (host: string) => Promise<string[]>;

const resolverDelSistema: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Antes de pedir: el host no puede ser local, ni una IP privada, ni un nombre
 * que resuelva a **alguna** dirección privada (con una alcanza: el sistema
 * podría elegir justo esa).
 */
async function verificarDestino(url: URL, resolver: Resolver): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (nombreLocal(host)) throw new DescargaError("HOST", "apunta a una dirección local o privada");
  if (isIP(host)) {
    if (ipNoPublica(host)) throw new DescargaError("HOST", "apunta a una dirección local o privada");
    return;
  }
  let direcciones: string[];
  try {
    direcciones = await resolver(host);
  } catch {
    throw new DescargaError("DNS", "el nombre no resuelve");
  }
  if (direcciones.length === 0) throw new DescargaError("DNS", "el nombre no resuelve");
  if (direcciones.some(ipNoPublica))
    throw new DescargaError("HOST", "el nombre resuelve a una dirección local o privada");
}

/** ¿Se puede pedir esta URL? Lanza `DescargaError` si no. */
export function urlPermitida(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new DescargaError("URL", "no es una URL válida");
  }
  if (url.protocol !== "https:") throw new DescargaError("HTTPS", "tiene que ser https://");
  if (url.username || url.password)
    throw new DescargaError("CREDENCIALES", "la URL no puede llevar usuario ni contraseña");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || nombreLocal(host) || (isIP(host) !== 0 && ipNoPublica(host)))
    throw new DescargaError("HOST", "apunta a una dirección local o privada");
  return url;
}

/** Baja la imagen y devuelve sus bytes, o tira `DescargaError` con un motivo legible. */
export async function descargarImagen(
  valor: string,
  opciones: OpcionesDescarga = {}
): Promise<Uint8Array> {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const maxBytes = opciones.maxBytes ?? DESCARGA_MAX_BYTES;
  const timeoutMs = opciones.timeoutMs ?? DESCARGA_TIMEOUT_MS;
  const maxRedirects = opciones.maxRedirects ?? DESCARGA_MAX_REDIRECTS;

  const resolver = opciones.resolver ?? resolverDelSistema;
  let url = urlPermitida(valor);
  for (let saltos = 0; ; saltos++) {
    // En cada salto: una redirección a un nombre que resuelve adentro es
    // exactamente la forma de colarse.
    await verificarDestino(url, resolver);
    let respuesta: Response;
    try {
      respuesta = await fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      });
    } catch (error) {
      const nombre = error instanceof Error ? error.name : "";
      throw nombre === "TimeoutError" || nombre === "AbortError"
        ? new DescargaError("TIMEOUT", `no respondió en ${Math.round(timeoutMs / 1000)} s`)
        : new DescargaError("RED", "no se pudo conectar");
    }

    if (respuesta.status >= 300 && respuesta.status < 400) {
      await respuesta.body?.cancel().catch(() => {});
      const destino = respuesta.headers.get("location");
      if (!destino) throw new DescargaError("REDIRECCION", `redirección sin destino (HTTP ${respuesta.status})`);
      if (saltos >= maxRedirects) throw new DescargaError("REDIRECCIONES", "demasiadas redirecciones");
      url = urlPermitida(new URL(destino, url).toString());
      continue;
    }
    if (!respuesta.ok) {
      await respuesta.body?.cancel().catch(() => {});
      throw new DescargaError(`HTTP_${respuesta.status}`, `el servidor respondió HTTP ${respuesta.status}`);
    }

    const largo = Number(respuesta.headers.get("content-length"));
    if (Number.isFinite(largo) && largo > maxBytes) {
      await respuesta.body?.cancel().catch(() => {});
      throw new DescargaError("PESADA", `pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }
    if (!respuesta.body) throw new DescargaError("VACIA", "vino vacía");

    const reader = respuesta.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new DescargaError("PESADA", `pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB`);
        }
        trozos.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const trozo of trozos) {
      bytes.set(trozo, offset);
      offset += trozo.byteLength;
    }
    if (bytes.byteLength === 0) throw new DescargaError("VACIA", "vino vacía");
    const validar = opciones.validar ?? {
      acepta: (b: Uint8Array) => infoImagen(b) !== null,
      motivo: "no es una imagen JPG, PNG, WebP o GIF",
    };
    if (!validar.acepta(bytes)) throw new DescargaError("FORMATO", validar.motivo);
    return bytes;
  }
}
