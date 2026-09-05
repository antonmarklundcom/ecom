# Ventana Opus — O5 → O6 → O7 → O8 encadenadas. Sesión nueva de OPUS.

Leé `fable/plan-operacion.md` ENTERO (§0, §1, §2, §4, §5, §9, §11) y `KNOWN-ISSUES.md`.
Después `CLAUDE.md` y `ARCH.md`. Skills al arrancar: `fable-cost-guardrail`,
`nodejs-mysql-hostinger-stack`, `paraguay-business-apps`, `nextjs-deploy-hostinger`.

Tu trabajo son las cuatro fases Opus, **en orden y una por vez**, cada una con su PR:

1. O5 — `fable/prompts/opus-5-schema-tracking-notas.md`
2. O6 — `fable/prompts/opus-6-resumen-diario-stock.md`
3. O7 — `fable/prompts/opus-7-plata-catalogo.md`
4. O8 — `fable/prompts/opus-8-backups-observabilidad.md`

Para cada fase: leé su prompt y ejecutalo tal cual (sus "Reglas de la fase" y su "Salida"
mandan), con una diferencia respecto de lo que dice al final: **no parás**. Con el PR abierto
y el CI verde **completo** (`checks` + `e2e`; esperá a que terminen, no mergees con un job
corriendo ni con algo rojo), mergeás vos con squash, hacés `git checkout main && git pull`,
escribís el reporte de cierre de fase (§4.10) en el chat, y pasás a la siguiente.

Antes de arrancar: mirá §9 y los PRs mergeados (`phase/o5`…`phase/o8`). Si una fase ya está
mergeada, saltala. Si una está con el PR abierto de una sesión anterior, retomala desde su
prompt (es re-ejecutable). Si un PR de fase quedó rojo, arreglarlo es tu primer trabajo.

Reglas que no se negocian en toda la ventana:
- Todo el schema de §2 entra en O5, en una migración. O6–O8 no agregan schema (§0.1).
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes en local antes de cada PR
  (integración contra `TEST_DATABASE_URL`; sin Docker, MariaDB por `apt` como en `fable/plan.md` §9).
- Fable nunca: ni subagente, ni sesión hija, ni Routine (§4.8).
- Parar sólo por §4.4; la pregunta va al final del reporte de fase, y **igual seguís con lo que
  no depende de la respuesta**. Si la respuesta bloquea la fase siguiente entera, ahí sí parás y
  lo decís.
- Commit cada 30 minutos. Entrada de §9 dentro de cada PR.

## Al terminar O8 — cierre de la ventana
Auditoría pre-cierre de la última fase (§4.11). Después, reporte de cierre de ventana en el
chat: tabla O5–O8 con PR y fecha de merge; lo que quedó en `KNOWN-ISSUES.md` y §10; pasos
manuales (plantillas de Meta `RESUMEN_DIARIO` y `STOCK_DISPONIBLE`, dos entradas de cron por
tienda, `ERROR_REPORT_URL` opcional, `pnpm template:sync` en cada tienda existente — §12);
y la línea exacta para la ventana siguiente:
`Read fable/prompts/sonnet-todo.md in this repo and execute it.` (Sonnet). No la spawneás vos.
