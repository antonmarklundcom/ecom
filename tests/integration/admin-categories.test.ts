import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { categories, products } from '@/db/schema';
import { getCatalog, getCategories, getProductBySlug, searchProducts } from '@/db/queries';
import {
  AdminCategoryError,
  createCategory,
  listAdminCategories,
  moveCategory,
  setCategoryActive,
  updateCategory,
} from '@/domain/admin-categories';
import { priceCart } from '@/domain/cart';

import { closeTestDb, getTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createProduct, createVariant } from '../helpers/factories';

/**
 * `/admin/categorias` (PLAN.md FASE 2, PR J).
 *
 * Hasta este PR la tabla la escribía sólo el seed. Lo que se prueba acá son
 * las dos cosas que un formulario no puede garantizar: que el orden del menú
 * quede consistente aunque dos personas lo toquen, y que "categoría apagada"
 * signifique **una sola cosa** en toda la vidriera.
 */

describe.skipIf(!hasTestDb)('ABM de categorías', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('crea derivando el enlace del nombre y lo pone al final del orden', async () => {
    const primera = await createCategory({ name: 'Electrónica' });
    const segunda = await createCategory({ name: 'Hogar y Cocina' });

    const rows = await listAdminCategories();
    expect(rows.map((row) => row.slug)).toEqual(['electronica', 'hogar-y-cocina']);
    expect(rows.map((row) => row.position)).toEqual([0, 1]);
    expect(primera).toBeGreaterThan(0);
    expect(segunda).toBeGreaterThan(primera);
  });

  it('no deja dos categorías con el mismo enlace', async () => {
    await createCategory({ name: 'Moda' });
    await expect(createCategory({ name: 'MODA' })).rejects.toThrow(AdminCategoryError);
  });

  it('rechaza un nombre del que no sale una URL', async () => {
    await expect(createCategory({ name: '!!!' })).rejects.toThrow(AdminCategoryError);
  });

  it('renombrar no toca el enlace si no se lo pide', async () => {
    const id = await createCategory({ name: 'Deportes' });
    await updateCategory(id, { name: 'Deportes y aire libre', slug: 'deportes' });

    const [row] = await listAdminCategories();
    expect(row).toMatchObject({ name: 'Deportes y aire libre', slug: 'deportes' });
  });

  it('subir y bajar reordena el menú, y en la punta no hace nada', async () => {
    const uno = await createCategory({ name: 'Uno' });
    await createCategory({ name: 'Dos' });
    const tres = await createCategory({ name: 'Tres' });

    await moveCategory(tres, 'arriba');
    expect((await listAdminCategories()).map((row) => row.name)).toEqual(['Uno', 'Tres', 'Dos']);

    await moveCategory(uno, 'arriba');
    expect((await listAdminCategories()).map((row) => row.name)).toEqual(['Uno', 'Tres', 'Dos']);

    await moveCategory(uno, 'abajo');
    expect((await listAdminCategories()).map((row) => row.name)).toEqual(['Tres', 'Uno', 'Dos']);
  });

  /**
   * Las posiciones que deja el seed pueden venir empatadas. Un swap de a pares
   * sobre empates no mueve nada y el botón queda "roto" sin error; por eso
   * `moveCategory` reescribe el orden completo.
   */
  it('reordena aunque las posiciones vengan empatadas', async () => {
    const db = getTestDb();
    const uno = await createCategory({ name: 'Uno' });
    const dos = await createCategory({ name: 'Dos' });
    await db.update(categories).set({ position: 0 }).where(eq(categories.id, uno));
    await db.update(categories).set({ position: 0 }).where(eq(categories.id, dos));

    // Empatadas en 0, el orden que se muestra lo desempata el nombre: Dos, Uno.
    expect((await listAdminCategories()).map((row) => row.name)).toEqual(['Dos', 'Uno']);

    await moveCategory(dos, 'abajo');

    const despues = await listAdminCategories();
    expect(despues.map((row) => row.name)).toEqual(['Uno', 'Dos']);
    // Y quedaron con posiciones propias: el empate no vuelve a decidir nada.
    expect(despues.map((row) => row.position)).toEqual([0, 1]);
  });

  it('cuenta los productos de adentro, y cuáles se ven', async () => {
    const db = getTestDb();
    const id = await createCategory({ name: 'Moda' });
    await createProduct(id);
    const escondido = await createProduct(id);
    await db.update(products).set({ publishedAt: null }).where(eq(products.id, escondido));

    const [row] = await listAdminCategories();
    expect(row).toMatchObject({ productCount: 2, visibleCount: 1 });
  });
});

describe.skipIf(!hasTestDb)('una categoría apagada esconde sus productos', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  /**
   * El bug que este comportamiento cierra: antes, apagar la categoría sacaba
   * el link del menú y 404-eaba su página, pero sus productos seguían en la
   * home y en el buscador, con una miga de pan que apuntaba a la categoría que
   * ya no existía.
   */
  it('sale del catálogo, del buscador y de su propia ficha', async () => {
    const db = getTestDb();
    const id = await createCategory({ name: 'Moda' });
    const productId = await createProduct(id);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    const slug = product!.slug;

    expect((await getCatalog()).map((row) => row.slug)).toContain(slug);
    expect(await getProductBySlug(slug)).not.toBeNull();

    await setCategoryActive(id, false);

    expect(await getCategories()).toEqual([]);
    expect((await getCatalog()).map((row) => row.slug)).not.toContain(slug);
    expect((await searchProducts(slug.slice(0, 6))).map((row) => row.slug)).not.toContain(slug);
    expect(await getProductBySlug(slug)).toBeNull();
  });

  it('el carrito guardado la semana pasada tampoco la puede comprar', async () => {
    const id = await createCategory({ name: 'Moda' });
    const productId = await createProduct(id);
    const variantId = await createVariant({ onHand: 10, productId });

    const antes = await priceCart([{ variantId, qty: 1 }]);
    expect(antes.lines).toHaveLength(1);

    await setCategoryActive(id, false);

    const despues = await priceCart([{ variantId, qty: 1 }]);
    expect(despues.lines).toEqual([]);
    expect(despues.issues[0]).toMatchObject({ type: 'no_disponible', variantId });
  });

  it('reactivarla devuelve todo como estaba, sin tocar los productos', async () => {
    const id = await createCategory({ name: 'Moda' });
    const productId = await createProduct(id);
    const db = getTestDb();
    const [antes] = await db.select().from(products).where(eq(products.id, productId));

    await setCategoryActive(id, false);
    await setCategoryActive(id, true);

    const [despues] = await db.select().from(products).where(eq(products.id, productId));
    expect(despues!.isActive).toBe(antes!.isActive);
    expect(despues!.publishedAt).toEqual(antes!.publishedAt);
    expect((await getCatalog()).map((row) => row.id)).toContain(productId);
  });
});
