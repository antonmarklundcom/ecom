import { expect, test } from "@playwright/test";

import {
  loginAsOwner,
  openOrderFicha,
  orderTransitionButton,
  realizarCompra,
} from "./helpers";
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
  const { orderNumber } = await realizarCompra(page);

  await loginAsOwner(page);

  // Filtra por el número de pedido: la lista sin filtro pagina y el pedido
  // recién creado puede no estar en la primera página.
  await page.getByTestId(TESTIDS.adminOrdersSearchInput).fill(orderNumber);
  await page.getByTestId(TESTIDS.adminOrdersSearchSubmit).click();

  await expect(page.getByText(orderNumber)).toBeVisible();
});

/**
 * Despachar con guía de seguimiento (S9, plan-operacion §6.1): el paso
 * intermedio de "Enviado" acepta courier/guía/link, la ficha del pedido los
 * muestra en el bloque "Seguimiento" y la compradora los ve en su propia
 * página del pedido — el mismo dato, en los dos lados del mostrador.
 */
test("despachar con guía: la ficha y la página de la compradora la muestran", async ({ page }) => {
  const { orderNumber, url } = await realizarCompra(page);

  await loginAsOwner(page);
  await openOrderFicha(page, orderNumber);

  // pendiente_pago → pagado → preparando → enviado (con guía). Las dos
  // primeras no paran en el paso intermedio (no son destructivas ni
  // `enviado`): confirman solas.
  await orderTransitionButton(page, "pagado").click();
  await expect(orderTransitionButton(page, "preparando")).toBeVisible();

  await orderTransitionButton(page, "preparando").click();
  await expect(orderTransitionButton(page, "enviado")).toBeVisible();

  await orderTransitionButton(page, "enviado").click();

  const trackingCode = `E2E-${Date.now()}`;
  await page.getByTestId(TESTIDS.orderTrackingCarrierInput).fill("Moto propia");
  await page.getByTestId(TESTIDS.orderTrackingCodeInput).fill(trackingCode);
  await page.getByTestId(TESTIDS.orderTransitionConfirm).click();

  await expect(page.getByTestId(TESTIDS.orderTrackingBlock)).toContainText(trackingCode);

  // La compradora entra con su propio link tokenizado, no con la sesión del
  // panel: navegar a `url` (la que devuelve `realizarCompra`) alcanza.
  await page.goto(url);
  await expect(page.getByTestId(TESTIDS.pedidoTrackingBlock)).toContainText(trackingCode);
});

/**
 * Notas internas (S9, plan-operacion §6.1): se agregan desde la ficha y
 * aparecen en la lista sin recargar la página a mano (`router.refresh()`).
 * Nunca las ve la compradora — eso lo garantiza el dominio, acá sólo se
 * prueba que el mostrador las vea.
 */
test("agregar una nota interna: aparece en la lista de la ficha", async ({ page }) => {
  const { orderNumber } = await realizarCompra(page);

  await loginAsOwner(page);
  await openOrderFicha(page, orderNumber);

  const noteText = `Llamó, pasa el jueves — E2E ${Date.now()}`;
  await page.getByTestId(TESTIDS.orderNotesTextarea).fill(noteText);
  await page.getByTestId(TESTIDS.orderNotesSubmit).click();

  await expect(page.getByTestId(TESTIDS.orderNotesList)).toContainText(noteText);
});
