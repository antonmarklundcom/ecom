import { readFileSync } from 'node:fs';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { catalogExportCsv, type CatalogExportRow } from '../../src/domain/catalog-export';
import { COLUMNAS_CATALOGO, columnasExportadas, MAX_FILAS_PLANILLA } from '../../src/domain/catalog-csv';
import { parseCatalogo, type CatalogoProducto } from '../../src/domain/catalog-import';
import { t } from '../../src/i18n';
import { EXPORT_MAX_ROWS, parseCsv } from '../../src/lib/csv';
import { spreadsheetToCsvText } from '../../src/lib/spreadsheet';

/**
 * La planilla canónica del catálogo (docs/CATALOGO-CSV.md): una sola
 * definición de columnas para el export, la importación del panel y la CLI.
 *
 * Lo que se fija acá, sin base: el orden y los nombres exactos del encabezado,
 * que un archivo exportado vuelva a entrar igual (ida y vuelta pura), que los
 * encabezados viejos sigan entrando, y qué pasa con las columnas de proveedor
 * cuando una tienda las usa y la otra no. La ida y vuelta contra MySQL de
 * verdad está en tests/integration/catalog-import-lotes.test.ts.
 */

const FIXTURE = readFileSync('scripts/fixtures/catalogo-demo.csv', 'utf8');

const CANONICO_BASE = [
  'SKU',
  'Producto',
  'Categoría',
  'Variante',
  'Precio (₲)',
  'Stock',
  'Descripción',
  'Marca',
  'IVA',
  'Precio antes (₲)',
  'Slug',
  'Fotos',
];
const PROVEEDOR = ['Proveedor', 'URL proveedor', 'Costo proveedor', 'Stock proveedor'];
const MODO = ['Modo de venta', 'Mostrar precio'];

/** Lo que un `CatalogoProducto` parseado diría como fila de export. */
function filasDe(productos: CatalogoProducto[]): CatalogExportRow[] {
  let id = 0;
  return productos.flatMap((producto, indice) =>
    producto.variants.map((variante, posicion) => ({
      productId: indice + 1,
      variantId: (id += 1),
      sku: variante.sku,
      productName: producto.name,
      slug: producto.slug,
      categoryName: producto.categoryName,
      label: variante.label ?? 'Único',
      pricePyg: variante.pricePyg,
      compareAtPyg: variante.compareAtPyg ?? null,
      onHand: variante.onHand ?? 0,
      description: producto.description ?? null,
      brand: producto.brand ?? null,
      ivaRate: producto.ivaRate ?? 10,
      saleMode: producto.saleMode ?? 'stock',
      showPrice: producto.showPrice ?? true,
      supplierUrl: producto.supplierUrl ?? null,
      fotos: posicion === 0 ? producto.fotos : [],
      proveedor: variante.oferta?.source ?? null,
      costoProveedor: variante.oferta?.unitCostPyg ?? null,
      stockProveedor: variante.oferta?.supplierStock ?? null,
    })),
  );
}

const FILA: CatalogExportRow = {
  productId: 1,
  variantId: 1,
  sku: 'TER-1',
  productName: 'Termo 1 L',
  slug: 'termo-1-l',
  categoryName: 'Mate',
  label: 'Negro',
  pricePyg: 185_000,
  compareAtPyg: 0,
  onHand: 4,
  description: 'Doble pared; frío 24 h',
  brand: null,
  ivaRate: 10,
  saleMode: 'stock',
  showPrice: true,
  supplierUrl: 'https://proveedor.example.com/termo',
  fotos: ['https://cdn.example.com/termo.jpg', 'https://cdn.example.com/termo-2.jpg'],
  proveedor: 'Importadora Este',
  costoProveedor: 120_000,
  stockProveedor: 80,
};

describe('el encabezado canónico', () => {
  it('es exactamente el de docs/CATALOGO-CSV.md, en este orden', () => {
    expect(parseCsv(catalogExportCsv([], { proveedores: true }))[0]).toEqual([
      ...CANONICO_BASE,
      ...PROVEEDOR,
      ...MODO,
    ]);
    // Sin proveedores, las cuatro columnas no se escriben y el resto conserva su orden.
    expect(parseCsv(catalogExportCsv([], { proveedores: false }))[0]).toEqual([
      ...CANONICO_BASE,
      ...MODO,
    ]);
  });

  it('sale de csv.producto.*: el export y el importador usan la misma definición', () => {
    expect(columnasExportadas({ proveedores: true }).map((c) => t(c.clave))).toEqual(
      COLUMNAS_CATALOGO.map((c) => t(c.clave)),
    );
    // Cada encabezado canónico, solo o con todos, se reconoce.
    for (const columna of COLUMNAS_CATALOGO) {
      const { advertencias } = parseCatalogo(
        `SKU;Producto;Categoría;Precio (₲);${t(columna.clave)}\nA-1;Algo;Hogar;1000;\n`,
        { proveedores: true },
      );
      expect(advertencias, t(columna.clave)).toEqual([]);
    }
  });

  it('el techo de filas del panel es el del export: todo lo que baja vuelve a entrar', () => {
    expect(MAX_FILAS_PLANILLA).toBe(EXPORT_MAX_ROWS);
  });

  it('los encabezados viejos y los alias siguen entrando', () => {
    const { productos, errores, advertencias } = parseCatalogo(
      'sku;Nombre;CATEGORIA;Precio;Modo venta;mostrar precio;Imagenes\n' +
        'A-1;Algo;Hogar;1000;enquiry;no;https://cdn.example.com/a.jpg\n',
    );
    expect(errores).toEqual([]);
    expect(advertencias).toEqual([]);
    expect(productos[0]).toMatchObject({
      name: 'Algo',
      saleMode: 'enquiry',
      showPrice: false,
      fotos: ['https://cdn.example.com/a.jpg'],
    });
  });

  it('una columna que no es del formato se avisa, no se calla ni frena', () => {
    const { errores, advertencias } = parseCatalogo(
      'SKU;Producto;Categoría;Precio (₲);Precio mayorista\nA-1;Algo;Hogar;1000;900\n',
    );
    expect(errores).toEqual([]);
    expect(advertencias).toEqual([expect.stringContaining('Precio mayorista')]);
  });

  it('más filas que el techo es un error claro, antes de mirar ninguna', () => {
    const filas = Array.from({ length: 4 }, (_, i) => `S-${i};P ${i};Hogar;1000`).join('\n');
    const { errores, productos } = parseCatalogo(`SKU;Producto;Categoría;Precio (₲)\n${filas}\n`, {
      maxFilas: 3,
    });
    expect(productos).toEqual([]);
    expect(errores).toEqual([expect.stringContaining('máximo por archivo es 3')]);
  });
});

describe('ida y vuelta pura: exportar → parsear → exportar', () => {
  it.each([true, false])('el mismo archivo, byte a byte (proveedores: %s)', (proveedores) => {
    const csv = catalogExportCsv([FILA, { ...FILA, variantId: 2, sku: 'TER-2', label: 'Rojo', fotos: [] }], {
      proveedores,
    });
    const { productos, errores, advertencias } = parseCatalogo(csv, { proveedores });
    expect(errores).toEqual([]);
    expect(advertencias).toEqual([]);
    expect(catalogExportCsv(filasDe(productos), { proveedores })).toBe(csv);
  });

  it('el catálogo de ejemplo vuelve igual después de una vuelta por el export', () => {
    const primera = parseCatalogo(FIXTURE, { proveedores: true });
    expect(primera.errores).toEqual([]);
    const csv = catalogExportCsv(filasDe(primera.productos), { proveedores: true });
    const segunda = parseCatalogo(csv, { proveedores: true });
    expect(segunda.errores).toEqual([]);
    expect(catalogExportCsv(filasDe(segunda.productos), { proveedores: true })).toBe(csv);
  });
});

describe('columnas de proveedor entre tiendas', () => {
  it('exportado con proveedores, en una tienda sin ellos: se ignoran con aviso, el resto entra igual', () => {
    const csv = catalogExportCsv([FILA], { proveedores: true });
    const sin = parseCatalogo(csv, { proveedores: false });
    expect(sin.errores).toEqual([]);
    expect(sin.advertencias).toEqual([expect.stringContaining('columnas de proveedor')]);
    expect(sin.productos[0]!.supplierUrl).toBeUndefined();
    expect(sin.productos[0]!.variants[0]!.oferta).toBeUndefined();
    // Lo que no es de proveedor, idéntico a leerlo con ellos.
    const con = parseCatalogo(csv, { proveedores: true });
    const { supplierUrl, variants, ...resto } = con.productos[0]!;
    void supplierUrl;
    expect(sin.productos[0]).toEqual({
      ...resto,
      variants: variants.map(({ oferta, ...v }) => {
        void oferta;
        return v;
      }),
    });
  });

  it('exportado sin proveedores, en una tienda con ellos: no trae nada de proveedores y no avisa', () => {
    const csv = catalogExportCsv([FILA], { proveedores: false });
    const { productos, errores, advertencias } = parseCatalogo(csv, { proveedores: true });
    expect(errores).toEqual([]);
    expect(advertencias).toEqual([]);
    expect(productos[0]!.supplierUrl).toBeUndefined();
    expect(productos[0]!.variants[0]!.oferta).toBeUndefined();
  });

  it('con proveedores: la oferta es de la variante y la URL del producto', () => {
    const { productos } = parseCatalogo(FIXTURE, { proveedores: true });
    const termo = productos.find((p) => p.slug === 'termo-de-acero-inoxidable-1-l')!;
    expect(termo.supplierUrl).toBe('https://importadora.example.com/termo-1l');
    expect(termo.variants.map((v) => v.oferta)).toEqual([
      { source: 'Importadora Este', unitCostPyg: 120_000, supplierStock: 80 },
      { source: 'Importadora Este', unitCostPyg: 120_000, supplierStock: 35 },
      undefined,
    ]);
  });

  it('valida lo de proveedor con la línea: costo sin nombre, enlace con contraseña, stock con decimales', () => {
    const { errores } = parseCatalogo(
      'SKU;Producto;Categoría;Precio (₲);Proveedor;URL proveedor;Costo proveedor;Stock proveedor\n' +
        'A-1;Uno;Hogar;1000;;;500;\n' +
        'B-1;Dos;Hogar;1000;Mayorista;https://user:clave@proveedor.example.com;;\n' +
        'C-1;Tres;Hogar;1000;Mayorista;http://proveedor.example.com;;\n' +
        'D-1;Cuatro;Hogar;1000;Mayorista;;12,5;\n' +
        'E-1;Cinco;Hogar;1000;Mayorista;;;3.5\n',
      { proveedores: true },
    );
    expect(errores).toEqual([
      expect.stringMatching(/^Línea 2: .*Proveedor/),
      expect.stringMatching(/^Línea 3: .*https/),
      expect.stringMatching(/^Línea 4: .*https/),
      expect.stringMatching(/^Línea 5: .*costo/),
      expect.stringMatching(/^Línea 6: .*stock de proveedor/),
    ]);
  });

  it('dos filas del mismo producto con distinta URL de proveedor son un error', () => {
    const { errores } = parseCatalogo(
      'SKU;Producto;Categoría;Precio (₲);URL proveedor\n' +
        'A-1;Uno;Hogar;1000;https://a.example.com\n' +
        'A-2;Uno;Hogar;1000;https://b.example.com\n',
      { proveedores: true },
    );
    expect(errores).toEqual([expect.stringContaining('URL de proveedor')]);
  });
});

describe('el catálogo de ejemplo (scripts/fixtures/catalogo-demo.csv)', () => {
  it('entra sin errores: 20 productos, variantes, precio antes, consulta, precio oculto y proveedores', () => {
    const { productos, errores } = parseCatalogo(FIXTURE, { proveedores: true });
    expect(errores).toEqual([]);
    expect(productos).toHaveLength(20);
    expect(new Set(productos.map((p) => p.categoryName)).size).toBeGreaterThanOrEqual(4);
    expect(productos.filter((p) => p.variants.length > 1).length).toBeGreaterThanOrEqual(3);
    expect(productos.some((p) => p.variants.some((v) => (v.compareAtPyg ?? 0) > 0))).toBe(true);
    expect(productos.some((p) => p.saleMode === 'enquiry')).toBe(true);
    expect(productos.some((p) => p.showPrice === false)).toBe(true);
    expect(productos.filter((p) => p.variants.some((v) => v.oferta)).length).toBeGreaterThanOrEqual(3);
    // Sin red en los tests: ninguna foto apunta afuera.
    expect(productos.every((p) => p.fotos.length === 0)).toBe(true);
  });
});

describe('Excel: las mismas columnas, primera hoja', () => {
  it('un .xlsx con el encabezado canónico se lee igual que el CSV', async () => {
    const csv = catalogExportCsv([FILA], { proveedores: true });
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Catálogo');
    for (const fila of parseCsv(csv)) {
      // Como lo deja Excel: los números como números.
      hoja.addRow(fila.map((celda) => (/^\d+$/.test(celda) ? Number(celda) : celda)));
    }
    workbook.addWorksheet('Notas').addRow(['esto no se lee']);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const texto = await spreadsheetToCsvText('catalogo.xlsx', bytes);
    expect(parseCatalogo(texto, { proveedores: true })).toEqual(parseCatalogo(csv, { proveedores: true }));
  });
});
