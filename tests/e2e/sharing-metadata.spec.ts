import { expect, test } from "@playwright/test";

/**
 * Lo que ve WhatsApp (o cualquier crawler) al compartir una ficha
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md E2, E3). Se lee el HTML del servidor,
 * como lo lee el crawler: el `<head>` que arma Next con la metadata de la
 * página fusionada con la del layout.
 */
function meta(html: string, property: string): string[] {
  return [
    ...html.matchAll(
      new RegExp(`<meta property="${property}" content="([^"]*)"`, "g")
    ),
  ].map((match) => match[1]!);
}

test("una ficha sin fotos comparte la imagen y el nombre del sitio", async ({
  request,
}) => {
  const html = await (await request.get("/producto/browser-enquiry")).text();

  expect(meta(html, "og:title")[0]).toContain("Browser enquiry");
  expect(meta(html, "og:site_name")).toHaveLength(1);
  expect(meta(html, "og:locale")).toHaveLength(1);
  expect(meta(html, "og:image").length).toBeGreaterThan(0);
});

test("una foto ilustrativa no es la imagen para compartir", async ({
  request,
}) => {
  // `browser-stock` tiene dos fotos marcadas como ilustrativas.
  const html = await (await request.get("/producto/browser-stock")).text();

  for (const url of meta(html, "og:image")) {
    expect(url).not.toContain("fixture-");
  }
  expect(meta(html, "og:site_name")).toHaveLength(1);
});
