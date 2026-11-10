import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `.lighthouserc.json` — lo que mide el job de Lighthouse (ARCH.md §6).
 *
 * La meta es la de TASKS.md: performance ≥ 0.9 **en celular**, que es como
 * compra Paraguay. Es una advertencia y no un error a propósito: el puntaje
 * varía con la carga del runner compartido, y lo que bloquea de verdad es el
 * presupuesto de JS (`tests/e2e/presupuesto.spec.ts`), medido en bytes.
 */
const config = JSON.parse(readFileSync(".lighthouserc.json", "utf8")) as {
  ci: {
    collect: { settings: Record<string, unknown> };
    assert: { assertions: Record<string, [string, { minScore: number }]> };
  };
};

describe(".lighthouserc.json", () => {
  it("mide en celular, con throttling simulado", () => {
    const { settings } = config.ci.collect;
    expect(settings.formFactor).toBe("mobile");
    expect(settings.throttlingMethod).toBe("simulate");
    expect((settings.screenEmulation as { mobile: boolean }).mobile).toBe(true);
    // `preset: "desktop"` pisaría todo lo de arriba.
    expect(settings.preset).not.toBe("desktop");
  });

  it("reporta performance, accesibilidad, buenas prácticas y SEO", () => {
    expect(config.ci.collect.settings.onlyCategories).toEqual(
      expect.arrayContaining(["performance", "accessibility", "best-practices", "seo"])
    );
  });

  it("performance ≥ 0.9 como advertencia, nunca como error", () => {
    const assertions = config.ci.assert.assertions;
    expect(assertions["categories:performance"]).toEqual(["warn", { minScore: 0.9 }]);
    for (const [nombre, [nivel]] of Object.entries(assertions)) {
      expect(nivel, nombre).toBe("warn");
    }
  });
});
