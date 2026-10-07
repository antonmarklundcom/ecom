import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/receipt-upload", () => ({
  ReceiptUpload: () => <form aria-label="Subir comprobante" />,
}));

import { ReceiptSection } from "@/components/receipt-section";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md D3: sin almacenamiento de comprobantes no
 * se ofrece un formulario que no puede funcionar.
 */
describe("ReceiptSection", () => {
  afterEach(cleanup);
  const base = { orderNumber: "PY-1", token: "t", remaining: 3 };

  it("con almacenamiento, el formulario y WhatsApp como alternativa", () => {
    render(
      <ReceiptSection {...base} storageReady waHref="https://contacto.example.test/whatsapp" />
    );
    expect(
      screen.getByRole("form", { name: "Subir comprobante" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toBeInTheDocument();
  });

  it("sin almacenamiento, ningún formulario: WhatsApp con el pedido", () => {
    render(
      <ReceiptSection
        {...base}
        storageReady={false}
        waHref="https://contacto.example.test/whatsapp"
      />
    );
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://contacto.example.test/whatsapp"
    );
    expect(
      screen.getByText(/mandáselo a la tienda por WhatsApp/)
    ).toBeInTheDocument();
  });

  it("sin almacenamiento ni WhatsApp, dice a dónde escribir en vez de un botón roto", () => {
    render(<ReceiptSection {...base} storageReady={false} waHref={null} />);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/medio de contacto/)).toBeInTheDocument();
  });
});
