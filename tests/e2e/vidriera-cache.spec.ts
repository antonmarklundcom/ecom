import { asc, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import "../../src/lib/load-env";
import { closePool, getDb } from "../../src/db";
import { categories, products } from "../../src/db/schema";

import { loginAsOwner } from "./helpers";

/**
 * La caché de la vidriera contra un `next start` de verdad (ARCH.md §6,
 * "Caché de la vidriera").
 *
 * Los tests unitarios ven las decisiones (qué ruta se cachea, qué acción tira
 * la caché); éste ve lo que pasa: la ficha y la categoría salen de la caché
 * de Next (`x-nextjs-cache`), con parámetros van por request, y un cambio
 * guardado en el panel aparece en la home cacheada sin esperar los 5 minutos.
 */

let categoriaSlug = "";
let productoSlug = "";

test.beforeAll(async () => {
  const db = getDb();
  const [categoria] = await db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position))
    .limit(1);
  const [producto] = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.id))
    .limit(1);
  if (!categoria || !producto) {
    throw new Error("vidriera-cache.spec.ts necesita el catálogo del seed");
  }
  categoriaSlug = categoria.slug;
  productoSlug = producto.slug;
});

test.afterAll(async () => {
  await closePool();
});

test("la ficha y la categoría limpias salen de la caché; con parámetros, por request", async ({
  request,
}) => {
  for (const ruta of [`/producto/${productoSlug}`, `/categoria/${categoriaSlug}`]) {
    await request.get(ruta);
    const segunda = await request.get(ruta);
    expect(segunda.status()).toBe(200);
    expect(segunda.headers()["x-nextjs-cache"], ruta).toBe("HIT");
    expect(segunda.headers()["x-nonce"], ruta).toBeUndefined();
  }

  const filtrada = await request.get(`/categoria/${categoriaSlug}?orden=precio-asc`);
  expect(filtrada.status()).toBe(200);
  expect(filtrada.headers()["x-nextjs-cache"]).toBeUndefined();
  expect(filtrada.headers()["x-nonce"]).toBeTruthy();

  const conCampania = await request.get(`/producto/${productoSlug}?utm_source=ig`);
  expect(conCampania.headers()["x-nextjs-cache"]).toBe("HIT");
  expect(conCampania.headers()["x-robots-tag"]).toBe("noindex, follow");

  // La gemela abierta a mano no es una segunda URL de la misma ficha.
  expect(
    (await request.get(`/producto/${productoSlug}/con-parametros`)).status()
  ).toBe(404);
});

test("un cambio guardado en el panel aparece en la home cacheada al toque", async ({
  page,
}) => {
  const texto = `Aviso de caché ${Date.now()}`;

  // La home ya en caché, sin el aviso.
  await page.goto("/");
  await page.goto("/");
  await expect(page.getByText(texto)).toHaveCount(0);

  await loginAsOwner(page);
  await page.goto("/admin/ajustes#anuncio");
  const seccion = page.locator("#anuncio");
  await seccion.getByLabel("Mostrar la barra").check();
  await seccion.getByLabel("Texto (hasta 140 caracteres)").fill(texto);
  await seccion.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Ajustes guardados.")).toBeVisible();

  await page.goto("/");
  await expect(page.locator("[data-announcement-bar]")).toContainText(texto);

  // Dejar la barra como estaba para el resto de los specs.
  await page.goto("/admin/ajustes#anuncio");
  await page.locator("#anuncio").getByLabel("Mostrar la barra").uncheck();
  await page
    .locator("#anuncio")
    .getByRole("button", { name: "Guardar cambios" })
    .click();
  await expect(page.getByText("Ajustes guardados.")).toBeVisible();
});
