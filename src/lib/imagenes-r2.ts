/**
 * El formato de las imágenes públicas en R2 (`p1`). **Puro**: sin
 * credenciales, sin red, sin APIs de Node — lo usan el servidor, los scripts
 * y los componentes cliente por igual.
 *
 * ### La referencia
 *
 * Lo que se guarda en la base (`product_images`, la foto de una categoría, el
 * QR, el logo…) es una referencia, no una URL:
 *
 *     r2:p1/remera-azul-3f9a0c12de@1200x900
 *
 * `remera-azul` es legible a propósito (quien mire el bucket entiende qué
 * hay), `3f9a0c12de` son los primeros 10 hex del SHA-256 del contenido —el
 * nombre cambia si cambia la foto, así que un objeto nunca se pisa y se puede
 * cachear para siempre— y `1200x900` son las dimensiones reales del archivo
 * más grande, que es lo que permite armar el `srcset` y reservar el alto sin
 * pedir nada a la red.
 *
 * ### Los objetos
 *
 * Por cada referencia hay un WebP por caja (`p1/<base>-240.webp`, `-480`,
 * `-800`, `-1200`, sólo las que no agrandan la foto) y un JPEG de respaldo
 * (`p1/<base>.jpg`) para el navegador que no habla WebP y para Open Graph.
 * Nunca se recorta: cada archivo es la foto entera con su proporción.
 *
 * La URL pública es `<base pública>/<clave>`, donde la base pública es el
 * dominio del bucket que se carga en `/admin/integraciones` (R2). Sin base,
 * no hay URL y quien llama muestra el placeholder.
 */

export const P1_BOXES = [240, 480, 800, 1200] as const;
export const P1_MAX_SLUG_LENGTH = 80;
export const P1_MAX_REF_LENGTH = 255;
/** El lado más largo del archivo más grande. Nada se sube más grande que esto. */
export const P1_MAX_EDGE = 1200;
export const P1_WEBP = {
  quality: 75,
  effort: 6,
  smartSubsample: true,
} as const;
export const P1_JPEG = { quality: 82, mozjpeg: true } as const;

/** Cache de los objetos públicos: el nombre lleva el hash, así que no cambian nunca. */
export const P1_CACHE_CONTROL = "public, max-age=31536000, immutable";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([0-9a-f]{10})$/;
const REF =
  /^r2:p1\/([a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{10})@([1-9][0-9]{0,4})x([1-9][0-9]{0,4})$/;

export type R2ImageRef = { base: string; width: number; height: number };

function validBase(base: string): boolean {
  const match = BASE.exec(base);
  return !!match && match[0] === base && match[1]!.length <= P1_MAX_SLUG_LENGTH;
}

function validDimensions(w: number, h: number): boolean {
  return [w, h].every((n) => Number.isInteger(n) && n > 0 && n <= 99_999);
}

/** Las cajas que existen para una foto de `w`×`h`: nunca se agranda. */
export function boxesFor(w: number, h: number): number[] {
  if (!validDimensions(w, h)) return [];
  const longest = Math.max(w, h);
  const boxes: number[] = P1_BOXES.filter((b) => b <= longest);
  if (longest < P1_MAX_EDGE && (boxes.length === 0 || longest > 1.2 * boxes.at(-1)!)) {
    boxes.push(longest);
  }
  return boxes;
}

/**
 * `"r2:p1/…@WxH"` → sus partes, o `null` si no es una referencia válida.
 *
 * Un `null` acá es **el placeholder**: un id viejo de otro proveedor, un
 * texto pegado a mano o una referencia rota nunca arman una URL.
 */
export function parseRef(ref: string | null | undefined): R2ImageRef | null {
  if (!ref || ref.length > P1_MAX_REF_LENGTH) return null;
  const match = REF.exec(ref);
  if (!match || match[0] !== ref || !validBase(match[1]!)) return null;
  return { base: match[1]!, width: Number(match[2]), height: Number(match[3]) };
}

/** ¿Es una referencia de R2 bien formada? */
export function esRefR2(ref: string | null | undefined): boolean {
  return parseRef(ref) !== null;
}

export function formatRef(base: string, w: number, h: number): string | null {
  if (!validBase(base) || !validDimensions(w, h)) return null;
  const ref = `r2:p1/${base}@${w}x${h}`;
  return parseRef(ref) ? ref : null;
}

export function keyFor(base: string, box: number): string | null {
  return validBase(base) && Number.isInteger(box) && box > 0 && box <= P1_MAX_EDGE
    ? `p1/${base}-${box}.webp`
    : null;
}

export function jpegKeyFor(base: string): string | null {
  return validBase(base) ? `p1/${base}.jpg` : null;
}

/** Las dimensiones reales del archivo de una caja (no el descriptor del srcset). */
export function sizeForBox(w: number, h: number, box: number) {
  if (!validDimensions(w, h) || !Number.isInteger(box) || box <= 0) return null;
  const scale = Math.min(1, box / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function jpegSizeFor(w: number, h: number) {
  return sizeForBox(w, h, P1_MAX_EDGE);
}

/**
 * La parte legible de la clave: un slug válido de hasta 80 caracteres. Lo que
 * no tenga ni una letra (un nombre todo emojis) cae en `respaldo`.
 */
export function slugParaClave(texto: string, respaldo = "foto"): string {
  const slug = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, P1_MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return SLUG.test(slug) ? slug : respaldo;
}

export type ObjetoPlaneado = {
  key: string;
  format: "webp" | "jpeg";
  width: number;
  height: number;
  box: number;
};

/**
 * La referencia y los objetos de una foto de `w`×`h` cuyo contenido tiene
 * hash `sha256` (64 hex). Es la única forma de derivar claves: la usan la
 * subida del panel, la importación por planilla, los scripts de carga masiva
 * y la migración, así que todos escriben el mismo árbol.
 */
export function planImagen(slug: string, sha256: string, w: number, h: number) {
  if (!SLUG.test(slug) || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!validDimensions(w, h) || Math.max(w, h) > 99_999) return null;
  const base = `${slug.slice(0, P1_MAX_SLUG_LENGTH).replace(/-+$/, "")}-${sha256.slice(0, 10)}`;
  const ref = formatRef(base, w, h);
  if (!ref) return null;
  const objects: ObjetoPlaneado[] = [
    ...boxesFor(w, h).map((box) => ({
      key: keyFor(base, box)!,
      format: "webp" as const,
      ...sizeForBox(w, h, box)!,
      box,
    })),
    {
      key: jpegKeyFor(base)!,
      format: "jpeg" as const,
      ...jpegSizeFor(w, h)!,
      box: Math.min(P1_MAX_EDGE, Math.max(w, h)),
    },
  ];
  return { ref, base, objects };
}

/**
 * La base pública del bucket, normalizada: `https://`, sin credenciales, sin
 * query ni hash, sin barra final. Cualquier otra cosa da `null` (apagado):
 * una base rara no arma URLs a medias.
 */
export function normalizarBasePublica(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim();
  if (!texto || /\s/.test(texto)) return null;
  try {
    const url = new URL(texto);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** El tamaño con el que se va a mostrar: elige la caja, no recorta. */
export type ImageSize =
  | "thumb"
  | "card"
  | "detail"
  | "og"
  | "hero"
  | "qr"
  | "logo"
  | "favicon";

const CAJA_PREFERIDA: Record<ImageSize, number | null> = {
  thumb: 240,
  card: 480,
  logo: 480,
  favicon: 240,
  detail: null,
  hero: null,
  qr: null,
  og: null,
};

/** Una URL para un tamaño. `og` es el JPEG: lo que entienden todos los chats. */
export function urlR2(
  ref: string | null | undefined,
  size: ImageSize,
  base: string | null
): string | null {
  const parsed = parseRef(ref);
  if (!parsed || !base) return null;
  if (size === "og") return `${base}/${jpegKeyFor(parsed.base)}`;
  const boxes = boxesFor(parsed.width, parsed.height);
  const preferida = CAJA_PREFERIDA[size];
  const box =
    preferida === null
      ? boxes.at(-1)!
      : (boxes.find((b) => b >= preferida) ?? boxes.at(-1)!);
  return `${base}/${keyFor(parsed.base, box)}`;
}

export type FuentesR2 = {
  /** El WebP para `<img src>` en un navegador sin `srcset` (y el de tarjeta). */
  src: string;
  /** `url 240w, url 480w, …` — el ancho real de cada archivo. */
  srcSet: string;
  /** El JPEG de respaldo, para `<img>` adentro del `<picture>`. */
  jpeg: string;
  width: number;
  height: number;
};

/** Todo lo que necesita un `<picture>`. `null` = placeholder. */
export function fuentesR2(
  ref: string | null | undefined,
  base: string | null,
  size: ImageSize = "card"
): FuentesR2 | null {
  const parsed = parseRef(ref);
  if (!parsed || !base) return null;
  const sources = new Map<number, string>();
  for (const box of boxesFor(parsed.width, parsed.height)) {
    // Fotos muy angostas pueden redondear al mismo ancho: un candidato por ancho.
    const width = sizeForBox(parsed.width, parsed.height, box)!.width;
    sources.set(width, `${base}/${keyFor(parsed.base, box)}`);
  }
  const jpeg = jpegSizeFor(parsed.width, parsed.height)!;
  return {
    src: urlR2(ref, size === "og" ? "detail" : size, base)!,
    srcSet: [...sources].map(([width, url]) => `${url} ${width}w`).join(", "),
    jpeg: `${base}/${jpegKeyFor(parsed.base)}`,
    width: jpeg.width,
    height: jpeg.height,
  };
}
