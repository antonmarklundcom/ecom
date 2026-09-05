# Fase O5 — Schema completo + tracking del envío + notas del pedido. Sesión nueva de OPUS. Primera fase del plan.

Leé `fable/plan-operacion.md` ENTERO primero (§0, §1, §2, §4 y §5.1 son los que mandan), más
`KNOWN-ISSUES.md`. Después `CLAUDE.md`, `ARCH.md` §1–§3, `src/db/schema.ts`, `src/db/extras.ts`,
`scripts/post-push.ts`, `src/domain/orders.ts`, `src/domain/order-events.ts`,
`src/domain/admin-activity.ts`, `src/domain/order-customer-notifications.ts` y
`src/app/actions/admin-orders.ts`. Ejecutá plan §5.1 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/db/**`, `drizzle/**`, `scripts/post-push.ts`, `src/domain/orders.ts`,
`src/domain/order-notes.ts` (nuevo), `src/domain/admin-activity.ts`,
`src/domain/order-customer-notifications.ts`, `src/domain/errors.ts`, `src/lib/schemas.ts`,
`src/lib/permissions.ts`, `src/app/actions/admin-orders.ts`, `src/db/queries.ts`, `tests/**`,
`ARCH.md`, `NEW-STORE.md`, y los bloques propios de `es-PY.ts` / `testids.ts` (§4.9).

Reglas de la fase:
- Branch `phase/o5` desde `main` actualizado. Commit cada 30 min.
- Skills: `nodejs-mysql-hostinger-stack` (Drizzle/MySQL), `paraguay-business-apps`,
  `fable-cost-guardrail`.
- **Escribís TODO el schema de §2 ahora**, aunque O6–O8 sean quienes lo usen: una migración
  `0012`, generada con `pnpm db:generate`, con el backfill de `refunds` de §2 escrito a mano y
  testeado. Ninguna fase posterior agrega schema. Columnas nuevas: nullable o con default.
- El tracking se escribe **dentro de la transacción de `transitionOrder`**, sólo con destino
  `enviado`. `no-raw-status-update.test.ts` sigue verde: no hay UPDATE de `orders` fuera de ahí.
- `order_notes` es tabla propia (una nota no es una transición). Guard `requireAdminSession`,
  capability `pedidos.notas` para los tres roles, filas en `admin-guards.test.ts` y
  `atribucion.test.ts` en este mismo PR.
- El feed de actividad suma `nota` al `UNION ALL` con desempate por `id`; test de paginación
  con los tres orígenes.
- Aviso ENVIADO a la compradora: incluye courier/guía/link si existen; sin tracking, texto de hoy.
- Tests de integración corren contra `TEST_DATABASE_URL` (MySQL o MariaDB local; si no hay
  Docker, `apt install mariadb-server` como hicieron O1–S4, ver `fable/plan.md` §9).
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.1 "Salida O5", ítem por ítem; PR abierto con CI verde completo; entrada de O5
en `fable/plan-operacion.md` §9 dentro del PR.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), después el reporte de cierre
(§4.10) en el chat. Anton mergea y abre la ventana siguiente con
`fable/prompts/opus-6-resumen-diario-stock.md` (Opus).
