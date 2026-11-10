import ExcelJS from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  spreadsheetToCsvText,
  UnsupportedSpreadsheetError,
  XLSX_MAX_COLUMNS,
  XLSX_MAX_ROWS,
} from '@/lib/spreadsheet';

/**
 * El puente entre el `.xlsx` que sube el comercio y `parseCatalogo`, que sólo
 * entiende CSV.
 *
 * Hasta acá ningún test le pasaba bytes de verdad: se probaba `parseCatalogo`
 * con texto ya armado a mano. Un cambio de versión de `exceljs` podía romper
 * el separador o el orden de las hojas sin que nada se pusiera rojo.
 */

async function libroDePrueba(filas: unknown[][], nombreHoja = 'Catálogo'): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(nombreHoja);
  sheet.addRows(filas);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('spreadsheetToCsvText', () => {
  it('convierte un .xlsx real a CSV con `;` como separador', async () => {
    const bytes = await libroDePrueba([
      ['sku', 'nombre', 'precio'],
      ['REM-001', 'Remera negra', 120000],
      ['REM-002', 'Remera blanca', 135000],
    ]);

    const csv = await spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv.split('\n')[0]).toBe('sku;nombre;precio');
    expect(csv).toContain('REM-001;Remera negra;120000');
    // Los guaraníes salen enteros: ni miles con punto ni decimales.
    expect(csv).not.toMatch(/120\.000|120000\.0/);
  });

  it('toma la primera hoja y no las demás', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Uno').addRows([['sku'], ['PRIMERA']]);
    book.addWorksheet('Dos').addRows([['sku'], ['SEGUNDA']]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());

    const csv = await spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv).toContain('PRIMERA');
    expect(csv).not.toContain('SEGUNDA');
  });

  it('respeta el texto con acentos y con `;` adentro', async () => {
    const bytes = await libroDePrueba([
      ['nombre', 'descripcion'],
      ['Ñandutí', 'blanco; hecho a mano'],
    ]);

    const csv = await spreadsheetToCsvText('catalogo.xlsx', bytes);

    expect(csv).toContain('Ñandutí');
    // El `;` del texto va entre comillas o el CSV se parte en una columna de más.
    expect(csv).toContain('"blanco; hecho a mano"');
  });

  it('devuelve el texto tal cual para .csv y .txt', async () => {
    const texto = 'sku;nombre\nREM-001;Remera negra';

    expect(await spreadsheetToCsvText('catalogo.csv', Buffer.from(texto, 'utf8'))).toBe(texto);
    expect(await spreadsheetToCsvText('catalogo.TXT', Buffer.from(texto, 'utf8'))).toBe(texto);
  });

  it('rechaza una extensión que no sabe leer', async () => {
    await expect(spreadsheetToCsvText('catalogo.pdf', Buffer.from('%PDF-1.7'))).rejects.toThrow(
      UnsupportedSpreadsheetError,
    );
  });

  // Un `.xls` (Excel 97-2003, formato binario) ya no se soporta: `exceljs`
  // sólo lee el formato `.xlsx` (zip + XML). Cae en el mismo mensaje que
  // cualquier extensión desconocida — está documentado en KNOWN-ISSUES.md.
  it('rechaza un .xls (formato binario viejo)', async () => {
    await expect(spreadsheetToCsvText('catalogo.xls', Buffer.from('cualquier cosa'))).rejects.toThrow(
      UnsupportedSpreadsheetError,
    );
  });

  // Un `.xlsx` con el ZIP dañado es el caso aburrido y frecuente: la planilla
  // se bajó a medias, o la exportó un programa viejo. Tiene que salir como
  // `UnsupportedSpreadsheetError` con un mensaje en castellano —el panel lo
  // muestra tal cual— y nunca como un CSV inventado ni como el
  // `Corrupted zip: ...` crudo de la librería (O14).
  it('el .xlsx corrupto sale como error en castellano, no como CSV', async () => {
    const zipRoto = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

    await expect(spreadsheetToCsvText('catalogo.xlsx', zipRoto)).rejects.toThrow(
      UnsupportedSpreadsheetError,
    );
    await expect(spreadsheetToCsvText('catalogo.xlsx', zipRoto)).rejects.toThrow(/dañado/);
  });

  // S25: límites que se aplican ANTES de convertir la hoja a CSV.
  describe('límites de tamaño (S25)', () => {
    /** ZIP mínimo con una sola entrada: el directorio central declara el tamaño descomprimido. */
    function zipConUnaEntrada(nombre: string, contenido: Buffer): Buffer {
      const comprimido = deflateRawSync(contenido);
      const name = Buffer.from(nombre);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(8, 8);
      local.writeUInt32LE(comprimido.length, 18);
      local.writeUInt32LE(contenido.length, 22);
      local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(8, 10);
      central.writeUInt32LE(comprimido.length, 20);
      central.writeUInt32LE(contenido.length, 24);
      central.writeUInt16LE(name.length, 28);
      const cuerpo = Buffer.concat([local, name, comprimido]);
      const dir = Buffer.concat([central, name]);
      const fin = Buffer.alloc(22);
      fin.writeUInt32LE(0x06054b50, 0);
      fin.writeUInt16LE(1, 8);
      fin.writeUInt16LE(1, 10);
      fin.writeUInt32LE(dir.length, 12);
      fin.writeUInt32LE(cuerpo.length, 16);
      return Buffer.concat([cuerpo, dir, fin]);
    }

    it('rechaza un .xlsx que descomprime a cientos de MB (zip bomb) sin abrirlo', async () => {
      const bomba = zipConUnaEntrada('xl/worksheets/sheet1.xml', Buffer.alloc(300 * 1024 * 1024));
      expect(bomba.length).toBeLessThan(1024 * 1024);

      await expect(spreadsheetToCsvText('catalogo.xlsx', bomba)).rejects.toThrow(UnsupportedSpreadsheetError);
      await expect(spreadsheetToCsvText('catalogo.xlsx', bomba)).rejects.toThrow(/demasiado grande/);
    });

    it('rechaza una hoja con más filas que el tope del catálogo', async () => {
      const filas = Array.from({ length: XLSX_MAX_ROWS + 1 }, (_, i) => [`SKU-${i}`]);
      const bytes = await libroDePrueba(filas);

      await expect(spreadsheetToCsvText('catalogo.xlsx', bytes)).rejects.toThrow(UnsupportedSpreadsheetError);
      await expect(spreadsheetToCsvText('catalogo.xlsx', bytes)).rejects.toThrow(/filas/);
    });

    it('rechaza una hoja con demasiadas columnas', async () => {
      const bytes = await libroDePrueba([Array.from({ length: XLSX_MAX_COLUMNS + 1 }, (_, i) => `c${i}`)]);

      await expect(spreadsheetToCsvText('catalogo.xlsx', bytes)).rejects.toThrow(/columnas/);
    });

    it('acepta una hoja justo en el tope de filas', async () => {
      const filas = Array.from({ length: XLSX_MAX_ROWS }, (_, i) => [`SKU-${i}`]);
      const csv = await spreadsheetToCsvText('catalogo.xlsx', await libroDePrueba(filas));
      expect(csv.split('\n')).toHaveLength(XLSX_MAX_ROWS);
    });
  });
});
