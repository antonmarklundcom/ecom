import { readdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RUTAS_PRIVADAS,
  breadcrumbJsonLd,
  buildSitemap,
  itemListJsonLd,
  productJsonLd,
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
    // `feed.xml`: el catálogo para Google Merchant y Meta (src/lib/product-feed.ts),
    // los mismos datos públicos que las fichas.
    const publicas = new Set(["buscar", "categoria", "producto", "feed.xml"]);
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

describe("productJsonLd", () => {
  const base = {
    slug: "conjunto-encaje",
    name: "Conjunto de encaje",
    description: "Suave",
    brand: null,
    variants: [
      { sku: "CE-S", label: "S", pricePyg: 150_000, available: 3 },
      { sku: "CE-M", label: "M", pricePyg: 150_000, available: 0 },
    ],
  };

  it("lleva imagen, url y condición: sin eso Google no da rich result de producto", () => {
    const jsonLd = productJsonLd({
      ...base,
      origin: new URL("https://tienda.com.py"),
      images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
    }) as { image: string[]; url: string; offers: Array<Record<string, unknown>> };

    expect(jsonLd.image).toEqual(["https://res.cloudinary.com/x/image/upload/a.jpg"]);
    expect(jsonLd.url).toBe("https://tienda.com.py/producto/conjunto-encaje");
    expect(jsonLd.offers[0]).toMatchObject({
      url: "https://tienda.com.py/producto/conjunto-encaje",
      itemCondition: "https://schema.org/NewCondition",
      availability: "https://schema.org/InStock",
      priceCurrency: "PYG",
    });
    expect(jsonLd.offers[1]?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("sin foto ni dominio, omite los campos en vez de inventarlos", () => {
    const jsonLd = productJsonLd({ ...base, origin: null, images: [] });
    expect(jsonLd.image).toBeUndefined();
    expect(jsonLd.url).toBeUndefined();
  });
});

describe("productJsonLd · reseñas verificadas", () => {
  const base = {
    origin: new URL("https://tienda.com.py"),
    slug: "conjunto-encaje",
    name: "Conjunto de encaje",
    images: [],
    variants: [{ sku: "CE-S", label: "S", pricePyg: 150_000, available: 3 }],
  };

  // 22:30 del 14 de marzo en Asunción = 01:30 del 15 en UTC.
  const deNoche = new Date("2026-03-15T01:30:00.000Z");

  const resenas = Array.from({ length: 7 }, (_, index) => ({
    author: `Rosa ${String.fromCharCode(65 + index)}.`,
    rating: 5 - (index % 2),
    title: index === 0 ? "Hermoso" : null,
    body: `Me encantó, la tela es muy suave (${index}).`,
    date: deNoche,
  }));

  it("con reseñas aprobadas emite aggregateRating y hasta 5 Review", () => {
    const jsonLd = productJsonLd({
      ...base,
      rating: { average: 4.6, count: 12 },
      reviews: resenas,
    }) as { aggregateRating: Record<string, unknown>; review: Array<Record<string, unknown>> };

    expect(jsonLd.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.6,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
    expect(jsonLd.review).toHaveLength(5);
    expect(jsonLd.review[0]).toEqual({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5, worstRating: 1 },
      author: { "@type": "Person", name: "Rosa A." },
      // El día de Asunción, no el de UTC.
      datePublished: "2026-03-14",
      name: "Hermoso",
      reviewBody: "Me encantó, la tela es muy suave (0).",
    });
    // Sin título, sin `name`: no se inventa uno.
    expect(jsonLd.review[1]).not.toHaveProperty("name");
  });

  it("con cero reseñas no aparece ninguna de las dos claves", () => {
    const sinNada = productJsonLd(base);
    const conCero = productJsonLd({ ...base, rating: { average: 0, count: 0 }, reviews: [] });

    for (const jsonLd of [sinNada, conCero]) {
      expect(jsonLd).not.toHaveProperty("aggregateRating");
      expect(jsonLd).not.toHaveProperty("review");
    }
  });
});
