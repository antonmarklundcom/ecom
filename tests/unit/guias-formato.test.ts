import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  directorioGuias,
  esFechaValida,
  leerCarpetaDeGuias,
  parsearFrontMatter,
  parsearGuia,
  problemasDeGuia,
  problemasDeGuias,
  slugsDesconocidos,
  type Guia,
} from "@/lib/guias";

/**
 * `src/lib/guias.ts`: el front matter, las reglas y la lectura de la carpeta,
 * con las guías de ejemplo de `tests/fixtures/guias/`.
 */

const FIXTURES = join(process.cwd(), "tests/fixtures/guias");

function guia(parcial: Partial<Guia> = {}): Guia {
  return {
    slug: "como-elegir",
    titulo: "Cómo elegir",
    descripcion: "x".repeat(130),
    publicada: "2026-11-10",
    actualizada: "2026-11-12",
    categorias: ["colchones"],
    productos: [],
    faq: [],
    fuentes: [],
    borrador: false,
    imagen: null,
    cuerpo: "Texto.",
    ...parcial,
  };
}

describe("parsearFrontMatter", () => {
  it("escalares con y sin comillas, listas en línea y en bloque, pares", () => {
    const datos = parsearFrontMatter(
      [
        "titulo: Cómo elegir: la guía",
        'descripcion: "Con, comas y \\"comillas\\""',
        "otra: 'con ''apóstrofo'''",
        "categorias: [uno, 'dos, tres']",
        "productos:",
        "  - a",
        "  - b",
        "faq:",
        "  - pregunta: ¿Sí?",
        "    respuesta: Sí: claro.",
        "  - pregunta: ¿No?",
        "    respuesta: No.",
        "# un comentario",
      ].join("\n")
    );
    expect(datos).toEqual({
      titulo: "Cómo elegir: la guía",
      descripcion: 'Con, comas y "comillas"',
      otra: "con 'apóstrofo'",
      categorias: ["uno", "dos, tres"],
      productos: ["a", "b"],
      faq: [
        { pregunta: "¿Sí?", respuesta: "Sí: claro." },
        { pregunta: "¿No?", respuesta: "No." },
      ],
    });
  });

  it("lo que no es el subconjunto no se adivina", () => {
    expect(() => parsearFrontMatter("titulo: |\n  multilínea")).toThrow(/YAML/);
    expect(() => parsearFrontMatter("titulo: a\ntitulo: b")).toThrow(/repetida/);
    expect(() => parsearFrontMatter("  sangria: x")).toThrow(/sangría/);
    expect(() => parsearFrontMatter("sin dos puntos")).toThrow(/clave: valor/);
    expect(() => parsearFrontMatter("lista:\n  - a\n  - b: c")).toThrow(/mezcla/);
  });
});

describe("parsearGuia", () => {
  it("lee las guías de ejemplo", () => {
    const { guias, rotos } = leerCarpetaDeGuias(FIXTURES);
    expect(rotos).toEqual([]);
    expect(guias.map((g) => g.slug)).toEqual([
      "borrador-de-prueba",
      "como-elegir-en-el-navegador",
      "otra-guia-de-prueba",
    ]);
    const primera = guias.find((g) => g.slug === "como-elegir-en-el-navegador")!;
    expect(primera).toMatchObject({
      publicada: "2026-11-10",
      actualizada: "2026-11-15",
      borrador: false,
      categorias: ["browser-fixtures", "categoria-que-no-existe"],
      productos: ["browser-stock", "producto-que-no-existe"],
      fuentes: [
        { titulo: "Especificación de Markdown (CommonMark)", url: "https://spec.commonmark.org/" },
      ],
    });
    expect(primera.faq).toHaveLength(1);
    expect(primera.cuerpo.startsWith("Esta guía existe")).toBe(true);
    // Sin `actualizada`, vale la de publicación.
    expect(guias.find((g) => g.slug === "borrador-de-prueba")!.actualizada).toBe("2026-11-14");
  });

  it("el README y lo que no es .md no son guías; una carpeta que no existe es 'sin guías'", () => {
    expect(leerCarpetaDeGuias(join(process.cwd(), "src/content/guias")).rotos).toEqual([]);
    expect(leerCarpetaDeGuias(join(FIXTURES, "no-existe"))).toEqual({ guias: [], rotos: [] });
  });

  it("claves desconocidas y borrador que no es booleano son errores", () => {
    expect(() => parsearGuia("x", "---\ntitulo: a\nautor: Juan\n---\ncuerpo")).toThrow(/autor/);
    expect(() => parsearGuia("x", "---\nborrador: si\n---\ncuerpo")).toThrow(/borrador/);
    expect(() => parsearGuia("x", "sin front matter")).toThrow(/front matter/);
    expect(() =>
      parsearGuia("x", "---\nfaq:\n  - pregunta: ¿Y?\n---\ncuerpo")
    ).toThrow(/respuesta/);
  });

  it("un archivo roto se informa, no tira la lectura entera", () => {
    const { guias, rotos } = leerCarpetaDeGuias(join(FIXTURES, "invalidas"));
    expect(rotos.map((r) => r.archivo)).toEqual(["sin-front-matter.md"]);
    expect(guias.map((g) => g.slug)).toEqual(["con-problemas"]);
  });
});

describe("problemasDeGuia — lo que el test de contenido exige", () => {
  it("una guía correcta no tiene problemas", () => {
    expect(problemasDeGuia(guia())).toEqual([]);
  });

  it("las guías de ejemplo publicadas pasan; la inválida junta todos los problemas", () => {
    const { guias } = leerCarpetaDeGuias(FIXTURES);
    for (const g of guias.filter((g) => !g.borrador)) {
      expect(problemasDeGuia(g), g.slug).toEqual([]);
    }
    const [mala] = leerCarpetaDeGuias(join(FIXTURES, "invalidas")).guias;
    const problemas = problemasDeGuia(mala!).join("\n");
    expect(problemas).toMatch(/titulo tiene \d+ caracteres/);
    expect(problemas).toMatch(/descripcion tiene 6 caracteres/);
    expect(problemas).toMatch(/publicada "2026-02-30"/);
    expect(problemas).toMatch(/al menos una categoría o un producto/);
    expect(problemas).toMatch(/encabezado #/);
    expect(problemas).toMatch(/link "http:\/\/example.com"/);
    expect(problemas).toMatch(/link "javascript:alert\(1/);
    expect(problemas).toMatch(/\[COMPLETAR\]/);
  });

  it("límites exactos: título 70, descripción 110 y 160", () => {
    expect(problemasDeGuia(guia({ titulo: "t".repeat(70) }))).toEqual([]);
    expect(problemasDeGuia(guia({ titulo: "t".repeat(71) }))).toHaveLength(1);
    expect(problemasDeGuia(guia({ descripcion: "d".repeat(110) }))).toEqual([]);
    expect(problemasDeGuia(guia({ descripcion: "d".repeat(160) }))).toEqual([]);
    expect(problemasDeGuia(guia({ descripcion: "d".repeat(109) }))).toHaveLength(1);
    expect(problemasDeGuia(guia({ descripcion: "d".repeat(161) }))).toHaveLength(1);
    // Caracteres, no bytes: las tildes cuentan uno.
    expect(problemasDeGuia(guia({ titulo: "á".repeat(70) }))).toEqual([]);
  });

  it("fechas: reales, y actualizada no antes que publicada", () => {
    expect(esFechaValida("2028-02-29")).toBe(true);
    expect(esFechaValida("2026-02-29")).toBe(false);
    expect(esFechaValida("2026-1-05")).toBe(false);
    expect(problemasDeGuia(guia({ actualizada: "2026-11-01" }))).toEqual([
      "actualizada es anterior a publicada",
    ]);
  });

  it("slug del archivo, links del cuerpo, fuentes e imagen", () => {
    expect(problemasDeGuia(guia({ slug: "Con Espacios" }))[0]).toMatch(/no es un slug/);
    expect(problemasDeGuia(guia({ cuerpo: "[a](/categoria/x) y [b](https://x.py)" }))).toEqual([]);
    expect(problemasDeGuia(guia({ cuerpo: "[a](//otro.sitio)" }))).toHaveLength(1);
    expect(problemasDeGuia(guia({ fuentes: [{ titulo: "x", url: "http://x.py" }] }))).toHaveLength(1);
    expect(problemasDeGuia(guia({ imagen: "/guias/x.webp" }))).toEqual([]);
    expect(problemasDeGuia(guia({ imagen: "data:image/png;base64,x" }))).toHaveLength(1);
  });

  it("[COMPLETAR] sólo frena una publicada, en cualquier campo", () => {
    expect(problemasDeGuia(guia({ borrador: true, cuerpo: "[COMPLETAR]" }))).toEqual([]);
    expect(
      problemasDeGuia(guia({ faq: [{ pregunta: "¿?", respuesta: "[COMPLETAR]" }] }))
    ).toHaveLength(1);
  });

  it("dos guías con el mismo título (sin importar mayúsculas)", () => {
    const problemas = problemasDeGuias([
      guia({ slug: "a", titulo: "Cómo elegir" }),
      guia({ slug: "b", titulo: "cómo ELEGIR" }),
    ]);
    expect([...problemas]).toEqual([["b", ['mismo titulo que "a"']]]);
  });
});

describe("slugsDesconocidos", () => {
  it("lista lo que el catálogo no tiene, por guía", () => {
    const { guias } = leerCarpetaDeGuias(FIXTURES);
    expect(
      slugsDesconocidos(guias, {
        categorias: ["browser-fixtures"],
        productos: ["browser-stock", "browser-enquiry"],
      })
    ).toEqual([
      { guia: "como-elegir-en-el-navegador", tipo: "categoria", slug: "categoria-que-no-existe" },
      { guia: "como-elegir-en-el-navegador", tipo: "producto", slug: "producto-que-no-existe" },
    ]);
  });
});

describe("directorioGuias", () => {
  const raiz = "/repo";
  it("por defecto, src/content/guias de la tienda", () => {
    expect(directorioGuias(raiz, {})).toBe("/repo/src/content/guias");
  });
  it("GUIAS_DIR sólo vale adentro de tests/fixtures/", () => {
    expect(directorioGuias(raiz, { GUIAS_DIR: "tests/fixtures/guias" })).toBe(
      "/repo/tests/fixtures/guias"
    );
    expect(directorioGuias(raiz, { GUIAS_DIR: "src" })).toBe("/repo/src/content/guias");
    expect(directorioGuias(raiz, { GUIAS_DIR: "tests/fixtures/../../etc" })).toBe(
      "/repo/src/content/guias"
    );
    expect(directorioGuias(raiz, { GUIAS_DIR: "tests/fixtures" })).toBe("/repo/src/content/guias");
  });
});

describe("una carpeta de verdad", () => {
  const tmp = mkdtempSync(join(tmpdir(), "guias-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  it("finales de línea de Windows y BOM se leen igual", () => {
    writeFileSync(
      join(tmp, "windows.md"),
      "﻿---\r\ntitulo: Windows\r\npublicada: 2026-11-10\r\ncategorias: [a]\r\n---\r\nCuerpo\r\n"
    );
    const { guias, rotos } = leerCarpetaDeGuias(tmp);
    expect(rotos).toEqual([]);
    expect(guias[0]).toMatchObject({ titulo: "Windows", categorias: ["a"], cuerpo: "Cuerpo" });
  });
});
