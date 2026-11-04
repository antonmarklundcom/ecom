import { readdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RUTAS_PRIVADAS,
  breadcrumbJsonLd,
  buildSitemap,
  categoryTrail,
  itemListJsonLd,
  jsonLdScript,
  organizationJsonLd,
  productJsonLd,
  websiteJsonLd,
  type MerchantPoliciesLd,
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
      expect(reglas.disallow).toContain(`${ruta}$`);
      expect(reglas.disallow).toContain(`${ruta}?`);
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
    // Las páginas de políticas (`/admin/ajustes` → páginas): texto de la
    // tienda, sin datos de nadie, y justamente lo que Google tiene que leer.
    const publicas = new Set([
      "buscar",
      "categoria",
      "producto",
      "feed.xml",
      "envios",
      "devoluciones",
      "preguntas-frecuentes",
      "terminos",
      "privacidad",
    ]);
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
      images: ["https://img.tienda.test/p1/a-0123456789.jpg"],
    }) as {
      image: string[];
      url: string;
      offers: Array<Record<string, unknown>>;
    };

    expect(jsonLd.image).toEqual([
      "https://img.tienda.test/p1/a-0123456789.jpg",
    ]);
    expect(jsonLd.url).toBe("https://tienda.com.py/producto/conjunto-encaje");
    expect(jsonLd.offers[0]).toMatchObject({
      url: "https://tienda.com.py/producto/conjunto-encaje?variante=CE-S",
      itemCondition: "https://schema.org/NewCondition",
      availability: "https://schema.org/InStock",
      priceCurrency: "PYG",
    });
    expect(jsonLd.offers[1]?.availability).toBe(
      "https://schema.org/OutOfStock"
    );
  });

  it("sin foto ni dominio, omite los campos en vez de inventarlos", () => {
    const jsonLd = productJsonLd({ ...base, origin: null, images: [] });
    expect(jsonLd.image).toBeUndefined();
    expect(jsonLd.url).toBeUndefined();
  });

  it("sin ningún precio cobrable no publica una lista de ofertas vacía", () => {
    const jsonLd = productJsonLd({
      ...base,
      origin: null,
      images: [],
      variants: base.variants.map((variant) => ({ ...variant, pricePyg: 0 })),
    });
    expect(jsonLd).not.toHaveProperty("offers");
    expect(JSON.stringify(jsonLd)).not.toContain('"offers"');
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
    }) as {
      aggregateRating: Record<string, unknown>;
      review: Array<Record<string, unknown>>;
    };

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
      reviewRating: {
        "@type": "Rating",
        ratingValue: 5,
        bestRating: 5,
        worstRating: 1,
      },
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
    const conCero = productJsonLd({
      ...base,
      rating: { average: 0, count: 0 },
      reviews: [],
    });

    for (const jsonLd of [sinNada, conCero]) {
      expect(jsonLd).not.toHaveProperty("aggregateRating");
      expect(jsonLd).not.toHaveProperty("review");
    }
  });
});

describe("productJsonLd · envío y devoluciones (ajustes de la tienda)", () => {
  const base = {
    origin: new URL("https://tienda.com.py"),
    slug: "remera",
    name: "Remera",
    images: [],
    variants: [
      { sku: "R-S", label: "S", pricePyg: 90_000, available: 2 },
      { sku: "R-M", label: "M", pricePyg: 90_000, available: 1 },
    ],
  };

  const vacio: MerchantPoliciesLd = {
    handlingDaysMin: null,
    handlingDaysMax: null,
    transitDaysMin: null,
    transitDaysMax: null,
    shippingFromPyg: null,
    acceptsReturns: null,
    returnDays: null,
    returnFees: null,
    returnMethod: null,
  };

  const envio: MerchantPoliciesLd = {
    ...vacio,
    handlingDaysMin: 0,
    handlingDaysMax: 1,
    transitDaysMin: 1,
    transitDaysMax: 3,
    shippingFromPyg: 25_000,
  };

  type Offer = Record<string, unknown> & {
    shippingDetails?: Record<string, unknown>;
    hasMerchantReturnPolicy?: Record<string, unknown>;
  };
  const offers = (merchant: MerchantPoliciesLd): Offer[] =>
    (productJsonLd({ ...base, merchant }) as { offers: Offer[] }).offers;

  it("sin nada cargado no agrega ni envío ni política de devolución", () => {
    for (const offer of offers(vacio)) {
      expect(offer).not.toHaveProperty("shippingDetails");
      expect(offer).not.toHaveProperty("hasMerchantReturnPolicy");
    }
    // Y sin `merchant`, igual que antes de esta sección.
    const sin = productJsonLd(base) as { offers: Offer[] };
    expect(sin.offers[0]).not.toHaveProperty("shippingDetails");
  });

  it("con precio y los dos rangos, cada Offer lleva OfferShippingDetails en PYG a PY", () => {
    for (const offer of offers(envio)) {
      expect(offer.shippingDetails).toEqual({
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 25_000,
          currency: "PYG",
        },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "PY" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 0,
            maxValue: 1,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 3,
            unitCode: "DAY",
          },
        },
      });
    }
  });

  it("un envío a medias no se publica: falta un rango o falta el precio", () => {
    expect(offers({ ...envio, transitDaysMax: null })[0]).not.toHaveProperty(
      "shippingDetails"
    );
    expect(offers({ ...envio, shippingFromPyg: null })[0]).not.toHaveProperty(
      "shippingDetails"
    );
  });

  it("envío gratis (₲0) sí es un dato y se publica", () => {
    const [offer] = offers({ ...envio, shippingFromPyg: 0 });
    expect(offer?.shippingDetails).toMatchObject({
      shippingRate: { value: 0, currency: "PYG" },
    });
  });

  it("acepta devoluciones: ventana finita, días, costo y método", () => {
    const [offer] = offers({
      ...vacio,
      acceptsReturns: true,
      returnDays: 7,
      returnFees: "cliente",
      returnMethod: "envio",
    });
    expect(offer?.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PY",
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      returnMethod: "https://schema.org/ReturnByMail",
    });
  });

  it("devolución gratis y en los dos lugares: FreeReturn y los dos métodos", () => {
    const [offer] = offers({
      ...vacio,
      acceptsReturns: true,
      returnDays: 30,
      returnFees: "gratis",
      returnMethod: "ambos",
    });
    expect(offer?.hasMerchantReturnPolicy).toMatchObject({
      returnFees: "https://schema.org/FreeReturn",
      returnMethod: [
        "https://schema.org/ReturnByMail",
        "https://schema.org/ReturnInStore",
      ],
    });
  });

  it("sin costo ni método cargados, esos campos se omiten", () => {
    const [offer] = offers({
      ...vacio,
      acceptsReturns: true,
      returnDays: 10,
      returnMethod: "local",
    });
    expect(offer?.hasMerchantReturnPolicy).not.toHaveProperty("returnFees");
    expect(offer?.hasMerchantReturnPolicy).toMatchObject({
      returnMethod: "https://schema.org/ReturnInStore",
    });
  });

  it("no acepta devoluciones: MerchantReturnNotPermitted, sin días", () => {
    const [offer] = offers({ ...vacio, acceptsReturns: false, returnDays: 7 });
    expect(offer?.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PY",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    });
  });

  it("acepta devoluciones pero sin días: no inventa una ventana", () => {
    expect(offers({ ...vacio, acceptsReturns: true })[0]).not.toHaveProperty(
      "hasMerchantReturnPolicy"
    );
  });
});

describe("organizationJsonLd", () => {
  it("sin origen configurado no sale", () => {
    expect(organizationJsonLd({ origin: null, name: "Tienda" })).toBeNull();
  });

  it("con origen: nombre, url, contacto y redes", () => {
    expect(
      organizationJsonLd({
        origin: new URL("https://tienda.com.py/algo"),
        name: "Tienda",
        telephone: "+595981123456",
        email: "hola@tienda.com.py",
        sameAs: ["https://instagram.com/tienda"],
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Tienda",
      url: "https://tienda.com.py/",
      email: "hola@tienda.com.py",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: "+595981123456",
        email: "hola@tienda.com.py",
        areaServed: "PY",
      },
      sameAs: ["https://instagram.com/tienda"],
    });
  });

  it("sin teléfono ni email ni redes, sólo nombre y url", () => {
    const jsonLd = organizationJsonLd({
      origin: new URL("https://tienda.com.py"),
      name: "Tienda",
    });
    expect(jsonLd).not.toHaveProperty("contactPoint");
    expect(jsonLd).not.toHaveProperty("sameAs");
    expect(jsonLd).not.toHaveProperty("email");
  });
});

describe("sitemap · páginas de políticas", () => {
  it("suma las páginas prendidas con URL absoluta", () => {
    const entries = buildSitemap(new URL("https://tienda.com.py"), {
      categories: [],
      products: [],
      pages: ["envios", "terminos"],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://tienda.com.py/",
      "https://tienda.com.py/envios",
      "https://tienda.com.py/terminos",
    ]);
  });
});

describe("sitemap · lastmod", () => {
  const origin = new URL("https://tienda.com.py");

  it("la categoría y la home llevan la fecha del último producto que cambió", () => {
    const entries = buildSitemap(origin, {
      categories: [
        { slug: "remeras", updatedAt: new Date("2026-03-01T00:00:00Z") },
        { slug: "vacia", updatedAt: null },
      ],
      products: [
        { slug: "a", updatedAt: new Date("2026-02-01T00:00:00Z") },
        { slug: "b", updatedAt: new Date("2026-03-01T00:00:00Z") },
      ],
    });
    const porUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(porUrl.get("https://tienda.com.py/")?.lastModified).toEqual(
      new Date("2026-03-01T00:00:00Z")
    );
    expect(
      porUrl.get("https://tienda.com.py/categoria/remeras")?.lastModified
    ).toEqual(new Date("2026-03-01T00:00:00Z"));
    // Sin productos publicados no hay fecha que decir: no se inventa una.
    expect(porUrl.get("https://tienda.com.py/categoria/vacia")).not.toHaveProperty(
      "lastModified"
    );
  });

  it("sin ninguna fecha, la home sale sin lastModified", () => {
    const [home] = buildSitemap(origin, { categories: [], products: [] });
    expect(home).not.toHaveProperty("lastModified");
  });

  it("nunca lista rutas privadas", () => {
    const entries = buildSitemap(origin, {
      categories: [{ slug: "remeras" }],
      products: [{ slug: "a", updatedAt: null }],
      pages: ["envios"],
    });
    for (const entry of entries) {
      expect(entry.url.startsWith("https://tienda.com.py/")).toBe(true);
      for (const privada of RUTAS_PRIVADAS) {
        expect(new URL(entry.url).pathname.startsWith(privada)).toBe(false);
      }
    }
  });
});

describe("productJsonLd · precio oculto y modos de venta", () => {
  const base = {
    origin: new URL("https://tienda.com.py"),
    slug: "silla",
    name: "Silla",
    description: "De madera",
    brand: "Muebles PY",
    images: ["https://imagenes.tienda.test/p1/silla-0123456789.jpg"],
    variants: [{ sku: "SI-1", label: "Única", pricePyg: 450_000, available: 2 }],
  };

  it("en venta: name, image, description, sku, brand y una Offer completa en PYG", () => {
    const jsonLd = productJsonLd(base) as Record<string, unknown> & {
      offers: Array<Record<string, unknown>>;
    };
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "Silla",
      description: "De madera",
      sku: "SI-1",
      brand: { "@type": "Brand", name: "Muebles PY" },
      image: base.images,
      url: "https://tienda.com.py/producto/silla",
    });
    expect(jsonLd.offers).toEqual([
      expect.objectContaining({
        "@type": "Offer",
        price: 450_000,
        priceCurrency: "PYG",
        availability: "https://schema.org/InStock",
        url: "https://tienda.com.py/producto/silla?variante=SI-1",
      }),
    ]);
    expect(jsonLd).not.toHaveProperty("aggregateRating");
  });

  it.each([
    { caso: "precio oculto", extra: { showPrice: false } },
    { caso: "sólo consulta", extra: { saleMode: "enquiry" as const } },
    { caso: "vidriera", extra: { saleMode: "showcase" as const } },
  ])("$caso: el producto sale, pero sin Offer ni precio", ({ extra }) => {
    const jsonLd = productJsonLd({ ...base, ...extra });
    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.name).toBe("Silla");
    expect(jsonLd).not.toHaveProperty("offers");
    expect(JSON.stringify(jsonLd)).not.toContain("450000");
  });
});

describe("BreadcrumbList de la ficha y jerarquía de categorías", () => {
  const categorias = [
    { id: 1, slug: "ropa", name: "Ropa", parentId: null },
    { id: 2, slug: "mujer", name: "Mujer", parentId: 1 },
    { id: 3, slug: "remeras", name: "Remeras", parentId: 2 },
    { id: 4, slug: "huerfana", name: "Huérfana", parentId: 99 },
    { id: 5, slug: "ciclo-a", name: "A", parentId: 6 },
    { id: 6, slug: "ciclo-b", name: "B", parentId: 5 },
  ];

  it("arma el camino desde la raíz por parent_id", () => {
    expect(categoryTrail(categorias, "remeras").map((c) => c.slug)).toEqual([
      "ropa",
      "mujer",
      "remeras",
    ]);
  });

  it("una madre que no está (desactivada) corta el camino ahí", () => {
    expect(categoryTrail(categorias, "huerfana").map((c) => c.slug)).toEqual([
      "huerfana",
    ]);
  });

  it("un ciclo en la base no cuelga el render", () => {
    expect(categoryTrail(categorias, "ciclo-a").map((c) => c.slug)).toEqual([
      "ciclo-b",
      "ciclo-a",
    ]);
  });

  it("una categoría desconocida da un camino vacío", () => {
    expect(categoryTrail(categorias, "no-existe")).toEqual([]);
  });

  it("la miga de la ficha: inicio, categorías y el producto, con URLs absolutas", () => {
    const trail = categoryTrail(categorias, "remeras");
    const jsonLd = breadcrumbJsonLd(new URL("https://tienda.com.py"), [
      { name: "Inicio", path: "/" },
      ...trail.map((c) => ({ name: c.name, path: `/categoria/${c.slug}` })),
      { name: "Remera azul", path: "/producto/remera-azul" },
    ]) as { itemListElement: Array<Record<string, unknown>> };

    expect(jsonLd.itemListElement.map((item) => item.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(jsonLd.itemListElement.at(-1)).toMatchObject({
      name: "Remera azul",
      item: "https://tienda.com.py/producto/remera-azul",
    });
    expect(jsonLd.itemListElement[2]).toMatchObject({
      item: "https://tienda.com.py/categoria/mujer",
    });
  });
});

describe("Organization y WebSite del layout", () => {
  it("el logo sale sólo si es una URL https absoluta", () => {
    const origin = new URL("https://tienda.com.py");
    expect(
      organizationJsonLd({
        origin,
        name: "Tienda",
        logo: "https://imagenes.tienda.test/p1/logo-0123456789.jpg",
      })
    ).toMatchObject({ logo: "https://imagenes.tienda.test/p1/logo-0123456789.jpg" });
    expect(
      organizationJsonLd({ origin, name: "Tienda", logo: "/logo.png" })
    ).not.toHaveProperty("logo");
    expect(organizationJsonLd({ origin, name: "Tienda", logo: null })).not.toHaveProperty(
      "logo"
    );
  });

  it("WebSite con el buscador de /buscar", () => {
    expect(
      websiteJsonLd({ origin: new URL("https://tienda.com.py/x"), name: "Tienda" })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Tienda",
      url: "https://tienda.com.py/",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://tienda.com.py/buscar?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    });
  });

  it("sin origen público no sale ninguno de los dos", () => {
    expect(websiteJsonLd({ origin: null, name: "Tienda" })).toBeNull();
    expect(organizationJsonLd({ origin: null, name: "Tienda" })).toBeNull();
  });

  it("un nombre de marca con </script> no cierra la etiqueta", () => {
    const salida = jsonLdScript(
      websiteJsonLd({
        origin: new URL("https://tienda.com.py"),
        name: "Mi </script><script>alert(1)</script> tienda",
      })
    );
    expect(salida).not.toContain("<");
    expect(JSON.parse(salida).name).toBe(
      "Mi </script><script>alert(1)</script> tienda"
    );
  });

  it("el layout arma los dos desde marcaEfectiva y el contacto, sin nombre hardcodeado", async () => {
    const { readFile } = await import("node:fs/promises");
    const layout = await readFile(path.join("src", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("organizationJsonLd(");
    expect(layout).toContain("websiteJsonLd(");
    expect(layout).toMatch(/name: marca\.nombre/);
    expect(layout).toMatch(/logo: marca\.logoUrl/);
  });
});

