# Fase O7 — Plata y catálogo: reembolso parcial, precios masivos, duplicar, markdown, destacados, categorías. Sesión nueva de OPUS, SÓLO con O6 mergeada.

Leé `fable/plan-operacion.md` ENTERO primero (§0, §1, §2, §4, §5.3 y las entradas de O5/O6 en
§9), más `KNOWN-ISSUES.md`. Después `ARCH.md` §2 "Money invariants" y §5.1,
`src/domain/payment-recovery.ts`, `src/domain/manual-payments.ts`, `src/domain/reconciliation.ts`,
`src/domain/admin-products.ts`, `src/domain/admin-categories.ts`, `src/domain/product-images.ts`,
`src/lib/cloudinary.ts`, `src/lib/slug.ts`, `src/lib/money.ts`, `src/db/queries.ts`,
`src/app/producto/[slug]/page.tsx` (sólo `generateMetadata`), `src/app/actions/admin-products.ts`,
`src/app/actions/admin-payments.ts`, `src/app/actions/admin-categories.ts`, `src/lib/permissions.ts`.
Ejecutá plan §5.3 bajo el protocolo §4. Nada fuera del plan.

Owns: `src/domain/payment-recovery.ts`, `src/domain/reconciliation.ts`,
`src/domain/admin-bulk.ts` (nuevo), `src/domain/admin-products.ts`, `src/domain/admin-categories.ts`,
`src/domain/product-images.ts`, `src/lib/markdown.ts` (nuevo), `src/lib/schemas.ts`,
`src/lib/permissions.ts`, `src/db/queries.ts`, `src/app/actions/admin-*.ts`,
`src/app/producto/[slug]/page.tsx` (sólo `generateMetadata`), `scripts/reconcile.ts`, `tests/**`,
`ARCH.md`, `README.md` (fila de `pnpm reconcile`), bloques propios de `es-PY.ts`/`testids.ts`.

Reglas de la fase:
- Branch `phase/o7` desde `main` actualizado. O6 sin mergear ⇒ pará y decilo.
- Skills: `paraguay-business-apps` (redondeo a ₲100/₲1.000, IVA incluido),
  `nodejs-mysql-hostinger-stack`, `fable-cost-guardrail`.
- **Plata entera, fila bloqueada, auditoría por unidad.** Reembolso parcial: `FOR UPDATE`,
  `refunded_pyg + monto ≤ amount_pyg`, fila en `refunds`, `status = 'refunded'` sólo al llegar
  al total, y ahí la misma transición de pedido que hoy. Un parcial NO mueve el estado del
  pedido. `reconcile` gana las invariantes de §5.3.A y el test que las pone rojas a propósito.
- Precios masivos: **owner**, capability `precios.masivo`, porcentaje entero, redondeo con los
  dos casos de test escritos en el plan (12.345 × +10 % → 13.600; 990 × −90 % → 100, nunca 0),
  `compare_at_pyg` intacto, una fila de `price_adjustments` por variante cambiada.
- Duplicar: sin copiar imágenes (el comentario explica por qué: `deleteProductImage` destruye
  el asset en Cloudinary).
- Markdown: parser propio, sin dependencias, sin APIs de Node (S10 lo importa en el cliente),
  escapa todo primero, links sólo `https://`. Tests de XSS obligatorios.
- `getFeaturedProducts` sin destacados devuelve exactamente lo que la home muestra hoy (test).
- Guards primero, fila en `permissions.ts` y en ARCH.md §1 después; `admin-guards.test.ts` y
  `atribucion.test.ts` en el mismo PR.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm reconcile` (contra la base
  local sembrada) antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.3 "Salida O7", ítem por ítem; PR con CI verde completo; entrada de O7
en §9 dentro del PR, incluyendo si dejaste `previewPriceAdjustment` (S10 lo necesita) o no.

## Después de esta fase
No spawneás nada. Si esta sesión es la ventana encadenada (`opus-todo.md` / `sonnet-todo.md`), mergeás con CI verde completo y seguís como dice ese prompt; si es una ventana suelta de recuperación (§11), **no mergeás**: dejás el PR abierto y verde. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea y abre la ventana siguiente con `fable/prompts/opus-8-backups-observabilidad.md` (Opus).
