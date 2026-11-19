import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { esPielDelTemplate } from "../helpers/piel";
import { irAPrimeraCategoria, loginAsOwner } from "./helpers";
import { TESTIDS } from "./testids";

/**
 * Modo consulta (O32, fable/plan-trafico.md §2.1 y §5.1), en un navegador de
 * verdad: el dueño lo prende en `/admin/ajustes` → Modo de venta, y la
 * vidriera deja de vender. Al final vuelve a "Con carrito y pedidos" (el
 * `carrito` del template) para el resto de los specs, que corren en serie
 * contra la misma base (`playwright.config.ts`: `workers: 1`).
 *
 * El WhatsApp público sale de `WHATSAPP_NUMBER` (lo trae el job de CI): sin
 * él no hay botón de consulta, que es justo lo que `pnpm preflight` bloquea.
 */
async function elegirModo(page: Page, opcion: string): Promise<void> {
  await page.goto("/admin/ajustes#ventas");
  const seccion = page.locator("#ventas");
  await seccion.getByLabel("¿Cómo vende la tienda?").selectOption({ label: opcion });
  await seccion.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Ajustes guardados.")).toBeVisible();
}

test("modo consulta: sin carrito, la ficha sólo ofrece WhatsApp y /checkout es 404", async ({
  page,
  request,
}) => {
  await loginAsOwner(page);
  await elegirModo(page, "Sólo consulta por WhatsApp");
  try {
    await page.goto("/");
    await expect(page.getByTestId(TESTIDS.headerCartLink)).toHaveCount(0);
    // El pie es piel: uno rediseñado antes de v2.1.0 conserva su link (O36,
    // NEW-STORE.md §4b-ter); sólo el del template se controla acá.
    if (esPielDelTemplate("src/components/site-footer.tsx"))
      await expect(page.locator('footer a[href="/pedido/buscar"]')).toHaveCount(0);

    await irAPrimeraCategoria(page);
    await expect(page).toHaveURL(/\/categoria\//);
    await page.getByTestId(TESTIDS.productCard).first().click();
    await expect(page).toHaveURL(/\/producto\//);

    await expect(page.getByTestId(TESTIDS.productAddToCart)).toHaveCount(0);
    const consultar = page.getByTestId(TESTIDS.variantInquiryLink);
    await expect(consultar).toBeVisible();
    await expect(consultar).toHaveAttribute("href", /^https:\/\/wa\.me\//);

    expect((await request.get("/checkout")).status()).toBe(404);
    expect((await request.get("/pedido/buscar")).status()).toBe(404);
  } finally {
    await elegirModo(page, "Con carrito y pedidos");
  }

  // De vuelta en carrito: la tienda de siempre.
  await page.goto("/");
  await expect(page.getByTestId(TESTIDS.headerCartLink)).toBeVisible();
  expect((await request.get("/pedido/buscar")).status()).toBe(200);
});
