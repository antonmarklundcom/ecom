import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_URL, closeTestDb, hasTestDb, resetTables } from "../helpers/db";

const run = promisify(execFile);

/**
 * `pnpm seo:auditar` contra los datos demo (O35): la tabla para personas,
 * `--json` para sesiones y `--estricto` que sale con 1 si hay hallazgos.
 * Sólo lee: corre dos veces y da lo mismo.
 */
async function tsx(
  script: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout } = await run(
      // El CLI de tsx con el mismo node (también en Windows, sin `.cmd`).
      process.execPath,
      [join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), script, ...args],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        timeout: 90_000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const fallo = error as { code?: number; stdout?: string; stderr?: string };
    return { code: fallo.code ?? -1, stdout: fallo.stdout ?? "", stderr: fallo.stderr ?? "" };
  }
}

describe.skipIf(!hasTestDb)("pnpm seo:auditar con los datos demo", () => {
  beforeAll(async () => {
    await resetTables();
    const seed = await tsx("scripts/seed.ts", []);
    expect(seed.code, seed.stderr).toBe(0);
  }, 120_000);
  afterAll(closeTestDb);

  it("imprime hallazgos; --estricto sale con 1; --json es el mismo informe", async () => {
    const tabla = await tsx("scripts/seo-auditar.ts", []);
    expect(tabla.code).toBe(0);
    expect(tabla.stdout).toMatch(/^tipo\s+slug\s+hallazgo/m);
    expect(tabla.stdout).toContain("sin descripción SEO");

    const estricto = await tsx("scripts/seo-auditar.ts", ["--estricto"]);
    expect(estricto.code).toBe(1);

    const json = await tsx("scripts/seo-auditar.ts", ["--json"]);
    expect(json.code).toBe(0);
    const informe = JSON.parse(json.stdout) as {
      categorias: number;
      productos: number;
      hallazgos: { tipo: string; slug: string; control: string }[];
    };
    expect(informe.categorias).toBeGreaterThan(0);
    expect(informe.productos).toBeGreaterThan(0);
    expect(informe.hallazgos.length).toBeGreaterThan(0);
    expect(informe.hallazgos.some((h) => h.tipo === "categoria")).toBe(true);
    expect(informe.hallazgos.some((h) => h.tipo === "producto")).toBe(true);

    // Sólo lee: la segunda corrida da exactamente lo mismo.
    expect((await tsx("scripts/seo-auditar.ts", ["--json"])).stdout).toBe(json.stdout);
  }, 180_000);
});
