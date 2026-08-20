import { readdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RUTAS_PRIVADAS,
  breadcrumbJsonLd,
  buildSitemap,
  itemListJsonLd,
} from "../../src/lib/seo";

/**
 * SEO técnico.
 *
 * Tres cosas que fallan calladas y no se notan hasta ver el tráfico meses
 * después: un sitemap con URLs relativas (que ningún buscador acepta), un
 * `robots.txt` que deja pasar el crawler a `/pedido/<numero>` —el link
 * tokenizado que viaja por WhatsApp—, y un JSON-LD mal numerado en la
 * paginación.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sitemap", () => {
  const input = {
    categories: [{ slug: "remeras" }, { slug: "pantalones" }],
    products: [
      { slug: "remera-azul", updatedAt: new Date("2026-01-15T00:00:00Z") },
      { slug: "jean-negro", updatedAt: null },
    ],
  };

  it("publica home, categorías y productos con URL absoluta", () => {
    const entries = buildSitemap(new URL("https://tienda.com.py"), input);

    expect(entries.map((entry) => entry.url)).toEqual([
      "https://tienda.com.py/",
      "https://tienda.com.py/categoria/remeras",
      "https://tienda.com.py/categoria/pantalones",
      "https://tienda.com.py/producto/remera-azul",
      "https://tienda.com.py/producto/jean-negro",
    ]);
  });

  it("usa el origen y descarta el path del NEXT_PUBLIC_SITE_URL", () => {
    const entries = buildSitemap(new URL("https://tienda.com.py/algo/"), input);

    expect(entries[0]!.url).toBe("https://tienda.com.py/");
  });

  it("no inventa una fecha para el producto que no la tiene", () => {
    const entries = buildSitemap(new URL("https://tienda.com.py"), input);
    const [conFecha, sinFecha] = entries.slice(-2);

    expect(conFecha!.lastModified).toEqual(new Date("2026-01-15T00:00:00Z"));
    expect(sinFecha).not.toHaveProperty("lastModified");
  });

  it("sin NEXT_PUBLIC_SITE_URL devuelve vacío en vez de URLs relativas", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const { default: sitemap } = await import("../../src/app/sitemap");

    await expect(sitemap()).resolves.toEqual([]);
  });
});

describe("robots.txt", () => {
  it("bloquea todas las rutas privadas", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tienda.com.py");
    const { default: robots } = await import("../../src/app/robots");

    const disallow = robots().rules;
    const reglas = Array.isArray(disallow) ? disallow[0]! : disallow;

    for (const ruta of RUTAS_PRIVADAS) {
      expect(reglas.disallow).toContain(`${ruta}/`);
    }
  });

  it("declara el sitemap sólo si hay origen público", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tienda.com.py");
    const conOrigen = (await import("../../src/app/robots")).default();
    expect(conOrigen.sitemap).toBe("https://tienda.com.py/sitemap.xml");

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const sinOrigen = (await import("../../src/app/robots")).default();
    expect(sinOrigen.sitemap).toBeUndefined();
  });

  /**
   * El guardarraíl que importa: una ruta de la vidriera que muestre datos de
   * un comprador y no esté en la lista se indexa en silencio. Si esto falla
   * por una ruta nueva, la pregunta no es "¿cómo lo hago pasar?" sino "¿esto
   * lo puede ver un buscador?".
   */
  it("cubre todas las rutas de nivel uno que no son públicas", async () => {
    const publicas = new Set(["buscar", "categoria", "producto"]);
    const raiz = path.join(process.cwd(), "src/app");
    const entries = await readdir(raiz, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || publicas.has(entry.name)) continue;
      // `src/app/actions` no es una ruta: son server actions, no páginas.
      if (!(await tieneRuta(path.join(raiz, entry.name)))) continue;
      expect(RUTAS_PRIVADAS).toContain(`/${entry.name}`);
    }
  });
});

async function tieneRuta(dir: string): Promise<boolean> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (await tieneRuta(path.join(dir, entry.name))) return true;
    } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
      return true;
    }
  }
  return false;
}

describe("JSON-LD de categoría", () => {
  const origin = new URL("https://tienda.com.py");

  it("numera la miga de pan desde 1 y apunta a URLs absolutas", () => {
    const jsonLd = breadcrumbJsonLd(origin, [
      { name: "Inicio", path: "/" },
      { name: "Remeras", path: "/categoria/remeras" },
    ]) as { itemListElement: { position: number; item: string }[] };

    expect(jsonLd.itemListElement.map((step) => step.position)).toEqual([1, 2]);
    expect(jsonLd.itemListElement[1]!.item).toBe(
      "https://tienda.com.py/categoria/remeras"
    );
  });

  it("continúa la numeración en las páginas siguientes", () => {
    const jsonLd = itemListJsonLd(
      origin,
      [{ name: "Remera azul", slug: "remera-azul" }],
      {
        name: "Remeras",
        startPosition: 13,
      }
    ) as {
      numberOfItems: number;
      itemListElement: { position: number; url: string }[];
    };

    expect(jsonLd.numberOfItems).toBe(1);
    expect(jsonLd.itemListElement[0]!.position).toBe(13);
    expect(jsonLd.itemListElement[0]!.url).toBe(
      "https://tienda.com.py/producto/remera-azul"
    );
  });

  /** Sin origen, la URL relativa es válida: el buscador la resuelve sola. */
  it("sin origen público emite rutas relativas y no `undefined`", () => {
    const jsonLd = itemListJsonLd(null, [
      { name: "Remera azul", slug: "remera-azul" },
    ]) as {
      itemListElement: { url: string }[];
    };

    expect(jsonLd.itemListElement[0]!.url).toBe("/producto/remera-azul");
  });
});
