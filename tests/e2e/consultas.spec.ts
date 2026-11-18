import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers";
import { TESTIDS } from "./testids";

/**
 * O33 (`fable/plan-trafico.md` §5.2): un clic de verdad en "Consultar por
 * WhatsApp" de la ficha llega a `/admin/consultas`. El link sigue siendo un
 * `<a href="https://wa.me/...">` común: el conteo es un `sendBeacon` aparte.
 */
test("a click on the product page WhatsApp button shows up in /admin/consultas", async ({
  page,
  context,
}) => {
  // Nada sale de la máquina: wa.me contesta una página vacía.
  await context.route(/^https:\/\/wa\.me\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>wa</p>" })
  );

  await page.goto("/producto/browser-enquiry");
  const link = page.getByTestId(TESTIDS.variantInquiryLink);
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  await expect(link).toHaveAttribute("data-consulta", "producto");

  const beacon = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/consulta") && response.request().method() === "POST"
  );
  const popup = context.waitForEvent("page");
  await link.click();
  expect((await beacon).status()).toBe(204);
  await (await popup).close();

  await loginAsOwner(page);
  await page.goto("/admin/consultas");
  const fila = page.locator('[data-consultas-producto="browser-enquiry"]');
  await expect(fila).toBeVisible();
  await expect(fila.locator("[data-consultas-total]")).toHaveText(/^[1-9]\d*$/);
});
