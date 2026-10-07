import { t } from "@/i18n";
import { toCsv } from "@/lib/csv";

import type { ExportVariantRow } from "./admin-products";

/**
 * El catálogo como planilla, **una fila por variante**, con todas las
 * columnas que la importación entiende (docs/TEMPLATE-IMPROVEMENT-PLAN.md C3).
 *
 * Es un contrato de ida y vuelta: exportar y volver a importar el mismo
 * archivo no cambia nada. Por eso va el **Slug** (el producto se encuentra
 * por slug, y uno derivado del nombre no siempre es el guardado), la
 * descripción, la marca, el IVA y el precio antes —con su ₲0 tal cual, si es
 * lo que hay guardado—. Lo que la importación no toca (fotos, JSON de fichas,
 * SEO, publicación) no viaja: su ausencia en el archivo es "no lo cambies".
 *
 * Los encabezados son los de `csv.producto.*`, que son los nombres
 * canónicos de `COLUMNAS` en `catalog-import.ts`. El orden es estable: quien
 * arma fórmulas o macros sobre el archivo no se encuentra columnas corridas.
 */
export function catalogExportCsv(rows: readonly ExportVariantRow[]): string {
  return toCsv(
    [
      t("csv.producto.sku"),
      t("csv.producto.nombre"),
      t("csv.producto.slug"),
      t("csv.producto.categoria"),
      t("csv.producto.variante"),
      t("csv.producto.precio"),
      t("csv.producto.precioAntes"),
      t("csv.producto.stock"),
      t("csv.producto.modo"),
      t("csv.producto.mostrarPrecio"),
      t("csv.producto.descripcion"),
      t("csv.producto.marca"),
      t("csv.producto.iva"),
    ],
    rows.map((row) => [
      row.sku,
      row.productName,
      row.slug,
      row.categoryName,
      row.label,
      row.pricePyg,
      row.compareAtPyg,
      row.onHand,
      row.saleMode,
      row.showPrice ? "true" : "false",
      row.description,
      row.brand,
      row.ivaRate,
    ])
  );
}
