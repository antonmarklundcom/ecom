# Fase O8 — Backups programados, versión del build, logger y reporte de errores. Sesión nueva de OPUS, SÓLO con O7 mergeada. Última fase Opus.

Leé `fable/plan-operacion.md` ENTERO primero (§0, §1, §4, §5.4 y las entradas de O5–O7 en §9),
más `KNOWN-ISSUES.md`. Después `src/lib/cron-auth.ts` (O6), `src/domain/job-runs.ts` (O6),
`src/app/api/cron/resumen-diario/route.ts` (O6), `src/app/api/health/route.ts`, `src/proxy.ts`,
`tests/unit/proxy.test.ts`, `src/lib/cloudinary.ts`, `src/db/index.ts`, `src/db/schema.ts`,
`scripts/backup-db.ts`, `next.config.ts`, `DEPLOY.md`. Ejecutá plan §5.4 bajo el protocolo §4.
Nada fuera del plan.

Owns: `src/domain/backup.ts` (nuevo), `src/app/api/cron/backup/route.ts` (nuevo),
`src/app/api/version/route.ts` (nuevo), `scripts/restore-backup.ts` (nuevo), `src/lib/log.ts`
(nuevo), `src/instrumentation.ts` (nuevo), `src/proxy.ts`, `next.config.ts`, `src/lib/cloudinary.ts`,
`src/domain/preflight.ts`, los `console.*` de `src/app/api/**` y `src/domain/**`, `package.json`
(script `restore`), `.env.example`, `tests/**`, `DEPLOY.md`, `README.md`, `ARCH.md`.

Reglas de la fase:
- Branch `phase/o8` desde `main` actualizado. O7 sin mergear ⇒ pará y decilo.
- Skills: `nextjs-deploy-hostinger` (qué hay y qué no hay en el slot: sin `mysqldump`, poca
  RAM, logs visibles en el hPanel), `fable-cost-guardrail`.
- **Sin schema nuevo** (`job_runs` ya existe). Sin dependencias nuevas de runtime.
- Backup: dump en streaming (nunca la base entera en memoria), lista **explícita** de tablas
  exportada desde `schema.ts` con test de cobertura, Cloudinary `raw` + `authenticated`,
  lock con expiración en `job_runs`, retención, aviso al dueño si falla (patrón post-commit,
  jamás falla la ruta por el aviso). `restore` sólo contra bases con `restore`/`test` en el
  nombre; test round-trip dump → restore.
- `/api/health` **no cambia** (sigue sin versiones ni detalle). `/api/version` con secreto.
- Logger: JSON por línea, `reqId` desde `src/proxy.ts` vía `AsyncLocalStorage`, redacción por
  nombre de campo (`phone`, `token`, `secret`, `password`) con test; test que greppea que no
  queden `console.log` en `src/domain` y `src/app/api`.
- `onRequestError`: sin `ERROR_REPORT_URL` no sale nada de la máquina; con URL, POST con
  timeout, rate limit, y **nunca** datos de compradoras ni secretos. `flags-apagados` verde.
- `proxy.test.ts` extendido (propaga `x-request-id`); `csp.spec.ts` sigue verde.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.4 "Salida O8", ítem por ítem; PR con CI verde completo; entrada de O8
en §9 dentro del PR.

## Después de esta fase — fin de Opus
No spawneás nada. Si esta sesión es la ventana encadenada (`opus-todo.md` / `sonnet-todo.md`), mergeás con CI verde completo y seguís como dice ese prompt; si es una ventana suelta de recuperación (§11), **no mergeás**: dejás el PR abierto y verde. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Decile a Anton explícitamente: con O8 mergeada puede abrir **tres ventanas Sonnet a la vez**
(`sonnet-9-panel-pedidos.md`, `sonnet-10-panel-productos.md`, `sonnet-11-vidriera.md`) o una
por una, en cualquier orden.
