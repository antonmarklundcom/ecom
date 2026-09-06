import { expect, test } from "@playwright/test";

import { TESTIDS } from "./testids";

/**
 * El panel de productos y categorías (O7/S10, plan-operacion §6.2): crear un
 * producto con descripción en markdown, ver la vista previa, duplicarlo y
 * aplicar una acción masiva sobre la copia.
 *
 * Como `panel.spec.ts`, hace su propio login: con `fullyParallel` el orden
 * entre specs no está garantizado (fable/plan.md §6.1 — "preferir
 * independencia"). Todo se ubica por `data-testid`, nunca por texto ni por
 * el catálogo sembrado (NEW-STORE.md §5): el nombre del producto lo inventa
 * este spec.
 */
test("crear producto con markdown, duplicarlo y desactivar la copia en masa", async ({ page }) => {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      "Faltan OWNER_EMAIL/OWNER_PASSWORD en el entorno del test — son los mismos que usó " +
        "`pnpm create-owner` (o `POST /api/setup/init`) para sembrar la cuenta del dueño."
    );
  }

  const nombreProducto = `Producto E2E ${Date.now()}`;

  await page.goto("/admin/login?next=%2Fadmin%2Fproductos%2Fnuevo");
  await page.getByTestId(TESTIDS.adminLoginEmail).fill(ownerEmail);
  await page.getByTestId(TESTIDS.adminLoginPassword).fill(ownerPassword);
  await page.getByTestId(TESTIDS.adminLoginSubmit).click();
  await page.waitForURL(/\/admin\/productos\/nuevo$/);

  // --- Alta con descripción en markdown ------------------------------------
  await page.getByTestId(TESTIDS.adminProductNameInput).fill(nombreProducto);
  await page
    .getByTestId(TESTIDS.adminMarkdownTextarea)
    .fill("**Importado** de Brasil.\n\n- Talle M\n- Talle L");

  // Vista previa: el markdown se renderizó en el cliente, sin ir al servidor.
  await page.getByTestId(TESTIDS.adminMarkdownTabPreview).click();
  const preview = page.getByTestId(TESTIDS.adminMarkdownPreview);
  await expect(preview.locator("strong")).toHaveText("Importado");
  await expect(preview.locator("li")).toHaveCount(2);
  // El input original no debería colarse crudo: si el escape fallara, un
  // `<script>` en la descripción terminaría ejecutándose acá mismo.
  await expect(preview.locator("script")).toHaveCount(0);

  await page.getByTestId(TESTIDS.adminMarkdownTabEdit).click();

  await page.getByTestId(TESTIDS.adminProductSaveSubmit).click();
  await page.waitForURL(/\/admin\/productos\/\d+$/);
  const productUrl = page.url();
  const productId = productUrl.split("/").pop();

  // --- Duplicar -------------------------------------------------------------
  await page.getByTestId(TESTIDS.adminProductDuplicate).click();
  await page.waitForURL(/\/admin\/productos\/\d+$/);
  const copyUrl = page.url();
  expect(copyUrl).not.toBe(productUrl);
  const copyId = copyUrl.split("/").pop();
  expect(copyId).not.toBe(productId);

  // --- Acción masiva sobre la copia ------------------------------------------
  await page.goto(`/admin/productos?q=${encodeURIComponent(nombreProducto)}`);
  // La búsqueda por nombre trae el original y la copia (el nombre de la copia
  // lo arma `duplicateProduct` agregándole "(copia)" al final): se elige nada
  // más que la fila de la copia por su id, con el mismo `data-id` que acaba
  // de confirmar la redirección de arriba.
  await page
    .locator(`[data-testid="${TESTIDS.adminProductRowSelect}"][data-id="${copyId}"]`)
    .check();

  await expect(page.getByTestId(TESTIDS.adminBulkBar)).toBeVisible();
  await page.getByTestId(TESTIDS.adminBulkActivate).click();

  await expect(page.getByTestId(TESTIDS.adminBulkBar)).toHaveCount(0);
});
