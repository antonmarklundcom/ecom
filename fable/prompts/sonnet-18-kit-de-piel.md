# Fase S18 — Kit de piel: tres temas y la pregunta en `nueva-tienda`. Sesión nueva de SONNET, SÓLO con O16 mergeada. Puede correr en paralelo con S17.

Leé `fable/plan-crecimiento.md` §0 (sobre todo 0.7), §1 (1.4), §4, §6.2, §9. Después NEW-STORE.md §5
entero, `src/app/globals.css`, `src/app/layout.tsx`, `scripts/nueva-tienda.ts` y su test,
`src/components/site-header.tsx`, `src/components/product-image.tsx`. Skills: `fable-cost-guardrail`.
Ejecutá plan §6.2 bajo el protocolo §4. Si O16 no está mergeada: **pará y decilo**.

Owns: `src/styles/temas/**` (nuevo), `src/app/globals.css`, `src/components/site-header.tsx`,
`src/components/product-image.tsx`, `public/placeholders/**`, `scripts/nueva-tienda.ts`,
`tests/unit/nueva-tienda.test.ts`, `tests/unit/temas.test.ts` (nuevo), NEW-STORE.md §5.

**Límites duros (§4.7):** nada en `src/domain`, `src/lib`, `src/db`, `src/app/actions`, `src/app/api`,
`src/proxy.ts`, `drizzle/`. Ningún tema se lee en runtime: es CSS y un `@import`, nada más.

Reglas de la fase:
- Branch `phase/s18` desde `main` actualizado. Commit cada 30 min.
- `neutro.css` = los valores de hoy **byte a byte** movidos de `globals.css`. Las capturas de CI
  tienen que salir idénticas; si un píxel cambia con `neutro`, es un bug de la fase.
- Los tres temas definen exactamente el mismo conjunto de variables en `:root` y `.dark`; el test
  unitario lo verifica leyendo los `.css`. Cabecera de cada tema: para quién, fuentes sugeridas,
  las dos líneas de `layout.tsx`.
- `nueva-tienda --tema` idempotente, default el actual, `neutro` sin TTY. Test.
- Fade de la barra de categorías sin JS nuevo si se puede; `data-testid` existentes intactos.
- Verificá que `calido` y `oscuro-vivo` compilan: cambiar el `@import`, `pnpm build`, volver. Anotalo en §9.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes con `neutro`.
- Re-ejecutable; parar sólo por §4.4.

Salida: plan §6.2 "Salida S18", ítem por ítem; PR con CI verde completo; entrada de S18 en §9.

## Después de esta fase
Auditoría pre-cierre (§4.11), reporte de cierre (§4.10). Ventana encadenada: mergeá con CI verde
completo (al traer `main`, `es-PY.ts`/`testids.ts` se resuelven conservando los dos bloques) y seguí
según `sonnet-todo-crecimiento.md`. Ventana suelta: no mergees, dejá el PR verde.
