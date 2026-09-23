# Fase O16 — Editar un pedido antes del pago. Sesión nueva de OPUS, SÓLO con O15 mergeada. Última fase Opus.

Leé `fable/plan-crecimiento.md` §0, §1 (sobre todo 1.3), §2, §4, §5.3, §9 y `KNOWN-ISSUES.md`.
Después ARCH.md §1, §3, §4 y §"Métodos de envío"; `src/domain/create-order.ts`, `stock.ts`,
`shipping.ts`, `coupons.ts`, `payment-recovery.ts` (el evento con `from = to`) y
`reconciliation.ts` (el `CASE` de `arista_imposible`).
Skills: `fable-cost-guardrail`, `paraguay-business-apps`, `nodejs-mysql-hostinger-stack`.
Ejecutá plan §5.3 bajo el protocolo §4. Nada fuera del plan. Si O15 no está mergeada: **pará y decilo**.

Owns: `src/domain/edit-order.ts` (nuevo), `src/domain/errors.ts`, `src/domain/create-order.ts` (sólo
extraer las funciones puras de totales), `src/domain/reconciliation.ts`, `src/domain/admin-orders.ts`,
`src/app/actions/admin-orders.ts`, `src/lib/permissions.ts`, `src/lib/schemas.ts`, `tests/**`,
ARCH.md, README.md (una línea).

Reglas de la fase:
- Branch `phase/o16` desde `main` actualizado. Commit cada 30 min.
- Sin schema nuevo. Todo en **una** transacción con `SELECT … FOR UPDATE` del pedido.
- Sólo `pendiente_pago`, sólo transferencia y contra entrega, sin pago `paid`. Tarjeta se rechaza
  con error de dominio propio (§1.3): la razón está escrita, no la reabras.
- Cantidades sólo **bajan o quitan**; nunca suben ni se agregan líneas. `unit_price_pyg` no cambia.
  El pedido no queda sin líneas. Reservas bajan con la línea.
- Envío re-cotizado por el dominio (nunca por el navegador); cupón re-validado: si no aplica, se
  quita y se informa (`couponRemoved`), usos no se devuelven.
- Auditoría: `order_events` con `from = to` y prefijo constante; `reconcile` gana la excepción y la
  invariante de totales. `no-raw-status-update` sigue verde: esto no escribe `status`.
- Guard `requireStaffSession`, capability `pedidos.editar`, filas en `admin-guards` y `atribucion`.
- Las diez pruebas de integración de §5.3 D son el criterio de salida, no una sugerencia.
- Local sin Docker: §4.13. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes antes del PR.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §5.3 "Salida O16", ítem por ítem; PR con CI verde completo; entrada de O16 en §9.

## Después de esta fase
Auditoría pre-cierre (§4.11), reporte de cierre (§4.10). No hay más fases Opus. Ventana encadenada:
mergeá con CI verde completo y cerrá la ventana como dice `opus-todo-crecimiento.md`. Ventana suelta:
no mergees, dejá el PR verde y decí que la ventana siguiente es Sonnet (`sonnet-todo-crecimiento.md`).
