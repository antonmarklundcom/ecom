import { describe, expect, it } from 'vitest';

import {
  groupByProduct,
  parseCsv,
  parseRow,
  rowsToRecords,
  type ImportRow,
} from '../../scripts/import-productos';

describe('parseCsv', () => {
  it('parsea filas y columnas simples', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('respeta comas dentro de comillas', () => {
    expect(parseCsv('nombre,precio\n"Remera, azul",50000')).toEqual([
      ['nombre', 'precio'],
      ['Remera, azul', '50000'],
    ]);
  });

  it('desescapa comillas dobles', () => {
    expect(parseCsv('nombre\n"Talle ""M"""')).toEqual([['nombre'], ['Talle "M"']]);
  });

  it('tolera \\r\\n', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('rowsToRecords', () => {
  it('arma objetos con el encabezado como llaves', () => {
    expect(rowsToRecords([['a', 'b'], ['1', '2']])).toEqual([{ a: '1', b: '2' }]);
  });

  it('vacío sin encabezado', () => {
    expect(rowsToRecords([])).toEqual([]);
  });
});

const VALID_RECORD = {
  producto_slug: 'remera-azul',
  producto_nombre: 'Remera azul',
  categoria_slug: 'ropa',
  descripcion: '',
  marca: '',
  iva: '10',
  variante_sku: 'REM-AZ-M',
  variante_etiqueta: 'M',
  precio_pyg: '50000',
  precio_comparar_pyg: '',
  stock: '10',
};

describe('parseRow', () => {
  it('acepta una fila válida', () => {
    const result = parseRow(VALID_RECORD, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.productoSlug).toBe('remera-azul');
      expect(result.row.precioPyg).toBe(50000);
      expect(result.row.precioCompararPyg).toBeNull();
    }
  });

  it('rechaza un slug con mayúsculas o espacios', () => {
    const result = parseRow({ ...VALID_RECORD, producto_slug: 'Remera Azul' }, 2);
    expect(result.ok).toBe(false);
  });

  it('rechaza un iva que no sea 10/5/0', () => {
    const result = parseRow({ ...VALID_RECORD, iva: '21' }, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/iva/);
  });

  it('rechaza un precio no entero', () => {
    const result = parseRow({ ...VALID_RECORD, precio_pyg: '50000.5' }, 2);
    expect(result.ok).toBe(false);
  });

  it('rechaza un precio negativo', () => {
    const result = parseRow({ ...VALID_RECORD, precio_pyg: '-1' }, 2);
    expect(result.ok).toBe(false);
  });

  it('acepta precio_comparar_pyg vacío como null y lo valida si viene', () => {
    const conValor = parseRow({ ...VALID_RECORD, precio_comparar_pyg: '60000' }, 2);
    expect(conValor.ok).toBe(true);
    if (conValor.ok) expect(conValor.row.precioCompararPyg).toBe(60000);

    const invalido = parseRow({ ...VALID_RECORD, precio_comparar_pyg: 'abc' }, 2);
    expect(invalido.ok).toBe(false);
  });

  it('acumula todos los errores de la fila, no sólo el primero', () => {
    const result = parseRow({ ...VALID_RECORD, iva: '99', precio_pyg: 'x' }, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    productoSlug: 'remera-azul',
    productoNombre: 'Remera azul',
    categoriaSlug: 'ropa',
    descripcion: null,
    marca: null,
    iva: 10,
    varianteSku: 'REM-AZ-M',
    varianteEtiqueta: 'M',
    precioPyg: 50000,
    precioCompararPyg: null,
    stock: 10,
    ...overrides,
  };
}

describe('groupByProduct', () => {
  it('agrupa variantes del mismo producto', () => {
    const result = groupByProduct([
      row(),
      row({ varianteSku: 'REM-AZ-L', varianteEtiqueta: 'L' }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.variantes).toHaveLength(2);
    }
  });

  it('rechaza filas del mismo producto con nombre distinto', () => {
    const result = groupByProduct([row(), row({ productoNombre: 'Remera roja' })]);
    expect(result.ok).toBe(false);
  });

  it('rechaza un sku repetido en dos productos distintos', () => {
    const result = groupByProduct([
      row(),
      row({ productoSlug: 'pantalon-negro', productoNombre: 'Pantalón negro' }),
    ]);
    expect(result.ok).toBe(false);
  });
});
