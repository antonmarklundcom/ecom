import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATEGORIA_PALABRAS_MIN,
  DESCRIPCION_SEO_MAX,
  TITULO_SEO_MAX,
  auditarSeo,
  cargarGuias,
  tablaHallazgos,
  type CategoriaAuditada,
  type ProductoAuditado,
} from "../../scripts/seo-auditar";

const palabras = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");
const descripcionSeo = "x".repeat(130);

const categoriaLimpia: CategoriaAuditada = {
  slug: "anillos",
  name: "Anillos",
  description: palabras(CATEGORIA_PALABRAS_MIN + 10),
  seoTitle: "Anillos de compromiso",
  seoDescription: descripcionSeo,
};
const productoLimpio: ProductoAuditado = {
  slug: "anillo-oro",
  name: "Anillo de oro",
  description: palabras(80),
  seoTitle: null,
  seoDescription: descripcionSeo,
  fotos: 2,
};

const controles = (h: ReturnType<typeof auditarSeo>) => h.map((x) => `${x.tipo}:${x.slug}:${x.control}`);

describe("auditarSeo", () => {
  it("un catálogo completo y sin guías (sin src/lib/guias.ts) no tiene hallazgos", () => {
    expect(auditarSeo({ categorias: [categoriaLimpia], productos: [productoLimpio], guias: null })).toEqual([]);
    expect(tablaHallazgos([])).toBe("Sin hallazgos.");
  });

  it("encuentra textos, campos SEO, fotos y títulos repetidos", () => {
    const hallazgos = auditarSeo({
      categorias: [
        { ...categoriaLimpia, description: palabras(10), seoTitle: "t".repeat(TITULO_SEO_MAX + 1) },
        { ...categoriaLimpia, slug: "aros", name: "Aros", description: null, seoTitle: null, seoDescription: null },
      ],
      productos: [
        { ...productoLimpio, fotos: 0, seoDescription: "y".repeat(DESCRIPCION_SEO_MAX + 1) },
        { ...productoLimpio, slug: "otro", name: "Aros", seoDescription: null, description: "" },
      ],
      guias: null,
    });
    expect(controles(hallazgos)).toEqual(
      expect.arrayContaining([
        "categoria:anillos:descripcionCorta",
        "categoria:anillos:tituloSeoLargo",
        "categoria:aros:sinDescripcion",
        "categoria:aros:sinTituloSeo",
        "categoria:aros:sinDescripcionSeo",
        "producto:anillo-oro:sinFotos",
        "producto:anillo-oro:descripcionSeoFueraDeRango",
        "producto:otro:sinDescripcion",
        "producto:otro:sinDescripcionSeo",
        // "Aros" es el título de una categoría y de un producto.
        "categoria:aros:tituloRepetido",
        "producto:otro:tituloRepetido",
      ])
    );
    expect(tablaHallazgos(hallazgos)).toMatch(/^tipo\s+slug\s+hallazgo/);
  });

  it("con guías: las rotas, las que apuntan a nada y las categorías sin guía", () => {
    const hallazgos = auditarSeo({
      categorias: [categoriaLimpia, { ...categoriaLimpia, slug: "aros", name: "Aros", seoTitle: "Aros de plata" }],
      productos: [productoLimpio],
      guias: {
        guias: [
          { slug: "elegir-anillo", titulo: "Cómo elegir", borrador: false, categorias: ["anillos"], productos: ["no-existe"] },
          { slug: "borrador", titulo: "B", borrador: true, categorias: ["aros"], productos: [] },
        ],
        rotos: [{ archivo: "mala.md", error: "sin front matter" }],
        problemas: new Map([["elegir-anillo", ["descripcion corta"]]]),
      },
    });
    expect(controles(hallazgos)).toEqual([
      "guia:mala.md:guiaIlegible",
      "guia:elegir-anillo:guiaConProblemas",
      "guia:elegir-anillo:guiaApuntaANada",
      // Un borrador no cuenta como guía de "aros".
      "categoria:aros:sinGuia",
    ]);
  });
});

describe("cargarGuias", () => {
  it("sin src/lib/guias.ts (O34 todavía no está): null, y los controles de guías se saltean", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "seo-auditar-"));
    expect(await cargarGuias(raiz, () => Promise.reject(new Error("no debería importar")))).toBeNull();
  });

  it("con src/lib/guias.ts: usa su lector y sus problemas", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "seo-auditar-"));
    mkdirSync(join(raiz, "src/lib"), { recursive: true });
    writeFileSync(join(raiz, "src/lib/guias.ts"), "// O34");
    const guia = { slug: "g", titulo: "G", borrador: false, categorias: ["c"], productos: [] };
    const cargadas = await cargarGuias(raiz, async (url) => {
      expect(url).toMatch(/src\/lib\/guias\.ts$/);
      return {
        directorioGuias: (r: string) => join(r, "src/content/guias"),
        leerCarpetaDeGuias: () => ({ guias: [guia], rotos: [] }),
        problemasDeGuias: () => new Map([["g", ["x"]]]),
      };
    });
    expect(cargadas).toEqual({ guias: [guia], rotos: [], problemas: new Map([["g", ["x"]]]) });
  });
});
