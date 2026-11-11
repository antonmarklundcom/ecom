import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContactoEfectivo } from "@/domain/store-settings-schema";
import { TESTIDS } from "@/lib/testids";
import {
  VARIANTES_FOOTER,
  VARIANTES_HEADER,
  type VarianteFooter,
  type VarianteHeader,
} from "@/themes/tipos";

import { pielDelTemplate } from "../../../tests/helpers/piel";

// Lo que no corre en jsdom (server actions, sesión, base) no es lo que se
// prueba acá: se prueba el armado de cada variante.
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

type Categoria = { id: number; slug: string; name: string };
/**
 * Las props se escriben acá y los componentes se leen del módulo, no con un
 * import con nombre: un `site-footer.tsx` que una tienda rediseñó no exporta
 * `FooterVariante`, y el test tiene que compilar ahí también (el typecheck de
 * la tienda corre sobre los tests aunque el caso salga skipped).
 */
type PropsHeader = {
  variante: VarianteHeader;
  categories: readonly Categoria[];
  marca: { nombre: string; logoUrl: string | null };
};
type PropsFooter = {
  variante: VarianteFooter;
  nombre: string;
  tagline: string;
  categories: readonly Categoria[];
  contacto: ContactoEfectivo;
  paginas: Array<{ slug: string; titulo: string }>;
};

const HeaderVariante = (
  (await import("@/components/site-header")) as unknown as {
    HeaderVariante: ComponentType<PropsHeader>;
  }
).HeaderVariante;
const FooterVariante = (
  (await import("@/components/site-footer")) as unknown as {
    FooterVariante: ComponentType<PropsFooter>;
  }
).FooterVariante;

afterEach(cleanup);

const CATEGORIAS = [
  { id: 1, slug: "remeras", name: "Remeras" },
  { id: 2, slug: "pantalones", name: "Pantalones" },
];

const CONTACTO: ContactoEfectivo = {
  whatsapp: "+595981123456",
  email: "hola@mitienda.com.py",
  direccion: "Palma 123",
  horario: "Lun a vie 8-18",
  redes: [{ red: "instagram", url: "https://instagram.com/mitienda" }],
};

/**
 * Las variantes de header y pie del kit de temas (`src/themes/`). El contrato
 * con `tests/e2e/**` son los `data-testid` (`src/lib/testids.ts`): un tema que
 * cambia de variante no puede llevarse uno. Por eso se prueban **todas** las
 * variantes con la misma lista y no sólo la del default.
 *
 * Test de **piel del template** (`TESTS_DE_PIEL`): una tienda que rediseñó su
 * header o su pie ya no tiene las variantes del kit, y ese bloque sale
 * skipped. Los `data-testid` de su header los sigue exigiendo `tests/e2e/**`.
 */
describe.runIf(pielDelTemplate("src/components/site-header.tsx"))("variantes de header", () => {
  for (const variante of VARIANTES_HEADER) {
    it(`${variante}: mismos testids, marca y buscadores`, () => {
      const { container } = render(
        <HeaderVariante
          variante={variante}
          categories={CATEGORIAS}
          marca={{ nombre: "Mi Tienda", logoUrl: null }}
        />
      );

      const header = container.querySelector("header[data-site-header]");
      expect(
        header,
        "sin data-site-header el panel no lo esconde"
      ).not.toBeNull();

      const links = screen.getAllByTestId(TESTIDS.headerCategoryLink);
      expect(links.map((link) => link.getAttribute("data-slug"))).toEqual([
        "remeras",
        "pantalones",
      ]);
      expect(links[0]).toHaveAttribute("href", "/categoria/remeras");
      expect(screen.getByTestId(TESTIDS.headerCartLink)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Mi Tienda" })).toHaveAttribute(
        "href",
        "/"
      );
      // Uno para desktop y otro para el celular.
      expect(screen.getAllByRole("search")).toHaveLength(2);
    });
  }

  it("con logo, el logo lleva el nombre como alt", () => {
    for (const variante of VARIANTES_HEADER) {
      render(
        <HeaderVariante
          variante={variante}
          categories={[]}
          marca={{
            nombre: "Mi Tienda",
            logoUrl: "https://res.example/logo.png",
          }}
        />
      );
      expect(
        screen.getByRole("img", { name: "Mi Tienda" })
      ).toBeInTheDocument();
      cleanup();
    }
  });
});

describe.runIf(pielDelTemplate("src/components/site-footer.tsx"))("variantes de pie", () => {
  for (const variante of VARIANTES_FOOTER) {
    it(`${variante}: mismo contenido`, () => {
      const { container } = render(
        <FooterVariante
          variante={variante}
          nombre="Mi Tienda"
          tagline="Lo mejor de Asunción"
          categories={CATEGORIAS}
          contacto={CONTACTO}
          paginas={[{ slug: "envios", titulo: "Envíos" }]}
        />
      );

      const footer = container.querySelector("footer[data-site-footer]");
      expect(
        footer,
        "sin data-site-footer el panel no lo esconde"
      ).not.toBeNull();
      const pie = within(footer as HTMLElement);
      expect(pie.getByText("Mi Tienda")).toBeInTheDocument();
      expect(pie.getByText("Lo mejor de Asunción")).toBeInTheDocument();
      expect(pie.getByRole("link", { name: "Remeras" })).toHaveAttribute(
        "href",
        "/categoria/remeras"
      );
      expect(pie.getByRole("link", { name: "Envíos" })).toHaveAttribute(
        "href",
        "/envios"
      );
      expect(pie.getByRole("link", { name: "Instagram" })).toBeInTheDocument();
      expect(
        pie.getByRole("link", { name: "hola@mitienda.com.py" })
      ).toHaveAttribute("href", "mailto:hola@mitienda.com.py");
      expect(pie.getByText("Palma 123")).toBeInTheDocument();
      expect(pie.getByText(/981/)).toBeInTheDocument();
      expect(pie.getByRole("link", { name: /pedido/i })).toHaveAttribute(
        "href",
        "/pedido/buscar"
      );
    });
  }
});
