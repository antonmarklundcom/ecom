import ExcelJS from "exceljs";

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

/**
 * Topes que se aplican ANTES de convertir la hoja a CSV (S25). El tope de
 * `MAX_FILAS_PLANILLA` (5.000 filas de datos) recién corre después de convertir,
 * cuando `exceljs` ya armó toda la hoja en memoria.
 */
/** Encabezado + 5.000 filas de datos. */
export const XLSX_MAX_ROWS = 5001;
export const XLSX_MAX_COLUMNS = 100;
/** Bytes descomprimidos de todo el ZIP: un catálogo real pesa unos pocos MB. */
export const XLSX_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const XLSX_MAX_ENTRIES = 500;

const EXTENSIONES_TEXTO = new Set(["csv", "txt"]);
const EXTENSIONES_EXCEL = new Set(["xlsx"]);

/**
 * Suma los tamaños descomprimidos que declara el directorio central del ZIP,
 * sin descomprimir nada. `null` si no se puede leer el directorio (lo resuelve
 * después `load()` como archivo dañado).
 */
function tamanoDescomprimido(bytes: Buffer): { total: number; entradas: number } | null {
  const minimo = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= minimo; i -= 1) {
    if (bytes.readUInt32LE(i) !== 0x06054b50) continue;
    const entradas = bytes.readUInt16LE(i + 10);
    let pos = bytes.readUInt32LE(i + 16);
    let total = 0;
    for (let n = 0; n < entradas; n += 1) {
      if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50) return null;
      total += bytes.readUInt32LE(pos + 24);
      pos += 46 + bytes.readUInt16LE(pos + 28) + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32);
    }
    return { total, entradas };
  }
  return null;
}

function celdaATexto(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    // Fórmula: usamos el resultado ya calculado, no la fórmula en sí.
    if ("result" in value) return celdaATexto(value.result as ExcelJS.CellValue);
    // Texto enriquecido (`richText`): se concatena el texto plano.
    if ("richText" in value) {
      return (value.richText as { text: string }[]).map((parte) => parte.text).join("");
    }
    // Hipervínculo: el texto visible, no la URL.
    if ("text" in value) return String((value as { text: unknown }).text);
    return String(value);
  }

  return String(value);
}

function campoCsv(texto: string): string {
  if (texto.includes(";") || texto.includes("\n") || texto.includes("\r") || texto.includes('"')) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function sheetToCsv(sheet: ExcelJS.Worksheet): string {
  const columnas = sheet.actualColumnCount || sheet.columnCount;
  const filas: string[] = [];

  sheet.eachRow({ includeEmpty: true }, (row) => {
    const celdas: string[] = [];
    for (let col = 1; col <= columnas; col += 1) {
      celdas.push(campoCsv(celdaATexto(row.getCell(col).value)));
    }
    filas.push(celdas.join(";"));
  });

  return filas.join("\n");
}

export async function spreadsheetToCsvText(filename: string, bytes: Buffer): Promise<string> {
  const extension = filename.toLowerCase().split(".").pop() ?? "";

  if (EXTENSIONES_TEXTO.has(extension)) {
    return bytes.toString("utf8");
  }

  if (EXTENSIONES_EXCEL.has(extension)) {
    const declarado = tamanoDescomprimido(bytes);
    if (declarado && (declarado.total > XLSX_MAX_UNCOMPRESSED_BYTES || declarado.entradas > XLSX_MAX_ENTRIES)) {
      throw new UnsupportedSpreadsheetError(
        "El archivo Excel es demasiado grande para importarlo. Dividí el catálogo en varios archivos o guardalo como .csv.",
      );
    }
    const workbook = new ExcelJS.Workbook();
    // `exceljs` tipa `load()` con un `Buffer` local a su propio `.d.ts` (no el
    // `Buffer` global de Node), incompatible con la definición de ArrayBuffer
    // de TS moderno: en runtime acepta un `Buffer` de Node sin problema
    // (termina en `JSZip.loadAsync`), sólo el tipado está mal.
    try {
      await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      // Un `.xlsx` es un ZIP, y un ZIP dañado hace tirar a la librería un
      // `Corrupted zip: ...` en inglés que subía tal cual hasta la pantalla
      // del panel como "error inesperado". El caso real es aburrido y
      // frecuente: la planilla se bajó a medias de Drive, o la exportó un
      // programa viejo. Lo único que el staff necesita saber es que el
      // archivo está roto y que hay que exportarlo de nuevo.
      throw new UnsupportedSpreadsheetError(
        "No pude abrir el archivo Excel: parece estar dañado. Abrilo y exportalo de nuevo como .xlsx, o guardalo como .csv.",
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new UnsupportedSpreadsheetError("El archivo Excel no tiene ninguna hoja con datos.");
    }
    if (sheet.rowCount > XLSX_MAX_ROWS) {
      throw new UnsupportedSpreadsheetError(
        `La hoja tiene ${sheet.rowCount} filas y el máximo es ${XLSX_MAX_ROWS - 1} filas de datos. Dividí el catálogo en varios archivos.`,
      );
    }
    if ((sheet.actualColumnCount || sheet.columnCount) > XLSX_MAX_COLUMNS) {
      throw new UnsupportedSpreadsheetError(
        `La hoja tiene demasiadas columnas (el máximo es ${XLSX_MAX_COLUMNS}). Dejá solo las columnas del catálogo.`,
      );
    }
    return sheetToCsv(sheet);
  }

  throw new UnsupportedSpreadsheetError(
    `Formato ".${extension || filename}" no soportado. Subí un archivo .csv o .xlsx.`,
  );
}
