import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SupplierOffersEditor,
  type SupplierOfferView,
} from "@/components/admin/supplier-offers-editor";
import { TESTIDS } from "@/lib/testids";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/actions/admin-products", () => ({
  saveVariantSupplierOffer: mocks.save,
  deleteVariantSupplierOffer: mocks.remove,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const offer: SupplierOfferView = {
  id: 1,
  source: "Mayorista del centro",
  sourceType: "local",
  unitCostPyg: 23_000,
  productUrl: "https://proveedor.test/producto/13535",
  supplierUrl: null,
  supplierStock: 111,
  notes: null,
  isConfirmed: true,
  isActive: true,
  isPreferred: true,
  checkedOn: "2026-10-08",
};

const variant = (offers: SupplierOfferView[]) => ({
  id: 2,
  sku: "AFILADOR",
  label: "Único",
  pricePyg: 69_000,
  offers,
});

describe("editor de ofertas de proveedores", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ ok: true, offerId: 9 });
    mocks.remove.mockResolvedValue({ ok: true });
  });

  it("muestra las alternativas, el stock declarado y el margen de cada una", () => {
    render(
      <SupplierOffersEditor
        productId={3}
        variants={[
          variant([
            offer,
            {
              ...offer,
              id: 2,
              source: "Importador",
              sourceType: "import",
              unitCostPyg: 18_000,
              isPreferred: false,
              isConfirmed: false,
            },
          ]),
        ]}
      />
    );
    expect(screen.getByTestId(TESTIDS.adminSupplierOffers)).toBeInTheDocument();
    expect(
      screen.getByText("Preferido · usado para el margen")
    ).toBeInTheDocument();
    expect(screen.getByText("Pendiente de comparar")).toBeInTheDocument();
    expect(screen.getAllByText(/Stock del proveedor: 111/)).toHaveLength(2);
    // (69.000 − 23.000) / 69.000 = 66,7 %.
    expect(screen.getByText(/Margen bruto: 66\.7 %/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Producto en el sitio del proveedor" })[0]
    ).toHaveAttribute("href", offer.productUrl);
  });

  it("una oferta nueva sin costo se guarda pendiente: ni confirmada ni preferida", async () => {
    render(<SupplierOffersEditor productId={3} variants={[variant([])]} />);
    expect(
      screen.getByText("Todavía no hay proveedores para esta variante.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));
    fireEvent.change(screen.getByLabelText("Proveedor"), {
      target: { value: "Proveedor nuevo de CDE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar oferta" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 3,
          variantId: 2,
          offerId: undefined,
          source: "Proveedor nuevo de CDE",
          sourceType: "other",
          unitCostPyg: null,
          supplierStock: null,
          checkedOn: null,
          isConfirmed: false,
          isPreferred: false,
          isActive: true,
        })
      )
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("muestra el error de la acción y no cierra el formulario", async () => {
    mocks.save.mockResolvedValue({
      ok: false,
      error: "Revisá los campos marcados.",
      fields: { productUrl: "Usá un enlace https:// sin usuario ni contraseña." },
    });
    render(<SupplierOffersEditor productId={3} variants={[variant([offer])]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar oferta" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Revisá los campos marcados."
      )
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: 1, unitCostPyg: 23_000 })
    );
    expect(
      screen.getByText("Usá un enlace https:// sin usuario ni contraseña.")
    ).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
