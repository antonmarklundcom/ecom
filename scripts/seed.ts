import '@/lib/load-env';

import { eq, sql } from 'drizzle-orm';

import { closePool, getDb } from '@/db';
import { categories, products, shippingZones, variants } from '@/db/schema';
import { assertGs } from '@/lib/money';

import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_SHIPPING_ZONES } from './seed-data';

/**
 * Seed idempotente: se puede correr N veces.
 *
 * Las claves naturales son `slug` (categorías, productos, zonas) y `sku`
 * (variantes); todo entra con `ON DUPLICATE KEY UPDATE`, así que re-sembrar
 * actualiza precios y textos **sin** duplicar filas ni pisar `on_hand` de
 * variantes ya existentes… salvo que se pida con `--reset-stock`.
 */
const RESET_STOCK = process.argv.includes('--reset-stock');

/**
 * Siembra el catálogo (categorías, zonas de envío, productos y variantes).
 *
 * Exportada aparte de `main()` para que `scripts/demo.ts` pueda encadenarla
 * con la creación de pedidos de ejemplo sin levantar un segundo proceso ni
 * una segunda conexión a la base.
 */
export async function seedCatalog(resetStock: boolean = RESET_STOCK): Promise<void> {
  const db = getDb();

  // --- Categorías ---------------------------------------------------------
  for (const category of SEED_CATEGORIES) {
    await db
      .insert(categories)
      .values({ slug: category.slug, name: category.name, position: category.position })
      .onDuplicateKeyUpdate({
        set: { name: category.name, position: category.position, isActive: true },
      });
  }
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));
  console.log(`✓ ${SEED_CATEGORIES.length} categorías`);

  // --- Zonas de envío -----------------------------------------------------
  for (const zone of SEED_SHIPPING_ZONES) {
    assertGs(zone.pricePyg, `shipping_zones.${zone.slug}.price_pyg`);
    await db
      .insert(shippingZones)
      .values({
        slug: zone.slug,
        name: zone.name,
        cities: [...zone.cities],
        pricePyg: zone.pricePyg,
        freeThresholdPyg: zone.freeThresholdPyg,
        position: zone.position,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: zone.name,
          cities: [...zone.cities],
          pricePyg: zone.pricePyg,
          freeThresholdPyg: zone.freeThresholdPyg,
          position: zone.position,
          isActive: true,
        },
      });
  }
  console.log(`✓ ${SEED_SHIPPING_ZONES.length} zonas de envío`);

  // --- Productos + variantes ---------------------------------------------
  let variantCount = 0;
  const publishedAt = new Date('2026-01-15T12:00:00Z');

  for (const product of SEED_PRODUCTS) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Categoría inexistente: ${product.categorySlug} (producto ${product.slug})`);
    }

    await db
      .insert(products)
      .values({
        slug: product.slug,
        name: product.name,
        description: product.description,
        categoryId,
        brand: product.brand,
        ivaRate: product.ivaRate,
        isActive: true,
        publishedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: product.name,
          description: product.description,
          categoryId,
          brand: product.brand,
          ivaRate: product.ivaRate,
          isActive: true,
          publishedAt,
        },
      });

    const productRow = (
      await db.select({ id: products.id }).from(products).where(eq(products.slug, product.slug)).limit(1)
    )[0];
    if (!productRow) throw new Error(`No pude releer el producto ${product.slug}`);

    for (const [index, variant] of product.variants.entries()) {
      assertGs(variant.pricePyg, `${variant.sku}.price_pyg`);
      if (variant.compareAtPyg !== undefined) {
        assertGs(variant.compareAtPyg, `${variant.sku}.compare_at_pyg`);
      }

      await db
        .insert(variants)
        .values({
          productId: productRow.id,
          sku: variant.sku,
          label: variant.label,
          pricePyg: variant.pricePyg,
          compareAtPyg: variant.compareAtPyg ?? null,
          onHand: variant.onHand,
          position: index,
          isActive: true,
        })
        .onDuplicateKeyUpdate({
          set: {
            productId: productRow.id,
            label: variant.label,
            pricePyg: variant.pricePyg,
            compareAtPyg: variant.compareAtPyg ?? null,
            position: index,
            isActive: true,
            // El stock real lo maneja la operación del negocio: re-sembrar no
            // debería pisarlo salvo que se pida explícitamente.
            onHand: resetStock ? variant.onHand : sql`${variants.onHand}`,
          },
        });
      variantCount += 1;
    }
  }

  console.log(`✓ ${SEED_PRODUCTS.length} productos · ${variantCount} variantes`);
  console.log(resetStock ? '↺ stock reseteado a los valores del seed' : '· stock existente respetado (--reset-stock para pisarlo)');
}

async function main(): Promise<void> {
  await seedCatalog();
  await closePool();
}

// `scripts/demo.ts` importa `seedCatalog` sin querer correr esto de nuevo —
// sólo se ejecuta cuando `seed.ts` es el script invocado directamente.
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main().catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
}
