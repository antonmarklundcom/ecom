import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pago SPI/QR + notificaciones de WhatsApp (PLAN.md 3.4 / 3.6 / 3.10, TASKS.md §9).
 *
 * Estos mensajes se reenvían tal cual por WhatsApp — nunca pueden llevar el
 * `access_token` ni la URL tokenizada del comprador (`/pedido/...?t=...`),
 * porque ese link es la credencial de acceso al pedido.
 */

const SPI_VARS = [
  "SPI_BANCO",
  "SPI_TITULAR",
  "SPI_RUC",
  "SPI_NUMERO_CUENTA",
  "SPI_ALIAS",
  "SPI_QR_IMAGE_URL",
] as const;

function stubSpiEnv(overrides: Partial<Record<(typeof SPI_VARS)[number], string>> = {}): void {
  const full: Record<(typeof SPI_VARS)[number], string> = {
    SPI_BANCO: "Banco Ejemplo",
    SPI_TITULAR: "Comercial San Roque S.A.",
    SPI_RUC: "80012345-0",
    SPI_NUMERO_CUENTA: "1234567890",
    SPI_ALIAS: "sanroque.py",
    SPI_QR_IMAGE_URL: "https://res.cloudinary.com/demo/image/upload/qr-spi.png",
  };
  for (const key of SPI_VARS) vi.stubEnv(key, overrides[key] ?? full[key]);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("datosPagoSpi", () => {
  it("devuelve los seis datos cuando el entorno está completo", async () => {
    stubSpiEnv();
    const { datosPagoSpi } = await import("@/lib/comercio");

    expect(datosPagoSpi()).toEqual({
      banco: "Banco Ejemplo",
      titular: "Comercial San Roque S.A.",
      ruc: "80012345-0",
      numeroCuenta: "1234567890",
      alias: "sanroque.py",
      qrImageUrl: "https://res.cloudinary.com/demo/image/upload/qr-spi.png",
    });
  });

  it("degrada a null si falta cualquiera de los datos (nunca campos vacíos)", async () => {
    const { datosPagoSpi } = await import("@/lib/comercio");

    for (const missing of SPI_VARS) {
      vi.unstubAllEnvs();
      stubSpiEnv({ [missing]: "" });
      expect(datosPagoSpi(), `falta ${missing}`).toBeNull();
    }
  });

  it("también degrada si el valor es sólo espacios", async () => {
    stubSpiEnv({ SPI_ALIAS: "   " });
    const { datosPagoSpi } = await import("@/lib/comercio");
    expect(datosPagoSpi()).toBeNull();
  });
});

describe("receiptWaMessage — comprobante por WhatsApp", () => {
  it("incluye nro. de pedido, total y nombre del cliente", async () => {
    const { receiptWaMessage } = await import("@/lib/comercio");
    const message = receiptWaMessage("PY-000123", 245000, "Rosa Giménez");

    expect(message).toContain("PY-000123");
    expect(message).toContain("₲ 245.000");
    expect(message).toContain("Rosa");
  });

  it("nunca lleva el token ni la URL tokenizada del pedido", async () => {
    const { receiptWaMessage } = await import("@/lib/comercio");
    const message = receiptWaMessage("PY-000123", 245000, "Rosa Giménez");

    expect(message).not.toMatch(/\?t=/);
    expect(message).not.toMatch(/access_token/i);
    expect(message).not.toContain("/pedido/");
  });
});

describe("ownerNewOrderWaMessage — notificación al dueño", () => {
  it("incluye nro. de pedido, total y el link del panel", async () => {
    const { ownerNewOrderWaMessage } = await import("@/lib/comercio");
    const message = ownerNewOrderWaMessage("PY-000123", 245000, "https://tienda.py/admin/pedidos/42");

    expect(message).toContain("PY-000123");
    expect(message).toContain("₲ 245.000");
    expect(message).toContain("https://tienda.py/admin/pedidos/42");
  });

  it("el link que recibe nunca es la URL tokenizada del comprador", async () => {
    // El mensaje sólo interpola lo que se le pasa: si a `notifyOwnerOfNewOrder`
    // (domain/notify-owner.ts) nunca se le pasa la URL del comprador, este
    // mensaje no puede contenerla — lo que se prueba acá es que la función no
    // arma ningún link por su cuenta.
    const { ownerNewOrderWaMessage } = await import("@/lib/comercio");
    const panelUrl = "https://tienda.py/admin/pedidos/42";
    const message = ownerNewOrderWaMessage("PY-000123", 245000, panelUrl);

    expect(message).not.toMatch(/\?t=/);
    expect(message.match(/pedidos\/\d+/g)).toEqual(["pedidos/42"]);
  });
});
