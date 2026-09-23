# Fase O14 — Deuda de dominio + schema del plan. Sesión nueva de OPUS. Primera fase.

Leé `fable/plan-crecimiento.md` §0, §1, §2, §4, §5.1, §9 y `KNOWN-ISSUES.md` ENTERO (las seis
entradas que esta fase cobra traen el arreglo escrito). Después `CLAUDE.md` y ARCH.md §1–§2.
Skills al arrancar: `fable-cost-guardrail`, `nodejs-mysql-hostinger-stack`, `paraguay-business-apps`.
Ejecutá plan §5.1 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/db/schema.ts`, `src/db/enums.ts` (nuevo), `drizzle/**`, `src/lib/spreadsheet.ts`,
`src/domain/admin-products.ts`, `src/domain/admin-categories.ts`, `src/domain/payment-recovery.ts`,
`src/app/actions/admin-products.ts`, `src/app/actions/admin-categories.ts`, `src/lib/permissions.ts`,
los cuatro componentes cliente que importan valores de `@/db/schema` (sólo la línea de import),
`tests/**`, NEW-STORE.md (§ migraciones), `KNOWN-ISSUES.md`.

Reglas de la fase:
- Branch `phase/o14` desde `main` actualizado. Commit cada 30 min.
- **Todo el schema del plan (§2: una columna) entra acá, en la migración `0013`.** O15 y O16 no
  agregan schema.
- Cada entrada de `KNOWN-ISSUES.md` que resolvés: test que la fija + borrar la entrada en el mismo PR.
- `enums.ts` sin `import` de `drizzle-orm`, con test que lee el fuente. Bajá los techos de
  `presupuesto.spec.ts` al valor **medido** nuevo, no a uno aspiracional.
- `uploadCategoryImage`: mismo patrón que `uploadProductImage` (magic bytes, sin SVG, carpeta
  `categorias/`, borra el asset anterior). Fila en `admin-guards.test.ts`.
- Local sin Docker: §4.13. Resta entre `UNSIGNED` ⇒ `CAST(... AS SIGNED)`.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes antes del PR.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §5.1 "Salida O14", ítem por ítem; PR con CI verde completo; entrada de O14 en §9.

## Después de esta fase
Auditoría pre-cierre (§4.11), reporte de cierre (§4.10). Si esta sesión es la ventana encadenada
(`opus-todo-crecimiento.md`), mergeá con CI verde completo y seguí con
`fable/prompts/opus-15-recordatorio-pago.md`. Si es una ventana suelta de recuperación (§11),
no mergees: dejá el PR abierto y verde, y decí que la siguiente es O15 (Opus).
