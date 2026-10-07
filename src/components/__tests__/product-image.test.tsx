import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductImage } from "@/components/product-image";

/**
 * Placeholder de categoría (plan-crecimiento §6.2.D). Sin `CLOUDINARY_CLOUD_NAME`
 * cargado (como en este entorno de tests), `productImageUrl` siempre devuelve
 * `null`, así que todo producto cae al placeholder — que es justo el caso que
 * hay que cuidar: sin fotos, la vidriera no puede verse rota ni mostrar
 * "producto genérico" para una categoría que la tienda inventó.
 */
describe("placeholder de ProductImage", () => {
  afterEach(cleanup);

  it("keeps the server-resolved photo when the browser has no Cloudinary setting", () => {
    const url = "https://res.cloudinary.com/disposable-gallery-fixture/image/upload/c_fill,w_160,h_160/productos/test";
    render(
      <ProductImage
        image={{ cloudinaryId: "productos/test", alt: "Actual product", blurDataUrl: null }}
        resolvedUrl={url}
        alt="Product"
        categorySlug="moda"
      />,
    );
    expect(screen.getByRole("img", { name: "Actual product" })).toHaveAttribute("src", url);
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
