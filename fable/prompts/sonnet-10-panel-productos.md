# Fase S10 — Panel de productos y categorías. Sesión nueva de SONNET, SÓLO con O8 mergeada. Puede correr en paralelo con S9 y S11.

Leé `fable/plan-operacion.md` §0, §1, §4, §6.2 y las entradas de O6, O7 y O8 en §9, más
`KNOWN-ISSUES.md`. Después `CLAUDE.md`, `NEW-STORE.md` §5, `src/lib/testids.ts`,
`src/lib/permissions.ts`, `src/app/admin/(panel)/productos/**`, `src/app/admin/(panel)/categorias/page.tsx`,
`src/components/admin/{product-form,product-filters,product-images,variant-editor,categories-manager}.tsx`,
`src/app/actions/admin-products.ts`, `src/app/actions/admin-payments.ts`,
`src/app/actions/admin-categories.ts` (firmas — sólo leer), `src/lib/markdown.ts` (sólo leer),
`tests/e2e/helpers.ts`. Ejecutá plan §6.2 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/app/admin/(panel)/productos/**`, `src/app/admin/(panel)/categorias/**`,
`src/components/admin/product-*.tsx`, `src/components/admin/variant-editor.tsx`,
`src/components/admin/categories-manager.tsx`, `src/components/admin/bulk-*.tsx` (nuevo),
`src/components/admin/markdown-*.tsx` (nuevo), `src/components/admin/refund-form.tsx` (nuevo),
`tests/e2e/productos.spec.ts` (nuevo), bloques `// == S10 ==` al final de `src/i18n/es-PY.ts` y
`src/lib/testids.ts`, bloque `/* == S10 == */` al final de `globals.css` si hace falta.

**Límites duros (§4.7):** no tocás `src/domain/**`, `src/lib/**` (salvo el bloque de
`testids.ts`), `src/db/**`, `src/app/actions/**`, `src/app/api/**`, `src/proxy.ts`, `drizzle/`.
Tampoco `pedidos/**` ni `order-*.tsx` (son de S9): el formulario de reembolso parcial es un
componente **nuevo** `refund-form.tsx` y S9 no lo crea; dónde se monta lo decidís leyendo
dónde está hoy el botón de devolución — si está en `pedidos/[id]/page.tsx`, montalo ahí con
un cambio de una línea y anotalo en §9 para que Anton lo sepa al mergear.

Reglas de la fase:
- Branch `phase/s10` desde `main` actualizado. Commit cada 30 min.
- Skills: `paraguay-business-apps` (formato de Gs en la vista previa), `fable-cost-guardrail`.
- Nada se dibuja para un rol que el guard rechazaría: `can(role, 'precios.masivo')` para el
  ajuste de precios, `can(role, 'reembolsos')` para el reembolso.
- La acción masiva de precios pide **confirmación explícita** con la cantidad y el motivo.
- Vista previa de markdown en el cliente con `renderMarkdown` de `src/lib/markdown.ts`;
  ninguna server action nueva.
- Todo texto por `t()`; testids nuevos; el spec nuevo usa testids, nunca texto.
- Al traer `main` antes del PR: conflictos en `es-PY.ts`/`testids.ts` se resuelven
  conservando los dos bloques.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.2 "Salida S10", ítem por ítem; PR abierto con CI verde completo; entrada de
S10 en §9 dentro del PR.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea. S12 arranca recién cuando S9, S10 y S11 estén las tres mergeadas.
