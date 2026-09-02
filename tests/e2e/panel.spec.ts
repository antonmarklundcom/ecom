import { expect, test } from "@playwright/test";

import { realizarCompra } from "./helpers";

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

  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Contraseña").fill(ownerPassword);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/admin\/pedidos$/);
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();

  // Filtra por el número de pedido: la lista sin filtro pagina y el pedido
  // recién creado puede no estar en la primera página.
  await page.getByLabel("Buscar pedido").fill(orderNumber);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  await expect(page.getByText(orderNumber)).toBeVisible();
});
