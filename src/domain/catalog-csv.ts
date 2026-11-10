import { t, type MessageKey } from "@/i18n";
import { EXPORT_MAX_ROWS } from "@/lib/csv";

/**
 * **La** planilla del catálogo: una sola definición de columnas para el
 * export del panel (`catalogExportCsv`), la importación del panel y
 * `pnpm importar:productos` (`parseCatalogo`). Ver docs/CATALOGO-CSV.md.
 *
 * Es un contrato entre tiendas, no sólo dentro de una: un archivo que baja una
 * tienda entra en otra sin tocarlo. Por eso el orden es fijo y los nombres
 * salen de `csv.producto.*` (`src/i18n/es-PY.ts`): lo que escribe el export
 * es, por construcción, lo que el importador reconoce.
 *
 * Los alias son los nombres viejos o informales que también se aceptan al
 * importar (archivos de tiendas anteriores, planillas armadas a mano); el
 * export escribe siempre el canónico.
 */

/** Cada campo crudo que el importador sabe leer de una fila. */
export type CampoCatalogo =
  | "sku"
  | "producto"
  | "categoria"
  | "variante"
  | "precio"
  | "stock"
  | "descripcion"
  | "marca"
  | "iva"
  | "precioAntes"
  | "slug"
  | "fotos"
  | "proveedor"
  | "urlProveedor"
  | "costoProveedor"
  | "stockProveedor"
  | "saleMode"
  | "showPrice"
  | "specifications"
  | "supplierDetails"
  | "attributes"
  | "identifiers"
  | "seoTitle"
  | "seoDescription";

export type ColumnaCatalogo = {
  campo: CampoCatalogo;
  /** El encabezado canónico: lo que escribe el export. */
  clave: MessageKey;
  alias: readonly string[];
  /**
   * `proveedor`: datos privados de compras. Sólo se exportan y se leen con
   * `proveedoresHabilitados()` (y, en el panel, con la capacidad `precios`).
   */
  grupo: "catalogo" | "proveedor";
};

/**
 * Las columnas del archivo, **en el orden del export**. Las cuatro de
 * proveedor van entre Fotos y Modo de venta; con los proveedores apagados no
 * se escriben y el resto conserva su orden.
 */
export const COLUMNAS_CATALOGO: readonly ColumnaCatalogo[] = [
  { campo: "sku", clave: "csv.producto.sku", alias: [], grupo: "catalogo" },
  {
    campo: "producto",
    clave: "csv.producto.nombre",
    alias: ["nombre"],
    grupo: "catalogo",
  },
  {
    campo: "categoria",
    clave: "csv.producto.categoria",
    alias: [],
    grupo: "catalogo",
  },
  {
    campo: "variante",
    clave: "csv.producto.variante",
    alias: [],
    grupo: "catalogo",
  },
  { campo: "precio", clave: "csv.producto.precio", alias: [], grupo: "catalogo" },
  { campo: "stock", clave: "csv.producto.stock", alias: [], grupo: "catalogo" },
  {
    campo: "descripcion",
    clave: "csv.producto.descripcion",
    alias: [],
    grupo: "catalogo",
  },
  { campo: "marca", clave: "csv.producto.marca", alias: [], grupo: "catalogo" },
  { campo: "iva", clave: "csv.producto.iva", alias: [], grupo: "catalogo" },
  {
    campo: "precioAntes",
    clave: "csv.producto.precioAntes",
    alias: [],
    grupo: "catalogo",
  },
  { campo: "slug", clave: "csv.producto.slug", alias: [], grupo: "catalogo" },
  {
    campo: "fotos",
    clave: "csv.producto.fotos",
    alias: ["imagenes", "imagen", "foto"],
    grupo: "catalogo",
  },
  {
    campo: "proveedor",
    clave: "csv.producto.proveedor",
    alias: [],
    grupo: "proveedor",
  },
  {
    campo: "urlProveedor",
    clave: "csv.producto.urlProveedor",
    alias: ["enlace proveedor", "enlace de compra"],
    grupo: "proveedor",
  },
  {
    campo: "costoProveedor",
    clave: "csv.producto.costoProveedor",
    alias: ["costo"],
    grupo: "proveedor",
  },
  {
    campo: "stockProveedor",
    clave: "csv.producto.stockProveedor",
    alias: [],
    grupo: "proveedor",
  },
  {
    campo: "saleMode",
    clave: "csv.producto.modo",
    alias: ["modo venta", "sale_mode"],
    grupo: "catalogo",
  },
  {
    campo: "showPrice",
    clave: "csv.producto.mostrarPrecio",
    alias: ["show_price"],
    grupo: "catalogo",
  },
];

/**
 * Columnas avanzadas: el importador las entiende (fichas técnicas, SEO, JSON
 * de identificadores) pero el export no las escribe — su ausencia en el
 * archivo es "no lo cambies". No tienen clave de i18n: son nombres técnicos.
 */
const COLUMNAS_AVANZADAS: Record<string, CampoCatalogo> = {
  "ficha tecnica json": "specifications",
  specifications: "specifications",
  "proveedor json": "supplierDetails",
  supplier_details: "supplierDetails",
  "atributos variante json": "attributes",
  attributes: "attributes",
  "identificadores json": "identifiers",
  identifiers: "identifiers",
  "titulo seo": "seoTitle",
  seo_title: "seoTitle",
  "descripcion seo": "seoDescription",
  seo_description: "seoDescription",
};

/**
 * Sin acentos, en minúsculas, sin el `(₲)` decorativo y con los espacios
 * colapsados: "Categoría", "categoria" y "CATEGORIA" son la misma columna, y
 * "Precio (₲)" es "precio".
 */
export function normalizarEncabezado(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Encabezado normalizado → campo, con canónicos, alias y avanzadas. */
export function mapaDeEncabezados(): Map<string, CampoCatalogo> {
  const mapa = new Map<string, CampoCatalogo>(
    Object.entries(COLUMNAS_AVANZADAS)
  );
  for (const columna of COLUMNAS_CATALOGO) {
    mapa.set(normalizarEncabezado(t(columna.clave)), columna.campo);
    for (const alias of columna.alias)
      mapa.set(normalizarEncabezado(alias), columna.campo);
  }
  return mapa;
}

/** Las columnas que escribe el export, con o sin las de proveedor. */
export function columnasExportadas(opciones: {
  proveedores: boolean;
}): readonly ColumnaCatalogo[] {
  return COLUMNAS_CATALOGO.filter(
    (columna) => opciones.proveedores || columna.grupo !== "proveedor"
  );
}

/** Los campos de proveedor, para saber si una planilla los trae. */
export const CAMPOS_PROVEEDOR: ReadonlySet<CampoCatalogo> = new Set(
  COLUMNAS_CATALOGO.filter((columna) => columna.grupo === "proveedor").map(
    (columna) => columna.campo
  )
);

/**
 * El techo de filas de datos que acepta el panel. Igual al techo del export
 * (`EXPORT_MAX_ROWS`): todo archivo que baja el panel vuelve a entrar. La CLI
 * no tiene techo — corre en la máquina de quien tiene la base.
 */
export const MAX_FILAS_PLANILLA = EXPORT_MAX_ROWS;
