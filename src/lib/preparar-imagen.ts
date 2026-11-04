import { boxesFor, sizeForBox } from "./imagenes-r2";

/**
 * Prepara en el **navegador** la foto que el panel va a subir: la orienta,
 * la achica a 1200 de lado como mucho y la codifica en un WebP por caja
 * (240/480/800/1200, sin agrandar) más un JPEG de respaldo. Lo que viaja al
 * servidor es eso, no el original de 8 MB del celular.
 *
 * Se hace acá y no en el servidor porque el slot de Hostinger tiene poca CPU
 * y el teléfono de quien sube tiene de sobra, y porque el original nunca
 * llega a la tienda (ni su EXIF con el GPS). El servidor igual verifica todo
 * por los bytes (`verificarSetPreparado`): esto ahorra, no autoriza.
 *
 * Reemplaza el campo `file` del `FormData` por `imageWidth`, `imageHeight`,
 * `webp<caja>` y `jpeg`. Si el set no entra en el presupuesto ni bajando la
 * calidad, tira un error con un texto para mostrar.
 */

export type OpcionesPreparacion = {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  /** Mensajes para mostrar (del catálogo de i18n de quien llama). */
  mensajes: {
    elegi: string;
    noSePudoLeer: string;
    demasiadoGrande: string;
    sinWebp: string;
    pesada: string;
  };
};

/** Lo máximo que se manda por foto, sumando todos los archivos. */
export const PRESUPUESTO_BYTES = 900 * 1024;
/** El original más pesado que se acepta para preparar. */
export const MAX_ORIGINAL_NAVEGADOR = 25 * 1024 * 1024;

const PERFILES = [
  { box: 1200, webp: 0.75, jpeg: 0.82 },
  { box: 1200, webp: 0.62, jpeg: 0.72 },
  { box: 800, webp: 0.6, jpeg: 0.7 },
] as const;

function abortado(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Preparación cancelada.", "AbortError");
}

/** El formulario ya trae la foto preparada (por ejemplo, un reintento). */
export function yaPreparada(data: FormData): boolean {
  return data.has("jpeg") && data.has("imageWidth");
}

export async function prepararImagenParaSubir(
  data: FormData,
  opciones: OpcionesPreparacion
): Promise<void> {
  const { signal, onProgress, mensajes } = opciones;
  abortado(signal);
  const file = data.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > MAX_ORIGINAL_NAVEGADOR ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    throw new Error(mensajes.elegi);
  }
  onProgress?.(0);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    abortado(signal);
    throw new Error(mensajes.noSePudoLeer);
  });
  try {
    abortado(signal);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 50_000_000) {
      throw new Error(mensajes.demasiadoGrande);
    }
    let hechos = 0;
    for (const perfil of PERFILES) {
      const tamano = sizeForBox(bitmap.width, bitmap.height, perfil.box)!;
      const preparados: [string, Blob, string][] = [];
      const codificar = async (box: number, type: string, quality: number) => {
        abortado(signal);
        // Ceder entre codificaciones: en un celular, el progreso y el botón de
        // cancelar tienen que poder pintarse.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        abortado(signal);
        const dims = sizeForBox(tamano.width, tamano.height, box)!;
        const canvas = document.createElement("canvas");
        canvas.width = dims.width;
        canvas.height = dims.height;
        try {
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error(mensajes.noSePudoLeer);
          // El JPEG no tiene transparencia: fondo blanco. El WebP la conserva
          // (un logo sobre el header oscuro no puede salir con un recuadro).
          if (type === "image/jpeg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error(mensajes.noSePudoLeer))),
              type,
              quality
            )
          );
          abortado(signal);
          if (blob.type !== type) throw new Error(mensajes.sinWebp);
          onProgress?.(Math.min(95, ++hechos * 6));
          return blob;
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      };
      for (const box of boxesFor(tamano.width, tamano.height)) {
        preparados.push([`webp${box}`, await codificar(box, "image/webp", perfil.webp), `${box}.webp`]);
      }
      preparados.push([
        "jpeg",
        await codificar(Math.max(tamano.width, tamano.height), "image/jpeg", perfil.jpeg),
        "respaldo.jpg",
      ]);
      if (preparados.reduce((suma, item) => suma + item[1].size, 0) > PRESUPUESTO_BYTES) continue;
      abortado(signal);
      // Nada asíncrono de acá en adelante: cancelar no puede dejar un set a medias.
      data.delete("file");
      data.set("imageWidth", String(tamano.width));
      data.set("imageHeight", String(tamano.height));
      for (const [nombre, blob, archivo] of preparados) data.set(nombre, blob, archivo);
      onProgress?.(100);
      return;
    }
    throw new Error(mensajes.pesada);
  } finally {
    bitmap.close();
  }
}
