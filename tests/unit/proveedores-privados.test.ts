import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MARCA_PLACEHOLDER, TIENDA } from '@/config/tienda';

import { exportedAsyncFunctions, listSourceFiles, readCode } from '../helpers/source';

/**
 * Los datos de proveedores son privados (ARCH.md § "Proveedores").
 *
 * `supplier_offers` (costo, proveedor, enlaces, stock declarado) y
 * `products.supplier_url` son datos de compras del comercio: el costo de una
 * variante y dónde se compra son exactamente lo que un competidor quiere ver.
 * Nunca pueden llegar al HTML público, al payload RSC, al JSON-LD, al feed, al
 * sitemap ni a un bundle cliente de la vidriera.
 *
 * Este archivo lo fija sobre el **código**: la lista de archivos que pueden
 * nombrar esos datos es explícita, y uno nuevo que los toque tiene que entrar
 * acá a propósito. Lo que la base devuelve de verdad por cada consulta pública
 * lo verifica `tests/integration/supplier-offers.test.ts`, y que los
 * componentes de la vidriera no dibujen lo que se les cuele,
 * `src/components/__tests__/proveedores-privados.test.tsx`.
 */

/** Cómo se llaman los datos privados en el código (columnas, tabla, tipos, editor). */
const PRIVADO =
  /supplierOffers|supplier_offers|supplier-offers|SupplierOffer|supplierUrl|supplier_url|unitCostPyg|unit_cost_pyg|supplierStock|supplier_stock|supplierMargin|supplier-margin/;

/**
 * Los únicos archivos de `src/` que pueden nombrarlos. Todos son panel,
 * dominio de admin o infraestructura (schema, backup): ninguno se importa
 * desde la vidriera.
 */
const PERMITIDOS = new Set(
  [
    // La tabla y sus columnas.
    'src/db/schema.ts',
    'src/db/enums.ts',
    // El dominio de proveedores y el ABM de productos que escribe `supplier_url`.
    'src/domain/supplier-offers.ts',
    'src/domain/admin-products.ts',
    // Duplicar copia el enlace de compra (y no las ofertas).
    'src/domain/admin-bulk.ts',
    // La planilla del catálogo (docs/CATALOGO-CSV.md): sus columnas de
    // proveedor se leen y se escriben sólo con el flag, desde el panel o la CLI.
    'src/domain/catalog-import.ts',
    'src/domain/catalog-import-plan.ts',
    'src/domain/catalog-duplicates.ts',
    'src/domain/catalog-export.ts',
    // El backup vuelca todas las tablas: un backup sin proveedores no restaura la tienda.
    'src/domain/backup.ts',
    // Las acciones del panel, detrás del guard de staff y del flag.
    'src/app/actions/admin-products.ts',
    // La ficha del producto en el panel y sus componentes.
    'src/app/admin/(panel)/productos/[id]/page.tsx',
    'src/components/admin/product-form.tsx',
    'src/components/admin/supplier-offers-editor.tsx',
    // Helpers sin datos: el flag, el margen, los testids y los errores conocidos.
    'src/lib/proveedores.ts',
    'src/lib/supplier-margin.ts',
    'src/lib/testids.ts',
    'src/lib/admin-guard.ts',
  ].map((file) => path.normalize(file)),
);

describe('los datos de proveedores no salen del panel', () => {
  it('sólo los archivos de la lista nombran costos, enlaces u ofertas de proveedores', async () => {
    const files = await listSourceFiles(['src']);
    expect(files.length).toBeGreaterThan(100);

    const intrusos: string[] = [];
    for (const file of files) {
      if (/\.test\.tsx?$|__tests__/.test(file)) continue;
      if (PERMITIDOS.has(file)) continue;
      if (PRIVADO.test(await readCode(file))) intrusos.push(file);
    }
    expect(intrusos).toEqual([]);
  });

  it('ningún archivo de la lista es de la vidriera', () => {
    // El contrapeso de la lista: si alguien "arregla" el test de arriba
    // sumando una página pública, que falle acá.
    const VIDRIERA =
      /^src[\\/](app[\\/](?!admin|actions)|components[\\/](?!admin)|db[\\/]queries)/;
    expect([...PERMITIDOS].filter((file) => VIDRIERA.test(file))).toEqual([]);
  });

  it('las consultas públicas nunca traen la fila entera de productos o variantes', async () => {
    // `select()` sin columnas trae **todas**, incluida `supplier_url` y lo que
    // se agregue mañana. La vidriera elige columna por columna
    // (`PRODUCT_COLUMNS` de `src/db/queries.ts`).
    const PUBLICAS = [
      'src/db/queries.ts',
      'src/domain/cart.ts',
      'src/domain/catalogue-facets.ts',
      'src/domain/stock.ts',
      'src/domain/product-slugs.ts',
      'src/app/feed.xml/route.ts',
      'src/app/sitemap.ts',
    ];
    for (const file of PUBLICAS) {
      const code = await readCode(file);
      expect(code, file).not.toMatch(/\.select\(\s*\)\s*\.from\(\s*(products|variants)\s*\)/);
    }
  });
});

describe('el flag `proveedores`', () => {
  it.skipIf(TIENDA.nombre !== MARCA_PLACEHOLDER)('viene apagado en el template', async () => {
    // Con `in`: el `Tienda` de un tienda.ts anterior al flag no lo declara, y
    // `TIENDA.proveedores` a secas no compilaba en esa tienda (O23, Norte).
    expect('proveedores' in TIENDA ? TIENDA.proveedores : undefined).toBe(false);
    const { proveedoresHabilitados } = await import('@/lib/proveedores');
    expect(proveedoresHabilitados()).toBe(false);
  });

  it('un tienda.ts sin el campo (tienda creada antes del flag) queda apagado', async () => {
    vi.resetModules();
    vi.doMock('@/config/tienda', () => ({ TIENDA: { nombre: 'Vieja', cuentasClientes: false, hero: null } }));
    const { proveedoresHabilitados } = await import('@/lib/proveedores');
    expect(proveedoresHabilitados()).toBe(false);
    vi.doUnmock('@/config/tienda');
    vi.resetModules();
  });

  it('prendido, se prende', async () => {
    vi.resetModules();
    vi.doMock('@/config/tienda', () => ({ TIENDA: { nombre: 'X', proveedores: true } }));
    const { proveedoresHabilitados } = await import('@/lib/proveedores');
    expect(proveedoresHabilitados()).toBe(true);
    vi.doUnmock('@/config/tienda');
    vi.resetModules();
  });

  it('cada acción de proveedores mira el guard, la capacidad y el flag antes de escribir', async () => {
    const code = await readCode(path.join('src', 'app', 'actions', 'admin-products.ts'));
    const acciones = exportedAsyncFunctions(code).filter((fn) => /SupplierOffer/.test(fn.name));
    expect(acciones.map((fn) => fn.name).sort()).toEqual([
      'deleteVariantSupplierOffer',
      'saveVariantSupplierOffer',
    ]);
    for (const { name, body } of acciones) {
      const guard = body.search(/requireStaffSession\s*\(/);
      const precios = body.search(/can\(\s*actor\.role,\s*["']precios["']\s*\)/);
      const flag = body.search(/proveedoresHabilitados\s*\(/);
      const escritura = body.search(/(save|delete)SupplierOffer\s*\(/);
      expect(guard, name).toBeGreaterThanOrEqual(0);
      expect(precios, name).toBeGreaterThan(guard);
      expect(flag, name).toBeGreaterThan(precios);
      expect(escritura, name).toBeGreaterThan(flag);
    }
  });

  it('saveProduct sólo escribe el enlace de compra con el flag prendido', async () => {
    const code = await readCode(path.join('src', 'app', 'actions', 'admin-products.ts'));
    const saveProduct = exportedAsyncFunctions(code).find((fn) => fn.name === 'saveProduct');
    expect(saveProduct?.body).toMatch(/supplierUrl:\s*proveedoresHabilitados\(\)\s*\?/);
  });
});
