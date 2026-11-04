import "../src/lib/load-env";

import { createHash } from "node:crypto";

import { and, eq, isNotNull, like, not } from "drizzle-orm";

import { TIENDA } from "../src/config/tienda";
import { refDeHeroImagen } from "../src/lib/hero-imagen";
import { closePool, getDb } from "../src/db";
import {
  bankDetails,
  categories,
  orders,
  productImages,
  products,
  receipts,
} from "../src/db/schema";
import { sniffMime } from "../src/domain/receipts";
import { readStoreSettings, saveStoreSettingsSection } from "../src/domain/store-settings";
import { DescargaError, descargarImagen } from "../src/lib/descarga-segura";
import { esRefR2 } from "../src/lib/imagenes-r2";
import { cargarIntegraciones } from "../src/lib/integraciones-store";
import {
  PREFIJO_COMPROBANTES,
  clavePrivada,
  clienteR2,
  mensajeR2,
  r2Configurado,
  refPrivada,
  type ClienteR2,
} from "../src/lib/r2";
import { ImagenInvalidaError, prepararDesdeOriginal, subirSetImagen } from "../src/lib/r2-imagenes";
import { RECEIPT_MAX_BYTES } from "../src/lib/upload-limits";

/**
 * `pnpm fotos:migrar-cloudinary -- --cloud <cloud_name> [--aplicar] [--api-key K --api-secret S]`
 *
 * La migración, por única vez, de una tienda que tenía las fotos en
 * Cloudinary: es **el único archivo** del template (junto con el historial
 * del CHANGELOG) que todavía sabe que Cloudinary existió.
 *
 * Qué hace, por cada referencia que no es de R2:
 *
 * - **Públicas** (fotos de producto, foto de categoría, QR del banco,
 *   portada/logo/favicon de `/admin/ajustes`): baja el original por la URL
 *   pública de entrega (`https://res.cloudinary.com/<cloud>/image/upload/<id>`,
 *   https simple, sin SDK ni credenciales), lo pasa por el mismo pipeline que
 *   todo lo demás (WebP por caja + JPEG), lo sube a R2 y **recién después**
 *   reescribe la referencia (con `WHERE` sobre el valor viejo, así una fila
 *   que alguien cambió mientras tanto no se pisa).
 * - **Comprobantes** (privados, `type: authenticated`): sólo si se pasan
 *   `--api-key` y `--api-secret` (los de la cuenta vieja, por la línea de
 *   comandos y nunca guardados), con una URL de descarga firmada de vida
 *   corta. Se suben a `comprobantes/<aleatorio>/…` en R2. Sin esas dos
 *   opciones quedan como están: el panel los muestra como "comprobante de
 *   antes del cambio" y los pedidos ya revisados no los necesitan; los que
 *   todavía esperan revisión conviene migrarlos o pedírselos de nuevo a la
 *   compradora.
 * - **`TIENDA.hero.imagen`** (`src/config/tienda.ts`) es código: se migra el
 *   archivo y se imprime la referencia nueva para pegarla a mano.
 *
 * **Ensayo por defecto**: sin `--aplicar` cuenta y lista, no baja ni escribe
 * nada. **Idempotente**: lo que ya es `r2:` no se toca, y la misma foto da la
 * misma clave (el hash del original), así que cortarla y volver a correrla no
 * duplica nada. Lee R2 de `/admin/integraciones` (o `R2_*`), y la base de
 * `DATABASE_URL`.
 */

export type Opciones = {
  cloud: string;
  aplicar: boolean;
  apiKey: string | null;
  apiSecret: string | null;
};

export function parseArgs(argv: readonly string[]): Opciones {
  const args = argv.filter((arg) => arg !== "--");
  const valor = (nombre: string): string | null => {
    const i = args.indexOf(nombre);
    if (i < 0) return null;
    const v = args[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${nombre} espera un valor`);
    return v;
  };
  const conocidas = new Set(["--cloud", "--aplicar", "--api-key", "--api-secret"]);
  for (const [i, arg] of args.entries()) {
    const anterior = args[i - 1];
    const esValor = anterior !== undefined && ["--cloud", "--api-key", "--api-secret"].includes(anterior);
    if (!esValor && !conocidas.has(arg)) throw new Error(`no conozco la opción "${arg}"`);
  }
  const cloud = valor("--cloud");
  if (!cloud || !/^[A-Za-z0-9_-]{1,100}$/.test(cloud)) {
    throw new Error("Falta --cloud <cloud_name> (el nombre de la cuenta vieja, letras, números, - y _)");
  }
  const apiKey = valor("--api-key");
  const apiSecret = valor("--api-secret");
  if ((apiKey === null) !== (apiSecret === null)) {
    throw new Error("--api-key y --api-secret van juntos (sólo hacen falta para migrar comprobantes)");
  }
  return { cloud, aplicar: args.includes("--aplicar"), apiKey, apiSecret };
}

/** Un `public_id` con forma razonable: nada que se pueda colar en la URL. */
export function idLegacyValido(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9/_.,-]{0,254}$/.test(id) && !id.includes("..") && !id.includes("//");
}

/** La URL pública de entrega del original, sin transformaciones. */
export function urlPublicaLegacy(cloud: string, publicId: string): string {
  const ruta = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/${ruta}`;
}

/**
 * La URL firmada de descarga de un recurso `authenticated` (la misma que
 * armaba el SDK con `private_download_url`): parámetros ordenados, unidos con
 * `&`, más el secret, SHA-1. Vence en `segundos`.
 */
export function urlComprobanteFirmada(
  cloud: string,
  apiKey: string,
  apiSecret: string,
  publicId: string,
  ahora: Date = new Date(),
  segundos = 300
): string {
  const timestamp = Math.floor(ahora.getTime() / 1000);
  const params: Record<string, string> = {
    expires_at: String(timestamp + segundos),
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };
  const firmar = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1").update(firmar + apiSecret).digest("hex");
  const query = new URLSearchParams({ ...params, api_key: apiKey, signature });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/download?${query.toString()}`;
}

type Pendiente = {
  tipo: "foto" | "categoria" | "qr" | "ajuste" | "tienda.ts" | "comprobante";
  id: number | string;
  ref: string;
  nombre: string;
};

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

function motivo(error: unknown): string {
  if (error instanceof DescargaError) return error.message;
  if (error instanceof ImagenInvalidaError) return `imagen inválida (${error.codigo})`;
  return mensajeR2(error);
}

async function recolectar(): Promise<{ publicas: Pendiente[]; comprobantes: (Pendiente & { mime: string })[] }> {
  const db = getDb();
  const publicas: Pendiente[] = [];
  for (const fila of await db
    .select({ id: productImages.id, ref: productImages.imageRef, slug: products.slug })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(not(like(productImages.imageRef, "r2:%")))) {
    publicas.push({ tipo: "foto", id: fila.id, ref: fila.ref, nombre: fila.slug });
  }
  for (const fila of await db
    .select({ id: categories.id, ref: categories.imageRef, slug: categories.slug })
    .from(categories)
    .where(and(isNotNull(categories.imageRef), not(like(categories.imageRef, "r2:%"))))) {
    publicas.push({ tipo: "categoria", id: fila.id, ref: fila.ref!, nombre: fila.slug });
  }
  for (const fila of await db
    .select({ id: bankDetails.id, ref: bankDetails.qrImageRef })
    .from(bankDetails)
    .where(and(isNotNull(bankDetails.qrImageRef), not(like(bankDetails.qrImageRef, "r2:%"))))) {
    publicas.push({ tipo: "qr", id: fila.id, ref: fila.ref!, nombre: "qr-banco" });
  }
  const { settings } = await readStoreSettings();
  for (const [campo, ref, nombre] of [
    ["heroImagenId", settings.marca.heroImagenId, "portada"],
    ["logoId", settings.identidad.logoId, "logo"],
    ["faviconId", settings.identidad.faviconId, "favicon"],
  ] as const) {
    if (ref && !esRefR2(ref)) publicas.push({ tipo: "ajuste", id: campo, ref, nombre });
  }
  const heroConfig = refDeHeroImagen(TIENDA.hero?.imagen);
  if (heroConfig && !esRefR2(heroConfig)) {
    publicas.push({ tipo: "tienda.ts", id: "hero", ref: heroConfig, nombre: "portada" });
  }

  const comprobantes: (Pendiente & { mime: string })[] = [];
  for (const fila of await db
    .select({ id: receipts.id, ref: receipts.storageKey, mime: receipts.mime, orderNumber: orders.orderNumber })
    .from(receipts)
    .innerJoin(orders, eq(orders.id, receipts.orderId))
    .where(not(like(receipts.storageKey, "r2:%")))) {
    comprobantes.push({ tipo: "comprobante", id: fila.id, ref: fila.ref, nombre: fila.orderNumber, mime: fila.mime });
  }
  return { publicas, comprobantes };
}

async function aplicarPublica(pendiente: Pendiente, ref: string): Promise<void> {
  const db = getDb();
  if (pendiente.tipo === "foto") {
    await db
      .update(productImages)
      .set({ imageRef: ref })
      .where(and(eq(productImages.id, Number(pendiente.id)), eq(productImages.imageRef, pendiente.ref)));
  } else if (pendiente.tipo === "categoria") {
    await db
      .update(categories)
      .set({ imageRef: ref })
      .where(and(eq(categories.id, Number(pendiente.id)), eq(categories.imageRef, pendiente.ref)));
  } else if (pendiente.tipo === "qr") {
    await db
      .update(bankDetails)
      .set({ qrImageRef: ref })
      .where(and(eq(bankDetails.id, Number(pendiente.id)), eq(bankDetails.qrImageRef, pendiente.ref)));
  } else if (pendiente.tipo === "ajuste") {
    const { settings } = await readStoreSettings();
    if (pendiente.id === "heroImagenId" && settings.marca.heroImagenId === pendiente.ref) {
      await saveStoreSettingsSection("marca", { ...settings.marca, heroImagenId: ref }, { userId: null });
    } else if (
      (pendiente.id === "logoId" || pendiente.id === "faviconId") &&
      settings.identidad[pendiente.id] === pendiente.ref
    ) {
      await saveStoreSettingsSection("identidad", { ...settings.identidad, [pendiente.id]: ref }, { userId: null });
    }
  }
}

async function migrarComprobante(
  cliente: ClienteR2,
  opciones: Opciones,
  pendiente: Pendiente & { mime: string }
): Promise<void> {
  const url = urlComprobanteFirmada(opciones.cloud, opciones.apiKey!, opciones.apiSecret!, pendiente.ref);
  const bytes = await descargarImagen(url, {
    maxBytes: RECEIPT_MAX_BYTES,
    validar: {
      acepta: (b) => sniffMime(b) !== null,
      motivo: "no es un JPG, PNG o PDF",
    },
  });
  const mime = sniffMime(bytes)!;
  const key = clavePrivada(PREFIJO_COMPROBANTES, `${pendiente.nombre}.${EXTENSION[mime] ?? "bin"}`);
  await cliente.put(key, bytes, { contentType: mime, cacheControl: "private, no-store", soloSiNoExiste: true });
  try {
    await getDb()
      .update(receipts)
      .set({ storageKey: refPrivada(key), mime, bytes: bytes.byteLength })
      .where(and(eq(receipts.id, Number(pendiente.id)), eq(receipts.storageKey, pendiente.ref)));
  } catch (error) {
    await cliente.delete(key).catch(() => {});
    throw error;
  }
}

async function main(): Promise<void> {
  const opciones = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL (la base de la tienda a migrar)");

  const { publicas, comprobantes } = await recolectar();
  const invalidas = [...publicas, ...comprobantes].filter((p) => !idLegacyValido(p.ref));
  console.log(
    `\nReferencias para migrar: ${publicas.length} públicas` +
      ` (fotos ${publicas.filter((p) => p.tipo === "foto").length}, categorías ${publicas.filter((p) => p.tipo === "categoria").length},` +
      ` QR ${publicas.filter((p) => p.tipo === "qr").length}, ajustes ${publicas.filter((p) => p.tipo === "ajuste").length},` +
      ` tienda.ts ${publicas.filter((p) => p.tipo === "tienda.ts").length}) y ${comprobantes.length} comprobantes.`
  );
  for (const p of invalidas) console.log(`  · se saltea ${p.tipo} ${p.id}: la referencia no tiene forma de public_id`);
  if (!opciones.aplicar) {
    for (const p of publicas.slice(0, 10)) console.log(`  · ${p.tipo} ${p.id}: ${urlPublicaLegacy(opciones.cloud, p.ref)}`);
    console.log(
      "\nEnsayo: no se bajó ni se escribió nada. Con --aplicar se migra" +
        (comprobantes.length && !opciones.apiKey
          ? "; los comprobantes sólo con --api-key y --api-secret de la cuenta vieja."
          : ".")
    );
    return;
  }

  await cargarIntegraciones();
  if (!r2Configurado()) throw new Error("R2 no está configurado (ver /admin/integraciones o R2_* en docs/ENV-OPCIONAL.md)");
  const cliente = clienteR2();

  const hechas = new Map<string, string>();
  let ok = 0;
  const fallas: string[] = [];
  for (const pendiente of publicas) {
    if (!idLegacyValido(pendiente.ref)) continue;
    try {
      let ref = hechas.get(`${pendiente.nombre}\u0000${pendiente.ref}`);
      if (!ref) {
        const original = await descargarImagen(urlPublicaLegacy(opciones.cloud, pendiente.ref));
        const set = await prepararDesdeOriginal(original);
        ref = await subirSetImagen(cliente, set, pendiente.nombre, pendiente.tipo === "foto" ? "producto" : pendiente.nombre);
        hechas.set(`${pendiente.nombre}\u0000${pendiente.ref}`, ref);
      }
      if (pendiente.tipo === "tienda.ts") {
        console.log(`  ! src/config/tienda.ts → hero.imagen.imageRef: "${ref}" (cambialo a mano; \`cloudinaryId\` se sigue aceptando pero está deprecado)`);
      } else {
        await aplicarPublica(pendiente, ref);
      }
      ok++;
    } catch (error) {
      fallas.push(`${pendiente.tipo} ${pendiente.id} (${pendiente.ref}): ${motivo(error)}`);
    }
  }

  let comprobantesOk = 0;
  if (opciones.apiKey && opciones.apiSecret) {
    for (const pendiente of comprobantes) {
      if (!idLegacyValido(pendiente.ref)) continue;
      try {
        await migrarComprobante(cliente, opciones, pendiente);
        comprobantesOk++;
      } catch (error) {
        // Sin la URL: lleva la firma.
        fallas.push(`comprobante ${pendiente.id}: ${motivo(error)}`);
      }
    }
  } else if (comprobantes.length) {
    console.log(
      `  · ${comprobantes.length} comprobantes quedan en la cuenta vieja (sin --api-key/--api-secret): ` +
        'el panel los muestra como "de antes del cambio".'
    );
  }

  console.log(`\n✓ ${ok} referencias públicas y ${comprobantesOk} comprobantes migrados a R2.`);
  for (const falla of fallas) console.error(`✗ ${falla}`);
  if (fallas.length) {
    console.error("Lo que falló quedó como estaba: se puede volver a correr (es idempotente).");
    process.exitCode = 1;
  }
}

// Sólo cuando se lo corre como script, no cuando lo importa un test.
if (process.argv[1]?.includes("fotos-migrar-cloudinary")) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
}
