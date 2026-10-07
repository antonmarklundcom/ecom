import { afterEach, describe, expect, it } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import {
  ProductSpecificationsSchema,
  VerifiedIdentifiersSchema,
  validGtin,
} from "@/lib/product-attributes";
import {
  publicSpecifications,
  publicVariantAttributes,
} from "@/lib/public-product-facts";
import { variantFromSku, variantUrl } from "@/lib/variant-url";
import { comparisonSlugs, comparisonLimit } from "@/lib/comparison";
import { parseCatalogueFilters } from "@/domain/catalogue-facets";
import { paymentPolicy } from "@/domain/payment-readiness";
import { productJsonLd } from "@/lib/seo";

const verifiedAt = "2026-01-01T12:00:00.000Z";
afterEach(() => {
  CATALOGUE.attributes = [];
});
describe("generic verified catalogue contracts", () => {
  it("rejects invalid/future dates and invented identifiers, while allowing ordinary optional facts", () => {
    expect(
      ProductSpecificationsSchema.safeParse({ values: { capacity: 500 } })
        .success
    ).toBe(true);
    for (const date of [
      "today",
      "2026-02-30T00:00:00Z",
      "2999-01-01T00:00:00Z",
    ])
      expect(
        ProductSpecificationsSchema.safeParse({ verifiedAt: date }).success
      ).toBe(false);
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
    expect(validGtin("00000000")).toBe(false);
    expect(
      VerifiedIdentifiersSchema.safeParse({ verifiedAt, mpn: "ACTUAL-123" })
        .success
    ).toBe(true);
    expect(
      VerifiedIdentifiersSchema.safeParse({ gtin: "4006381333931" }).success
    ).toBe(false);
    expect(VerifiedIdentifiersSchema.safeParse({ verifiedAt }).success).toBe(
      false
    );
  });
  it("publishes verified strict facts only, with no private supplier data", () => {
    expect(publicSpecifications({ values: { capacity: 500 } })).toBeUndefined();
    expect(
      publicSpecifications({
        verifiedAt,
        unit: "unidad",
        values: { capacity: 500 },
      })?.values?.capacity
    ).toBe(500);
    expect(
      publicSpecifications({
        verifiedAt,
        supplierDetails: { reference: "private" },
      })
    ).toBeUndefined();
    expect(
      publicVariantAttributes({
        verifiedAt: "invalid",
        values: { color: "red" },
      })
    ).toBeUndefined();
  });
  it("keeps exact SKU selection even out of stock and builds encoded stable links", () => {
    const variants = [
      { sku: "BOX A&2", available: 0 },
      { sku: "BOX B", available: 5 },
    ];
    expect(variantFromSku(variants, "BOX A&2", true)).toBe(variants[0]);
    expect(variantFromSku(variants, "box b", true)).toBeUndefined();
    expect(variantUrl("/producto/box?utm=x", "BOX A&2")).toBe(
      "/producto/box?utm=x&variante=BOX+A%262"
    );
  });
  it("bounds comparison and rejects unknown, repeated or unbounded filter input", () => {
    expect(comparisonLimit(99)).toBe(4);
    expect(comparisonSlugs("a,a,b,https://bad,c,d,e", 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
    const definitions = [
      {
        key: "capacity",
        label: "Capacidad",
        scope: "product" as const,
        filter: true,
      },
    ];
    expect(
      parseCatalogueFilters(
        { "atributo.capacity": "500", stock: "1" },
        definitions
      ).invalid
    ).toBe(false);
    for (const query of [
      { "atributo.unknown": "x" },
      { "atributo.capacity": ["a", "b"] },
      { "atributo.capacity": "x".repeat(161) },
      { stock: "true" },
    ])
      expect(parseCatalogueFilters(query, definitions).invalid).toBe(true);
  });
  it("preserves all template payment defaults, gives owner selection priority and fails closed on invalid policy", () => {
    expect(paymentPolicy(null, undefined)).toEqual([
      "transferencia",
      "contra_entrega",
      "tarjeta",
    ]);
    expect(paymentPolicy(["contra_entrega"], "tarjeta")).toEqual([
      "contra_entrega",
    ]);
    expect(paymentPolicy([], undefined)).toEqual([]);
    expect(paymentPolicy(null, "typo")).toEqual([]);
  });
  it("emits a group only from verified, real differing dimensions, with per-SKU offers", () => {
    const base = {
      origin: new URL("https://store.example"),
      slug: "bottle",
      name: "Botella",
      images: [],
      variants: [
        {
          sku: "BLUE",
          label: "Azul",
          pricePyg: 100000,
          available: 2,
          attributes: { verifiedAt, values: { color: "azul" } },
        },
        {
          sku: "GREEN",
          label: "Verde",
          pricePyg: 110000,
          available: 0,
          attributes: { verifiedAt, values: { color: "verde" } },
        },
      ],
    };
    expect(productJsonLd(base)["@type"]).toBe("Product");
    CATALOGUE.attributes = [
      {
        key: "color",
        label: "Color",
        scope: "variant",
        schemaProperty: "color",
      },
    ];
    const group = productJsonLd(base);
    expect(group["@type"]).toBe("ProductGroup");
    expect(group.hasVariant).toMatchObject([
      {
        sku: "BLUE",
        offers: {
          url: "https://store.example/producto/bottle?variante=BLUE",
          price: 100000,
          priceCurrency: "PYG",
          availability: "https://schema.org/InStock",
        },
      },
      {
        sku: "GREEN",
        offers: {
          url: "https://store.example/producto/bottle?variante=GREEN",
          availability: "https://schema.org/OutOfStock",
        },
      },
    ]);
    expect(JSON.stringify(group)).not.toMatch(/gtin|aggregateRating/);
    expect(
      productJsonLd({
        ...base,
        variants: [
          base.variants[0]!,
          { ...base.variants[1]!, attributes: { values: { color: "verde" } } },
        ],
      })["@type"]
    ).toBe("Product");
  });
});
