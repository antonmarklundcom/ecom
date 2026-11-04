import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductImage } from "@/components/product-image";
import { META_BASE_IMAGENES, resetBaseImagenesForTests } from "@/lib/images";

/**
 * Placeholder de categoría (plan-crecimiento §6.2.D). Sin base pública de R2
 * (como en este entorno de tests, salvo donde se agrega el `<meta>`) o con una
 * referencia que no es de R2, todo producto cae al placeholder — que es justo
 * el caso que hay que cuidar: sin fotos, la vidriera no puede verse rota ni
 * mostrar "producto genérico" para una categoría que la tienda inventó.
 */
describe("placeholder de ProductImage", () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    resetBaseImagenesForTests();
  });

  function conBase(): void {
    resetBaseImagenesForTests();
    document.head.innerHTML = `<meta name="${META_BASE_IMAGENES}" content="https://img.tienda.test">`;
  }

  it("con base pública, un <picture> con el srcset de las cajas y `sizes` del que llama", () => {
    conBase();
    const { container } = render(
      <ProductImage
        image={{ imageRef: "r2:p1/remera-0123456789@600x800", alt: "Remera de frente", blurDataUrl: null }}
        alt="Remera"
        categorySlug="moda"
        sizes="200px"
      />,
    );
    const img = screen.getByRole("img", { name: "Remera de frente" });
    expect(img).toHaveAttribute("src", "https://img.tienda.test/p1/remera-0123456789.jpg");
    expect(img).toHaveAttribute("width", "600");
    expect(img).toHaveAttribute("height", "800");
    const source = container.querySelector('source[type="image/webp"]');
    expect(source?.getAttribute("srcset")).toBe(
      "https://img.tienda.test/p1/remera-0123456789-240.webp 180w, " +
        "https://img.tienda.test/p1/remera-0123456789-480.webp 360w, " +
        "https://img.tienda.test/p1/remera-0123456789-800.webp 600w",
    );
    expect(source).toHaveAttribute("sizes", "200px");
  });

  it("una referencia vieja que no es de R2 es el placeholder, nunca una URL rota", () => {
    conBase();
    const { container } = render(
      <ProductImage
        image={{ imageRef: "productos/test", alt: "Vieja", blurDataUrl: null }}
        alt="Remera"
        categorySlug="moda"
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/placeholders/moda.svg"),
    );
    expect(container.querySelector("picture")).toBeNull();
  });

  it("una de las cuatro categorías del seed usa su propio dibujo", () => {
    const { container } = render(<ProductImage image={null} alt="Remera azul" categorySlug="moda" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("/placeholders/moda.svg"));
  });

  it("una categoría fuera del seed muestra el placeholder genérico con su nombre", () => {
    const { container } = render(
      <ProductImage image={null} alt="Novela" categorySlug="libros-y-revistas" />,
    );
    expect(screen.getByText("Libros y revistas (sin foto todavía)")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("/placeholders/categoria.svg"));
  });

  it("no rompe con un slug vacío", () => {
    render(<ProductImage image={null} alt="Cosa" categorySlug="" />);
    expect(screen.getByText((text) => text.includes("sin foto todavía"))).toBeInTheDocument();
  });
});
