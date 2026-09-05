# Fase S13 — Ciclo de vida del template, docs y reporte final. Sesión nueva de SONNET, SÓLO con S12 mergeada. Última fase.

Leé `fable/plan-operacion.md` ENTERO (con todas las entradas de §9) y `KNOWN-ISSUES.md`.
Después `README.md`, `NEW-STORE.md`, `ARCH.md`, `DEPLOY.md`, `CLAUDE.md`, `.env.example`,
`scripts/template-diff.ts`, `scripts/template-shared.ts`, `tests/unit/template-diff.test.ts`,
`.github/workflows/pnpm-al-dia.yml` (el workflow programado que ya existe, como modelo).
Ejecutá plan §6.5 bajo el protocolo §4. Nada fuera del plan.

Owns: `.github/workflows/template-al-dia.yml` (nuevo), `scripts/template-diff.ts`,
`tests/unit/template-diff.test.ts`, `README.md`, `NEW-STORE.md`, `ARCH.md`, `DEPLOY.md`,
`CLAUDE.md`, `PLAN.md`, `KNOWN-ISSUES.md`, `.env.example` (consistencia; **sin** variables
nuevas), `fable/plan-operacion.md`.

**Límites duros (§4.7):** no tocás `src/**` ni `drizzle/`. Si al documentar encontrás un bug
de código, va a `KNOWN-ISSUES.md` con el arreglo propuesto, no al PR.

Reglas de la fase:
- Branch `phase/s13` desde `main` actualizado.
- Skills: `nextjs-deploy-hostinger` (las entradas de cron del hPanel, horas UTC),
  `fable-cost-guardrail`.
- `distribuir.yml` corre **sólo** por `workflow_dispatch` con el input de tiendas (nunca en
  push: Anton aprueba a mano a quién le llega cada actualización); `reporte-tiendas.yml` es
  semanal y de sólo lectura. Con `tiendas.json` vacío los dos se saltan y lo dicen en el log;
  probalos así antes de abrir el PR. Ninguno usa Claude ni ninguna API de IA.
- Docs: cada ruta, comando y variable que nombres tiene que existir (`grep` de cada uno
  antes de cerrar). Las tres entradas de cron en **una** tabla en DEPLOY.md con hora Asunción
  y UTC.
- `KNOWN-ISSUES.md`: borrá lo resuelto, promové lo abierto de §9.
- `pnpm typecheck && pnpm lint && pnpm test` antes del PR.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §6.5 "Salida S13", ítem por ítem; PR con CI verde completo; entrada de
S13 en §9.

## Después de esta fase — STOP, reporte final a Anton
No spawneás nada. Si esta sesión es la ventana encadenada (`opus-todo.md` / `sonnet-todo.md`), mergeás con CI verde completo y seguís como dice ese prompt; si es una ventana suelta de recuperación (§11), **no mergeás**: dejás el PR abierto y verde. Auditoría pre-cierre (§4.11). Después, en el chat, en este
orden: (1) tabla de las nueve fases con PR y fecha de merge; (2) lo que quedó en
`KNOWN-ISSUES.md` y en §10, una línea cada uno; (3) **pasos manuales numerados** que sólo Anton
puede hacer: plantillas de Meta a pedir (`RESUMEN_DIARIO`, `STOCK_DISPONIBLE`), las dos
entradas de cron nuevas en el hPanel de cada tienda, `ERROR_REPORT_URL` opcional, `pnpm
template:sync` en cada tienda hija (la migración `0012` viaja ahí), verificar el plan de
Cloudinary para los backups; (4) recordatorio de que `fable/plan-operacion.md` queda como
historial y la próxima revisión arranca desde `fable/PROMPT.md`. No hay fase siguiente.
