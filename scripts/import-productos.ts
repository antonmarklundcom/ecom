import '../src/lib/load-env';

import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';

import { closePool, getDb } from '../src/db';
import { categories, products, variants } from '../src/db/schema';
import { assertGs } from '../src/lib/money';

/**
 * `pnpm import-csv <archivo.csv>` — cargar el catálogo real desde una planilla.
 *
 * NEW-STORE.md siempre dijo "adaptá `scripts/seed.ts` si vienen de un
 * CSV/planilla" sin decir cómo. Esto es el cómo: un formato fijo, valida
 * **todas** las filas antes de escribir la primera, y es idempotente por
 * `slug`/`sku` igual que `seed.ts` — reimportar la misma planilla actualizada
 * no duplica nada.
 *
 * Una fila = una variante. Los campos de producto se repiten en cada fila de
 * ese producto (es como sale de Excel/Sheets); si dos filas del mismo
 * `producto_slug` traen un nombre o categoría distintos, es un error de la
 * planilla y se avisa en vez de quedarse con el primero en silencio.
 *
 * Columnas (con encabezado, en este orden no importa):
 *   producto_slug, producto_nombre, categoria_slug, descripcion, marca, iva,
 *   variante_sku, variante_etiqueta, precio_pyg, precio_comparar_pyg, stock
 *
 * `descripcion`, `marca` y `precio_comparar_pyg` pueden ir vacíos. El resto no.
 * `categoria_slug` tiene que existir ya en `/admin/categorias` — este comando
 * no crea categorías, porque decidir cómo se llama y en qué orden va en el
 * menú es una decisión de la tienda, no algo que adivinar desde una planilla.
 */

// ---------------------------------------------------------------------------
// Parte pura: parsear y validar. Sin tocar la base, así que se testea sin DB.
// ---------------------------------------------------------------------------

/** Parser CSV mínimo: comillas dobles, comas y comillas escapadas (""). Sin dependencias nuevas para un formato que no las necesita. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Normalizo \r\n a \n para no depender de con qué se guardó el archivo.
  const text = content.replace(/\r\n/g, '\n');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }
  // Última fila sin salto de línea final.
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export type CsvRecord = Record<string, string>;

/** Primera fila = encabezado. El resto, objetos por nombre de columna. */
export function rowsToRecords(rows: string[][]): CsvRecord[] {
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const record: CsvRecord = {};
    header.forEach((col, i) => {
      record[col] = (row[i] ?? '').trim();
    });
    return record;
  });
}

export type ImportRow = {
  productoSlug: string;
  productoNombre: string;
  categoriaSlug: string;
  descripcion: string | null;
  marca: string | null;
  iva: 10 | 5 | 0;
  varianteSku: string;
  varianteEtiqueta: string;
  precioPyg: number;
  precioCompararPyg: number | null;
  stock: number;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Una fila del CSV → `ImportRow`, o la lista de qué está mal. Nunca las dos cosas. */
export function parseRow(
  record: CsvRecord,
  rowNumber: number,
): { ok: true; row: ImportRow } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const at = (msg: string): string => `fila ${rowNumber}: ${msg}`;

  const productoSlug = record.producto_slug ?? '';
  if (!SLUG_RE.test(productoSlug)) {
    errors.push(at(`producto_slug inválido: "${productoSlug}" (minúsculas y guiones, ej. remera-azul)`));
  }

  const productoNombre = record.producto_nombre ?? '';
  if (productoNombre.length < 2) errors.push(at('producto_nombre vacío o muy corto'));

  const categoriaSlug = record.categoria_slug ?? '';
  if (!SLUG_RE.test(categoriaSlug)) errors.push(at(`categoria_slug inválido: "${categoriaSlug}"`));

  const iva = Number(record.iva);
  if (iva !== 10 && iva !== 5 && iva !== 0) errors.push(at(`iva tiene que ser 10, 5 o 0 (vino "${record.iva}")`));

  const varianteSku = record.variante_sku ?? '';
  if (varianteSku.length < 1) errors.push(at('variante_sku vacío'));

  const varianteEtiqueta = record.variante_etiqueta ?? '';
  if (varianteEtiqueta.length < 1) errors.push(at('variante_etiqueta vacío'));

  const precioPyg = Number(record.precio_pyg);
  if (!Number.isInteger(precioPyg) || precioPyg < 0) {
    errors.push(at(`precio_pyg tiene que ser un entero en guaraníes (vino "${record.precio_pyg}")`));
  }

  let precioCompararPyg: number | null = null;
  const compararRaw = (record.precio_comparar_pyg ?? '').trim();
  if (compararRaw !== '') {
    precioCompararPyg = Number(compararRaw);
    if (!Number.isInteger(precioCompararPyg) || precioCompararPyg < 0) {
      errors.push(at(`precio_comparar_pyg tiene que ser un entero (vino "${compararRaw}")`));
    }
  }

  const stock = Number(record.stock);
  if (!Number.isInteger(stock) || stock < 0) {
    errors.push(at(`stock tiene que ser un entero ≥ 0 (vino "${record.stock}")`));
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    row: {
      productoSlug,
      productoNombre,
      categoriaSlug,
      descripcion: record.descripcion?.trim() || null,
      marca: record.marca?.trim() || null,
      iva: iva as 10 | 5 | 0,
      varianteSku,
      varianteEtiqueta,
      precioPyg,
      precioCompararPyg,
      stock,
    },
  };
}

export type ProductGroup = {
  slug: string;
  nombre: string;
  categoriaSlug: string;
  descripcion: string | null;
  marca: string | null;
  iva: 10 | 5 | 0;
  variantes: ImportRow[];
};

/**
 * Agrupa filas por `producto_slug` y valida que los campos de producto no se
 * contradigan entre filas del mismo producto — dos filas de "remera-azul" con
 * dos nombres distintos es un error de la planilla, no algo que resolver
 * quedándose con el primero en silencio.
 */
export function groupByProduct(
  rows: readonly ImportRow[],
): { ok: true; groups: ProductGroup[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const groups = new Map<string, ProductGroup>();

  for (const row of rows) {
    const existing = groups.get(row.productoSlug);
    if (!existing) {
      groups.set(row.productoSlug, {
        slug: row.productoSlug,
        nombre: row.productoNombre,
        categoriaSlug: row.categoriaSlug,
        descripcion: row.descripcion,
        marca: row.marca,
        iva: row.iva,
        variantes: [row],
      });
      continue;
    }

    if (
      existing.nombre !== row.productoNombre ||
      existing.categoriaSlug !== row.categoriaSlug ||
      existing.iva !== row.iva
    ) {
      errors.push(
        `producto "${row.productoSlug}": filas contradictorias (nombre/categoría/iva no coinciden ` +
          `entre las filas de este mismo producto — arreglalo en la planilla).`,
      );
      continue;
    }

    existing.variantes.push(row);
  }

  const skuSeen = new Map<string, string>();
  for (const group of groups.values()) {
    for (const variant of group.variantes) {
      const previous = skuSeen.get(variant.varianteSku);
      if (previous && previous !== group.slug) {
        errors.push(
          `sku "${variant.varianteSku}" repetido en dos productos distintos (${previous} y ${group.slug}).`,
        );
      }
      skuSeen.set(variant.varianteSku, group.slug);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, groups: [...groups.values()] };
}

// ---------------------------------------------------------------------------
// Parte con DB
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!filePath || filePath.startsWith('--')) {
    console.error('\nUso: pnpm import-csv <archivo.csv> [--dry-run]\n');
    process.exitCode = 1;
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const records = rowsToRecords(parseCsv(content));

  if (records.length === 0) {
    console.error('✗ El archivo no tiene filas (¿le falta el encabezado?).');
    process.exitCode = 1;
    return;
  }

  const parsedRows: ImportRow[] = [];
  const rowErrors: string[] = [];
  records.forEach((record, i) => {
    const result = parseRow(record, i + 2); // +2: fila 1 es el encabezado, y las planillas arrancan en 1
    if (result.ok) parsedRows.push(result.row);
    else rowErrors.push(...result.errors);
  });

  if (rowErrors.length > 0) {
    console.error(`\n✗ ${rowErrors.length} error(es) en la planilla — no se escribió nada:\n`);
    for (const error of rowErrors) console.error(`  - ${error}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  const grouped = groupByProduct(parsedRows);
  if (!grouped.ok) {
    console.error(`\n✗ ${grouped.errors.length} error(es) — no se escribió nada:\n`);
    for (const error of grouped.errors) console.error(`  - ${error}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  const db = getDb();

  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  const missingCategories = [...new Set(grouped.groups.map((g) => g.categoriaSlug))].filter(
    (slug) => !categoryIdBySlug.has(slug),
  );
  if (missingCategories.length > 0) {
    console.error(
      `\n✗ ${missingCategories.length} categoría(s) no existen todavía — creálas en /admin/categorias primero:\n`,
    );
    for (const slug of missingCategories) console.error(`  - ${slug}`);
    console.error('');
    await closePool();
    process.exitCode = 1;
    return;
  }

  const variantCount = grouped.groups.reduce((sum, g) => sum + g.variantes.length, 0);
  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}${grouped.groups.length} producto(s), ${variantCount} variante(s) — ` +
      `${dryRun ? 'no se escribe nada.' : 'escribiendo…'}\n`,
  );

  if (dryRun) {
    for (const group of grouped.groups) {
      console.log(`  · ${group.slug} — ${group.nombre} (${group.variantes.length} variante(s))`);
    }
    console.log('');
    await closePool();
    return;
  }

  for (const group of grouped.groups) {
    const categoryId = categoryIdBySlug.get(group.categoriaSlug)!;

    await db
      .insert(products)
      .values({
        slug: group.slug,
        name: group.nombre,
        description: group.descripcion,
        categoryId,
        brand: group.marca,
        ivaRate: group.iva,
        isActive: true,
        publishedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          name: group.nombre,
          description: group.descripcion,
          categoryId,
          brand: group.marca,
          ivaRate: group.iva,
        },
      });

    const productRow = (
      await db.select({ id: products.id }).from(products).where(eq(products.slug, group.slug)).limit(1)
    )[0];
    if (!productRow) throw new Error(`No pude releer el producto recién escrito: ${group.slug}`);

    for (const [index, variant] of group.variantes.entries()) {
      assertGs(variant.precioPyg, `${variant.varianteSku}.precio_pyg`);
      if (variant.precioCompararPyg !== null) {
        assertGs(variant.precioCompararPyg, `${variant.varianteSku}.precio_comparar_pyg`);
      }

      await db
        .insert(variants)
        .values({
          productId: productRow.id,
          sku: variant.varianteSku,
          label: variant.varianteEtiqueta,
          pricePyg: variant.precioPyg,
          compareAtPyg: variant.precioCompararPyg,
          onHand: variant.stock,
          position: index,
          isActive: true,
        })
        .onDuplicateKeyUpdate({
          set: {
            productId: productRow.id,
            label: variant.varianteEtiqueta,
            pricePyg: variant.precioPyg,
            compareAtPyg: variant.precioCompararPyg,
            position: index,
            // Igual que seed.ts: reimportar no pisa el stock real salvo que
            // se pida. Acá no hay --reset-stock porque un import es catálogo
            // nuevo, no un reseed de demo — si el stock cambió de verdad, se
            // ajusta desde /admin/productos con motivo, auditado.
            onHand: sql`${variants.onHand}`,
          },
        });
    }
  }

  console.log(`✓ ${grouped.groups.length} producto(s), ${variantCount} variante(s) importados.\n`);
  await closePool();
}

if (process.argv[1] && /import-productos\.ts$/.test(process.argv[1])) {
  main().catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
}
