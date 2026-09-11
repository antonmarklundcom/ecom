# fable/REVIEW.md — Revisión de Fable 5.1 · 2026-09-02

Revisión del template `antonmarklundcom/ecom` en `main` (commit `3bb17a4`), hecha con el
prompt de `fable/PROMPT.md`. Lo que se encontró, lo que está bien y lo que Anton tiene que
decidir. El plan que sale de esto está en `fable/plan.md`.

## 1. Veredicto

Es el template de tiendas online paraguayas (Next.js 16 + Drizzle + MySQL de Hostinger),
~30.600 líneas de TypeScript, con FASE 1 y FASE 2 cerradas. **Está en muy buen estado**: el
camino de la plata, el stock y los estados del pedido no tienen un defecto confirmable; los
guards, la idempotencia del webhook y el CSP están mejor resueltos que en la mayoría de los
proyectos en producción. Lo que sí importa, en orden: (1) una dependencia con dos CVEs sin
parche en npm parseando archivos que sube el staff, (2) el comercio no se entera de un pedido
nuevo salvo que la compradora toque el botón de WhatsApp, y (3) nadie abre un navegador de
verdad contra el build en CI, que es la única red que atrapa la clase de bug del último
commit (el CSP que dejaba la home sin JavaScript).

## 2. Lo que se corrió

| Chequeo | Resultado |
|---|---|
| `pnpm typecheck` | verde |
| `pnpm lint` | verde |
| `pnpm test` (unitarios + integración contra MariaDB 10.11 local) | 97 archivos, 1070 tests verdes, 1 skip (sandbox Pagopar sin credenciales) |
| `pnpm build` | verde |
| `pnpm audit` | 3 high (2 en `xlsx`, 1 en `nanoid` vía `next`), 1 moderate (`esbuild` vía `drizzle-kit`, sólo dev) |

Los tests de integración corrieron contra MariaDB y no MySQL 8 porque acá no hay Docker.
Que pasen igual es una buena señal de portabilidad, no una garantía: el CI sigue siendo la
verdad.

## 3. Hallazgos (confirmados contra el código)

| id | Sev. | Área | Dónde | Qué pasa | Por qué importa | Arreglo |
|---|---|---|---|---|---|---|
| F1 | **high** | seguridad / deps | `package.json:53`, `src/lib/spreadsheet.ts:29` | `xlsx@0.18.5` es la última versión que SheetJS publicó en npm; arrastra prototype pollution (GHSA-4r6h-8v6p-xvw6) y ReDoS (GHSA-5pgg-2g8v-p4x9) que sólo se parchearon en el CDN propio de SheetJS (≥0.19.3). `XLSX.read()` corre sobre los bytes de un archivo subido por cualquier cuenta `staff`. | Un `.xlsx` armado a propósito cuelga el proceso de Node (el único slot de la tienda) o contamina prototipos. El límite de 10 MB no ayuda contra ReDoS. | Reemplazar la fuente del paquete por el tarball oficial (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — pnpm lo instala igual — y documentar que Dependabot no lo va a mover. Alternativa: aceptar sólo CSV. Ver pregunta P1. |
| F2 | **medium** | operación del comercio | `src/domain/create-order.ts`, `src/domain/order-messages.ts`, `TASKS.md:149` | El único "aviso" de pedido nuevo es un link `wa.me` que la **compradora** decide tocar o no. El servidor no le avisa al comercio por ningún canal. `PLAN.md:241` ya lo tiene en backlog. | Un pedido por transferencia con comprobante subido puede quedar 24 h sin que nadie lo vea. En una tienda chica eso es una venta perdida y una compradora que escribe "¿y mi pedido?". | Usar el `MessageSender` que ya existe (`src/domain/messaging/`): con credenciales de WhatsApp Cloud y una plantilla aprobada, mandarle al `WHATSAPP_NUMBER` del comercio un mensaje por pedido nuevo, **después del commit y sin poder fallar el pedido**. Sin credenciales, apagado (regla de `.env.example`). Ver pregunta P2. |
| F3 | **medium** | tests / CI | `.github/workflows/ci.yml`, `tests/` | No hay ningún test que abra un navegador contra `next build`. `tests/unit/csp-isr.test.ts` y `security-review.test.ts` hacen string-matching sobre el fuente de `src/proxy.ts`; la función `proxy()` nunca se invoca en un test. | La clase de bug del commit `5a1db69` (nonce contra HTML cacheado = home sin JS) sólo la ve un navegador. Un template que se clona para cobrar plata no debería depender de que alguien lo pruebe a mano. | Un job `e2e` en CI con Playwright (Chromium ya está en el entorno de Anton): home → producto → carrito → checkout por transferencia → `/pedido/...` → login admin → el pedido aparece; y cero violaciones de CSP en consola. Más un test unitario directo de `proxy()`. |
| F4 | **low** | deps | `package.json:62` | `"@types/node": "latest"` instala hoy `26.3.0`, pero `engines` dice `<25` y CI corre Node 22. | `tsc` acepta APIs que en el runtime real no existen; es el único `latest` del archivo. | Pinear `^22`. |
| F5 | **low** | deps | `package.json:59` | `@types/bcryptjs@3.0.0` figura como *deprecated*: `bcryptjs@3` ya trae sus propios tipos (`node_modules/bcryptjs/index.d.ts`). | Ruido en `pnpm outdated`, y dos fuentes de tipos para el mismo paquete. | Sacarlo. |
| F6 | **low** | validación | `src/lib/schemas.ts:35,44` | `customerEmail: z.email()` y `shipMapsUrl: z.url()` no tienen `.max()`; las columnas son `varchar(200)` y `varchar(500)` (`schema.ts:175,184`). | Un body armado a mano con un email de 300 caracteres pasa Zod y revienta en el INSERT: un 500 en vez de un error de validación. No corrompe nada. | `.max(200)` y `.max(500)`, y un grep por el mismo patrón en los schemas de `/cuenta` y del panel. |
| F7 | **low** | CI | `.github/workflows/ci.yml:96-128` | El job `pnpm-al-dia` consulta `registry.npmjs.org` en cada push y PR. | Es un job aparte y está documentado como tradeoff, pero un registry caído pone rojo un PR que no tiene nada que ver. | Moverlo a `schedule: weekly` + `workflow_dispatch`. |

**Descartado a propósito** (los subagentes lo marcaron; el repo ya lo explica como decisión):
`?secret=` en el cron (documentado en `.env.example`), rate limit en memoria (documentado en
`src/lib/rate-limit.ts`, correcto para un slot único), falta de `loading.tsx` en producto y
categoría (PLAN.md PR H explica por qué sería un bug tenerlo), el chunk de `next/image` sin
nonce (bug de Next 16.3, documentado en `src/proxy.ts`).

## 4. Lo que está bien — no "mejorar"

- **`transitionOrder` es el único escritor de `orders.status`** y `secureStockForPayment`
  re-valida stock adentro de la misma transacción por cada camino a `pagado`. Hay un test
  que greppea el fuente para que siga siendo así (`no-raw-status-update.test.ts`).
- **Plata entera de punta a punta**: `BIGINT`, `Math.floor`, descuento repartido por línea
  con el resto a la línea más grande, IVA por línea, umbral de envío gratis medido sobre el
  subtotal sin descuento. `pnpm reconcile` cruza ocho invariantes contra la misma tabla de
  transiciones que usa el dominio.
- **Idempotencia con la base, no con lecturas previas**: webhook (`UNIQUE(provider,
  event_key)` + una transacción), cupones (`FOR UPDATE`), pagos manuales (`INSERT IGNORE`),
  tokens de login (`UPDATE … WHERE consumed_at IS NULL` + lectura de confirmación).
- **Dos poblaciones, dos cookies, dos secretos** (`ecom_admin` / `ecom_cliente`); ningún
  camino de `customers` a `/admin`. Los guards son la primera línea de cada server action y
  `admin-guards.test.ts` los clava acción por acción.
- **Rutas con secreto (cron, setup, webhook)**: 503 sin secreto, `timingSafeEqual`, rate
  limit antes de comparar, respuestas sin detalle. Tres veces el mismo patrón, bien.
- **CSP con nonce donde hay sesión o plata, y sin nonce sólo en catálogo cacheado**, con la
  razón escrita al lado. Uploads validados por magic bytes y SVG rechazado. CSV export
  escapa `=+-@`.
- **Herramientas de operación** (`preflight`, `reconcile`, `backup`, `doctor`,
  `template:diff`, `nueva-tienda`, `bootstrap:repo`) con dry-run por defecto y sin imprimir
  secretos. CI falla si `schema.ts` se despega de `drizzle/`.
- **Los comentarios explican el modo de falla que evitan**, no lo que hace el código. Es lo
  que hace que una sesión nueva no "arregle" una decisión.

## 5. Preguntas para Anton (cada una con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | `xlsx`: ¿tarball oficial de SheetJS (0.20.x), sólo CSV, o `exceljs`? | **Tarball oficial.** Mantiene `.xls`/`.xlsx`, un cambio de una línea en `package.json`, mismos tests. Dependabot no lo mueve: anotarlo en NEW-STORE.md. `exceljs` no lee `.xls` y pesa más; sólo-CSV le saca una feature al comercio. |
| P2 | Aviso de pedido nuevo al comercio (F2): ¿entra ahora, en el mismo `MessageSender` de WhatsApp Cloud? Necesita una plantilla más aprobada por Meta. | **Sí, como fase Opus-2.** Apagado sin credenciales, nunca falla el pedido, deja rastro en `order_events`. Es la diferencia entre "tienda" y "formulario que nadie mira". |
| P3 | ¿Playwright en CI (F3)? Suma ~3–4 min por PR. | **Sí.** Tres specs, no cuarenta. Es el único test que ve lo que ve la compradora. |
| P4 | Rate limit en memoria: ¿dejarlo? | **Dejarlo.** Un slot de Node, documentado. Cambiarlo es trabajo sin bug que lo pida. |

## 6. Lo que se arregló en esta sesión

Nada en el código. Sólo se agregó la carpeta `fable/` (este archivo, `PROMPT.md`, `plan.md`
y `prompts/`). Todos los hallazgos van al plan.
