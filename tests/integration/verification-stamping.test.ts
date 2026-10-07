import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getProductBySlug } from "@/db/queries";
import { products, variants } from "@/db/schema";
import { duplicateProduct } from "@/domain/admin-bulk";
import {
  createProduct,
  saveVariant,
  updateProduct,
  type ProductWrite,
} from "@/domain/admin-products";
import {
  applyCatalogImportPlan,
  buildCatalogImportPlan,
} from "@/domain/catalog-import-plan";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createCategory } from "../helpers/factories";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md E1 contra MySQL: el panel, el duplicado
 * y la planilla pasan por el mismo sellado, y la vidriera nunca ve quién
 * verificó.
 */
const ACTOR = { userId: null, label: "admin:encargada@tienda.test" };
const FORJADO = "2001-01-01T00:00:00.000Z";

async function fila(id: number) {
  return (
    await getTestDb().select().from(products).where(eq(products.id, id))
  )[0]!;
}

describe.skipIf(!hasTestDb)("verificación sellada por el servidor", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  async function base(): Promise<{ id: number; input: ProductWrite }> {
    const categoryId = await createCategory("hogar");
    const input: ProductWrite = {
      slug: "botella",
      name: "Botella",
      description: null,
      categoryId,
      brand: null,
      ivaRate: 10,
      isActive: true,
      published: true,
      saleMode: "enquiry",
      showPrice: false,
    };
    const id = await createProduct(input);
    return { id, input };
  }

  it("una fecha forjada en el formulario no publica nada", async () => {
    const { id, input } = await base();
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 500 }, verifiedAt: FORJADO },
      actor: ACTOR,
    });

    expect((await fila(id)).specifications).toEqual({
      values: { capacity: 500 },
    });
    expect(
      (await getProductBySlug("botella"))?.verifiedSpecifications
    ).toBeUndefined();
  });

  it("confirmar sella con hora del servidor y la sesión; lo público no dice quién", async () => {
    const { id, input } = await base();
    const antes = Date.now();
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 500 } },
      verify: { specifications: true },
      actor: ACTOR,
    });

    const guardado = (await fila(id)).specifications!;
    expect(guardado.verifiedBy).toEqual(ACTOR);
    expect(Date.parse(guardado.verifiedAt!)).toBeGreaterThanOrEqual(
      antes - 1_000
    );
    const publico = (await getProductBySlug("botella"))?.verifiedSpecifications;
    expect(publico?.values).toEqual({ capacity: 500 });
    expect(JSON.stringify(publico)).not.toContain("encargada");

    // Guardar sin cambios conserva el sello; cambiar sin confirmar lo saca.
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 500 } },
      actor: ACTOR,
    });
    expect((await fila(id)).specifications?.verifiedAt).toBe(
      guardado.verifiedAt
    );
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 750 } },
      actor: ACTOR,
    });
    expect((await fila(id)).specifications).toEqual({
      values: { capacity: 750 },
    });
  });

  it("un GTIN que cambia sin confirmar no se guarda", async () => {
    const { id } = await base();
    await expect(
      saveVariant(id, {
        sku: "BOT-1",
        label: "Única",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: true,
        identifiers: { gtin: "4006381333931", verifiedAt: FORJADO },
      })
    ).rejects.toMatchObject({
      code: "adminError.producto.identificadoresSinVerificar",
    });

    await saveVariant(
      id,
      {
        sku: "BOT-1",
        label: "Única",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: true,
        identifiers: { gtin: "4006381333931" },
        verify: { identifiers: true },
      },
      undefined,
      { actor: ACTOR.label, actorUserId: null }
    );
    const v = (
      await getTestDb().select().from(variants).where(eq(variants.sku, "BOT-1"))
    )[0]!;
    expect(v.identifiers?.verifiedBy?.label).toBe(ACTOR.label);
  });

  it("un duplicado no hereda la verificación", async () => {
    const { id, input } = await base();
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 500 } },
      verify: { specifications: true },
      actor: ACTOR,
    });
    const copia = await duplicateProduct(id);
    expect((await fila(copia)).specifications).toEqual({
      values: { capacity: 500 },
    });
  });

  it("una planilla no verifica: lo igual conserva el sello, lo distinto queda sin verificar", async () => {
    const { id, input } = await base();
    await updateProduct(id, {
      ...input,
      specifications: { values: { capacity: 500 } },
      verify: { specifications: true },
      actor: ACTOR,
    });
    const sello = (await fila(id)).specifications!.verifiedAt;
    const csv = (specs: string) =>
      `SKU;Producto;Categoría;Precio (₲);Modo de venta;Slug;Ficha técnica JSON\n` +
      `BOT-1;Botella;Hogar;;enquiry;botella;${specs}\n`;
    const aplicar = async (texto: string) => {
      const plan = await buildCatalogImportPlan(texto);
      expect(plan.errores).toEqual([]);
      await applyCatalogImportPlan(plan, {
        resetStock: false,
        allowPriceChanges: true,
        actor: "cli:test",
        actorUserId: null,
      });
    };

    await aplicar(
      csv(`"{""values"":{""capacity"":500},""verifiedAt"":""${FORJADO}""}"`)
    );
    expect((await fila(id)).specifications?.verifiedAt).toBe(sello);

    await aplicar(
      csv(`"{""values"":{""capacity"":900},""verifiedAt"":""${FORJADO}""}"`)
    );
    expect((await fila(id)).specifications).toEqual({
      values: { capacity: 900 },
    });
  });

  it("un GTIN nuevo en una planilla se frena en la vista previa; el mismo que ya está pasa", async () => {
    const { id } = await base();
    await saveVariant(
      id,
      {
        sku: "BOT-1",
        label: "Única",
        pricePyg: 0,
        compareAtPyg: null,
        isActive: true,
        identifiers: { gtin: "4006381333931" },
        verify: { identifiers: true },
      },
      undefined,
      { actor: ACTOR.label, actorUserId: null }
    );
    const csv = (gtin: string) =>
      `SKU;Producto;Categoría;Precio (₲);Modo de venta;Slug;Identificadores JSON\n` +
      `BOT-1;Botella;Hogar;;enquiry;botella;"{""gtin"":""${gtin}"",""verifiedAt"":""${FORJADO}""}"\n`;

    const distinto = await buildCatalogImportPlan(csv("96385074"));
    expect(distinto.errores.join("\n")).toContain("GTIN/MPN nuevo o distinto");

    const igual = await buildCatalogImportPlan(csv("4006381333931"));
    expect(igual.errores).toEqual([]);
    const antes = (
      await getTestDb().select().from(variants).where(eq(variants.sku, "BOT-1"))
    )[0]!.identifiers;
    await applyCatalogImportPlan(igual, {
      resetStock: false,
      allowPriceChanges: true,
      actor: "cli:test",
      actorUserId: null,
    });
    const despues = (
      await getTestDb().select().from(variants).where(eq(variants.sku, "BOT-1"))
    )[0]!.identifiers;
    // El sello de quien lo verificó en el panel queda; el de la planilla no.
    expect(despues).toEqual(antes);
  });
});
