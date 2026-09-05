# Fase S9 — Panel de pedidos: tracking, notas, remito imprimible; la página del pedido. Sesión nueva de SONNET, SÓLO con O8 mergeada. Puede correr en paralelo con S10 y S11.

Leé `fable/plan-operacion.md` §0, §1, §4, §6.1 y las entradas de O5 y O8 en §9, más
`KNOWN-ISSUES.md`. Después `CLAUDE.md` (maquinaria vs. piel), `NEW-STORE.md` §5 (los
`data-testid`), `src/lib/testids.ts`, `src/lib/permissions.ts`, `src/app/admin/(panel)/pedidos/[id]/page.tsx`,
`src/components/admin/order-actions.tsx`, `src/app/actions/admin-orders.ts` (firmas de
`advanceOrder` y `addOrderNote` — sólo leer), `src/domain/order-notes.ts` (sólo leer),
`src/app/pedido/[orderNumber]/page.tsx`, `tests/e2e/panel.spec.ts`, `tests/e2e/helpers.ts`.
Ejecutá plan §6.1 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/app/admin/(panel)/pedidos/**`, `src/components/admin/order-*.tsx`,
`src/components/admin/order-notes.tsx` (nuevo), `src/components/admin/print-*.tsx` (nuevo),
`src/app/pedido/[orderNumber]/**`, `tests/e2e/panel.spec.ts`, `tests/e2e/helpers.ts` (sólo agregar),
bloque `/* == S9 == */` al final de `src/app/globals.css`, bloques `// == S9 ==` al final de
`src/i18n/es-PY.ts` y `src/lib/testids.ts`.

**Límites duros (§4.7):** no tocás `src/domain/**`, `src/lib/**` (salvo el bloque de
`testids.ts`), `src/db/**`, `src/app/actions/**`, `src/app/api/**`, `src/proxy.ts`, `drizzle/`.
Si el dominio no expone algo que necesitás: workaround visible + nota en §10, no cambio.

Reglas de la fase:
- Branch `phase/s9` desde `main` actualizado. Commit cada 30 min.
- Skills: `paraguay-business-apps` (fechas `dd/mm/yyyy`, tono voseo), `fable-cost-guardrail`.
- Los campos de tracking aparecen **sólo** cuando la transición elegida es `enviado`.
- Dibujás sólo lo que `can(role, …)` permite: precios en el remito sólo con `precios`.
- Remito: ruta bajo `/admin` (con nonce), CSS de impresión en `globals.css` bajo `@media print`,
  nada inline (CSP). Verificá en el navegador que imprime en A4 sin nav.
- Todo texto nuevo por `t()`; ids nuevos en `testids.ts`; los specs usan testids, nunca texto.
- Al traer `main` antes del PR, si `es-PY.ts`/`testids.ts` conflictúan con S10/S11:
  conservá los dos bloques, nunca reordenes.
- Tope de pulido §4.12: una pasada de capturas para describir el PR, no se commitean.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.1 "Salida S9", ítem por ítem; PR abierto con CI verde completo; entrada de S9
en §9 dentro del PR.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea. S12 arranca recién cuando S9, S10 y S11 estén las tres mergeadas.
