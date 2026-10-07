import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttributeFilters } from "@/components/attribute-filters";
import { CatalogFilters } from "@/components/catalog-filters";
import { FilterDisclosure } from "@/components/filter-disclosure";

/**
 * Filtros de categoría (docs/TEMPLATE-IMPROVEMENT-PLAN.md F4).
 */
const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  push.mockReset();
});
afterEach(cleanup);

const facets = [
  {
    key: "color",
    label: "Color",
    values: [
      { value: "azul", total: 2 },
      { value: "rojo", total: 0 },
    ],
  },
  { key: "material", label: "Material", values: [] },
];

describe("filtros de categoría", () => {
  it("en el celular se pliegan detrás de un botón que dice cuántos hay puestos", () => {
    render(
      <FilterDisclosure activeCount={2}>
        <p>controles</p>
      </FilterDisclosure>
    );
    const toggle = screen.getByRole("button", { name: /Filtros \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!
    );
    expect(panel).toHaveClass("hidden");
    expect(panel).toHaveClass("md:block");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("hidden");
  });

  it("sin precios visibles en la categoría no ofrece el filtro de precio", () => {
    search = "";
    render(<CatalogFilters brands={[]} showPrice={false} />);
    expect(
      screen.queryByRole("combobox", { name: "Filtrar por precio" })
    ).not.toBeInTheDocument();
    cleanup();
    render(<CatalogFilters brands={[]} />);
    expect(
      screen.getByRole("combobox", { name: "Filtrar por precio" })
    ).toBeInTheDocument();
  });

  it("una opción que no devolvería nada queda deshabilitada; un atributo sin valores no se dibuja", () => {
    search = "";
    render(<AttributeFilters facets={facets} />);
    const color = screen.getByRole("combobox", { name: "Color" });
    const rojo = Array.from((color as HTMLSelectElement).options).find(
      (option) => option.value === "rojo"
    );
    expect(rojo?.disabled).toBe(true);
    expect(
      screen.queryByRole("combobox", { name: "Material" })
    ).not.toBeInTheDocument();
  });

  it("muestra los atributos y el stock como chips, y 'Limpiar todo' conserva el orden", () => {
    search = "marca=Norte&atributo.color=azul&stock=1&orden=precio-asc&page=2";
    render(<CatalogFilters brands={[]} facets={facets} />);

    expect(
      screen.getByRole("button", { name: /Quitar el filtro Color: azul/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Quitar el filtro Con stock/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar todo" }));
    expect(push).toHaveBeenCalledWith("?orden=precio-asc", { scroll: false });
  });
});
