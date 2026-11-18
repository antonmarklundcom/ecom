import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AddToCart } from "@/components/add-to-cart";
import type { CatalogProductDetail } from "@/db/queries";
import {
  DISPONIBILIDADES,
  SCHEMA_DISPONIBILIDAD,
  disponibilidadPorVariante,
} from "@/domain/disponibilidad";
import { TESTIDS } from "@/lib/testids";
import { productJsonLd } from "@/lib/seo";

/**
 * O35: la línea visible de la ficha y el `Offer` del JSON-LD dicen lo mismo,
 * porque los dos reciben el resultado de la misma función
 * (`disponibilidadPorVariante` → `porSku`), como hace la página.
 */
function producto(): CatalogProductDetail {
  return {
    id: 1,
    slug: "anillo",
    name: "Anillo",
    saleMode: "enquiry",
    showPrice: true,
    brand: null,
    ivaRate: 10,
    categorySlug: "anillos",
    categoryName: "Anillos",
    image: null,
    images: [],
    description: "Un anillo.",
    variants: [
      { id: 7, sku: "AN-7", label: "Talle 7", pricePyg: 900_000, compareAtPyg: null, available: 0 },
    ],
  } as unknown as CatalogProductDetail;
}

describe("línea de disponibilidad = JSON-LD", () => {
  afterEach(cleanup);

  it.each(DISPONIBILIDADES)("%s: la línea y la Offer dicen la misma palabra", (palabra) => {
    const porSku = { "AN-7": palabra };
    const vista = render(<AddToCart product={producto()} disponibilidad={porSku} />);
    const linea = vista.getByTestId(TESTIDS.productAvailability);
    expect(linea.getAttribute("data-disponibilidad")).toBe(palabra);

    const ld = productJsonLd({
      origin: new URL("https://tienda.com.py"),
      slug: "anillo",
      name: "Anillo",
      images: [],
      saleMode: "enquiry",
      variants: producto().variants,
      disponibilidad: porSku,
    }) as { offers: { availability: string }[] };
    expect(ld.offers[0]!.availability).toBe(SCHEMA_DISPONIBILIDAD[palabra]);
  });

  it("con lo que decide la función (sin proveedor): por encargo en los dos", () => {
    const { porSku } = disponibilidadPorVariante(producto(), { modo: "carrito" });
    const vista = render(<AddToCart product={producto()} disponibilidad={porSku} />);
    expect(vista.getByTestId(TESTIDS.productAvailability).textContent).toBe("Por encargo");
  });

  it("vidriera: sin línea", () => {
    const vista = render(
      <AddToCart product={{ ...producto(), saleMode: "showcase" }} disponibilidad={{ "AN-7": null }} />
    );
    expect(vista.queryByTestId(TESTIDS.productAvailability)).toBeNull();
  });
});
