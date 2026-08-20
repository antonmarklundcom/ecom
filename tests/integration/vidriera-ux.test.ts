import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { categories, products, variants } from '@/db/schema';
import { getBrands, getRelatedProducts } from '@/db/queries';
import { reserveStock } from '@/domain/stock';

import { closeTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createCategory, createOrder, createProduct, createVariant } from '../helpers/factories';

/**
 * UX de la vidriera (PLAN.md FASE 2, PR M y N).
 *
 * Las dos consultas nuevas tienen la misma trampa: el stock que se ve no es
 * `on_hand`, es `on_hand` menos las reservas vigentes. Un "también te puede
 * interesar" lleno de productos que en realidad están reservados manda a la
 * ficha a leer "sin stock", que es peor que no mostrar nada.
 */

async function conMarca(categoryId: number, brand: string): Promise<number> {
  const id = await createProduct(categoryId);
  await getDb().update(products).set({ brand }).where(eq(products.id, id));
  return id;
}

describe.skipIf(!hasTestDb)('productos relacionados', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('trae de la misma categoría, con stock, sin el actual', async () => {
    const categoryId = await createCategory();
    const actual = await createProduct(categoryId);
    const vecino = await createProduct(categoryId);
    await createVariant({ onHand: 5, productId: vecino });

    // De otra categoría: no tiene que aparecer.
    const otro = await createProduct(await createCategory());
    await createVariant({ onHand: 5, productId: otro });

    const related = await getRelatedProducts({
      categorySlug: await categorySlugDe(vecino),
      excludeProductId: actual,
    });

    expect(related.map((product) => product.id)).toEqual([vecino]);
  });

  it('descuenta las reservas vigentes: lo reservado no se recomienda', async () => {
    const categoryId = await createCategory();
    const actual = await createProduct(categoryId);
    const vecino = await createProduct(categoryId);
    const variantId = await createVariant({ onHand: 2, productId: vecino });
    const slug = await categorySlugDe(vecino);

    expect(
      (await getRelatedProducts({ categorySlug: slug, excludeProductId: actual })).map((p) => p.id),
    ).toEqual([vecino]);

    const orderId = await createOrder();
    await reserveStock(orderId, [{ variantId, qty: 2 }], {
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    expect(await getRelatedProducts({ categorySlug: slug, excludeProductId: actual })).toEqual([]);
  });

  it('un producto sin variantes activas no se recomienda', async () => {
    const categoryId = await createCategory();
    const actual = await createProduct(categoryId);
    const vecino = await createProduct(categoryId);
    const variantId = await createVariant({ onHand: 5, productId: vecino });
    await getDb().update(variants).set({ isActive: false }).where(eq(variants.id, variantId));

    const slug = await categorySlugDe(vecino);
    expect(await getRelatedProducts({ categorySlug: slug, excludeProductId: actual })).toEqual([]);
  });

  it('respeta el límite pedido', async () => {
    const categoryId = await createCategory();
    const actual = await createProduct(categoryId);
    for (let i = 0; i < 5; i += 1) {
      const vecino = await createProduct(categoryId);
      await createVariant({ onHand: 3, productId: vecino });
    }

    const slug = await categorySlugDe(actual);
    const related = await getRelatedProducts({
      categorySlug: slug,
      excludeProductId: actual,
      limit: 2,
    });
    expect(related).toHaveLength(2);
  });
});

describe.skipIf(!hasTestDb)('contadores por marca', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('cuenta los productos publicados de cada marca, en orden alfabético', async () => {
    const categoryId = await createCategory();
    await conMarca(categoryId, 'Acme');
    await conMarca(categoryId, 'Acme');
    await conMarca(categoryId, 'Zeta');

    const slug = await categorySlugDe(await conMarca(categoryId, 'Acme'));
    expect(await getBrands(slug)).toEqual([
      { brand: 'Acme', count: 3 },
      { brand: 'Zeta', count: 1 },
    ]);
  });

  it('no cuenta lo despublicado ni lo que no tiene marca', async () => {
    const categoryId = await createCategory();
    await conMarca(categoryId, 'Acme');
    const escondido = await conMarca(categoryId, 'Acme');
    await getDb().update(products).set({ publishedAt: null }).where(eq(products.id, escondido));
    // Sin marca: no aparece en el filtro.
    const sinMarca = await createProduct(categoryId);

    const slug = await categorySlugDe(sinMarca);
    expect(await getBrands(slug)).toEqual([{ brand: 'Acme', count: 1 }]);
  });
});

/** El slug de la categoría de un producto, para no adivinarlo en cada test. */
async function categorySlugDe(productId: number): Promise<string> {
  const rows = await getDb()
    .select({ slug: categories.slug })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, productId))
    .limit(1);

  const slug = rows[0]?.slug;
  if (!slug) throw new Error('sin categoría');
  return slug;
}
