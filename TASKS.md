# TASKS.md — Sprint activo: **PR #1 · Foundation & Data Layer**

Stack: Next.js 15 + Drizzle + **Hostinger MySQL** + **Hostinger Node.js** + Cloudinary.
Marcá `[x]` al terminar. Cada bloque es un commit.

---

## 0. Decisiones bloqueantes (antes de escribir código)
- [ ] **Qué cuenta de Hostinger y qué slot Node.js** usa este proyecto (hay 10 slots por cuenta — verificar cuáles están libres)
- [ ] Confirmar que el plan de Hostinger incluye **Node.js** (los planes sólo-PHP no sirven para Next.js)
- [ ] Dominio / subdominio para la tienda
- [x] **Métodos de pago del MVP: SPI/QR manual + contra entrega.** Pagopar queda para el PR #5, post-lanzamiento
- [ ] Datos bancarios reales (Banco, titular, RUC, nro. de cuenta) + imagen del QR SPI — necesarios recién en el PR #3
- [ ] Número de WhatsApp del comercio en formato `+5959XXXXXXXX`
- [x] ~~Credenciales de sandbox de Pagopar~~ — no bloquean nada hasta el PR #5
- [ ] Cuenta de Cloudinary (o reusar la de inmobiliaria con folders separados)

---

## 1. Scaffold
- [ ] `npx create-next-app@latest` — TS, App Router, Tailwind
- [ ] `shadcn` init + button, dialog, input, form, table, badge, sheet, select, sonner
- [x] `tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`
- [ ] ESLint + Prettier ✅ · husky pre-commit ⬜ (falta)
- [ ] `vitest` corriendo en CI ✅ · `@testing-library/react` ⬜ (recién con UI, PR #2)

## 2. Base de datos (Hostinger MySQL)
- [ ] Crear DB + usuario en hPanel; guardar credenciales en el gestor de contraseñas
- [ ] **Remote MySQL**: whitelistear la IP de desarrollo (sin esto, `ECONNREFUSED` desde local)
- [ ] `DATABASE_URL` en `.env.local` — probar con un script `tsx` antes de escribir nada más
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
- [ ] Cloudinary: folder `productos/` público, folder `comprobantes/` privado/authenticated
- [ ] `uploadReceipt()` con validación MIME (`jpeg|png|pdf`), ≤ 5 MB, ≤ 3 por pedido
- [ ] `signedReceiptUrl()` con TTL corto para el admin

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
