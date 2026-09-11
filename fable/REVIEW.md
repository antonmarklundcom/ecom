# fable/REVIEW.md — Revisión de Fable 5.1 · 2026-09-11

Tercera revisión del template `antonmarklundcom/ecom`, sobre `main` en `f785b03` (S13
mergeada, las nueve fases de `fable/plan-operacion.md` cerradas). Hecha con el prompt de
`fable/PROMPT.md`. La revisión anterior quedó en `fable/REVIEW-2026-09-02.md`. El plan que
sale de ésta es **`fable/plan-crecimiento.md`** con sus prompts en `fable/prompts/`.

## 1. Veredicto

El template está **sano y cerrado**: ~39.800 líneas de TypeScript, tres planes ejecutados
(FASE 1–2, endurecimiento, operación), y esta vez la auditoría de plata, stock, estados,
guards, cron, CSP y scripts de operación **no encontró ningún defecto de maquinaria** —
ni alto ni medio. Lo que la revisión anterior marcó (xlsx con CVEs, sin Playwright,
`@types/node: latest`, `.max()` faltantes, `pnpm-al-dia` en cada push) está todo
resuelto en `main`.

Lo que importa ahora no es arreglar sino **cobrar la deuda que las fases Sonnet no
pudieron pagar** y hacer que cada tienda venda un poco más y cueste un poco menos:

1. **Seis huecos del panel que quedaron en `KNOWN-ISSUES.md` porque ninguna fase con
   permiso sobre `src/domain`/`src/app/actions` los tomó** — "destacado" sin botón, foto de
   categoría por `public_id` pegado a mano, el formulario de categoría que no muestra lo
   que ya tiene, el reembolso parcial que "olvida" lo devuelto al recargar, el ORM entero
   viajando al navegador por cuatro constantes, el `.xlsx` corrupto con error genérico.
   Son chicos, están diagnosticados con el arreglo escrito, y llevan dos planes esperando.
2. **Dos cosas que hoy pierden ventas y ninguna fase pidió**: el pedido por transferencia
   que vence a las 24 h sin que nadie le recuerde a la compradora que pague, y el pedido
   que la compradora quiere cambiar ("mejor dos, y mandámelo a la oficina") y hoy sólo se
   puede cancelar y volver a hacer.
3. **El costo de sacar una tienda nueva sigue siendo el diseño**: los tokens de
   `globals.css` son los grises por defecto de shadcn y cada tienda arranca la piel desde
   cero. Un kit de tres temas listos, elegible desde `pnpm nueva-tienda`, mueve el 80 % del
   look antes de abrir un mockup.

## 2. Lo que se corrió

| Chequeo | Resultado |
|---|---|
| `pnpm typecheck` | verde |
| `pnpm lint` | verde |
| `pnpm test` (unitarios + integración contra MariaDB 10.11 local, sin Docker) | 133 archivos, 1474 tests verdes, 1 skip (sandbox Pagopar) |
| `pnpm build` | verde |
| `pnpm test:e2e` (Playwright contra `next build`, Chromium del entorno vía `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) | 26 specs verdes |
| `pnpm audit` | 1 moderate (`esbuild` vía `drizzle-kit`, sólo dev, ya en backlog) — **cero high** |
| `pnpm outdated` | mayores pendientes: `iron-session` 8→9, `vitest` 4→5, `eslint` 9→10, `typescript` 5→7. Resto, menores |

La primera corrida de e2e falló entera por el entorno, no por el repo: `@playwright/test`
1.62 pide el Chromium `1234` y el sandbox trae el `1194`. `playwright.config.ts` ya
contempla ese caso (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`), y con esa variable la suite corre
contra el build real: 26 de 26 verdes. En CI corre igual en cada PR (`.github/workflows/ci.yml`, job `e2e`).

Tres subagentes Sonnet leyeron el repo por áreas (plata/auth, seguridad/ops/CI,
piel/UX/SEO); cada hallazgo de abajo lo verifiqué yo contra el código.

## 3. Hallazgos (confirmados contra el código)

| id | Sev. | Área | Dónde | Qué pasa | Por qué importa | Arreglo → fase |
|---|---|---|---|---|---|---|
| G1 | **medium** | deuda de dominio | `KNOWN-ISSUES.md` (6 entradas) | Seis huecos diagnosticados en S10/S12 que necesitan tocar `src/domain/**`, `src/app/actions/**` o `src/db/**`: `saveProduct` sin `isFeatured` y `listAdminProducts` sin `is_featured`; sin `uploadCategoryImage`; `listAdminCategories` sin `description`/`image_*`; `findUnmatchedPayments` sin `refunded_pyg` y sin `getPaymentForOrder`; enums de `schema.ts` importados desde componentes cliente (arrastran `drizzle-orm` al bundle, ~17 KB gz); `.xlsx` corrupto con error crudo. | El dueño no puede marcar un destacado desde el panel (la feature de O7/S11 está a medias); la foto de categoría es una tarea de desarrollador; el reembolso parcial muestra un número mal al recargar; el presupuesto de JS gasta margen en un ORM que el navegador no usa. | **O14**: los seis, con tests. La piel que los dibuja va en **S17**. |
| G2 | **medium** | conversión | `src/domain/maintenance.ts:44`, `src/app/api/cron/vencer-pedidos/route.ts` | Un pedido por transferencia nace con `reserved_until = +24 h` y el cron lo vence en silencio. Entre medio nadie le escribe a la compradora. El único aviso saliente al cliente hoy es confirmado / pagado / enviado. | En una tienda chica, "me olvidé de transferir" es la primera causa de pedido vencido, y cada uno es una venta que ya estaba hecha. La infraestructura (sender, plantillas por variable, `job_runs`, cron cada 15 min) ya existe. | **O15**: recordatorio único por pedido cuando faltan ≤ 6 h para vencer, plantilla nueva de Meta, vacía = apagado. |
| G3 | **medium** | operación | `src/domain/create-order.ts`, backlog de `plan-operacion.md` §10 | No hay forma de editar un pedido sin pagar: ni cantidad, ni dirección, ni forma de entrega. Hoy: cancelar y que la compradora vuelva a hacer todo el checkout. | Es el pedido de cambio más común por WhatsApp ("mejor dos", "a la oficina") y cada vuelta al checkout pierde compradoras. Requiere re-precio, re-reserva y re-cotización dentro de una transacción: maquinaria. | **O16**: edición por staff en `pendiente_pago`, sólo transferencia y contra entrega, con auditoría y una invariante nueva de `reconcile`. |
| G4 | **low** | validación | `src/app/actions/admin-products.ts:58-61`, `src/db/schema.ts:148` | `ProductSchema.slug` tiene regex pero no `.max()`; la columna es `varchar(160)`. | Un slug de 200 caracteres pasa Zod y revienta en el INSERT: 500 en vez de mensaje. Sólo staff puede provocarlo. Mismo patrón que la revisión anterior arregló en email/url y que `admin-categories.ts:45` ya hace bien. | **O14**: `.max(160)`. |
| G5 | **low** | SEO | `src/app/categoria/[slug]/page.tsx`, `src/app/producto/[slug]/page.tsx` | Ninguna página emite `<link rel="canonical">` (`grep canonical src` vacío). La categoría acepta `?marca=`, `?precio=`, `?orden=`, `?page=` y sirve contenido completo con el mismo título en todas las combinaciones. | Google puede indexar `/categoria/ropa?orden=precio-asc&page=3` como página aparte que compite con `/categoria/ropa`. El resto del SEO (sitemap, robots, JSON-LD) es prolijo; esto desentona. | **S17**: `alternates.canonical` a la URL limpia en categoría y producto. |
| G6 | **low** | piel / a11y | `src/app/categoria/[slug]/page.tsx:198-212` | `<Button asChild disabled>` sobre un `<Link>`: `disabled` cae como atributo crudo en un `<a>`, que no lo respeta. "Anterior" en la página 1 se ve y se clickea como habilitado y navega a `page=0`. `aria-disabled` sí está puesto (el lector de pantalla lo avisa, el mouse no). | Único lugar del repo con esa combinación. Cosmético pero visible en cada categoría con más de una página. | **S17**: `<span>` deshabilitado en los bordes, o `onClick` que frene. |
| G7 | **low** | panel | `src/app/admin/` (sin `error.tsx`) | Un error en cualquier página del panel cae en el `error.tsx` de la vidriera, dentro del layout del panel, sin link de vuelta a `/admin`. | Staff que pisa un error de verdad queda en una pantalla que no dice ni que es el panel. Bajo: `reset()` suele alcanzar. | **S17**: `src/app/admin/error.tsx` propio. |
| G8 | **low** | deps / DX | `package.json:76`, `.husky/pre-commit` | `lint-staged` está en `devDependencies` pero no hay config ni lo llama el hook (`pre-commit` corre `pnpm typecheck && pnpm lint` enteros). | Una dependencia que insinúa un comportamiento que no existe: la próxima sesión "lo arregla" cableándolo en vez de sacarlo. | **S19**: sacarlo (el hook actual es el correcto: `tsc` no sabe de archivos staged). |
| G9 | **low** | deps | `package.json` | Cuatro mayores pendientes: `iron-session` 9, `vitest` 5, `eslint` 10, `typescript` 7. Ninguna es urgente; `next` 16.3.4 está al día. | Cada mes que pasan sin subir, el salto es más caro. `typescript` 7 (el port a Go) es el único con riesgo real de no compilar con Next 16. | **S19**: subir las tres primeras con la suite entera como red; `typescript` 7 se intenta con tope de tiempo y si no queda verde va al backlog. |
| G10 | **low** | piel | `src/app/globals.css`, `src/components/site-header.tsx:41-55` | Los tokens son los grises por defecto de shadcn; no hay ningún tema alternativo ni forma de elegir uno desde `pnpm nueva-tienda`. La barra de categorías en móvil hace scroll horizontal sin ninguna pista visual de que sigue. | No es un bug: es el costo fijo de cada tienda nueva. NEW-STORE.md §5 documenta bien los seams, pero el punto de partida es una tienda gris. | **S18**: tres temas en archivos propios, elegibles desde el wizard; fade en la barra de categorías. |

**Descartado a propósito** (lo marcaron los subagentes; el repo ya lo explica como decisión):
rate limit en memoria, `?secret=` en el cron, CSP sin nonce en catálogo cacheado, chunk de
`next/image` sin nonce (bug de Next 16.3), ausencia de `loading.tsx` en producto/categoría
(el 404 se decide en la página), backup en un solo archivo (KNOWN-ISSUES lo posterga con
motivo), `BUILD_SHA`/`BUILD_AT` fuera de `.env.example` (los calcula el build), los tres
managers del panel de 400+ líneas (el contrato de NEW-STORE.md dice "repintar", no
"rediseñar", y funcionan).

## 4. Lo que está bien — no "mejorar"

Todo lo de `fable/REVIEW-2026-09-02.md` §4 sigue vigente. Lo nuevo desde entonces que
también hay que proteger:

- **`job_runs` como candado de crons**: `INSERT … ON DUPLICATE KEY UPDATE` para garantizar
  la fila, `FOR UPDATE`, día calendario de Asunción. Un `SELECT` antes del `INSERT` reabre
  el doble envío que esto cierra. O15 lo reusa tal cual.
- **Reembolso parcial**: re-lee `payments` con la fila bloqueada, ledger en `refunds` +
  acumulado en `refunded_pyg` en la misma transacción, `order_events` con `from = to` y un
  prefijo de motivo que `reconcile` reconoce. Es el patrón para cualquier "evento que no es
  transición" — O16 lo copia.
- **Backups sin `mysqldump`**: dump en JS puro a Cloudinary `raw` + `authenticated`,
  `restore` que se niega fuera de una base con `restore`/`test` en el nombre, SQL
  parametrizado hasta para un archivo que escribió la propia app.
- **`instrumentation.ts` + logger JSON**: sin SDK de terceros, `ERROR_REPORT_URL` vacía =
  sólo log, sin datos de compradoras en ningún `log.*` (verificado por grep).
- **Presupuesto de JS medido con bytes reales** (`presupuesto.spec.ts`) y Lighthouse sólo
  como alarma. No invertirlo.
- **`distribuir.yml` + `template:sync`**: el PR a cada tienda hija se abre en una rama
  fechada, `--force-with-lease` sólo sobre esa rama, nunca merge automático. El CI de la
  tienda manda.
- **`nueva-tienda.ts`**: idempotente, nunca rota un secreto existente, falla en voz alta sin
  TTY. S18 le agrega una pregunta; no le cambia la forma.

## 5. Preguntas para Anton (cada una con recomendación)

Ninguna bloquea el plan: las tres fases Opus y las tres Sonnet arrancan sin respuesta.

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | Facturación electrónica (SIFEN / e-Kuatia): ¿entra ya como fase, contra la API de FacturaPY que describe ARCH.md §7? | **Todavía no.** Necesita el timbrado y la habilitación SIFEN de **cada comercio**, y FacturaPY tiene que exponer la API primero. El schema ya está listo (RUC con DV, IVA por línea). Se arranca el día que una tienda con timbrado lo pida; hasta entonces es una fase de un plan siguiente, no de éste. |
| P2 | `typescript` 7: ¿forzarlo? | **No forzar.** S19 lo intenta con tope de 30 minutos; si `next build` o `tsc` no quedan verdes, se revierte y queda en backlog hasta que Next lo soporte oficialmente. |
| P3 | Editar pedido (O16): ¿también para `tarjeta`? | **No.** El monto del pedido en Pagopar es fijo y la verificación de monto del webhook es justamente la red que detecta un pago que no cuadra. Cambiar un pedido con tarjeta = cancelarlo y rehacerlo, y O16 lo dice en pantalla. |
| P4 | Recordatorio de pago (O15): ¿6 h antes de vencer o 12 h después de crear? | **6 h antes de vencer**, medido sobre `reserved_until`: es el dato que ya decide el vencimiento, y sobrevive a cualquier cambio futuro de la ventana de reserva. |

## 6. Lo que se arregló en esta sesión

Nada en el código, a propósito: todos los hallazgos tienen su fase. Sólo `fable/`
(este archivo, `REVIEW-2026-09-02.md` renombrado, `plan-crecimiento.md`, los prompts) y
las líneas de `CLAUDE.md` / `README.md` / `PLAN.md` que apuntan al plan activo.
