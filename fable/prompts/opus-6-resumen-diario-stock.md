# Fase O6 — Resumen diario, punto de reposición, "avisame cuando haya stock". Sesión nueva de OPUS, SÓLO con O5 mergeada.

Leé `fable/plan-operacion.md` ENTERO primero (§0, §1, §4, §5.2 y la entrada de O5 en §9), más
`KNOWN-ISSUES.md`. Después `src/domain/messaging/*`, `src/domain/order-notifications.ts` (el
patrón de aviso post-commit), `src/domain/notify-timing.ts`, `src/app/api/cron/vencer-pedidos/route.ts`,
`src/domain/maintenance.ts`, `src/domain/admin-products.ts` (`adjustStock`, `lowStockVariants`),
`src/domain/admin-dashboard.ts`, `src/domain/login-tokens.ts` (el patrón `UPDATE … WHERE … IS NULL`
+ lectura de confirmación), `src/lib/rate-limit.ts`, `src/lib/py.ts`, `src/domain/preflight.ts`.
Ejecutá plan §5.2 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/lib/cron-auth.ts` (nuevo), `src/app/api/cron/**`, `src/domain/job-runs.ts` (nuevo),
`src/domain/daily-digest.ts` (nuevo), `src/domain/stock-alerts.ts` (nuevo),
`src/app/actions/stock-alerts.ts` (nuevo), `src/domain/admin-products.ts`,
`src/domain/admin-dashboard.ts`, `src/domain/maintenance.ts`, `src/domain/catalog-import.ts`,
`src/domain/preflight.ts`, `src/lib/schemas.ts`, `src/app/actions/admin-products.ts`,
`.env.example`, `tests/**`, `DEPLOY.md`, `NEW-STORE.md`, `ARCH.md`, bloques propios de
`es-PY.ts`/`testids.ts`.

Reglas de la fase:
- Branch `phase/o6` desde `main` actualizado. O5 sin mergear ⇒ pará y decilo.
- Skills: `paraguay-business-apps` (tono, formato de Gs), `nodejs-mysql-hostinger-stack`,
  `fable-cost-guardrail`.
- **Sin schema nuevo**: `job_runs`, `stock_alerts` y `variants.reorder_point` ya existen (O5).
  Si falta algo, es §4.4.
- El resumen se manda **una vez por día de Asunción** aunque el cron pegue tres veces:
  `claimJob` decide en una transacción con la fila bloqueada. Test de concurrencia obligatorio.
- Todo aviso: después del commit, sin `await` que demore, con timeout, jamás falla la
  operación. Sender que tira ⇒ la ruta responde 200 con `sent:false` y queda `last_error`.
- Sin plantilla / sin `WHATSAPP_NUMBER` ⇒ apagado; `flags-apagados.test.ts` verde. En dev, consola.
- "Avisame": el navegador manda variante + teléfono y nada más; se rechaza si hay stock;
  rate limit por IP y por teléfono; respuesta genérica; marcar `notified_at` **antes** de
  mandar; disparo sólo cuando la disponibilidad pasa de 0 a > 0.
- `cron-auth.ts` no cambia el comportamiento de `vencer-pedidos`: su test sigue verde sin tocarlo.
- Guards + `admin-guards.test.ts` + `atribucion.test.ts` para toda acción nueva.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.2 "Salida O6", ítem por ítem; PR abierto con CI verde completo; entrada de O6
en §9 dentro del PR.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea y abre la ventana siguiente con `fable/prompts/opus-7-plata-catalogo.md` (Opus).
