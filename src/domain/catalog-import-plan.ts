import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { safeError } from "@/lib/safe-error";
import { count, eq, inArray, sql } from "drizzle-orm";

import {
  categories,
  productImages,
  products,
  productSlugRedirects,
  supplierOffers,
  variants,
} from "@/db/schema";
import { getDb } from "@/db";
import { t } from "@/i18n";
import { slugify } from "@/lib/slug";
import { decoded } from "@/lib/product-attributes";
import { validSessionSecret } from "@/lib/session-secret";
import { sameContent } from "@/lib/verification-stamps";
import { cargarIntegraciones } from "@/lib/integraciones-store";
import { DescargaError, descargarImagen, type Resolver } from "@/lib/descarga-segura";
import { jpegKeyFor, parseRef } from "@/lib/imagenes-r2";
import {
  clienteR2,
  mensajeR2,
  r2Configurado,
  type ClienteR2,
} from "@/lib/r2";
import {
  ImagenInvalidaError,
  prepararDesdeOriginal,
  subirSetImagen,
} from "@/lib/r2-imagenes";

import {
  upsertCatalogProducts,
  type CatalogProductUpsert,
} from "../../scripts/seed";

import { addProductImage } from "./admin-products";
import { catalogDuplicateWarnings } from "./catalog-duplicates";
import {
  claveSku,
  parseCatalogo,
  type CatalogoProducto,
} from "./catalog-import";
import type { Executor } from "./executor";
import { claveProveedor, upsertImportedSupplierOffer } from "./supplier-offers";

/**
 * El mismo camino de `scripts/importar-productos.ts` (categoría por resolver,
 * SKU de quién es, plan de qué se va a escribir), pero como función que
 * también puede llamar `/admin/productos` y no sólo la CLI.
 *
 * El parseo (`parseCatalogo`) y la escritura (`upsertCatalogProducts`, en
 * `scripts/seed.ts`) siguen siendo los mismos de siempre — esto es el
 * pegamento que mira la base para armar el plan, avisa de posibles
 * duplicados y, si corresponde, lo aplica **por lotes**.
 *
 * ### Lotes
 *
 * Una planilla de 800 productos en una sola transacción tiene bloqueadas
 * cientos de filas de `variants` durante segundos, y en el MySQL compartido de
 * Hostinger eso es una compradora esperando un lock en el checkout. Por eso se
 * escribe de a `CATALOG_IMPORT_LOTE` productos, en el orden de la planilla:
 * **cada lote entra entero o no entra** (C1, por lote), y un lote que falla no
 * deshace los anteriores. Como la escritura es idempotente por slug y SKU,
 * volver a importar el mismo archivo después de un corte termina el trabajo
 * sin duplicar nada.
 */

/** Productos por lote: cada uno es una transacción. */
export const CATALOG_IMPORT_LOTE = 25;

export type CatalogImportPlanOptions = {
  /**
   * `proveedoresHabilitados()` (y `precios` en el panel). Apagado, las
   * columnas de proveedor se ignoran con una advertencia.
   */
  proveedores?: boolean;
  /** Techo de filas (el panel: `MAX_FILAS_PLANILLA`). */
  maxFilas?: number;
  /**
   * Planificar sólo este lote (0, 1, …) para escribirlo. Sin lote, el plan es
   * de la planilla entera: la vista previa, con los avisos de duplicados.
   */
  lote?: number;
};

export type CatalogImportPlan = {
  productos: CatalogoProducto[];
  /** Parseo + conflictos de SKU. Si hay al menos uno, no se puede aplicar. */
  errores: string[];
  /** Lo que no frena: columnas ignoradas (`parseCatalogo`). */
  advertencias: string[];
  /**
   * Posibles productos repetidos (`catalog-duplicates.ts`). No frenan, pero
   * el panel no deja confirmar sin marcarlos como revisados. Vacío en el plan
   * de un lote: se miran una vez, sobre la planilla entera.
   */
  duplicados: string[];
  /** Con qué se armó el plan: si `false`, no trae nada de proveedores. */
  proveedores: boolean;
  /** `sha256` del texto de la planilla: ata la confirmación a lo revisado. */
  huella: string;
  /** El lote planificado, o `null` si es el plan entero. */
  lote: number | null;
  /** Cuántos lotes tiene la planilla entera. */
  lotes: number;
  productosNuevos: number;
  productosActualizar: number;
  variantesNuevas: number;
  variantesActualizar: number;
  /**
   * Variantes existentes cuyo precio cambia. Un cambio de precios en masa es
   * del dueño (`precios.masivo`): la vista previa lo avisa y la escritura lo
   * vuelve a verificar bajo lock (docs/TEMPLATE-IMPROVEMENT-PLAN.md C6).
   */
  preciosCambian: number;
  /** Variantes existentes cuyo stock cambiaría si se pide "pisar stock". */
  stockCambiaria: number;
  /** Nombre tal como vino en la planilla, para mostrarlo en la vista previa. */
  categoriasNuevas: string[];
  categoriaIdPorSlug: Map<string, number>;
  /**
   * Fotos que `applyCatalogFotos` subiría: sólo cuentan las de un producto
   * que hoy no tiene NINGUNA foto (nuevo, o existente sin fotos todavía) —
   * la misma regla de "primera carga" que evita duplicar en un reimport.
   */
  fotosNuevas: number;
  /** Ofertas de proveedor que se crearían / cambiarían (sólo con proveedores). */
  ofertasNuevas: number;
  ofertasActualizar: number;
};

/** `sha256` hex del texto de la planilla (el CSV, o el Excel ya convertido). */
export function huellaPlanilla(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** Los productos del lote `lote` (0, 1, …), en el orden de la planilla. */
export function productosDelLote<T>(productos: readonly T[], lote: number): T[] {
  return productos.slice(
    lote * CATALOG_IMPORT_LOTE,
    (lote + 1) * CATALOG_IMPORT_LOTE
  );
}

function planVacio(
  base: Pick<
    CatalogImportPlan,
    "advertencias" | "proveedores" | "huella" | "lote" | "lotes"
  >,
  errores: string[]
): CatalogImportPlan {
  return {
    ...base,
    productos: [],
    errores,
    duplicados: [],
    productosNuevos: 0,
    productosActualizar: 0,
    variantesNuevas: 0,
    variantesActualizar: 0,
    preciosCambian: 0,
    stockCambiaria: 0,
    categoriasNuevas: [],
    categoriaIdPorSlug: new Map(),
    fotosNuevas: 0,
    ofertasNuevas: 0,
    ofertasActualizar: 0,
  };
}

/**
 * Arma el plan sin escribir nada: ensayo, igual que `importar-productos.ts`
 * sin `--aplicar`. `buildCatalogImportPlan` + `applyCatalogImportPlan` son dos
 * pasos separados a propósito, así el panel puede mostrar la vista previa y
 * recién escribir cuando alguien la confirma.
 */
export async function buildCatalogImportPlan(
  csvText: string,
  opciones: CatalogImportPlanOptions = {},
  executor?: Executor
): Promise<CatalogImportPlan> {
  const tx = executor ?? getDb();
  const proveedores = opciones.proveedores === true;
  const parseado = parseCatalogo(csvText, {
    proveedores,
    maxFilas: opciones.maxFilas,
  });
  const lotes = Math.ceil(parseado.productos.length / CATALOG_IMPORT_LOTE);
  const base = {
    advertencias: parseado.advertencias,
    proveedores,
    huella: huellaPlanilla(csvText),
    lote: opciones.lote ?? null,
    lotes,
  };
  if (parseado.errores.length > 0) return planVacio(base, parseado.errores);

  let productos = parseado.productos;
  if (opciones.lote !== undefined) {
    if (
      !Number.isInteger(opciones.lote) ||
      opciones.lote < 0 ||
      opciones.lote >= lotes
    )
      return planVacio(base, [t("adminError.importar.loteInvalido")]);
    productos = productosDelLote(productos, opciones.lote);
  }

  const categoryRows = await tx
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories);
  const categoriaPorSlug = new Map<string, number>();
  for (const row of categoryRows) {
    categoriaPorSlug.set(row.slug, row.id);
    categoriaPorSlug.set(slugify(row.name), row.id);
  }

  const categoriasNuevas = new Map<string, string>();
  for (const producto of productos) {
    const slug = slugify(producto.categoryName);
    if (!categoriaPorSlug.has(slug) && !categoriasNuevas.has(slug)) {
      categoriasNuevas.set(slug, producto.categoryName);
    }
  }

  // Un SKU que ya es de OTRO producto es un conflicto, no un update: una
  // planilla no muda una variante (con su historia de pedidos) a otro
  // producto. La base compara con su colación (sin mayúsculas ni acentos), así
  // que el mapa se arma con la misma clave (C4); la escritura lo vuelve a
  // verificar bajo lock.
  const skus = productos.flatMap((p) => p.variants.map((v) => v.sku));
  const skuRows = skus.length
    ? await tx
        .select({
          sku: variants.sku,
          productSlug: products.slug,
          pricePyg: variants.pricePyg,
          onHand: variants.onHand,
          identifiers: variants.identifiers,
        })
        .from(variants)
        .innerJoin(products, eq(variants.productId, products.id))
        .where(inArray(variants.sku, skus))
    : [];
  const duenoDeSku = new Map(skuRows.map((row) => [claveSku(row.sku), row]));

  const errores: string[] = [];
  const aliasRows = productos.length
    ? await tx
        .select({ slug: productSlugRedirects.slug, current: products.slug })
        .from(productSlugRedirects)
        .innerJoin(products, eq(productSlugRedirects.productId, products.id))
        .where(
          inArray(
            productSlugRedirects.slug,
            productos.map((p) => p.slug)
          )
        )
    : [];
  for (const alias of aliasRows)
    if (alias.slug !== alias.current)
      errores.push(
        `El slug "${alias.slug}" es histórico y está reservado; usá el slug actual "${alias.current}".`
      );
  let preciosCambian = 0;
  let stockCambiaria = 0;
  let variantesExistentes = 0;
  for (const producto of productos) {
    for (const variante of producto.variants) {
      const dueno = duenoDeSku.get(claveSku(variante.sku));
      // Un GTIN/MPN sólo existe verificado, y una planilla no verifica (E1):
      // el mismo que ya está pasa; uno nuevo o distinto se confirma en el
      // panel, variante por variante.
      if (
        variante.identifiers &&
        !sameContent(decoded(dueno?.identifiers), variante.identifiers)
      ) {
        errores.push(
          `El SKU "${variante.sku}" trae un GTIN/MPN nuevo o distinto. Una planilla no verifica identificadores: sacá la columna o dejá el que ya tiene, y confirmalo en el panel.`
        );
        continue;
      }
      if (dueno === undefined) continue;
      if (dueno.productSlug !== producto.slug) {
        errores.push(
          `El SKU "${variante.sku}" ya existe en la base${dueno.sku === variante.sku ? "" : ` como "${dueno.sku}"`} y es del producto "${dueno.productSlug}", no de "${producto.slug}". Cambiá el SKU o el slug en la planilla.`
        );
        continue;
      }
      variantesExistentes += 1;
      if (dueno.pricePyg !== variante.pricePyg) preciosCambian += 1;
      if (variante.onHand !== undefined && dueno.onHand !== variante.onHand)
        stockCambiaria += 1;
    }
  }
  if (errores.length > 0) return planVacio(base, errores);

  const slugsProductos = productos.map((p) => p.slug);
  const productRows = await tx
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(inArray(products.slug, slugsProductos));
  const idPorSlugExistente = new Map(
    productRows.map((row) => [row.slug, row.id])
  );
  const productosExistentes = new Set(productRows.map((row) => row.slug));
  const productosNuevos = productos.filter(
    (p) => !productosExistentes.has(p.slug)
  ).length;
  const variantesTotal = skus.length;
  const fotosNuevas = await contarFotosNuevas(
    productos,
    idPorSlugExistente,
    tx
  );
  const ofertas = proveedores
    ? await contarOfertas(productos, tx)
    : { nuevas: 0, actualizar: 0 };
  const duplicados =
    opciones.lote === undefined
      ? await buscarDuplicados(productos, proveedores, tx)
      : [];

  return {
    ...base,
    productos,
    errores: [],
    duplicados,
    productosNuevos,
    productosActualizar: productos.length - productosNuevos,
    variantesNuevas: variantesTotal - variantesExistentes,
    variantesActualizar: variantesExistentes,
    preciosCambian,
    stockCambiaria,
    categoriasNuevas: [...categoriasNuevas.values()],
    categoriaIdPorSlug: categoriaPorSlug,
    fotosNuevas,
    ofertasNuevas: ofertas.nuevas,
    ofertasActualizar: ofertas.actualizar,
  };
}

/**
 * Los productos de la tienda contra los de la planilla
 * (`catalogDuplicateWarnings`). Trae nombre, categoría, SKUs y —con
 * proveedores— el enlace de compra de **todos** los productos: es una
 * consulta del panel, una vez por vista previa.
 */
async function buscarDuplicados(
  productos: readonly CatalogoProducto[],
  proveedores: boolean,
  tx: Executor
): Promise<string[]> {
  const filas = await tx
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      categoryName: categories.name,
      supplierUrl: products.supplierUrl,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id));
  const skusPorProducto = new Map<number, string[]>();
  for (const fila of await tx
    .select({ productId: variants.productId, sku: variants.sku })
    .from(variants)) {
    const lista = skusPorProducto.get(fila.productId);
    if (lista) lista.push(fila.sku);
    else skusPorProducto.set(fila.productId, [fila.sku]);
  }
  return catalogDuplicateWarnings(
    productos.map((producto) => ({
      slug: producto.slug,
      name: producto.name,
      categoryName: producto.categoryName,
      fotos: producto.fotos,
      skus: producto.variants.map((v) => v.sku),
      supplierUrl: proveedores ? producto.supplierUrl : null,
    })),
    filas.map((fila) => ({
      slug: fila.slug,
      name: fila.name,
      categoryName: fila.categoryName,
      skus: skusPorProducto.get(fila.id) ?? [],
      supplierUrl: proveedores ? fila.supplierUrl : null,
    }))
  );
}

/**
 * Cuántas ofertas de proveedor crearía o cambiaría el plan, con la misma
 * identidad que `upsertImportedSupplierOffer`: (variante, nombre de
 * proveedor).
 */
async function contarOfertas(
  productos: readonly CatalogoProducto[],
  tx: Executor
): Promise<{ nuevas: number; actualizar: number }> {
  const conOferta = productos.flatMap((p) =>
    p.variants.filter((v) => v.oferta !== undefined)
  );
  if (conOferta.length === 0) return { nuevas: 0, actualizar: 0 };
  const filas = await tx
    .select({
      sku: variants.sku,
      source: supplierOffers.source,
      unitCostPyg: supplierOffers.unitCostPyg,
      supplierStock: supplierOffers.supplierStock,
      isPreferred: supplierOffers.isPreferred,
    })
    .from(supplierOffers)
    .innerJoin(variants, eq(supplierOffers.variantId, variants.id))
    .where(
      inArray(
        variants.sku,
        conOferta.map((v) => v.sku)
      )
    );
  const porSku = new Map<string, typeof filas>();
  for (const fila of filas) {
    const clave = claveSku(fila.sku);
    porSku.set(clave, [...(porSku.get(clave) ?? []), fila]);
  }
  let nuevas = 0;
  let actualizar = 0;
  for (const variante of conOferta) {
    const oferta = variante.oferta!;
    const actual = (porSku.get(claveSku(variante.sku)) ?? []).find(
      (fila) => claveProveedor(fila.source) === claveProveedor(oferta.source)
    );
    if (!actual) {
      nuevas += 1;
      continue;
    }
    const costo =
      oferta.unitCostPyg === undefined ? actual.unitCostPyg : oferta.unitCostPyg;
    const stock =
      oferta.supplierStock === undefined
        ? actual.supplierStock
        : oferta.supplierStock;
    if (
      costo !== actual.unitCostPyg ||
      stock !== actual.supplierStock ||
      (costo !== null) !== actual.isPreferred
    )
      actualizar += 1;
  }
  return { nuevas, actualizar };
}

/**
 * La firma de una vista previa: ata la confirmación al **mismo archivo**, a
 * los **mismos avisos de duplicados** que vio quien confirma, al mismo modo de
 * proveedores y a la misma persona. Es `n.hash.hmac`: cuántos avisos, el
 * `sha256` de su lista y un HMAC con `SESSION_SECRET` sobre todo eso.
 *
 * Así el lote 1, 2, … no tiene que volver a buscar duplicados (la lista cambia
 * a medida que los lotes anteriores entran) y, aun así, nadie confirma un lote
 * de un archivo que no pasó por la vista previa, ni saltea la revisión.
 */
export function firmaRevision(datos: {
  huella: string;
  duplicados: readonly string[];
  proveedores: boolean;
  actorUserId: number | null;
}): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(datos.duplicados), "utf8")
    .digest("hex");
  return `${datos.duplicados.length}.${hash}.${hmacRevision(datos.duplicados.length, hash, datos)}`;
}

/**
 * Verifica una firma de `firmaRevision` contra el archivo que llegó. Devuelve
 * cuántos avisos de duplicados tenía la vista previa, o `null` si la firma no
 * es de este archivo, de este modo o de esta persona.
 */
export function verificarFirmaRevision(
  firma: string,
  datos: { huella: string; proveedores: boolean; actorUserId: number | null }
): { duplicados: number } | null {
  const partes = firma.split(".");
  if (partes.length !== 3) return null;
  const [n, hash, mac] = partes as [string, string, string];
  if (!/^\d{1,6}$/.test(n) || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const esperado = Buffer.from(hmacRevision(Number(n), hash, datos), "hex");
  const recibido = Buffer.from(mac, "hex");
  if (
    recibido.length !== esperado.length ||
    !timingSafeEqual(recibido, esperado)
  )
    return null;
  return { duplicados: Number(n) };
}

function hmacRevision(
  n: number,
  hash: string,
  datos: { huella: string; proveedores: boolean; actorUserId: number | null }
): string {
  const secret = process.env.SESSION_SECRET;
  if (!validSessionSecret(secret)) throw new Error("SESSION_SECRET inválido");
  const key = Buffer.from(
    hkdfSync("sha256", secret, "ecom/catalog-import/v1", "revision", 32)
  );
  return createHmac("sha256", key)
    .update(
      [
        datos.huella,
        n,
        hash,
        datos.proveedores ? "1" : "0",
        datos.actorUserId ?? "cli",
      ].join(":")
    )
    .digest("hex");
}

/**
 * Cuántas fotos de la planilla se subirían de verdad: sólo las de un
 * producto sin ninguna foto todavía (nuevo, o existente con cero filas en
 * `product_images`) — la misma pregunta que se hace `applyCatalogFotos`
 * antes de subir, para que la vista previa no prometa de más.
 */
export async function contarFotosNuevas(
  productos: readonly CatalogoProducto[],
  idPorSlugExistente: Map<string, number>,
  tx: Executor
): Promise<number> {
  const conFotos = productos.filter((p) => p.fotos.length > 0);
  if (conFotos.length === 0) return 0;

  const idsExistentesConFotos = conFotos
    .map((p) => idPorSlugExistente.get(p.slug))
    .filter((id): id is number => id !== undefined);

  const tieneFotos = new Set(
    await productIdsConFotos(idsExistentesConFotos, tx)
  );

  let total = 0;
  for (const producto of conFotos) {
    const id = idPorSlugExistente.get(producto.slug);
    if (id !== undefined && tieneFotos.has(id)) continue; // ya tiene fotos: no se tocan.
    total += producto.fotos.length;
  }
  return total;
}

/** IDs de producto, de entre los pasados, que ya tienen al menos una foto. */
async function productIdsConFotos(
  productIds: number[],
  tx: Executor
): Promise<number[]> {
  if (productIds.length === 0) return [];
  const filas = await tx
    .select({ productId: productImages.productId, total: count() })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .groupBy(productImages.productId);
  return filas.filter((f) => f.total > 0).map((f) => f.productId);
}

export type CatalogFotoFallida = {
  producto: string;
  url: string;
  motivo: string;
};

export type CatalogFotosResult = {
  /** Cuántas fotos se subieron y quedaron registradas. */
  fotosSubidas: number;
  /** Cuántas fotos NO se intentaron subir porque R2 no está configurado. */
  fotosOmitidas: number;
  /** Cada URL que se intentó y falló, sin frenar el resto de la importación. */
  fotosFallidas: CatalogFotoFallida[];
};

const FOTOS_CONCURRENCIA = 2;

/** Lo que `applyCatalogFotos` necesita de afuera; los tests lo reemplazan. */
export type CatalogFotosOpciones = {
  cliente?: ClienteR2;
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
};

/** Un motivo escrito acá: se puede mostrar tal cual. */
class FotoError extends Error {}

/**
 * El motivo de una foto fallida, para el panel y la consola. Los nuestros
 * (descarga, imagen inválida, R2) dicen qué pasó sin datos de nadie; cualquier
 * otro error pasa por `safeError`, que no muestra el mensaje.
 */
function motivoDeFoto(error: unknown): string {
  if (error instanceof FotoError || error instanceof DescargaError) return error.message;
  return mensajeR2(error);
}

const MOTIVO_IMAGEN: Record<string, string> = {
  VACIA: "la imagen vino vacía",
  DEMASIADO_PESADA: "la imagen pesa demasiado",
  FORMATO: "no es una imagen JPG, PNG, WebP o GIF",
  NO_SE_PUDO_LEER: "la imagen está dañada o no se pudo leer",
  PIXELES: "la imagen tiene demasiados píxeles",
};

/**
 * Una foto de la planilla → la referencia de R2, con el objeto ya escrito.
 *
 * - `r2:p1/…` (lo que deja `pnpm fotos:preparar` en `import-r2.csv`, ya
 *   subido con `pnpm fotos:subir`): se confirma que el JPEG exista en el
 *   bucket antes de usarla — una fila nunca apunta a un objeto que no está.
 * - `https://…`: el servidor la baja (`descargarImagen`: https, timeout,
 *   tope de bytes, redirecciones contadas, contenido mirado por los bytes),
 *   la achica con el mismo pipeline de todo lo demás y la sube.
 */
async function fotoDeLaPlanilla(
  cliente: ClienteR2,
  url: string,
  slug: string,
  opciones: CatalogFotosOpciones
): Promise<string> {
  if (url.startsWith("r2:")) {
    const ref = parseRef(url);
    if (!ref) throw new FotoError("referencia r2: inválida");
    const { existe } = await cliente.head(jpegKeyFor(ref.base)!);
    if (!existe) throw new FotoError("esa foto no está en el bucket (¿faltó `pnpm fotos:subir`?)");
    return url;
  }
  const original = await descargarImagen(url, {
    fetchImpl: opciones.fetchImpl,
    resolver: opciones.resolver,
  });
  try {
    const set = await prepararDesdeOriginal(original);
    return await subirSetImagen(cliente, set, slug, "producto");
  } catch (error) {
    if (error instanceof ImagenInvalidaError)
      throw new FotoError(MOTIVO_IMAGEN[error.codigo] ?? "no se pudo preparar la imagen");
    throw error;
  }
}

/**
 * Sube las fotos de `productos` a R2 y las registra con `addProductImage` —
 * sólo para un producto que hoy no tiene ninguna, igual que
 * `contarFotosNuevas` (así reimportar la misma planilla nunca duplica).
 *
 * Se llama **después** de que el upsert de `upsertCatalogProducts` ya
 * commiteó: una foto que falla no puede tumbar productos y precios que sí
 * se guardaron. Por eso nunca tira — junta los fallos en `fotosFallidas`.
 * Cada fila de `product_images` se inserta recién cuando sus objetos
 * quedaron escritos en R2.
 *
 * Sin R2 configurado, no se intenta ni una subida: se cuentan como
 * `fotosOmitidas` para que quien llama avise con un mensaje claro, no con un
 * error.
 */
export async function applyCatalogFotos(
  productos: readonly CatalogoProducto[],
  executor?: Executor,
  opciones: CatalogFotosOpciones = {}
): Promise<CatalogFotosResult> {
  const tx = executor ?? getDb();
  const conFotos = productos.filter((p) => p.fotos.length > 0);
  if (conFotos.length === 0) {
    return { fotosSubidas: 0, fotosOmitidas: 0, fotosFallidas: [] };
  }

  const slugs = conFotos.map((p) => p.slug);
  const rows = await tx
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(products)
    .where(inArray(products.slug, slugs));
  const porSlug = new Map(rows.map((row) => [row.slug, row]));
  const tieneFotos = new Set(
    await productIdsConFotos(
      rows.map((row) => row.id),
      tx
    )
  );

  const grupos = conFotos
    .map((producto) => {
      const row = porSlug.get(producto.slug);
      if (!row || tieneFotos.has(row.id)) return null;
      return {
        productId: row.id,
        slug: row.slug,
        nombre: row.name,
        urls: producto.fotos,
      };
    })
    .filter(
      (
        grupo
      ): grupo is {
        productId: number;
        slug: string;
        nombre: string;
        urls: string[];
      } => grupo !== null
    );

  // R2 puede venir de /admin/integraciones (también desde el script). Sin R2
  // se cuentan como omitidas sólo las que se habrían subido: las de un
  // producto que ya tiene fotos no se iban a tocar (un export reimportado en
  // la misma tienda no avisa de más).
  await cargarIntegraciones();
  if (!opciones.cliente && !r2Configurado()) {
    const total = grupos.reduce((acc, grupo) => acc + grupo.urls.length, 0);
    return { fotosSubidas: 0, fotosOmitidas: total, fotosFallidas: [] };
  }
  const cliente = opciones.cliente ?? clienteR2();

  let fotosSubidas = 0;
  const fotosFallidas: CatalogFotoFallida[] = [];

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const grupo = grupos[cursor++];
      if (!grupo) return;
      // Secuencial adentro del mismo producto: `addProductImage` calcula la
      // posición contando las filas que ya existen, y subir dos fotos del
      // mismo producto en paralelo las haría pelear por la posición 0.
      for (const [index, url] of grupo.urls.entries()) {
        try {
          const imageRef = await fotoDeLaPlanilla(
            cliente,
            url,
            grupo.slug,
            opciones
          );
          await addProductImage(
            {
              productId: grupo.productId,
              imageRef,
              alt:
                index === 0
                  ? grupo.nombre
                  : `${grupo.nombre} — foto ${index + 1}`,
            },
            tx
          );
          fotosSubidas += 1;
        } catch (error) {
          fotosFallidas.push({
            producto: grupo.nombre,
            url,
            motivo: motivoDeFoto(error),
          });
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FOTOS_CONCURRENCIA, grupos.length) }, () =>
      worker()
    )
  );

  return { fotosSubidas, fotosOmitidas: 0, fotosFallidas };
}

/**
 * Crea las categorías que falten y devuelve el mapa de slug de categoría → id
 * actualizado, listo para armar los `CatalogProductUpsert` que espera
 * `upsertCatalogProducts`.
 */
export async function ensureCatalogCategories(
  plan: Pick<CatalogImportPlan, "productos" | "categoriaIdPorSlug">,
  executor?: Executor
): Promise<Map<string, number>> {
  const tx = executor ?? getDb();
  const categoriaPorSlug = new Map(plan.categoriaIdPorSlug);

  const faltantes = new Map<string, string>();
  for (const producto of plan.productos) {
    const slug = slugify(producto.categoryName);
    if (!categoriaPorSlug.has(slug) && !faltantes.has(slug)) {
      faltantes.set(slug, producto.categoryName);
    }
  }
  if (faltantes.size === 0) return categoriaPorSlug;

  const maxPosition =
    (
      await tx
        .select({ max: sql<number>`COALESCE(MAX(${categories.position}), 0)` })
        .from(categories)
    )[0]?.max ?? 0;
  let position = maxPosition;
  for (const [slug, nombre] of faltantes) {
    position += 1;
    await tx
      .insert(categories)
      .values({ slug, name: nombre, position })
      .onDuplicateKeyUpdate({ set: { name: nombre, isActive: true } });
    const fila = (
      await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1)
    )[0];
    if (!fila) throw new Error(`No pude releer la categoría ${slug}`);
    categoriaPorSlug.set(slug, fila.id);
  }
  return categoriaPorSlug;
}


export type CatalogImportApplyOptions = {
  resetStock: boolean;
  /** `can(rol, "precios.masivo")`: sin eso, cambiar un precio o pisar stock no se escribe (C6). */
  allowPriceChanges: boolean;
  actor: string;
  actorUserId: number | null;
};

export type CatalogImportApplyResult = {
  variantesEscritas: number;
  ofertasNuevas: number;
  ofertasActualizadas: number;
};

/**
 * Escribe un plan —normalmente **un lote**— **entero o nada** (C1):
 * categorías nuevas, productos, variantes y ofertas de proveedor en una sola
 * transacción. Un SKU que en este momento es de otro producto (lo cargó
 * alguien después de la vista previa), un precio que cambia sin permiso o
 * cualquier error de la base deshace todo el lote, categorías incluidas.
 *
 * Lo nuevo entra como **borrador** y lo existente no cambia de activo ni de
 * publicado (C5). Cada precio y stock que cambia queda en
 * `price_adjustments` / `stock_adjustments` con quién lo hizo (C7).
 *
 * Las fotos no van acá: suben después del commit (`applyCatalogFotos`), para
 * que una URL caída no tumbe el catálogo.
 */
export async function applyCatalogImportPlan(
  plan: Pick<CatalogImportPlan, "productos" | "categoriaIdPorSlug">,
  options: CatalogImportApplyOptions
): Promise<CatalogImportApplyResult> {
  return getDb().transaction(async (tx) => {
    const categoriaPorSlug = await ensureCatalogCategories(plan, tx);
    const items: CatalogProductUpsert[] = plan.productos.map((producto) => {
      const categoryId = categoriaPorSlug.get(slugify(producto.categoryName));
      if (!categoryId)
        throw new Error(`Categoría sin id: ${producto.categoryName}`);
      const { categoryName, fotos, variants: variantes, ...resto } = producto;
      void categoryName;
      void fotos;
      return {
        ...resto,
        categoryId,
        variants: variantes.map(({ oferta, ...variante }) => {
          void oferta;
          return variante;
        }),
      };
    });
    const variantesEscritas = await upsertCatalogProducts(items, {
      executor: tx,
      mode: "import",
      publishedAt: null,
      resetStock: options.resetStock,
      allowPriceChanges: options.allowPriceChanges,
      audit: {
        actor: options.actor,
        actorUserId: options.actorUserId,
        reason: options.resetStock
          ? "Importación de planilla (pisar stock)"
          : "Importación de planilla",
      },
    });
    const ofertas = await escribirOfertas(plan.productos, tx);
    return { variantesEscritas, ...ofertas };
  });
}

/**
 * Las ofertas de proveedor del lote, en la misma transacción y después del
 * upsert (que ya dejó bloqueados producto y variante). Sólo trae ofertas un
 * plan armado con los proveedores prendidos.
 */
async function escribirOfertas(
  productos: readonly CatalogoProducto[],
  tx: Executor
): Promise<{ ofertasNuevas: number; ofertasActualizadas: number }> {
  const conOferta = productos.flatMap((p) =>
    p.variants.filter((v) => v.oferta !== undefined)
  );
  let ofertasNuevas = 0;
  let ofertasActualizadas = 0;
  if (conOferta.length === 0) return { ofertasNuevas, ofertasActualizadas };

  const filas = await tx
    .select({ id: variants.id, sku: variants.sku })
    .from(variants)
    .where(
      inArray(
        variants.sku,
        conOferta.map((v) => v.sku)
      )
    );
  const idPorSku = new Map(filas.map((fila) => [claveSku(fila.sku), fila.id]));
  for (const variante of conOferta) {
    const variantId = idPorSku.get(claveSku(variante.sku));
    if (variantId === undefined)
      throw new Error(`No pude releer la variante ${variante.sku}`);
    const resultado = await upsertImportedSupplierOffer(
      tx,
      variantId,
      variante.oferta!
    );
    if (resultado === "nueva") ofertasNuevas += 1;
    if (resultado === "actualizada") ofertasActualizadas += 1;
  }
  return { ofertasNuevas, ofertasActualizadas };
}

export type CatalogImportLoteResult =
  | ({
      ok: true;
      lote: number;
      lotes: number;
      productos: number;
    } & CatalogImportApplyResult &
      CatalogFotosResult)
  | { ok: false; lote: number; lotes: number; errores: string[] };

/**
 * Un lote de punta a punta, lo mismo para la CLI y para el panel: vuelve a
 * parsear la planilla, planifica **sólo** los productos de ese lote contra la
 * base de este momento (no reutiliza un plan viejo), lo escribe en una
 * transacción y, después del commit, sube sus fotos.
 *
 * Un error del plan (un SKU que alguien cargó en otro producto entre la vista
 * previa y este lote) vuelve como `ok: false` sin escribir nada del lote; un
 * error de la escritura tira, y la transacción ya se deshizo.
 */
export async function applyCatalogImportLote(
  csvText: string,
  lote: number,
  opciones: Omit<CatalogImportPlanOptions, "lote">,
  options: CatalogImportApplyOptions,
  fotosOpciones: CatalogFotosOpciones = {}
): Promise<CatalogImportLoteResult> {
  const plan = await buildCatalogImportPlan(csvText, { ...opciones, lote });
  if (plan.errores.length > 0)
    return { ok: false, lote, lotes: plan.lotes, errores: plan.errores };
  const escrito = await applyCatalogImportPlan(plan, options);
  const fotos = await applyCatalogFotos(plan.productos, undefined, fotosOpciones);
  return {
    ok: true,
    lote,
    lotes: plan.lotes,
    productos: plan.productos.length,
    ...escrito,
    ...fotos,
  };
}
