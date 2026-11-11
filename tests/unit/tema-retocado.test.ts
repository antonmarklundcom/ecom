import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TESTS_DE_PIEL } from "../../scripts/template-shared";

/**
 * Sur, en el arnés de O23: antes del kit de temas, NEW-STORE.md §5 mandaba a
 * retocar `--radius` en `src/styles/temas/<tema>.css`. Ese archivo hoy lo
 * genera el template (`pnpm temas:css`), y `tests/unit/temas.test.ts` lo
 * comparaba byte a byte con los presets: la tienda quedaba en rojo por un
 * retoque que los docs le habían pedido. Ahora es piel con huella
 * (docs/TEMPLATE-INHERITANCE.md § "Tests que miran la piel"): el retocado sale
 * skipped, el resto del tema se sigue revisando.
 *
 * El control: el mismo retoque en el template (con `tiendas.json`) lo pone en
 * rojo, que es lo que tiene que pasar ahí.
 */

const REPO = process.cwd();
const VITEST = path.join(REPO, "node_modules", "vitest", "vitest.mjs");
const TEST = "tests/unit/temas.test.ts";
const NEUTRO = path.join("src", "styles", "temas", "neutro.css");

let tienda = "";

function correr(): { codigo: number; salida: string } {
  try {
    const salida = execFileSync(
      process.execPath,
      [VITEST, "run", "--project", "unit", "--reporter=verbose", TEST],
      {
        cwd: tienda,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "", FORCE_COLOR: "0", NO_COLOR: "1" },
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    return { codigo: 0, salida };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
  }
}

beforeAll(() => {
  tienda = mkdtempSync(path.join(tmpdir(), "tienda-tema-retocado-"));
  for (const ruta of [
    "src",
    "scripts/template-shared.ts",
    "scripts/temas-css.ts",
    "tests/helpers",
    "tests/setup",
    "tests/piel-del-template.json",
    TEST,
    "vitest.config.mts",
    "vitest.setup.ts",
    "tsconfig.json",
    "package.json",
  ]) {
    cpSync(path.join(REPO, ruta), path.join(tienda, ruta), { recursive: true });
  }
  symlinkSync(
    path.join(REPO, "node_modules"),
    path.join(tienda, "node_modules"),
    "junction"
  );
  // Con regex y no con el valor del template: en una tienda que ya lo
  // retocó (Sur) este test tiene que pasar igual.
  const css = readFileSync(path.join(tienda, NEUTRO), "utf8");
  expect(css).toMatch(/--radius: [^;]+;/);
  writeFileSync(path.join(tienda, NEUTRO), css.replace(/--radius: [^;]+;/, "--radius: 0.25rem;"));
}, 120_000);

afterAll(() => {
  if (tienda) rmSync(tienda, { recursive: true, force: true });
});

describe("una tienda con su tema retocado en src/styles/temas/ corre temas.test.ts", () => {
  it("es un test de piel", () => {
    expect(TESTS_DE_PIEL).toContain(TEST);
  });

  it("pasa: el archivo retocado sale skipped y el resto del tema se revisa", () => {
    const { codigo, salida } = correr();
    expect(salida, salida).toMatch(/Test Files\s+1 passed/);
    expect(codigo, salida).toBe(0);
    expect(salida).toMatch(/↓.*neutro\.css es exactamente/);
    expect(salida).toMatch(/✓.*todos los :root definen exactamente el mismo conjunto/);
  });

  it("control: el mismo retoque en el template lo pone en rojo", () => {
    writeFileSync(path.join(tienda, "tiendas.json"), "[]\n");
    try {
      const { codigo, salida } = correr();
      expect(codigo, salida).not.toBe(0);
      expect(salida).toMatch(/FAIL.*neutro\.css es exactamente/);
      expect(salida).toMatch(/FAIL.*temas\.css y los archivos legados están al día/);
    } finally {
      rmSync(path.join(tienda, "tiendas.json"), { force: true });
    }
  });
});
