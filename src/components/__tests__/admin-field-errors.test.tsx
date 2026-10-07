import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductForm } from "@/components/admin/product-form";
import { SettingsSectionForm } from "@/components/admin/store-settings-form";
import { VariantEditor } from "@/components/admin/variant-editor";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md F1: un error de validación del panel
 * queda pegado a su campo (`aria-invalid` + `aria-describedby`) y el foco va
 * ahí, abriendo la sección plegada que lo tenga.
 */
const saveProduct = vi.fn();
const saveProductVariant = vi.fn();
vi.mock("@/app/actions/admin-products", () => ({
  saveProduct: (input: unknown) => saveProduct(input),
  saveProductVariant: (input: unknown) => saveProductVariant(input),
  adjustVariantStock: vi.fn(),
}));
const guardarAjustes = vi.fn();
vi.mock("@/app/actions/admin-ajustes", () => ({
  guardarAjustes: (input: unknown) => guardarAjustes(input),
  restaurarAjustes: vi.fn(),
  quitarImagenMarca: vi.fn(),
  quitarImagenPortada: vi.fn(),
  subirImagenMarca: vi.fn(),
  subirImagenPortada: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const defaults = {
  slug: "botella",
  name: "Botella",
  description: "",
  categoryId: 1,
  brand: "",
  ivaRate: 10,
  isActive: true,
  published: false,
  isFeatured: false,
};

describe("errores por campo en el panel", () => {
  it("el campo con error queda marcado, describe el error y recibe el foco", async () => {
    saveProduct.mockResolvedValue({
      ok: false,
      error: "Revisá los campos marcados.",
      fields: { slug: "El slug va en minúsculas y con guiones: remera-azul" },
    });
    render(
      <ProductForm
        defaults={defaults}
        categories={[{ id: 1, name: "Hogar" }]}
      />
    );
    fireEvent.submit(screen.getByLabelText(/Nombre/).closest("form")!);

    const slug = await screen.findByRole("textbox", { name: /slug|URL/i });
    await waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"));
    const descripcion = document.getElementById(
      slug.getAttribute("aria-describedby")!.split(" ").at(-1)!
    );
    expect(descripcion).toHaveTextContent("minúsculas y con guiones");
    expect(slug).toHaveFocus();
  });

  it("un JSON roto de una sección plegada la abre y enfoca ese campo", async () => {
    render(
      <ProductForm
        defaults={defaults}
        categories={[{ id: 1, name: "Hogar" }]}
      />
    );
    const specs = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="specifications"]'
    )!;
    fireEvent.change(specs, { target: { value: "{ roto" } });
    fireEvent.submit(specs.closest("form")!);

    await waitFor(() => expect(specs).toHaveAttribute("aria-invalid", "true"));
    expect(specs.closest("details")!.open).toBe(true);
    expect(specs).toHaveFocus();
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it("la variante marca el SKU repetido", async () => {
    saveProductVariant.mockResolvedValue({
      ok: false,
      error: "Revisá los campos marcados.",
      fields: { sku: "El SKU BOT-1 ya existe." },
    });
    render(<VariantEditor productId={1} variants={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Agregar variante/i }));
    const sku = await screen.findByLabelText(/SKU/);
    fireEvent.submit(sku.closest("form")!);

    await waitFor(() => expect(sku).toHaveAttribute("aria-invalid", "true"));
    expect(sku).toHaveFocus();
  });

  it("ajustes: marca el campo que dibujó la página, aunque esté plegado", async () => {
    guardarAjustes.mockResolvedValue({
      ok: false,
      error: "No se guardó: el link tiene que empezar con https://",
      fields: { instagram: "El link tiene que empezar con https://" },
    });
    render(
      <SettingsSectionForm seccion="contacto" campos={{ instagram: "texto" }}>
        <details>
          <summary>Redes</summary>
          <label htmlFor="instagram">Instagram</label>
          <input id="instagram" name="instagram" defaultValue="http://x" />
        </details>
      </SettingsSectionForm>
    );
    const campo = screen.getByLabelText("Instagram");
    fireEvent.submit(campo.closest("form")!);

    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveFocus();
    expect(campo.closest("details")!.open).toBe(true);
    const mensaje = document.getElementById(
      campo.getAttribute("aria-describedby")!
    );
    expect(mensaje).toHaveTextContent("https://");
  });
});
