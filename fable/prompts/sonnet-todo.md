# Ventana Sonnet — S9 → S10 → S11 → S12 → S13 encadenadas. Sesión nueva de SONNET, SÓLO con O8 mergeada.

Leé `fable/plan-operacion.md` §0, §1, §4, §6, §9 (todas las entradas de O5–O8), §11, §12 y
`KNOWN-ISSUES.md`. Después `CLAUDE.md` (maquinaria vs. piel) y NEW-STORE.md §5 (los
`data-testid`). Skills al arrancar: `fable-cost-guardrail`, `paraguay-business-apps`,
`nextjs-deploy-hostinger`. Si O8 no está mergeada: **pará y decilo**.

Tu trabajo son las cinco fases Sonnet, cada una con su PR:

1. S9 — `fable/prompts/sonnet-9-panel-pedidos.md`
2. S10 — `fable/prompts/sonnet-10-panel-productos.md`
3. S11 — `fable/prompts/sonnet-11-vidriera.md`
4. S12 — `fable/prompts/sonnet-12-ci-calidad.md` (sólo con S9–S11 mergeadas)
5. S13 — `fable/prompts/sonnet-13-template-docs.md` (sólo con S12 mergeada)

Para cada fase: leé su prompt y ejecutalo tal cual (sus "Owns", "Límites duros", "Reglas" y
"Salida" mandan), con una diferencia respecto de lo que dice al final: **no parás**. Con el
PR abierto y el CI verde **completo** (esperá a que terminen todos los jobs), mergeás vos con
squash, `git checkout main && git pull`, reporte de cierre de fase (§4.10) en el chat, y
seguís.

S9, S10 y S11 tienen archivos disjuntos: podés hacerlas **en paralelo** como tres subagentes
Sonnet (skill `fable-directs-sonnet-builds`, patrón fan-out), cada uno con su prompt, su
branch y su PR, y después mergear los tres PRs en orden trayendo `main` en cada uno y
resolviendo `es-PY.ts`/`testids.ts` **conservando ambos bloques**. En serie también sirve;
elegí lo que te resulte más seguro y anotalo en §9.

Antes de arrancar: mirá §9 y los PRs (`phase/s9`…`phase/s13`). Fase mergeada ⇒ saltala; PR
abierto de una sesión anterior ⇒ retomalo desde su prompt; PR rojo ⇒ arreglarlo primero.

Reglas que no se negocian en toda la ventana:
- Límites duros §4.7: nada en `src/domain`, `src/lib` (salvo el bloque de `testids.ts`),
  `src/db`, `src/app/actions`, `src/app/api`, `src/proxy.ts`, `drizzle/`. Si el dominio no
  expone algo: workaround visible + nota en §10. Nunca "un cambio chiquito" ahí.
- Ningún `data-testid` existente se borra. Todo texto por `t()`.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes en local antes de cada PR.
- Fable nunca: ni subagente, ni sesión hija, ni Routine (§4.8).
- Parar sólo por §4.4; commit cada 30 minutos; entrada de §9 dentro de cada PR.

## Al terminar S13 — cierre de la ventana y del plan
Lo que pide el final de `sonnet-13-template-docs.md`: tabla de las nueve fases (O5–S13) con
PR y fecha; `KNOWN-ISSUES.md` y §10 en una línea cada uno; pasos manuales numerados para
Anton (plantillas de Meta, crons por tienda, `ERROR_REPORT_URL`, `TIENDAS_TOKEN` +
`tiendas.json` para `distribuir.yml`, y cómo llevar S9–S11 a cada tienda según §12); y
que `fable/plan-operacion.md` pasa a historial. No hay ventana siguiente.
