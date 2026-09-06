# fable/plan-operacion.md — La tienda después del lanzamiento · plan para Opus y Sonnet

**Origen:** revisión de Fable 5.1 del 2026-09-05 sobre `main` con `fable/plan.md` (las cuatro
fases de endurecimiento + exceljs + métodos de envío + e2e por testid + avisos al cliente)
ya mergeado. Veredicto de esa revisión: la maquinaria está sana; lo que falta es **la vida
diaria del comercio después del lanzamiento** —seguimiento del envío, notas, remito, el
resumen de la mañana, copias de seguridad que corran solas— y que el template se cuide a sí
mismo (presupuesto de bundle, capturas, tiendas hijas al día).

Este plan **no reemplaza** `fable/plan.md` (que queda como historial) ni `PLAN.md`/`TASKS.md`.
Cuando las nueve fases estén mergeadas, este archivo pasa a ser historial también.

**Stack (locked):** Next.js 16 + Drizzle + Hostinger MySQL + Hostinger Node.js + Cloudinary.

**Cómo se corre:** **dos ventanas** (§11). Una de Opus que encadena O5→O8 y una de Sonnet
que encadena S9→S13, un PR por fase, mergeando cada uno con CI verde antes de arrancar el
siguiente. Los prompts por fase de `fable/prompts/` siguen existiendo: son lo que la ventana
encadenada lee en cada paso, y el plan B si una sesión se corta a mitad de camino.

| Fase | Modelo | Prompt | Branch | Secciones | Depende de |
|---|---|---|---|---|---|
| O5 | Opus | `fable/prompts/opus-5-schema-tracking-notas.md` | `phase/o5` | §5.1 | — |
| O6 | Opus | `fable/prompts/opus-6-resumen-diario-stock.md` | `phase/o6` | §5.2 | O5 mergeada |
| O7 | Opus | `fable/prompts/opus-7-plata-catalogo.md` | `phase/o7` | §5.3 | O6 mergeada |
| O8 | Opus | `fable/prompts/opus-8-backups-observabilidad.md` | `phase/o8` | §5.4 | O7 mergeada |
| S9 | Sonnet | `fable/prompts/sonnet-9-panel-pedidos.md` | `phase/s9` | §6.1 | O8 mergeada |
| S10 | Sonnet | `fable/prompts/sonnet-10-panel-productos.md` | `phase/s10` | §6.2 | O8 mergeada |
| S11 | Sonnet | `fable/prompts/sonnet-11-vidriera.md` | `phase/s11` | §6.3 | O8 mergeada |
| S12 | Sonnet | `fable/prompts/sonnet-12-ci-calidad.md` | `phase/s12` | §6.4 | S9, S10, S11 mergeadas |
| S13 | Sonnet | `fable/prompts/sonnet-13-template-docs.md` | `phase/s13` | §6.5 | S12 mergeada |

S9, S10 y S11 son independientes entre sí (archivos disjuntos, §4.9) y **pueden correr en
paralelo** en tres ventanas. Todo lo demás es secuencial. Fable no aparece en la tabla y no
va a aparecer (§4.8).

---

## 0. Lo que hay que tener en la cabeza (para todas las fases)

Estas son las cosas que, si se olvidan, producen un PR que parece bien y envenena las
fases siguientes. Cada prompt las repite en corto; acá está la versión con el porqué.

1. **El schema completo de este plan se escribe en O5, una sola vez.** Todas las columnas y
   tablas nuevas (§2) entran en **una** migración generada con `pnpm db:generate`. Las fases
   siguientes no agregan schema: si una cree que necesita una columna, es un error de
   planificación y se para (§4.4). Motivo: cada migración que llega después es un
   `template:sync` más para cada tienda hija, y una columna "para después" mal nombrada se
   queda para siempre.
2. **`transitionOrder` sigue siendo el único escritor de `orders.status`**
   (`tests/unit/no-raw-status-update.test.ts`). El tracking del envío se escribe *en la misma
   transacción* que la transición a `enviado`, no en un UPDATE aparte que puede quedar a
   medias. Una nota de pedido no es una transición: va a su propia tabla.
3. **Plata entera, en MySQL, con la fila bloqueada.** Reembolsos parciales y cambios de
   precio masivos se calculan con `BIGINT`, `Math.floor`/redondeo explícito, `FOR UPDATE`,
   y dejan una fila de auditoría por unidad afectada (como `stock_adjustments`). `pnpm
   reconcile` gana una invariante por cada cosa nueva que mueve plata. Sin excepción.
4. **Todo aviso saliente es "después del commit, sin `await` que demore, con timeout, y
   jamás falla la operación que lo disparó"** — exactamente el patrón de
   `src/domain/order-notifications.ts` (O2) y `order-customer-notifications.ts`. El resumen
   diario, el aviso de stock disponible y el aviso de backup fallido siguen ese patrón. Cada
   uno tiene su plantilla de Meta en `.env.example`; **vacía = apagado**, y
   `tests/unit/flags-apagados.test.ts` tiene que seguir verde: sin variables nuevas, la tienda
   es idéntica a hoy.
5. **Un cron es una función idempotente que puede correr dos veces seguidas.** Hostinger
   reintenta, un humano lo dispara a mano, dos entradas del hPanel apuntan a la misma URL.
   El resumen diario se manda **una vez por día calendario de Asunción** aunque el cron
   pegue tres veces; el backup no se solapa consigo mismo. Para eso existe `job_runs` (§2).
6. **Guards primero, fila en `permissions.ts` después** (regla escrita en ese archivo). Toda
   server action nueva declara su guard y aparece en `tests/unit/admin-guards.test.ts` en el
   mismo PR. Lo que mueve plata (reembolso parcial, precios masivos) es **owner**. Lo que es
   mostrador (nota, tracking, duplicar producto, marcar destacado) es **staff** o **todos**,
   según la matriz de ARCH.md §1, y se anota ahí.
7. **`actor` + `actor_user_id` en toda fila de auditoría nueva** (`order_notes`, `refunds`,
   `price_adjustments`): el texto histórico y la FK consultable, nullable, `ON DELETE SET
   NULL`. `tests/unit/atribucion.test.ts` los tiene que cubrir.
8. **i18n: las claves son el contrato.** Cada fase agrega sus strings en **un bloque propio
   al final** de `src/i18n/es-PY.ts`, con prefijo de la fase en el comentario
   (`// == S9 ==`). Nunca se reordena ni se edita un bloque ajeno. `tests/unit/i18n.test.ts`
   sigue verde. Lo mismo para `src/lib/testids.ts`: ids nuevos al final, en bloque propio,
   nunca se borra uno existente.
9. **Piel vs. maquinaria (CLAUDE.md).** Las fases Sonnet dibujan; las Opus deciden. Si un
   componente de piel necesita un dato que el dominio no expone, la fase Opus anterior
   tenía que exponerlo: se anota en §10, se hace un workaround visible (no un fetch
   inventado) y se sigue. Las fases Sonnet no tocan `src/domain/**`, `src/lib/**`,
   `src/db/**`, `src/app/actions/**`, `src/app/api/**` ni `src/proxy.ts`.
10. **El navegador nunca decide plata ni identidad.** El formulario "avisame cuando haya
    stock" manda variante + teléfono y nada más; el reembolso parcial manda `payment_id`
    + monto y el servidor re-lee el pago con la fila bloqueada; la acción masiva de precios
    manda ids + porcentaje y el servidor calcula cada precio nuevo.
11. **Sin dependencias nuevas de runtime salvo que el plan las nombre.** El markdown seguro
    es un parser propio de 80 líneas con tests de XSS, no una librería con su propio CSP. El
    backup es un dump en JS puro (no hay `mysqldump` en el slot de Hostinger). La medición
    de bundle es un spec de Playwright, no un plugin de webpack.
12. **CSP con nonce donde hay sesión o plata** (`src/proxy.ts`). Nada de lo nuevo agrega
    `'unsafe-inline'` ni un host externo al CSP. La página de impresión del remito es una
    ruta bajo `/admin` (con nonce) y su CSS de impresión va en `globals.css`
    (`@media print`), no inline.
13. **Tests que fijan la decisión, no que decoran.** Cada fase escribe al menos el test que
    haría fallar el PR si alguien "simplificara" la regla: el reembolso que supera el pago,
    el resumen que se manda dos veces, la nota que un `vendedor` inactivo intenta escribir,
    el markdown con `<script>`, el backup que se solapa.
14. **Migraciones y tiendas hijas.** O5 documenta en NEW-STORE.md § "Arreglos que aparecen
    después" que esta migración es de maquinaria y se trae con `pnpm template:sync`. Las
    columnas nuevas tienen default o son nullable: una tienda hija que sincroniza el código
    antes que la migración tiene que seguir andando (Drizzle con columna faltante en un
    `SELECT` explícito rompe — por eso las lecturas nuevas de columnas nuevas se hacen sólo
    donde la feature se usa, no en las consultas de siempre del catálogo).

---

## 1. Decisiones ya tomadas — no se reabren

1. Todo lo de `CLAUDE.md`, `README.md` §"Reglas no negociables" y `fable/plan.md` §1:
   maquinaria vs. piel, marca sólo en `src/config/tienda.ts`, variable vacía = feature
   apagada, migraciones commiteadas, `pnpm typecheck && pnpm lint && pnpm test` antes de dar
   por terminado, merge sólo con CI verde **completo** (`checks` + `e2e`).
2. **Un solo canal saliente: WhatsApp Cloud vía el `MessageSender` existente.** No entra
   email transaccional en este plan (sigue aparcado en `fable/plan.md` §8).
3. **Sin Sentry ni SDK de terceros para errores.** Observabilidad = logger JSON propio con
   id de request + `instrumentation.ts` `onRequestError` que, si `ERROR_REPORT_URL` está
   configurada, hace un POST con el error (sin secretos, sin datos de compradoras). Vacía =
   sólo log.
4. **Backups desde adentro de la app**, a Cloudinary (`resource_type: raw`, folder
   `backups/` bajo `CLOUDINARY_FOLDER_PREFIX`, `type: authenticated`), disparados por una
   ruta de cron con secreto. `pnpm backup` (mysqldump desde la máquina de Anton) sigue
   existiendo y se documenta como el camino "grande".
5. **Reembolso parcial = fila en `refunds` + `payments.refunded_pyg` acumulado.**
   `payments.status` pasa a `refunded` sólo cuando `refunded_pyg = amount_pyg`. El estado
   del pedido **no cambia** por un reembolso parcial. La transición `→ reembolsado` que ya
   existe sigue siendo la del reembolso total.
6. **Precios masivos: porcentaje entero, redondeo a ₲100 por defecto** (opción ₲1.000),
   nunca a ₲0, `compare_at_pyg` no se toca, una fila de `price_adjustments` por variante,
   owner-only.
7. **Lighthouse en CI es advertencia, no bloqueo.** El presupuesto de JS del producto
   (ARCH.md §6: < 120 KB gz) sí bloquea, medido con Playwright sobre `next start`.
8. **Capturas de pantalla viven en el artifact de CI, nunca en git.**
9. Idioma: código e identificadores en inglés; comentarios, docs, commits y UI en español
   rioplatense/paraguayo (voseo). Comentarios que explican el modo de falla que evitan.
10. Las tres fases Sonnet del panel/vidriera (S9–S11) pueden correr en paralelo; los
    conflictos de merge previsibles (`es-PY.ts`, `testids.ts`) se resuelven **conservando
    los dos bloques**, nunca reordenando.

## 2. Schema — el contrato de O5 (completo, no se retoca después)

Todo en **una** migración `drizzle/0012_*.sql` generada por `pnpm db:generate`, más lo que
haga falta en `src/db/extras.ts` (FKs que drizzle-kit no arma solo, como ya pasa con
`categories.parent_id`).

| Tabla / columna | Tipo | Para qué | Fase que lo usa |
|---|---|---|---|
| `orders.tracking_carrier` | `varchar(80)` NULL | Nombre del courier / "moto propia" | O5, S9 |
| `orders.tracking_code` | `varchar(120)` NULL | Número de guía | O5, S9 |
| `orders.tracking_url` | `varchar(500)` NULL | Link de seguimiento, opcional, sólo `https://` | O5, S9 |
| `order_notes` | `id`, `order_id` FK cascade, `body` `varchar(1000)`, `actor` `varchar(120)`, `actor_user_id` FK `users` SET NULL, `created_at`; índice `(order_id, created_at)` | Notas internas del panel; nunca se ven en la vidriera | O5, S9 |
| `variants.reorder_point` | `int unsigned` NULL | Umbral de "stock bajo" por variante; NULL = default global (3) | O6, S10 |
| `stock_alerts` | `id`, `variant_id` FK cascade, `phone` `varchar(20)`, `created_at`, `notified_at` NULL; `UNIQUE(variant_id, phone)`; índice `(variant_id, notified_at)` | "Avisame cuando haya stock" | O6, S11 |
| `products.is_featured` | `boolean` NOT NULL default `false`; índice `(is_featured, published_at)` | Destacados de la home elegidos por el comercio | O7, S10, S11 |
| `categories.description` | `text` NULL | Texto SEO de la página de categoría | O7, S10, S11 |
| `categories.image_cloudinary_id` | `varchar(255)` NULL | Foto de la categoría (folder `categorias/`) | O7, S10, S11 |
| `categories.image_alt` | `varchar(200)` NULL | Alt de esa foto | O7, S10, S11 |
| `refunds` | `id`, `payment_id` FK cascade, `amount_pyg` `BIGINT UNSIGNED`, `reason` `varchar(500)`, `actor`, `actor_user_id` FK SET NULL, `created_at`; índice `(payment_id)` | Ledger de devoluciones (totales y parciales) | O7 |
| `payments.refunded_pyg` | `BIGINT UNSIGNED` NOT NULL default 0 | Acumulado; siempre `= Σ refunds` y `≤ amount_pyg` | O7 |
| `price_adjustments` | `id`, `variant_id` FK cascade, `from_pyg`, `to_pyg` `BIGINT UNSIGNED`, `reason` `varchar(500)`, `actor`, `actor_user_id` FK SET NULL, `created_at`; índice `(variant_id, created_at)` | Auditoría de cambios de precio (masivos y, si O7 llega, del formulario) | O7 |
| `job_runs` | `job` `varchar(60)` PK, `started_at`, `finished_at` NULL, `last_ok_at` NULL, `last_error` `varchar(500)` NULL, `payload` `json` NULL | Idempotencia y lock de crons (`resumen_diario`, `backup`) | O6, O8 |

**Backfill:** ninguno. `payments.refunded_pyg` arranca en 0 para todas las filas; los
pagos que hoy están `refunded` (devolución total de antes de este plan) se **backfillean
en la migración** con `refunded_pyg = amount_pyg` y una fila en `refunds` con
`actor = 'migracion'` y `reason = 'devolución registrada antes del ledger'` — si no, la
invariante nueva de `reconcile` se pone roja el primer día en toda tienda con una devolución
histórica. Es la única excepción a "sin backfill" y va escrita en la migración a mano, con
su test de integración.

## 3. Alcance

Veintiuna ideas de la revisión, agrupadas en nueve PRs. Fuera de alcance: cualquier cosa
que no esté acá (ideas → §10). En particular **no** entra: email, multi-tenant, carritos
abandonados, reseñas, wishlist, FacturaPY, rutas por locale (siguen en PLAN.md FASE 3).

**Operación del comercio (O5, O6, O8, S9):** tracking del envío en la transición a
`enviado` y en el aviso ENVIADO a la compradora · notas internas por pedido, visibles en el
feed de actividad · remito imprimible · resumen diario al dueño por WhatsApp
(comprobantes por revisar, pedidos sin pagar hace más de un día, stock bajo, ventas de ayer)
· punto de reposición por variante · backups programados con retención y aviso si fallan.

**Productividad del panel (O7, S10):** duplicar producto · acciones masivas sobre
productos (activar, desactivar, mover de categoría, ajustar precio por porcentaje con
auditoría) · descripción con markdown seguro · reembolso parcial con ledger · categorías
con foto y descripción · destacados elegidos a mano.

**Vidriera (O6, O7, S11):** "avisame cuando haya stock" por WhatsApp · vistos
recientemente (sólo cliente) · destacados en la home · página de categoría con foto y
texto · link "consultar por WhatsApp" por variante con el texto prearmado.

**Confiabilidad (O8, S12):** logger JSON con id de request · `onRequestError` con reporte
opcional por webhook · `/api/version` con el SHA del build, con secreto · presupuesto de
bundle en CI (bloquea) · Lighthouse en CI (advierte) · capturas por PR como artifact ·
render tests de componentes del panel.

**Ciclo de vida del template (S13):** workflow semanal en la tienda hija que abre un issue
con los commits de maquinaria pendientes · docs al día (NEW-STORE, ARCH, README,
DEPLOY, `.env.example`) · reporte final.

## 4. Protocolo de autonomía (va en cada prompt)

1. Trabajá hasta que **todos** los criterios de salida de la fase pasen. No pidas permiso
   para trabajo que está en el plan.
2. **Un PR por fase.** Branch `phase/<id>` desde `main` actualizado. Abrí el PR, mirá el
   CI (`checks` + `e2e`, y `lighthouse` desde S12), arreglá lo rojo. Con CI verde
   **completo**, **mergeá vos** (squash, con la herramienta de GitHub de la sesión) y
   seguí con la fase siguiente de tu ventana. Nunca mergeás con algo rojo ni con un job
   todavía corriendo: esperá. Si al arrancar ves que la fase anterior de la tabla tiene el
   PR abierto y sin mergear, **pará y decilo**: no se apila sobre una fase sin mergear.
3. Problemas menores que no bloquean → `KNOWN-ISSUES.md`, y seguí.
4. **Pará y preguntá sólo por**: una credencial que falta y no tiene fallback, o una
   decisión de cimientos (schema fuera de §2, auth, plata, transiciones) donde adivinar mal
   obliga a reescribir. Todo lo demás: elegí razonablemente, anotalo en el build log (§9),
   seguí. "Preguntar" = escribir la pregunta al final del reporte de cierre; Anton contesta
   en la ventana siguiente.
5. Un valor de entorno que falta nunca bloquea: documentalo en `.env.example`, degradá.
6. Cada prompt es **re-ejecutable**: primero mirá qué hay en la branch, seguí desde el
   primer criterio de salida que no se cumpla. Commit cada 30 minutos de trabajo.
7. **Límites duros de las fases Sonnet (S9–S13):** no tocan `src/domain/**`, `src/lib/**`,
   `src/db/**`, `src/app/actions/**`, `src/app/api/**`, `src/proxy.ts` ni `drizzle/`. Si algo
   de ahí parece necesario: workaround visible + nota en §10, no cambio. Excepción explícita:
   S12 puede tocar `.github/workflows/**`, `playwright.config.ts`, `tests/**`, `scripts/**`.
8. **Guardarraíl de costo:** Fable (`claude-fable-5*`, cualquier Mythos) **nunca** ejecuta
   una fase, un subagente ni una sesión hija. Sólo Opus y Sonnet. Si una sesión cree que
   necesita Fable, para y le pregunta a Anton con el motivo.
9. **Propiedad de archivos.** Cada prompt lista lo que la fase puede crear o modificar
   ("Owns"). Fuera de eso: sólo el bloque propio al final de `src/i18n/es-PY.ts` y de
   `src/lib/testids.ts`, la entrada propia de §9, `KNOWN-ISSUES.md` y `.env.example`. En un
   conflicto al traer `main`: `main` gana, re-aplicás lo tuyo encima, volvés a correr todo.
10. **Reporte de cierre de fase** (en el chat, corto, antes de pasar a la siguiente): (a)
    link al PR mergeado, (b) qué existe ahora en 5–10 líneas, (c) decisiones y desvíos,
    (d) preguntas para Anton, si hay. Lo mismo, condensado, va como entrada fechada en §9
    **dentro del PR**. Al terminar la última fase de la ventana, un reporte de cierre de la
    ventana: tabla de fases con PR, lo abierto en `KNOWN-ISSUES.md` y §10, pasos manuales.
11. **Auditoría pre-cierre**: antes del reporte, volvé a correr `pnpm typecheck && pnpm lint
    && pnpm test` sobre tu branch con `main` ya traído, y releé tu propio diff como
    adversario una vez. Arreglá lo que aparezca en un commit. Una sola vuelta: el resto va
    a `KNOWN-ISSUES.md`.
12. **Tope de pulido:** una pasada de capturas (si la fase dibuja algo), un Lighthouse (sólo
    S12), el cuerpo del PR escrito una vez (≤ 25 líneas). Cuando los criterios de salida
    pasan, abrís el PR **en ese mismo turno**. Ideas que aparecen después → §10.

## 5. Fases Opus

### 5.1 · O5 — Schema completo + tracking del envío + notas del pedido

Branch `phase/o5`. Maquinaria. La fase que **define el contrato** (§2): todo lo que sigue
lee columnas que se crean acá.

**A. Schema y migración.** Todas las filas de la tabla de §2, en `src/db/schema.ts`, con
comentarios que expliquen el modo de falla que evita cada una (como el resto del archivo).
`pnpm db:generate` → una migración. FKs que drizzle-kit no arme → `src/db/extras.ts` +
`scripts/post-push.ts` (mirar cómo está hecho `categories.parent_id`). El backfill de
`refunds`/`payments.refunded_pyg` de §2 va en esta migración, a mano, con un test de
integración que inserta un pago `refunded` viejo, corre la migración y verifica la fila.
`pnpm db:push` y `POST /api/setup/init` tienen que aplicarla (revisar
`tests/integration/setup-route.test.ts`). CI de drift verde.

**B. Tracking.** `transitionOrder` (`src/domain/orders.ts`) acepta en `TransitionOptions`
un `tracking?: { carrier?: string; code?: string; url?: string }` que **sólo** se acepta
cuando `to === 'enviado'` (otro destino con tracking ⇒ `InvalidTransitionError` o un error
de dominio propio en `src/domain/errors.ts`); se escribe en `orders` en la **misma
transacción** que el cambio de estado. Validación en `src/lib/schemas.ts`: carrier ≤ 80,
code ≤ 120, url `https://` ≤ 500, todo opcional y trimmed. `advanceOrder`
(`src/app/actions/admin-orders.ts`) lo recibe y lo pasa; el guard no cambia (los tres roles
despachan). `getAdminOrder` y la consulta de `/pedido/[orderNumber]` (`src/db/queries.ts` o
donde viva) devuelven los tres campos. `customerNoticeBody('enviado', …)` incluye
courier + guía (+ link) cuando existen; sin tracking, el texto de hoy. Clave i18n nueva
para esa línea.

**C. Notas.** `src/domain/order-notes.ts`: `addOrderNote({ orderId, body, actor,
actorUserId })` y `listOrderNotes(orderId)`. Body 1..1000, trimmed; el pedido tiene que
existir; el usuario tiene que estar activo (el guard ya lo garantiza, pero el dominio
re-lee — es la misma regla que `admin-users`). Server action `addOrderNote` en
`src/app/actions/admin-orders.ts` con `requireAdminSession` (los tres roles: una nota es
mostrador). Capability nueva `pedidos.notas` en `permissions.ts` para los tres roles. El
feed de `/admin/actividad` (`src/domain/admin-activity.ts`) suma `nota` como tercer origen
del `UNION ALL` (tipo, id, fecha) — mismo desempate por `id`, mismos filtros por persona y
fecha; `ACTIVITY_KINDS` gana `'nota'`. `listOrderNotes` se expone donde S9 la va a leer
(la page de `/admin/pedidos/[id]` es de S9; O5 sólo deja la función).

**D. Tests.** Integración: transición a `enviado` con tracking escribe las tres columnas
atómicamente (simular fallo después del UPDATE de status y verificar rollback); tracking
en una transición que no es `enviado` se rechaza; nota de 1001 caracteres se rechaza;
nota de usuario desactivado se rechaza en dominio; el feed pagina bien con 3 orígenes
mezclados (repetir el caso "300 eventos + 3 ajustes" con notas). Unitarios:
`admin-guards`, `atribucion`, `no-raw-status-update`, `flags-apagados`, `i18n` verdes;
texto del aviso ENVIADO con y sin tracking.

**E. Docs.** ARCH.md §2 (ERD y "Columnas de la compra que no son plata") y §3 (tracking en
la arista a `enviado`), §1 matriz (`pedidos.notas`). NEW-STORE.md § "Arreglos que aparecen
después": esta migración es maquinaria; cómo traerla con `pnpm template:sync`.

**Salida O5:** migración `0012` generada y commiteada, CI de drift verde;
`transitionOrder` con tracking atómico y test de rollback; `order_notes` con acción,
guard y capability; el feed muestra notas; `pnpm typecheck && pnpm lint && pnpm test`
verde (integración incluida); `pnpm test:e2e` verde en local; PR abierto con CI completo
verde; §9 con la entrada de O5.

### 5.2 · O6 — Resumen diario, punto de reposición, "avisame cuando haya stock"

Branch `phase/o6`. Maquinaria + mensajería. Reusa `src/domain/messaging/` y el patrón de
`order-notifications.ts`.

**A. Cron auth compartido.** Extraer de `src/app/api/cron/vencer-pedidos/route.ts` la
verificación del secreto (503 sin secreto, rate limit, `timingSafeEqual`, `Bearer` o
`?secret=`) a `src/lib/cron-auth.ts` y usarla desde las dos rutas de cron (esta y la de
O8) y desde `/api/version` (O8). La ruta existente no cambia de comportamiento:
`tests/integration/cron-route.test.ts` sigue verde sin tocarlo.

**B. `job_runs`.** `src/domain/job-runs.ts`: `claimJob(job, { onceEvery: 'dia' | null })`
que en **una** transacción con `SELECT … FOR UPDATE` (o `INSERT … ON DUPLICATE KEY UPDATE`)
decide si esta corrida corre: para `resumen_diario`, sólo si `last_ok_at` no es del día de
hoy en `America/Asuncion` (usar `src/lib/py.ts` para la fecha); para `backup`, sólo si no
hay una corrida `started_at` sin `finished_at` de hace menos de N minutos (lock con
expiración, porque un proceso que muere no libera). `finishJob(job, { ok, error, payload
})`. Test de concurrencia: dos `claimJob` simultáneos, uno gana.

**C. Resumen diario.** `src/domain/daily-digest.ts`: `buildDailyDigest()` devuelve un
objeto (no texto) con: comprobantes `pending` (`countAwaitingVerification`), pedidos en
`pendiente_pago`/`esperando_verificacion` de más de 24 h, variantes bajo su punto de
reposición (`lowStockVariants` extendido para usar `variants.reorder_point ?? 3` **por
variante**, con SQL `COALESCE`), ventas de ayer en Gs (`salesTrend` o
`getDashboardSummary`, día calendario de Asunción). `digestBody(digest)` arma el texto
(una línea por sección; secciones vacías se omiten; si todo está vacío, "Sin novedades"
y **igual se manda**, para que el dueño sepa que el cron vive). Envío por
`resolveMessageSender()` a `WHATSAPP_NUMBER` con plantilla
`WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO`; sin plantilla o sin número ⇒ apagado (en dev,
consola). Ruta `src/app/api/cron/resumen-diario/route.ts` (GET y POST): auth de A, `claimJob`
de B, arma, manda, `finishJob`. Respuesta sólo con cantidades. Preflight: advertencia si la
plantilla falta ("el dueño no recibe el resumen diario").

**D. Punto de reposición.** `saveVariant` acepta `reorderPoint: number | null` (entero
≥ 0, ≤ 100000), schema Zod, acción existente. `lowStockVariants` ya cambió en C. El
resumen de `/admin` (`getDashboardSummary`) usa el mismo criterio por variante. El campo
en el formulario es de S10.

**E. Avisame cuando haya stock.** `src/domain/stock-alerts.ts`: `stockAlertsEnabled()`
(= sender disponible **y** `WHATSAPP_CLOUD_TEMPLATE_STOCK_DISPONIBLE`), `subscribe({
variantId, phone })` (variante activa y **sin** disponibilidad —si hay stock, se rechaza
con error de dominio—; teléfono `+5959…` con el mismo validador del checkout;
`INSERT IGNORE` sobre el `UNIQUE`), `notifyBackInStock(variantId)` que toma hasta 50
suscripciones con `notified_at IS NULL`, las marca **primero** (`UPDATE … WHERE
notified_at IS NULL` + lectura de confirmación, como `login-tokens`) y después manda una
por una con timeout; la que falla queda marcada igual (no reintentamos spam) y se loguea
la cantidad. Server action pública `subscribeStockAlert` en
`src/app/actions/stock-alerts.ts`: rate limit por IP (5 / 15 min) y por teléfono (3 /
día), respuesta genérica sin decir si ya estaba. Disparo: en `adjustStock` y en toda
escritura que suba `on_hand` (revisar `catalog-import`), **después del commit**, `void
notifyBackInStock(id).catch(log)` sólo si la disponibilidad pasó de 0 a > 0. Barrido: el
cron de C, después del resumen, recorre variantes con suscripciones pendientes y
disponibilidad > 0 (cubre el caso de reserva vencida que liberó stock sin ajuste). Purga:
`runMaintenance` borra suscripciones notificadas hace más de 90 días. `.env.example`:
plantilla nueva, con la explicación de siempre (un parámetro en el cuerpo). Preflight:
nada (es opcional de verdad).

**F. Tests.** Integración: `claimJob` idempotente por día y lock del backup; resumen con
datos sembrados produce las cuatro secciones; sender que tira ⇒ la ruta responde 200 con
`sent:false` y `job_runs.last_error`; `subscribe` con stock disponible se rechaza; ajuste
0→5 dispara la notificación una sola vez aunque se ajuste dos veces; rate limit del
formulario. Unitarios: texto del resumen (formato de Gs, sin datos de compradoras más allá
del nombre y el número de pedido), `flags-apagados`, `admin-guards`, `cron-auth`.

**G. Docs.** DEPLOY.md: la segunda entrada de cron del hPanel (diaria, 08:00 Asunción =
`11:00 UTC` en invierno —verificar el offset vigente—, `curl` con `Bearer`). NEW-STORE.md
§4c: dos plantillas más para pedirle a Meta. ARCH.md §5: tres líneas por aviso nuevo.

**Salida O6:** las dos rutas de cron comparten auth; `resumen_diario` es idempotente por
día (test); resumen apagado sin plantilla y `flags-apagados` verde; `reorder_point` se
guarda y `lowStockVariants` lo respeta; `stock_alerts` completo con rate limit y disparo
post-commit; suite completa verde; `pnpm test:e2e` verde; PR abierto verde; §9.

### 5.3 · O7 — Plata y catálogo: reembolso parcial, precios masivos, duplicar, markdown, destacados, categorías

Branch `phase/o7`. Maquinaria. Deja las acciones que S10 y S11 van a dibujar.

**A. Reembolso parcial.** `refundPayment` (`src/domain/payment-recovery.ts`) acepta
`amountPyg` (entero > 0). En una transacción: `SELECT … FOR UPDATE` del pago; rechazar si
`status !== 'paid'` (un `pending`/`failed` no tiene plata que devolver) o si
`refunded_pyg + amountPyg > amount_pyg`; insertar en `refunds`; `UPDATE payments SET
refunded_pyg = refunded_pyg + ?`; si queda `refunded_pyg = amount_pyg`, `status =
'refunded'` **y** la transición de pedido que hoy hace el reembolso total (mirar qué hace
hoy `refundPayment` con `transitionOrder` y conservarlo exactamente para el caso total).
Un parcial **no** transiciona el pedido y deja un `order_event` con `from = to = status
actual` y `reason = 'devolución parcial ₲X: motivo'` — verificar que `reconcile` no lo
marque como `arista_imposible`; si lo hace, la regla correcta es ajustar la invariante
para permitir `from = to` con ese prefijo de motivo, no dejar de escribir el evento.
Acción `refundPaymentAction` (owner) gana `amountPyg` opcional = total. `reconcile`
(`src/domain/reconciliation.ts`) gana dos invariantes: `payments.refunded_pyg = Σ
refunds.amount_pyg` y `refunded_pyg ≤ amount_pyg`, más `status = 'refunded' ⇔
refunded_pyg = amount_pyg`. `findUnmatchedPayments` / `listOrdersToRecover`: revisar que
un pago parcialmente devuelto no aparezca como "plata colgada".

**B. Precios masivos y acciones masivas.** `src/domain/admin-bulk.ts`:
- `bulkSetActive(productIds, isActive)`, `bulkMoveCategory(productIds, categoryId)` —
  staff (`productos`). Categoría tiene que existir y estar activa. Máximo 500 ids por
  llamada. Todo en una transacción.
- `bulkAdjustPrices({ variantIds | productIds, percent, roundTo: 100 | 1000, reason })` —
  **owner**, capability nueva `precios.masivo`. `percent` entero en `[-90, 500]`. Por
  variante, con la fila bloqueada: `to = round(from * (100 + percent) / 100 / roundTo) *
  roundTo` en enteros (multiplicar antes de dividir, `Math.round` sobre el cociente
  entero — escribir el test con 12.345 × +10 % → 13.600 y con 990 × −90 % → 100, nunca 0);
  si `to < roundTo`, `to = roundTo`. Una fila en `price_adjustments` por variante,
  `from ≠ to` solamente. Devuelve cuántas cambió y la suma de diferencias. `reason`
  obligatorio ≥ 5 caracteres, como los reembolsos.
- Acciones en `src/app/actions/admin-products.ts` con guards y filas en
  `admin-guards.test.ts` y `atribucion.test.ts`. `permissions.ts` + ARCH.md §1 matriz.

**C. Duplicar producto.** `duplicateProduct(productId)` (staff): copia `products` con
`name = "<nombre> (copia)"`, slug único (`src/lib/slug.ts` + sufijo), `is_active = false`,
`published_at = NULL`, `is_featured = false`; copia variantes con `sku = "<sku>-COPIA"`
(+ `-2`, `-3` si choca), `on_hand = 0`, mismo precio; **no** copia imágenes (borrar una
imagen destruye el asset en Cloudinary — `deleteProductImage` — y dos productos apuntando
al mismo `public_id` dejan al otro roto; anotarlo en el comentario). Devuelve el id nuevo.

**D. Markdown seguro.** `src/lib/markdown.ts`, sin dependencias: `renderMarkdown(text):
string` (HTML) y `markdownToText(text): string` (para meta description y JSON-LD).
Subconjunto: párrafos, `**negrita**`, `*cursiva*`, listas con `- `, saltos de línea,
links `[texto](https://…)` sólo `https://` y con `rel="nofollow noopener"`. **Todo el
input se escapa primero** (`<`, `>`, `&`, `"`); no se acepta HTML crudo, ni `javascript:`,
ni imágenes. Tests con la lista de payloads de XSS de siempre (`<script>`, `<img
onerror>`, `[x](javascript:…)`, entidades dobles, `&lt;script&gt;`). El render en la
página de producto es de S11; `generateMetadata` de producto pasa a usar
`markdownToText` **acá** (es `src/app/producto`, pero es el único sitio donde una
descripción con `**` rompería el `<meta>` hoy; O7 lo toca y S11 no lo pisa).

**E. Destacados y categorías.** `updateProduct` acepta `isFeatured`; `getCatalog`
(`src/db/queries.ts`) acepta `{ featured: true }`; función `getFeaturedProducts(limit)`
que devuelve destacados y, si no hay ninguno, los más nuevos (= la home de hoy; test).
`admin-categories`: `description`, `imageCloudinaryId`, `imageAlt` en el schema Zod y en
`createCategory`/`updateCategory`; subida de la foto con el mismo helper que las fotos de
producto, folder `categorias/` bajo el prefijo (`tests/unit/cloudinary-folders.test.ts`).
`getCategories`/`getCategoryBySlug` devuelven los tres campos.

**F. Tests.** Integración: reembolso parcial dos veces hasta el total ⇒ `status =
'refunded'` y pedido transicionado igual que hoy; un parcial que excede ⇒ rechazado y sin
fila; `reconcile` verde después de parciales y rojo si se inserta a mano un `refunded_pyg`
mayor; precios masivos con los dos casos de redondeo y la auditoría; duplicar con SKU en
conflicto; `getFeaturedProducts` sin destacados = más nuevos. Unitarios: markdown (XSS),
`admin-guards`, `atribucion`, `flags-apagados`.

**G. Docs.** ARCH.md §2 "Money invariants" (reembolsos parciales, `price_adjustments`),
§1 matriz (`precios.masivo`), `pnpm reconcile` en README con las invariantes nuevas.

**Salida O7:** reembolso parcial con ledger e invariantes; precios masivos owner-only con
auditoría y redondeo testeado; duplicar; markdown seguro con tests de XSS; destacados y
categorías con foto/descripción expuestos por el dominio; suite completa verde; `pnpm
test:e2e` verde; PR abierto verde; §9.

### 5.4 · O8 — Backups programados, versión del build, logger y reporte de errores

Branch `phase/o8`. Maquinaria + ops.

**A. Backup desde la app.** `src/domain/backup.ts`: `dumpDatabase()` recorre las tablas
del schema (lista explícita exportada desde `src/db/schema.ts`, no `SHOW TABLES`, para que
una tabla nueva sin backup falle un test), `SELECT *` en páginas de 1.000 filas por PK,
escribe **JSON Lines por tabla** (`{table, row}`) a un `gzip` en streaming (nunca todo en
memoria: el slot tiene poca RAM), sin `raw_payload` de `payments` truncado ni excluido
(es parte del rastro). `uploadBackup(stream)` a Cloudinary `resource_type: 'raw'`,
`type: 'authenticated'`, folder `<prefijo>backups/`, `public_id = <fecha-hora Asunción>`.
`pruneBackups(retainDays = 14)` lista y borra los más viejos (Admin API con
`prefix`). Límites: Cloudinary limita el tamaño por archivo según plan (10 MB en free);
si el dump lo supera, subir **un archivo por tabla** y registrar en `job_runs.payload`
cuántos; documentarlo. Ruta `src/app/api/cron/backup/route.ts`: auth de `cron-auth`,
`claimJob('backup')` con lock, corre, `finishJob`, responde con cantidades; si falla,
manda un aviso al dueño por el sender (plantilla `WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO`
reutilizada: es "algo que el dueño tiene que saber hoy") y deja `last_error`. Restauración:
`scripts/restore-backup.ts` (`pnpm restore -- <archivo.jsonl.gz>`) que **sólo** corre
contra una base cuyo nombre contenga `restore` o `test` (mismo candado que
`TEST_DATABASE_URL`), inserta en orden de FKs; test de integración dump → restore → mismas
filas. Preflight: advertencia si no hay Cloudinary (sin backups automáticos).
`pnpm backup` (mysqldump) queda como está.

**B. Versión.** `next.config.ts` fija `env.BUILD_SHA` (`git rev-parse --short HEAD` en
build, fallback `process.env.SOURCE_COMMIT`, fallback `"desconocido"`) y
`env.BUILD_AT` (ISO). `src/app/api/version/route.ts`: auth de `cron-auth` (mismo
`CRON_SECRET`), responde `{ sha, builtAt, node }`. `/api/health` **no cambia**. DEPLOY.md §6:
cómo comprobar que el redeploy tomó.

**C. Logger.** `src/lib/log.ts`: `log.info/warn/error(msg, fields)` → una línea JSON por
evento (`ts`, `level`, `msg`, `reqId`, campos). `reqId` viene de `src/proxy.ts`: si el
request trae `x-request-id` lo respeta, si no genera uno y lo pone en la respuesta
(header) y en un `AsyncLocalStorage` para que el logger lo lea sin pasarlo a mano. Regla
escrita en el archivo: **nunca** teléfonos, tokens de acceso, secretos ni cuerpos de
mensajes. Migrar los `console.*` de `src/app/api/**` y `src/domain/**` que ya existen
(sólo los de servidor; los de `scripts/` no). Un test que greppea que en `src/domain` y
`src/app/api` no queden `console.log` sueltos (el patrón de `no-raw-status-update`).

**D. Reporte de errores.** `src/instrumentation.ts` con `onRequestError(err, request,
context)`: siempre `log.error`; si `ERROR_REPORT_URL` (https) está configurada, `POST`
JSON con `{ message, stack (≤ 4 KB), path, method, reqId, sha }` con timeout de 3 s,
`void` y `catch`. Sin URL, nada. Rate limit propio (10 / min) para que una tormenta de
errores no sea también una tormenta de POSTs. `.env.example` lo explica: sirve para un
webhook de Slack/Discord/n8n, y **qué no viaja**. `flags-apagados` verde.

**E. Tests.** Integración: dump/restore round-trip contra `TEST_DATABASE_URL`; lock del
backup; ruta 503/401/429/200. Unitarios: logger redacta campos prohibidos por nombre
(`phone`, `token`, `secret`, `password` ⇒ `[redacted]`); `onRequestError` con y sin URL;
`proxy()` propaga `x-request-id` (extender `tests/unit/proxy.test.ts`); versión responde
sólo con secreto.

**F. Docs.** DEPLOY.md: tercera entrada de cron (backup diario 03:00 Asunción), cómo
restaurar, cómo leer los logs JSON en el hPanel. README: `pnpm restore`.

**Salida O8:** backup por cron con lock, retención, aviso si falla y restore testeado;
`/api/version` con secreto; logger JSON con `reqId` y test de redacción; `onRequestError`
apagado sin URL; suite completa verde; `pnpm test:e2e` verde; PR abierto verde; §9.
**Fin de las fases Opus → S9, S10 y S11 pueden arrancar (en paralelo si Anton quiere).**

## 6. Fases Sonnet

Límites duros (§4.7). Cada una lista lo que posee (Owns). Las tres primeras corren en
paralelo: no se pisan si respetan Owns y el bloque propio en `es-PY.ts`/`testids.ts`.

### 6.1 · S9 — Panel de pedidos: tracking, notas, remito imprimible; la página del pedido

Branch `phase/s9`. Owns: `src/app/admin/(panel)/pedidos/**`, `src/components/admin/order-*`,
`src/components/admin/order-notes.tsx` (nuevo), `src/components/admin/print-*` (nuevo),
`src/app/pedido/[orderNumber]/**`, `tests/e2e/panel.spec.ts`, bloque `@media print` al
final de `src/app/globals.css`.

- **Tracking al despachar.** `order-actions.tsx`: cuando la transición elegida es
  `enviado`, el paso intermedio muestra tres campos (courier, guía, link) además del
  motivo, todos opcionales; se mandan a `advanceOrder`. Sugerencia de courier: los
  `shipping_methods` de la tienda + texto libre. En la ficha del pedido, un bloque
  "Seguimiento" con los datos y el link (sólo si hay). `data-testid`s nuevos para los tres
  campos y el bloque.
- **Notas.** `order-notes.tsx` (cliente): lista de notas (autor, fecha `dd/mm/yyyy hh:mm`
  Asunción, texto) + textarea con contador y botón; llama `addOrderNote`, `router.refresh()`,
  toast. Visible para los tres roles. En la ficha, arriba del historial de eventos. En
  `/admin/actividad` el dominio (O5) ya devuelve las filas tipo `nota`: S9 sólo verifica
  que se dibujen con el texto y el autor; `activity-filters.tsx` se toca únicamente si el
  filtro por tipo no ofrece "Notas" todavía (agregarlo a la lista, nada más).
- **Remito imprimible.** `src/app/admin/(panel)/pedidos/[id]/imprimir/page.tsx`: página
  server, `requireAdminSession` vía el layout del panel (verificar que el layout ya
  protege), sin nav, con: marca (`TIENDA.nombre`), número de pedido, fecha, datos de
  entrega (nombre, teléfono, ciudad, barrio, dirección, referencia), forma de entrega,
  medio de pago, líneas (SKU, nombre, variante, cantidad — **sin precios** si el actor es
  `vendedor`, con precios si `can(role, 'precios')`), nota de regalo si `is_gift`, y un
  cuadrado con el número de pedido grande para pegar en el paquete. Botón "Imprimir"
  (`window.print()` en un componente cliente chico) y link desde la ficha. CSS en
  `globals.css` bajo `@media print` (ocultar nav/botones, márgenes A4). Nada inline: CSP.
- **Página del pedido (compradora).** `/pedido/[orderNumber]` muestra el bloque de
  seguimiento cuando hay tracking, con el link si existe. Texto por i18n.
- **E2E.** `panel.spec.ts` gana: despachar con guía → la ficha muestra la guía → la
  página de la compradora la muestra; agregar una nota → aparece. Usar los testids, nunca
  texto.
- **Capturas** (una pasada): ficha con seguimiento y notas, remito, página de la
  compradora — a mano en local, para el cuerpo del PR como descripción; no se commitean.

**Salida S9:** tracking y notas usables desde el celular; remito imprime en A4 sin nav;
compradora ve su guía; e2e verde con los casos nuevos; `testids-contrato` verde; suite
verde; PR abierto verde; §9.

### 6.2 · S10 — Panel de productos y categorías

Branch `phase/s10`. Owns: `src/app/admin/(panel)/productos/**`,
`src/app/admin/(panel)/categorias/**`, `src/components/admin/product-*`,
`src/components/admin/variant-editor.tsx`, `src/components/admin/categories-manager.tsx`,
`src/components/admin/bulk-*` (nuevo), `src/components/admin/markdown-*` (nuevo),
`src/components/admin/refund-*` (nuevo, si el reembolso parcial no tiene UI todavía —
verificar dónde vive hoy el botón de devolución: si está en `pedidos/[id]`, coordinar con
S9 tocando **sólo** un componente nuevo `refund-form.tsx` que S9 no crea; anotar en §9).

- **Listado con selección.** `productos/page.tsx` + `product-filters.tsx`: checkbox por
  fila, "seleccionar página", barra de acciones masivas (`bulk-actions.tsx`): activar,
  desactivar, mover a categoría (select), y —sólo `can(role, 'precios.masivo')`— "ajustar
  precios" que abre un diálogo con porcentaje, redondeo (₲100/₲1.000), motivo y una
  **vista previa** de 5 variantes calculada por la misma fórmula (pedir al dominio una
  función `previewPriceAdjustment` si O7 la dejó; si no, mostrar sólo el resumen y anotar
  en §10). Confirmación explícita con la cantidad. Toasts con "cambió N".
- **Duplicar.** Botón en la ficha → `duplicateProduct` → redirige a la copia.
- **Punto de reposición** en `variant-editor.tsx` (campo entero, vacío = default) con el
  tooltip que dice qué hace.
- **Destacado.** Toggle en `product-form.tsx` + chip en el listado + filtro "destacados".
- **Descripción con markdown.** `markdown-editor.tsx` (cliente): textarea + pestaña
  "Vista previa" que renderiza con la misma función pura `renderMarkdown` de
  `src/lib/markdown.ts` importada en el cliente (O7 la deja sin APIs de Node justamente
  para esto; verificar que el import no arrastre nada de servidor). No se crea ninguna
  server action de vista previa (límite §4.7). Ayuda de dos líneas con la sintaxis
  soportada.
- **Categorías.** `categories-manager.tsx`: descripción (textarea) y foto (subida con
  el mismo componente de fotos de producto si es reutilizable, si no uno mínimo) + alt.
- **Reembolso parcial.** `refund-form.tsx`: monto (default = lo que queda por devolver),
  motivo, muestra `amount_pyg`, `refunded_pyg` y el resto. Owner-only por `can`.
- **E2E**: en `panel.spec.ts` **no** (es de S9). Nuevo `tests/e2e/productos.spec.ts`: crear
  producto con markdown, marcar destacado, duplicar, acción masiva "desactivar" sobre la
  copia. Testids propios.

**Salida S10:** todas las acciones de O7 tienen botón; nada se dibuja para un rol que el
guard rechazaría (`can`); vista previa de markdown; e2e nuevo verde; suite verde; PR
abierto verde; §9.

### 6.3 · S11 — Vidriera: destacados, vistos recientemente, categorías, avisame, consulta por WhatsApp

Branch `phase/s11`. Owns: `src/app/page.tsx`, `src/app/categoria/**`,
`src/app/producto/**` (salvo `generateMetadata`, que O7 ya tocó — no pisar),
`src/components/{home-hero,product-card,catalog-filters,add-to-cart,stock-badge,whatsapp-fab}.tsx`,
`src/components/recently-viewed.tsx` (nuevo), `src/components/stock-alert-form.tsx`
(nuevo), `src/components/product-description.tsx` (nuevo),
`src/components/variant-inquiry-link.tsx` (nuevo), `tests/e2e/compra.spec.ts`,
`tests/e2e/csp.spec.ts`.

- **Destacados.** La home usa `getFeaturedProducts(8)`; título "Destacados" si son
  elegidos, "Novedades" si es el fallback (dos claves i18n). Sin cambiar el layout de la
  home más de lo necesario: es piel y cada tienda la rediseña.
- **Vistos recientemente.** `recently-viewed.tsx` (cliente): guarda hasta 8 slugs en
  `localStorage` (clave con el prefijo de `CART_STORAGE_KEY`), se muestra en la página de
  producto debajo de "relacionados" con las fichas de esos slugs — los datos de cada ficha
  se piden… **no hay endpoint** (límite §4.7): guardar en `localStorage` el mínimo para
  dibujar (slug, nombre, precio, imagen) al visitar, y dibujar de ahí; si el precio cambió,
  se ve el viejo hasta que vuelva a entrar — aceptable y anotado. Sin SSR (evitar
  hidratación distinta): render sólo tras `useEffect`. Con `localStorage` bloqueado, no
  se muestra.
- **Categoría.** `categoria/[slug]/page.tsx`: foto (Cloudinary, `f_auto,q_auto`, con blur
  si hay) + descripción arriba de la grilla; `generateMetadata` usa la descripción si
  existe. Sin foto ni descripción, exactamente la página de hoy.
- **Avisame cuando haya stock.** `stock-alert-form.tsx`: se muestra **sólo** cuando la
  variante elegida no tiene disponibilidad **y** el servidor dice `stockAlertsEnabled()`
  (pasado como prop desde la page; sin sender la prop es `false` y no hay formulario —
  nunca un botón que no puede funcionar). Teléfono con el mismo formato del checkout,
  mensaje genérico de éxito, error de rate limit legible.
- **Consultar por WhatsApp.** `variant-inquiry-link.tsx`: link `wa.me/<WHATSAPP_NUMBER>`
  con texto prearmado "Hola, quiero consultar por <producto> (<variante>, SKU) —
  <url absoluta>"; usar el helper que ya arma los links de `order-messages.ts` si es
  reutilizable desde cliente, si no `encodeURIComponent` a mano. Junto al botón de
  agregar; visible siempre que haya `WHATSAPP_NUMBER`.
- **Descripción.** `product-description.tsx`: `dangerouslySetInnerHTML` con la salida de
  `renderMarkdown` (server component; la función ya escapa todo — comentar por qué es
  seguro acá y sólo acá). Estilos de prosa mínimos en `globals.css` (bloque propio).
- **E2E.** `compra.spec.ts`: la home sigue teniendo fichas (destacados o fallback).
  `csp.spec.ts`: la página de producto con descripción markdown no produce violaciones.
  Nuevo caso: producto sin stock muestra el formulario **sólo** si el flag está (en CI no
  hay sender ⇒ se verifica que **no** aparece).

**Salida S11:** home con destacados/fallback; vistos recientemente sin error de
hidratación; categoría con foto/descripción; avisame sólo cuando puede funcionar; consulta
por WhatsApp por variante; descripción renderizada; e2e y CSP verdes; suite verde; PR
abierto verde; §9.

### 6.4 · S12 — CI y calidad: presupuesto de bundle, Lighthouse, capturas, render tests

Branch `phase/s12`. Owns: `.github/workflows/**`, `playwright.config.ts`, `tests/**`,
`scripts/**`, `src/components/__tests__/**`, `vitest.config.mts`, `vitest.setup.ts`.

- **Presupuesto de bundle (bloquea).** `tests/e2e/presupuesto.spec.ts`: abre la página de
  un producto del seed, suma `content-length`/tamaño transferido de todas las respuestas
  `script` del mismo origen (con `page.on('response')`, cuerpos comprimidos: leer el
  header; si `next start` no comprime, medir con `gzipSync` sobre el body), y `expect` <
  120 KB. Mismo para `/` < 100 KB y `/checkout` < 150 KB (ajustar al valor real medido
  + 10 % y **escribir el valor medido en §9**: el presupuesto es un techo, no una
  aspiración). Falla con un mensaje que lista los 5 chunks más grandes.
- **Lighthouse (advierte).** Job `lighthouse` en `ci.yml`, `needs: e2e`,
  `continue-on-error: true`, `treosh/lighthouse-ci-action` (o `@lhci/cli` directo) contra
  `next start`, preset mobile, URLs `/`, un producto, `/checkout`; assert `performance ≥
  0.8` como **warn**; sube el reporte como artifact. Un comentario en el workflow explica
  por qué no bloquea (varianza del runner) y que el número que sí bloquea es el
  presupuesto de arriba.
- **Capturas por PR.** `tests/e2e/capturas.spec.ts`: 6 páginas (`/`, categoría, producto,
  `/checkout` con carrito, `/admin/pedidos`, ficha de pedido) × 2 anchos (390, 1280) →
  `playwright-report/capturas/`; el job `e2e` sube `playwright-report/` **siempre** (hoy
  sólo si falla: cambiar a `if: always()` sólo para la carpeta de capturas, el reporte
  completo sigue sólo en fallo). `.gitignore`: `docs/screenshots/`, `playwright-report/`,
  `test-results/`.
- **Render tests del panel** (backlog de `fable/plan.md` §10): con RTL, tres componentes
  que S9/S10 dejaron: `order-actions.tsx` (los botones que se dibujan según
  `nextStatuses`; los campos de tracking sólo con `enviado`), `bulk-actions.tsx` (el botón
  de precios sólo con la capability), `order-notes.tsx` (contador y deshabilitado al
  enviar). Mockear las server actions con `vi.mock`.
- **`tests/unit/backup-cobertura.test.ts`** si O8 no lo dejó: toda tabla exportada de
  `schema.ts` está en la lista del dump.

**Salida S12:** presupuesto bloquea y está calibrado con valores medidos en §9;
Lighthouse corre y advierte; capturas en el artifact de cada PR; tres render tests;
CI verde completo; PR abierto verde; §9.

### 6.5 · S13 — Distribución a las tiendas, docs y reporte final

Branch `phase/s13`. Owns: `.github/workflows/template-al-dia.yml` (nuevo), `scripts/**`,
`README.md`, `NEW-STORE.md`, `ARCH.md`, `DEPLOY.md`, `CLAUDE.md`, `PLAN.md`,
`KNOWN-ISSUES.md`, `.env.example` (revisión de consistencia, no variables nuevas),
`fable/plan-operacion.md`.

- **Distribución desde el template (§12).** `.github/workflows/distribuir.yml` en **este**
  repo: se dispara en cada push a `main` (y por `workflow_dispatch`), lee la lista de
  tiendas de `tiendas.json` (raíz; `[{ "repo": "antonmarklundcom/<tienda>" }, …]`; vacío
  en el template = no hace nada) y, por cada una en una `matrix`, clona la tienda con un
  PAT (`secrets.TIENDAS_TOKEN`, permisos `contents:write` + `pull-requests:write` sobre
  esas repos), agrega el remoto `template`, corre `pnpm template:sync --sin-tests` en una
  branch `template/<fecha>-<sha corto>`; si termina limpio, pushea y abre (o actualiza) un
  PR en la tienda con la lista de commits traídos; si `template:sync` para en un
  conflicto, pushea lo aplicado hasta ahí y abre el PR igual, **en draft**, con el
  conflicto en el cuerpo (commit, archivo, cómo seguir). El CI de cada tienda es el que
  decide si se mergea. Sin `TIENDAS_TOKEN` el workflow se salta con un aviso en el log.
  `template:sync` gana `--json` (resumen máquina para el cuerpo del PR) y
  `--rama-destino <nombre>`; test unitario del `--json` (extender
  `tests/unit/template-sync.test.ts`). `template-diff` **no** cambia.
- **Lo que sigue siendo a mano.** Los commits mixtos (`~`: maquinaria + piel en el mismo
  commit) y los de piel pura no viajan: NEW-STORE.md lo dice ya y S13 lo repite en §12
  con el criterio de este plan (S9–S11 son piel: cada tienda decide si los quiere).
- **Docs.** NEW-STORE.md: secciones nuevas (tracking y remito; resumen diario y sus
  plantillas; avisame; backups y restore; destacados y categorías; el workflow semanal).
  ARCH.md: ERD con las tablas nuevas, §5 con los tres avisos nuevos, §6 con el presupuesto
  medido, sección "Observabilidad" (logger, `reqId`, `onRequestError`, `/api/version`).
  DEPLOY.md: las tres entradas de cron juntas en una tabla, con hora Asunción y UTC.
  README: tabla de comandos (`pnpm restore`, `pnpm test:e2e` con los specs nuevos), fila
  de `fable/plan-operacion.md` como historial. CLAUDE.md: puntero. `.env.example`:
  releer de punta a punta que cada variable nueva (RESUMEN_DIARIO, STOCK_DISPONIBLE,
  ERROR_REPORT_URL) tenga su trampa escrita y su "vacía = apagado".
- **KNOWN-ISSUES.md**: revisar cada entrada; borrar las resueltas; promover lo que quedó
  abierto en §9 de las nueve fases.
- **Reporte final** (en el chat, además de §9): tabla de las nueve fases con PR y fecha;
  qué quedó en KNOWN-ISSUES y §10; **pasos manuales numerados** para Anton (plantillas de
  Meta a pedir, entradas de cron en el hPanel por tienda, `ERROR_REPORT_URL` opcional,
  `pnpm template:sync` en cada tienda hija con la migración `0012`, verificar que el plan
  de Cloudinary aguanta los backups).

**Salida S13:** `distribuir.yml` probado con `workflow_dispatch` y `tiendas.json` vacío
(se salta y lo dice) y, si Anton cargó el token y una tienda antes de esta fase, con una
tienda real (abre el PR en la tienda; anotar el link en §9); docs sin referencias rotas
(grep de cada ruta y comando nombrado); CI verde; PR mergeado; §9; reporte final en el
chat. **STOP.**

## 7. Inputs humanos

| Qué | Quién | Fase que lo necesita |
|---|---|---|
| Nada para desarrollar: todo corre con lo que hay en CI (sender de consola en dev, Cloudinary mockeado en tests) | — | — |
| Plantillas de Meta aprobadas: `RESUMEN_DIARIO`, `STOCK_DISPONIBLE` (un parámetro en el cuerpo cada una) | Dueño del comercio / Anton | Sólo para probar en una tienda real (O6, O8) |
| Dos entradas de cron nuevas en el hPanel por tienda (resumen diario, backup) | Anton | Post-merge de O6 y O8 |
| Plan de Cloudinary con espacio para 14 días de backups | Anton | Post-merge de O8 |
| `ERROR_REPORT_URL` (webhook) si se quiere | Anton | Opcional, post-merge de O8 |
| Un PAT de GitHub (`TIENDAS_TOKEN`) con `contents:write` + `pull-requests:write` sobre las tiendas, cargado como secret de este repo, y `tiendas.json` con las tiendas reales | Anton | S13 (opcional para desarrollar; necesario para que distribuya de verdad) |
| Merge del PR de cada tienda cuando su CI está verde | Anton | Después de cada distribución |

## 8. Preguntas de negocio (aparcadas)

- ¿El resumen diario debería incluir el monto de ventas de ayer? Está incluido por
  default (el destino es el WhatsApp del dueño). Si una tienda no lo quiere, es una
  variable más; no se decide acá.
- ¿Los backups deberían ir también a un segundo destino (S3, Drive)? Cloudinary alcanza
  para empezar; anotar el día que una tienda supere el plan free.
- Email transaccional, multi-tenant, carritos abandonados: siguen en `fable/plan.md` §8 y
  PLAN.md FASE 3.

## 9. Build log

*(Cada fase agrega su entrada fechada dentro de su PR. Formato: `### AAAA-MM-DD · <fase> —
<título>` + 5–10 líneas: PR, qué existe ahora, decisiones/desvíos, dónde mirar primero
en la fase siguiente, valores medidos si los hay.)*

### 2026-09-05 · O5 — schema completo, tracking del envío y notas del pedido

Branch `phase/o5`. **Todo el schema de §2 entra acá y no se retoca**: migración
`0012_vengeful_piledriver.sql`, doce cambios en once tablas (tracking en
`orders`, `order_notes`, `variants.reorder_point`, `stock_alerts`,
`products.is_featured`, tres columnas en `categories`, `refunds`,
`payments.refunded_pyg`, `price_adjustments`, `job_runs`). Toda columna nueva es
nullable o tiene default. Las tres FK de `actor_user_id` van a
`src/db/extras.ts` como las dos que ya estaban.

**Qué existe ahora.** `transitionOrder` acepta `options.tracking` y lo escribe
en el mismo `UPDATE` que el estado, sólo con destino `enviado`
(`TrackingNotAllowedError` en cualquier otro, chequeado antes de abrir la
transacción). El aviso ENVIADO a la compradora suma courier / guía / link
leyéndolos de la fila ya commiteada; sin ninguno de los tres el texto es
idéntico al de antes. `src/domain/order-notes.ts` (`addOrderNote` /
`listOrderNotes`) + la acción homónima con `requireAdminSession`, capability
`pedidos.notas` para los tres roles, y `nota` como tercer origen del
`UNION ALL` de `/admin/actividad`.

**Decisiones y desvíos.**
- El backfill del ledger vive en `src/db/backfills.ts` y la migración lo copia
  textualmente; un test unitario verifica esa copia. Sin eso, el test de
  integración (que corre contra una base ya migrada, sin datos) y el SQL real
  podían separarse sin que nada avisara.
- **Bug encontrado y arreglado en la fase:** el UPDATE del acumulado disparaba
  el `ON UPDATE CURRENT_TIMESTAMP` de `payments.updated_at` y le ponía la fecha
  de la migración a todas las devoluciones históricas — justo el dato del que
  el ledger saca su `created_at`. Se arregla asignando `updated_at` a sí misma;
  hay un test que lo fija.
- El feed y su filtro `nota` obligaron a tocar `/admin/actividad` (markup) y
  `activity-filters.tsx`: es el mínimo para que el tercer origen se vea.
- Nada nuevo en `KNOWN-ISSUES.md`.

**Dónde mirar primero en O6.** `src/db/schema.ts` → `jobRuns` (el comentario
dice cómo lo tienen que usar `claimJob`/`finishJob`) y `stockAlerts`; después
`src/domain/order-customer-notifications.ts`, que es el patrón exacto que O6
tiene que repetir para el resumen diario y el aviso de stock.

### 2026-09-05 · O6 — resumen diario, punto de reposición, avisos de stock

Branch `phase/o6`. Sin schema nuevo: todo lo de §2 ya estaba (O5).

**Qué existe ahora.** `src/lib/cron-auth.ts` con las cuatro decisiones de la
puerta (503 sin secreto, rate limit, `timingSafeEqual`, `Bearer` o `?secret=`);
`vencer-pedidos` la usa y su test sigue verde sin tocarlo. `job-runs.ts` con
`claimJob`/`finishJob`: idempotencia por día calendario de Asunción para el
resumen y lock con expiración para el backup de O8. `/api/cron/resumen-diario`
arma y manda el resumen (cuatro secciones, "Sin novedades" igual se manda) y
barre los avisos de stock pendientes. `variants.reorder_point` se guarda desde
`saveVariant` y lo respeta `lowStockVariants` con `COALESCE` en el SQL.
`stock-alerts.ts` completo: alta pública con rate limit por IP y por teléfono,
disparo post-commit desde `adjustStock`, barrido en el cron y purga a los 90
días en `runMaintenance`.

**Decisiones y desvíos.**
- El disparo del `catalog-import` se hace desde `applyCatalogImport` (owned) y
  no desde `scripts/seed.ts`, que es donde realmente sube `on_hand` y está
  fuera de los Owns de la fase. Se dispara el **barrido** y no un aviso por
  variante: una planilla trae doscientas filas y sólo unas pocas le interesan
  a alguien.
- El resumen que no se pudo mandar cierra la corrida como **exitosa** con el
  motivo en `last_error`: marcarla fallida haría que el cron de las 8:15
  reintentara y el dueño recibiera el resumen dos veces el día que Meta se
  recupera solo.
- **Dos bugs encontrados y arreglados en la fase:** la fila de `job_runs`
  nacía con `finished_at` en NULL y la primerísima corrida se contestaba
  `en_curso` a sí misma (el trabajo no corría nunca hasta que venciera el
  lock); y la purga leía `affectedRows` del objeto equivocado (mysql2 lo
  devuelve en `result[0]`), así que borraba bien y reportaba 0.
- `security-review.test.ts` se actualizó para seguir a la extracción, y de
  paso ganó un control nuevo: ninguna ruta de cron se arma su propia puerta.
- **Tercer bug, y éste lo encontró CI y no la suite local:** el `ORDER BY` de
  `lowStockVariants` restaba dos columnas `INT UNSIGNED`, así que reventaba
  (`ER_DATA_OUT_OF_RANGE`) en el MySQL 8 del job en cuanto `on_hand <
  reorder_point` — o sea, en todas las filas que la consulta busca. La MariaDB
  local devolvía la vuelta al revés en silencio y la suite pasaba verde.
  Arreglado con `CAST(... AS SIGNED)` en los dos lados, con su test de orden.
- `KNOWN-ISSUES.md` gana una entrada por eso mismo: **la trampa sigue puesta
  para el resto del repo** y el verde local no la ve.

**Dónde mirar primero en O7.** `src/domain/payment-recovery.ts` (`refundPayment`
y qué hace hoy con `transitionOrder` para el reembolso total, que hay que
conservar exacto) y `src/domain/reconciliation.ts`, que gana las tres
invariantes del ledger.

### 2026-09-05 · O7 — plata y catálogo

Branch `phase/o7`. Sin schema nuevo (todo lo de §2 lo creó O5).

**Qué existe ahora.** `refundPayment` acepta `amountPyg`: fila en `refunds`,
acumulado en `payments.refunded_pyg`, `status = 'refunded'` **sólo** al llegar
al total (y ahí la misma transición de siempre), y el parcial no mueve el
estado del pedido pero deja su `order_event` con `from = to`. `reconcile` gana
`devoluciones_no_cuadran` con las tres igualdades de §5.3.A, y el control de
aristas imposibles perdona ese evento por el prefijo del motivo —constante
compartida, para que no se puedan separar—. `admin-bulk.ts`: activar/
desactivar, mover de categoría, `bulkAdjustPrices` (owner, `precios.masivo`) y
`duplicateProduct`. `markdown.ts` sin dependencias. Destacados
(`getFeaturedProducts`, `updateProduct.isFeatured`) y categorías con
descripción, foto y alt.

**`previewPriceAdjustment` quedó** (S10 la necesita) y usa `precioAjustado`, la
**misma** función que aplica el ajuste: si la vista previa y la escritura
usaran cuentas distintas, la vista previa sería peor que no tenerla.

**Decisiones y desvíos.**
- §5.3 E dice que sin destacados se devuelvan "los más nuevos" y lo iguala a
  "la home de hoy". **Son cosas distintas**: la home de hoy es
  `getCatalog({ limit: 8 })`, ordenado por posición de categoría y nombre.
  Manda el criterio verificable del prompt —"exactamente lo que la home
  muestra hoy"—, porque es el que garantiza que una tienda que sincroniza
  `0012` no vea moverse su portada. Hay test del orden, no sólo del conjunto.
- El parcial **sí** se permite sobre un pedido vivo (el total no, como
  siempre): ése es justamente su caso de uso — la compradora se queda con dos
  de tres remeras.
- Sin monto, el reembolso devuelve **lo que queda**, no `amount_pyg`: con
  parciales previos son cosas distintas y devolver el total dos veces sería
  devolver de más.
- **Bug encontrado y arreglado en la fase:** el evento del parcial se escribía
  con `from_status = NULL` (el default de `recordOrderEvent`), que significa
  "el pedido nació" — `reconcile` lo reportaba como arista imposible. Ahora se
  pasa `fromStatus: order.status` explícito, con su test.
- `atribucion.test.ts` no cubría las escrituras auditadas nuevas y pasaba en
  falso: se le agregaron `addOrderNote` y `bulkAdjustPrices` al patrón.
- Nada nuevo en `KNOWN-ISSUES.md`.

**Dónde mirar primero en O8.** `src/domain/job-runs.ts` (el lock con
expiración que O6 dejó listo para el backup) y `scripts/backup-db.ts`, que es
el camino "grande" que sigue existiendo.

### 2026-09-05 · O8 — backups, versión, logger y reporte de errores

Branch `phase/o8`. Sin schema nuevo (`job_runs` es de O5) y **sin dependencias
nuevas de runtime**. Última fase Opus.

**Qué existe ahora.** `BACKUP_TABLES` en `schema.ts`: lista explícita y
ordenada por dependencia, con test de cobertura contra las tablas declaradas.
`backup.ts` vuelca en streaming (JSON Lines + gzip, paginado por PK, nunca la
base en memoria) y sube a Cloudinary `raw` + `authenticated` con retención de
14 días; `/api/cron/backup` con lock de 30 min, aviso al dueño si falla y
respuesta sin el nombre del archivo. `scripts/restore-backup.ts`
(`pnpm restore`) con el candado del nombre de base, y test de round-trip.
`/api/version` con `CRON_SECRET`; `/api/health` sin tocar. `log.ts` con
redacción por nombre de campo y `reqId` desde `proxy.ts` por
`AsyncLocalStorage`; los 33 `console.*` de `src/domain` y `src/app/api`
migrados, con un test que greppea que no vuelvan. `instrumentation.ts` con
`onRequestError`, apagado sin `ERROR_REPORT_URL`.

**Decisiones y desvíos.**
- El aviso de backup fallido **reusa** `WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO`
  como dice el plan: pedirle a Meta una plantilla más, por tienda, para un
  aviso que ojalá nunca salga, sería agregarle un trámite a cada instalación.
- La paginación del dump va por **PK y no por `OFFSET`**: con `OFFSET`, una
  fila insertada a mitad del dump corre el resto y una fila se salta o se
  duplica. Hay test con más de una página.
- La retención corre **después** de subir la copia de hoy y su fallo **no**
  marca la corrida como fallida: es preferible una carpeta con una copia de
  más que una corrida en rojo cuando la copia de hoy ya está guardada.
- El límite de tamaño por archivo de Cloudinary (10 MB en el plan free) **no**
  se resolvió partiendo el dump por tabla: hoy no hay ninguna tienda cerca de
  ese tamaño y partirlo agrega una forma de fallar a medias. Queda anotado en
  `KNOWN-ISSUES.md` con el arreglo cuando haga falta.
- `sin-console.test.ts` deja **una** excepción documentada: el sender de
  consola de dev, cuyo trabajo *es* imprimir por consola (y que
  `resolveMessageSender` ya se niega a devolver en producción).
- El `x-request-id` que llega de afuera **se valida** antes de repetirlo: uno
  con saltos de línea inyectaría líneas falsas en el log del comercio.

**Fin de las fases Opus.** S9, S10 y S11 pueden arrancar, en paralelo o de a
una, en cualquier orden.

### 2026-09-06 · S11 — vidriera: destacados, vistos recientemente, avisame, consulta por WhatsApp

Branch `phase/s11`. Piel, corrida en paralelo con S9 y S10 sobre O8 mergeada.

**Qué existe ahora.** Home: título "Destacados" cuando el comercio eligió al
menos uno (`getCatalog({ featured: true, limit: 8 })` no vacío) o "Novedades"
con el fallback de siempre — dos claves i18n, mismo `getCatalog` que usa
`getFeaturedProducts` (O7) por dentro, sin tocar `db/queries.ts`. Categoría:
foto (`f_auto,q_auto`, tamaño `hero`) y descripción arriba de la grilla, las
dos condicionadas a que existan — sin ninguna, la página es bit a bit la de
antes; `generateMetadata` usa la descripción (vía `markdownToText`) cuando
hay. Producto: `product-description.tsx` (nuevo, server component) reemplaza
el `<p>` de texto plano por `renderMarkdown` + `dangerouslySetInnerHTML` —
único lugar del template que usa esa prop, con el comentario de por qué es
seguro ahí y sólo ahí; estilos `.prose` en el bloque `S11` de `globals.css`.
`stock-alert-form.tsx` (nuevo) se dibuja en `add-to-cart.tsx` sólo cuando la
variante elegida no tiene disponibilidad **y** la page pasó
`stockAlertsEnabled()` en `true` — nunca decide nada por su cuenta, sólo
llama a la acción existente de O6. `variant-inquiry-link.tsx` (nuevo) arma el
`wa.me` con la variante y el SKU elegidos en el cliente; el teléfono viaja
como prop ya normalizado (`comercioWhatsApp()`, servidor) porque
`WHATSAPP_NUMBER` no tiene `NEXT_PUBLIC_`. `recently-viewed.tsx` (nuevo,
client-only): guarda hasta 8 fichas mínimas en `localStorage` (clave
`${CART_STORAGE_KEY}-vistos`, sin endpoint nuevo — límite §4.7), arranca en
`null` y sólo dibuja después de un `useEffect`, así que el primer render de
servidor y de cliente son iguales; `try/catch` en cada lectura/escritura, sin
error en consola con `localStorage` bloqueado.

**Decisiones y desvíos.**
- El `setState` de `recently-viewed.tsx` va adentro de un `setTimeout(…, 0)`
  y no suelto en el cuerpo del efecto — la regla `react-hooks/set-state-in-effect`
  lo marca igual que en `search-box.tsx`; mismo patrón que ya usa ese archivo.
- Las categorías no tienen `blur_data_url` (sólo las fotos de producto; O7 no
  agregó esa columna para categorías): la portada de categoría sale sin blur
  placeholder. No es una regresión — hoy no existe ninguna portada de
  categoría — y agregar la columna es schema nuevo, fuera de los Owns de esta
  fase (§4.7).
- El e2e de "avisame" (`compra.spec.ts`) crea y borra un producto con una
  variante en `on_hand: 0`: fija que, en CI (sin sender ni plantilla), el
  formulario **no** aparece — nunca un botón que no puede funcionar.
- Nada nuevo en `KNOWN-ISSUES.md`.

**Dónde mirar primero en S12.** Nada de esta fase toca `.github/workflows/**`
ni `playwright.config.ts`; S12 arranca limpio en cuanto S9, S10 y S11 estén
las tres mergeadas.

## 10. Backlog

- Rate limit compartido (DB) el día que haya más de un proceso (`fable/plan.md` §10).
- `esbuild` transitivo vía `drizzle-kit` (dev-only) — sigue sin versión que lo arregle.
- Vista previa de precios masivos por variante (`previewPriceAdjustment`) si O7 no la deja.
- Segundo destino de backups.
- Editar un pedido antes del pago (cantidad, dirección): fuera de este plan, requiere
  re-precio + re-reserva; se anota para un plan siguiente.

## 11. Cómo correrlo — dos ventanas

Dos sesiones nuevas, en orden, con modo de permisos que auto-acepte edits y con la
herramienta de GitHub disponible (la sesión abre y mergea sus PRs). Cada ventana encadena
sus fases: branch → PR → CI verde → merge → siguiente. Anton no hace nada entre fases;
mira el reporte de cierre de la ventana al final.

| # | Ventana | Modelo | Pegar |
|---|---|---|---|
| 1 | Opus: O5 → O6 → O7 → O8 | Opus | `Read fable/prompts/opus-todo.md in this repo and execute it.` |
| 2 | Sonnet: S9 → S10 → S11 → S12 → S13 | Sonnet | `Read fable/prompts/sonnet-todo.md in this repo and execute it.` |

La ventana 2 se abre **sólo** con O8 mergeada (la 1 lo dice en su reporte final).

**Por qué no una sola ventana:** cambia el modelo (Opus para lo que decide plata, schema y
auth; Sonnet para lo que dibuja), y ocho fases seguidas superan el contexto y el límite de
horas de una sesión. Dos ventanas es el mínimo que respeta las dos cosas.

**Si una ventana se corta** (límite de sesión, contexto, error): no se retoma la ventana.
Se abre una nueva con el prompt **de la fase** en la que estaba (`fable/prompts/opus-N-….md`
o `sonnet-N-….md`, tabla de arriba de todo), que es re-ejecutable y sigue desde el primer
criterio de salida que no se cumpla; cuando esa fase queda mergeada, se vuelve a pegar el
prompt encadenado (`opus-todo.md` / `sonnet-todo.md`), que detecta por §9 y por los PRs
mergeados qué fases ya están y arranca en la siguiente.

**Dentro de la ventana Sonnet**, S9, S10 y S11 son archivos disjuntos: la sesión puede
hacerlas como tres subagentes Sonnet en paralelo (`fable-directs-sonnet-builds`, patrón
fan-out) sobre tres branches, y después abrir y mergear los tres PRs en orden. Es
opcional; en serie también funciona.

## 12. Tiendas que ya existen — cómo les llega esto

Hoy hay dos o tres tiendas creadas desde este template con "Use this template". Un repo
así **no recibe** commits posteriores del template; el mecanismo que ya existe es
`pnpm template:diff` (qué le falta) + `pnpm template:sync` (cherry-pick de la maquinaria
en una branch, para en seco ante conflictos en `src/`). NEW-STORE.md § "Arreglos que
aparecen después" lo explica.

**Para este plan, en cada tienda:**

1. Después de mergear la ventana Opus (O5–O8): en la tienda, `git checkout -b
   poner-al-dia-template && pnpm template:sync`. Son commits de maquinaria y deberían
   entrar limpios; la migración `0012` viaja en el commit de O5 y se aplica en el deploy
   como siempre (`pnpm db:push` / `POST /api/setup/init`, DEPLOY.md). Cargar en el hPanel
   las variables nuevas que la tienda quiera (plantillas, `ERROR_REPORT_URL`) y las dos
   entradas de cron. Sin variables, la tienda es idéntica a antes: eso es lo que
   `flags-apagados` garantiza.
2. Después de la ventana Sonnet: S12 y S13 son maquinaria (CI, scripts, docs) y viajan
   con `template:sync`. **S9, S10 y S11 son piel** (`src/app/admin/(panel)/**` markup,
   home, producto, categoría, componentes) y `template:sync` no las trae: si la tienda
   **no** rediseñó esas pantallas, `git cherry-pick` de esos commits entra limpio y vale
   la pena; si las rediseñó, se re-aplica a mano lo que quiera (la maquinaria de abajo ya
   está: los botones son lo único que falta). Por eso cada fase Sonnet es un commit
   prolijo por PR: para que la tienda pueda elegir de a uno.
3. Con S13 mergeada, el paso 1 deja de ser manual: `distribuir.yml` abre el PR en cada
   tienda de `tiendas.json` en cada push a `main` del template. Anton sólo mergea.

**Después de este plan — construir una vez, que llegue a todas.** Tres caminos, del más
barato al más profundo; el plan recomienda el primero ahora y el segundo como fase
siguiente si las tiendas pasan de cinco:

| Camino | Qué es | Qué resuelve | Qué cuesta |
|---|---|---|---|
| **A. Distribución por cherry-pick (S13)** | Lo de arriba: el template empuja PRs a cada tienda. | Maquinaria llega sola; cada tienda decide su piel. | Cero cambio en las tiendas. Un PR por tienda por push; conflictos en piel se resuelven en la tienda. |
| **B. Paquete `@antonmarklund/ecom-core`** | `src/domain`, `src/lib`, `src/db`, `src/app/actions`, `src/app/api` y los componentes del panel salen a un paquete (GitHub Packages o `git+https` con tag). La tienda es un Next app finito: `tienda.ts`, piel, y páginas de tres líneas que re-exportan las del paquete. Actualizar = subir la versión. NEW-STORE.md ya lo anticipa ("¿cuándo salen a un paquete compartido?"). | Una build del core, N tiendas con `pnpm up`. Las migraciones viajan en el paquete. | Una fase Opus de extracción + adaptar cada tienda una vez. `transpilePackages` en Next para los `"use server"`. |
| **C. Multi-tenant** | Una sola app y una sola base con `tenant_id`; los dominios apuntan al mismo slot; la piel es un tema por tienda. PLAN.md FASE 3 §4 lo lista ("agregar `tenant_id` antes, no después"). | Deploy una vez, todas las tiendas. | El cambio más grande: cada consulta y cada guard aprende `tenant_id`; una caída afecta a todas; la piel deja de ser "libre" y pasa a ser un tema. Sólo si las tiendas son muchas y parecidas. |

A es lo que S13 construye. B es la fase que sigue si el cherry-pick empieza a doler (más
de cinco tiendas, o conflictos frecuentes en la frontera piel/maquinaria). C no se arranca
sin decisión explícita.
