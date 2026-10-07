import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddToCart } from "@/components/add-to-cart";
import { PriceTag } from "@/components/price-tag";
import { ProductCard } from "@/components/product-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import type { CatalogProductDetail } from "@/db/queries";
import { CART_STORAGE_KEY } from "@/lib/cart-store";
import { TESTIDS } from "@/lib/testids";

/**
 * ₲0 no es un precio (docs/TEMPLATE-IMPROVEMENT-PLAN.md A1). Una fila vieja
 * o un producto de consulta todavía sin precio no puede aparecer como
 * mercadería gratis en ninguna tarjeta.
 */
const ZERO = /₲\s*0(?!\d|\.)/;

const product: CatalogProductDetail = {
  id: 1,
  slug: "sin-precio",
  name: "Sin precio",
  saleMode: "stock",
  showPrice: true,
  brand: null,
  ivaRate: 10,
  categorySlug: "general",
  categoryName: "General",
  image: null,
  images: [],
  description: null,
  variants: [
    {
      id: 1,
      sku: "CERO-1",
      label: "Única",
      pricePyg: 0,
      compareAtPyg: 50_000,
      available: 0,
    },
  ],
};

describe("₲0 nunca se muestra como precio", () => {
  afterEach(cleanup);

  it("PriceTag no dibuja un precio que no se puede cobrar", () => {
    const { container } = render(
      <PriceTag pricePyg={0} compareAtPyg={50_000} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("la tarjeta de producto omite el precio y el descuento de −100%", () => {
    render(<ProductCard product={product} />);
    const card = screen.getByTestId(TESTIDS.productCard);
    expect(card.textContent).not.toMatch(ZERO);
    expect(card.textContent).not.toContain("−100%");
  });

  it("la ficha de un producto de consulta sin precio no lo anuncia como orientativo", () => {
    render(<AddToCart product={{ ...product, saleMode: "enquiry" }} />);
    expect(document.body.textContent).not.toMatch(ZERO);
    expect(screen.queryByText(/orientativo/i)).not.toBeInTheDocument();
  });
});

describe("vistos recientemente sin precio", () => {
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

  it("muestra la ficha guardada sin precio, y también una vieja guardada en 0", () => {
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          slug: "vieja-en-cero",
          name: "Vieja en cero",
          pricePyg: 0,
          imageCloudinaryId: null,
          imageAlt: null,
        },
      ])
    );

    render(
      <RecentlyViewed
        current={{
          slug: "actual",
          name: "Actual",
          pricePyg: null,
          imageCloudinaryId: null,
          imageAlt: null,
        }}
      />
    );
    act(() => {
      vi.runAllTimers();
    });

    const item = screen.getByTestId(TESTIDS.recentlyViewedItem);
    expect(item).toHaveAttribute("data-slug", "vieja-en-cero");
    expect(item.textContent).not.toMatch(ZERO);

    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
      slug: string;
      pricePyg: number | null;
    }>;
    expect(stored.find((entry) => entry.slug === "actual")?.pricePyg).toBe(
      null
    );
  });
});
