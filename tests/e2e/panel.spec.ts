import { expect, test } from "@playwright/test";

import { realizarCompra } from "./helpers";
import { TESTIDS } from "./testids";

/**
 * La puerta de `/admin` y el flujo de quien despacha (fable/plan.md §6.1,
 * spec 2).
 *
 * Hace su propia compra en vez de depender de `compra.spec.ts`: con
 * `fullyParallel` el orden entre specs no está garantizado (§6.1 lo dice
 * explícito — "preferir independencia").
 */
test("la puerta de /admin redirige, el login entra y el pedido aparece en el panel", async ({
  page,
}) => {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      "Faltan OWNER_EMAIL/OWNER_PASSWORD en el entorno del test — son los mismos que usó " +
        "`pnpm create-owner` (o `POST /api/setup/init`) para sembrar la cuenta del dueño."
    );
  }

  const { orderNumber } = await realizarCompra(page);

  // Sin cookie, la puerta del proxy manda al login con el destino original
  // (src/proxy.ts) — esto es UX, no el control de acceso real.
  await page.goto("/admin/pedidos");
  await page.waitForURL(/\/admin\/login\?next=%2Fadmin%2Fpedidos/);

  await page.getByTestId(TESTIDS.adminLoginEmail).fill(ownerEmail);
  await page.getByTestId(TESTIDS.adminLoginPassword).fill(ownerPassword);
  await page.getByTestId(TESTIDS.adminLoginSubmit).click();

  await page.waitForURL(/\/admin\/pedidos$/);
  // Antes que el listado: el nav es lo que confirma que el panel entero
  // renderizó con sesión, no sólo esta pantalla.
  await expect(page.getByTestId(TESTIDS.adminNavOrders)).toBeVisible();

  // Filtra por el número de pedido: la lista sin filtro pagina y el pedido
  // recién creado puede no estar en la primera página.
  await page.getByTestId(TESTIDS.adminOrdersSearchInput).fill(orderNumber);
  await page.getByTestId(TESTIDS.adminOrdersSearchSubmit).click();

  await expect(page.getByText(orderNumber)).toBeVisible();
});
