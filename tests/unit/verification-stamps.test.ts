import { describe, expect, it } from "vitest";

import {
  ProductSpecificationsSchema,
  SupplierDetailsSchema,
} from "@/lib/product-attributes";
import {
  publicIdentifiers,
  publicSpecifications,
  publicVariantAttributes,
} from "@/lib/public-product-facts";
import { stampVerification } from "@/lib/verification-stamps";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md E1: la verificación la sella el servidor.
 *
 * Antes, `verifiedAt` se tipeaba en un JSON del formulario: cualquiera con
 * acceso al panel podía fecharla en 2001, no quedaba quién, y cambiar los
 * valores sin tocar la fecha publicaba hechos nuevos con un sello viejo.
 */
const ACTOR = { userId: 7, label: "admin:encargada@tienda.test" };
const NOW = new Date("2026-10-07T15:00:00.000Z");
const VIEJO = {
  unit: "unidad",
  values: { capacity: 500 },
  verifiedAt: "2026-01-01T12:00:00.000Z",
};

describe("stampVerification", () => {
  it("una fecha o un autor mandados por el navegador no valen nada", () => {
    const sellado = stampVerification({
      previous: null,
      submitted: {
        values: { capacity: 500 },
        verifiedAt: "2001-01-01T00:00:00.000Z",
        verifiedBy: { userId: 1, label: "admin:otra@tienda.test" },
      },
      confirm: false,
      actor: ACTOR,
      now: NOW,
    });
    expect(sellado).toEqual({ values: { capacity: 500 } });
  });

  it("confirmar sella con la hora del servidor y la sesión", () => {
    expect(
      stampVerification({
        previous: null,
        submitted: { values: { capacity: 500 } },
        confirm: true,
        actor: ACTOR,
        now: NOW,
      })
    ).toEqual({
      values: { capacity: 500 },
      verifiedAt: NOW.toISOString(),
      verifiedBy: ACTOR,
    });
  });

  it("guardar sin cambios conserva el sello histórico, sin inventarle autor", () => {
    expect(
      stampVerification({
        previous: VIEJO,
        submitted: { unit: "unidad", values: { capacity: 500 } },
        confirm: false,
        actor: ACTOR,
        now: NOW,
      })
    ).toEqual(VIEJO);
  });

  it("cambiar los valores sin confirmar los deja sin verificar", () => {
    expect(
      stampVerification({
        previous: VIEJO,
        submitted: { unit: "unidad", values: { capacity: 750 } },
        confirm: false,
        actor: ACTOR,
        now: NOW,
      })
    ).toEqual({ unit: "unidad", values: { capacity: 750 } });
  });

  it("sin sesión (importación, CLI) no se puede confirmar", () => {
    expect(
      stampVerification({
        previous: null,
        submitted: { values: { capacity: 500 } },
        confirm: true,
        actor: null,
        now: NOW,
      })
    ).toEqual({ values: { capacity: 500 } });
  });

  it("undefined no toca y null borra", () => {
    const base = { previous: VIEJO, confirm: false, actor: ACTOR, now: NOW };
    expect(
      stampVerification({ ...base, submitted: undefined })
    ).toBeUndefined();
    expect(stampVerification({ ...base, submitted: null })).toBeNull();
  });

  it("los schemas aceptan el autor sellado", () => {
    expect(
      ProductSpecificationsSchema.parse({ ...VIEJO, verifiedBy: ACTOR })
    ).toMatchObject({ verifiedBy: ACTOR });
    expect(
      SupplierDetailsSchema.parse({ reference: "X", verifiedBy: ACTOR })
    ).toMatchObject({ verifiedBy: ACTOR });
  });
});

describe("lo público nunca lleva quién verificó (E1)", () => {
  it("ficha, atributos e identificadores sin verifiedBy", () => {
    expect(
      publicSpecifications({ ...VIEJO, verifiedBy: ACTOR })
    ).not.toHaveProperty("verifiedBy");
    expect(
      publicVariantAttributes({
        values: { color: "azul" },
        verifiedAt: VIEJO.verifiedAt,
        verifiedBy: ACTOR,
      })
    ).not.toHaveProperty("verifiedBy");
    expect(
      publicIdentifiers({
        gtin: "4006381333931",
        verifiedAt: VIEJO.verifiedAt,
        verifiedBy: ACTOR,
      })
    ).not.toHaveProperty("verifiedBy");
  });
});

describe("la URL del proveedor (E4)", () => {
  it.each(["no es una url", "https://", "::::", "http://proveedor.test/x"])(
    "%s es un error de validación, no una excepción",
    (sourceUrl) => {
      const parsed = SupplierDetailsSchema.safeParse({ sourceUrl });
      expect(parsed.success).toBe(false);
    }
  );

  it("una URL https entra", () => {
    expect(
      SupplierDetailsSchema.parse({ sourceUrl: "https://proveedor.test/ficha" })
        .sourceUrl
    ).toBe("https://proveedor.test/ficha");
  });
});
