import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCatalog,
  getCategoryProducts,
  getProductBySlug,
  getProductsBySlugs,
} from "@/db/queries";
import { orders, products, stockReservations, variants } from "@/db/schema";
import {
  saveVariant,
  updateProduct,
  type ProductWrite,
} from "@/domain/admin-products";
import { priceCart } from "@/domain/cart";
import { createOrder } from "@/domain/create-order";
import { countUnpricedSellableVariants } from "@/domain/launch-checks";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import {
  createCategory,
  createProduct,
  createVariant,
} from "../helpers/factories";

/**
 * Un precio que se cobra es un entero mayor que cero (docs/TEMPLATE-IMPROVEMENT-PLAN.md A1).
 *
 * `price_pyg` acepta 0 a propósito: un borrador sin publicar o un producto
 * de consulta todavía no tiene precio. Lo que no puede pasar es que ese 0
 * llegue a un carrito, a un pedido o a la vidriera como "₲ 0". Las filas
 * viejas que ya están así en la base se cubren en la lectura (carrito y
 * catálogo), no sólo al guardar.
 */
describe.skipIf(!hasTestDb)("precios que se pueden cobrar", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("WHATSAPP_NUMBER", "");
    await resetTables();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeTestDb();
  });

  async function slugOf(productId: number): Promise<string> {
    const row = (
      await getTestDb()
        .select({ slug: products.slug })
        .from(products)
        .where(eq(products.id, productId))
    )[0];
    if (!row) throw new Error("no pude releer el producto");
    return row.slug;
  }

  it("el carrito no cobra una variante publicada con precio 0 (fila vieja)", async () => {
    const variantId = await createVariant({ onHand: 5, pricePyg: 0 });

    const cart = await priceCart([{ variantId, qty: 1 }]);

    expect(cart.lines).toHaveLength(0);
    expect(cart.subtotalPyg).toBe(0);
    expect(cart.issues).toEqual([
      expect.objectContaining({ type: "no_disponible", variantId }),
    ]);
  });

  it("un pedido no se crea por ₲0 ni reserva stock", async () => {
    const variantId = await createVariant({ onHand: 5, pricePyg: 0 });

    await expect(
      createOrder({
        items: [{ variantId, qty: 1 }],
        customerName: "Test Buyer",
        customerPhone: "0981123456",
        docType: "NINGUNO",
        isConsumidorFinal: true,
        shipCity: "Asunción",
        shipAddress: "Test 123",
        paymentMethod: "contra_entrega",
      })
    ).rejects.toThrow();
    expect(await getTestDb().select().from(orders)).toHaveLength(0);
    expect(await getTestDb().select().from(stockReservations)).toHaveLength(0);
  });

  describe("el panel no deja publicar a la venta sin precio", () => {
    async function productoPublicado() {
      const categoryId = await createCategory();
      const productId = await createProduct(categoryId);
      const slug = await slugOf(productId);
      const input: ProductWrite = {
        slug,
        name: "Producto",
        description: null,
        categoryId,
        brand: null,
        ivaRate: 10,
        isActive: true,
        published: true,
        saleMode: "stock",
      };
      return { productId, input };
    }

    it("rechaza una variante activa con precio 0 en un producto publicado con stock", async () => {
      const { productId } = await productoPublicado();

      await expect(
        saveVariant(productId, {
          sku: "CERO-1",
          label: "Única",
          pricePyg: 0,
          compareAtPyg: null,
          isActive: true,
        })
      ).rejects.toMatchObject({ code: "adminError.producto.precioCero" });
      expect(
        await getTestDb()
          .select()
          .from(variants)
          .where(eq(variants.sku, "CERO-1"))
      ).toHaveLength(0);
    });

    it("permite 0 mientras sea borrador, variante apagada o modo consulta", async () => {
      const { productId, input } = await productoPublicado();

      // Variante apagada: no se vende, puede esperar su precio.
      await saveVariant(productId, {
        sku: "APAGADA-1",
        label: "Apagada",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: false,
      });

      // Borrador: el producto entero todavía no está a la venta.
      await updateProduct(productId, { ...input, published: false });
      await saveVariant(productId, {
        sku: "BORRADOR-1",
        label: "Borrador",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: true,
      });

      // Consulta: publicado, pero no se compra en el carrito.
      await updateProduct(productId, {
        ...input,
        saleMode: "enquiry",
        showPrice: false,
      });

      expect(
        await getTestDb()
          .select({ sku: variants.sku })
          .from(variants)
          .where(eq(variants.productId, productId))
      ).toHaveLength(2);
    });

    it("no deja publicar (ni pasar a stock) un producto con una variante activa en 0", async () => {
      const { productId, input } = await productoPublicado();
      await updateProduct(productId, { ...input, published: false });
      await saveVariant(productId, {
        sku: "CERO-2",
        label: "Única",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: true,
      });

      await expect(updateProduct(productId, input)).rejects.toMatchObject({
        code: "adminError.producto.precioCero",
      });

      // Lo mismo si ya está publicado como consulta y se lo pasa a stock.
      await updateProduct(productId, {
        ...input,
        saleMode: "enquiry",
        showPrice: false,
      });
      await expect(
        updateProduct(productId, { ...input, saleMode: "stock" })
      ).rejects.toMatchObject({ code: "adminError.producto.precioCero" });

      const row = (
        await getTestDb()
          .select({ saleMode: products.saleMode })
          .from(products)
          .where(eq(products.id, productId))
      )[0];
      expect(row?.saleMode).toBe("enquiry");
    });
  });

  describe("la vidriera no muestra ni vende ₲0", () => {
    it("una variante en 0 no figura disponible y no entra en el orden por precio", async () => {
      const categoryId = await createCategory("precios");
      const gratis = await createProduct(categoryId);
      await createVariant({ productId: gratis, onHand: 5, pricePyg: 0 });
      const caro = await createProduct(categoryId);
      await createVariant({ productId: caro, onHand: 5, pricePyg: 90_000 });

      const detail = await getProductBySlug(await slugOf(gratis));
      expect(detail?.variants[0]?.available).toBe(0);

      const ascending = await getCategoryProducts({
        categorySlug: "precios",
        sort: "precio-asc",
      });
      expect(ascending.products[0]?.id).toBe(caro);

      // "Hasta ₲50.000" no puede devolver un producto sin precio.
      const barato = await getCategoryProducts({
        categorySlug: "precios",
        maxPricePyg: 50_000,
      });
      expect(barato.products.map((product) => product.id)).not.toContain(
        gratis
      );
    });

    it.each(["enquiry", "showcase"] as const)(
      "%s no publica cuántas unidades hay en depósito",
      async (saleMode) => {
        const productId = await createProduct();
        await createVariant({ productId, onHand: 7, pricePyg: 50_000 });
        await getTestDb()
          .update(products)
          .set({ saleMode })
          .where(eq(products.id, productId));
        const slug = await slugOf(productId);

        const detail = await getProductBySlug(slug);
        const [fromCatalog] = await getCatalog();
        const [fromSlugs] = await getProductsBySlugs([slug]);

        expect(detail?.variants[0]?.available).toBe(0);
        expect(fromCatalog?.variants[0]?.available).toBe(0);
        expect(fromSlugs?.variants[0]?.available).toBe(0);
      }
    );
  });

  it("el panel cuenta las filas viejas que quedaron a la venta sin precio", async () => {
    const categoryId = await createCategory();
    const enVenta = await createProduct(categoryId);
    await createVariant({ productId: enVenta, onHand: 5, pricePyg: 0 });
    await createVariant({ productId: enVenta, onHand: 5, pricePyg: 10_000 });

    // No cuentan: borrador, consulta, ni variante apagada.
    const borrador = await createProduct(categoryId);
    await createVariant({ productId: borrador, onHand: 5, pricePyg: 0 });
    await getTestDb()
      .update(products)
      .set({ publishedAt: null })
      .where(eq(products.id, borrador));
    const consulta = await createProduct(categoryId);
    await createVariant({ productId: consulta, onHand: 5, pricePyg: 0 });
    await getTestDb()
      .update(products)
      .set({ saleMode: "enquiry" })
      .where(eq(products.id, consulta));
    const apagada = await createVariant({
      productId: enVenta,
      onHand: 5,
      pricePyg: 0,
    });
    await getTestDb()
      .update(variants)
      .set({ isActive: false })
      .where(eq(variants.id, apagada));

    expect(await countUnpricedSellableVariants()).toBe(1);
  });
});
