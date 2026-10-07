import { afterEach, describe, expect, it } from "vitest";

import { CATALOGUE } from "@/config/catalogue";
import { PUBLIC_FACTS } from "@/config/public-facts";
import { buildProductFeed, type FeedProduct } from "@/lib/product-feed";
import { productJsonLd } from "@/lib/seo";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md E6: los datos estructurados y el feed no
 * afirman nada que nadie verificó ni que cambie con el stock.
 */
const verifiedAt = "2026-01-01T12:00:00.000Z";
const origin = new URL("https://store.example");

afterEach(() => {
  CATALOGUE.attributes = [];
  PUBLIC_FACTS.noManufacturerIdentifiers = false;
});

const dos = [
  {
    sku: "A-1",
    label: "Uno",
    pricePyg: 100_000,
    compareAtPyg: null,
    available: 0,
    identifiers: { verifiedAt, gtin: "4006381333931" },
    attributes: { verifiedAt, values: { color: "azul" } },
  },
  {
    sku: "A-2",
    label: "Dos",
    pricePyg: 110_000,
    compareAtPyg: null,
    available: 3,
    identifiers: { verifiedAt, gtin: "96385074" },
    attributes: { verifiedAt, values: { color: "verde" } },
  },
];

describe("JSON-LD de un producto con varias variantes sin dimensión", () => {
  it("no publica arriba el SKU ni el GTIN de una variante elegida por el stock", () => {
    const ld = productJsonLd({
      origin,
      slug: "botella",
      name: "Botella",
      images: [],
      variants: dos,
    });

    expect(ld["@type"]).toBe("Product");
    // Antes: sku/gtin de la primera con stock (A-2); cuando se agota, cambian.
    expect(ld.sku).toBeUndefined();
    expect(ld.gtin).toBeUndefined();
    expect(ld.offers).toMatchObject([{ sku: "A-1" }, { sku: "A-2" }]);
  });

  it("un producto de una sola variante sí lleva sus identificadores", () => {
    const ld = productJsonLd({
      origin,
      slug: "botella",
      name: "Botella",
      images: [],
      variants: [dos[0]!],
    });
    expect(ld).toMatchObject({ sku: "A-1", gtin: "4006381333931" });
  });
});

function feed(product: Partial<FeedProduct> = {}): string {
  return buildProductFeed({
    origin,
    tienda: { nombre: "Tienda", descripcion: "" },
    products: [
      {
        slug: "botella",
        name: "Botella",
        description: "",
        brand: null,
        categoryName: "Hogar",
        images: ["https://res.cloudinary.com/x/a.jpg"],
        variants: dos,
        ...product,
      },
    ],
  });
}

describe("feed de comercio", () => {
  it("sin identificador verificado no afirma que el producto no tiene uno", () => {
    const xml = feed({
      variants: [{ ...dos[0]!, identifiers: undefined }],
    });
    expect(xml).not.toContain("identifier_exists");
  });

  it("la tienda que vende productos sin GTIN de fabricante lo declara", () => {
    PUBLIC_FACTS.noManufacturerIdentifiers = true;
    const xml = feed({
      variants: [{ ...dos[0]!, identifiers: undefined }],
    });
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    // Con un GTIN verificado, nunca.
    expect(feed()).not.toContain("identifier_exists");
  });

  it("agrupa variantes con la misma regla que el JSON-LD", () => {
    // Sin dimensión declarada no hay grupo: Google exige un atributo de
    // variante (talle, color…) en cada ítem de un grupo.
    expect(feed()).not.toContain("item_group_id");

    CATALOGUE.attributes = [
      {
        key: "color",
        label: "Color",
        scope: "variant",
        schemaProperty: "color",
      },
    ];
    const xml = feed();
    expect(
      xml.match(/<g:item_group_id>botella<\/g:item_group_id>/g)
    ).toHaveLength(2);
    expect(xml).toContain("<g:color>azul</g:color>");
    expect(xml).toContain("<g:color>verde</g:color>");
  });
});
