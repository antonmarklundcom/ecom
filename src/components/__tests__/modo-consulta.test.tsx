import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogProduct } from "@/db/queries";
import type { ContactoEfectivo } from "@/domain/store-settings-schema";
import type { ModoVenta } from "@/domain/modo-venta";
import { TESTIDS } from "@/lib/testids";

import { pielDelTemplate } from "../../../tests/helpers/piel";

// Lo que no corre en jsdom (server actions, sesión, base): igual que en
// `tema-variantes.test.tsx`.
vi.mock("@/components/search-box", () => ({
  SearchBox: () => <form role="search" />,
}));
vi.mock("@/components/cuenta/header-entry", () => ({
  CuentaHeaderEntry: () => null,
}));
vi.mock("@/db/queries", () => ({ getCategories: vi.fn(async () => []) }));
vi.mock("@/lib/marca", () => ({ marcaEfectiva: vi.fn() }));
vi.mock("@/domain/store-settings", () => ({ getStoreSettings: vi.fn() }));
vi.mock("@/lib/comercio", () => ({ contactoPublico: vi.fn() }));
vi.mock("@/lib/paginas", () => ({ paginasActivas: vi.fn() }));

/**
 * Modo consulta en la vidriera (O32, fable/plan-trafico.md §2.1 y §5.1): la
 * tarjeta, el header, el pie y la barra fija del celular.
 *
 * Test de **piel del template** (`TESTS_DE_PIEL`): mira cómo lo dibujan los
 * componentes del template. Una tienda que los rediseñó es dueña de su markup
 * y estos bloques salen skipped; el contrato que sigue valiendo ahí es el del
 * servidor (el pedido rechazado, las páginas en 404) y el e2e.
 *
 * Los componentes se leen del módulo y no por import con nombre, por el mismo
 * motivo que en `tema-variantes.test.tsx`: un archivo rediseñado puede no
 * exportarlos, y el test tiene que compilar igual.
 */
type Categoria = { id: number; slug: string; name: string };

const { ProductCard } = (await import("@/components/product-card")) as unknown as {
  ProductCard: ComponentType<{ product: CatalogProduct; modoVenta?: ModoVenta }>;
};
const header = (await import("@/components/site-header")) as unknown as {
  HeaderVariante: ComponentType<{
    variante: "clasico" | "centrado";
    categories: readonly Categoria[];
    marca: { nombre: string; logoUrl: string | null };
    conCarrito?: boolean;
  }>;
  CategoriasDesplegable?: ComponentType<{
    categories: readonly Categoria[];
    como?: "categorias" | "menu";
  }>;
};
const { FooterVariante } = (await import("@/components/site-footer")) as unknown as {
  FooterVariante: ComponentType<{
    variante: "columnas" | "compacto";
    nombre: string;
    tagline: string;
    categories: readonly Categoria[];
    contacto: ContactoEfectivo;
    paginas: Array<{ slug: string; titulo: string }>;
    seguirPedido?: boolean;
  }>;
};
const { StickyBuyBar } = (await import("@/components/sticky-buy-bar")) as unknown as {
  StickyBuyBar: ComponentType<{
    targetId: string;
    name: string;
    price: string | null;
    consulta?: { porSku: Record<string, string>; porDefecto: string } | null;
  }>;
};

afterEach(cleanup);

const producto: CatalogProduct = {
  id: 1,
  slug: "anillo",
  name: "Anillo",
  saleMode: "stock",
  showPrice: true,
  brand: null,
  ivaRate: 10,
  categorySlug: "anillos",
  categoryName: "Anillos",
  image: null,
  variants: [
    {
      id: 1,
      sku: "AN-1",
      label: "Único",
      pricePyg: 150_000,
      compareAtPyg: null,
      available: 0,
    },
  ],
};

const CATEGORIAS = [{ id: 1, slug: "anillos", name: "Anillos" }];

describe.runIf(pielDelTemplate("src/components/product-card.tsx"))("tarjeta en modo consulta", () => {
  it("un producto stock se dibuja como consulta, sin 'sin stock'", () => {
    render(<ProductCard product={producto} modoVenta="consulta" />);
    expect(screen.getByText(/Consultá disponibilidad/)).toBeInTheDocument();
    expect(screen.queryByText(/sin stock/i)).toBeNull();
  });

  it("en carrito (y sin el dato) es la de siempre", () => {
    render(<ProductCard product={producto} />);
    expect(screen.queryByText(/Consultá disponibilidad/)).toBeNull();
  });
});

describe.runIf(pielDelTemplate("src/components/site-header.tsx"))("header en modo consulta", () => {
  for (const variante of ["clasico", "centrado"] as const) {
    it(`${variante}: sin carrito con conCarrito=false, con carrito por defecto`, () => {
      const marca = { nombre: "Mi Tienda", logoUrl: null };
      render(
        <header.HeaderVariante
          variante={variante}
          categories={CATEGORIAS}
          marca={marca}
          conCarrito={false}
        />
      );
      expect(screen.queryByTestId(TESTIDS.headerCartLink)).toBeNull();
      expect(screen.getAllByTestId(TESTIDS.headerCategoryLink)).toHaveLength(1);
      cleanup();
      render(
        <header.HeaderVariante variante={variante} categories={CATEGORIAS} marca={marca} />
      );
      expect(screen.getByTestId(TESTIDS.headerCartLink)).toBeInTheDocument();
    });
  }

  it("el desplegable de categorías lleva el trigger y los mismos links", () => {
    const Desplegable = header.CategoriasDesplegable!;
    render(<Desplegable categories={CATEGORIAS} />);
    expect(screen.getByTestId(TESTIDS.headerCategoriesTrigger)).toBeInTheDocument();
    expect(screen.getByTestId(TESTIDS.headerCategoryLink)).toHaveAttribute(
      "href",
      "/categoria/anillos"
    );
    cleanup();
    render(<Desplegable categories={CATEGORIAS} como="menu" />);
    expect(screen.getByTestId(TESTIDS.headerMenuTrigger)).toBeInTheDocument();
  });
});

describe.runIf(pielDelTemplate("src/components/site-footer.tsx"))("pie en modo consulta", () => {
  const CONTACTO: ContactoEfectivo = {
    whatsapp: "+595981123456",
    email: null,
    direccion: null,
    horario: null,
    redes: [],
  };
  for (const variante of ["columnas", "compacto"] as const) {
    it(`${variante}: sin "Seguí tu pedido" en consulta`, () => {
      const props = {
        variante,
        nombre: "Mi Tienda",
        tagline: "x",
        categories: CATEGORIAS,
        contacto: CONTACTO,
        paginas: [],
      };
      const { container } = render(<FooterVariante {...props} seguirPedido={false} />);
      expect(container.querySelector('a[href="/pedido/buscar"]')).toBeNull();
      cleanup();
      const conPedidos = render(<FooterVariante {...props} />);
      expect(conPedidos.container.querySelector('a[href="/pedido/buscar"]')).not.toBeNull();
    });
  }
});

describe.runIf(pielDelTemplate("src/components/sticky-buy-bar.tsx"))("barra fija en modo consulta", () => {
  it("es el botón de WhatsApp, con el link de la variante de la URL", async () => {
    let avisar: ((entradas: Array<{ isIntersecting: boolean }>) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof avisar) {
          avisar = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    document.body.innerHTML = '<div id="comprar"></div>';
    render(
      <StickyBuyBar
        targetId="comprar"
        name="Anillo"
        price={null}
        consulta={{
          porSku: { "AN-1": "https://chat.example/?text=uno", "AN-2": "https://chat.example/?text=dos" },
          porDefecto: "https://chat.example/?text=uno",
        }}
      />,
      { container: document.body.appendChild(document.createElement("div")) }
    );
    await act(async () => avisar?.([{ isIntersecting: false }]));

    const link = screen.getByTestId(TESTIDS.stickyInquiryLink);
    expect(link).toHaveAttribute("href", "https://chat.example/?text=uno");
    window.history.replaceState(null, "", "/producto/anillo?variante=AN-2");
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(link).toHaveAttribute("href", "https://chat.example/?text=dos");
    expect(screen.queryByRole("button", { name: /comprar/i })).toBeNull();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });
});
