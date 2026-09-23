# Fase S17 — Panel y vidriera: dibujar lo que O14–O16 dejaron. Sesión nueva de SONNET, SÓLO con O16 mergeada.

Leé `fable/plan-crecimiento.md` §0, §1, §4, §6.1, §9 (entradas O14–O16) y `KNOWN-ISSUES.md`.
Después `CLAUDE.md` (maquinaria vs. piel), NEW-STORE.md §5 (los `data-testid`), y las funciones que
vas a consumir: `saveProduct`/`listAdminProducts`, `uploadCategoryImage`/`listAdminCategories`,
`getPaymentForOrder`, `editPendingOrderAction`, `getAdminOrder`. Skills: `fable-cost-guardrail`,
`paraguay-business-apps`. Ejecutá plan §6.1 bajo el protocolo §4. Si O16 no está mergeada: **pará y decilo**.

Owns: la lista de §6.1 "Owns" — componentes de `src/components/admin/**` nombrados, páginas de
`src/app/admin/(panel)/{pedidos/[id],productos,categorias}/**`, `src/app/admin/error.tsx` (nuevo),
`src/app/categoria/[slug]/page.tsx`, `src/app/producto/[slug]/page.tsx` (sólo metadata),
`tests/e2e/panel.spec.ts`, `tests/e2e/productos.spec.ts`, `src/components/__tests__/**`.

**Límites duros (§4.7):** nada en `src/domain`, `src/lib` (salvo tu bloque de `testids.ts`), `src/db`,
`src/app/actions`, `src/app/api`, `src/proxy.ts`, `drizzle/`. Si el dominio no expone algo:
workaround visible + entrada en `KNOWN-ISSUES.md` con el arreglo. Nunca "un cambio chiquito" ahí.

Reglas de la fase:
- Branch `phase/s17` desde `main` actualizado. Commit cada 30 min.
- Ningún `data-testid` existente se borra; los nuevos en bloque `// == S17 ==`. Todo texto por `t()`,
  bloque `// == S17 ==` al final de `es-PY.ts`.
- Canonical: sólo con `siteOrigin()`; sin origen, no se emite nada. Paginación: `<span aria-disabled>`
  en los bordes, no un `<Link>` con `disabled`.
- El formulario de edición de pedido manda ids, cantidades, dirección y método; el servidor cotiza y
  calcula. El navegador nunca muestra un total que no vino de la acción.
- Una pasada de capturas (CI). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §6.1 "Salida S17", ítem por ítem; PR con CI verde completo; entrada de S17 en §9.

## Después de esta fase
Auditoría pre-cierre (§4.11), reporte de cierre (§4.10). Ventana encadenada: mergeá con CI verde
completo y seguí según `sonnet-todo-crecimiento.md` (S18 si no corrió en paralelo; si ya está
mergeada, S19). Ventana suelta: no mergees, dejá el PR verde.
