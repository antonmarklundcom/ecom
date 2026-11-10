import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogImportSummary } from "@/app/actions/admin-products";
import { CatalogImportForm } from "@/components/admin/catalog-import";

/**
 * La carga por planilla del panel: vista previa → revisión de duplicados →
 * confirmación por lotes, en orden, con el avance a la vista y el aviso
 * honesto cuando se corta la conexión a mitad de un lote.
 */

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/app/actions/admin-products", () => ({
  previewCatalogImport: mocks.preview,
  applyCatalogImport: mocks.apply,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const RESUMEN: CatalogImportSummary = {
  productosNuevos: 30,
  productosActualizar: 0,
  variantesNuevas: 40,
  variantesActualizar: 0,
  categoriasNuevas: ["Mate"],
  pisaStock: false,
  fotosNuevas: 0,
  preciosCambian: 0,
  stockCambiaria: 0,
  requiereDuenio: false,
  advertencias: [],
  duplicados: [],
  proveedores: false,
  ofertasNuevas: 0,
  ofertasActualizar: 0,
  lotes: 2,
  tamLote: 25,
  revision: "1.abc.def",
};

function lote(n: number, productos: number) {
  return {
    ok: true as const,
    lote: n,
    lotes: 2,
    productos,
    variantesEscritas: productos,
    ofertasNuevas: 0,
    ofertasActualizadas: 0,
    fotosSubidas: 0,
    fotosOmitidas: 0,
    fotosFallidas: [],
  };
}

async function revisar(resumen: CatalogImportSummary = RESUMEN) {
  mocks.preview.mockResolvedValue({ ok: true, ...resumen });
  render(<CatalogImportForm />);
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: {
      files: [new File(["SKU;Producto"], "catalogo.csv", { type: "text/csv" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
  return screen.findByRole("button", { name: "Confirmar e importar" });
}

describe("CatalogImportForm", () => {
  beforeEach(() => {
    mocks.preview.mockReset();
    mocks.apply.mockReset();
  });
  afterEach(cleanup);

  it("confirma lote por lote, en orden, con la firma de la vista previa", async () => {
    mocks.apply
      .mockResolvedValueOnce(lote(0, 25))
      .mockResolvedValueOnce(lote(1, 5));
    fireEvent.click(await revisar());

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
    const enviados = mocks.apply.mock.calls.map(([form]) => form as FormData);
    expect(enviados.map((form) => form.get("lote"))).toEqual(["0", "1"]);
    expect(enviados.every((form) => form.get("revision") === "1.abc.def")).toBe(
      true
    );
    expect(await screen.findByText(/Lote 2 de 2 guardado/)).toBeTruthy();
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        expect.stringContaining("30 productos")
      )
    );
  });

  it("con posibles duplicados no deja confirmar hasta marcarlos como revisados", async () => {
    mocks.apply.mockResolvedValue(lote(0, 25));
    const confirmar = await revisar({
      ...RESUMEN,
      lotes: 1,
      duplicados: ['Posible repetido: "Termo" y "Termo 1 L"'],
    });
    expect(screen.getByText(/Posible repetido/)).toBeTruthy();
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Los revisé/));
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledOnce());
    expect(
      (mocks.apply.mock.calls[0]![0] as FormData).get("duplicadosRevisados")
    ).toBe("true");
  });

  it("si se corta la conexión, dice qué lotes quedaron y que del último no se sabe", async () => {
    mocks.apply
      .mockResolvedValueOnce(lote(0, 25))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(await revisar());

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("lote 2 de 2");
    expect(alerta.textContent).toContain("25 productos");
    expect(alerta.textContent).toContain("no se puede saber");
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("un lote que falla frena los siguientes y muestra el error del servidor", async () => {
    mocks.apply.mockResolvedValueOnce({
      ok: false,
      errores: ['El SKU "GEN-055" ya existe en la base'],
    });
    fireEvent.click(await revisar());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "El lote 1 de 2 no se guardó"
    );
    expect(screen.getByText(/GEN-055/)).toBeTruthy();
    expect(mocks.apply).toHaveBeenCalledOnce();
  });

  it("muestra los avisos de la vista previa (columnas ignoradas) sin frenar", async () => {
    await revisar({
      ...RESUMEN,
      advertencias: ["La planilla trae columnas de proveedor (Proveedor)"],
    });
    expect(screen.getByText(/columnas de proveedor/)).toBeTruthy();
  });
});
