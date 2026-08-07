# TASKS.md — Sprint activo: **PR #4 · Admin & Hardening**

Stack: Next.js 15 + Drizzle + **Hostinger MySQL** + **Hostinger Node.js** + Cloudinary.
Marcá `[x]` al terminar. Cada bloque es un commit.

---

## 0. Decisiones bloqueantes (antes de escribir código)
- [ ] **Qué cuenta de Hostinger y qué slot Node.js** usa este proyecto (hay 10 slots por cuenta — verificar cuáles están libres)
- [ ] Confirmar que el plan de Hostinger incluye **Node.js** (los planes sólo-PHP no sirven para Next.js)
- [ ] Dominio / subdominio para la tienda
- [x] **Métodos de pago del MVP: SPI/QR manual + contra entrega.** Pagopar queda para el PR #5, post-lanzamiento
- [ ] Datos bancarios reales (Banco, titular, RUC, nro. de cuenta) + imagen del QR SPI — **el código ya está listo**: completá `COMERCIO_BANCO` / `COMERCIO_TITULAR` / `COMERCIO_RUC` / `COMERCIO_CUENTA` (+ `COMERCIO_ALIAS` / `COMERCIO_QR_URL`) y la página de pago se enciende sola
- [ ] Número de WhatsApp del comercio en formato `+5959XXXXXXXX`
- [x] ~~Credenciales de sandbox de Pagopar~~ — no bloquean nada hasta el PR #5
- [ ] Cuenta de Cloudinary (o reusar la de inmobiliaria con folders separados)

---

## 1. Scaffold
- [x] `npx create-next-app@latest` — TS, App Router, Tailwind
- [x] `shadcn` init + button, dialog, input, form, table, badge, sheet, select, sonner
- [x] `tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`
- [x] ESLint + Prettier + husky pre-commit (typecheck + lint)
- [x] `vitest` + `@testing-library/react` corriendo en CI

## 2. Base de datos (Hostinger MySQL)
- [ ] Crear DB + usuario en hPanel; guardar credenciales en el gestor de contraseñas *(bloqueado — requiere acceso a Hostinger)*
- [ ] **Remote MySQL**: whitelistear la IP de desarrollo *(ídem)*
- [x] `DATABASE_URL` en `.env.local` — apunta al MySQL local de `docker-compose.yml` en dev; Hostinger se conecta recién en el deploy
- [x] ⚠️ `tsx` **no** carga `.env` solo → usar `import 'dotenv/config'` al inicio de cada script
- [x] `drizzle.config.ts` (dialect `mysql`, schema `./src/db/schema.ts`, out `./drizzle`)
- [x] `src/db/index.ts` — pool único, `connectionLimit: 8`, `timezone: "Z"`

## 3. Schema — `src/db/schema.ts`  *(Opus 5)*
- [x] ENUMs: `order_status`, `payment_method`, `payment_provider`, `payment_status`, `receipt_review`, `doc_type`, `user_role`, `invoice_status`
- [x] `categories` (self-FK, `slug` UQ) · `products` (`slug` UQ, `iva_rate TINYINT` ∈ {10,5,0}, `published_at`, FULLTEXT) · `product_images` · `variants` (`price_pyg BIGINT UNSIGNED`, `on_hand INT UNSIGNED`)
- [x] `orders`: `order_number` UQ, `access_token` UQ, todos los montos `BIGINT UNSIGNED`, `reserved_until`, columnas `invoice_*` (nullables, sin usar en el MVP)
- [x] `order_items` con snapshots de nombre / sku / precio / iva_rate
- [x] `payments` con `UNIQUE (provider, provider_ref)`
- [x] `payment_events` con `UNIQUE (provider, event_key)` ← **idempotencia de webhooks**
- [x] `receipts`, `stock_reservations`, `order_events`, `users`, `shipping_zones`
- [x] Índices: `orders(status, created_at)`, `orders(access_token)`, `orders(customer_phone)`, `orders(doc_number)`, `stock_reservations(variant_id, state, expires_at)`
- [x] ✅ Verificar: **ningún** `float` / `decimal` en columnas de dinero

## 4. Lógica de dominio  *(Opus 5)*
- [x] `transitionOrder(orderId, to, actor, reason)` — transacción + `FOR UPDATE` + tabla de aristas permitidas + escribe `order_events`
- [x] Tests: `enviado → pagado` falla · doble `→ pagado` es no-op · `→ pagado` descuenta `on_hand` una sola vez
- [x] `getAvailability(variantId)` = `on_hand − Σ(reservas held no vencidas)`
- [x] `reserveStock(orderId, items)` — transacción, `FOR UPDATE` sobre las variantes, re-chequea disponibilidad antes de commitear
- [x] `nextOrderNumber()` → `PY-000123` (contador dedicado, **nunca `COUNT(*)`**); test de concurrencia
- [x] Grep final: `UPDATE orders SET status` no debe existir fuera de `transitionOrder`

## 5. Utils PY + tests  *(Opus 5)*
- [x] `formatGs(1234567)` → `"₲ 1.234.567"` (`Intl` `es-PY`, `maximumFractionDigits: 0`)
- [x] `validateRuc("80012345-6")` → DV módulo-11; casos con CI; RUC `44444401-7` para consumidor final
- [x] `normalizePhonePY("0981 123 456")` → `"+595981123456"`
- [x] `ivaIncluded(110000, 10)` → `10000` — redondeo **por línea**, no sobre el total
- [x] `waLink(phone, text)` con `encodeURIComponent` + límite de longitud
- [ ] Fechas: `dd/mm/yyyy`, zona `America/Asuncion` en toda la UI

## 6. Auth + Cloudinary
- [x] `users` (email UQ, `password_hash` bcrypt, `role`), `iron-session`, `requireAdmin(session)`
- [x] Script `create-owner.ts` — **sin ruta pública de registro**
- [x] Cloudinary: folder `productos/` público, folder `comprobantes/` privado/authenticated (config + `signedReceiptUrl()` — sin flow de upload todavía)
- [ ] `uploadReceipt()` con validación MIME (`jpeg|png|pdf`), ≤ 5 MB, ≤ 3 por pedido
- [x] `signedReceiptUrl()` con TTL corto para el admin

## 7. Zod + seed
- [x] `lib/schemas.ts`: `CartItemSchema`, `CheckoutInputSchema` (refine `doc_number` según `doc_type`), `AdminProductInput`
- [x] `scripts/seed.ts` idempotente (`onDuplicateKeyUpdate` por slug/sku): 4 categorías, 24 productos, variantes, stock, zonas de envío
- [x] `pnpm db:push` / `db:seed` / `db:studio`

---

## Definition of done del PR #1
- [x] `pnpm typecheck && pnpm lint && pnpm test` verde
- [ ] Catálogo sembrado visible desde un Server Component conectado a Hostinger MySQL — ✅ verificado contra MySQL local (`docker compose up -d`); falta la cuenta de Hostinger (bloqueante §0)
- [x] `transitionOrder` cubierto por tests, incluyendo transiciones inválidas
- [x] `.env.example` completo · `.env.local` ignorado (`git check-ignore .env.local` lo confirma)
- [x] Ningún secreto con prefijo `NEXT_PUBLIC_`

---

# PR #2 · Storefront, Catalog & Cart

## 8. Vidriera
- [x] Layout: header + badge del carrito, footer, nav mobile, botón flotante de WhatsApp, metadata `es-PY`
- [x] `/` home: hero, destacados, grilla de categorías (ISR)
- [x] `/categoria/[slug]`: filtros (precio, marca), orden, paginación server-side
- [x] `/producto/[slug]`: galería, selector de variante, disponibilidad, nota "IVA incluido", JSON-LD Product
- [x] Primitivas: `ProductCard`, `PriceTag`, `StockBadge`, `QuantityStepper`
- [x] Carrito Zustand con `persist` + migración versionada, líneas por variante
- [x] Slide-over del carrito: editar, quitar, subtotal, "Seguí comprando" / "Ir al checkout"
- [x] **Revalidación del carrito** — re-precia y re-chequea stock en el servidor; avisa "cambió el precio / se quedó sin stock"
- [x] Búsqueda con `FULLTEXT` (+ fallback a `LIKE` para términos cortos)
- [x] Pipeline de imágenes de Cloudinary con placeholders
- [x] Estados vacíos / loading / error, `not-found.tsx`
- [ ] Lighthouse mobile ≥ 90 perf/a11y en la ficha de producto *(medir con el sitio desplegado)*
- [ ] Fotos reales de producto en Cloudinary *(el seed no trae imágenes: se ven placeholders)*

---

# PR #3 · Checkout: SPI/QR manual + contra entrega

## 9. Núcleo del checkout *(Opus 5)*
- [x] **`createOrder`** — re-precia todo desde la DB, inserta pedido + ítems + reservas en UNA transacción, acuña `access_token`, `reserved_until` según el método
- [x] Envío por zona desde `shipping_zones` + umbral de envío gratis
- [x] **Subida de comprobante** — MIME por bytes (no por el `type` del navegador), ≤ 5 MB, ≤ 3 por pedido, Cloudinary privado, fila en `receipts`, → `esperando_verificacion`
- [x] **Guard de `/pedido/[order_number]?t=`** — comparación de token en tiempo constante; token inválido y pedido inexistente devuelven el mismo 404
- [x] **`/pedido/buscar`** — nro. + teléfono, 5 intentos / 15 min / IP, mensaje de error genérico, redirige a la URL tokenizada
- [x] `/checkout` con formulario (nombre, WhatsApp, RUC/CI con DV, ciudad/barrio/dirección, método de pago)
- [x] Timeline del pedido desde `order_events`
- [x] Página SPI/QR con datos bancarios y botones de copiar en cada campo *(los datos entran por `COMERCIO_*`; sin ellos la página cae al botón de WhatsApp y el panel avisa qué falta)*
- [x] Botón "Enviar comprobante por WhatsApp" con mensaje pre-armado (nro. + total, sin el link tokenizado)
- [ ] Notificación al dueño de un pedido nuevo

---

# PR #4 · Admin & Hardening

## 10. Auth del panel *(Opus 5)*
- [x] Login `/admin/login` + `iron-session` reusando `requireAdmin()` del PR #1
- [x] Proxy (`src/proxy.ts`, el ex `middleware.ts` de Next 16) protegiendo `/admin/*`, con `?next=` validado contra redirect abierto
- [x] **Rol re-chequeado adentro de cada server action** (`requireAdminSession()`), no sólo en el borde de la ruta
- [x] Rate limit del login por IP **y** por email; mensaje genérico que no distingue "no existe" de "contraseña incorrecta"
- [x] Test que grepea cada `export async function` de `src/app/actions/admin-*.ts` y falla si le falta el guard

## 11. Pedidos
- [x] `/admin/pedidos`: filtros por estado/método/fecha, paginación server-side, tarjetas usables en celular
- [x] Búsqueda por nro. de pedido (con o sin `PY-`), WhatsApp (cualquier formato) y RUC/CI (con o sin guion)
- [x] `/admin/pedidos/[id]`: ítems, desglose de IVA, datos del cliente, timeline de `order_events`, botón wa.me con el link tokenizado
- [x] Acciones de estado conectadas **sólo** a `transitionOrder`; se ofrecen únicamente las aristas válidas
- [x] Confirmación con motivo para lo que no se puede deshacer (cancelar, rechazar, reembolsar)

## 12. Comprobantes *(Opus 5)*
- [x] Preview con URL firmada de TTL corto, pedida al tocar "Ver" y no embebida en el HTML del listado
- [x] Aprobar/rechazar en una transacción: marca el comprobante y mueve el pedido por `transitionOrder`
- [x] Motivo obligatorio para rechazar (lo lee el comprador)
- [x] Tests: aprobar descuenta stock una vez · dos comprobantes del mismo pedido no descuentan dos veces · transición inválida deja el comprobante intacto

## 13. Productos
- [x] `/admin/productos`: ABM con búsqueda y paginación; alta en `/admin/productos/nuevo`
- [x] Variantes con precio en ₲ **entero** (`step=1`, sin decimales) y SKU único
- [x] Subida de fotos a Cloudinary público, con MIME validado **por los bytes** (SVG excluido a propósito)
- [x] Ajuste de stock con motivo obligatorio, auditado en la tabla nueva `stock_adjustments` (delta con signo + antes/después + actor)
- [x] El ajuste va por delta y no por total absoluto: dos conteos simultáneos se acumulan en vez de pisarse

## 14. Resumen
- [x] Ventas del día y del mes en ₲ con `formatGs`, contando **sólo** lo ya cobrado
- [x] Cortes de día/mes en hora `America/Asuncion`, no UTC (un pedido de las 21:00 cuenta en su día)
- [x] Pedidos esperando verificación y pendientes de pago
- [x] Stock bajo medido sobre lo **disponible** (`on_hand − reservas vigentes`), no sobre lo físico

## 15. Cron
- [x] `GET|POST /api/cron/vencer-pedidos` protegida por `CRON_SECRET` con `timingSafeEqual` + rate limit
- [x] Vence los pedidos sin pago pasados de `reserved_until`, uno por uno vía `transitionOrder` (nunca un UPDATE masivo)
- [x] GC de reservas resueltas de más de 30 días; nunca borra una `held`
- [x] Libera reservas huérfanas de pedidos vencidos/cancelados
- [x] Sin `CRON_SECRET` configurado la ruta responde 503, no 200

## 16. Revisión de seguridad *(Opus 5)*
- [x] Guard verificado por test en cada server action de admin (y que el guard sea lo **primero** que corre)
- [x] Rate limits: login (IP + email), búsqueda de pedidos (ya del PR #3), cron
- [x] Cabeceras: CSP con nonce por request (sin `unsafe-inline` en scripts), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, `poweredByHeader: false`
- [x] Panel servido con `no-store` + `noindex`
- [x] Scan de secretos commiteados (PEM, AWS, GitHub, Cloudinary, URLs de MySQL con contraseña) y de `NEXT_PUBLIC_` mal usado
- [x] Logs sin secretos: el cron loguea cantidades, nunca el valor probado ni ids de pedido
- [x] `?next=` del login sólo acepta rutas internas de `/admin` (redirect abierto cerrado)
- [x] Verificado en un navegador real: el CSP con nonce no rompe la hidratación y el panel no scrollea horizontal en 390 px

## 17. Auditoría del dinero *(Opus 5)*
- [x] Grep del repo entero: cero `float`/`DECIMAL`/`NUMERIC` en columnas de dinero — confirmado contra el DDL **y** contra `information_schema` de la base viva
- [x] Cero `toFixed`/`parseFloat`/literales decimales en el camino del dinero, verificado por test
- [x] IVA redondeado **por línea**, con el caso que distingue las dos implementaciones fijado en un test (3 × ₲33.333 → 9090 por línea vs 9091 sobre el total)
- [x] Query de reconciliación: `subtotal = Σ(line_total)`, `total = subtotal + envío`, `line_total = precio × cantidad`, todo en enteros dentro de MySQL
- [x] `pnpm reconcile` para correr a mano o desde el cron nocturno; sale con código 1 si algo no cuadra
- [x] Tests de la reconciliación en las dos direcciones: un pedido normal cuadra, y un descuadre inyectado se detecta

## Definition of done del PR #4
- [x] `pnpm typecheck && pnpm lint && pnpm test` verde (259 tests)
- [x] `pnpm build` sin warnings
- [x] Ciclo completo probado en un navegador a 390 px: login → filtrar → aprobar comprobante → el pedido queda `pagado` con su auditoría → salir
- [ ] Deploy a Hostinger, smoke test en producción y script de backup de la DB *(PLAN.md 4.11 — bloqueado: necesita la cuenta de Hostinger)*
