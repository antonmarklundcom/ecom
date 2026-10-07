import { expect, test } from "@playwright/test";
import { TESTIDS } from "./testids";

test("SKU links, true redirects, gallery keyboard/focus and public comparison", async ({
  page,
  request,
}) => {
  await page.route("https://res.cloudinary.com/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="skyblue"/></svg>',
    })
  );
  const redirect = await request.get("/producto/browser-stock-original", {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/producto/browser-stock");
  const skuRedirect = await request.get(
    "/producto/browser-stock-original?variante=browser-stock-Large",
    { maxRedirects: 0 }
  );
  expect(skuRedirect.status()).toBe(308);
  expect(skuRedirect.headers().location).toBe(
    "/producto/browser-stock?variante=browser-stock-Large"
  );
  expect(
    (await request.get("/producto/unknown-inheritance-product")).status()
  ).toBe(404);
  await page.goto("/producto/browser-stock?variante=browser-stock-Large");
  await expect(
    page.getByRole("button", { name: "Large", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/producto\/browser-stock$/
  );
  const zoom = page.getByRole("button", { name: /Ampliar imagen 1:/ });
  await zoom.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Imagen 2 de 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ampliar imagen 2:/ })
  ).toBeFocused();
  await page.goto("/producto/browser-stock?variante=missing");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "La variante del enlace no existe" })
  ).toBeVisible();
  await page.goto("/comparar?p=browser-stock,browser-enquiry");
  await expect(
    page.getByRole("heading", { name: "Comparar productos" })
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("unidad");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});

test("staff keeps product permissions and cannot access owner guides/settings or private SEO tools", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page
    .getByTestId(TESTIDS.adminLoginEmail)
    .fill("staff@browser.example.test");
  await page
    .getByTestId(TESTIDS.adminLoginPassword)
    .fill(process.env.OWNER_PASSWORD!);
  await page.getByTestId(TESTIDS.adminLoginSubmit).click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/);
  await expect(
    page.getByRole("navigation", { name: "Menú del panel" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Productos", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Guía", exact: true })
  ).toHaveCount(0);
  await expect(page.getByTestId(TESTIDS.headerCartLink)).toHaveCount(0);
  const links = page.getByRole("navigation").getByRole("link");
  const originalOrder = await links.allTextContents();
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Subir Productos", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await links.allTextContents()).toEqual(originalOrder);
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Subir Productos", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const savedOrder = await links.allTextContents();
  expect(savedOrder).not.toEqual(originalOrder);
  await page.reload();
  await expect.poll(() => links.allTextContents()).toEqual(savedOrder);
  await page.getByRole("button", { name: "Editar menú", exact: true }).click();
  await page.getByRole("button", { name: "Restaurar orden original" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect(await links.allTextContents()).toEqual(originalOrder);
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", {
    name: "Abrir menú del panel",
    exact: true,
  });
  await menu.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(menu).toBeFocused();
  await page.goto("/admin/seo");
  await expect(page).not.toHaveURL(/\/admin\/seo$/);
});
