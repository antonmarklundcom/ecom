import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  esRutaDePiel,
  HUELLAS_PIEL,
  huellaPiel,
  TESTS_DE_PIEL,
} from "../../scripts/template-shared";
import {
  calcularHuellas,
  contenidoHuellas,
  esPielDelTemplate,
  esRepoDelTemplate,
  leerHuellas,
} from "../helpers/piel";

/**
 * Las huellas de la piel del template (docs/TEMPLATE-INHERITANCE.md § "Tests
 * que miran la piel"). Los tests de piel revisan un archivo mientras sea el
 * que publica el template; para saberlo en una tienda, el template publica la
 * huella de cada uno en `tests/piel-del-template.json`.
 */

describe("huellas de la piel del template", () => {
  it("el archivo existe y viaja con los tests", () => {
    expect(leerHuellas(), `falta ${HUELLAS_PIEL}`).not.toBeNull();
  });

  it.runIf(esRepoDelTemplate())(
    "en el template están al día con la piel (si no, una tienda saltearía archivos que no tocó)",
    () => {
      const guardadas = leerHuellas() ?? {};
      const actuales = calcularHuellas();
      const distintas = [
        ...new Set([...Object.keys(guardadas), ...Object.keys(actuales)]),
      ]
        .filter((ruta) => guardadas[ruta] !== actuales[ruta])
        .sort();
      expect(
        distintas,
        "Cambió la piel del template: corré `pnpm exec tsx tests/helpers/piel.ts --escribir` y commiteá tests/piel-del-template.json"
      ).toEqual([]);
      expect(readFileSync(HUELLAS_PIEL, "utf8")).toBe(
        contenidoHuellas(actuales)
      );
    }
  );

  it("TESTS_DE_PIEL son exactamente los tests que preguntan por la piel", () => {
    const usanElHelper = [
      "src/components/__tests__",
      "tests/unit",
    ].flatMap((dir) =>
      archivosDeTest(dir).filter((ruta) =>
        /from ["'][./]*tests\/helpers\/piel["']|from ["']\.\.\/helpers\/piel["']/.test(
          readFileSync(ruta, "utf8")
        )
      )
    );
    const propios = new Set([
      "tests/unit/piel-del-template.test.ts",
      "tests/unit/piel-tienda-redisenada.test.ts",
    ]);
    expect(usanElHelper.filter((ruta) => !propios.has(ruta)).sort()).toEqual(
      [...TESTS_DE_PIEL].sort()
    );
  });
});

function archivosDeTest(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory()
      ? archivosDeTest(`${dir}/${entrada.name}`)
      : /\.test\.tsx?$/.test(entrada.name)
        ? [`${dir}/${entrada.name}`]
        : []
  );
}

describe("qué es piel", () => {
  it("componentes, páginas y temas sí; rutas API, actions, tests y config no", () => {
    expect(esRutaDePiel("src/components/product-card.tsx")).toBe(true);
    expect(esRutaDePiel("src/app/page.tsx")).toBe(true);
    expect(esRutaDePiel("src/themes/calido.css")).toBe(true);
    expect(esRutaDePiel("src/app/api/health/route.ts")).toBe(false);
    expect(esRutaDePiel("src/app/actions/checkout.ts")).toBe(false);
    expect(esRutaDePiel("src/components/__tests__/x.test.tsx")).toBe(false);
    expect(esRutaDePiel("src/config/tienda.ts")).toBe(false);
    expect(esRutaDePiel("src/lib/money.ts")).toBe(false);
  });

  it("la huella no cambia con finales de línea CRLF (checkout de Windows)", () => {
    expect(huellaPiel("a\r\nb\r\n")).toBe(huellaPiel("a\nb\n"));
    expect(huellaPiel(Buffer.from("a\nb\n"))).toBe(huellaPiel("a\nb\n"));
    expect(huellaPiel("a\nb\n")).not.toBe(huellaPiel("a\nc\n"));
  });
});

describe("esPielDelTemplate en una tienda", () => {
  let raiz = "";
  afterEach(() => {
    if (raiz) rmSync(raiz, { recursive: true, force: true });
    raiz = "";
  });

  function tienda(archivos: Record<string, string>, huellas: Record<string, string> | null) {
    raiz = mkdtempSync(path.join(tmpdir(), "piel-"));
    for (const [ruta, contenido] of Object.entries(archivos)) {
      const completa = path.join(raiz, ...ruta.split("/"));
      mkdirSync(path.dirname(completa), { recursive: true });
      writeFileSync(completa, contenido);
    }
    if (huellas) {
      mkdirSync(path.join(raiz, "tests"), { recursive: true });
      writeFileSync(path.join(raiz, HUELLAS_PIEL), contenidoHuellas(huellas));
    }
    return raiz;
  }

  const CARD = "export const Card = () => null;\n";

  it("el archivo del template es del template; el rediseñado o borrado, no", () => {
    const r = tienda(
      {
        "src/components/product-card.tsx": CARD,
        "src/components/site-footer.tsx": "export const Footer = () => 'propio';\n",
      },
      {
        "src/components/product-card.tsx": huellaPiel(CARD),
        "src/components/site-footer.tsx": huellaPiel("export const Footer = () => null;\n"),
        "src/components/site-header.tsx": huellaPiel("x"),
      }
    );
    expect(esPielDelTemplate("src/components/product-card.tsx", r)).toBe(true);
    expect(esPielDelTemplate("src/components/site-footer.tsx", r)).toBe(false);
    expect(esPielDelTemplate("src/components/site-header.tsx", r)).toBe(false);
    expect(esPielDelTemplate("src/components/propio.tsx", r)).toBe(false);
  });

  it("el mismo archivo con CRLF sigue siendo del template", () => {
    const r = tienda(
      { "src/components/product-card.tsx": CARD.replace(/\n/g, "\r\n") },
      { "src/components/product-card.tsx": huellaPiel(CARD) }
    );
    expect(esPielDelTemplate("src/components/product-card.tsx", r)).toBe(true);
  });

  it("sin huellas no hay nada que dar por del template", () => {
    const r = tienda({ "src/components/product-card.tsx": CARD }, null);
    expect(esPielDelTemplate("src/components/product-card.tsx", r)).toBe(false);
  });

  it("en el repo del template (tiene tiendas.json) toda la piel es del template", () => {
    const r = tienda(
      { "src/components/product-card.tsx": "rediseño\n", "tiendas.json": "[]\n" },
      { "src/components/product-card.tsx": huellaPiel(CARD) }
    );
    expect(esRepoDelTemplate(r)).toBe(true);
    expect(esPielDelTemplate("src/components/product-card.tsx", r)).toBe(true);
  });
});
