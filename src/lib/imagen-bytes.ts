/**
 * Qué es un archivo de imagen y cuánto mide, **mirando los bytes**. Puro: sin
 * Node, sin red, sin decodificar la imagen entera.
 *
 * El tipo y las dimensiones que manda el navegador son texto que elige quien
 * sube: `image/webp` en la cabecera y un `.svg` con un `<script>` adentro es
 * el camino corto a un XSS servido desde nuestro propio dominio de imágenes.
 * Por eso el servidor decide con esto, y SVG no existe acá.
 */

export type FormatoImagen = "jpeg" | "png" | "webp" | "gif";

export type InfoImagen = { format: FormatoImagen; width: number; height: number };

function empieza(bytes: Uint8Array, firma: readonly number[], desde = 0): boolean {
  return bytes.length >= desde + firma.length && firma.every((b, i) => bytes[desde + i] === b);
}

/** La firma de los primeros bytes. `null` = no es una imagen que aceptemos. */
export function sniffFormato(bytes: Uint8Array): FormatoImagen | null {
  if (empieza(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (empieza(bytes, [0x52, 0x49, 0x46, 0x46]) && empieza(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  if (empieza(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || empieza(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
    return "gif";
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);

/** JPEG: el primer marcador SOF (baseline, progresivo, etc.) trae alto y ancho. */
function dimensionesJpeg(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    // Relleno: varios 0xFF seguidos son válidos entre marcadores.
    while (b[i] === 0xff && i < b.length) i++;
    const marker = b[i]!;
    i++;
    // Marcadores sin longitud.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // fin o datos antes del SOF
    if (i + 1 >= b.length) return null;
    const length = u16be(b, i);
    if (length < 2) return null;
    const esSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (esSof) {
      if (i + 7 > b.length) return null;
      const height = u16be(b, i + 3);
      const width = u16be(b, i + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += length;
  }
  return null;
}

/** PNG: el chunk IHDR va siempre primero. */
function dimensionesPng(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || !empieza(b, [0x49, 0x48, 0x44, 0x52], 12)) return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** WebP: VP8 (con pérdida), VP8L (sin pérdida) o VP8X (extendido, con alfa). */
function dimensionesWebp(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (chunk === "VP8 ") {
    // Frame tag (3 bytes) + firma 9d 01 2a + ancho/alto de 14 bits.
    if (!empieza(b, [0x9d, 0x01, 0x2a], 23)) return null;
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (chunk === "VP8X") {
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    return { width, height };
  }
  return null;
}

function dimensionesGif(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10) return null;
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Formato y dimensiones según los bytes, o `null` si no es una imagen que
 * aceptemos o la cabecera está rota. No decodifica: sirve para rechazar
 * barato, no para garantizar que la imagen entera esté sana.
 */
export function infoImagen(bytes: Uint8Array): InfoImagen | null {
  const format = sniffFormato(bytes);
  if (!format) return null;
  const dims =
    format === "jpeg"
      ? dimensionesJpeg(bytes)
      : format === "png"
        ? dimensionesPng(bytes)
        : format === "webp"
          ? dimensionesWebp(bytes)
          : dimensionesGif(bytes);
  return dims ? { format, ...dims } : null;
}
