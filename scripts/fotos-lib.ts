/**
 * Helpers puros de la carga masiva de fotos (`pnpm fotos:preparar`,
 * `pnpm fotos:subir`, `pnpm fotos:reparar`). Sin credenciales, sin red, sin
 * base: leen la planilla, validan el manifiesto local y reescriben el CSV.
 *
 * El circuito, de punta a punta:
 *
 * 1. `fotos:preparar` baja cada URL de la columna Fotos, la achica con el
 *    mismo pipeline del servidor (`src/lib/r2-imagenes.ts`) y deja los
 *    archivos `p1/…` en una carpeta **fuera del repo**, con
 *    `manifest.private.json`, `import-r2.csv` (la planilla con las fotos ya
 *    como `r2:p1/…`), `report.csv` y `review.html` para mirarlas.
 * 2. `fotos:subir --aplicar` sube los objetos a R2 (con la config de
 *    `/admin/integraciones` o `R2_*`), con claves inmutables, y anota en el
 *    manifiesto cuáles quedaron.
 * 3. `pnpm importar:productos import-r2.csv --aplicar` (o el panel) carga el
 *    catálogo: las referencias `r2:` sólo entran si el objeto existe.
 * 4. `fotos:reparar --slug x --aplicar` reemplaza la galería de un producto
 *    que ya tenía fotos por las del manifiesto.
 */
import { parseCsv, toCsv } from "../src/lib/csv";
import { parseRef, planImagen } from "../src/lib/imagenes-r2";
import { slugify } from "../src/lib/slug";

export class FotosError extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "FotosError";
  }
}

export function codigoSeguro(error: unknown): string {
  return error instanceof FotosError ? error.codigo : "ERROR_LOCAL";
}

export type FotoObjeto = {
  key: string;
  format: "webp" | "jpeg";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  subido: boolean;
};

export type Foto = {
  slug: string;
  posicion: number;
  fuente: string;
  estado: "ok" | "fallo";
  /** Motivo legible del fallo (sin datos de nadie). */
  error: string | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  ref: string | null;
  objetos: FotoObjeto[];
};

export type ProductoFotos = { slug: string; nombre: string; skus: string[]; fuentes: string[] };

export type FotoManifiesto = {
  version: 1;
  policy: "p1";
  createdAt: string;
  updatedAt: string;
  productos: ProductoFotos[];
  fotos: Foto[];
};

export type Catalogo = {
  headers: string[];
  rows: string[][];
  /** El slug de cada fila de `rows`. */
  slugs: string[];
  fotosIndex: number;
  productos: ProductoFotos[];
};

const nombreDeColumna = (valor: string) => slugify(valor.replace(/\(.*?\)/g, ""));

/**
 * La planilla de `pnpm importar:productos`, sin perder ninguna columna: las
 * filas de variantes se agrupan por slug (las fotos son del producto) y se
 * conservan tal cual para reescribir sólo la columna Fotos.
 */
export function leerCatalogo(texto: string, soloSkus: readonly string[] = []): Catalogo {
  const [headers, ...rows] = parseCsv(texto);
  if (!headers?.length) throw new FotosError("CSV_VACIO");
  const nombres = headers.map(nombreDeColumna);
  const buscar = (...opciones: string[]) => nombres.findIndex((n) => opciones.includes(n));
  const skuIndex = buscar("sku");
  const nombreIndex = buscar("producto", "nombre");
  const fotosIndex = buscar("fotos", "imagenes", "imagen", "foto");
  const slugIndex = buscar("slug");
  if ([skuIndex, nombreIndex, fotosIndex].some((n) => n < 0)) throw new FotosError("CSV_COLUMNAS");

  const productos = new Map<string, ProductoFotos>();
  const slugs = rows.map((row) => {
    if (row.length !== headers.length) throw new FotosError("CSV_ANCHO_DE_FILA");
    const sku = row[skuIndex]!.trim();
    const nombre = row[nombreIndex]!.trim();
    const slug = row[slugIndex]?.trim() || slugify(nombre);
    if (!sku || !nombre || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new FotosError("CSV_PRODUCTO");
    let producto = productos.get(slug);
    if (!producto) {
      producto = { slug, nombre, skus: [], fuentes: [] };
      productos.set(slug, producto);
    } else if (producto.nombre !== nombre) throw new FotosError("CSV_SLUG_REPETIDO");
    if (!producto.skus.includes(sku)) producto.skus.push(sku);
    for (const fuente of row[fotosIndex]!.split(/[|\s]+/).filter(Boolean))
      if (!producto.fuentes.includes(fuente)) producto.fuentes.push(fuente);
    return slug;
  });
  if (soloSkus.some((sku) => ![...productos.values()].some((p) => p.skus.includes(sku))))
    throw new FotosError("SKU_NO_ENCONTRADO");
  const elegidos = [...productos.values()].filter(
    (p) => soloSkus.length === 0 || p.skus.some((sku) => soloSkus.includes(sku))
  );
  const elegidosSlugs = new Set(elegidos.map((p) => p.slug));
  return {
    headers,
    rows: rows.filter((_, i) => elegidosSlugs.has(slugs[i]!)),
    slugs: slugs.filter((slug) => elegidosSlugs.has(slug)),
    fotosIndex,
    productos: elegidos,
  };
}

/** Las referencias listas de un producto, en orden y sin repetir. */
export function refsDeProducto(fotos: readonly Foto[], slug: string): string[] {
  return [
    ...new Set(
      fotos
        .filter((f) => f.slug === slug && f.estado === "ok" && f.ref)
        .sort((a, b) => a.posicion - b.posicion)
        .map((f) => f.ref!)
    ),
  ];
}

/**
 * La planilla con la columna Fotos reemplazada por las referencias `r2:`
 * (en la primera fila de cada producto; las demás, vacías). Los productos sin
 * ninguna foto lista quedan afuera: importarlos acá no aportaría nada.
 */
export function reescribirCsv(catalogo: Catalogo, fotos: readonly Foto[]): string {
  const escritos = new Set<string>();
  const filas: string[][] = [];
  catalogo.rows.forEach((row, index) => {
    const slug = catalogo.slugs[index]!;
    const refs = refsDeProducto(fotos, slug);
    if (refs.length === 0) return;
    const copia = [...row];
    copia[catalogo.fotosIndex] = escritos.has(slug) ? "" : refs.join("|");
    escritos.add(slug);
    filas.push(copia);
  });
  return toCsv(catalogo.headers, filas);
}

/** Un objeto por clave: la misma foto en dos productos se sube una vez. */
export function objetosUnicos(fotos: readonly Foto[]): FotoObjeto[] {
  const objetos = new Map<string, FotoObjeto>();
  for (const foto of fotos.filter((f) => f.estado === "ok"))
    for (const objeto of foto.objetos) {
      const previo = objetos.get(objeto.key);
      if (previo && (previo.sha256 !== objeto.sha256 || previo.bytes !== objeto.bytes))
        throw new FotosError("OBJETO_EN_CONFLICTO");
      if (!previo || objeto.subido) objetos.set(objeto.key, objeto);
    }
  return [...objetos.values()];
}

/** Marca un objeto como subido en todas las fotos que lo comparten. */
export function marcarSubido(manifiesto: FotoManifiesto, key: string): void {
  for (const foto of manifiesto.fotos)
    for (const objeto of foto.objetos) if (objeto.key === key) objeto.subido = true;
}

export function totales(manifiesto: FotoManifiesto) {
  const objetos = objetosUnicos(manifiesto.fotos);
  return {
    productos: manifiesto.productos.length,
    fotos: manifiesto.fotos.length,
    fotosListas: manifiesto.fotos.filter((f) => f.estado === "ok").length,
    fotosFallidas: manifiesto.fotos.filter((f) => f.estado === "fallo").length,
    objetos: objetos.length,
    bytes: objetos.reduce((total, o) => total + o.bytes, 0),
    subidos: objetos.filter((o) => o.subido).length,
    pendientes: objetos.filter((o) => !o.subido).length,
  };
}

const HEX64 = /^[0-9a-f]{64}$/;
const ISO = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));

/**
 * Valida un manifiesto antes de tocar R2 o la base. Cada foto lista tiene que
 * dar exactamente el plan de `planImagen` (mismas claves, mismas medidas):
 * un manifiesto editado a mano no puede subir un objeto a una clave que no
 * corresponde a su contenido.
 */
export function parsearManifiesto(valor: unknown): FotoManifiesto {
  const fallar = (): never => {
    throw new FotosError("MANIFIESTO_INVALIDO");
  };
  const m = valor as FotoManifiesto;
  if (
    !m ||
    typeof m !== "object" ||
    m.version !== 1 ||
    m.policy !== "p1" ||
    !ISO(m.createdAt) ||
    !ISO(m.updatedAt) ||
    !Array.isArray(m.productos) ||
    !Array.isArray(m.fotos)
  )
    fallar();
  for (const p of m.productos) {
    if (
      !p ||
      typeof p.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) ||
      typeof p.nombre !== "string" ||
      !Array.isArray(p.skus) ||
      !Array.isArray(p.fuentes)
    )
      fallar();
  }
  for (const f of m.fotos) {
    if (
      !f ||
      !m.productos.some((p) => p.slug === f.slug) ||
      !Number.isInteger(f.posicion) ||
      f.posicion < 0 ||
      typeof f.fuente !== "string" ||
      !Array.isArray(f.objetos)
    )
      fallar();
    if (f.estado === "fallo") {
      if (f.objetos.length || f.ref !== null) fallar();
      continue;
    }
    if (f.estado !== "ok" || !f.sha256 || !HEX64.test(f.sha256) || !f.ref || !f.width || !f.height) fallar();
    const ref = parseRef(f.ref);
    if (!ref || ref.width !== f.width || ref.height !== f.height) fallar();
    const plan = planImagen(ref!.base.slice(0, -11), f.sha256!, f.width!, f.height!);
    if (!plan || plan.ref !== f.ref || plan.objects.length !== f.objetos.length) fallar();
    for (const [i, objeto] of f.objetos.entries()) {
      const esperado = plan!.objects[i]!;
      if (
        objeto.key !== esperado.key ||
        objeto.format !== esperado.format ||
        objeto.width !== esperado.width ||
        objeto.height !== esperado.height ||
        !Number.isSafeInteger(objeto.bytes) ||
        objeto.bytes <= 0 ||
        !HEX64.test(objeto.sha256) ||
        typeof objeto.subido !== "boolean"
      )
        fallar();
    }
  }
  objetosUnicos(m.fotos);
  return m;
}

/** Lo que `fotos:reparar` escribe: las referencias del producto, con su alt. */
export function itemsParaReparar(manifiesto: FotoManifiesto, slug: string) {
  const producto = manifiesto.productos.find((p) => p.slug === slug);
  if (!producto) throw new FotosError("PRODUCTO_NO_ESTA_EN_EL_MANIFIESTO");
  const refs = refsDeProducto(manifiesto.fotos, slug);
  if (refs.length === 0) throw new FotosError("SIN_FOTOS_LISTAS");
  const fotos = manifiesto.fotos.filter((f) => f.slug === slug && f.estado === "ok");
  if (fotos.some((f) => f.objetos.some((o) => !o.subido))) throw new FotosError("FALTA_SUBIR_OBJETOS");
  return refs.map((ref, index) => ({
    ref,
    alt: index === 0 ? producto.nombre : `${producto.nombre} — foto ${index + 1}`,
  }));
}

/** `--opcion valor` y `--flag`; cualquier otra cosa corta antes de tocar nada. */
export function parsearOpciones(
  args: readonly string[],
  conValor: readonly string[],
  flags: readonly string[] = [],
  opcionales: readonly string[] = []
): Map<string, string> {
  const opciones = new Map<string, string>();
  const lista = args.filter((arg) => arg !== "--");
  for (let i = 0; i < lista.length; i++) {
    const arg = lista[i]!;
    if (opciones.has(arg) || (!conValor.includes(arg) && !flags.includes(arg) && !opcionales.includes(arg)))
      throw new FotosError(`OPCION_DESCONOCIDA ${arg}`);
    if (flags.includes(arg)) {
      opciones.set(arg, "true");
      continue;
    }
    const valor = lista[++i];
    if (!valor || valor.startsWith("--")) throw new FotosError(`FALTA_VALOR ${arg}`);
    opciones.set(arg, valor);
  }
  for (const nombre of conValor) if (!opciones.has(nombre)) throw new FotosError(`FALTA ${nombre}`);
  return opciones;
}

export function escaparHtml(valor: string): string {
  return valor.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
