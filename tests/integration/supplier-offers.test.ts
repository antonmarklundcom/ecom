import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCatalog,
  getCategoryProducts,
  getFeaturedProducts,
  getFeedProducts,
  getProductBySlug,
  getProductsBySlugs,
  getSitemapEntries,
  searchProducts,
} from "@/db/queries";
import { categories, products, supplierOffers, variants } from "@/db/schema";
import { duplicateProduct } from "@/domain/admin-bulk";
import { getAdminProduct, updateProduct } from "@/domain/admin-products";
import {
  deleteSupplierOffer,
  listSupplierOffers,
  saveSupplierOffer,
  type SupplierOfferInput,
} from "@/domain/supplier-offers";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import {
  createAdminUser,
  createCategory,
  createProduct,
  createVariant,
} from "../helpers/factories";

/**
 * Proveedores (ofertas por variante y enlace de compra del producto): el
 * dominio del panel, la cascada, y —lo que más importa— que **ninguna**
 * consulta pública los devuelva, ni con datos cargados.
 */

const mocks = vi.hoisted(() => ({
  session: {
    userId: 0,
    role: "owner",
    email: "duenio@tienda.test",
    sessionVersion: 1,
  },
  proveedores: false,
}));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  getSession: async () => mocks.session,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/proveedores", () => ({
  proveedoresHabilitados: () => mocks.proveedores,
}));

const URL_COMPRA = "https://proveedor-secreto.test/compra/123";
const URL_OFERTA = "https://mayorista-secreto.test/ficha/abc";
const COSTO = 987_654_321;
const PROVEEDOR = "Mayorista Secreto SRL";

function oferta(
  productId: number,
  variantId: number,
  extra: Partial<SupplierOfferInput> = {}
): SupplierOfferInput {
  return {
    productId,
    variantId,
    unitCostPyg: 40_000,
    source: "Proveedor A",
    sourceType: "local",
    productUrl: null,
    supplierUrl: null,
    supplierStock: null,
    checkedOn: null,
    notes: null,
    isConfirmed: true,
    isActive: true,
    isPreferred: false,
    ...extra,
  };
}

async function productoConVariante() {
  const productId = await createProduct();
  const variantId = await createVariant({ productId, onHand: 5 });
  return { productId, variantId };
}

async function escritura(productId: number) {
  const product = (await getAdminProduct(productId))!.product;
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    brand: product.brand,
    ivaRate: product.ivaRate,
    isActive: product.isActive,
    published: product.publishedAt !== null,
  };
}

describe.skipIf(!hasTestDb)("ofertas de proveedores (panel)", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it("alta, edición y una sola preferida por variante", async () => {
    const { productId, variantId } = await productoConVariante();
    const a = await saveSupplierOffer(
      oferta(productId, variantId, { isPreferred: true, checkedOn: "2026-10-08" })
    );
    const b = await saveSupplierOffer(
      oferta(productId, variantId, {
        source: "Proveedor B",
        unitCostPyg: 35_000,
        productUrl: URL_OFERTA,
        isPreferred: true,
      })
    );

    const filas = await listSupplierOffers([variantId]);
    expect(filas.map((f) => [f.id, f.isPreferred])).toEqual([
      [a, false],
      [b, true],
    ]);
    // La fecha es el día paraguayo: medianoche de Asunción, en UTC.
    expect(filas[0]!.checkedAt?.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(filas[1]!.productUrl).toBe(URL_OFERTA);

    await saveSupplierOffer(
      oferta(productId, variantId, { offerId: a, unitCostPyg: 30_000, notes: "  caja x12  " })
    );
    const [editada] = await listSupplierOffers([variantId]);
    expect(editada).toMatchObject({ id: a, unitCostPyg: 30_000, notes: "caja x12" });
  });

  it("rechaza enlaces que no son https o llevan credenciales, y una preferida sin costo", async () => {
    const { productId, variantId } = await productoConVariante();
    for (const productUrl of [
      "http://proveedor.test/x",
      "javascript:alert(1)",
      "https://user:pass@proveedor.test/x",
    ]) {
      await expect(
        saveSupplierOffer(oferta(productId, variantId, { productUrl }))
      ).rejects.toThrow();
    }
    await expect(
      saveSupplierOffer(
        oferta(productId, variantId, { unitCostPyg: null, isPreferred: true })
      )
    ).rejects.toThrow();
    await expect(
      saveSupplierOffer(oferta(productId, variantId, { unitCostPyg: 10.5 }))
    ).rejects.toThrow();
    expect(await listSupplierOffers([variantId])).toEqual([]);
  });

  it("una oferta no se edita ni se borra desde otra variante u otro producto", async () => {
    const uno = await productoConVariante();
    const otro = await productoConVariante();
    const id = await saveSupplierOffer(oferta(uno.productId, uno.variantId));

    await expect(
      saveSupplierOffer(oferta(otro.productId, otro.variantId, { offerId: id }))
    ).rejects.toThrow();
    // La variante de un producto con el id de otro.
    await expect(
      saveSupplierOffer(oferta(otro.productId, uno.variantId))
    ).rejects.toThrow();
    await expect(
      deleteSupplierOffer({ productId: otro.productId, variantId: otro.variantId, offerId: id })
    ).rejects.toThrow();

    await deleteSupplierOffer({ productId: uno.productId, variantId: uno.variantId, offerId: id });
    expect(await listSupplierOffers([uno.variantId])).toEqual([]);
  });

  it("borrar la variante borra sus ofertas (cascade), y no las de otra", async () => {
    const { productId, variantId } = await productoConVariante();
    const otra = await createVariant({ productId, onHand: 1 });
    await saveSupplierOffer(oferta(productId, variantId));
    await saveSupplierOffer(oferta(productId, otra));

    const db = getTestDb();
    await db.delete(variants).where(eq(variants.id, variantId));
    const quedan = await db.select().from(supplierOffers);
    expect(quedan.map((fila) => fila.variantId)).toEqual([otra]);

    // Y borrar el producto se lleva todo (producto → variantes → ofertas).
    await db.delete(products).where(eq(products.id, productId));
    expect(await db.select().from(supplierOffers)).toEqual([]);
  });

  it("el enlace de compra y el orden de destacados: ausente no se toca, null borra", async () => {
    const { productId } = await productoConVariante();
    await updateProduct(productId, {
      ...(await escritura(productId)),
      supplierUrl: URL_COMPRA,
      featuredPosition: 3,
    });
    let fila = (await getAdminProduct(productId))!.product;
    expect(fila.supplierUrl).toBe(URL_COMPRA);
    expect(fila.featuredPosition).toBe(3);

    // Un formulario que no manda los campos (el flag apagado) no los borra.
    await updateProduct(productId, await escritura(productId));
    fila = (await getAdminProduct(productId))!.product;
    expect(fila.supplierUrl).toBe(URL_COMPRA);
    expect(fila.featuredPosition).toBe(3);

    await updateProduct(productId, { ...(await escritura(productId)), supplierUrl: null });
    expect((await getAdminProduct(productId))!.product.supplierUrl).toBeNull();

    await expect(
      updateProduct(productId, {
        ...(await escritura(productId)),
        supplierUrl: "http://inseguro.test",
      })
    ).rejects.toThrow();
  });

  it("duplicar copia el enlace de compra pero no las ofertas", async () => {
    const { productId, variantId } = await productoConVariante();
    await getTestDb()
      .update(products)
      .set({ supplierUrl: URL_COMPRA, featuredPosition: 2, isFeatured: true })
      .where(eq(products.id, productId));
    await saveSupplierOffer(oferta(productId, variantId));

    const copia = await duplicateProduct(productId);
    const { product, variants: copias } = (await getAdminProduct(copia))!;
    expect(product.supplierUrl).toBe(URL_COMPRA);
    expect(product.isFeatured).toBe(false);
    expect(await listSupplierOffers(copias.map((v) => v.id))).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)("acciones de proveedores", () => {
  beforeEach(async () => {
    await resetTables();
    mocks.session.userId = await createAdminUser();
    mocks.session.role = "owner";
    mocks.proveedores = false;
  });
  afterAll(closeTestDb);

  it("con el flag apagado no escriben nada", async () => {
    const { saveProduct, saveVariantSupplierOffer } = await import(
      "@/app/actions/admin-products"
    );
    const { productId, variantId } = await productoConVariante();

    const result = await saveVariantSupplierOffer(oferta(productId, variantId));
    expect(result.ok).toBe(false);
    expect(await getTestDb().select().from(supplierOffers)).toEqual([]);

    // `saveProduct` descarta el enlace de compra en vez de guardarlo.
    expect(
      await saveProduct({
        ...(await escritura(productId)),
        productId,
        description: "producto de prueba",
        brand: "",
        supplierUrl: URL_COMPRA,
      })
    ).toMatchObject({ ok: true });
    expect((await getAdminProduct(productId))!.product.supplierUrl).toBeNull();
  });

  it("con el flag prendido guardan, y el vendedor no puede", async () => {
    mocks.proveedores = true;
    const { saveProduct, saveVariantSupplierOffer, deleteVariantSupplierOffer } =
      await import("@/app/actions/admin-products");
    const { productId, variantId } = await productoConVariante();

    const result = await saveVariantSupplierOffer(oferta(productId, variantId));
    expect(result).toMatchObject({ ok: true });
    const [fila] = await getTestDb().select().from(supplierOffers);
    expect(fila?.variantId).toBe(variantId);

    expect(
      await saveProduct({
        ...(await escritura(productId)),
        productId,
        description: "producto de prueba",
        brand: "",
        supplierUrl: URL_COMPRA,
      })
    ).toMatchObject({ ok: true });
    expect((await getAdminProduct(productId))!.product.supplierUrl).toBe(URL_COMPRA);

    // Un enlace http marca el campo, no un error genérico.
    expect(
      await saveVariantSupplierOffer(
        oferta(productId, variantId, { productUrl: "http://inseguro.test" })
      )
    ).toMatchObject({ ok: false, fields: { productUrl: expect.any(String) } });

    mocks.session.userId = await createAdminUser({ role: "vendedor" });
    mocks.session.role = "vendedor";
    expect(
      await deleteVariantSupplierOffer({ productId, variantId, offerId: fila!.id })
    ).toMatchObject({ ok: false });
    expect(await getTestDb().select().from(supplierOffers)).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDb)("la vidriera no ve datos de proveedores", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  const MARCAS = [
    URL_COMPRA,
    URL_OFERTA,
    String(COSTO),
    PROVEEDOR,
    "proveedor-secreto",
    "mayorista-secreto",
  ];
  function sinMarcas(etiqueta: string, valor: unknown) {
    const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
    for (const marca of MARCAS) expect(texto, etiqueta).not.toContain(marca);
  }

  it("ninguna consulta pública, ni el feed, ni el sitemap los devuelve", async () => {
    const categoryId = await createCategory("termos");
    const productId = await createProduct(categoryId);
    const variantId = await createVariant({ productId, onHand: 4 });
    const db = getTestDb();
    await db
      .update(products)
      .set({
        slug: "termo-secreto",
        name: "Termo de acero",
        supplierUrl: URL_COMPRA,
        isFeatured: true,
      })
      .where(eq(products.id, productId));
    await saveSupplierOffer({
      ...oferta(productId, variantId),
      source: PROVEEDOR,
      unitCostPyg: COSTO,
      productUrl: URL_OFERTA,
      supplierUrl: URL_OFERTA,
      supplierStock: 4242,
      isPreferred: true,
    });

    const [categoria] = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, categoryId));

    const catalogo = await getCatalog();
    expect(catalogo.map((p) => p.id)).toEqual([productId]);
    sinMarcas("getCatalog", catalogo);
    sinMarcas("getFeaturedProducts", await getFeaturedProducts());
    sinMarcas(
      "getCategoryProducts",
      await getCategoryProducts({ categorySlug: categoria!.slug })
    );
    const ficha = await getProductBySlug("termo-secreto");
    expect(ficha?.id).toBe(productId);
    sinMarcas("getProductBySlug", ficha);
    sinMarcas("getProductsBySlugs", await getProductsBySlugs(["termo-secreto"]));
    sinMarcas("searchProducts", await searchProducts("Termo"));
    sinMarcas("getSitemapEntries", await getSitemapEntries());
    const feed = await getFeedProducts();
    expect(feed.map((p) => p.id)).toEqual([productId]);
    sinMarcas("getFeedProducts", feed);

    // Las respuestas HTTP de verdad, no sólo las consultas.
    const { GET } = await import("@/app/feed.xml/route");
    const respuesta = await GET();
    sinMarcas("/feed.xml", await respuesta.text());
    const { default: sitemap } = await import("@/app/sitemap");
    sinMarcas("/sitemap.xml", await sitemap());
  });

  it("los destacados siguen el orden elegido; sin tocarlo, el de siempre", async () => {
    const categoryId = await createCategory();
    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await createProduct(categoryId);
      await createVariant({ productId: id, onHand: 1 });
      // Fechas de publicación distintas y crecientes: el más nuevo es el último.
      await getTestDb()
        .update(products)
        .set({ isFeatured: true, publishedAt: new Date(Date.UTC(2026, 0, i + 1)) })
        .where(eq(products.id, id));
      ids.push(id);
    }
    const [a, b, c] = ids as [number, number, number];

    // Todos en 0: el orden de antes de la columna (publicados más nuevos primero).
    expect((await getFeaturedProducts(8)).map((p) => p.id)).toEqual([c, b, a]);

    const db = getTestDb();
    await db.update(products).set({ featuredPosition: 1 }).where(eq(products.id, a));
    await db.update(products).set({ featuredPosition: 2 }).where(eq(products.id, c));
    // b queda en 0 (primero); después a (1) y c (2).
    expect((await getFeaturedProducts(8)).map((p) => p.id)).toEqual([b, a, c]);
  });
});
