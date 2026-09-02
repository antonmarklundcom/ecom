import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { spreadsheetToCsvText, UnsupportedSpreadsheetError } from '@/lib/spreadsheet';

/**
 * El puente entre el `.xlsx` que sube el comercio y `parseCatalogo`, que sólo
 * entiende CSV.
 *
 * Hasta acá ningún test le pasaba bytes de verdad: se probaba `parseCatalogo`
 * con texto ya armado a mano. Un cambio de versión de `xlsx` —el paquete se
 * actualiza a mano desde el CDN de SheetJS, no lo mueve Dependabot— podía
 * romper el separador o el orden de las hojas sin que nada se pusiera rojo.
 */

function libroDePrueba(filas: unknown[][], nombreHoja = 'Catálogo'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('spreadsheetToCsvText', () => {
  it('convierte un .xlsx real a CSV con `;` como separador', () => {
    const bytes = libroDePrueba([
      ['sku', 'nombre', 'precio'],
      ['REM-001', 'Remera negra', 120000],
      ['REM-002', 'Remera blanca', 135000],
    ]);

    const csv = spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv.split('\n')[0]).toBe('sku;nombre;precio');
    expect(csv).toContain('REM-001;Remera negra;120000');
    // Los guaraníes salen enteros: ni miles con punto ni decimales.
    expect(csv).not.toMatch(/120\.000|120000\.0/);
  });

  it('toma la primera hoja y no las demás', () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['sku'], ['PRIMERA']]), 'Uno');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['sku'], ['SEGUNDA']]), 'Dos');
    const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const csv = spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv).toContain('PRIMERA');
    expect(csv).not.toContain('SEGUNDA');
  });

  it('respeta el texto con acentos y con `;` adentro', () => {
    const bytes = libroDePrueba([
      ['nombre', 'descripcion'],
      ['Ñandutí', 'blanco; hecho a mano'],
    ]);

    const csv = spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv).toContain('Ñandutí');
    // El `;` del texto va entre comillas o el CSV se parte en una columna de más.
    expect(csv).toContain('"blanco; hecho a mano"');
  });

  it('devuelve el texto tal cual para .csv y .txt', () => {
    const texto = 'sku;nombre\nREM-001;Remera negra';

    expect(spreadsheetToCsvText('catalogo.csv', Buffer.from(texto, 'utf8'))).toBe(texto);
    expect(spreadsheetToCsvText('catalogo.TXT', Buffer.from(texto, 'utf8'))).toBe(texto);
  });

  it('rechaza una extensión que no sabe leer', () => {
    expect(() => spreadsheetToCsvText('catalogo.pdf', Buffer.from('%PDF-1.7'))).toThrow(
      UnsupportedSpreadsheetError,
    );
  });

  // Un `.xlsx` corrupto tira el error crudo de la librería, no
  // `UnsupportedSpreadsheetError`: el panel lo muestra como error genérico en
  // vez de "el archivo está dañado". Está anotado en KNOWN-ISSUES.md; lo que
  // este test cuida es que nunca devuelva un CSV inventado.
  it('no devuelve CSV cuando el .xlsx está corrupto', () => {
    const zipRoto = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

    expect(() => spreadsheetToCsvText('catalogo.xlsx', zipRoto)).toThrow();
    expect(() => spreadsheetToCsvText('catalogo.xlsx', zipRoto)).not.toThrow(
      UnsupportedSpreadsheetError,
    );
  });
});
