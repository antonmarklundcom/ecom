import { asc, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { productImages } from "@/db/schema";
import { t } from "@/i18n";
import { toCsv, type CsvValue } from "@/lib/csv";
import { productImageUrl } from "@/lib/images";

import {
  listVariantsForExport,
  type AdminProductFilters,
  type ExportVariantRow,
} from "./admin-products";
import { columnasExportadas, type CampoCatalogo } from "./catalog-csv";
import type { Executor } from "./executor";
import { listPreferredSupplierOffers } from "./supplier-offers";

/**
 * El catálogo como planilla, **una fila por variante**, con las columnas de
 * `catalog-csv.ts` en su orden (docs/CATALOGO-CSV.md).
 *
 * Es un contrato de ida y vuelta: exportar y volver a importar el mismo
 * archivo no cambia nada, en esta tienda o en otra (docs/TEMPLATE-IMPROVEMENT-PLAN.md
 * C3). Por eso va el **Slug** (el producto se encuentra por slug, y uno
 * derivado del nombre no siempre es el guardado), la descripción, la marca,
 * el IVA y el precio antes —con su ₲0 tal cual, si es lo que hay guardado—.
 *
 * **Fotos** son las URLs públicas de entrega de las fotos del producto, en la
 * primera fila de cada producto: otra tienda que importa el archivo las sube
 * a su propio almacenamiento; la misma tienda no las vuelve a subir (sólo se
 * agregan a un producto sin ninguna foto).
 *
 * Las de **proveedor** (Proveedor, URL proveedor, Costo proveedor, Stock
 * proveedor) se escriben sólo con `proveedores: true` —el flag y el permiso
 * los resuelve quien llama— y salen de `products.supplier_url` y de la oferta
 * **preferida** de cada variante. Lo que la importación no toca (JSON de
 * fichas, SEO, publicación) no viaja: su ausencia en el archivo es "no lo
 * cambies".
 */

/** Una fila del export, con todo lo que puede ir en el archivo. */
export type CatalogExportRow = ExportVariantRow & {
  /** URLs de fotos; sólo en la primera fila de cada producto. */
  fotos: readonly string[];
  /** La oferta preferida de la variante (vacía si no hay o sin proveedores). */
  proveedor: string | null;
  costoProveedor: number | null;
  stockProveedor: number | null;
};

const VALOR: Record<
  CampoCatalogo,
  ((row: CatalogExportRow) => CsvValue) | undefined
> = {
  sku: (row) => row.sku,
  producto: (row) => row.productName,
  categoria: (row) => row.categoryName,
  variante: (row) => row.label,
  precio: (row) => row.pricePyg,
  stock: (row) => row.onHand,
  descripcion: (row) => row.description,
  marca: (row) => row.brand,
  iva: (row) => row.ivaRate,
  precioAntes: (row) => row.compareAtPyg,
  slug: (row) => row.slug,
  fotos: (row) => row.fotos.join("|"),
  proveedor: (row) => row.proveedor,
  urlProveedor: (row) => row.supplierUrl,
  costoProveedor: (row) => row.costoProveedor,
  stockProveedor: (row) => row.stockProveedor,
  saleMode: (row) => row.saleMode,
  showPrice: (row) => (row.showPrice ? "true" : "false"),
  specifications: undefined,
  supplierDetails: undefined,
  attributes: undefined,
  identifiers: undefined,
  seoTitle: undefined,
  seoDescription: undefined,
};

/** Puro: filas → CSV. El mismo encabezado que entiende `parseCatalogo`. */
export function catalogExportCsv(
  rows: readonly CatalogExportRow[],
  opciones: { proveedores: boolean }
): string {
  const columnas = columnasExportadas(opciones);
  return toCsv(
    columnas.map((columna) => t(columna.clave)),
    rows.map((row) =>
      columnas.map((columna) => {
        const valor = VALOR[columna.campo];
        return valor ? valor(row) : "";
      })
    )
  );
}

/** El importador acepta hasta 10 fotos por producto. */
const MAX_FOTOS_EXPORT = 10;

/**
 * Las filas del export: el listado del panel (`listVariantsForExport`, con
 * sus filtros y su techo) más las fotos y, con `proveedores`, la oferta
 * preferida de cada variante.
 */
export async function listCatalogExportRows(
  filtros: AdminProductFilters,
  opciones: { proveedores: boolean },
  limit?: number,
  executor?: Executor
): Promise<CatalogExportRow[]> {
  const tx = executor ?? getDb();
  const rows = await listVariantsForExport(filtros, limit, tx);

  const productIds = [...new Set(rows.map((row) => row.productId))];
  const fotosPorProducto = new Map<number, string[]>();
  if (productIds.length > 0) {
    const imagenes = await tx
      .select({
        productId: productImages.productId,
        cloudinaryId: productImages.cloudinaryId,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(
        asc(productImages.productId),
        asc(productImages.position),
        asc(productImages.id)
      );
    for (const imagen of imagenes) {
      const url = productImageUrl(imagen.cloudinaryId, "detail");
      if (!url) continue;
      const lista = fotosPorProducto.get(imagen.productId) ?? [];
      if (lista.length < MAX_FOTOS_EXPORT) lista.push(url);
      fotosPorProducto.set(imagen.productId, lista);
    }
  }

  const ofertas = opciones.proveedores
    ? await listPreferredSupplierOffers(
        rows.map((row) => row.variantId),
        tx
      )
    : new Map();

  const vistos = new Set<number>();
  return rows.map((row) => {
    const primera = !vistos.has(row.productId);
    vistos.add(row.productId);
    const oferta = ofertas.get(row.variantId);
    return {
      ...row,
      supplierUrl: opciones.proveedores ? row.supplierUrl : null,
      fotos: primera ? (fotosPorProducto.get(row.productId) ?? []) : [],
      proveedor: oferta?.source ?? null,
      costoProveedor: oferta?.unitCostPyg ?? null,
      stockProveedor: oferta?.supplierStock ?? null,
    };
  });
}
