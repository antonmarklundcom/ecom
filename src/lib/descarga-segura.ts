import { infoImagen } from "./imagen-bytes";

/**
 * Bajar una foto de una URL que escribió una persona (la columna Fotos de la
 * planilla, la migración de fotos viejas) **desde el servidor**, con todos
 * los topes:
 *
 * - sólo `https://`, sin usuario/contraseña en la URL, sin hosts locales ni
 *   IPs privadas escritas a mano (`localhost`, `10.x`, `192.168.x`,
 *   `169.254.x`…);
 * - redirecciones seguidas a mano, como mucho `maxRedirects`, cada una
 *   revisada con las mismas reglas;
 * - timeout por pedido y tope de bytes (se corta al leer, no se confía en el
 *   `Content-Length`);
 * - el contenido tiene que ser una imagen por **sus bytes** (JPEG, PNG, WebP
 *   o GIF): un HTML de "no encontrado" con status 200 no pasa.
 *
 * No resuelve DNS: un nombre público que apunta a una IP interna no se
 * detecta acá. Quien importa es el dueño o el encargado del panel, no
 * cualquiera de internet.
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
};

export const DESCARGA_MAX_BYTES = 15 * 1024 * 1024;
export const DESCARGA_TIMEOUT_MS = 20_000;
export const DESCARGA_MAX_REDIRECTS = 3;

function ipPrivada(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal"))
    return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (h.includes(":")) {
    return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  }
  return false;
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
  if (!url.hostname || ipPrivada(url.hostname))
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

  let url = urlPermitida(valor);
  for (let saltos = 0; ; saltos++) {
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
    if (!infoImagen(bytes)) throw new DescargaError("FORMATO", "no es una imagen JPG, PNG, WebP o GIF");
    return bytes;
  }
}
