import { gzipSync } from "node:zlib";

import type { Page, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { TESTIDS } from "./testids";

/**
 * Presupuesto de JS por página (plan-operacion §6.4, ARCH.md §6). Es el
 * único número de esta fase que **bloquea** el PR — Lighthouse (más abajo,
 * en `ci.yml`) sólo advierte.
 *
 * Los techos de acá salen de medir de verdad contra un `next build` +
 * `next start` (no de una cifra aspiracional) y sumarle 10%: son un piso de
 * alarma para no crecer sin darse cuenta, no un objetivo de optimización. Si
 * algún día el número real crece más allá del techo, **no se achica el
 * código desde este spec** — se sube el techo al valor medido + 10%, se
 * anota el chunk culpable en `KNOWN-ISSUES.md` y en plan-operacion §9, y esa
 * es una fase aparte (regla dura de S12).
 *
 * Valores medidos el 2026-09-06 contra un build local (Next 16.3.4,
 * Turbopack), con MySQL 8 y el seed de `pnpm db:seed`, ver plan-operacion §9
 * para el detalle y el chunk más pesado (una fuga de `drizzle-orm` al
 * cliente vía `@/db/schema`, documentada y no arreglada acá).
 */
const BUDGET_KB = {
  home: 245,
  producto: 260,
  checkout: 255,
} as const;

type ScriptSample = { url: string; sizeBytes: number };

// Mismo origen que `playwright.config.ts` (`use.baseURL`) — hardcodeado acá
// porque comparar contra `page.url()` en el handler de `response` es
// inestable: durante la navegación, `page.url()` todavía puede apuntar a la
// página anterior cuando llega la primera respuesta de la nueva.
const SAME_ORIGIN = "http://127.0.0.1:3000";

/**
 * Bytes realmente transferidos por cada `<script>` del mismo origen que la
 * página cargó — nunca los del fallback `nomodule` (un Chromium evergreen,
 * el único navegador de este job, jamás lo pide).
 *
 * `request.sizes()` lee lo que el protocolo de red reportó como
 * `responseBodySize` (comprimido, si el server comprimió) — es más preciso
 * que el header `Content-Length`, que `next start` no manda en las
 * respuestas de chunk (van con `Transfer-Encoding: chunked`). Si por lo que
 * sea `sizes()` no devuelve nada útil, se cae al gzip manual del cuerpo
 * decodificado, tal como pide plan-operacion §6.4.
 */
async function collectScriptResponses(page: Page, path: string): Promise<ScriptSample[]> {
  const samples: ScriptSample[] = [];
  const pending: Promise<void>[] = [];

  const onResponse = (response: Response): void => {
    const url = response.url();
    if (!url.startsWith(SAME_ORIGIN)) return;
    if (response.request().resourceType() !== "script") return;

    pending.push(
      (async () => {
        let size = 0;
        try {
          const sizes = await response.request().sizes();
          size = sizes.responseBodySize;
        } catch {
          // el request pudo cortarse (navegación) antes de resolver — se
          // intenta el fallback de abajo.
        }
        if (!size) {
          try {
            const body = await response.body();
            const contentEncoding = response.headers()["content-encoding"];
            size = contentEncoding?.includes("gzip") ? body.length : gzipSync(body).length;
          } catch {
            // respuesta ya descartada por el navegador — no se puede medir,
            // no se cuenta (mejor subestimar que reventar el spec por un
            // recurso que ni siquiera importa al presupuesto).
          }
        }
        samples.push({ url, sizeBytes: size });
      })()
    );
  };

  page.on("response", onResponse);
  await page.goto(path, { waitUntil: "networkidle" });
  await Promise.all(pending);
  page.off("response", onResponse);

  return samples;
}

function assertBudget(samples: ScriptSample[], label: string, limitKb: number): void {
  const totalBytes = samples.reduce((acc, s) => acc + s.sizeBytes, 0);
  const totalKb = totalBytes / 1024;

  if (totalKb > limitKb) {
    const top5 = [...samples]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 5)
      .map((s) => `  ${(s.sizeBytes / 1024).toFixed(1)} KB  ${s.url.replace(SAME_ORIGIN, "")}`)
      .join("\n");
    throw new Error(
      `Presupuesto de JS excedido en "${label}": ${totalKb.toFixed(1)} KB > ${limitKb} KB.\n` +
        `Los 5 chunks más grandes:\n${top5}`
    );
  }

  expect(totalKb).toBeLessThanOrEqual(limitKb);
}

test.describe("presupuesto de JS por página", () => {
  test("home", async ({ page }) => {
    const samples = await collectScriptResponses(page, "/");
    assertBudget(samples, "home", BUDGET_KB.home);
  });

  test("producto", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId(TESTIDS.headerCategoryLink).first().click();
    await expect(page).toHaveURL(/\/categoria\//);

    const productHref = await page.getByTestId(TESTIDS.productCard).first().getAttribute("href");
    if (!productHref) throw new Error("El seed no tiene ningún producto — corré `pnpm db:seed`.");

    const samples = await collectScriptResponses(page, productHref);
    assertBudget(samples, "producto", BUDGET_KB.producto);
  });

  test("checkout", async ({ page }) => {
    const samples = await collectScriptResponses(page, "/checkout");
    assertBudget(samples, "checkout", BUDGET_KB.checkout);
  });
});
