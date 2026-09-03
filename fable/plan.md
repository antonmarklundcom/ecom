# fable/plan.md — Endurecimiento del template · plan para Opus y Sonnet

**Origen:** `fable/REVIEW.md` (revisión de Fable 5.1, 2026-09-02). Este plan **no reemplaza**
`PLAN.md` (FASE 2, cerrada) ni `TASKS.md` (historial + bloqueos de terceros): los deja como
registro y agrega lo que la revisión encontró. Cuando las cuatro fases estén mergeadas, este
archivo pasa a ser también historial.

**Stack (locked):** Next.js 16 + Drizzle + Hostinger MySQL + Hostinger Node.js + Cloudinary.

| Fase | Modelo | Prompt | Secciones | Depende de |
|---|---|---|---|---|
| O1 | Opus | `fable/prompts/opus-1-xlsx-bordes-proxy.md` | §5.1 | — |
| O2 | Opus | `fable/prompts/opus-2-aviso-pedido-nuevo.md` | §5.2 | O1 mergeada |
| S3 | Sonnet | `fable/prompts/sonnet-3-e2e-playwright.md` | §6.1 | O2 mergeada |
| S4 | Sonnet | `fable/prompts/sonnet-4-deps-ci-docs.md` | §6.2 | S3 mergeada |

Fable no aparece en esta tabla y no va a aparecer: ver §4.8.

---

## 1. Decisiones ya tomadas — no se reabren

1. Todo lo de `CLAUDE.md` y `README.md` §"Reglas no negociables": maquinaria vs. piel, marca
   sólo en `src/config/tienda.ts`, variable vacía = feature apagada, migraciones commiteadas,
   `pnpm typecheck && pnpm lint && pnpm test` antes de dar por terminado.
2. Merge sólo con CI verde **completo** (typecheck + lint + unitarios + integración contra
   MySQL + build + drift de migraciones). Nunca con sólo unitarios.
3. `xlsx` se reemplaza por el tarball oficial de SheetJS
   (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, o la 0.20.x más nueva que exista
   al momento). No se cambia de librería ni se saca el soporte de `.xlsx`/`.xls`.
   (REVIEW P1 — si Anton contesta otra cosa antes de arrancar O1, manda lo que diga él.)
   **Superado:** O1 quedó bloqueada (el CDN de SheetJS no es alcanzable desde el proxy del
   entorno) y Anton después contestó otra cosa — reemplazar por `exceljs`, que sí resuelve
   los dos CVEs. Se hizo así, con la baja de `.xls` que implica (`exceljs` no lee el binario
   viejo). Ver fase "exceljs" en §9.
4. El aviso de pedido nuevo al comercio va por el `MessageSender` existente
   (`src/domain/messaging/`), con WhatsApp Cloud. Sin credenciales o sin plantilla,
   **apagado**. Nunca falla ni demora el pedido. (REVIEW P2.)
5. Playwright entra a CI como job aparte (`e2e`), con tres specs, contra `next build` +
   `next start` y el mismo servicio MySQL del job `checks`. (REVIEW P3.)
6. El rate limit sigue en memoria. (REVIEW P4.)
7. Lo que REVIEW §3 marca como "descartado a propósito" **no se toca**: `?secret=` del cron,
   `loading.tsx` de producto/categoría, el chunk de `next/image` sin nonce.
8. Idioma: código e identificadores en inglés como ya están; comentarios, docs, commits y
   textos de UI en español rioplatense/paraguayo (voseo), como el resto del repo.

## 2. Roles y modelo de objetos

No cambia. Roles `owner | staff | vendedor` (ARCH.md §1, matriz de permisos), `customers`
aparte. **Ninguna fase de este plan agrega tablas ni columnas**; O2 escribe filas nuevas en
`order_events` (tabla existente) y nada más. Si una fase cree que necesita schema, para y
pregunta (§4.4).

## 3. Alcance

Fix-and-harden. Cuatro cosas, en orden de riesgo:

1. **F1** — `xlsx` con CVEs sin parche parseando archivos del staff. (O1)
2. **F6 + F3-unit** — bordes de Zod sin `.max()` y `proxy()` sin test directo. (O1)
3. **F2** — el comercio no se entera del pedido nuevo. (O2)
4. **F3** — nadie abre un navegador contra el build en CI. (S3)
5. **F4, F5, F7 + docs** — `@types/node` en `latest`, `@types/bcryptjs` deprecado,
   `pnpm-al-dia` pegándole al registry en cada PR, y los punteros de README/CLAUDE.md a
   este plan. (S4)

Fuera de alcance: cualquier feature que no esté en esta lista. Ideas → §10.

## 4. Protocolo de autonomía (va en cada prompt)

1. Trabajá hasta que **todos** los criterios de salida de la fase pasen. No pidas permiso
   para trabajo que está en el plan.
2. **Un PR por fase.** Branch `phase/<id>` desde `main` actualizado. Abrí el PR, mirá el CI,
   mergeá cuando esté verde completo. Un build rojo es siempre trabajo tuyo. Nunca arranques
   sobre una fase anterior sin mergear.
3. Problemas menores que no bloquean → `KNOWN-ISSUES.md` (crealo si no existe), y seguí.
4. **Pará y preguntá sólo por**: una credencial que falta y no tiene fallback, o una decisión
   de cimientos (schema, auth, plata, transiciones) donde adivinar mal obliga a reescribir.
   Todo lo demás: elegí razonablemente, anotalo en el build log (§9), seguí.
5. Un valor de entorno que falta nunca bloquea: documentalo en `.env.example`, degradá.
6. Cada prompt es **re-ejecutable**: primero mirá qué hay en la branch, seguí desde el primer
   criterio de salida que no se cumpla.
7. **Límites duros de las fases Sonnet (S3, S4):** no tocan `src/domain/**`, `src/lib/**`,
   `src/db/**`, `src/app/actions/**`, `src/app/api/**` ni `src/proxy.ts`. Si algo de ahí
   parece necesario, workaround + nota en §10, no cambio.
8. **Guardarraíl de costo:** Fable (`claude-fable-5*`, cualquier Mythos) **nunca** ejecuta
   una fase, un subagente ni una sesión hija. Sólo Opus y Sonnet. Si una sesión cree que
   necesita Fable, para y le pregunta a Anton con el motivo. Spawnear Fable sin aprobación
   explícita se trata como una acción destructiva.
9. **Handoff:** sólo cuando pasan las cuatro puertas — PR mergeado verde; checklist de salida
   cumplido; **auditoría pre-handoff** (volver a correr build + tests, releer tu propio diff
   mergeado como adversario, arreglar lo que aparezca: un defecto mergeado ahora envenena
   las fases siguientes y éste es el último momento barato); entrada del build log
   commiteada. Después, spawneá la fase siguiente como sesión **nueva** con
   `create_session` (claude-code-remote): mismo entorno y modo de permisos (nunca `plan`),
   `model` según la tabla de arriba, `prompt` exactamente
   `Read fable/prompts/<archivo>.md in this repo and execute it.`
   Sin `create_session` (CLI local): si la fase siguiente usa el mismo modelo, seguí en la
   misma ventana; si cambia de modelo, pará y reportá.
10. **Build log:** antes de mergear, agregá a §9 una entrada fechada de 5–10 líneas: fase +
    PR, qué existe ahora, decisiones/desvíos, dónde mirar primero en la siguiente fase. Las
    sesiones nuevas se orientan con `fable/plan.md` + §9 + `KNOWN-ISSUES.md` **solamente**.

## 5. Fases Opus

### 5.1 · O1 — `xlsx` parcheado, bordes de input, `proxy()` con test

Branch `phase/o1`. Todo maquinaria; nada de piel.

**A. `xlsx` (F1).**
- En `package.json`, `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (verificar
  en https://cdn.sheetjs.com si hay 0.20.x más nueva; usar ésa). `pnpm install`, lockfile
  commiteado. `import * as XLSX from "xlsx"` y `XLSX.read`/`sheet_to_csv` no cambian de API;
  si el typecheck se queja, ajustar `src/lib/spreadsheet.ts` y nada más.
- `pnpm audit` tiene que dejar de listar `xlsx`. Si el build de Hostinger no pudiera bajar
  del CDN (no hay evidencia de eso, pero verificarlo mentalmente contra DEPLOY.md), la
  alternativa es vendorizar el tarball en `vendor/` — decidirlo y anotarlo en §9.
- Un test unitario nuevo en `tests/unit/spreadsheet.test.ts`: un `.xlsx` mínimo generado en
  el test (`XLSX.utils.book_new()` + `aoa_to_sheet`) pasa por `spreadsheetToCsvText` y sale
  el CSV con `;`. Hoy no hay ningún test que ejecute esa función con bytes reales.
- Nota de dos líneas en NEW-STORE.md §"Arreglos que aparecen después": Dependabot no mueve
  este paquete; se sube a mano mirando el CDN.

**B. Bordes de Zod (F6).**
- `CheckoutInputSchema.customerEmail` → `.max(200)`; `shipMapsUrl` → `.max(500)` (largo de
  las columnas en `schema.ts:175,184`).
- Grep del mismo patrón en **todos** los `z.object` de `src/lib/schemas.ts`,
  `src/app/actions/cuenta.ts`, `src/app/actions/admin-*.ts` y `src/domain/**`: todo string
  que termine en una columna `varchar(N)` lleva `.max(N)`. Listar en §9 los que se tocaron.
- Test en `src/lib/__tests__/schemas.test.ts`: un email de 201 caracteres falla en Zod, no
  en la base.

**C. Test directo de `proxy()` (F3-unit).**
- `tests/unit/proxy.test.ts` construye `NextRequest` y afirma: `/admin/pedidos` sin cookie →
  302 a `/admin/login?next=/admin/pedidos`; `/admin/login` sin cookie → pasa; `/checkout` →
  header `x-nonce` presente y CSP con `'nonce-'` y `'strict-dynamic'`; `/` y
  `/categoria/x` → sin `x-nonce`, CSP con `'unsafe-inline'` y sin `'strict-dynamic'`;
  `/admin/*` con cookie válida → `Cache-Control: no-store` y `X-Robots-Tag: noindex`.
  Para la cookie válida, firmarla con `iron-session` (`sealData`) usando `SESSION_SECRET` de
  test. No se cambia `src/proxy.ts` salvo que el test encuentre un bug real (entonces:
  arreglar, anotar en §9).

**Salida O1:** `pnpm audit` sin `xlsx`; `pnpm typecheck && pnpm lint && pnpm test` verde
(integración incluida); `tests/unit/spreadsheet.test.ts`, `tests/unit/proxy.test.ts` y el
caso de email largo existen y pasan; CI verde completo; PR mergeado.

### 5.2 · O2 — Aviso de pedido nuevo al comercio

Branch `phase/o2`. Backlog de `PLAN.md:241`, ahora con dueño. Maquinaria.

- **Config:** variable nueva `WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO` (nombre de la plantilla
  aprobada por Meta para este mensaje) en `.env.example`, con la misma explicación de
  plantillas que ya tiene el bloque de OTP. Destino: `WHATSAPP_NUMBER` (el del comercio, que
  ya existe). **Apagado** si falta cualquiera de: credenciales de Cloud, esta plantilla,
  `WHATSAPP_NUMBER`. Ningún flag nuevo en `tienda.ts`: es entorno, no marca.
- **Dominio:** `src/domain/order-notifications.ts` (nombre orientativo) con
  `notifyOwnerNewOrder(orderId)`: arma el texto (número de pedido, nombre de la compradora,
  total en Gs, método de pago, link a `/admin/pedidos/<id>`) y lo manda por
  `getMessageSender()`. Extender `MessageSender` sólo si hace falta un segundo template
  (probablemente sí: hoy el sender está pensado para el OTP). En dev, el sender `consola`
  imprime.
- **Dónde se dispara:** en `src/app/actions/checkout.ts` **después** de que `createOrder`
  commiteó, fuera de la transacción, sin `await` que retrase la respuesta a la compradora
  (`void notify…().catch(…)`), y con timeout propio. Un fallo del envío **jamás** hace fallar
  ni demorar el checkout. También para pedidos con tarjeta (Pagopar) que llegan a `pagado`
  por webhook: decidir si el aviso va al crear el pedido o al cobrarlo; recomendación: al
  crearlo, siempre, con el método de pago en el texto.
- **Rastro:** una fila en `order_events` (`actor: "sistema"`, `actor_user_id: NULL`) con
  `aviso_dueno_enviado` o `aviso_dueno_fallido` + motivo corto. Usar el mismo helper de
  escritura de eventos que usa el dominio; no un INSERT suelto. Revisar que
  `tests/unit/atribucion.test.ts` y `no-raw-status-update.test.ts` sigan verdes.
- **Preflight:** `src/domain/preflight.ts` agrega un **warning** (no bloqueante) cuando el
  aviso está apagado: "el comercio no recibe aviso de pedidos nuevos".
- **Tests:** unitario del texto del mensaje (formato de Gs, link absoluto usando
  `siteOrigin()`, sin datos que no correspondan); integración: `submitCheckout` con un sender
  que tira → el pedido se crea igual y queda el evento `aviso_dueno_fallido`; con sender
  `consola` → evento `aviso_dueno_enviado`. `tests/unit/flags-apagados.test.ts` sigue verde
  (sin variables, la tienda es idéntica a hoy).
- **Docs:** NEW-STORE.md §4c gana un párrafo: la segunda plantilla y qué pedirle a Meta.
  ARCH.md §5 o donde vivan los mensajes: tres líneas sobre el aviso y por qué no puede fallar
  el pedido.

**Salida O2:** sin variables, `pnpm test` idéntico a antes; con sender `consola`, un checkout
en dev imprime el aviso y deja el evento; el test del sender que tira pasa; preflight avisa;
CI verde completo; PR mergeado. **Fin de las fases Opus → handoff a Sonnet (S3).**

## 6. Fases Sonnet

Límites duros (§4.7): sin tocar dominio, lib, db, actions, api ni proxy.

### 6.1 · S3 — Playwright en CI: lo que ve la compradora

Branch `phase/s3`.

- `@playwright/test` como devDependency, `playwright.config.ts` con `baseURL`
  `http://127.0.0.1:3000`, `webServer` que corre `pnpm start` sobre un `next build` ya hecho,
  Chromium solamente, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` respetado en local
  (`executablePath` desde env si está). Specs en `tests/e2e/`.
- **Datos:** el job siembra con el mismo camino que la app en producción:
  `POST /api/setup/init` con `SETUP_SECRET` de CI, `{"seed":true,"owner":{…}}`. Nada de
  `db:push` en e2e. Alternativa si es más simple: `pnpm db:push && pnpm db:seed &&
  pnpm create-owner` con `OWNER_*` en env. Elegir una, anotar en §9.
- **Tres specs, no más:**
  1. `compra.spec.ts` — home → una categoría → un producto → agregar al carrito → checkout
     con datos válidos (`+5959…`, CI, transferencia) → aterriza en `/pedido/PY-…?t=…` y ve
     los datos bancarios o el aviso de "sin datos bancarios" (CI no los configura: el aviso
     es lo esperado).
  2. `panel.spec.ts` — `/admin/pedidos` sin cookie redirige a login; login con el owner de
     CI; el pedido del spec 1 aparece en la lista (o uno nuevo creado en el mismo spec si
     el orden de specs no está garantizado — preferir independencia).
  3. `csp.spec.ts` — abrir `/`, `/categoria/<slug del seed>`, `/producto/<slug del seed>`,
     `/checkout` con carrito y `/admin/login`; capturar `console` y `pageerror`; **cero**
     mensajes que contengan "Content Security Policy" salvo la única excepción documentada
     en `src/proxy.ts` (el chunk de `next/image` en rutas con nonce) — permitir esa por
     patrón, ninguna otra. Además: en `/` el buscador responde (hay JS vivo).
- **CI:** job nuevo `e2e` en `ci.yml`, mismo servicio MySQL, `needs: checks`, `timeout-minutes:
  15`, `npx playwright install --with-deps chromium`, sube `playwright-report/` como artifact
  sólo si falla. `pnpm test:e2e` en `package.json`. Variables mínimas en el job: las del job
  `checks` + `SETUP_SECRET` (o `OWNER_*`) + `CRON_SECRET`.
- README: fila `pnpm test:e2e` en la tabla de comandos, dos líneas.

**Salida S3:** `pnpm test:e2e` verde en local contra MySQL; job `e2e` verde en el PR; los
tres specs existen y fallan si se rompe lo que cuidan (probar una vez a mano quitando el
`'unsafe-inline'` de la rama cacheada del CSP: `csp.spec.ts` tiene que ponerse rojo; anotar
en §9 que se probó); PR mergeado.

### 6.2 · S4 — Dependencias, CI y docs

Branch `phase/s4`. Chica.

- `@types/node`: `"^22"` (F4). `@types/bcryptjs`: sacar (F5); `pnpm typecheck` tiene que
  seguir verde con los tipos propios de `bcryptjs@3`.
- `pnpm update` **dentro de los rangos** ya declarados (parches/minors que `pnpm outdated`
  lista: next 16.3.x, zod, mysql2, etc.). Nada de majors. Lockfile commiteado. Si un minor
  rompe algo, revertir ese paquete y anotarlo en §10.
- `pnpm-al-dia` (F7): sacarlo del `on: push/pull_request` y dejarlo en un workflow propio
  `.github/workflows/pnpm-al-dia.yml` con `schedule: "0 9 * * 1"` + `workflow_dispatch`.
  El comentario que explica por qué existe se muda con él.
- Docs: README §"Documentos" gana la fila `fable/` (revisión + plan activo); `CLAUDE.md`
  suma `fable/plan.md` a la lista de lectura; `PLAN.md` gana una línea arriba de todo que
  apunta a `fable/plan.md` como plan activo. `KNOWN-ISSUES.md` si quedó vacío, borrarlo.
- Cierre: `pnpm template:diff` sigue clasificando bien los archivos tocados por O1–S4
  (correrlo contra el propio repo con un baseline viejo, sólo para ver que no explota).

**Salida S4:** `pnpm audit` sin highs propios (los transitivos de `next`/`drizzle-kit` se
anotan en §10 con la versión que los arregla, si existe); `pnpm outdated` sólo con majors;
CI verde completo; PR mergeado. **STOP — reporte final a Anton (ver prompt).**

## 7. Inputs humanos

| Qué | Quién | Fase que lo necesita |
|---|---|---|
| Respuesta a P1–P4 de `fable/REVIEW.md` (o silencio = recomendación) | Anton | O1 |
| Plantilla de WhatsApp Cloud aprobada por Meta para "pedido nuevo" (para probar en una tienda real; el código no la necesita) | Dueño del comercio / Anton | O2, sólo para prueba real |
| Nada más: el resto corre con lo que hay en CI | — | — |

## 8. Preguntas de negocio (aparcadas)

- ¿Vale la pena un canal de email transaccional (Resend/SMTP) además de WhatsApp? Hoy no hay
  proveedor; no se decide acá.
- ¿Cuándo `src/domain` + `src/lib` salen a un paquete compartido? NEW-STORE.md ya dice:
  cuando sean muchas tiendas, no antes.

## 9. Build log & handoff

### 2026-09-02 · O1 — bordes de Zod y test de `proxy()`; `xlsx` **bloqueado**

Fase O1, branch `claude/fable-repo-audit-prompts-cjurpf` (el entorno de esta sesión fija la
branch; no se usó `phase/o1`).

**Qué existe ahora.** Bloque B hecho: `.max()` a la medida de la columna en `customerEmail`
(200), `shipMapsUrl` (500), `images[].cloudinaryId` (255) de `src/lib/schemas.ts`, el `reason`
del ajuste de stock (300) en `admin-products.ts`, cada ciudad de una zona de envío (120, el
largo de `orders.ship_city`) en `admin-shipping.ts`, y el email/password del dueño (200) en
`POST /api/setup/init`. Los demás `z.string()` sin `.max()` que quedan (`q`, `desde`, `hasta`,
`next`, el código OTP) no terminan en ninguna columna: se dejaron. Bloque C hecho:
`tests/unit/proxy.test.ts` ejecuta `proxy()` de verdad (11 casos) y `src/proxy.ts` **no se
tocó** — no apareció ningún bug. Dos detalles para la próxima sesión: el redirect al login es
**307** (`NextResponse.redirect`), no 302 como decía §5.1 C; y la aserción del CSP mira la
directiva `script-src` sola, porque `style-src` también lleva `'unsafe-inline'`. Se verificó a
mano que el test es una red real: vaciando `RUTAS_CACHEADAS`, tres casos se ponen rojos.
También existe `tests/unit/spreadsheet.test.ts`, que pasa un `.xlsx` armado en el test por
`spreadsheetToCsvText` (era el único camino sin test con bytes reales).

**Desvío que importa (bloque A, F1).** El swap de `xlsx` al tarball oficial de SheetJS **no se
pudo hacer**: el proxy de egreso de este entorno niega `cdn.sheetjs.com` con un 403 de
política, así que ni `pnpm install` lo baja ni se lo puede vendorizar (no hay forma de traer
los bytes). npm no tiene versión parcheada. Queda `"xlsx": "^0.18.5"` y `pnpm audit` sigue
listando los dos GHSA. Detalle y las dos salidas posibles en `KNOWN-ISSUES.md`; necesita una
decisión de Anton (habilitar el host en la política de red del entorno, o correr ese cambio
desde otra máquina).

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, y `pnpm test` con
`TEST_DATABASE_URL` contra MariaDB 10.11 local — 99 archivos, 1091 tests, 1 skip (sandbox
Pagopar).

**Dónde mirar primero en O2:** `KNOWN-ISSUES.md` (F1 sigue abierto y O1 no está cerrada del
todo), después `src/domain/messaging/` y `src/app/actions/checkout.ts`.

### 2026-09-02 · O2 — aviso de pedido nuevo al comercio

Fase O2, misma branch fija del entorno (`claude/fable-repo-audit-prompts-cjurpf`, re-creada
desde `main` después de mergear O1); no se usó `phase/o2`.

**Qué existe ahora.** `src/domain/order-notifications.ts`: `notifyOwnerNewOrder(orderId)` arma
el texto (número, total en Gs, método, quién compró, link absoluto a `/admin/pedidos/<id>`),
lo manda por el `MessageSender` de siempre y deja fila en `order_events`
(`actor: "sistema"`, `aviso_dueno_enviado` / `aviso_dueno_fallido: <motivo>`). **No tira
nunca**: el checkout la llama con `void … .catch()` después del commit, también para tarjeta.
Timeout propio de 10 s. Apagado sin `WHATSAPP_NUMBER`, sin sender, o —en Cloud— sin
`WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO`, la variable nueva.

**Decisiones que la próxima sesión no debería reabrir.** (1) `OutgoingMessage` ganó
`templateName?`: Meta aprueba una plantilla por mensaje y el aviso no puede salir con la del
código de login. (2) Se creó `src/domain/order-events.ts` (`recordOrderEvent`) porque el plan
pedía "el helper del dominio" y no existía: eran dos `insert` sueltos. `create-order.ts` ya lo
usa; `transitionOrder()` sigue escribiendo el suyo adentro de su transacción y **no se tocó**.
(3) El aviso sale al **crear** el pedido, no al cobrarlo, con el método de pago en el texto.
(4) Preflight suma `aviso_pedido_nuevo` como advertencia, nunca bloqueo. Sin schema nuevo.

**Verde acá:** typecheck, lint, build, y `pnpm test` con `TEST_DATABASE_URL` contra MariaDB
10.11 — 102 archivos, 1110 tests, 1 skip. Además se corrió el camino de dev a mano: con
`NODE_ENV=development` y `WHATSAPP_NUMBER`, el aviso se imprime en consola y queda el evento
`aviso_dueno_enviado`.

**Dónde mirar primero en S3:** `KNOWN-ISSUES.md` (F1, el swap de `xlsx`, sigue abierto y es
de Anton), y los límites duros de §4.7 — S3 no toca dominio, lib, db, actions, api ni proxy.

### 2026-09-02 · S3 — Playwright en CI

Fase S3, misma branch fija del entorno (`claude/sonnet-3-e2e-playwright-k8u7t1`,
ya existía desde `main` con O1+O2 mergeadas); no se usó `phase/s3`.

**Qué existe ahora.** `playwright.config.ts` (Chromium solamente, `baseURL`
`http://127.0.0.1:3000`, `webServer` que corre `pnpm start` sobre un build ya
hecho). `tests/e2e/helpers.ts` con `realizarCompra(page)` — home → categoría →
producto → carrito → checkout con transferencia — reutilizado por los dos
specs que necesitan un pedido, para no depender del orden de ejecución. Tres
specs: `compra.spec.ts` (invitado, transferencia, aterriza en `/pedido/PY-…?t=…`
y ve el aviso de "sin datos bancarios" — CI no configura `BANCO_*`);
`panel.spec.ts` (`/admin/pedidos` sin cookie → login, entra con el owner de
CI, el pedido queda visible filtrando por número); `csp.spec.ts` (cuatro
tests: home+categoría sin ninguna violación, producto+admin/login y
checkout-con-carrito con **sólo** la violación documentada del chunk de
`next/image` — filtrada por patrón `_next/static/chunks/*.js`, medida a mano
contra un build real antes de escribir el spec —, y el buscador del header
responde). `pnpm test:e2e` = `next build && playwright test`; en CI, el job
`e2e` hace su propio `pnpm build` y corre `playwright test` directo (evita
buildear dos veces).

**Verificación del guardarraíl (§6.1, obligatoria antes de mergear).** Se
sacó a mano `'unsafe-inline'` del `script-src` sin nonce en `src/proxy.ts`,
corrió `csp.spec.ts` (rojo, como tenía que ponerse — la home se queda sin JS)
y se revirtió (`git diff` vacío después).

**Decisión de seed (§6.1 daba a elegir).** `pnpm db:push && pnpm db:seed &&
pnpm create-owner` con `OWNER_EMAIL`/`OWNER_PASSWORD` de entorno, no
`POST /api/setup/init`: es el mismo camino que ya usan los tests de
integración y no depende de que el server ya esté arriba para sembrar.

**Selectores.** Por `id` (`#customerName`, `#customerPhone`, etc.) y no por
`getByLabel` en el formulario de checkout: el WhatsApp flotante
(`whatsapp-fab.tsx`) y el checkbox de novedades también matchean "WhatsApp"
como texto y rompen el accessible-name lookup con "strict mode violation".

**Entorno de esta sesión (sin Docker).** No había `docker` corriendo ni MySQL
— se instaló `mariadb-server` por `apt` (10.11, misma versión que O1/O2) y se
arrancó a mano (`service mariadb start`), con las mismas credenciales de
`docker-compose.yml` (`ecom`/`ecom`, bases `ecom` y `ecom_test`). Los
navegadors de Playwright ya venían pre-instalados en
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; sólo hizo falta
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (el build "full",
no el `headless_shell` que trae por default esta versión de Playwright y que
no estaba pre-instalado) para correr en local — es justo el escape hatch que
pide §6.1, ya en `playwright.config.ts`. El job de CI usa
`playwright install --with-deps chromium`, no depende de esto.

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (102 archivos, 1110
tests, 1 skip) y `pnpm test:e2e` (6/6) contra MariaDB 10.11 local. `pnpm
db:generate` sin drift.

**Dónde mirar primero en S4:** `KNOWN-ISSUES.md` (F1, `xlsx`, sigue abierto y
es de Anton) y §6.2 — `@types/node` ya quedó en una versión más nueva de
"latest" como efecto lateral de instalar `@playwright/test` (`pnpm add -D`
resuelve todo el árbol); S4 decide si fija `^22` como pide el plan o si con
"latest" alcanza, y de paso corre `pnpm outdated` para ver qué más se movió.

### 2026-09-02 · S4 — dependencias, CI y docs

Fase S4, branch `phase/s4` desde `main` (S3 ya mergeada, PR #77).

**Qué existe ahora.** `@types/node` fijo en `^22` (F4); `@types/bcryptjs` afuera (F5) —
`bcryptjs@3` trae sus propios `.d.ts` y `pnpm typecheck` sigue verde. `pnpm update` movió lo
que `pnpm outdated` permitía sin salir de major: `@hookform/resolvers`, `lucide-react`,
`mysql2`, `react-hook-form`, `sonner`, `zod`, `zustand` y varios `devDependencies`; además
`next` y `eslint-config-next` (pineados exactos, no por rango) subieron a mano de `16.3.0` a
`16.3.4` porque el propio plan los nombra como parte de "los rangos ya declarados". `xlsx` no
se tocó — sigue bloqueado, ver `KNOWN-ISSUES.md`. `pnpm-al-dia` vive ahora en
`.github/workflows/pnpm-al-dia.yml` (`schedule: "0 9 * * 1"` + `workflow_dispatch`), con su
comentario explicativo mudado entero; `ci.yml` quedó sólo con `checks` y `e2e`.

**Desvío que no estaba en el plan (bono, no F4–F7).** `pnpm audit` sumó un high nuevo que no
existía en S3: `nanoid` (GHSA-2v37-7h3g-55p8) vía `vite`→`postcss`, arrastrado por el toolchain
de tests (`vitest`/`@vitejs/plugin-react`) al pisar sus propias devDependencies con
`pnpm update`. Es dev-only y no toca runtime, pero como el plan pide "sin highs propios" y acá
sí había arreglo (nanoid ya tiene parche, sólo que `vite` todavía fija una versión vieja de
`postcss`), se resolvió con `overrides: { nanoid: "^3.3.18" }` en `pnpm-workspace.yaml` (no en
`package.json` — pnpm 11 dejó de leer el campo `"pnpm"` ahí, ver el warning si alguien lo
reintenta). Quedan sólo los dos `xlsx` (bloqueados, de Anton) y el `esbuild` de `drizzle-kit`
(dev-only, sin parche todavía) — anotado en §10.

**Docs.** README §"Documentos" ganó la fila `fable/plan.md`; `PLAN.md` gana una línea arriba de
todo apuntando a `fable/plan.md` como plan activo. `CLAUDE.md` ya tenía el puntero (lo agregó
la sesión que escribió este plan) — no se tocó. `KNOWN-ISSUES.md` sigue con la entrada de
`xlsx` (F1, de Anton) y no se borró.

**Cierre.** `pnpm template:diff` corrido a mano contra el propio repo (remote `template` →
`origin`, un `.template-baseline` viejo de prueba, todo descartado después sin commitear):
clasificó bien los 19 commits de diferencia con `*` en los siete que tocan maquinaria. No
explotó.

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (102 archivos, 1110
tests, 1 skip) y `pnpm test:e2e` (6/6), todos contra MariaDB 10.11 local (mismo setup sin
Docker que usó S3: `apt install mariadb-server`, credenciales de `docker-compose.yml`).
`pnpm db:generate` sin drift. `pnpm audit`: 2 highs de `xlsx` (bloqueados) + 1 moderate de
`esbuild` (dev). `pnpm outdated`: sólo majors (`@types/node`, `eslint`, `iron-session`,
`typescript`).

**Fin de las cuatro fases — STOP.** Ver reporte de cierre a Anton después del merge de este PR.

### 2026-09-03 · Métodos de envío — courier, local y retiro

Fase fuera de las cuatro del plan (pedido posterior de Anton), branch `phase/shipping-methods`
desde `main` con S4 ya mergeada (PR #79).

**Qué existe ahora.** Tabla `shipping_methods` (`kind` `courier|local|retiro`, `pricing`
`zona|fijo` + `fixed_price_pyg`, `zone_ids` JSON, `allowed_payment_methods` JSON,
`description`, `is_active`, `position`) y dos columnas nuevas en `orders`:
`shipping_method_id` (nullable, FK `ON DELETE SET NULL` aplicada en `src/db/extras.ts` como
las de cupón y cliente) y `shipping_method_name` como snapshot. Migración
`drizzle/0011_amazing_domino.sql`, generada y commiteada.

En el dominio, `src/domain/shipping.ts` gana `resolveShippingMethods()` —**pura**, sin DB, que
es donde viven las reglas— más `quoteShippingMethods()` y `selectShippingMethod()`.
`computeOrderTotals` acepta `shippingMethodId` y devuelve la lista de métodos válidos, el
elegido y el rechazo si lo hubo; `createOrder` lo re-valida adentro de su transacción y
re-cotiza el precio, con dos errores de dominio nuevos (`ShippingMethodRejectedError`,
`PaymentMethodNotAllowedError`) en vez de un 500. ABM en
`src/domain/admin-shipping-methods.ts` + cuatro acciones owner-only en
`src/app/actions/admin-shipping.ts`, dibujadas por `ShippingMethodsManager` en la mitad de
abajo de `/admin/envios`. El checkout muestra los métodos como radio después de la ciudad y
filtra los medios de pago al elegir uno. El método sale además en el aviso de pedido nuevo al
comercio y en la ficha de `/admin/pedidos/[id]`.

**Decisiones que la próxima sesión no debería reabrir.** (1) **La tabla vacía es el estado de
toda tienda ya clonada**, no un caso borde: sin filas hay un único método implícito
(`id: null`, "Envío a domicilio") con el precio de la zona y los tres medios de pago, y el
checkout ni siquiera dibuja la pregunta nueva. Es lo que hace que actualizar no cambie nada en
una tienda que ya vende. (2) Un método con zonas declaradas aplica sólo si la ciudad matcheó
**exacto**: la que cae en "la más cara" por descarte no está en ninguna lista, y ofrecerle
contra entrega ahí es prometer una visita que nadie va a hacer. (3) Sin método elegido se toma
**el primero por `position`**, nunca "el que acepte el medio de pago que mandó": el precio del
envío no puede depender de cómo se paga. (4) `retiro` se normaliza en el ABM (₲0, sin zonas,
sin tarifa) en vez de pedirle coherencia al formulario. (5) **No hay** regla de "el último
activo" como en zonas: quedarse sin métodos vuelve al implícito y no regala flete. (6)
`pnpm preflight` sigue siendo env-only en el reporte que decide el código de salida; el control
de métodos huérfanos se imprime **aparte, después**, es el único que lee la base y nunca
bloquea.

**Tests.** `tests/unit/shipping-methods.test.ts` (26 casos, sin DB: precio por tipo,
aplicabilidad por zona, medios de pago, selección y el aviso de preflight),
`tests/integration/shipping-methods.test.ts` (20 casos contra MySQL: tienda sin métodos,
tarifa plana, retiro en ₲0, método inválido, pago no permitido, precio manipulado —que sale
como `TotalChangedError`—, y el ABM) y un caso Playwright en `tests/e2e/compra.spec.ts` que
elige la moto local y verifica que transferencia desaparece y contra entrega queda marcada
sola. `tests/e2e/helpers.ts` se partió en `completarCheckout` + `confirmarPedido` para eso.

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (104 archivos, 1156
tests, 1 skip) y `pnpm exec playwright test` (7/7), todos contra MariaDB 10.11 local — mismo
setup sin Docker que usaron S3 y S4, con `PLAYWRIGHT_CHROMIUM_EXECUTABLE` apuntando al
Chromium del entorno. `pnpm db:generate` sin drift.

**Para adoptarlo en una tienda ya clonada:** `pnpm template:diff`, cherry-pick de este commit
(es maquinaria: dominio + schema + migración) y después configurar las formas de entrega desde
`/admin/envios`. Sin configurar nada, la tienda se comporta exactamente como antes.

### 2026-09-03 · `xlsx` → `exceljs` — cierra los dos CVEs (F1, por fin)

Fase fuera de las cuatro del plan (pedido posterior de Anton, revierte la decisión de §1.3),
branch `phase/exceljs` desde `main` con `phase/shipping-methods` ya mergeada. Anton contestó
lo que §1.3 dejaba previsto: en vez de esperar a que se destrabe el CDN de SheetJS
(`KNOWN-ISSUES.md`, bloqueado desde O1), cambiar de librería.

**Qué cambió.** `src/lib/spreadsheet.ts` reimplementado con `exceljs` en vez de `xlsx`:
`new ExcelJS.Workbook()` + `workbook.xlsx.load(bytes)` en vez de `XLSX.read`, y un
`sheetToCsv()` propio (recorre `worksheet.eachRow`/`getCell`, arma el CSV con `;` y comillas
como lo hacía `XLSX.utils.sheet_to_csv`) porque `exceljs` no trae un helper de CSV. `pnpm
remove xlsx && pnpm add exceljs`, lockfile regenerado con `pnpm install`.

**Diferencias de comportamiento (documentadas, no bugs).**
1. **`spreadsheetToCsvText` ahora es `async`** (devuelve `Promise<string>`, antes `string`).
   `exceljs` no tiene una API síncrona para leer bytes — no había forma de mantener la firma
   síncrona sin volver a depender de una librería con los mismos CVEs. El único llamador
   (`readCatalogFile` en `src/app/actions/admin-products.ts`) ya era `async` y ya hacía
   `await` sobre el resultado del `readCatalogFile`; el cambio fue agregar el `await` en la
   línea que llama a `spreadsheetToCsvText`.
2. **Se cae el soporte de `.xls`** (Excel 97-2003, formato binario OLE). `exceljs` sólo lee
   `.xlsx` (zip + XML) — es la razón por la que §1.3 había descartado el swap en O1. Un
   `.xls` ahora cae en el mismo `UnsupportedSpreadsheetError` que cualquier extensión
   desconocida ("Formato ... no soportado. Subí un archivo .csv o .xlsx."), en vez de
   convertirse. Se sacó `.xls` del `accept` del input en
   `src/components/admin/catalog-import.tsx`. No se evaluó ninguna librería que lea `.xls`
   sin CVEs y mantenida en npm — las que existen (`node-xlrd` y similares) están abandonadas;
   cambiar de formato binario legacy por una superficie sin parches habría sido peor que la
   pérdida de soporte. Mitigación: Excel exporta `.xlsx` desde 2007, así que en la práctica es
   pedirle al comercio que reexporte.
3. Mensaje de `.xlsx` corrupto: antes `Unsupported ZIP file` (de `xlsx`), ahora
   `Corrupted zip: can't find end of central directory` (de `exceljs`/`jszip`). Sigue siendo
   el error crudo de la librería, no `UnsupportedSpreadsheetError` — el bug ya anotado en
   `KNOWN-ISSUES.md` sigue igual de abierto, sólo cambió el texto exacto.
4. Fechas: si algún día una celda trae un `Date` (hoy no hay fixture ni caso real que lo
   ejercite), sale como ISO 8601 (`toISOString()`) en vez de lo que hiciera `xlsx`. No hay
   test que lo cubra porque no hay caso de uso hoy — se documenta para cuando aparezca.

**Bug de tipado de `exceljs`, no nuestro.** `Xlsx.load()` está tipado en el `.d.ts` que trae
el propio paquete con un `Buffer` local (`declare interface Buffer extends ArrayBuffer {}`,
sombra el `Buffer` global de Node dentro de ese archivo), incompatible con las propiedades
nuevas de `ArrayBuffer` en TS/`lib.esnext` (`resizable`, `maxByteLength`, ...). En runtime
`load()` le pasa el buffer tal cual a `JSZip.loadAsync`, que acepta `Buffer` sin problema —
sólo el tipado está mal. Cast puntual en `spreadsheetToCsvText` (`as unknown as
Parameters<typeof workbook.xlsx.load>[0]`), comentado en el código.

**`pnpm audit`.** Los dos highs de `xlsx` (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)
desaparecen. `exceljs` trae `uuid@^8.3.0` sin actualizar, con un moderate propio
(GHSA-w5hq-g745-h8pq) — mismo patrón que el `nanoid` de S4: `overrides: { uuid: "^11.1.1" }`
en `pnpm-workspace.yaml` (API de `v4()` estable entre 8 y 11, exceljs sólo usa eso). Queda
sólo el `esbuild` de `drizzle-kit` (dev-only, ya en el backlog de S4).

**Tests.** `tests/unit/spreadsheet.test.ts` se mantiene con los mismos seis casos (ahora
`async`, y el helper `libroDePrueba` arma los `.xlsx` de prueba con `exceljs` en vez de
`xlsx`) más uno nuevo que fija el punto 2: un `.xls` rechazado con
`UnsupportedSpreadsheetError`. Ninguna expectativa de las que ya existían cambió.

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (104 archivos, 1158 tests, 546
skip — sin `TEST_DATABASE_URL`, no había MySQL disponible en este entorno; nada de lo tocado
depende de la base) y `pnpm build`. `pnpm audit`: 1 moderate (`esbuild`, dev, preexistente).

**Para adoptarlo en una tienda ya clonada:** `pnpm template:diff`, cherry-pick de este commit
(toca `src/lib/spreadsheet.ts`, que es maquinaria — mueve plata de proveedor no, pero es el
único camino de import de catálogo) y avisar al comercio que a partir de ahora sólo `.xlsx`
(no `.xls`).

### 2026-09-03 · E2E tolerantes a la piel — contrato de `data-testid`

Fase fuera de las cuatro del plan (pedido posterior de Anton, S3/ecom#77), branch
`phase/e2e-testids` desde `main` con S4 y "Métodos de envío" ya mergeadas.

**El problema.** Los specs de S3 localizaban por texto y markup del seed —nombre de categoría
("Electrónica"), slug de producto demo ("auriculares-bluetooth-tws"), botones por accessible
name—, así que al sincronizar la maquinaria una tienda que ya rediseñó su piel rompe los tests
(pasó en `antonmarklundcom/lenceria` PR #29: 4 tests rojos por selectores del catálogo demo).
Cada tienda termina parcheando los tests localmente, lo que genera conflictos en la siguiente
sincronización.

**Qué existe ahora.** `src/lib/testids.ts` —un objeto `TESTIDS` con ~20 constantes, documentado
inline— es la única fuente de verdad del contrato; `tests/e2e/testids.ts` lo re-exporta para que
los specs lo importen corto. Los ids cubren exactamente lo que los tres specs de S3 tocan:
navegación (`header-category-link`, `product-card` con `data-slug`, `header-cart-link`,
`product-add-to-cart`, `cart-checkout-link`), checkout (`checkout-name/phone/doc-type/doc-number/
city/address`, `checkout-shipping-method` con `data-slug` del método, `checkout-payment-method`
con `data-value` del enum de dominio, `checkout-total`, `checkout-submit`), confirmación
(`order-confirmation-number`) y admin (`admin-login-email/password/submit`, `admin-nav-orders`,
`admin-orders-search-input/submit`). Se pusieron donde correspondía sin tocar lógica —Button/Input
ya reenvían `...props`, así que es un atributo más— salvo `ShippingMethodView` (`src/app/actions/
shipping-quote.ts`), que ganó el campo `slug` para que el checkout pueda ponerlo en el radio (ya
vivía en `ShippingMethodOption`, sólo faltaba threadearlo al tipo que ve el navegador).

**Los tres specs, reescritos.** `helpers.ts` ya no asume "Electrónica" ni ningún slug: entra a la
home, clickea el primer `header-category-link`, el primer `product-card`, agrega al carrito
(que abre el carrito solo — `cart-store.ts`, `add()` deja `isOpen: true`) y sigue por
`cart-checkout-link` en vez de un `page.goto("/checkout")` a mano, para ejercitar el carrito de
verdad. Ganó dos locators de un solo uso, `shippingMethodRadio(page, slug)` y
`paymentMethodRadio(page, value)`, que arman el selector `[data-testid="…"][data-slug/data-value="…"]`
— así el spec de formas de entrega (Fase 3) deja de matchear por el nombre que tipeó el spec
("Moto del barrio E2E") y matchea por el slug, que es lo estable. `csp.spec.ts` tenía los dos
hardcodeos peores —`/categoria/electronica` y `/producto/auriculares-bluetooth-tws` en `page.goto`
directo, más `"auriculares"` como término de búsqueda— y ahora resuelve la primera categoría y el
primer producto activos contra la base en un `beforeAll` (mismo patrón que ya usaba
`compra.spec.ts` para las formas de entrega), y busca por el nombre real del producto encontrado.

**Guardarraíl nuevo, `tests/unit/testids-contrato.test.ts`.** Dos cosas, mismo patrón que
`marca-centralizada.test.ts` (lee el código fuente, no confía en una lista a mano): (1) cada id de
`TESTIDS` tiene que aparecer referenciado en `src/` fuera de su propia definición —un id que nadie
consulta es un hook fantasma que se puede borrar sin que ningún test se entere—, y ningún
`data-testid`/`getByTestId` de un spec apunta a un string fuera del contrato; (2) ningún spec de
`tests/e2e/**` contiene, como literal, un nombre o slug de `scripts/seed-data.ts` —leído del
módulo de verdad, no copiado a mano, así que un producto nuevo en el seed entra solo al control—.
La regla es más ancha que "sólo adentro de `getByText`/`getByRole`": un slug hardcodeado en un
`page.goto(...)` rompe exactamente igual, y era justo el caso de `csp.spec.ts`.

**Verificado que el contrato aguanta un rediseño.** Con la tienda local ya sembrada, se renombró
a mano la primera categoría y el primer producto en MySQL (nombre y slug, sin tocar el seed) y se
corrió `playwright test` de nuevo sin cambiar una línea de código: los 7 casos siguen en verde
—la única falla que apareció fue un artefacto del propio experimento (el home cacheado por ISR
seguía linkeando al slug viejo hasta la revalidación), no algo que un spec real fuera a pisar—.
Se revirtió el cambio a mano después de verificar.

**Docs.** `NEW-STORE.md` §5 gana una subsección ("La única excepción: los `data-testid`") que
dice la regla completa: rediseñar es libre, sacarle el atributo a un elemento que ya lo tiene no.
`CLAUDE.md` apunta ahí en una línea, bajo la tabla de maquinaria vs. piel.

**Verde acá:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (105 archivos, 1159 tests, 1 skip) y
`pnpm exec playwright test` (7/7), contra MariaDB 10.11 local instalada a mano (mismo camino sin
Docker que S3/S4/"Métodos de envío"), con `PLAYWRIGHT_CHROMIUM_EXECUTABLE` apuntando al Chromium
`1194` pre-instalado (el `chromium_headless_shell` que `@playwright/test` pide por versión no
estaba, mismo escape hatch que documentó S3). `pnpm db:generate` sin drift — este PR no toca
`schema.ts`.

**Para una tienda ya clonada:** nada que migrar. Es sólo `src/lib/testids.ts` nuevo, atributos
`data-testid` agregados a markup existente (no cambia nada visible ni de comportamiento) y specs
de e2e reescritos. Al sincronizar, la única regla nueva es la de NEW-STORE.md §5: no borrar un
`data-testid` del contrato al repintar. Si una tienda ya tiene sus propios specs de e2e parchados
a mano contra el catálogo viejo, éste es el momento de migrarlos al contrato en vez de seguir
parchando.

### 2026-09-03 · `pnpm template:sync` — traer la maquinaria del template con un comando

Fase fuera de las cuatro del plan (pedido posterior de Anton), branch `phase/template-sync`
desde `main` con `E2E tolerantes a la piel` ya mergeada.

**El problema.** `pnpm template:diff` (§ arriba, PR #29/#39/#40) dice qué commits de maquinaria
le faltan a una tienda, pero traerlos seguía siendo cherry-pick manual, commit por commit.
Sincronizar tres tiendas (lenceria #29, productos #9, mascota #9) costó tres sesiones de IA, y
los conflictos fueron siempre los mismos y aburridos: `fable/**` (las tiendas no lo tienen),
`pnpm-lock.yaml`, y `.github/workflows/ci.yml`. Cero conflictos reales en `src/`.

**Qué existe ahora.** `scripts/template-shared.ts` — extraído de `template-diff.ts` sin
duplicar nada — con `MAQUINARIA`/`MIXTOS`, `BASELINE_FILE`, el parseo de `git log` y de
`.template-baseline`, y un `gitEn(cwd, args)`/`commitsClasificados(cwd, baseline, ref)`
parametrizados por directorio (antes `template-diff.ts` asumía siempre `process.cwd()`).
`template-diff.ts` ahora importa de ahí y re-exporta los mismos nombres — el test existente
(`tests/unit/template-diff.test.ts`) no se tocó.

`scripts/template-sync.ts` (`pnpm template:sync`) hace el trabajo: toma la lista de
`commitsClasificados`, se queda sólo con los `*` de maquinaria en orden cronológico, y por cada
uno corre `git cherry-pick -x`. El `-x` dejó el trailer `(cherry picked from commit …)` que hace
al comando reanudable sin guardar estado propio — cada corrida vuelve a leer el log de la rama
actual y descarta lo que ya tiene ese trailer, así que cortar en un conflicto y volver a correr
`pnpm template:sync` retoma justo donde quedó. Precondiciones antes de tocar nada: rama actual
≠ `main`, working tree limpio (con un mensaje aparte si lo sucio es un cherry-pick sin terminar),
remoto `template` (lo agrega si falta) y `.template-baseline` presentes.

Conflicto, tres casos se resuelven solos y cualquier otro para en seco:
`fable/**` se descarta del lado del template (`git rm`); `pnpm-lock.yaml` nunca se toca a
mano, se regenera con `pnpm install --lockfile-only`; los workflows de
`.github/workflows/*.yml` toman la versión del template (`git checkout --theirs`). Si esos son
los únicos archivos en conflicto, el commit sigue con `--continue` — o con `--skip` si
resolverlos deja el commit vacío (pasa con un `fable/`-only: al descartar el lado del template
no queda ningún cambio real que commitear, y ahí `--continue` se niega con "nothing to commit";
se detectó corriendo el escenario a mano antes de escribir el test). Cualquier archivo fuera de
esos tres —típicamente `src/`, porque la tienda y el template tocaron la misma línea— corta la
corrida ahí: deja todo lo anterior ya aplicado, no toca el baseline, e imprime el commit, el
archivo y los tres pasos para terminarlo a mano y retomar.

Al final, si algún commit tocó `package.json` corre `pnpm install`; después, salvo
`--sin-tests`, `pnpm typecheck && pnpm lint && pnpm test`. Si algo falla ahí, los commits
quedan aplicados pero `.template-baseline` **no** se mueve — nada que reintentar se pierde. Si
todo pasa, escribe `.template-baseline` (al HEAD del template, o al `--hasta` si se usó) y
commitea "Sincronizar maquinaria del template hasta `<sha>`". Flags: `--dry-run`, `--hasta
<sha>`, `--sin-tests`.

**Tests.** `tests/unit/template-sync.test.ts` — puro, sin git ni red: `parseArgs`,
`ordenarParaAplicar` (filtra maquinaria y da vuelta el orden de `git log`), `shasYaAplicados`
(lee los trailers de `cherry-pick -x` de un log fixture), `commitsPendientes`, `cortarHasta`
(incluye el prefijo corto y el "no está en la lista" de un sha ya aplicado o inexistente),
`clasificarConflicto` (los tres casos automáticos + "cualquier otra cosa es manual") y
`necesitaInstall`. `tests/integration/template-sync.test.ts` arma dos repos git temporales sin
historia compartida (mismo supuesto que un template y una tienda de verdad), con un `stock.ts`
de tres líneas donde la del medio nunca cambia — le da a los merges de 3 vías el contexto para
separar limpio la customización de la tienda (línea 1) del cambio de maquinaria (línea 3) en un
commit, y de paso deja la línea 1 libre para que un commit posterior choque de verdad ahí. Tres
casos: (1) trae sólo la maquinaria — el commit de piel (README) nunca se intenta y el conflicto
de `fable/` se resuelve solo sin perder el resto del commit; para en el conflicto real de `src/`
sin tocar el baseline; (2) correr de nuevo con el cherry-pick a medio resolver avisa
`cherry-pick --continue`, no reintenta a ciegas; (3) resuelto a mano y continuado, la corrida
siguiente ve los tres trailers y no repite nada.

**Docs.** `NEW-STORE.md` § "Arreglos que aparecen después" pasa a recomendar `template:sync`
como el camino por defecto (rama → sync → `template:diff` para lo que quedó marcado con `~` →
PR), con `template:diff` + cherry-pick manual como alternativa si se prefiere ir commit por
commit. `CLAUDE.md` menciona el comando en la sección "Si este repo es una tienda".

**Verde acá:** `pnpm typecheck`, `pnpm lint`, y `pnpm test` — 64 archivos, 640 tests (43
archivos/546 tests de integración contra MySQL se saltan solos: no había `TEST_DATABASE_URL` en
este entorno). Los 44 tests nuevos de `template-sync` (unitarios + integración con git real) no
dependen de la base y corrieron completos. CI (`.github/workflows/ci.yml`) sí trae MySQL como
servicio, así que ahí corre la suite completa.

**Para una tienda ya clonada:** nada que migrar — es un script nuevo más. La próxima vez que
haga falta traer maquinaria del template, `pnpm template:sync` en una rama reemplaza al
cherry-pick manual de siempre.

### 2026-09-03 · O3 — Avisos por WhatsApp al cliente: confirmado, pagado, enviado

Fase fuera de las cuatro del plan (pedido posterior de Anton, ecom#76 → O3), branch
`phase/customer-whatsapp` desde `main` con #80/#84/#85 ya mergeadas. Maquinaria.

**Qué existe ahora.** `src/domain/order-customer-notifications.ts`: `notifyCustomerOrderEvent(orderId,
kind)` con `kind: "confirmado" | "pagado" | "enviado"`. Arma el texto (`customerNoticeBody`, sin red,
testeable aparte — nombre de pila, número, total en Gs, nombre de la tienda en "confirmado", método
de envío cuando existe, la nota del admin como número de seguimiento en "enviado", siempre el link
tokenizado al pedido), lo manda por el `MessageSender` de siempre y deja fila en `order_events`
(`actor: "sistema"`, `aviso_cliente_<kind>` / `aviso_cliente_<kind>_fallido: <motivo>`). **No tira
nunca** — mismo `withTimeout`/recorte de motivo que el aviso al comercio, ahora en
`src/domain/notify-timing.ts` para no repetirlo entre los dos archivos.

**Dónde se dispara — la decisión que importa de esta fase.** No en las server actions: "confirmado"
sale de `createOrder()` mismo, después de que su transacción commiteó; "pagado" y "enviado" salen de
un hook al final de `transitionOrder()` (`orders.ts`), disparado sólo cuando `result.changed` y el
`to` es uno de esos dos estados. `pagado` se entra por cuatro caminos sin relación entre sí (panel,
comprobante aprobado, webhook de Pagopar, recuperación de pago tardío) y engancharlos uno por uno es
justo el tipo de cosa que un quinto camino olvida — centralizarlo en `transitionOrder` cubre los
cuatro gratis. El caso nested (`transitionOrder` llamado con `options.executor`, adentro de la
transacción de quien llama) se resuelve sin tocar esa conexión: `notifyCustomerOrderEvent` abre la
suya propia y relee `orders`, así que en el peor caso su `SELECT` espera el lock de fila hasta que el
commit externo lo libera — no hay forma de que toque la transacción que se está por cerrar. Detalle
completo en ARCH.md §5.2.1.

**Decisión que la próxima sesión no debería reabrir: el interruptor de cada aviso.** El aviso al
comercio (O2) sale por la consola de dev con sólo `WHATSAPP_NUMBER` puesto, sin plantilla. Acá se
decidió lo contrario a propósito: `resolveCustomerNotifier` exige la plantilla de ESE aviso incluso
para el sender de consola. Los tres son decisiones independientes de cada tienda ("¿aviso cuando
confirmo? ¿cuando pago?"), no un default que conviene ver andar sin haberlo pedido — y de yapa, esto
es lo que mantiene inertes (cero red, cero fila nueva) los ~100 tests de integración existentes que
crean y transicionan pedidos sin stubear ninguna `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_*`.

**Idempotencia.** El estado del pedido ya garantiza que `pagado` y `enviado` se entran una sola vez
cada uno (§3, sin arista de vuelta), así que en la práctica cada aviso sale como máximo una vez. Igual
`notifyCustomerOrderEvent` chequea si ya existe la fila `aviso_cliente_<kind>` de éxito para ese
pedido antes de mandar, como segunda guarda barata.

**Variables nuevas en `.env.example`:** `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_CONFIRMADO`,
`WHATSAPP_CLOUD_TEMPLATE_CLIENTE_PAGADO`, `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_ENVIADO`. Sin destino
propio — usan el WhatsApp que dejó cada compradora en su pedido. Preflight suma tres controles
(`aviso_cliente_confirmado/pagado/enviado`), los tres advertencia, nunca bloqueo. Sin schema nuevo.
Admin: los avisos aparecen solos en el historial de `/admin/pedidos/[id]` (la misma lista que ya
mostraba `aviso_dueno_enviado`/`_fallido`) — no hizo falta markup nuevo.

**Verde acá:** typecheck, lint, build, y `pnpm test` con `TEST_DATABASE_URL` contra MariaDB 10.11 —
109 archivos, 1188 tests, 1 skip (subieron 4 archivos y ~29 tests desde la fase anterior). `pnpm
db:generate` sin drift.

**Las tres plantillas, para cargar en Meta** (un parámetro en el cuerpo, igual que las anteriores):

- CONFIRMADO: `Hola {nombre}! Tu pedido {numero} en {tienda} quedó confirmado. Total: {total}.` (+
  `Entrega: {metodo}.` si hay método de envío) + `Seguilo acá: {url}`.
- PAGADO: `Hola {nombre}! Recibimos el pago de tu pedido {numero} ({total}). ¡Gracias por tu compra!`
  + `Seguilo acá: {url}`.
- ENVIADO: `Hola {nombre}! Tu pedido {numero} ya salió.` (+ `Entrega: {metodo}.` si hay método, +
  `Nota: {nota}` si el admin dejó un número de seguimiento) + `Seguilo acá: {url}`.

## 10. Backlog

- Vulnerabilidad transitiva de `pnpm audit`: `esbuild` vía `drizzle-kit` (sólo dev, no hay
  versión de `drizzle-kit` que la arregle todavía). `nanoid` (S4, vía `vite`/`postcss` del
  toolchain de tests) se resolvió con un `overrides` en `pnpm-workspace.yaml`.
- Render tests de las páginas de `/admin` (hoy sólo `home-hero.test.tsx` renderiza React).
- Rate limit compartido (DB) el día que haya más de un proceso.
