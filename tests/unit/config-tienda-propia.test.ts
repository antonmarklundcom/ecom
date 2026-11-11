import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * La prueba de `tests/setup/config-del-template.ts`
 * (docs/TEMPLATE-INHERITANCE.md § "Tests y la config de la tienda"): una
 * tienda que no cobra con tarjeta —su `src/config/checkout.ts` sin `tarjeta`,
 * como Norte en el arnés de O23, y `STORE_PAYMENT_METHODS` en su `.env.local`,
 * como Sur— corre los tests del template que miran la política de pago, y
 * pasan.
 *
 * El control: la misma tienda sin el setup los pone en rojo, así se ve que
 * pasan por el setup y no porque no miren la config.
 *
 * Corre una vitest aparte sobre una copia, con los `node_modules` del repo
 * enlazados (junction en Windows).
 */

const REPO = process.cwd();
const VITEST = path.join(REPO, "node_modules", "vitest", "vitest.mjs");
const SETUP = "tests/setup/config-del-template.ts";
const TESTS = [
  "tests/unit/catalogue-inheritance.test.ts",
  "tests/unit/payment-policy.test.ts",
];

let tienda = "";

function correr(): { codigo: number; salida: string } {
  try {
    const salida = execFileSync(
      process.execPath,
      [VITEST, "run", "--project", "unit", "--reporter=verbose", ...TESTS],
      {
        cwd: tienda,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          STORE_PAYMENT_METHODS: "transferencia",
          CI: "",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
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
  tienda = mkdtempSync(path.join(tmpdir(), "tienda-config-propia-"));
  for (const ruta of [
    "src",
    "scripts/template-shared.ts",
    SETUP,
    ...TESTS,
    "vitest.config.mts",
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
  writeFileSync(
    path.join(tienda, "src", "config", "checkout.ts"),
    `import type { PaymentMethod } from "@/db/schema";

/** La de la tienda: sin tarjeta. */
export const CHECKOUT: { paymentMethods: readonly PaymentMethod[] } = {
  paymentMethods: ["transferencia", "contra_entrega"],
};
`
  );
  writeFileSync(
    path.join(tienda, ".env.local"),
    "STORE_PAYMENT_METHODS=transferencia,contra_entrega\n"
  );
}, 120_000);

afterAll(() => {
  if (tienda) rmSync(tienda, { recursive: true, force: true });
});

describe("una tienda con su propia política de pago corre los tests del template", () => {
  it("pasan: la suite usa la política del template, no la de la tienda", () => {
    const { codigo, salida } = correr();
    expect(salida, salida).toMatch(/Test Files\s+2 passed/);
    expect(codigo, salida).toBe(0);
  });

  it("control: sin el setup, los mismos tests la ponen en rojo", () => {
    writeFileSync(path.join(tienda, SETUP), "export {};\n");
    const { codigo, salida } = correr();
    expect(codigo, salida).not.toBe(0);
    expect(salida).toMatch(/FAIL.*catalogue-inheritance.*preserves all template payment defaults/);
  });
});
