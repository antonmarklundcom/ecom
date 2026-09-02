import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Datos de una compra válida, iguales a los que pide el plan (fable/plan.md
 * §6.1): teléfono `+5959…`, documento CI, ciudad de una zona sembrada
 * (`scripts/seed-data.ts`) y transferencia — el único medio de pago que esta
 * tienda ofrece sin credenciales de Pagopar.
 */
export const COMPRADOR = {
  name: "Compradora E2E",
  phone: "+595981234567",
  docNumber: "1234567",
  city: "Asunción",
  address: "Mcal. López 1234",
} as const;

/**
 * Home → una categoría → un producto → agregarlo al carrito → checkout →
 * confirmar. Se usa tal cual en `compra.spec.ts` y, para no depender del
 * orden de ejecución de los specs, también en `panel.spec.ts` (fable/plan.md
 * §6.1: "preferir independencia").
 *
 * Devuelve el número de pedido y la URL de la página de seguimiento, tal como
 * quedan después del `router.push`.
 */
export async function realizarCompra(
  page: Page
): Promise<{ orderNumber: string; url: string }> {
  await page.goto("/");
  await page.getByRole("link", { name: "Electrónica" }).first().click();
  await expect(page).toHaveURL(/\/categoria\/electronica/);

  await page.locator('a[href^="/producto/"]').first().click();
  await expect(page).toHaveURL(/\/producto\//);

  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goto("/checkout");
  // Por `id` y no por accessible name: el WhatsApp flotante
  // (`whatsapp-fab.tsx`) y el checkbox de novedades también matchean
  // "WhatsApp" como texto, y `getByLabel` no alcanza a distinguirlos.
  await page.locator("#customerName").fill(COMPRADOR.name);
  await page.locator("#customerPhone").fill(COMPRADOR.phone);

  await page.locator("#docType").selectOption("CI");
  await page.locator("#docNumber").fill(COMPRADOR.docNumber);

  await page.locator("#shipCity").fill(COMPRADOR.city);
  await page.locator("#shipAddress").fill(COMPRADOR.address);

  // La cotización de envío se dispara con un debounce (400ms); esperarla deja
  // el total visible en pantalla antes de confirmar, igual que haría una
  // persona.
  await expect(page.getByText("Total", { exact: true })).toBeVisible({
    timeout: 5000,
  });

  // Transferencia ya viene marcada por defecto — no hace falta tocarla.
  await page.getByRole("button", { name: "Confirmar pedido" }).click();

  await page.waitForURL(/\/pedido\/PY-[^/?]+\?t=/, { timeout: 15_000 });

  const url = page.url();
  const orderNumber = new URL(url).pathname.split("/").pop() ?? "";
  return { orderNumber, url };
}
