import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  categories,
  priceAdjustments,
  products,
  stockAdjustments,
  variants,
} from "@/db/schema";
import { listVariantsForExport, saveVariant } from "@/domain/admin-products";
import { catalogExportCsv } from "@/domain/catalog-export";
import {
  applyCatalogImportPlan,
  buildCatalogImportPlan,
} from "@/domain/catalog-import-plan";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createCategory } from "../helpers/factories";

/**
 * La planilla del proveedor contra MySQL de verdad
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md C1–C7): todo o nada, lo ausente no se
 * pisa, el export vuelve a entrar sin cambios, un SKU ajeno no se muda por
 * una mayúscula, lo nuevo entra como borrador, el precio en masa es del
 * dueño, y cada precio o stock que cambia deja su fila de auditoría.
 */

const DUENO = { actor: "admin:duenia@tienda.test", actorUserId: null };

async function aplicar(
  csv: string,
  opciones: { resetStock?: boolean; allowPriceChanges?: boolean } = {}
) {
  const plan = await buildCatalogImportPlan(csv);
  if (plan.errores.length > 0) throw new Error(plan.errores.join("\n"));
  return applyCatalogImportPlan(plan, {
    resetStock: opciones.resetStock ?? false,
    allowPriceChanges: opciones.allowPriceChanges ?? true,
    ...DUENO,
  });
}

async function variante(sku: string) {
  const row = (
    await getTestDb().select().from(variants).where(eq(variants.sku, sku))
  )[0];
  if (!row) throw new Error(`sin variante ${sku}`);
  return row;
}

async function producto(slug: string) {
  return (
    await getTestDb().select().from(products).where(eq(products.slug, slug))
  )[0];
}

/** Un producto publicado y cargado a mano, con todo lo opcional completo. */
async function productoCompleto(): Promise<{ productId: number }> {
  const db = getTestDb();
  const categoryId = await createCategory("hogar");
  await db.insert(products).values({
    slug: "taza-ceramica",
    name: "Taza cerámica",
    description: "Hecha a mano",
    brand: "Alfarería",
    ivaRate: 5,
    categoryId,
    publishedAt: new Date(),
  });
  const productId = (await producto("taza-ceramica"))!.id;
  await db.insert(variants).values([
    {
      productId,
      sku: "TAZ-S",
      label: "Chica",
      pricePyg: 50_000,
      compareAtPyg: 60_000,
      onHand: 7,
      position: 0,
    },
    {
      productId,
      sku: "TAZ-M",
      label: "Mediana",
      pricePyg: 70_000,
      compareAtPyg: 0,
      onHand: 4,
      position: 1,
    },
  ]);
  return { productId };
}

describe.skipIf(!hasTestDb)("importación de catálogo", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await resetTables();
  });
  afterAll(closeTestDb);

  it("C2: una planilla de sólo precios cambia los precios y nada más", async () => {
    await productoCompleto();

    await aplicar(
      "SKU;Producto;Categoría;Precio (₲);Slug\n" +
        "TAZ-S;Taza cerámica;Hogar;55000;taza-ceramica\n" +
        "TAZ-M;Taza cerámica;Hogar;75000;taza-ceramica\n",
      { resetStock: true }
    );

    const p = await producto("taza-ceramica");
    expect(p).toMatchObject({
      description: "Hecha a mano",
      brand: "Alfarería",
      ivaRate: 5,
    });
    expect(await variante("TAZ-S")).toMatchObject({
      label: "Chica",
      pricePyg: 55_000,
      compareAtPyg: 60_000,
      onHand: 7,
    });
    expect(await variante("TAZ-M")).toMatchObject({
      label: "Mediana",
      pricePyg: 75_000,
      compareAtPyg: 0,
      onHand: 4,
    });
  });

  it("C3: exportar e importar el mismo archivo no cambia nada (slug, ₲0 antes, etiquetas, IVA)", async () => {
    await productoCompleto();
    const antes = await getTestDb().select().from(variants);
    const productoAntes = await producto("taza-ceramica");

    const csv = catalogExportCsv(await listVariantsForExport());
    const plan = await buildCatalogImportPlan(csv);
    expect(plan.errores).toEqual([]);
    expect(plan).toMatchObject({
      productosNuevos: 0,
      variantesNuevas: 0,
      preciosCambian: 0,
    });
    await applyCatalogImportPlan(plan, {
      resetStock: false,
      allowPriceChanges: false,
      ...DUENO,
    });

    expect(await getTestDb().select().from(variants)).toEqual(antes);
    const despues = await producto("taza-ceramica");
    expect({ ...despues, updatedAt: null }).toEqual({
      ...productoAntes,
      updatedAt: null,
    });
    expect(await getTestDb().select().from(priceAdjustments)).toHaveLength(0);
  });

  it("C4: un SKU de otro producto con otra mayúscula o acento no se muda; no se escribe nada", async () => {
    await productoCompleto();

    const plan = await buildCatalogImportPlan(
      "SKU;Producto;Categoría;Precio (₲)\n" +
        "taz-s;Producto nuevo;Cocina;99000\n"
    );
    expect(plan.errores).toEqual([
      expect.stringContaining('"taz-s" ya existe en la base'),
    ]);

    // Y aunque la vista previa no lo hubiera visto (otra persona cargó el
    // SKU entre la vista previa y la confirmación), la escritura vuelve a
    // mirar bajo lock con la colación de la base y no escribe nada.
    await resetTables();
    const sinConflicto = await buildCatalogImportPlan(
      "SKU;Producto;Categoría;Precio (₲)\n" +
        "NUEVO-1;Producto uno;Cocina;10000\n" +
        "CAFÉ-1;Producto nuevo;Cocina;99000\n"
    );
    expect(sinConflicto.errores).toEqual([]);
    const otraCategoria = await createCategory("otra");
    await getTestDb().insert(products).values({
      slug: "ajeno",
      name: "Ajeno",
      categoryId: otraCategoria,
      publishedAt: new Date(),
    });
    await getTestDb()
      .insert(variants)
      .values({
        productId: (await producto("ajeno"))!.id,
        sku: "CAFE-1",
        label: "Único",
        pricePyg: 1_000,
        onHand: 1,
      });

    await expect(
      applyCatalogImportPlan(sinConflicto, {
        resetStock: false,
        allowPriceChanges: true,
        ...DUENO,
      })
    ).rejects.toThrow(/CAFÉ-1/);

    expect(await producto("producto-uno")).toBeUndefined();
    expect(
      await getTestDb()
        .select()
        .from(categories)
        .where(eq(categories.slug, "cocina"))
    ).toHaveLength(0);
    expect((await variante("CAFE-1")).productId).toBe(
      (await producto("ajeno"))!.id
    );
  });

  it("C1: un fallo tarde no deja la mitad escrita", async () => {
    // El plan valida; entre la vista previa y la escritura, otra persona se
    // quedó con el slug del segundo producto: la escritura falla en el
    // segundo y el primero —y su categoría nueva— no quedan.
    const plan = await buildCatalogImportPlan(
      "SKU;Producto;Categoría;Precio (₲)\n" +
        "PRI-1;Primero;Nueva categoría;10000\n" +
        "SEG-1;Segundo;Nueva categoría;20000\n"
    );
    expect(plan.errores).toEqual([]);
    const otra = await createCategory("otra");
    await getTestDb().insert(products).values({
      slug: "ocupado",
      name: "Ocupado",
      categoryId: otra,
    });
    await getTestDb()
      .insert(variants)
      .values({
        productId: (await producto("ocupado"))!.id,
        sku: "SEG-1",
        label: "Único",
        pricePyg: 1,
        onHand: 0,
      });

    await expect(
      applyCatalogImportPlan(plan, {
        resetStock: false,
        allowPriceChanges: true,
        ...DUENO,
      })
    ).rejects.toThrow();

    expect(await producto("primero")).toBeUndefined();
    expect(
      await getTestDb()
        .select()
        .from(categories)
        .where(eq(categories.slug, "nueva-categoria"))
    ).toHaveLength(0);
  });

  it("C5: lo nuevo entra como borrador y lo apagado no se prende", async () => {
    await productoCompleto();
    await getTestDb()
      .update(products)
      .set({ isActive: false })
      .where(eq(products.slug, "taza-ceramica"));
    await getTestDb()
      .update(variants)
      .set({ isActive: false })
      .where(eq(variants.sku, "TAZ-M"));

    await aplicar(
      "SKU;Producto;Categoría;Precio (₲);Slug\n" +
        "TAZ-S;Taza cerámica;Hogar;50000;taza-ceramica\n" +
        "TAZ-M;Taza cerámica;Hogar;70000;taza-ceramica\n" +
        "PLA-1;Plato hondo;Hogar;40000;plato-hondo\n"
    );

    expect((await producto("taza-ceramica"))?.isActive).toBe(false);
    expect((await variante("TAZ-M")).isActive).toBe(false);
    const nuevo = await producto("plato-hondo");
    expect(nuevo?.publishedAt).toBeNull();
    expect((await variante("PLA-1")).label).toBe("Único");
    expect((await variante("PLA-1")).onHand).toBe(0);
  });

  it("C6: sin permiso de precios en masa, una planilla que cambia precios o pisa stock no escribe nada", async () => {
    await productoCompleto();
    const plan = await buildCatalogImportPlan(
      "SKU;Producto;Categoría;Precio (₲);Slug;Descripción\n" +
        "TAZ-S;Taza cerámica;Hogar;99000;taza-ceramica;Otra descripción\n"
    );
    expect(plan.preciosCambian).toBe(1);

    await expect(
      applyCatalogImportPlan(plan, {
        resetStock: false,
        allowPriceChanges: false,
        ...DUENO,
      })
    ).rejects.toMatchObject({ code: "adminError.importar.preciosSoloDuenio" });
    await expect(
      applyCatalogImportPlan(
        await buildCatalogImportPlan(
          "SKU;Producto;Categoría;Precio (₲);Stock;Slug\n" +
            "TAZ-S;Taza cerámica;Hogar;50000;99;taza-ceramica\n"
        ),
        { resetStock: true, allowPriceChanges: false, ...DUENO }
      )
    ).rejects.toMatchObject({ code: "adminError.importar.preciosSoloDuenio" });

    expect((await variante("TAZ-S")).pricePyg).toBe(50_000);
    expect((await variante("TAZ-S")).onHand).toBe(7);
    expect((await producto("taza-ceramica"))?.description).toBe("Hecha a mano");

    // Lo que no toca plata ni stock, sí.
    await applyCatalogImportPlan(
      await buildCatalogImportPlan(
        "SKU;Producto;Categoría;Precio (₲);Slug;Descripción\n" +
          "TAZ-S;Taza cerámica;Hogar;50000;taza-ceramica;Otra descripción\n"
      ),
      { resetStock: false, allowPriceChanges: false, ...DUENO }
    );
    expect((await producto("taza-ceramica"))?.description).toBe(
      "Otra descripción"
    );
  });

  it("C7: cada precio y stock que cambia deja su fila de auditoría con quién", async () => {
    await productoCompleto();

    await aplicar(
      "SKU;Producto;Categoría;Precio (₲);Stock;Slug\n" +
        "TAZ-S;Taza cerámica;Hogar;55000;10;taza-ceramica\n" +
        "TAZ-M;Taza cerámica;Hogar;70000;4;taza-ceramica\n",
      { resetStock: true }
    );

    const precios = await getTestDb().select().from(priceAdjustments);
    expect(precios).toEqual([
      expect.objectContaining({
        variantId: (await variante("TAZ-S")).id,
        fromPyg: 50_000,
        toPyg: 55_000,
        actor: DUENO.actor,
      }),
    ]);
    const stock = await getTestDb().select().from(stockAdjustments);
    expect(stock).toEqual([
      expect.objectContaining({
        variantId: (await variante("TAZ-S")).id,
        delta: 3,
        previousOnHand: 7,
        newOnHand: 10,
        actor: DUENO.actor,
      }),
    ]);
  });

  it("C7: el editor de variantes también audita el cambio de precio", async () => {
    const { productId } = await productoCompleto();
    const actual = await variante("TAZ-S");

    await saveVariant(
      productId,
      {
        id: actual.id,
        sku: "TAZ-S",
        label: "Chica",
        pricePyg: 52_000,
        compareAtPyg: 60_000,
        isActive: true,
      },
      undefined,
      { actor: "admin:staff@tienda.test", actorUserId: null }
    );

    expect(await getTestDb().select().from(priceAdjustments)).toEqual([
      expect.objectContaining({
        variantId: actual.id,
        fromPyg: 50_000,
        toPyg: 52_000,
        actor: "admin:staff@tienda.test",
      }),
    ]);
  });
});
