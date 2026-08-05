import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { categories, products, variants } from '@/db/schema';

import type { Executor } from '@/domain/executor';
import { heldQtyMap } from '@/domain/stock';

export type CatalogVariant = {
  id: number;
  sku: string;
  label: string;
  pricePyg: number;
  compareAtPyg: number | null;
  available: number;
};

export type CatalogProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string | null;
  ivaRate: number;
  categoryName: string;
  categorySlug: string;
  variants: CatalogVariant[];
};

/**
 * Catálogo publicado con disponibilidad en vivo
 * (`on_hand − reservas held vigentes`), en dos queries.
 */
export async function getCatalog(
  options: { categorySlug?: string; limit?: number } = {},
  executor?: Executor,
): Promise<CatalogProduct[]> {
  const tx = executor ?? getDb();

  const productRows = await tx
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brand: products.brand,
      ivaRate: products.ivaRate,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.isActive, true),
        isNotNull(products.publishedAt),
        options.categorySlug ? eq(categories.slug, options.categorySlug) : undefined,
      ),
    )
    .orderBy(asc(categories.position), asc(products.name))
    .limit(options.limit ?? 100);

  if (productRows.length === 0) return [];

  const variantRows = await tx
    .select({
      id: variants.id,
      productId: variants.productId,
      sku: variants.sku,
      label: variants.label,
      pricePyg: variants.pricePyg,
      compareAtPyg: variants.compareAtPyg,
      onHand: variants.onHand,
    })
    .from(variants)
    .where(
      and(
        eq(variants.isActive, true),
        inArray(
          variants.productId,
          productRows.map((product) => product.id),
        ),
      ),
    )
    .orderBy(asc(variants.productId), asc(variants.position));

  // Disponibilidad en vivo: on_hand − reservas held vigentes.
  const held = await heldQtyMap(
    variantRows.map((row) => row.id),
    tx,
  );

  const byProduct = new Map<number, CatalogVariant[]>();
  for (const row of variantRows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      label: row.label,
      pricePyg: row.pricePyg,
      compareAtPyg: row.compareAtPyg,
      available: Math.max(0, row.onHand - (held.get(row.id) ?? 0)),
    });
    byProduct.set(row.productId, list);
  }

  return productRows.map((product) => ({ ...product, variants: byProduct.get(product.id) ?? [] }));
}

export async function getCategories(executor?: Executor) {
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position));
}
