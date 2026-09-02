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

## 10. Backlog

- Vulnerabilidades transitivas de `pnpm audit`: `nanoid` vía `next`/`postcss` (esperar el
  bump de Next), `esbuild` vía `drizzle-kit` (sólo dev).
- Notificaciones salientes a la compradora (pedido confirmado / enviado) por WhatsApp Cloud
  — `PLAN.md:241`; O2 deja el sender listo para eso.
- Render tests de las páginas de `/admin` (hoy sólo `home-hero.test.tsx` renderiza React).
- Rate limit compartido (DB) el día que haya más de un proceso.
