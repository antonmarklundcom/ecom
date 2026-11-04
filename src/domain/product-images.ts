import { AdminInputError } from "./admin-products";
import { infoImagen } from "@/lib/imagen-bytes";
import { P1_MAX_EDGE, boxesFor, jpegSizeFor, sizeForBox } from "@/lib/imagenes-r2";
import { cargarIntegraciones } from "@/lib/integraciones-store";
import { clienteR2, r2Configurado } from "@/lib/r2";
import {
  sha256Hex,
  subirSetImagen,
  type ObjetoSet,
  type SetImagen,
} from "@/lib/r2-imagenes";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/upload-limits";

/**
 * Validación de las fotos que sube el panel (PLAN.md 4.6): producto,
 * categoría, portada, logo, favicon y QR del banco.
 *
 * El navegador ya achicó la foto (`src/lib/preparar-imagen.ts`): manda un
 * WebP por caja (`webp240`, `webp480`, …) y un JPEG de respaldo (`jpeg`), con
 * el ancho y alto declarados. **Nada de eso se cree**: cada archivo se mira
 * por sus bytes —firma y dimensiones de la cabecera—, el juego de cajas tiene
 * que ser exactamente el que corresponde a esas dimensiones, y el total tiene
 * un techo. Un `image/webp` declarado que en realidad es un SVG con un
 * `<script>` no llega nunca al bucket público.
 */

// Ver `@/lib/upload-limits` (lo lee también `next.config.ts`).
export { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/upload-limits";

/** Los nombres de los campos del formulario que arma `preparar-imagen.ts`. */
export const CAMPO_ANCHO = "imageWidth";
export const CAMPO_ALTO = "imageHeight";
export const CAMPO_JPEG = "jpeg";
export const campoWebp = (box: number) => `webp${box}`;

function entero(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== "string" || !/^[1-9][0-9]{0,4}$/.test(valor)) return null;
  return Number(valor);
}

async function bytesDe(valor: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!(valor instanceof Blob)) return null;
  return new Uint8Array(await valor.arrayBuffer());
}

/**
 * El set preparado por el navegador, verificado. Tira `AdminInputError` con
 * la clave del catálogo que corresponda; nunca deja pasar un set a medias.
 */
export async function verificarSetPreparado(form: FormData): Promise<SetImagen> {
  const width = entero(form.get(CAMPO_ANCHO));
  const height = entero(form.get(CAMPO_ALTO));
  // Sin dimensiones es un formulario viejo o armado a mano (el original sin
  // preparar): se pide que el navegador lo prepare.
  if (width === null || height === null) throw new AdminInputError("adminError.foto.sinPreparar");
  if (Math.max(width, height) > P1_MAX_EDGE) throw new AdminInputError("adminError.foto.formato");

  const esperados = [
    ...boxesFor(width, height).map((box) => ({
      campo: campoWebp(box),
      box,
      format: "webp" as const,
      ...sizeForBox(width, height, box)!,
    })),
    {
      campo: CAMPO_JPEG,
      box: Math.max(width, height),
      format: "jpeg" as const,
      ...jpegSizeFor(width, height)!,
    },
  ];

  // Ni un archivo de más: un campo `webp1600` o un segundo JPEG es un set
  // que no salió de nuestro preparador.
  const permitidos = new Set(esperados.map((e) => e.campo));
  for (const [campo, valor] of form.entries()) {
    if (valor instanceof Blob && !permitidos.has(campo)) {
      throw new AdminInputError("adminError.foto.formato");
    }
  }

  const objetos: ObjetoSet[] = [];
  let total = 0;
  for (const esperado of esperados) {
    const bytes = await bytesDe(form.get(esperado.campo));
    if (!bytes || bytes.byteLength === 0) throw new AdminInputError("adminError.foto.vacia");
    total += bytes.byteLength;
    if (total > PRODUCT_IMAGE_MAX_BYTES) throw new AdminInputError("adminError.foto.pesada");
    const info = infoImagen(bytes);
    if (
      !info ||
      info.format !== esperado.format ||
      info.width !== esperado.width ||
      info.height !== esperado.height
    ) {
      throw new AdminInputError("adminError.foto.formato");
    }
    objetos.push({
      box: esperado.box,
      format: esperado.format,
      width: esperado.width,
      height: esperado.height,
      bytes,
    });
  }

  // El hash de los archivos tal como se van a guardar, en orden: el mismo
  // set da la misma clave; cualquier byte distinto, otra.
  const todo = new Uint8Array(total);
  let offset = 0;
  for (const objeto of objetos) {
    todo.set(objeto.bytes, offset);
    offset += objeto.bytes.byteLength;
  }
  return { width, height, sha256: sha256Hex(todo), objetos };
}

/**
 * El camino entero de una foto del panel: R2 configurado → set verificado →
 * objetos escritos → la referencia. Quien llama guarda la referencia **después**
 * (la fila de la galería, la categoría, el QR…), así que si algo de acá falla
 * no queda ninguna fila apuntando a un objeto que no existe.
 *
 * `nombre` es la parte legible de la clave (el slug del producto, "portada",
 * "logo"…); `respaldo` se usa si el nombre no deja ni una letra.
 */
export async function subirFotoDelPanel(
  form: FormData,
  nombre: string,
  respaldo = "foto"
): Promise<string> {
  await cargarIntegraciones();
  if (!r2Configurado()) throw new AdminInputError("adminError.foto.sinAlmacenamiento");
  const set = await verificarSetPreparado(form);
  return subirSetImagen(clienteR2(), set, nombre, respaldo);
}
