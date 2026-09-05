# Fase S12 — CI y calidad: presupuesto de bundle, Lighthouse, capturas, render tests. Sesión nueva de SONNET, SÓLO con S9, S10 y S11 mergeadas.

Leé `fable/plan-operacion.md` §0, §1, §4, §6.4 y las entradas de S9–S11 en §9, más
`KNOWN-ISSUES.md` y `fable/plan.md` §6.1 (cómo se armó el job `e2e`). Después
`.github/workflows/ci.yml`, `playwright.config.ts`, `tests/e2e/**`, `vitest.config.mts`,
`vitest.setup.ts`, `src/components/__tests__/home-hero.test.tsx` (el único render test que hay),
`ARCH.md` §6 (el presupuesto de 120 KB), `src/db/schema.ts` y `src/domain/backup.ts` (para el
test de cobertura del dump, si O8 no lo dejó). Ejecutá plan §6.4 bajo el protocolo §4. Nada
fuera del plan.

Owns: `.github/workflows/**`, `playwright.config.ts`, `tests/**`, `scripts/**`,
`src/components/__tests__/**`, `vitest.config.mts`, `vitest.setup.ts`, `.gitignore`,
`README.md` (fila de comandos), entrada en §9.

**Límites duros (§4.7):** no tocás `src/**` fuera de `src/components/__tests__/`. Si el
presupuesto falla porque un chunk es demasiado grande, **no** lo arreglás vos: fijás el
presupuesto en el valor medido + 10 %, anotás el chunk culpable en `KNOWN-ISSUES.md` y en §9,
y seguís. Bajar el bundle es trabajo de otra fase.

Reglas de la fase:
- Branch `phase/s12` desde `main` actualizado. Commit cada 30 min.
- Skills: `fable-cost-guardrail`.
- Presupuesto: medí primero, escribí los tres valores medidos en §9, después fijá el techo.
  El spec falla listando los 5 chunks más grandes. Es el único número que bloquea.
- Lighthouse: `continue-on-error: true`, artifact con el reporte, comentario en el workflow
  explicando por qué advierte y no bloquea.
- Capturas: siempre al artifact, nunca a git (`.gitignore`). El reporte completo de Playwright
  sigue subiéndose sólo en fallo.
- Render tests con RTL + `vi.mock` de las server actions; nada de red ni base.
- Un solo Lighthouse en toda la fase (§4.12).
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR; y el CI del PR
  tiene que mostrar los tres jobs (`checks`, `e2e`, `lighthouse`).
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.4 "Salida S12", ítem por ítem; PR abierto con CI verde completo; entrada de
S12 en §9 con los valores medidos.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea y abre la última ventana con `fable/prompts/sonnet-13-template-docs.md` (Sonnet).
