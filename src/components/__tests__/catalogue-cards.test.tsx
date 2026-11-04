import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductCard } from "@/components/product-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import type { CatalogProduct } from "@/db/queries";
import { CART_STORAGE_KEY } from "@/lib/cart-store";
import { META_BASE_IMAGENES, resetBaseImagenesForTests } from "@/lib/images";
import { TESTIDS } from "@/lib/testids";

/**
 * Tarjetas del catálogo (docs/TEMPLATE-IMPROVEMENT-PLAN.md F3, F6).
 */
const product: CatalogProduct = {
  id: 1,
  slug: "botella",
  name: "Botella",
  saleMode: "stock",
  showPrice: true,
  brand: null,
  ivaRate: 10,
  categorySlug: "hogar",
  categoryName: "Hogar",
  image: {
    imageRef: "r2:p1/botella-0123456789@1200x1200",
    blurDataUrl: null,
    alt: "Botella de frente",
    provenance: "illustrative",
  },
  variants: [
    {
      id: 1,
      sku: "BOT-1",
      label: "Única",
      pricePyg: 50_000,
      compareAtPyg: null,
      available: 3,
    },
  ],
};

// La base pública de prueba, como la deja el layout en el `<meta>`, para que
// la foto se dibuje en vez del placeholder.
beforeEach(() => {
  resetBaseImagenesForTests();
  document.head.innerHTML = `<meta name="${META_BASE_IMAGENES}" content="https://img.tienda.test">`;
});
afterEach(() => {
  document.head.innerHTML = "";
  resetBaseImagenesForTests();
});

describe("tarjeta de producto", () => {
  afterEach(cleanup);

  it("el corazón no está adentro del link (contenido interactivo anidado)", () => {
    render(<ProductCard product={product} />);
    const link = screen.getByTestId(TESTIDS.productCard);
    const heart = screen.getByTestId(TESTIDS.wishlistButton);

    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/producto/botella");
    expect(link).toHaveAttribute("data-slug", "botella");
    expect(link.contains(heart)).toBe(false);
    expect(link.querySelector("button")).toBeNull();
    expect(link.textContent).not.toMatch(/favoritos/i);
  });

  it("una foto ilustrativa lleva su leyenda también en la tarjeta", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByTestId(TESTIDS.productCard).textContent).toContain(
      "Imagen ilustrativa"
    );

    cleanup();
    render(
      <ProductCard
        product={{
          ...product,
          image: { ...product.image!, provenance: "owned-photo" },
        }}
      />
    );
    expect(screen.getByTestId(TESTIDS.productCard).textContent).not.toContain(
      "Imagen ilustrativa"
    );
  });
});

describe("vistos recientemente", () => {
  const key = `${CART_STORAGE_KEY}-vistos`;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  function mostrar(guardados: unknown[]) {
    localStorage.setItem(key, JSON.stringify(guardados));
    render(
      <RecentlyViewed
        current={{
          slug: "actual",
          name: "Actual",
          pricePyg: null,
          imageRef: null,
          imageAlt: null,
        }}
      />
    );
    act(() => {
      vi.runAllTimers();
    });
  }

  it("una foto ilustrativa conserva su leyenda", () => {
    mostrar([
      {
        slug: "botella",
        name: "Botella",
        pricePyg: 50_000,
        imageRef: "r2:p1/botella-0123456789@1200x1200",
        imageAlt: "Botella de frente",
        imageIllustrative: true,
      },
    ]);
    expect(
      screen.getByTestId(TESTIDS.recentlyViewedItem).textContent
    ).toContain("Imagen ilustrativa");
  });

  it("el dibujo genérico no dice ser el producto", () => {
    mostrar([
      {
        slug: "sin-foto",
        name: "Sin foto",
        pricePyg: 50_000,
        imageRef: null,
        imageAlt: null,
      },
    ]);
    const item = screen.getByTestId(TESTIDS.recentlyViewedItem);
    expect(item.querySelector("img")).toHaveAttribute("alt", "");
  });
});
