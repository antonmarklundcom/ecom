import { afterEach, describe, expect, it } from "vitest";

import { PUBLIC_FACTS } from "@/config/public-facts";
import {
  effectiveProvenance,
  outsideImages,
  publishableOutside,
} from "@/lib/image-provenance";

/** docs/TEMPLATE-IMPROVEMENT-PLAN.md E2, la regla sin base. */
afterEach(() => {
  PUBLIC_FACTS.publishUnknownImages = true;
});

describe("procedencia de las fotos", () => {
  it("la de cada foto manda sobre la del producto", () => {
    expect(effectiveProvenance("owned-photo", "illustrative")).toBe(
      "owned-photo"
    );
    expect(effectiveProvenance(null, "illustrative")).toBe("illustrative");
    expect(effectiveProvenance(null, undefined)).toBeNull();
    // Un valor que no es del enum (JSON viejo, a mano) es "no se sabe".
    expect(effectiveProvenance("stock-photo", "algo")).toBeNull();
  });

  it("una ilustrativa nunca sale afuera; una sin marcar, según la tienda", () => {
    expect(publishableOutside("illustrative")).toBe(false);
    expect(publishableOutside("supplier-authorized")).toBe(true);
    expect(publishableOutside("owned-photo")).toBe(true);
    expect(publishableOutside(null)).toBe(true);

    PUBLIC_FACTS.publishUnknownImages = false;
    expect(publishableOutside(null)).toBe(false);
    expect(publishableOutside("owned-photo")).toBe(true);
  });

  it("filtra conservando el orden", () => {
    const fotos = [
      { id: 1, provenance: "illustrative" as const },
      { id: 2, provenance: null },
      { id: 3, provenance: "owned-photo" as const },
    ];
    expect(outsideImages(fotos).map((f) => f.id)).toEqual([2, 3]);
    PUBLIC_FACTS.publishUnknownImages = false;
    expect(outsideImages(fotos).map((f) => f.id)).toEqual([3]);
  });
});
