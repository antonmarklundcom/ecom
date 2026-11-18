import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { leerCarpetaDeGuias } from "../../src/lib/guias";

/**
 * Las guías (O34, docs/GUIAS.md) contra un `next build` + `next start` de
 * verdad: el mismo camino que Hostinger.
 *
 * Con `GUIAS_DIR=tests/fixtures/guias` en el build y en el server (el job
 * `e2e` de CI lo pone) corre contra las guías de ejemplo: dos publicadas y un
 * borrador, que nombran `browser-fixtures`, `browser-stock` y
 * `browser-enquiry` de `scripts/prepare-browser-tests.ts` (y un slug de
 * categoría y uno de producto que no existen, para ver que se saltean).
 *
 * Sin `GUIAS_DIR` y sin guías publicadas en `src/content/guias/` —el template
 * tal como sale— prueba lo contrario: `/guias` es 404, no hay link y el
 * sitemap no la nombra.
 */

const CON_FIXTURES = Boolean(process.env.GUIAS_DIR?.trim());
const PRIMERA = "como-elegir-en-el-navegador";
const SEGUNDA = "otra-guia-de-prueba";
const BORRADOR = "borrador-de-prueba";

function jsonLd(html: string): Record<string, unknown>[] {
  return [
    ...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g),
  ].flatMap((match) => {
    const valor = JSON.parse(match[1]!) as unknown;
    return (Array.isArray(valor) ? valor : [valor]) as Record<string, unknown>[];
  });
}

test.describe("guías de ejemplo", () => {
  test.skip(!CON_FIXTURES, "sin GUIAS_DIR: el build no tiene las guías de ejemplo");

  test("el índice lista las publicadas, no el borrador", async ({ page }) => {
    const respuesta = await page.goto("/guias");
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guías");
    await expect(page.locator("main a[data-guia]")).toHaveCount(2);
    // Más nueva primero.
    await expect(page.locator("main a[data-guia]").first()).toHaveAttribute(
      "href",
      `/guias/${SEGUNDA}`
    );
    await expect(page.locator(`a[href="/guias/${BORRADOR}"]`)).toHaveCount(0);
  });

  test("una guía: cuerpo seguro, links al catálogo, Article", async ({ page, request }) => {
    const errores: string[] = [];
    page.on("pageerror", (error) => errores.push(error.message));
    page.on("console", (msg) => {
      if (/content security policy/i.test(msg.text())) errores.push(msg.text());
    });
    page.on("dialog", (dialog) => {
      errores.push(`dialog: ${dialog.message()}`);
      void dialog.dismiss();
    });

    const respuesta = await page.goto(`/guias/${PRIMERA}`);
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Cómo elegir un producto de prueba para el navegador"
    );
    const cuerpo = page.locator(".guia-cuerpo");
    await expect(cuerpo.locator("table")).toHaveCount(1);
    await expect(cuerpo.locator("ol li")).toHaveCount(3);
    await expect(cuerpo.locator("blockquote")).toHaveCount(1);
    // El `<script>` del archivo es texto, no un script.
    await expect(cuerpo).toContainText('<script>alert("esto sale como texto")</script>');
    await expect(cuerpo.locator("script")).toHaveCount(0);
    await expect(cuerpo.locator('a[href="https://spec.commonmark.org/"]')).toHaveAttribute(
      "rel",
      "nofollow noopener"
    );

    // La categoría que existe, sí; la que no, se saltea.
    await expect(page.locator('main a[href="/categoria/browser-fixtures"]').first()).toBeVisible();
    await expect(page.locator('a[href="/categoria/categoria-que-no-existe"]')).toHaveCount(0);
    // El producto que existe, como tarjeta; el que no, nada.
    await expect(page.locator('main a[href="/producto/browser-stock"]').first()).toBeVisible();
    await expect(page.locator('a[href="/producto/producto-que-no-existe"]')).toHaveCount(0);

    // Hidrata con el CSP de las rutas cacheadas: ningún script bloqueado.
    await page.waitForLoadState("networkidle");
    expect(errores).toEqual([]);

    const html = await (await request.get(`/guias/${PRIMERA}`)).text();
    const article = jsonLd(html).find((ld) => ld["@type"] === "Article");
    expect(article).toMatchObject({
      headline: "Cómo elegir un producto de prueba para el navegador",
      datePublished: "2026-11-10",
      dateModified: "2026-11-15",
      publisher: { "@type": "Organization" },
      author: { "@type": "Organization" },
      url: `https://ci.example.py/guias/${PRIMERA}`,
      mainEntityOfPage: { "@id": `https://ci.example.py/guias/${PRIMERA}` },
    });
    expect(String(article?.description)).toMatch(/^Guía de ejemplo/);
    expect(article).not.toHaveProperty("image");
    expect(jsonLd(html).some((ld) => ld["@type"] === "BreadcrumbList")).toBe(true);
    expect(html).toContain(
      `<link rel="canonical" href="https://ci.example.py/guias/${PRIMERA}"/>`
    );
  });

  test("el borrador y un slug que no existe son 404", async ({ request }) => {
    expect((await request.get(`/guias/${BORRADOR}`)).status()).toBe(404);
    expect((await request.get("/guias/no-existe")).status()).toBe(404);
  });

  test("links de vuelta: categoría, producto, home y pie", async ({ page }) => {
    await page.goto("/categoria/browser-fixtures");
    await expect(
      page.locator(`[data-guias-relacionadas] a[href="/guias/${PRIMERA}"]`)
    ).toBeVisible();

    await page.goto("/producto/browser-enquiry");
    await expect(
      page.locator(`[data-guias-relacionadas] a[href="/guias/${SEGUNDA}"]`)
    ).toBeVisible();

    await page.goto("/");
    await expect(page.locator("[data-home-guias] a[data-guia]")).toHaveCount(2);
    await expect(page.locator('[data-site-footer] a[href="/guias"]')).toBeVisible();
  });

  test("el sitemap tiene el índice y las publicadas, con su fecha", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("<loc>https://ci.example.py/guias</loc>");
    expect(xml).toContain(`<loc>https://ci.example.py/guias/${PRIMERA}</loc>`);
    expect(xml).toContain(`<loc>https://ci.example.py/guias/${SEGUNDA}</loc>`);
    expect(xml).not.toContain(BORRADOR);
    expect(xml).toMatch(
      new RegExp(`/guias/${PRIMERA}</loc>\\s*<lastmod>2026-11-15T03:00:00.000Z</lastmod>`)
    );
  });
});

test.describe("sin guías", () => {
  const propias = leerCarpetaDeGuias(join(process.cwd(), "src/content/guias")).guias;
  test.skip(
    CON_FIXTURES || propias.some((guia) => !guia.borrador),
    "este build tiene guías publicadas"
  );

  test("/guias es 404, no hay link y el sitemap no la nombra", async ({ page, request }) => {
    expect((await request.get("/guias")).status()).toBe(404);
    await page.goto("/");
    await expect(page.locator('a[href="/guias"]')).toHaveCount(0);
    await expect(page.locator("[data-home-guias]")).toHaveCount(0);
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toContain("/guias");
  });
});
