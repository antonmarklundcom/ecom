import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsOwner, openOrderFicha, realizarCompra } from "./helpers";
import { TESTIDS } from "./testids";

// These flows enter disposable credentials; keep them out of saved browser traces.
test.use({ trace: "off" });
test.afterEach(async ({ page }) => {
  // Playwright error-context snapshots include input values even with tracing off.
  if (!page.isClosed()) {
    await page
      .locator(
        'input[type="password"], input[autocomplete="new-password"], #setup-secreto'
      )
      .evaluateAll((inputs) => {
        for (const input of inputs) (input as HTMLInputElement).value = "";
      });
  }
});

test("every admin section loads, has an active icon link, and excludes shopping chrome", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginAsOwner(page);
  const menu = page.getByRole("navigation", {
    name: "Menú del panel",
    exact: true,
  });
  const routes = await menu
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
  expect(routes).toHaveLength(14);
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("#admin-content")).toBeVisible();
    const current = menu.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", route);
    await expect(current.locator("svg").first()).toBeVisible();
    await expect(page.getByTestId(TESTIDS.headerCartLink)).toHaveCount(0);
    await expect(page.getByTestId(TESTIDS.headerCategoryLink)).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(page.locator("[data-whatsapp-fab]")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByTestId(TESTIDS.adminLoginSubmit)).toBeVisible();
  await expect(page.getByTestId(TESTIDS.headerCartLink)).toHaveCount(0);
});

test("menu edits support arrows, dragging, cancel, save, reload, and restoring defaults", async ({
  page,
}) => {
  await loginAsOwner(page);
  const menu = page.getByRole("navigation", {
    name: "Menú del panel",
    exact: true,
  });
  const original = await menu
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  await expect(
    page.getByText("El orden se guarda para tu cuenta en este navegador.", {
      exact: false,
    })
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Subir Pedidos", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(menu.getByRole("link").first()).toHaveAttribute(
    "href",
    original[0]!
  );
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Subir Pedidos", exact: true })
    .click();
  await menu
    .locator('li[draggable="true"]')
    .filter({ hasText: "Productos" })
    .dragTo(menu.locator('li[draggable="true"]').first());
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(menu.getByRole("link").first()).toHaveAttribute(
    "href",
    "/admin/productos"
  );
  await page.reload();
  await expect(menu.getByRole("link").first()).toHaveAttribute(
    "href",
    "/admin/productos"
  );
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Restaurar orden original", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() =>
      menu
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")))
    )
    .toEqual(original);
});

test("mobile drawer navigates and closes without horizontal overflow", async ({
  page,
}) => {
  await loginAsOwner(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", {
    name: "Abrir menú del panel",
    exact: true,
  });
  await expect(open).toBeVisible();
  await open.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Productos", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/productos$/);
  await expect(drawer).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await open.click();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(open).toBeFocused();
});

test("order detail and printable receipt preserve active navigation and print layout", async ({
  page,
}) => {
  const { orderNumber } = await realizarCompra(page);
  await loginAsOwner(page);
  await openOrderFicha(page, orderNumber);
  await expect(page.getByTestId(TESTIDS.adminNavOrders)).toHaveAttribute(
    "aria-current",
    "page"
  );
  await page.getByTestId(TESTIDS.orderPrintLink).click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/\d+\/imprimir$/);
  await expect(page.getByTestId(TESTIDS.adminNavOrders)).toHaveAttribute(
    "aria-current",
    "page"
  );
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("navigation", { name: "Menú del panel", exact: true })
  ).not.toBeVisible();
  await expect(page.locator(".s9-print-page")).toBeVisible();
  expect(
    await page
      .locator("#admin-content")
      .evaluate((element) => getComputedStyle(element).paddingLeft)
  ).toBe("0px");
});

test("setup validates repeated passwords, focuses success above the form, and links to login", async ({
  page,
}) => {
  // No credentials should be captured by browser traces; this tests UI against an intercepted response.
  let submissions = 0;
  await page.route("**/api/setup/init", async (route) => {
    submissions++;
    const body = route.request().postDataJSON();
    expect(body).not.toHaveProperty("repeatPassword");
    expect(body.seed).toBe(false);
    expect(body.force).toBe(false);
    await route.fulfill({
      json: { ok: true, pasos: { migraciones: "ok", owner: "creado" } },
    });
  });
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Configuración necesaria para lanzar" })
  ).toBeVisible();
  await expect(
    page.getByText("Importar tus productos reales no borra estos ejemplos", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Si es la primera vez, dejá esta opción desmarcada.", {
      exact: false,
    })
  ).toBeVisible();
  await page
    .getByLabel("SETUP_SECRET", { exact: true })
    .fill(randomBytes(24).toString("hex"));
  await page.getByLabel("Email", { exact: true }).fill("setup@example.test");
  const password = randomBytes(24).toString("hex");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByLabel("Repetir contraseña", { exact: true })
    .fill(randomBytes(24).toString("hex"));
  await page.getByRole("button", { name: "Inicializar", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Las contraseñas no coinciden"
  );
  expect(submissions).toBe(0);
  for (const label of ["Contraseña", "Repetir contraseña"]) {
    await page
      .getByRole("button", { name: `Mostrar: ${label}`, exact: true })
      .click();
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
      "type",
      "text"
    );
    await page
      .getByRole("button", { name: `Ocultar: ${label}`, exact: true })
      .click();
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
      "type",
      "password"
    );
  }
  await page.getByLabel("Repetir contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Inicializar", exact: true }).click();
  const success = page
    .getByRole("status")
    .filter({ hasText: "La tienda quedó inicializada" });
  await expect(success).toBeVisible();
  await expect(success).toBeFocused();
  expect(submissions).toBe(1);
  expect(
    await success.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(document.querySelector("main form")!) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    )
  ).toBe(true);
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Repetir contraseña", { exact: true })
  ).toHaveValue("");
  await page
    .getByRole("link", { name: "Ir al login del panel", exact: true })
    .click();
  await expect(page.getByTestId(TESTIDS.adminLoginSubmit)).toBeVisible();
});
