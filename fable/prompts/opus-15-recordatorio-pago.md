# Fase O15 — Recordatorio de pago antes del vencimiento. Sesión nueva de OPUS, SÓLO con O14 mergeada.

Leé `fable/plan-crecimiento.md` §0, §1, §2, §4, §5.2, §9 (entrada de O14) y `KNOWN-ISSUES.md`.
Después `src/domain/order-customer-notifications.ts`, `src/domain/maintenance.ts`,
`src/domain/stock-alerts.ts` (el patrón "marcar antes de mandar") y `.env.example`.
Skills: `fable-cost-guardrail`, `paraguay-business-apps`, `nextjs-deploy-hostinger`.
Ejecutá plan §5.2 bajo el protocolo §4. Nada fuera del plan. Si O14 no está mergeada: **pará y decilo**.

Owns: `src/domain/payment-reminders.ts` (nuevo), `src/domain/order-customer-notifications.ts`,
`src/domain/maintenance.ts`, `src/domain/preflight.ts`, `src/app/api/cron/vencer-pedidos/route.ts`,
`.env.example`, `tests/**`, ARCH.md §5, NEW-STORE.md §4c, DEPLOY.md (nota en el cron existente).

Reglas de la fase:
- Branch `phase/o15` desde `main` actualizado. Commit cada 30 min.
- **Sin schema nuevo**: `orders.payment_reminder_sent_at` ya existe (O14). Si creés que falta algo, §4.4.
- Un recordatorio por pedido: `UPDATE … WHERE payment_reminder_sent_at IS NULL`, y sólo con
  `affectedRows = 1` se manda. El fallo del envío no desmarca (§0.4).
- Ventana: `reserved_until` entre `now` y `now + 6 h`, estado `pendiente_pago`, después de vencer
  pedidos en la misma corrida de `runMaintenance`. Sin entrada nueva de cron.
- Plantilla `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RECORDATORIO`: vacía = apagado, sin consulta a la base;
  `flags-apagados.test.ts` verde. Preflight: advertencia, no bloqueo.
- Texto del aviso sin datos de otras personas: número de pedido, total, hora límite (Asunción), link con token.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes antes del PR.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §5.2 "Salida O15", ítem por ítem; PR con CI verde completo; entrada de O15 en §9.

## Después de esta fase
Auditoría pre-cierre (§4.11), reporte de cierre (§4.10). Ventana encadenada: mergeá con CI verde
completo y seguí con `fable/prompts/opus-16-editar-pedido.md`. Ventana suelta (§11): no mergees,
dejá el PR verde y decí que la siguiente es O16 (Opus).
