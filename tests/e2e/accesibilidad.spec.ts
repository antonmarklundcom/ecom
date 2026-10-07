import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { TESTIDS } from "./testids";

/**
 * Accesibilidad y catálogo usable (docs/TEMPLATE-IMPROVEMENT-PLAN.md F3–F5).
 *
 * axe sobre las páginas que toda tienda hereda, en escritorio y a 390 px. Un
 * botón adentro de un link (la tarjeta de producto, F3) es la regla
 * `nested-interactive`; un control sin nombre, un contraste ilegible o un
 * salto de títulos también fallan acá antes de llegar a una tienda.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function sinViolaciones(page: Page, donde: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .analyze();
  expect(
    violations.map(
      (v) =>
        `${v.id} (${v.nodes.length}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`
    ),
    donde
  ).toEqual([]);
}

/**
 * Las páginas salen de la tienda que corre, no del seed: una tienda con su
 * propio catálogo tiene que pasar este spec sin tocarlo
 * (`testids-contrato.test.ts`).
 */
async function paginas(page: Page): Promise<string[]> {
  await page.goto("/");
  const categoria = await page
    .getByTestId(TESTIDS.headerCategoryLink)
    .first()
    .getAttribute("href");
  if (!categoria) throw new Error("La home no enlaza ninguna categoría.");
  await page.goto(categoria);
  const tarjeta = page.getByTestId(TESTIDS.productCard).first();
  const producto = await tarjeta.getAttribute("href");
  if (!producto) throw new Error("La categoría no tiene productos.");
  const palabra =
    (await tarjeta.locator("h3").textContent())?.trim().split(/\s+/)[0] ?? "";
  return [
    "/",
    categoria,
    producto,
    `/buscar?q=${encodeURIComponent(palabra)}`,
    "/carrito",
    "/comparar?p=browser-stock,browser-enquiry",
    "/admin/login",
  ];
}

for (const ancho of [1280, 390]) {
  test(`axe a ${ancho} px`, async ({ page }) => {
    // Siete páginas con axe cada una: el minuto por defecto de un test no
    // alcanza en una máquina lenta.
    test.setTimeout(180_000);
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const ruta of await paginas(page)) {
      await test.step(ruta, async () => {
        await page.goto(ruta);
        await page.waitForLoadState("networkidle");
        await sinViolaciones(page, `${ruta} @ ${ancho}`);
      });
    }
  });
}

test.describe("filtros en el celular (F4)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("se pliegan detrás de un botón y el total se anuncia", async ({
    page,
  }) => {
    await page.goto("/");
    const categoria = await page
      .getByTestId(TESTIDS.headerCategoryLink)
      .first()
      .getAttribute("href");
    await page.goto(categoria!);
    const boton = page.getByRole("button", { name: /^Filtros/ });
    await expect(boton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("combobox", { name: "Ordenar" })).toBeHidden();
    await expect(page.getByRole("status").first()).toContainText(/producto/);

    await boton.click();
    await expect(boton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("combobox", { name: "Ordenar" })).toBeVisible();
    // La primera tarjeta sigue llevando a su ficha (F3: el corazón es
    // hermano del link, no hijo).
    await expect(page.getByTestId(TESTIDS.productCard).first()).toHaveAttribute(
      "href",
      /^\/producto\//
    );
  });
});

test("comparar no manda el catálogo entero al navegador (F5)", async ({
  request,
}) => {
  const html = await (await request.get("/comparar?p=browser-stock")).text();
  // El selector lista los productos por nombre…
  expect(html).toContain("Browser showcase");
  // …pero las variantes de los que no se comparan no viajan.
  expect(html).not.toContain("browser-showcase-Small");
});
