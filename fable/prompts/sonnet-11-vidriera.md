# Fase S11 — Vidriera: destacados, vistos recientemente, categorías, avisame, consulta por WhatsApp. Sesión nueva de SONNET, SÓLO con O8 mergeada. Puede correr en paralelo con S9 y S10.

Leé `fable/plan-operacion.md` §0, §1, §4, §6.3 y las entradas de O6 y O7 en §9, más
`KNOWN-ISSUES.md`. Después `CLAUDE.md`, `NEW-STORE.md` §5, `src/config/tienda.ts`,
`src/lib/testids.ts`, `src/app/page.tsx`, `src/app/categoria/[slug]/page.tsx`,
`src/app/producto/[slug]/page.tsx`, `src/components/{product-card,add-to-cart,stock-badge,whatsapp-fab}.tsx`,
`src/lib/cart-store.ts` (clave de storage), `src/db/queries.ts` (`getFeaturedProducts`,
`getCategoryBySlug` — sólo leer), `src/domain/stock-alerts.ts` (`stockAlertsEnabled` — sólo leer),
`src/app/actions/stock-alerts.ts` (firma — sólo leer), `src/lib/markdown.ts` (sólo leer),
`src/lib/comercio.ts` (`WHATSAPP_NUMBER`), `tests/e2e/{compra,csp}.spec.ts`. Ejecutá plan §6.3
bajo el protocolo §4. Nada fuera del plan.

Owns: `src/app/page.tsx`, `src/app/categoria/**`, `src/app/producto/**` (menos `generateMetadata`,
que O7 dejó y no se pisa), `src/components/{home-hero,product-card,catalog-filters,add-to-cart,stock-badge,whatsapp-fab}.tsx`,
`src/components/{recently-viewed,stock-alert-form,product-description,variant-inquiry-link}.tsx`
(nuevos), `tests/e2e/compra.spec.ts`, `tests/e2e/csp.spec.ts`, bloques `// == S11 ==` al final de
`es-PY.ts` y `testids.ts`, bloque `/* == S11 == */` al final de `globals.css` (prosa del markdown).

**Límites duros (§4.7):** no tocás `src/domain/**`, `src/lib/**` (salvo el bloque de
`testids.ts`), `src/db/**`, `src/app/actions/**`, `src/app/api/**`, `src/proxy.ts`, `drizzle/`.
No hay endpoint nuevo para "vistos recientemente": se guarda en `localStorage` lo mínimo para
dibujar la ficha, como dice §6.3.

Reglas de la fase:
- Branch `phase/s11` desde `main` actualizado. Commit cada 30 min.
- Skills: `paraguay-business-apps` (WhatsApp-first, texto de la consulta), `fable-cost-guardrail`.
- Es **piel**: cada tienda la rediseña. Cambiá lo mínimo del layout; no quites ningún
  `data-testid` existente (`testids-contrato.test.ts`).
- "Avisame" se dibuja **sólo** si la page pasa `stockAlertsEnabled()` = true y la variante no
  tiene disponibilidad. En CI no hay sender: el e2e verifica que **no** aparece.
- `recently-viewed.tsx` renderiza sólo después de `useEffect` (sin desajuste de hidratación);
  `localStorage` bloqueado ⇒ no se muestra, sin error en consola (`csp.spec.ts` lo captura).
- `product-description.tsx` usa `dangerouslySetInnerHTML` con la salida de `renderMarkdown`
  **únicamente**; comentario de por qué es seguro acá y en ningún otro lado.
- Sin foto ni descripción, la página de categoría es exactamente la de hoy.
- Todo texto por `t()`; testids nuevos; specs por testid.
- Al traer `main` antes del PR: conflictos en `es-PY.ts`/`testids.ts` se resuelven
  conservando los dos bloques.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.3 "Salida S11", ítem por ítem; PR abierto con CI verde completo; entrada de
S11 en §9 dentro del PR.

## Después de esta fase
No spawneás nada y **no mergeás**. Auditoría pre-cierre (§4.11), reporte de cierre (§4.10).
Anton mergea. S12 arranca recién cuando S9, S10 y S11 estén las tres mergeadas.
