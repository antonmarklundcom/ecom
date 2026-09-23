# fable/plan-crecimiento.md — Deuda de dominio, ventas que se pierden y el kit de piel · plan para Opus y Sonnet

**Origen:** revisión de Fable 5.1 del 2026-09-11 (`fable/REVIEW.md`) sobre `main` en `f785b03`,
con `fable/plan.md` y `fable/plan-operacion.md` mergeados completos. Veredicto: la
maquinaria está sana y sin defectos; lo que queda es **cobrar la deuda de dominio que
las fases Sonnet anotaron en `KNOWN-ISSUES.md`**, tapar **dos huecos que pierden ventas**
(el pedido que vence sin recordatorio, el pedido que no se puede editar) y bajar **el costo
de diseño de cada tienda nueva** con un kit de temas.

Este plan **no reemplaza** los anteriores (quedan como historial). Cuando las seis fases
estén mergeadas, este archivo pasa a ser historial también y la próxima revisión arranca
desde `fable/PROMPT.md`.

> **Actualización 2026-09-11 (S19):** las seis fases (O14–S19) están mergeadas — este
> archivo queda como **historial** a partir de acá. La próxima revisión arranca desde
> `fable/PROMPT.md`.

**Stack (locked):** Next.js 16 + Drizzle + Hostinger MySQL + Hostinger Node.js + Cloudinary.

**Cómo se corre:** **dos ventanas** (§11), igual que el plan anterior. Una de Opus que
encadena O14→O15→O16 y una de Sonnet que encadena S17→S18→S19, un PR por fase, mergeando
cada uno con CI verde completo antes del siguiente. Los prompts por fase de
`fable/prompts/` son lo que la ventana encadenada lee en cada paso, y el plan B si una
sesión se corta.

| Fase | Modelo | Prompt | Branch | Secciones | Depende de |
|---|---|---|---|---|---|
| O14 | Opus | `fable/prompts/opus-14-deuda-dominio.md` | `phase/o14` | §5.1 | — |
| O15 | Opus | `fable/prompts/opus-15-recordatorio-pago.md` | `phase/o15` | §5.2 | O14 mergeada |
| O16 | Opus | `fable/prompts/opus-16-editar-pedido.md` | `phase/o16` | §5.3 | O15 mergeada |
| S17 | Sonnet | `fable/prompts/sonnet-17-panel-y-vidriera.md` | `phase/s17` | §6.1 | O16 mergeada |
| S18 | Sonnet | `fable/prompts/sonnet-18-kit-de-piel.md` | `phase/s18` | §6.2 | O16 mergeada |
| S19 | Sonnet | `fable/prompts/sonnet-19-deps-docs-cierre.md` | `phase/s19` | §6.3 | S17 y S18 mergeadas |

S17 y S18 tienen archivos disjuntos (§4.9) y **pueden correr en paralelo**. Todo lo demás es
secuencial. Fable no aparece en la tabla y no va a aparecer (§4.8).

**Costo esperado:** tres fases Opus (~$15–25 cada una) + tres Sonnet (~$8–12) ≈ $80–110 y
unas 6–8 h de pared entre las dos ventanas. Si una fase pasa de 90 minutos, era dos fases:
se cierra el PR con lo que hay verde y el resto va a §10.

---

## 0. Lo que hay que tener en la cabeza (para todas las fases)

Lo de `fable/plan-operacion.md` §0 sigue valiendo entero (un schema por plan, un solo
escritor de `orders.status`, plata entera con la fila bloqueada, avisos después del commit
que nunca fallan la operación, crons idempotentes con `job_runs`, guards primero, `actor` +
`actor_user_id` en toda auditoría, bloques propios en `es-PY.ts` y `testids.ts`, piel vs.
maquinaria, el navegador no decide plata, sin dependencias nuevas de runtime, CSP con
nonce, tests que fijan la decisión, migraciones con default o nullable). Lo específico
de este plan:

1. **El schema completo de este plan se escribe en O14, en una migración (`0013`).** Es una
   sola columna (§2), pero la regla es la misma: O15 y O16 no agregan schema. Si una cree
   que necesita otra columna, es un error de planificación y se para (§4.4).
2. **Cada entrada de `KNOWN-ISSUES.md` que una fase resuelve se borra en ese mismo PR.** La
   entrada ya trae el diagnóstico y el arreglo; la fase lo ejecuta, escribe el test que
   lo fija y borra la entrada. Una entrada que sobrevive a la fase que la tenía asignada
   es un criterio de salida que no pasó.
3. **"Evento que no es transición" = fila en `order_events` con `from = to` y un prefijo de
   motivo que `reconcile` reconoce** (`src/domain/reconciliation.ts`, el `CASE` de
   `arista_imposible`, y la constante compartida con `payment-recovery.ts`). O16 usa el
   mismo mecanismo para la edición de un pedido; no inventa una tabla nueva.
4. **El recordatorio de pago se marca antes de mandarse** (`UPDATE … WHERE
   payment_reminder_sent_at IS NULL` + `affectedRows = 1` ⇒ recién ahí se manda), igual que
   `stock-alerts` y `login-tokens`. Un envío que falla queda marcado igual: un recordatorio
   de menos es tolerable, dos son spam.
5. **Editar un pedido nunca cambia el precio unitario que la compradora ya vio.** Cambia
   cantidades, envío y totales; `unit_price_pyg` de cada línea se conserva. Si un cupón
   deja de aplicar con las cantidades nuevas, se quita y se dice en pantalla — nunca se
   recalcula en silencio.
6. **Sonnet no toca maquinaria, y esta vez tampoco la "cosa chiquita".** Si S17 descubre que
   O14–O16 no dejaron una función que necesita: workaround visible + entrada nueva en
   `KNOWN-ISSUES.md` con el arreglo, y se sigue. Es exactamente lo que S10 hizo bien y lo
   que este plan viene a cobrar.
7. **Los temas del kit de piel son CSS puro y un `@import`.** Nada de temas en runtime, nada
   de `useTheme` con nombre de tienda, nada que el dominio pueda leer. Un tema = un archivo
   en `src/styles/temas/` con los mismos tokens de `globals.css`; elegir tema = cambiar una
   línea de `@import`. `nueva-tienda` la escribe.
8. **Subir una dependencia mayor es un PR que no cambia comportamiento.** S19 sube una por
   vez, corre la suite entera (unitarios, integración, e2e) después de cada una, y si algo
   no queda verde en 30 minutos revierte esa dependencia y la anota en §10. No se "adapta"
   un test para que pase con la versión nueva sin entender por qué cambió.

---

## 1. Decisiones ya tomadas — no se reabren

1. Todo lo de `CLAUDE.md`, `fable/plan.md` §1 y `fable/plan-operacion.md` §1.
2. **Recordatorio de pago: uno solo por pedido, cuando faltan ≤ 6 h para `reserved_until`**,
   sólo en `pendiente_pago`, para todos los medios de pago que nacen ahí (transferencia y
   tarjeta abandonada en Pagopar; contra entrega no pasa por ahí). Plantilla
   `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RECORDATORIO`, un parámetro en el cuerpo, vacía =
   apagado. Va dentro del cron de `vencer-pedidos` (cada 15 min): no hay entrada nueva de
   cron en el hPanel.
3. **Editar un pedido: sólo staff (`owner`, `staff`), sólo en `pendiente_pago`, sólo
   transferencia y contra entrega.** Con tarjeta el monto en Pagopar es fijo y la
   verificación de monto del webhook es la red: no se edita, se cancela y se rehace, y la
   pantalla lo dice. Qué se edita: cantidad por línea (bajar, o quitar la línea; **no**
   agregar productos —eso es un pedido nuevo—), ciudad/dirección/referencia, forma de
   entrega (re-cotizada por el dominio). Qué no: precio unitario, cupón (se re-valida
   solo), medio de pago, datos de facturación (RUC/CI).
4. **Kit de piel: tres temas** — `neutro` (el de hoy, sin cambios de valores), `calido`
   (tierra/terracota, redondeo grande, sans humanista), `oscuro-vivo` (fondo oscuro fijo
   con un acento saturado, redondeo chico). Cada uno con `:root` y `.dark` completos.
   Fuentes: siguen en `layout.tsx`; cada tema documenta su par de fuentes y las dos líneas
   a cambiar. `pnpm nueva-tienda --tema <nombre>` (y la pregunta interactiva) escribe el
   `@import`.
5. **`typescript` 7 no se fuerza.** S19 lo intenta con tope de 30 min; si `tsc` o `next
   build` no quedan verdes, se revierte y va a §10 hasta que Next lo soporte.
6. **`lint-staged` se saca.** El hook actual (`pnpm typecheck && pnpm lint`) es el correcto:
   `tsc` no sabe de archivos staged. No se cablea.
7. **Facturación electrónica (SIFEN / FacturaPY) sigue afuera** (REVIEW §5 P1). Arranca el
   día que una tienda con timbrado lo pida, como plan propio.
8. Idioma y estilo: código e identificadores en inglés; comentarios, docs, commits y UI en
   español rioplatense/paraguayo (voseo). Comentarios que explican el modo de falla que
   evitan.

## 2. Schema — el contrato de O14 (completo, no se retoca después)

Una migración `drizzle/0013_*.sql` generada por `pnpm db:generate`.

| Tabla / columna | Tipo | Para qué | Fase que lo usa |
|---|---|---|---|
| `orders.payment_reminder_sent_at` | `datetime` NULL; índice `(status, reserved_until)` ya existe (`orders_reserved_until_idx` cubre `reserved_until`; si el plan de consulta lo pide, índice compuesto `(status, payment_reminder_sent_at, reserved_until)`) | Idempotencia del recordatorio de pago: NULL = todavía no se mandó | O15, S17 (timeline) |

**Backfill:** ninguno. Los pedidos existentes en `pendiente_pago` con menos de 6 h de
reserva al momento del deploy reciben el recordatorio en la primera corrida del cron; es
correcto (todavía pueden pagar) y es un solo mensaje.

Todo lo demás de este plan se hace con las tablas que ya existen: `order_events` (edición
de pedido, prefijo de motivo), `stock_reservations` (re-reserva), `order_items` (cantidades),
`orders` (totales, dirección, `shipping_method_id`).

## 3. Alcance

Diez hallazgos de la revisión (G1–G10) en seis PRs. Fuera de alcance: cualquier cosa que no
esté acá (ideas → §10). En particular **no** entra: agregar productos a un pedido existente,
editar pedidos con tarjeta, email, multi-tenant, SIFEN, reseñas, wishlist, rutas por locale.

**Deuda de dominio (O14, S17):** `isFeatured` en `saveProduct` y en `listAdminProducts` ·
`uploadCategoryImage` · `listAdminCategories` con descripción y foto · `getPaymentForOrder` +
`refunded_pyg` en `findUnmatchedPayments` · `src/db/enums.ts` sin `drizzle-orm` · `.xlsx`
corrupto con mensaje en castellano · `.max(160)` en el slug de producto. Y en S17 la piel de
todo eso: toggle y filtro de destacados, `<input type="file">` de categoría, formulario de
categoría prellenado, reembolso parcial en la ficha del pedido.

**Ventas que se pierden (O15, O16, S17):** recordatorio de pago antes del vencimiento ·
edición de un pedido sin pagar por staff, con auditoría e invariante de `reconcile` · la
pantalla de edición y la línea del recordatorio en el timeline.

**Piel (S17, S18):** canonical en categoría y producto · paginación deshabilitada de verdad ·
`error.tsx` del panel · tres temas + pregunta en `nueva-tienda` · fade en la barra de
categorías móvil · NEW-STORE.md §5 al día.

**Salud del template (S19):** `iron-session` 9, `vitest` 5, `eslint` 10, menores; intento
de `typescript` 7; `lint-staged` afuera; docs; reporte final.

## 4. Protocolo de autonomía (va en cada prompt)

1. Trabajá hasta que **todos** los criterios de salida de la fase pasen. No pidas permiso
   para trabajo que está en el plan.
2. **Un PR por fase.** Branch `phase/<id>` desde `main` actualizado. Abrí el PR, mirá el
   CI (`checks` + `e2e`; `lighthouse` es advertencia), arreglá lo rojo. Con CI verde
   **completo**, **mergeá vos** (squash, con la herramienta de GitHub de la sesión) y
   seguí con la fase siguiente de tu ventana. Nunca mergeás con algo rojo ni con un job
   corriendo. Si la fase anterior de la tabla tiene el PR abierto sin mergear, **pará y
   decilo**: no se apila sobre una fase sin mergear.
3. Problemas menores que no bloquean → `KNOWN-ISSUES.md`, y seguí.
4. **Pará y preguntá sólo por**: una credencial que falta y no tiene fallback, o una
   decisión de cimientos (schema fuera de §2, auth, plata, transiciones) donde adivinar mal
   obliga a reescribir. Todo lo demás: elegí razonablemente, anotalo en §9, seguí.
   "Preguntar" = escribir la pregunta al final del reporte de cierre; Anton contesta en la
   ventana siguiente. **Igual seguís con lo que no depende de la respuesta.**
5. Un valor de entorno que falta nunca bloquea: documentalo en `.env.example`, degradá.
6. Cada prompt es **re-ejecutable**: primero mirá qué hay en la branch, seguí desde el
   primer criterio de salida que no se cumpla. Commit cada 30 minutos de trabajo.
7. **Límites duros de las fases Sonnet (S17–S19):** no tocan `src/domain/**`, `src/lib/**`
   (salvo el bloque propio de `testids.ts`), `src/db/**`, `src/app/actions/**`,
   `src/app/api/**`, `src/proxy.ts` ni `drizzle/`. Si algo de ahí parece necesario:
   workaround visible + entrada en `KNOWN-ISSUES.md`, no cambio. Excepciones explícitas:
   S18 puede tocar `scripts/nueva-tienda.ts` y su test; S19 puede tocar `package.json`,
   el lockfile, `pnpm-workspace.yaml`, configs de eslint/vitest/tsconfig, `.husky/` y —sólo
   si una dependencia nueva lo exige para compilar— cualquier archivo, un cambio mínimo y
   mecánico por vez, anotado en §9.
8. **Guardarraíl de costo:** Fable (`claude-fable-5*`, cualquier Mythos) **nunca** ejecuta
   una fase, un subagente ni una sesión hija. Sólo Opus y Sonnet. Si una sesión cree que
   necesita Fable, para y le pregunta a Anton con el motivo.
9. **Propiedad de archivos.** Cada prompt lista lo que la fase puede crear o modificar
   ("Owns"). Fuera de eso: sólo el bloque propio al final de `src/i18n/es-PY.ts` y de
   `src/lib/testids.ts`, la entrada propia de §9, `KNOWN-ISSUES.md` y `.env.example`. En un
   conflicto al traer `main`: `main` gana, re-aplicás lo tuyo encima, volvés a correr todo.
10. **Reporte de cierre de fase** (en el chat, corto): (a) link al PR mergeado, (b) qué
    existe ahora en 5–10 líneas, (c) decisiones y desvíos, (d) preguntas para Anton, si hay.
    Lo mismo, condensado, va como entrada fechada en §9 **dentro del PR**.
11. **Auditoría pre-cierre**: antes del reporte, `pnpm typecheck && pnpm lint && pnpm test`
    sobre tu branch con `main` ya traído, y releé tu propio diff como adversario una vez.
    Arreglá lo que aparezca en un commit. Una sola vuelta: el resto va a `KNOWN-ISSUES.md`.
12. **Tope de pulido:** una pasada de capturas (si la fase dibuja algo), el cuerpo del PR
    escrito una vez (≤ 25 líneas). Cuando los criterios de salida pasan, abrís el PR **en ese
    mismo turno**. Ideas que aparecen después → §10.
13. **Local sin Docker:** MariaDB por `apt` como en `fable/plan.md` §9, `TEST_DATABASE_URL`
    en `.env.local`. Para e2e, si el Chromium de Playwright no coincide con el del entorno,
    `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-*/chrome-linux/chrome`. Y la
    trampa de `KNOWN-ISSUES.md` (resta entre columnas `UNSIGNED`): MariaDB no la ve, MySQL 8
    de CI sí. Toda resta nueva entre `UNSIGNED` lleva `CAST(... AS SIGNED)`.

## 5. Fases Opus

### 5.1 · O14 — Deuda de dominio + schema del plan

Branch `phase/o14`. Maquinaria. Todo lo que `KNOWN-ISSUES.md` dejó escrito con el arreglo
adentro, más la única columna de §2. Sin piel: S17 dibuja.

**A. Schema.** `orders.payment_reminder_sent_at` (§2) en `src/db/schema.ts` con su
comentario de modo de falla. `pnpm db:generate` → `0013`. `pnpm db:push` y
`POST /api/setup/init` la aplican (`tests/integration/setup-route.test.ts`). CI de drift
verde. NEW-STORE.md § "Migraciones que llegan por `template:sync`": una línea.

**B. `src/db/enums.ts`.** Mover `ORDER_STATUSES`, `PAYMENT_METHODS`, `USER_ROLES`,
`COUPON_TYPES`, `DOC_TYPES` (y cualquier otro array de valores de enum que un componente
cliente importe; grep `from "@/db/schema"` en `src/components/**`) a un archivo **sin**
`import` de `drizzle-orm`. `schema.ts` los importa de ahí y los re-exporta (nada del lado
del servidor cambia de import). Los componentes cliente (`order-status-tabs.tsx`,
`order-filters.tsx`, `users-manager.tsx`, `coupons-manager.tsx`, y los que importen sólo
tipos pueden quedar con `import type`) pasan a `@/db/enums`. Test unitario: `enums.ts` no
importa `drizzle-orm` (leer el fuente, como `no-raw-status-update`), y ningún archivo
`"use client"` importa un **valor** de `@/db/schema`. Bajar los techos de
`tests/e2e/presupuesto.spec.ts` al valor medido nuevo (menos ~17 KB gz en las páginas que
lo cargaban), no dejarlos aspiracionales.

**C. Destacados.** `ProductSchema` de `saveProduct` (`src/app/actions/admin-products.ts`)
gana `isFeatured: z.boolean().optional()` (default `false` en alta, "no tocar" en edición
si viene `undefined`) y lo pasa a `createProduct`/`updateProduct` (ya lo aceptan).
`listAdminProducts` (`src/domain/admin-products.ts`) selecciona `is_featured` y acepta
filtro `featured?: boolean`. Test de integración: guardar con `isFeatured: true` y verlo en
el listado y en `getCatalog({ featured: true })`. Y `.max(160)` en el `slug` (G4) con su
test de "161 caracteres se rechaza con mensaje".

**D. Categorías.** `uploadCategoryImage(categoryId, file)` en
`src/app/actions/admin-categories.ts`, mismo patrón que `uploadProductImage` (magic bytes,
SVG rechazado, carpeta `categorias/` bajo `CLOUDINARY_FOLDER_PREFIX`, guard `requireOwner`
como `crearCategoria`), que escribe `image_cloudinary_id` y borra el asset anterior de
Cloudinary si lo había (como `deleteProductImage`). `listAdminCategories` selecciona
`description`, `imageCloudinaryId`, `imageAlt`. Fila en `permissions.ts` si hace falta una
capability nueva (no debería: es `categorias`). `admin-guards.test.ts` y
`cloudinary-folders.test.ts` cubren la acción nueva.

**E. Reembolsos.** `findUnmatchedPayments` selecciona `p.refunded_pyg AS refundedPyg`.
Nueva `getPaymentForOrder(orderId)` en `src/domain/payment-recovery.ts`: el pago `paid` del
pedido (o `null`) con `paymentId`, `amountPyg`, `refundedPyg`, `provider`, `paidAt`; sin
filtro de estado del pedido (un pedido `enviado` con pago es justo el caso de uso). Test de
integración: pago parcial, releer, `refundedPyg` correcto.

**F. Planilla corrupta.** `spreadsheetToCsvText` (`src/lib/spreadsheet.ts`) envuelve
`workbook.xlsx.load` en `try/catch` y devuelve `UnsupportedSpreadsheetError` con mensaje en
castellano ("el archivo está dañado, exportalo de nuevo"). Ajustar
`tests/unit/spreadsheet.test.ts` al mensaje nuevo.

**G. `KNOWN-ISSUES.md`.** Borrar las seis entradas resueltas (xlsx corrupto, destacado,
foto de categoría, formulario de categoría, `@/db/schema` en el bundle, reembolso parcial en
0). La de MariaDB/UNSIGNED y la del backup en un archivo se quedan.

**Salida O14:** migración `0013` generada y commiteada, drift verde; `src/db/enums.ts` con
su test y los cuatro componentes migrados; `presupuesto.spec.ts` con techos medidos más
bajos; `saveProduct` acepta `isFeatured` y `listAdminProducts` lo devuelve y filtra;
`uploadCategoryImage` con guard y test; `listAdminCategories` completo;
`getPaymentForOrder` + `refundedPyg`; `.xlsx` corrupto con mensaje; slug con `.max(160)`;
seis entradas menos en `KNOWN-ISSUES.md`; `pnpm typecheck && pnpm lint && pnpm test` verde
(integración incluida); `pnpm test:e2e` verde en local; PR con CI completo verde; §9.

### 5.2 · O15 — Recordatorio de pago antes del vencimiento

Branch `phase/o15`. Maquinaria + mensajería. Reusa `order-customer-notifications.ts` y
`runMaintenance`.

**A. Aviso nuevo.** `CustomerNoticeKind` gana `'recordatorio'`. Plantilla
`WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RECORDATORIO` (`.env.example`, con la explicación de
siempre: un parámetro en el cuerpo, aprobación de Meta, vacía = apagado).
`customerNoticeBody('recordatorio', …)`: número de pedido, total en Gs, hasta cuándo puede
pagar (hora de Asunción, `src/lib/py.ts`) y el link tokenizado al pedido. Clave i18n en
bloque `// == O15 ==`. `flags-apagados.test.ts` sigue verde sin la variable.

**B. Selección y marca.** `src/domain/payment-reminders.ts`: `sendPaymentReminders(now)`
que, **sólo si el aviso está configurado**, toma hasta 50 pedidos en `pendiente_pago` con
`payment_reminder_sent_at IS NULL` y `reserved_until` entre `now` y `now + 6 h`; por cada
uno, `UPDATE orders SET payment_reminder_sent_at = NOW() WHERE id = ? AND
payment_reminder_sent_at IS NULL` y **sólo con `affectedRows = 1`** manda el aviso (con
timeout, `catch` + log; el fallo no desmarca). Devuelve `{ candidatos, enviados,
fallidos }`. Sin plantilla: devuelve ceros y no consulta nada.

**C. Cron.** `runMaintenance` llama a `sendPaymentReminders` **después** de vencer
pedidos (así un pedido ya vencido nunca recibe recordatorio) y suma los conteos al reporte.
La ruta de `vencer-pedidos` los loguea y los devuelve. Sin entrada nueva de cron.
Preflight: advertencia si la plantilla falta ("las compradoras no reciben recordatorio de
pago"), no bloqueo.

**D. Tests.** Integración: pedido con 5 h de reserva recibe un recordatorio y sólo uno
aunque el cron corra tres veces; pedido con 10 h no lo recibe; pedido vencido en la misma
corrida no lo recibe; sender que tira ⇒ queda marcado y `fallidos = 1`; sin plantilla ⇒
nada se marca. Unitarios: texto del aviso (formato de Gs, hora de Asunción, link con
token), `flags-apagados`, `cron-auth` sin cambios.

**E. Docs.** ARCH.md §5 (tres líneas del aviso nuevo). NEW-STORE.md §4c: una plantilla más
para pedirle a Meta. DEPLOY.md: nota en la entrada de cron existente (ahora también manda
recordatorios).

**Salida O15:** `sendPaymentReminders` idempotente con test de tres corridas; apagado sin
plantilla y `flags-apagados` verde; el cron lo llama después de vencer; preflight avisa;
docs; suite completa verde; `pnpm test:e2e` verde; PR verde; §9.

### 5.3 · O16 — Editar un pedido antes del pago

Branch `phase/o16`. Maquinaria, plata y stock. La fase más delicada del plan; todo con la
fila bloqueada y dentro de una transacción.

**A. Dominio.** `src/domain/edit-order.ts`: `editPendingOrder({ orderId, actor, actorUserId,
items?: Array<{ orderItemId, qty }>, shipping?: { city, address, reference?,
shippingMethodId? }, reason })`. En **una** transacción:
1. `SELECT … FOR UPDATE` del pedido; rechazar (error de dominio propio en
   `src/domain/errors.ts`) si `status !== 'pendiente_pago'`, si `payment_method ===
   'tarjeta'`, o si hay un `payments` con `status = 'paid'`.
2. Ítems: cada `qty` es entero ≥ 0 y ≤ la cantidad actual (bajar o quitar; **nunca
   subir ni agregar**: eso es un pedido nuevo, y subir obligaría a re-validar stock contra
   reservas ajenas que este plan no quiere tocar). `qty = 0` borra la línea; el pedido no
   puede quedar sin líneas. `unit_price_pyg` **no cambia**. Las reservas de
   `stock_reservations` de esa línea bajan a la cantidad nueva (o se borran).
3. Envío: si viene `shipping`, re-cotizar con el mismo camino que el checkout
   (`src/domain/shipping.ts` / métodos de envío) con el subtotal nuevo; el método tiene
   que ser válido para la ciudad y compatible con el medio de pago (regla de ARCH.md
   "cómo se entrega decide con qué se paga"). Si no viene, se re-cotiza igual con la
   misma ciudad y método (el umbral de envío gratis puede haber cambiado de lado).
4. Cupón: si el pedido tenía uno, re-validar con el subtotal nuevo con la misma función
   que el checkout; si ya no aplica, `discount_pyg = 0`, `coupon_code` se conserva en
   `order_events` (motivo) pero se quita del pedido, y el resultado lo dice
   (`couponRemoved: true`). Los usos consumidos del cupón **no** se devuelven (decisión:
   simple y conservadora; anotar en ARCH.md).
5. Totales: recalcular subtotal, descuento, IVA por línea, envío y total con las mismas
   funciones de `create-order.ts` (extraerlas a una función pura compartida si hoy están
   inline; `money-path.test.ts` sigue verde). `reserved_until` **no cambia**.
6. Auditoría: fila en `order_events` con `from = to = 'pendiente_pago'`, `actor`,
   `actor_user_id`, y `reason` con prefijo constante `EDICION_PREFIX` ("edición: ") +
   resumen (líneas cambiadas, ciudad nueva, cupón quitado, total antes → después).
   `reconcile` gana la excepción en el `CASE` de `arista_imposible` (mismo mecanismo que
   la devolución parcial) **y** una invariante nueva: para todo pedido, `total_pyg` =
   Σ líneas − descuento + envío (si ya existe, verificar que cubre el pedido editado).
7. Devuelve el pedido re-leído (totales nuevos, líneas, envío, `couponRemoved`).

**B. Acción.** `editPendingOrderAction` en `src/app/actions/admin-orders.ts`, guard
`requireStaffSession` (staff y owner; `vendedor` no: ve montos que no puede ver).
Capability `pedidos.editar` en `permissions.ts` + matriz de ARCH.md §1. Schema Zod con
los mismos `.max()` que el checkout (ciudad, dirección, referencia). Filas en
`admin-guards.test.ts` y `atribucion.test.ts`. La acción devuelve además el texto
prearmado para WhatsApp ("tu pedido quedó en ₲X, pagá hasta las HH:MM: <link>") usando
`customerNoticeBody`-style helpers — sin plantilla nueva de Meta: el aviso lo manda el
staff a mano con el `wa.me` de siempre.

**C. Lectura.** `getAdminOrder` devuelve lo que S17 necesita para dibujar: si el pedido es
editable (`canEditPendingOrder(order)` en dominio, misma regla que el punto A.1) y por
qué no si no lo es (tarjeta / ya pagado / estado).

**D. Tests.** Integración: bajar una línea de 3 a 1 baja la reserva y el total; quitar la
única línea se rechaza; subir se rechaza; editar con tarjeta se rechaza; editar con pago
`paid` se rechaza; cambiar de ciudad re-cotiza y cambia `shipping_pyg`; cupón que deja de
aplicar se quita y `couponRemoved`; dos ediciones concurrentes (una gana, la otra ve el
estado nuevo); `reconcile` verde después de una edición y rojo si se fuerza un total
inconsistente; el `order_event` con el prefijo no sale como `arista_imposible`. Unitarios:
totales puros (extraídos), `admin-guards`, `atribucion`, `no-raw-status-update` (la
edición no escribe `status`), `i18n`.

**E. Docs.** ARCH.md: §1 matriz (`pedidos.editar`), §3 nota "editar no es transición",
§4/§5 cupón no devuelto. README: una línea en la tabla de `/admin/pedidos/[id]`.

**Salida O16:** `editPendingOrder` con las diez pruebas de integración de D verdes;
acción con guard y capability; `reconcile` con excepción e invariante; `getAdminOrder`
dice si es editable; docs; suite completa verde; `pnpm test:e2e` verde; PR verde; §9.

## 6. Fases Sonnet

### 6.1 · S17 — Panel y vidriera: dibujar lo que O14–O16 dejaron

Branch `phase/s17`. Piel del panel y arreglos de vidriera. Nada de dominio.

**Owns:** `src/components/admin/product-form.tsx`, `product-list.tsx`,
`product-filters.tsx`, `categories-manager.tsx`, `refund-form.tsx`,
`unmatched-payments.tsx`, `order-actions.tsx` (o un `edit-order-form.tsx` nuevo),
`src/app/admin/(panel)/pedidos/[id]/page.tsx`, `src/app/admin/(panel)/productos/**`,
`src/app/admin/(panel)/categorias/**`, `src/app/admin/error.tsx` (nuevo),
`src/app/categoria/[slug]/page.tsx`, `src/app/producto/[slug]/page.tsx` (sólo metadata),
`tests/e2e/panel.spec.ts`, `tests/e2e/productos.spec.ts`, `src/components/__tests__/**`.

**A. Destacados.** Toggle "Destacado en la home" en `product-form.tsx` (→ `isFeatured`),
chip en el listado, filtro "destacados" en `product-filters.tsx`. `data-testid` nuevos en
bloque `// == S17 ==`.

**B. Categorías.** `<input type="file">` real (mismo componente que `product-images.tsx`)
que llama a `uploadCategoryImage`; el formulario de edición prellena descripción, foto y
alt desde `listAdminCategories`; sacar el checkbox "Cambiar descripción o foto" y su
lógica (ya no hace falta: los valores actuales están).

**C. Reembolso parcial en la ficha.** `refund-form.tsx` se monta en `pedidos/[id]/page.tsx`
con `getPaymentForOrder` (owner-only, como hoy), con "ya devuelto" real. En
`unmatched-payments.tsx`, `refundedPyg` real en vez de 0.

**D. Editar pedido.** En `pedidos/[id]`: si `getAdminOrder` dice editable, botón "Editar
pedido" → formulario (cantidades por línea con "quitar", ciudad/dirección/referencia,
forma de entrega con la cotización que devuelve la acción, motivo obligatorio) → resumen
"total antes → después" y, si `couponRemoved`, el aviso. Botón "Avisar por WhatsApp" con
el texto prearmado que devuelve la acción. Si no es editable, el motivo en una línea
("con tarjeta no se edita: cancelá y rehacé"). Sólo `owner`/`staff` lo ven.

**E. Timeline.** Línea "Recordatorio de pago enviado el dd/mm HH:MM" en la ficha cuando
`payment_reminder_sent_at` no es NULL (viene de `getAdminOrder`; si O15 no lo expuso,
workaround: no dibujar + `KNOWN-ISSUES.md`).

**F. Vidriera.** `alternates.canonical` a la URL sin query en `categoria/[slug]` y
`producto/[slug]` (`siteOrigin()`; sin origen, no se emite — nada inventado). Paginación:
en los bordes, `<span aria-disabled>` con el estilo deshabilitado en vez de `<Link>`.
`src/app/admin/error.tsx`: mensaje del panel, botón reintentar, link a `/admin`.

**G. Tests.** e2e: marcar destacado y verlo en la home; editar un pedido de prueba (bajar
cantidad) y ver el total nuevo en la ficha y en `/pedido/...`. Render test (RTL) del
formulario de edición con `couponRemoved`. `testids-contrato` verde.

**Salida S17:** los siete puntos visibles y probados; capturas en el artifact de CI;
`pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` verdes; PR verde; §9.

### 6.2 · S18 — Kit de piel: tres temas y la pregunta en `nueva-tienda`

Branch `phase/s18`. Piel del template. Puede correr en paralelo con S17.

**Owns:** `src/styles/temas/**` (nuevo), `src/app/globals.css`, `src/components/site-header.tsx`,
`src/components/product-image.tsx`, `public/placeholders/**`, `scripts/nueva-tienda.ts`,
`tests/unit/nueva-tienda.test.ts`, `tests/unit/temas.test.ts` (nuevo), NEW-STORE.md §5,
`tests/e2e/capturas.spec.ts`.

**A. Temas.** `globals.css` deja de definir `:root`/`.dark` y pasa a
`@import "../styles/temas/neutro.css";` (los valores de hoy, byte a byte, se mueven ahí).
`calido.css` y `oscuro-vivo.css` según §1.4: los **mismos** tokens, todos definidos en los
dos bloques, más `--radius`. Cabecera de cada archivo: para quién es el tema, el par de
fuentes sugerido y las dos líneas de `layout.tsx` a cambiar. Test unitario: los tres
archivos definen exactamente el mismo conjunto de variables en `:root` y en `.dark`
(leer los `.css`, extraer `--nombre:`; una variable que falte en un tema es un botón
invisible en modo oscuro).

**B. Wizard.** `pnpm nueva-tienda` pregunta "¿Tema? (neutro / calido / oscuro-vivo)" y
acepta `--tema`; escribe la línea de `@import` en `globals.css` (idempotente, default el
actual). Sin TTY y sin bandera: `neutro`. Test.

**C. Barra de categorías.** Fade en el borde derecho (pseudo-elemento con
`mask-image`/gradiente sobre `--background`) que desaparece al llegar al final; sin JS
nuevo si se puede (`scroll-timeline` no: soporte). `data-testid` existentes intactos.

**D. Placeholders.** `product-image.tsx`: si la categoría no es una de las cuatro del seed,
placeholder genérico (uno solo, neutro, con el nombre de la categoría en texto) en vez de
caer al de "otros" o romper. Un SVG nuevo en `public/placeholders/`.

**E. Docs.** NEW-STORE.md §5: los tres temas, cómo se elige, cómo se crea un cuarto (copiar
`neutro.css`, cambiar valores, pasar el test), y que las fuentes siguen en `layout.tsx`.

**F. Capturas.** Una pasada de `capturas.spec.ts` por tema **no**: el kit se verifica con el
test unitario y con `pnpm build` de cada tema en local una vez (cambiar el `@import`,
build, volver). Anotar en §9 que los tres compilan.

**Salida S18:** tres temas que pasan el test de paridad; wizard con `--tema` y test;
fade en la barra; placeholder genérico; NEW-STORE.md §5; `pnpm typecheck && pnpm lint &&
pnpm test && pnpm test:e2e` verdes con `neutro` (la vidriera no cambia un píxel: las
capturas de CI lo confirman); PR verde; §9.

### 6.3 · S19 — Dependencias, DX, docs y reporte final

Branch `phase/s19`. Sólo con S17 y S18 mergeadas. Última fase.

**Owns:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `eslint.config.mjs`,
`vitest.config.mts`, `vitest.setup.ts`, `tsconfig.json`, `.husky/**`, `README.md`,
`NEW-STORE.md`, `ARCH.md`, `DEPLOY.md`, `CLAUDE.md`, `PLAN.md`, `KNOWN-ISSUES.md`,
`.env.example` (consistencia, sin variables nuevas), `fable/plan-crecimiento.md`. Más la
excepción de §4.7 para cambios mecánicos que una versión nueva exija.

**A. Dependencias, una por commit, suite entera entre medio.** Orden: menores de `pnpm
outdated` (un commit) → `lint-staged` afuera (G8) → `iron-session` 9 (leer su changelog:
si cambió la API de `getIronSession`/`sealData`, adaptar `src/lib/session.ts` y el de
cliente con el cambio mínimo; los tests de `auth`, `login-tokens`, `una-sola-cuenta` son
la red) → `vitest` 5 (config y `@vitejs/plugin-react` compatibles) → `eslint` 10 (sólo si
`eslint-config-next` 16.3.x lo soporta como peer; si no, §10) → `typescript` 7 con tope de
30 min (§1.5). Después de cada mayor: `pnpm typecheck && pnpm lint && pnpm test && pnpm
build && pnpm test:e2e`. Lo que no queda verde se revierte y va a §10 con el error
exacto. `pnpm audit` al final: cero high.

**B. Docs.** Cada ruta, comando, variable y archivo que nombren README, NEW-STORE, ARCH,
DEPLOY y CLAUDE tiene que existir (`grep` antes de cerrar). README: tabla de documentos
con `fable/plan-crecimiento.md` como historial y `fable/REVIEW.md` como la revisión vigente.
CLAUDE.md: el párrafo de planes al día. PLAN.md: la línea de estado. `KNOWN-ISSUES.md`:
borrar lo resuelto por S17/S18, promover lo abierto de §9.

**Salida S19:** dependencias al día con la suite verde en cada paso; `lint-staged` afuera;
docs consistentes; `fable/plan-crecimiento.md` marcado como historial; PR verde; §9; y el
reporte final de §11.

## 7. Entradas humanas

| Qué | Quién | Cuándo se necesita |
|---|---|---|
| Plantilla de Meta `CLIENTE_RECORDATORIO` aprobada, por tienda | Anton / el comercio | Después de O15, para que el recordatorio salga en producción. Sin ella, apagado. |
| `pnpm template:sync` en cada tienda hija (la migración `0013` viaja ahí) | Anton | Después de S19, o antes si una tienda quiere el recordatorio. |
| Elegir tema para las tiendas existentes (opcional) | Anton | Nunca obligatorio: `neutro` es byte a byte lo de hoy. |

## 8. Preguntas de negocio (aparcadas)

- SIFEN / FacturaPY: cuando una tienda con timbrado lo pida (REVIEW §5 P1).
- ¿Devolver los usos de un cupón cuando una edición lo quita? Hoy no (§5.3 A.4). Si un
  comercio se queja, es una regla de dominio de una línea.
- Email transaccional, multi-tenant, carritos abandonados, reseñas: siguen donde estaban.

## 9. Build log

*(Una entrada fechada por fase, escrita dentro del PR de la fase: id, PR, qué existe,
decisiones, desvíos, preguntas.)*

### O14 — Deuda de dominio + schema del plan · 2026-09-11 · `phase/o14`

**Qué existe.** `src/db/enums.ts` con los valores de enum que el navegador necesita, sin
`drizzle-orm` detrás; `schema.ts` los importa y re-exporta, así que ningún archivo de
servidor cambió un import. La migración `0013` agrega `orders.payment_reminder_sent_at`
(nullable, sin backfill), que es todo el schema de este plan. `saveProduct` acepta
`isFeatured` y `listAdminProducts` lo devuelve y lo filtra; `uploadCategoryImage` sube la
foto de una categoría de verdad (bytes validados, folder `categorias/`, borra el asset
anterior) y `listAdminCategories` trae descripción, foto y alt para prellenar el
formulario; `getPaymentForOrder(orderId)` devuelve el pago cobrado de cualquier pedido
—vivo o no— y `findUnmatchedPayments` trae el `refundedPyg` real; un `.xlsx` dañado sale
como `UnsupportedSpreadsheetError` en castellano; el slug de producto tiene `.max(160)`,
el largo exacto de la columna.

**Decisiones y desvíos.**

1. **La fuga de `drizzle-orm` al cliente no salía de los cuatro componentes que nombraba
   el plan.** Migrarlos a `@/db/enums` no movió el número: el chunk seguía ahí. El
   camino real era `src/lib/money.ts`, que importaba `IVA_RATES` de `@/db/schema` y es
   el `formatGs` que usan media docena de componentes cliente — tres números arrastraban
   el ORM a la home y al checkout. `IVA_RATES` también se mudó a `enums.ts`. Después de
   eso, cero chunks del cliente con `drizzle` adentro (verificado sobre `.next/static`).
2. **Techos de `presupuesto.spec.ts` bajados al valor medido**, no al anterior: home
   203.6 KB, producto 207.8 KB, checkout 202.5 KB (+10% ⇒ 224 / 229 / 223), contra
   ~220 KB de antes en home y checkout. Los ~17 KB que bajan son exactamente el chunk que
   `KNOWN-ISSUES.md` tenía documentado.
3. **El test de presupuesto de la página de producto medía 0.6 KB**, no 260: llegaba a la
   ficha navegando desde la home, así que los chunks compartidos ya estaban en el caché
   del navegador y `responseBodySize` volvía 0. Un techo que no podía fallar nunca. Ahora
   mide en una pestaña nueva —que además es el caso real: la compradora que entra por un
   link de WhatsApp no tiene nada cacheado—, y por eso su número aparece recién ahora.
4. **Sin índice compuesto nuevo** para la consulta del recordatorio (§2 lo dejaba
   opcional): `orders_reserved_until_idx` ya acota la ventana de 6 h a un puñado de filas,
   y un índice más es una escritura más en cada pedido. Si O15 mide lo contrario, es un
   cambio de una línea.
5. `uploadCategoryImage` quedó **owner-only** (`requireOwnerSession`), como el resto del
   ABM de categorías, y no `staff` como `uploadProductImage`: la foto de una categoría es
   la portada de una sección entera de la vidriera. No hizo falta capability nueva: es
   `categorias`, que ya existía.

**Entradas de `KNOWN-ISSUES.md` borradas (6):** `.xlsx` corrupto · destacado sin botón ·
foto de categoría por `public_id` · formulario de categoría sin prellenar · `@/db/schema`
en el bundle · reembolso parcial en 0. Quedan las dos que no le tocaban a esta fase
(MariaDB/`UNSIGNED` y el backup en un solo archivo).

**Preguntas para Anton.** Ninguna.

### O15 — Recordatorio de pago antes del vencimiento · 2026-09-11 · `phase/o15`

**Qué existe.** `src/domain/payment-reminders.ts` con `sendPaymentReminders(now)`: toma hasta
50 pedidos en `pendiente_pago` sin marca cuya reserva vence dentro de las próximas 6 h, marca
`orders.payment_reminder_sent_at` **antes** de mandar (`UPDATE … WHERE … IS NULL`, y sólo con
`affectedRows = 1` sale el mensaje) y devuelve `{ candidatos, enviados, fallidos }`. El aviso
es un `CustomerNoticeKind` más (`recordatorio`), con su plantilla
`WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RECORDATORIO` como único interruptor. `runMaintenance` lo
llama **después** de vencer pedidos, así que un pedido recién vencido nunca recibe un "podés
pagar hasta las…"; la ruta de `vencer-pedidos` devuelve y loguea los tres conteos. Preflight
avisa (advertencia, nunca bloqueo). Sin entrada nueva de cron en el hPanel.

**Decisiones y desvíos.**

1. **La idempotencia no usa `order_events`** como los otros tres avisos a la compradora, sino
   la columna de O14. El motivo es el disparador: los otros tres cuelgan de una transición que
   pasa una sola vez por pedido, y éste lo dispara un cron que corre cada 15 minutos. "Insertá
   la fila sólo si no existe" no es una sentencia; `UPDATE … WHERE … IS NULL` sí, y su
   `affectedRows` es la carrera ganada o perdida sin ambigüedad.
2. **`affectedRows` en vez del `UPDATE` + `SELECT` de confirmación** que usa `stock-alerts.ts`.
   Ese patrón tiene una ventana: dos corridas simultáneas pueden ver las dos la fila ya marcada
   y creer las dos que ganaron. Acá el header de mysql2 lo dice sin releer nada.
3. **La ventana se abre en `now`, no antes.** Un pedido cuya reserva ya venció es trabajo de
   `expireOverdueOrders`, que corrió un renglón más arriba en la misma corrida.
4. El texto lleva número, total, hora límite en Asunción y el link tokenizado — **ningún dato
   bancario**: ya están en la página del pedido, que es adonde apunta el link. Sin
   `reserved_until` (que no debería pasar: es la columna por la que se lo eligió) sale sin la
   línea del plazo antes que con una fecha inventada.
5. `tests/integration/cron-route.test.ts` esperaba el JSON exacto de la ruta: se le agregó
   `paymentReminders` con los tres ceros, que es lo que ve una tienda sin la plantilla.

**Preguntas para Anton.** Ninguna. Para que el recordatorio salga en producción falta la
plantilla de Meta (§7), que es trabajo suyo y del comercio.

### O16 — Editar un pedido antes del pago · 2026-09-11 · `phase/o16`

**Qué existe.** `src/domain/edit-order.ts` con `editPendingOrder`: en **una** transacción con
`SELECT … FOR UPDATE` del pedido baja o quita líneas, corrige ciudad/dirección/referencia,
re-cotiza el envío con el subtotal nuevo, re-valida el cupón, recalcula los totales con la
misma función que el checkout y deja la fila de auditoría. `canEditPendingOrder` es la misma
regla, exportada para que la pantalla dibuje el botón o el motivo; `getAdminOrder` la devuelve
ya resuelta. `editPendingOrderAction` (guard `requireStaffSession`, capability
`pedidos.editar`) devuelve además el texto prearmado de WhatsApp. `reconcile` reconoce el
prefijo `EDIT_ORDER_REASON_PREFIX` en el `CASE` de `arista_imposible`. Quince pruebas de
integración, las diez de §5.3 D incluidas.

**Decisiones y desvíos.**

1. **El cupón se re-valida sólo por el mínimo de compra, no con `validateCoupon` entero**, y
   es el desvío importante de esta fase. Correr `validateCoupon` sobre un pedido que ya tiene
   el cupón lo rechazaría por motivos que no tienen nada que ver con la edición — empezando
   por el uso que **ese mismo pedido** ya consumió (`times_used >= max_uses` ⇒ `agotado`), y
   siguiendo por la vigencia: un cupón que venció ayer sigue siendo legítimo en un pedido de
   anteayer. El resultado sería subirle el total a una compradora que sólo pidió mandar una
   remera menos. Lo que sí cambia con la edición es el mínimo de compra, y eso se re-chequea;
   el monto se recalcula siempre (un 10 % sobre otro subtotal es otro número). Escrito en
   ARCH.md §3 y en el módulo.
2. **La aritmética se extrajo a `sumOrderMoney`** (`order-totals.ts`), que antes estaba inline
   dentro de `computeOrderTotals`. Las dos la usan ahora: el checkout re-precia contra el
   catálogo, la edición conserva el `unit_price_pyg`, y la cuenta es literalmente la misma
   función. `money-path.test.ts` y los tests de `create-order` siguen verdes sin tocarse.
3. **La invariante de totales de `reconcile` ya existía** (`findTotalMismatches` verifica
   `subtotal = Σ líneas` **y** `total = subtotal − descuento + envío`), así que no se agregó
   una nueva: se agregó el test que prueba que cubre un pedido editado y que sigue atrapando
   un total forzado a mano.
4. **`reserved_until` no se toca.** Editar no le regala tiempo a nadie: extenderlo le
   bloquearía el stock al resto por más rato, y la edición no es un pago.
5. Sin método de envío pedido se conserva el del pedido; si ese método ya no aplica a la
   ciudad nueva, el error lo dice en vez de cobrar otro en silencio. Y se re-chequea que el
   método acepte el medio de pago del pedido (ARCH.md, "cómo se entrega decide con qué se
   paga"): cambiar de ciudad no puede dejar un contra entrega donde nadie va a ir a cobrar.
6. El aviso a la compradora lo manda **una persona** con el `wa.me` de siempre, con el texto
   que devuelve la acción. Sin plantilla de Meta nueva: una edición se acordó por WhatsApp
   hace un minuto y el mensaje que sigue no lo escribe el servidor.

**Preguntas para Anton.** Ninguna.

### S17 — Panel y vidriera: dibujar lo que O14–O16 dejaron · 2026-09-11 · `phase/s17`

**Qué existe.** Panel: toggle "Destacado en la home" + chip en el listado + filtro
`?destacados=1` (`product-form.tsx`, `product-list.tsx`, `product-filters.tsx`); foto de
categoría con `<input type="file">` real que llama a `uploadCategoryImage`, con el
formulario de edición prellenado desde `listAdminCategories` (se borró el checkbox "cambiar
descripción o foto", que ya no hace falta); reembolso parcial montado en la ficha del pedido
con `getPaymentForOrder` (owner-only) y `refundedPyg` real en "pagos sin pedido vivo";
`EditOrderForm` nuevo (`src/components/admin/edit-order-form.tsx`) — colapsado por default,
cantidades por línea con "Quitar", ciudad/dirección/referencia, forma de entrega, motivo
obligatorio, resumen "total antes → después" y "Avisar por WhatsApp", todo desde la respuesta
de `editPendingOrderAction`; línea de "Recordatorio de pago enviado" en el timeline cuando
`payment_reminder_sent_at` no es NULL. Vidriera: `alternates.canonical` en `categoria/[slug]`
y `producto/[slug]` (sólo con `siteOrigin()`); paginación de categoría con
`<span aria-disabled>` real en los bordes en vez de un `<Link disabled>` que seguía siendo
clickeable; `src/app/admin/error.tsx` nuevo con mensaje del panel, reintentar y link a
`/admin`.

**Decisiones y desvíos.**

1. **`saveProduct` no revalida la home** (`src/app/actions/admin-products.ts` sólo revalida
   `/admin/productos*`), a diferencia de `admin-categories.ts` (`revalidarVidriera()` llama
   `revalidatePath("/", "layout")`). Se descubrió escribiendo el e2e de destacados: con la
   home ya prerenderizada por `next build`, un producto nuevo no aparecía dentro de la
   ventana del test (ISR de 5 min). `src/app/actions/**` es límite duro de S17 — no se tocó.
   Entrada nueva en `KNOWN-ISSUES.md` con el diagnóstico y el arreglo (agregar el mismo
   `revalidatePath` a `saveProduct`/`bulkSetActive`/`bulkMoveCategory`/`duplicateProduct`,
   candidato a S19 o un PR aparte de maquinaria). El e2e de S17
   (`tests/e2e/productos.spec.ts`) verifica en cambio contra `/admin/productos?destacados=1`
   (`force-dynamic`, siempre fresco).
2. **Reembolso parcial y `refundedPyg` real tocaron dos archivos fuera del "Owns" formal**:
   `src/app/admin/(panel)/page.tsx` (una línea: pasar `payment.refundedPyg` real a
   `UnmatchedPayments`) y `src/app/pedido/[orderNumber]/page.tsx` (un `data-testid` nuevo en
   el `<dd>` del total, para que el e2e de edición lea el total de la compradora sin adivinar
   el markup). Los dos son piel/wiring de una línea, sin tocar dominio/lib/actions/api; se
   anotan acá porque el prompt de la fase no los listaba explícitamente.
3. **El cupón se re-valida sólo por el mínimo de compra** — decisión de O16, no de esta fase;
   repetido acá porque `EditOrderForm` lo muestra (`couponRemoved` + `removedCouponCode`).
4. **`EditOrderForm` arranca colapsado** (un botón "Editar pedido" que abre el formulario): la
   ficha ya tiene mucho para leer antes de llegar a la edición, que es la excepción y no lo
   primero que se hace al abrir un pedido pendiente de pago.
5. **Local sin Docker**: se instaló `mariadb-server` por `apt` (igual que S3/O6 en
   `fable/plan.md` §9) y se usaron bases propias (`ecom_s17`/`ecom_test_s17`, no
   `ecom`/`ecom_test`) porque S18 corría en paralelo contra la misma instancia de MariaDB
   compartida por el contenedor — sin esto, `pnpm test` con integración salía con decenas de
   fallos por FK rotas (dos corridas pisándose la misma base). Anotado por si el orquestador
   ve algo parecido en otra fase paralela.
6. **Un e2e existente (`Escape` para cerrar el carrito y agregar una segunda unidad) necesitaba
   esperar a que el `Sheet` (Radix) terminara de cerrar** antes de reabrirlo — reabrir mientras
   todavía animaba la salida dejaba el segundo click sin efecto visible. Se agregaron dos
   `expect(...).toBeVisible()/toBeHidden()` en `tests/e2e/panel.spec.ts` en vez de un
   `waitForTimeout` a ciegas.

**Suites verdes en local:** `pnpm typecheck && pnpm lint && pnpm test` (1527/1527, integración
incluida contra MariaDB 10.11) y `pnpm test:e2e` (28/28, con
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` apuntando al Chromium ya instalado del entorno).

**Preguntas para Anton.** Ninguna que bloquee. Sí una nota: el punto 1 (revalidación de la
home en `admin-products.ts`) conviene resolverlo pronto — hoy cualquier cambio de catálogo
(no sólo destacados: publicar, desactivar, cambiar precio) puede tardar hasta 5 minutos en
verse en la vidriera, y es una asimetría con categorías que ya está resuelta ahí.

### S18 — Kit de piel: tres temas y la pregunta en `nueva-tienda` · 2026-09-11 · `phase/s18`

**Qué existe.** `src/app/globals.css` deja de definir `:root`/`.dark` y pasa a
`@import "../styles/temas/neutro.css";` — los valores de hoy, movidos byte a byte, así que la
vidriera no cambia un píxel con `neutro` activo (verificado con la suite completa y
`capturas.spec.ts`, que siguen sin tocarse). `calido.css` (tierra/terracota, `--radius: 1rem`,
`Fraunces` + `Figtree` sugeridas) y `oscuro-vivo.css` (fondo oscuro **fijo** —`:root` y `.dark`
con los mismos valores—, acento saturado, `--radius: 0.25rem`, `Sora` + `Inter` sugeridas)
definen exactamente las mismas variables; `tests/unit/temas.test.ts` lo verifica leyendo los
tres `.css` (no confía en memoria) y también que cada uno documenta para quién es, las fuentes
y las dos líneas de `layout.tsx`. `pnpm nueva-tienda --tema <nombre>` (y la pregunta
interactiva "¿Tema?") reescribe el `@import` de forma idempotente; sin terminal y sin bandera,
el default es el tema que `globals.css` ya tenía (`neutro` si no tenía ninguno). La barra de
categorías del header tiene un fade CSS puro en el borde derecho (truco de "scroll shadows":
dos degradés con `background-attachment: local`/`scroll`, sin JS ni listeners, desaparece solo
al llegar al final del scroll y cuando no hay overflow no se ve nunca). `product-image.tsx`
muestra un SVG genérico nuevo (`public/placeholders/categoria.svg`) con el nombre de la
categoría en texto cuando la categoría no es una de las cuatro del seed, en vez de caer en el
mismo dibujo de "producto sin foto" sin decir de cuál se trata. NEW-STORE.md §5 documenta los
tres temas, cómo elegirlos y cómo crear un cuarto.

**Decisiones y desvíos.**

1. **El placeholder de categoría no pasa por `categoryPlaceholderSrc`** (`src/lib/images.ts`):
   ese archivo es `src/lib/**`, fuera de los límites duros de esta fase, y su fallback ya
   apuntaba a `generico.svg` (el de "producto", sin nombre) para cualquier categoría fuera del
   seed. `product-image.tsx` duplica —a propósito, documentado con un comentario que dice por
   qué— la lista de las cuatro categorías conocidas y decide localmente cuándo usar el SVG
   nuevo; `categoryPlaceholderSrc` no se tocó y sigue sirviendo a `recently-viewed.tsx` como
   antes. El nombre que se muestra sale de un slug-a-texto simple (`"hogar-y-cocina"` →
   `"Hogar y cocina"`), no de una prop nueva: los llamadores de `ProductImage` sólo pasan el
   slug, y agregarles un `categoryName` era tocar archivos fuera de los Owns de esta fase por
   una mejora cosmética menor.
2. **El fade no es un pseudo-elemento con `mask-image`** como sugería el prompt entre
   paréntesis, sino la técnica clásica de "scroll shadows" (dos `linear-gradient` sobre
   `--background`, uno con `background-attachment: local` pegado al final real del contenido y
   otro con `scroll` pegado al borde visible del contenedor). Se prefirió porque cumple la
   parte que sí es un requisito explícito del plan —"que desaparece al llegar al final"— sin
   JS: con un `::after` estático el fade queda siempre visible, tape o no algo de contenido.
   Efecto lateral bueno: en desktop, donde `max-w-6xl` casi nunca desborda, el degradé
   coincide consigo mismo desde el arranque y no se ve nunca, así que no hizo falta un
   `sm:hidden` aparte.
3. **`nueva-tienda --tema` agrega una séptima pregunta** al wizard existente (no un script
   separado): comparte el mismo `readline` y el mismo default-por-lo-que-ya-hay que las otras
   seis, así que "Enter, Enter, Enter…" sigue dejando todo como está, tema incluido.
4. **Los tres temas compilan.** Se cambió el `@import` a `calido.css`, corrió `pnpm build`
   completo (Turbopack, `next build`) sin errores; se repitió con `oscuro-vivo.css`; se volvió
   a dejar `neutro.css` como `@import` activo (`git diff -- src/app/globals.css` vacío después)
   antes de commitear.

**Preguntas para Anton.** Ninguna.

### S19 — Dependencias, DX, docs y reporte final · 2026-09-11 · `phase/s19`

**Qué existe.** Cuatro dependencias subidas, cada una en su propio commit con la suite
entera (`typecheck`, `lint`, `test`, `build`, `test:e2e`) verde entre medio: menores de
`pnpm outdated` (react/react-dom 19.3.0, @types/react(-dom) 19.3.0, zod 4.6.1, mysql2 3.24.4,
lucide-react 1.44.0, @playwright/test 1.63.0, @types/node 22.20.2); `lint-staged` afuera del
`package.json` (el hook ya era `pnpm typecheck && pnpm lint`, sin cablear nunca a
lint-staged); `iron-session` 8 → 9; `vitest` 4 → 5. `typescript` 7 y `eslint` 10 se
intentaron y se revirtieron dentro del tope de 30 minutos (abajo, con el error exacto).
`pnpm audit`: **0 high** (1 moderate, `esbuild` transitivo vía `drizzle-kit` →
`@esbuild-kit/esm-loader`, dev-only, ya en el backlog de `KNOWN-ISSUES.md`/§10 desde antes de
este plan). Docs: README con la tabla de documentos actualizada (`fable/plan-crecimiento.md`
como historial, `fable/REVIEW.md` como la revisión vigente); CLAUDE.md con el párrafo de
planes al día (esta ventana cerrada); `PLAN.md` ya tenía la línea de estado correcta, sin
cambios; `KNOWN-ISSUES.md` con las dos entradas nuevas de abajo y sin nada para borrar (ni
O14 ni S17/S18 dejaron algo que este PR resuelva: la única entrada que nació en S17 —
`saveProduct` no revalida la vidriera— sigue abierta porque su arreglo es
`src/app/actions/**`, fuera de los Owns de S19, y no lo exige ninguna dependencia nueva).

**Decisiones y desvíos.**

1. **`eslint` 10 se revirtió**: `eslint-config-next@16.3.4` declara el peer como
   `eslint: ">=9.0.0"` (sí lo acepta en el papel), pero la dependencia transitiva
   `eslint-plugin-react@7.37.5` no soporta la API nueva de ESLint 10 en runtime —
   `pnpm lint` tira `TypeError: Error while loading rule 'react/display-name':
   contextOrFilename.getFilename is not a function` (ESLint 10 saca `context.getFilename()`,
   que ese plugin todavía usa). No hay versión de `eslint-plugin-react` publicada que lo
   arregle todavía (viene atado a cuando `eslint-config-next` suba su propio bundle). Se
   revirtió sin tocar nada más — exactamente el caso que el plan preveía en §10.
2. **`typescript` 7 se revirtió**: `tsc --noEmit` pasa limpio con TS 7.0.2 (cero errores), pero
   `pnpm lint` no llega a correr — `typescript-eslint@8.69.0` tira en texto explícito:
   `typescript-eslint does not support TS 7.0. […] See also
   https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking
   typescript-eslint's support for TS >=7.1`. Es la librería misma la que dice que todavía no
   lo soporta, no un error ambiguo — nada que "adaptar". Revertido dentro de los primeros ~10
   minutos del intento (muy por debajo del tope de 30).
3. **`engines.node` subió a `">=22.13 <25"`** (era `">=20 <25"`): `iron-session` 9 es ESM-only
   y exige Node 22.13+ (aunque `require()` siga funcionando arriba de esa versión). El
   entorno de CI y de este build corre 22.22.2, adentro del rango nuevo.
4. **`getIronSession`/`sealData` no cambiaron de firma** para nuestro uso: v9 sigue aceptando
   `getIronSession<T>(cookieStore, options)` igual que v8. Los dos cambios de comportamiento
   del changelog de v9 (sessions no serializan más `lastSeen` como string; `session.user.id`
   vacío en la primera visita) son del `user`/`lastSeen` que trae el *template* por defecto de
   la librería — `AdminSession` y `CustomerSession` de este repo son tipos propios que no usan
   ninguno de los dos campos, así que `src/lib/session.ts` y `src/lib/customer-session.ts`
   quedaron sin tocar.
5. **`vitest` 5 no pidió ningún cambio de config**: `@vitejs/plugin-react` ya estaba en 6.1.1
   (peer `vite: "^8.0.0"`, el mismo rango que pide `vitest@5`), así que `vitest.config.mts` y
   `vitest.setup.ts` quedaron igual.
6. **Un e2e salió flaky una sola vez** (`panel.spec.ts` "editar un pedido", timeout de 15 s
   esperando la navegación del checkout en `confirmarPedido()`, ajeno a cualquier dependencia
   tocada) durante la corrida del commit de `iron-session`; el rerun inmediato dio 28/28
   limpio en 7.2 s. No se tocó ningún test — se anota acá para que quede en el registro y no
   se confunda con una regresión real si vuelve a aparecer.
7. **Sin backfill de docs nuevo**: se greppeó cada ruta, comando, variable y archivo que
   nombran README.md, NEW-STORE.md, ARCH.md, DEPLOY.md y CLAUDE.md contra el árbol actual —
   todos existen. No hizo falta corregir ninguna referencia.

**`pnpm audit`:** 0 `high`, 1 `moderate` (`esbuild` <=0.24.2 vía
`drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils`, dev-only — GHSA-67mh-4wv8-2f99).

**Preguntas para Anton.** Ninguna que bloquee. Dato para la próxima revisión: `typescript` 7
y `eslint` 10 quedaron afuera por falta de soporte de `typescript-eslint` y
`eslint-plugin-react`, no por nada de este repo — conviene reintentarlos recién cuando esas
dos librerías publiquen una versión que los declare soportados, no antes.

## 10. Backlog

- Backup por tabla + manifiesto (`KNOWN-ISSUES.md`), cuando una tienda se acerque al límite.
- Rate limit compartido (DB) el día que haya más de un proceso.
- `esbuild` transitivo vía `drizzle-kit` (dev-only).
- Suite local contra MySQL 8 (Docker) en vez de MariaDB, si la trampa `UNSIGNED` muerde
  otra vez.
- Agregar productos a un pedido existente (O16 sólo baja/quita).
- Repintar los tres managers del panel de 400+ líneas (REVIEW §3, descartado): sólo si una
  tienda pide repintar el panel.
- Lo que S19 no logre subir (`typescript` 7, `eslint` 10) con su error exacto — ver §9 S19 y
  `KNOWN-ISSUES.md`.

## 11. Cómo correrlo — dos ventanas

**Ventana 1 — Opus.** Sesión nueva de Opus, permisos en auto-accept, pegar:
`Read fable/prompts/opus-todo-crecimiento.md in this repo and execute it.`
Encadena O14 → O15 → O16 mergeando cada PR con CI verde completo. Termina con el reporte
de cierre de ventana y la línea para la ventana 2. No spawnea nada.

**Ventana 2 — Sonnet.** Sólo con O16 mergeada. Sesión nueva de Sonnet, auto-accept, pegar:
`Read fable/prompts/sonnet-todo-crecimiento.md in this repo and execute it.`
Encadena S17 → S18 → S19 (S17 y S18 pueden ir como dos subagentes Sonnet en paralelo,
skill `fable-directs-sonnet-builds`, patrón fan-out). Termina con el reporte final: tabla
de las seis fases con PR y fecha, lo abierto en `KNOWN-ISSUES.md` y §10, pasos manuales
(§7), y que este plan pasa a historial.

**Recuperación.** Si una ventana se corta: sesión nueva del **mismo modelo**, pegar el
prompt de la fase que quedó a medias (`Read fable/prompts/<fase>.md in this repo and
execute it.`); es re-ejecutable y retoma desde el primer criterio que no se cumpla. El
estado vive en §9 y en los PRs `phase/*`.

**Fable.** No vuelve hasta que S19 esté mergeada. Ahí, si Anton quiere, una revisión nueva
desde `fable/PROMPT.md`.
