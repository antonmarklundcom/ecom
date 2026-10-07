import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { CATALOGUE } from "@/config/catalogue";
import { categoryHasPrices, getBrands } from "@/db/queries";
import { products, variants } from "@/db/schema";
import { getCatalogueFacets } from "@/domain/catalogue-facets";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createCategory } from "../helpers/factories";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md F4: cada conteo de un filtro dice cuántos
 * productos quedarían si se lo elige **además** de los otros filtros puestos,
 * y qué filtros se ofrecen sale de toda la categoría, no de la página.
 */
const verifiedAt = "2026-01-01T00:00:00.000Z";

async function producto(input: {
  categoryId: number;
  brand: string | null;
  color?: string;
  showPrice?: boolean;
  saleMode?: "stock" | "enquiry" | "showcase";
  variantes: { price: number; size?: string; onHand?: number }[];
}) {
  const db = getTestDb();
  const slug = `p-${randomBytes(4).toString("hex")}`;
  const [inserted] = await db.insert(products).values({
    slug,
    name: slug,
    categoryId: input.categoryId,
    brand: input.brand,
    ivaRate: 10,
    saleMode: input.saleMode ?? "stock",
    showPrice: input.showPrice ?? true,
    publishedAt: new Date(),
    ...(input.color
      ? { specifications: { verifiedAt, values: { color: input.color } } }
      : {}),
  });
  const productId = Number(inserted.insertId);
  for (const [index, v] of input.variantes.entries()) {
    await db.insert(variants).values({
      productId,
      sku: `${slug}-${index}`,
      label: v.size ?? `V${index}`,
      pricePyg: v.price,
      onHand: v.onHand ?? 5,
      position: index,
      ...(v.size
        ? { attributes: { verifiedAt, values: { size: v.size } } }
        : {}),
    });
  }
  return productId;
}

function totals(values: { value: string; total: number }[]) {
  return Object.fromEntries(values.map((v) => [v.value, v.total]));
}

describe.skipIf(!hasTestDb)("filtros de categoría", () => {
  beforeEach(async () => {
    await resetTables();
    CATALOGUE.attributes = [
      { key: "color", label: "Color", scope: "product", filter: true },
      { key: "size", label: "Talle", scope: "variant", filter: true },
    ];
  });
  afterEach(() => {
    CATALOGUE.attributes = [];
  });
  afterAll(closeTestDb);

  it("las marcas cuentan con el precio y los atributos ya elegidos", async () => {
    const categoryId = await createCategory("hogar");
    await producto({
      categoryId,
      brand: "Norte",
      color: "rojo",
      variantes: [{ price: 100_000 }],
    });
    await producto({
      categoryId,
      brand: "Norte",
      color: "azul",
      variantes: [{ price: 300_000 }],
    });
    await producto({
      categoryId,
      brand: "Sur",
      color: "rojo",
      variantes: [{ price: 100_000 }],
    });

    // Sin filtros: lo de siempre.
    expect(await getBrands("hogar")).toEqual([
      { brand: "Norte", total: 2 },
      { brand: "Sur", total: 1 },
    ]);
    // Hasta ₲150.000: Norte tiene uno solo que entra. Antes decía 2 y al
    // elegirla aparecía 1.
    expect(await getBrands("hogar", { maxPricePyg: 150_000 })).toEqual([
      { brand: "Norte", total: 1 },
      { brand: "Sur", total: 1 },
    ]);
    // Con color azul, Sur no tiene ninguno — pero sigue en la lista (la
    // lista sale de la categoría), con 0.
    expect(await getBrands("hogar", { attributes: { color: "azul" } })).toEqual(
      [
        { brand: "Norte", total: 1 },
        { brand: "Sur", total: 0 },
      ]
    );
  });

  it("los atributos cuentan con la marca, el precio y los otros atributos", async () => {
    const categoryId = await createCategory("hogar");
    await producto({
      categoryId,
      brand: "Norte",
      color: "rojo",
      variantes: [
        { price: 100_000, size: "S" },
        { price: 100_000, size: "M" },
      ],
    });
    await producto({
      categoryId,
      brand: "Sur",
      color: "azul",
      variantes: [{ price: 100_000, size: "M" }],
    });

    const [color, size] = await getCatalogueFacets("hogar", {
      brand: "Sur",
    });
    expect(totals(color!.values)).toEqual({ azul: 1, rojo: 0 });
    expect(totals(size!.values)).toEqual({ M: 1, S: 0 });

    // Un atributo no se condiciona a sí mismo: con talle S elegido, los
    // otros talles siguen contando lo que habría si se cambia a ellos.
    const [, talles] = await getCatalogueFacets("hogar", {
      attributes: { size: "S" },
    });
    expect(totals(talles!.values)).toEqual({ M: 2, S: 1 });
  });

  it("un talle cuenta sólo si la misma variante cumple los otros filtros", async () => {
    const categoryId = await createCategory("hogar");
    // S sin stock, M con stock: "con stock" + S no tiene resultados.
    await producto({
      categoryId,
      brand: null,
      variantes: [
        { price: 100_000, size: "S", onHand: 0 },
        { price: 100_000, size: "M", onHand: 3 },
      ],
    });
    const [, talles] = await getCatalogueFacets("hogar", { inStock: true });
    expect(totals(talles!.values)).toEqual({ M: 1, S: 0 });
  });

  it("el filtro de precio se ofrece sólo si algún producto de la categoría muestra precio", async () => {
    const conPrecio = await createCategory("con-precio");
    const sinPrecio = await createCategory("sin-precio");
    await producto({
      categoryId: conPrecio,
      brand: null,
      variantes: [{ price: 100_000 }],
    });
    await producto({
      categoryId: sinPrecio,
      brand: null,
      saleMode: "enquiry",
      showPrice: false,
      variantes: [{ price: 100_000 }],
    });
    await producto({
      categoryId: sinPrecio,
      brand: null,
      variantes: [{ price: 0 }],
    });

    expect(await categoryHasPrices("con-precio")).toBe(true);
    expect(await categoryHasPrices("sin-precio")).toBe(false);
  });
});
