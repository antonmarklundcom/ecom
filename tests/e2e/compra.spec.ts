import { expect, test } from "@playwright/test";

import { realizarCompra } from "./helpers";

/**
 * El camino completo de una compradora: home → categoría → producto →
 * carrito → checkout → pantalla del pedido (fable/plan.md §6.1, spec 1).
 *
 * El job de CI no configura `BANCO_*` (no hay credenciales reales que
 * commitear), así que lo esperable es el aviso de "sin datos bancarios" — no
 * un error.
 */
test("compra de invitado con transferencia llega a la página del pedido", async ({
  page,
}) => {
  const { orderNumber, url } = await realizarCompra(page);

  expect(orderNumber).toMatch(/^PY-/);
  await expect(page).toHaveURL(url);

  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  await expect(page.getByText("Pagá por transferencia o QR")).toBeVisible();

  const datosBancarios = page.getByText("Banco", { exact: true });
  const sinDatos = page.getByText(
    "Los datos bancarios del comercio todavía no están configurados.",
    { exact: false }
  );
  await expect(datosBancarios.or(sinDatos)).toBeVisible();
});
