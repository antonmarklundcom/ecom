import { createHash } from "node:crypto";

import { infoImagen } from "./imagen-bytes";
import {
  P1_CACHE_CONTROL,
  P1_JPEG,
  P1_MAX_EDGE,
  P1_WEBP,
  boxesFor,
  jpegSizeFor,
  planImagen,
  sizeForBox,
  slugParaClave,
} from "./imagenes-r2";
import type { ClienteR2 } from "./r2";

/**
 * Las fotos públicas, del lado del servidor: el set de archivos de una foto
 * (`SetImagen`), cómo se arma desde un original con `sharp` (importación por
 * planilla, migración, carga masiva) y cómo se sube a R2.
 *
 * La regla que importa está en `subirSetImagen`: **devuelve la referencia
 * recién cuando todos los objetos quedaron escritos**. Quien llama inserta la
 * fila (`product_images`, la categoría, el QR…) después, nunca antes: una fila
 * que apunta a un objeto que no existe es una foto rota en la vidriera,
 * mientras que un objeto sin fila es un archivo de más que no ve nadie.
 */

export type ObjetoSet = {
  box: number;
  format: "webp" | "jpeg";
  width: number;
  height: number;
  bytes: Uint8Array;
};

/** Una foto lista para subir: sus dimensiones, el hash que va en la clave y los archivos. */
export type SetImagen = {
  width: number;
  height: number;
  /** 64 hex. Del original (sharp) o de los archivos preparados (navegador). */
  sha256: string;
  objetos: ObjetoSet[];
};

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Lo más grande que se acepta como original para redimensionar en el servidor. */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const MAX_ORIGINAL_PIXELS = 50_000_000;

export class ImagenInvalidaError extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "ImagenInvalidaError";
  }
}

type Sharp = typeof import("sharp").default;

let sharpCargado: Promise<Sharp> | null = null;

/** `sharp` se carga recién cuando se usa: el panel sube sets ya preparados y no lo necesita. */
async function cargarSharp(): Promise<Sharp> {
  sharpCargado ??= import("sharp").then((mod) => mod.default);
  return sharpCargado;
}

/**
 * Un original (JPEG, PNG, WebP o GIF, sólo el primer cuadro) → el set p1:
 * un WebP por caja y un JPEG de respaldo, nunca agrandado, nunca recortado,
 * orientado según el EXIF y sin metadatos (sharp no copia el EXIF salvo que
 * se le pida: ni GPS ni modelo de cámara salen de la tienda).
 *
 * El hash es el del **original**: la misma foto, importada dos veces, da la
 * misma clave — la migración y la importación son idempotentes por eso.
 */
export async function prepararDesdeOriginal(original: Uint8Array): Promise<SetImagen> {
  if (original.byteLength === 0) throw new ImagenInvalidaError("VACIA");
  if (original.byteLength > MAX_ORIGINAL_BYTES) throw new ImagenInvalidaError("DEMASIADO_PESADA");
  const info = infoImagen(original);
  if (!info) throw new ImagenInvalidaError("FORMATO");

  const sharp = await cargarSharp();
  const entrada = () =>
    sharp(original, {
      limitInputPixels: MAX_ORIGINAL_PIXELS,
      page: 0,
      pages: 1,
      failOn: "error",
    }).rotate();

  // Decodificar y orientar una sola vez; los redondeos de shrink-on-load de
  // JPEG/WebP podrían mover un píxel, los píxeles crudos no.
  const decodificada = await entrada()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new ImagenInvalidaError("NO_SE_PUDO_LEER");
    });
  const { width: w0, height: h0, channels } = decodificada.info;
  if (!w0 || !h0 || w0 * h0 > MAX_ORIGINAL_PIXELS) throw new ImagenInvalidaError("PIXELES");

  // La foto de trabajo ya acotada a 1200: lo que se guarda en la referencia.
  const tope = sizeForBox(w0, h0, P1_MAX_EDGE)!;
  const crudo = () =>
    sharp(decodificada.data, { raw: { width: w0, height: h0, channels } });
  const base =
    tope.width === w0 && tope.height === h0
      ? decodificada
      : await crudo()
          .resize(tope.width, tope.height, { fit: "fill" })
          .raw()
          .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const desdeBase = () =>
    sharp(base.data, { raw: { width, height, channels: base.info.channels } });

  const objetos: ObjetoSet[] = [];
  for (const box of boxesFor(width, height)) {
    const destino = sizeForBox(width, height, box)!;
    const out = await desdeBase()
      .resize(destino.width, destino.height, { fit: "fill" })
      .webp(P1_WEBP)
      .toBuffer({ resolveWithObject: true });
    if (out.info.width !== destino.width || out.info.height !== destino.height)
      throw new ImagenInvalidaError("DIMENSIONES");
    objetos.push({ box, format: "webp", ...destino, bytes: new Uint8Array(out.data) });
  }
  const jpegDims = jpegSizeFor(width, height)!;
  const jpeg = await desdeBase()
    .resize(jpegDims.width, jpegDims.height, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .jpeg(P1_JPEG)
    .toBuffer({ resolveWithObject: true });
  objetos.push({
    box: Math.min(P1_MAX_EDGE, Math.max(width, height)),
    format: "jpeg",
    ...jpegDims,
    bytes: new Uint8Array(jpeg.data),
  });

  return { width, height, sha256: sha256Hex(original), objetos };
}

/**
 * Sube el set y devuelve la referencia `r2:p1/…`. Escribe cada objeto con
 * `If-None-Match: *` (una clave nunca se pisa; si ya está, es la misma foto)
 * y el JPEG al final. Si algo falla tira, y quien llama **no** inserta nada.
 */
export async function subirSetImagen(
  cliente: ClienteR2,
  set: SetImagen,
  nombre: string,
  respaldo = "foto"
): Promise<string> {
  const plan = planImagen(slugParaClave(nombre, respaldo), set.sha256, set.width, set.height);
  if (!plan) throw new ImagenInvalidaError("REFERENCIA");
  const pendientes = plan.objects.map((esperado) => {
    const objeto = set.objetos.find(
      (o) => o.format === esperado.format && (o.format === "jpeg" || o.box === esperado.box)
    );
    if (!objeto || objeto.width !== esperado.width || objeto.height !== esperado.height)
      throw new ImagenInvalidaError("SET_INCOMPLETO");
    return { key: esperado.key, objeto };
  });
  if (pendientes.length !== set.objetos.length) throw new ImagenInvalidaError("SET_INCOMPLETO");

  // Los WebP primero, el JPEG al final (el orden de `planImagen`).
  for (const { key, objeto } of pendientes) {
    await cliente.put(key, objeto.bytes, {
      contentType: objeto.format === "webp" ? "image/webp" : "image/jpeg",
      cacheControl: P1_CACHE_CONTROL,
      soloSiNoExiste: true,
    });
  }
  return plan.ref;
}
