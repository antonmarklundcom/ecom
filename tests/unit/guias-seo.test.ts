import { describe, expect, it } from "vitest";

import { articleJsonLd, guiasSitemap } from "@/lib/seo";

/** Las piezas de SEO de las guías (O34): sitemap y `Article`. */

const origin = new URL("https://tienda.example.py");
const guia = {
  slug: "como-elegir",
  titulo: "Cómo elegir",
  descripcion: "Una descripción.",
  publicada: "2026-11-10",
  actualizada: "2026-11-15",
};

describe("guiasSitemap", () => {
  it("sin guías, ninguna entrada (ni siquiera /guias)", () => {
    expect(guiasSitemap(origin, [])).toEqual([]);
  });

  it("el índice con la actualizada más nueva y una entrada por guía", () => {
    const entradas = guiasSitemap(origin, [
      guia,
      { ...guia, slug: "otra", actualizada: "2026-11-20" },
    ]);
    expect(entradas.map((e) => e.url)).toEqual([
      "https://tienda.example.py/guias",
      "https://tienda.example.py/guias/como-elegir",
      "https://tienda.example.py/guias/otra",
    ]);
    expect(entradas[0]!.lastModified?.toISOString()).toBe("2026-11-20T03:00:00.000Z");
    expect(entradas[1]!.lastModified?.toISOString()).toBe("2026-11-15T03:00:00.000Z");
  });
});

describe("articleJsonLd", () => {
  it("headline, description, las dos fechas, autor y editor = la tienda, URL", () => {
    const ld = articleJsonLd({
      origin,
      guia,
      tienda: { nombre: "Tienda", logoUrl: "https://imagenes.example.py/logo.png" },
    });
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Cómo elegir",
      description: "Una descripción.",
      datePublished: "2026-11-10",
      dateModified: "2026-11-15",
      author: {
        "@type": "Organization",
        name: "Tienda",
        url: "https://tienda.example.py/",
        logo: { "@type": "ImageObject", url: "https://imagenes.example.py/logo.png" },
      },
      publisher: {
        "@type": "Organization",
        name: "Tienda",
        url: "https://tienda.example.py/",
        logo: { "@type": "ImageObject", url: "https://imagenes.example.py/logo.png" },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": "https://tienda.example.py/guias/como-elegir",
      },
      url: "https://tienda.example.py/guias/como-elegir",
    });
  });

  it("sin persona, calificación ni FAQPage; imagen sólo si la guía tiene", () => {
    const sin = articleJsonLd({ origin, guia, tienda: { nombre: "T" } });
    const texto = JSON.stringify(sin);
    expect(texto).not.toMatch(/Person|aggregateRating|FAQPage|"image"/);
    expect(
      articleJsonLd({ origin, guia: { ...guia, imagen: "/guias/x.webp" }, tienda: { nombre: "T" } })
        .image
    ).toEqual(["https://tienda.example.py/guias/x.webp"]);
    expect(
      articleJsonLd({ origin: null, guia: { ...guia, imagen: "/guias/x.webp" }, tienda: { nombre: "T" } })
        .image
    ).toBeUndefined();
  });
});
