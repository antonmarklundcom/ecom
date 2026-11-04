import { readFileSync } from "node:fs";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  categories,
  priceAdjustments,
  products,
  stockAdjustments,
  supplierOffers,
  variants,
} from "@/db/schema";
import {
  catalogExportCsv,
  listCatalogExportRows,
} from "@/domain/catalog-export";
import {
  CATALOG_IMPORT_LOTE,
  applyCatalogImportLote,
  buildCatalogImportPlan,
  type CatalogImportApplyOptions,
} from "@/domain/catalog-import-plan";
import { saveSupplierOffer } from "@/domain/supplier-offers";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createAdminUser, createCategory } from "../helpers/factories";

/**
 * La importación del catálogo como la usa el dueño, contra MySQL de verdad
 * (docs/CATALOGO-CSV.md): por lotes que entran enteros o no entran, la ida y
 * vuelta export → base nueva → import → export byte a byte, reimportar sin
 * cambiar nada, el stock y lo omitido que se conservan, las ofertas de
 * proveedor sin duplicar, el flag de proveedores entre tiendas, y las acciones
 * del panel con su vista previa, sus duplicados y su firma.
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

const FIXTURE = readFileSync("scripts/fixtures/catalogo-demo.csv", "utf8");
const DUENO: CatalogImportApplyOptions = {
  resetStock: false,
  allowPriceChanges: true,
  actor: "admin:duenia@tienda.test",
  actorUserId: null,
};

/** Todos los lotes, en orden, como lo hace el panel o la CLI. */
async function importarTodo(
  csv: string,
  opciones: { proveedores: boolean; resetStock?: boolean }
) {
  const plan = await buildCatalogImportPlan(csv, {
    proveedores: opciones.proveedores,
  });
  if (plan.errores.length > 0) throw new Error(plan.errores.join("\n"));
  const lotes = [];
  for (let lote = 0; lote < plan.lotes; lote += 1) {
    const result = await applyCatalogImportLote(
      csv,
      lote,
      { proveedores: opciones.proveedores },
      { ...DUENO, resetStock: opciones.resetStock ?? false }
    );
    if (!result.ok) throw new Error(result.errores.join("\n"));
    lotes.push(result);
  }
  return { plan, lotes };
}

async function exportar(proveedores: boolean): Promise<string> {
  return catalogExportCsv(await listCatalogExportRows({}, { proveedores }), {
    proveedores,
  });
}

async function foto() {
  const db = getTestDb();
  return {
    categories: await db.select().from(categories).orderBy(asc(categories.id)),
    products: await db.select().from(products).orderBy(asc(products.id)),
    variants: await db.select().from(variants).orderBy(asc(variants.id)),
    offers: await db
      .select()
      .from(supplierOffers)
      .orderBy(asc(supplierOffers.id)),
    precios: await db.select().from(priceAdjustments),
    stock: await db.select().from(stockAdjustments),
  };
}

async function variante(sku: string) {
  const row = (
    await getTestDb().select().from(variants).where(eq(variants.sku, sku))
  )[0];
  if (!row) throw new Error(`sin variante ${sku}`);
  return row;
}

async function ofertasDe(sku: string) {
  return getTestDb()
    .select()
    .from(supplierOffers)
    .where(eq(supplierOffers.variantId, (await variante(sku)).id))
    .orderBy(asc(supplierOffers.id));
}

/** `n` productos de una variante, con nombres que no se parecen entre sí. */
function planillaGrande(n: number): string {
  const filas = Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(3, "0");
    return `GEN-${id};Artículo ${id};Varios;${10_000 + i};${i}`;
  });
  return `SKU;Producto;Categoría;Precio (₲);Stock\n${filas.join("\n")}\n`;
}

describe.skipIf(!hasTestDb)("importación de catálogo por lotes", () => {
  beforeEach(async () => {
    await resetTables();
    mocks.proveedores = false;
  });
  afterAll(closeTestDb);

  it.each([true, false])(
    "ida y vuelta: exportar → base nueva → importar → exportar da el mismo archivo (proveedores: %s)",
    async (proveedores) => {
      await importarTodo(FIXTURE, { proveedores });
      const primero = await exportar(proveedores);
      expect(primero).toContain("Termo de acero inoxidable 1 L");
      if (proveedores) expect(primero).toContain("Importadora Este");
      else expect(primero).not.toContain("Importadora Este");

      await resetTables();
      const { plan } = await importarTodo(primero, { proveedores });
      expect(plan.advertencias).toEqual([]);
      expect(plan.duplicados).toEqual([]);
      expect(await exportar(proveedores)).toBe(primero);
    }
  );

  it("reimportar el mismo archivo no cambia nada: ni filas, ni ofertas, ni auditoría", async () => {
    await importarTodo(FIXTURE, { proveedores: true });
    const antes = await foto();
    expect(antes.offers.length).toBeGreaterThan(0);

    const { plan } = await importarTodo(FIXTURE, { proveedores: true });
    expect(plan).toMatchObject({
      productosNuevos: 0,
      variantesNuevas: 0,
      preciosCambian: 0,
      ofertasNuevas: 0,
      ofertasActualizar: 0,
      categoriasNuevas: [],
    });
    expect(await foto()).toEqual(antes);

    // Y lo exportado, reimportado encima de sí mismo, tampoco.
    await importarTodo(await exportar(true), { proveedores: true });
    expect(await foto()).toEqual(antes);
  });

  it(`de a ${CATALOG_IMPORT_LOTE} productos: un lote que falla no deshace los anteriores, y reimportar termina sin duplicar`, async () => {
    const csv = planillaGrande(CATALOG_IMPORT_LOTE * 2 + 10);
    const plan = await buildCatalogImportPlan(csv);
    expect(plan.errores).toEqual([]);
    expect(plan.lotes).toBe(3);

    for (const lote of [0, 1]) {
      const result = await applyCatalogImportLote(csv, lote, {}, DUENO);
      expect(result).toMatchObject({ ok: true, lote, productos: CATALOG_IMPORT_LOTE });
    }

    // Entre el lote 2 y el 3 alguien carga a mano un producto con un SKU
    // del tercer lote: ese lote entero no entra (ni su categoría, ni el resto
    // de sus productos), y los dos anteriores quedan.
    const otra = await createCategory("otra");
    await getTestDb()
      .insert(products)
      .values({ slug: "a-mano", name: "A mano", categoryId: otra });
    const aMano = (
      await getTestDb().select().from(products).where(eq(products.slug, "a-mano"))
    )[0]!;
    await getTestDb().insert(variants).values({
      productId: aMano.id,
      sku: "gen-055",
      label: "Único",
      pricePyg: 1,
      onHand: 0,
    });
    const tercero = await applyCatalogImportLote(csv, 2, {}, DUENO);
    expect(tercero).toMatchObject({
      ok: false,
      lote: 2,
      errores: [expect.stringContaining('"GEN-055"')],
    });
    expect(await getTestDb().select().from(products)).toHaveLength(
      CATALOG_IMPORT_LOTE * 2 + 1
    );
    expect(
      await getTestDb().select().from(variants).where(eq(variants.sku, "GEN-051"))
    ).toEqual([]);

    // Se corrige y se reimporta el archivo entero: lo que ya estaba se
    // actualiza (sin cambios) y entra lo que faltaba.
    await getTestDb().delete(products).where(eq(products.id, aMano.id));
    const { lotes } = await importarTodo(csv, { proveedores: false });
    expect(lotes.map((l) => l.productos)).toEqual([25, 25, 10]);
    expect(await getTestDb().select().from(products)).toHaveLength(60);
    expect(await getTestDb().select().from(variants)).toHaveLength(60);
  });

  it("un lote fuera de rango no escribe nada", async () => {
    const result = await applyCatalogImportLote(FIXTURE, 5, {}, DUENO);
    expect(result).toMatchObject({ ok: false });
    expect(await getTestDb().select().from(products)).toEqual([]);
  });

  it("el stock que ya existe no se pisa sin pedirlo, y lo omitido queda como estaba", async () => {
    await importarTodo(FIXTURE, { proveedores: true });
    await getTestDb()
      .update(variants)
      .set({ onHand: 3 })
      .where(eq(variants.sku, "YER-TRAD-1K"));
    const mesa = (await variante("MES-LAP")).productId;
    const antesMesa = (
      await getTestDb().select().from(products).where(eq(products.id, mesa))
    )[0]!;
    expect(antesMesa.saleMode).toBe("enquiry");
    const ofertasAntes = await ofertasDe("YER-TRAD-1K");

    // Sólo precios: sin Stock, Modo de venta, Mostrar precio ni proveedor.
    await importarTodo(
      "SKU;Producto;Categoría;Precio (₲);Slug\n" +
        "YER-TRAD-1K;Yerba mate tradicional 1 kg;Almacén;33000;yerba-mate-tradicional-1-kg\n" +
        "MES-LAP;Mesa de lapacho a medida;Hogar;2500000;mesa-de-lapacho-a-medida\n",
      { proveedores: true }
    );
    expect(await variante("YER-TRAD-1K")).toMatchObject({
      pricePyg: 33_000,
      onHand: 3,
    });
    expect(
      (await getTestDb().select().from(products).where(eq(products.id, mesa)))[0]
    ).toEqual(antesMesa);
    const yerba = (
      await getTestDb()
        .select()
        .from(products)
        .where(eq(products.slug, "yerba-mate-tradicional-1-kg"))
    )[0]!;
    expect(yerba.supplierUrl).toBe(
      "https://proveedor.example.com/yerba-tradicional"
    );
    expect(await ofertasDe("YER-TRAD-1K")).toEqual(ofertasAntes);

    // Con la columna Stock pero sin "pisar", tampoco.
    await importarTodo(FIXTURE, { proveedores: true });
    expect((await variante("YER-TRAD-1K")).onHand).toBe(3);
    // Pisando, sí, y queda auditado.
    await importarTodo(FIXTURE, { proveedores: true, resetStock: true });
    expect((await variante("YER-TRAD-1K")).onHand).toBe(120);
    expect(
      await getTestDb()
        .select()
        .from(stockAdjustments)
        .where(eq(stockAdjustments.variantId, (await variante("YER-TRAD-1K")).id))
    ).toEqual([expect.objectContaining({ previousOnHand: 3, newOnHand: 120 })]);
  });

  it("ofertas: la misma (variante, proveedor) se actualiza, la alternativa queda y la nueva con costo pasa a preferida", async () => {
    await importarTodo(FIXTURE, { proveedores: true });
    const [importada] = await ofertasDe("TER-INOX-NEG");
    expect(importada).toMatchObject({
      source: "Importadora Este",
      unitCostPyg: 120_000,
      supplierStock: 80,
      isPreferred: true,
      isConfirmed: true,
      isActive: true,
    });

    // Una alternativa cargada en el panel.
    const neg = await variante("TER-INOX-NEG");
    await saveSupplierOffer({
      productId: neg.productId,
      variantId: neg.id,
      unitCostPyg: 110_000,
      source: "Otro mayorista",
      sourceType: "local",
      productUrl: null,
      supplierUrl: null,
      supplierStock: null,
      checkedOn: null,
      notes: "cotizado por teléfono",
      isConfirmed: true,
      isActive: true,
      isPreferred: false,
    });
    await importarTodo(FIXTURE, { proveedores: true });
    expect((await ofertasDe("TER-INOX-NEG")).map((o) => [o.source, o.isPreferred])).toEqual([
      ["Importadora Este", true],
      ["Otro mayorista", false],
    ]);

    // La planilla dice que ahora se le compra a la alternativa, con otro
    // nombre de mayúsculas: se actualiza ésa y pasa a preferida.
    const cabecera =
      "SKU;Producto;Categoría;Precio (₲);Slug;Proveedor;Costo proveedor;Stock proveedor\n";
    await importarTodo(
      cabecera +
        "TER-INOX-NEG;Termo de acero inoxidable 1 L;Mate;185000;termo-de-acero-inoxidable-1-l;OTRO MAYORISTA;105000;12\n",
      { proveedores: true }
    );
    expect(
      (await ofertasDe("TER-INOX-NEG")).map((o) => [
        o.source,
        o.unitCostPyg,
        o.supplierStock,
        o.isPreferred,
        o.notes,
      ])
    ).toEqual([
      ["Importadora Este", 120_000, 80, false, null],
      ["Otro mayorista", 105_000, 12, true, "cotizado por teléfono"],
    ]);

    // Sin costo no puede ser la preferida.
    await importarTodo(
      cabecera +
        "TER-INOX-NEG;Termo de acero inoxidable 1 L;Mate;185000;termo-de-acero-inoxidable-1-l;Otro mayorista;;\n",
      { proveedores: true }
    );
    const otro = (await ofertasDe("TER-INOX-NEG"))[1]!;
    expect(otro).toMatchObject({
      unitCostPyg: null,
      supplierStock: null,
      isPreferred: false,
    });
  });

  it("con los proveedores apagados, sus columnas se ignoran: ni ofertas, ni enlace de compra", async () => {
    const { plan } = await importarTodo(FIXTURE, { proveedores: false });
    expect(plan.advertencias).toEqual([
      expect.stringContaining("columnas de proveedor"),
    ]);
    expect(await getTestDb().select().from(supplierOffers)).toEqual([]);
    expect(
      (await getTestDb().select().from(products)).every(
        (p) => p.supplierUrl === null
      )
    ).toBe(true);

    // Un enlace guardado antes no se borra por importar sin el flag.
    await getTestDb()
      .update(products)
      .set({ supplierUrl: "https://guardado.example.com/x" })
      .where(eq(products.slug, "hamaca-paraguaya-de-algodon"));
    await importarTodo(FIXTURE, { proveedores: false });
    expect(
      (
        await getTestDb()
          .select()
          .from(products)
          .where(eq(products.slug, "hamaca-paraguaya-de-algodon"))
      )[0]!.supplierUrl
    ).toBe("https://guardado.example.com/x");
  });

  it("un archivo con proveedores entra en una tienda sin ellos, y al revés", async () => {
    await importarTodo(FIXTURE, { proveedores: true });
    const conProveedores = await exportar(true);
    const sinProveedores = await exportar(false);

    // Tienda sin proveedores recibe el archivo con proveedores.
    await resetTables();
    const { plan: a } = await importarTodo(conProveedores, { proveedores: false });
    expect(a.advertencias).toEqual([expect.stringContaining("columnas de proveedor")]);
    expect(await getTestDb().select().from(supplierOffers)).toEqual([]);
    expect(await exportar(false)).toBe(sinProveedores);

    // Tienda con proveedores recibe el archivo sin ellos: nada que avisar,
    // ninguna oferta inventada.
    await resetTables();
    const { plan: b } = await importarTodo(sinProveedores, { proveedores: true });
    expect(b.advertencias).toEqual([]);
    expect(await getTestDb().select().from(supplierOffers)).toEqual([]);
    expect(await exportar(false)).toBe(sinProveedores);
  });

  it("los posibles repetidos aparecen en la vista previa y no en el plan de un lote", async () => {
    const hogar = await createCategory("hogar");
    await getTestDb().insert(products).values({
      slug: "hamaca-vieja",
      name: "Hamaca paraguaya de algodón",
      categoryId: hogar,
    });
    const plan = await buildCatalogImportPlan(FIXTURE);
    expect(plan.duplicados).toEqual([
      expect.stringContaining("hamaca-paraguaya-de-algodon / hamaca-vieja"),
    ]);
    expect((await buildCatalogImportPlan(FIXTURE, { lote: 0 })).duplicados).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)("acciones del panel: vista previa, firma y lotes", () => {
  beforeEach(async () => {
    await resetTables();
    mocks.session.userId = await createAdminUser();
    mocks.session.role = "owner";
    mocks.proveedores = true;
  });
  afterAll(closeTestDb);

  function form(csv: string, extra: Record<string, string> = {}): FormData {
    const formData = new FormData();
    formData.set("file", new File([csv], "catalogo.csv", { type: "text/csv" }));
    formData.set("pisarStock", "false");
    for (const [clave, valor] of Object.entries(extra)) formData.set(clave, valor);
    return formData;
  }

  it("la vista previa firma; sin la firma, o con otro archivo, no se escribe", async () => {
    const { previewCatalogImport, applyCatalogImport } = await import(
      "@/app/actions/admin-products"
    );
    const preview = await previewCatalogImport(form(FIXTURE));
    expect(preview).toMatchObject({
      ok: true,
      productosNuevos: 20,
      variantesNuevas: 32,
      proveedores: true,
      ofertasNuevas: 6,
      lotes: 1,
      tamLote: CATALOG_IMPORT_LOTE,
      duplicados: [],
    });
    if (!preview.ok) throw new Error("sin vista previa");

    expect(await applyCatalogImport(form(FIXTURE, { lote: "0" }))).toMatchObject({
      ok: false,
      errores: [expect.stringContaining("no es el mismo")],
    });
    const otro = FIXTURE.replace("32000", "33000");
    expect(
      await applyCatalogImport(form(otro, { lote: "0", revision: preview.revision }))
    ).toMatchObject({ ok: false, errores: [expect.stringContaining("no es el mismo")] });
    expect(await getTestDb().select().from(products)).toEqual([]);

    expect(
      await applyCatalogImport(form(FIXTURE, { lote: "0", revision: preview.revision }))
    ).toMatchObject({ ok: true, lote: 0, lotes: 1, productos: 20, variantesEscritas: 32, ofertasNuevas: 6 });
    expect(await getTestDb().select().from(products)).toHaveLength(20);
  });

  it("con posibles repetidos, hay que marcarlos como revisados", async () => {
    const { previewCatalogImport, applyCatalogImport } = await import(
      "@/app/actions/admin-products"
    );
    const hogar = await createCategory("hogar");
    await getTestDb().insert(products).values({
      slug: "hamaca-vieja",
      name: "Hamaca paraguaya de algodón",
      categoryId: hogar,
    });
    const preview = await previewCatalogImport(form(FIXTURE));
    if (!preview.ok) throw new Error("sin vista previa");
    expect(preview.duplicados).toHaveLength(1);

    const sinRevisar = form(FIXTURE, { lote: "0", revision: preview.revision });
    expect(await applyCatalogImport(sinRevisar)).toMatchObject({
      ok: false,
      errores: [expect.stringContaining("sin revisar")],
    });

    // Si la tienda cambió desde la vista previa (otro repetido nuevo), el
    // lote 0 lo ve y pide volver a revisar.
    await getTestDb().insert(products).values({
      slug: "jarra-vieja",
      name: "Jarra de barro de Itá",
      categoryId: hogar,
    });
    const revisado = form(FIXTURE, {
      lote: "0",
      revision: preview.revision,
      duplicadosRevisados: "true",
    });
    expect(await applyCatalogImport(revisado)).toMatchObject({ ok: false });
    await getTestDb().delete(products).where(eq(products.slug, "jarra-vieja"));

    expect(await applyCatalogImport(revisado)).toMatchObject({ ok: true, productos: 20 });
  });

  it("sin el flag, o sin `precios`, las columnas de proveedor se ignoran con aviso", async () => {
    const { previewCatalogImport, applyCatalogImport } = await import(
      "@/app/actions/admin-products"
    );
    mocks.proveedores = false;
    const preview = await previewCatalogImport(form(FIXTURE));
    if (!preview.ok) throw new Error("sin vista previa");
    expect(preview).toMatchObject({ proveedores: false, ofertasNuevas: 0 });
    expect(preview.advertencias).toEqual([
      expect.stringContaining("columnas de proveedor"),
    ]);

    // Una firma del modo sin proveedores no sirve con el flag prendido.
    mocks.proveedores = true;
    expect(
      await applyCatalogImport(form(FIXTURE, { lote: "0", revision: preview.revision }))
    ).toMatchObject({ ok: false });
    mocks.proveedores = false;
    expect(
      await applyCatalogImport(form(FIXTURE, { lote: "0", revision: preview.revision }))
    ).toMatchObject({ ok: true, ofertasNuevas: 0 });
    expect(await getTestDb().select().from(supplierOffers)).toEqual([]);
  });

  it("el export del panel es la planilla canónica, con proveedores sólo con el flag", async () => {
    const { exportProductsCsv } = await import("@/app/actions/admin-export");
    await importarTodo(FIXTURE, { proveedores: true });

    const con = await exportProductsCsv({});
    if (!con.ok) throw new Error(con.error);
    expect(con.csv).toBe(await exportar(true));
    expect(con.rows).toBe(32);

    mocks.proveedores = false;
    const sin = await exportProductsCsv({});
    if (!sin.ok) throw new Error(sin.error);
    expect(sin.csv).toBe(await exportar(false));
    expect(sin.csv).not.toContain("Costo proveedor");
  });
});
