# Ventana Sonnet — S17 → S18 → S19 encadenadas. Sesión nueva de SONNET, SÓLO con O16 mergeada.

Leé `fable/plan-crecimiento.md` §0, §1, §4, §6, §9 (todas las entradas de O14–O16), §11 y
`KNOWN-ISSUES.md`. Después `CLAUDE.md` (maquinaria vs. piel) y NEW-STORE.md §5 (los `data-testid`).
Skills al arrancar: `fable-cost-guardrail`, `paraguay-business-apps`, `nextjs-deploy-hostinger`.
Si O16 no está mergeada: **pará y decilo**.

Tu trabajo son las tres fases Sonnet, cada una con su PR:

1. S17 — `fable/prompts/sonnet-17-panel-y-vidriera.md`
2. S18 — `fable/prompts/sonnet-18-kit-de-piel.md`
3. S19 — `fable/prompts/sonnet-19-deps-docs-cierre.md` (sólo con S17 y S18 mergeadas)

Para cada fase: leé su prompt y ejecutalo tal cual (sus "Owns", "Límites duros", "Reglas" y "Salida"
mandan), con una diferencia respecto de lo que dice al final: **no parás**. Con el PR abierto y el CI
verde **completo** (esperá a que terminen todos los jobs), mergeás vos con squash, `git checkout main
&& git pull`, reporte de cierre de fase (§4.10) en el chat, y seguís.

S17 y S18 tienen archivos disjuntos: podés hacerlas **en paralelo** como dos subagentes Sonnet (skill
`fable-directs-sonnet-builds`, patrón fan-out), cada uno con su prompt, su branch y su PR, y después
mergear los dos PRs en orden trayendo `main` en cada uno y resolviendo `es-PY.ts`/`testids.ts`
**conservando ambos bloques**. En serie también sirve; elegí lo más seguro y anotalo en §9.

Antes de arrancar: mirá §9 y los PRs (`phase/s17`…`phase/s19`). Fase mergeada ⇒ saltala; PR abierto
de una sesión anterior ⇒ retomalo desde su prompt; PR rojo ⇒ arreglarlo primero.

Reglas que no se negocian en toda la ventana:
- Límites duros §4.7: nada en `src/domain`, `src/lib` (salvo el bloque de `testids.ts`), `src/db`,
  `src/app/actions`, `src/app/api`, `src/proxy.ts`, `drizzle/`. Si el dominio no expone algo:
  workaround visible + entrada en `KNOWN-ISSUES.md`. Nunca "un cambio chiquito" ahí. Las excepciones
  de S18 (`scripts/nueva-tienda.ts`) y S19 (manifiesto, configs, cambios mecánicos) están en §4.7.
- Ningún `data-testid` existente se borra. Todo texto por `t()`.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes en local antes de cada PR (§4.13).
- Fable nunca: ni subagente, ni sesión hija, ni Routine (§4.8).
- Parar sólo por §4.4; commit cada 30 minutos; entrada de §9 dentro de cada PR.

## Al terminar S19 — cierre de la ventana y del plan
Lo que pide el final de `sonnet-19-deps-docs-cierre.md`: tabla de las seis fases (O14–S19) con PR y
fecha; `KNOWN-ISSUES.md` y §10 en una línea cada uno; pasos manuales numerados para Anton (§7); y
que `fable/plan-crecimiento.md` pasa a historial. No hay ventana siguiente.
