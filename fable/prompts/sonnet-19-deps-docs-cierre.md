# Fase S19 — Dependencias, DX, docs y reporte final. Sesión nueva de SONNET, SÓLO con S17 y S18 mergeadas. Última fase.

Leé `fable/plan-crecimiento.md` ENTERO (con todas las entradas de §9) y `KNOWN-ISSUES.md`. Después
`package.json`, `.husky/pre-commit`, `eslint.config.mjs`, `vitest.config.mts`, `tsconfig.json`,
`src/lib/session.ts` y el de sesión de cliente, README.md, NEW-STORE.md, ARCH.md, DEPLOY.md, CLAUDE.md.
Skills: `fable-cost-guardrail`, `nextjs-deploy-hostinger`, `claude-api` no hace falta.
Ejecutá plan §6.3 bajo el protocolo §4. Si S17 o S18 no están mergeadas: **pará y decilo**.

Owns: la lista de §6.3 "Owns" (manifiesto, lockfile, configs, `.husky/`, docs, `fable/plan-crecimiento.md`),
más la excepción de §4.7: un cambio mínimo y mecánico en cualquier archivo **sólo si** una versión
nueva lo exige para compilar, anotado en §9.

**Límites duros:** este PR no cambia comportamiento. No se "adapta" un test para que pase sin
entender qué cambió en la dependencia. Nada de features.

Reglas de la fase:
- Branch `phase/s19` desde `main` actualizado. **Un commit por dependencia mayor**, suite entera
  (`typecheck`, `lint`, `test`, `build`, `test:e2e`) verde entre medio.
- Orden: menores → sacar `lint-staged` (§1.6) → `iron-session` 9 → `vitest` 5 → `eslint` 10 (sólo si
  `eslint-config-next` lo acepta como peer) → `typescript` 7 con tope de 30 min (§1.5).
- Lo que no queda verde en 30 minutos se revierte (ese commit desaparece) y va a §10 con el error exacto.
- `pnpm audit` al final: cero high. Anotá el resultado en §9.
- Docs: cada ruta, comando, variable y archivo nombrado existe (`grep`). README con
  `fable/plan-crecimiento.md` como historial y `fable/REVIEW.md` vigente; CLAUDE.md y PLAN.md al día;
  `KNOWN-ISSUES.md` sin lo resuelto y con lo abierto de §9.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §6.3 "Salida S19", ítem por ítem; PR con CI verde completo; entrada de S19 en §9.

## Después de esta fase — STOP, reporte final a Anton
No spawneás nada. Ventana encadenada: mergeá con CI verde completo; ventana suelta: dejá el PR verde.
Auditoría pre-cierre (§4.11). Después, en el chat: (1) tabla de las seis fases O14–S19 con PR y fecha
de merge; (2) `KNOWN-ISSUES.md` y §10 en una línea cada uno; (3) pasos manuales numerados de §7
(plantilla `CLIENTE_RECORDATORIO` en Meta, `pnpm template:sync` en cada tienda hija, tema opcional);
(4) que `fable/plan-crecimiento.md` queda como historial y la próxima revisión arranca desde
`fable/PROMPT.md`. No hay fase siguiente.
