import * as XLSX from "xlsx";

/**
 * El puente entre "el comercio manda un `.xlsx`" y `parseCatalogo`, que sólo
 * entiende texto CSV.
 *
 * No se reimplementa el parseo de la planilla: se convierte la primera hoja
 * del Excel a CSV (mismo separador `;` que ya entiende `parseCsv`) y de ahí en
 * más es exactamente el mismo camino que un `.csv` subido a mano.
 */
export class UnsupportedSpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSpreadsheetError";
  }
}

const EXTENSIONES_TEXTO = new Set(["csv", "txt"]);
const EXTENSIONES_EXCEL = new Set(["xlsx", "xls"]);

export function spreadsheetToCsvText(filename: string, bytes: Buffer): string {
  const extension = filename.toLowerCase().split(".").pop() ?? "";

  if (EXTENSIONES_TEXTO.has(extension)) {
    return bytes.toString("utf8");
  }

  if (EXTENSIONES_EXCEL.has(extension)) {
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      throw new UnsupportedSpreadsheetError("El archivo Excel no tiene ninguna hoja con datos.");
    }
    return XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
  }

  throw new UnsupportedSpreadsheetError(
    `Formato ".${extension || filename}" no soportado. Subí un archivo .csv o .xlsx.`,
  );
}
