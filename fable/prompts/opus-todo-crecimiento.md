# Ventana Opus — O14 → O15 → O16 encadenadas. Sesión nueva de OPUS.

Leé `fable/plan-crecimiento.md` ENTERO (§0, §1, §2, §4, §5, §9, §11) y `KNOWN-ISSUES.md`. Después
`CLAUDE.md` y `ARCH.md`. Skills al arrancar: `fable-cost-guardrail`, `nodejs-mysql-hostinger-stack`,
`paraguay-business-apps`, `nextjs-deploy-hostinger`.

Tu trabajo son las tres fases Opus, **en orden y una por vez**, cada una con su PR:

1. O14 — `fable/prompts/opus-14-deuda-dominio.md`
2. O15 — `fable/prompts/opus-15-recordatorio-pago.md`
3. O16 — `fable/prompts/opus-16-editar-pedido.md`

Para cada fase: leé su prompt y ejecutalo tal cual (sus "Owns", "Reglas de la fase" y "Salida"
mandan), con una diferencia respecto de lo que dice al final: **no parás**. Con el PR abierto y el CI
verde **completo** (`checks` + `e2e`; esperá a que terminen, no mergees con un job corriendo ni con
algo rojo), mergeás vos con squash, hacés `git checkout main && git pull`, escribís el reporte de
cierre de fase (§4.10) en el chat, y pasás a la siguiente.

Antes de arrancar: mirá §9 y los PRs (`phase/o14`…`phase/o16`). Fase mergeada ⇒ saltala; PR abierto
de una sesión anterior ⇒ retomalo desde su prompt (es re-ejecutable); PR rojo ⇒ arreglarlo primero.

Reglas que no se negocian en toda la ventana:
- Todo el schema de §2 entra en O14, en la migración `0013`. O15 y O16 no agregan schema (§0.1).
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes en local antes de cada PR
  (integración contra `TEST_DATABASE_URL`; sin Docker, MariaDB por `apt` — §4.13).
- Fable nunca: ni subagente, ni sesión hija, ni Routine (§4.8).
- Parar sólo por §4.4; la pregunta va al final del reporte de fase, y **igual seguís con lo que no
  depende de la respuesta**. Si la respuesta bloquea la fase siguiente entera, ahí sí parás y lo decís.
- Commit cada 30 minutos. Entrada de §9 dentro de cada PR.

## Al terminar O16 — cierre de la ventana
Auditoría pre-cierre de la última fase (§4.11). Después, reporte de cierre de ventana en el chat:
tabla O14–O16 con PR y fecha de merge; lo que quedó en `KNOWN-ISSUES.md` y §10; pasos manuales
(plantilla de Meta `CLIENTE_RECORDATORIO`, `pnpm template:sync` en cada tienda hija — §7); y la línea
exacta para la ventana siguiente:
`Read fable/prompts/sonnet-todo-crecimiento.md in this repo and execute it.` (Sonnet). No la spawneás vos.
