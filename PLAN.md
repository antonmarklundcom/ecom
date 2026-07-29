# PLAN.md — Tienda PY

**Stack decision (locked):** Next.js 15 + Drizzle + **Hostinger MySQL** + **Hostinger Node.js slot** + Cloudinary.
No Supabase, no Vercel, no Cloudflare. Deploy mechanics live in the `nextjs-deploy-hostinger` skill.

**Goal of the MVP:** a store that takes orders reliably and is easy for the owner to run from a phone.
**Explicitly not in the MVP:** legal invoicing, accounting, customer accounts, multi-tenant.

Task tags: **[Opus 5]** = schema, money logic, payment/webhook security, state machine, final review · **[Sonnet 5]** = UI, routes, forms, seeds, tables.

**Release cut = PR #1 → #2 → #3 → #4.** PR #3 (checkout) and PR #4 (admin) together are the first thing a real customer can use — the owner needs the admin panel to approve receipts, so those two ship as one release. **PR #5 (Pagopar) is post-launch** and touches no schema.

**Payment sequencing (decided):** SPI/QR manual + contra entrega first — no fees, no third-party credentials, no waiting on a Pagopar account. Card payments come after the store is already earning.

---

## PR #1 — Foundation & Data Layer
*Branch: `feat/foundation` · Demo: seeded catalog rendering from real Hostinger MySQL*

| # | Task | Model |
|---|---|---|
| 1.1 | `create-next-app` (TS, App Router, Tailwind) + shadcn/ui + ESLint/Prettier + `strict`/`noUncheckedIndexedAccess` | Sonnet 5 |
| 1.2 | Drizzle + `mysql2` + `drizzle-kit` + `tsx`; `drizzle.config.ts`; pool with `connectionLimit: 8`, `timezone: "Z"` | Sonnet 5 |
| 1.3 | Hostinger: create MySQL DB + user, enable **Remote MySQL** for the dev IP, verify connection from local | Sonnet 5 |
| 1.4 | `src/db/schema.ts` — every table in ARCH.md §2. All money `BIGINT UNSIGNED`, ENUMs, FKs, indexes, FULLTEXT on products | **Opus 5** |
| 1.5 | `transitionOrder()` + the allow-listed edge table + `order_events` audit write, in a transaction with `FOR UPDATE` | **Opus 5** |
| 1.6 | `getAvailability()` / availability subquery (`on_hand − held reservations`), and `reserveStock()` with `FOR UPDATE` re-check | **Opus 5** |
| 1.7 | `nextOrderNumber()` — dedicated counter row or `AUTO_INCREMENT` table, formatted `PY-000123`. **Never `COUNT(*)`** | **Opus 5** |
| 1.8 | Money + PY utils with unit tests: `formatGs()`, `validateRuc()` (DV mod-11), `normalizePhonePY()`, `ivaIncluded()`, `waLink()` | **Opus 5** |
| 1.9 | Auth foundation: `users` table, bcrypt, `iron-session`, `requireAdmin()` guard, owner-creation seed script (no public signup) | **Opus 5** |
| 1.10 | Cloudinary setup: public `productos/` folder + private `comprobantes/` folder, signed-URL helpers | Sonnet 5 |
| 1.11 | Zod schemas: `CartItem`, `CheckoutInput`, `AdminProductInput` | Sonnet 5 |
| 1.12 | Idempotent seed: 4 categorías, ~24 productos con variantes, precios ₲ realistas, stock, ciudades PY, zonas de envío | Sonnet 5 |
| 1.13 | Scripts `db:push` / `db:seed` / `db:studio`; CI running typecheck + lint + vitest | Sonnet 5 |

**Exit:** catalog renders from MySQL; `pnpm test` green; a raw `UPDATE orders SET status` appears nowhere in the codebase.

---

## PR #2 — Storefront, Catalog & Cart
*Branch: `feat/storefront` · Demo: browse → add to cart → cart survives a reload*

| # | Task | Model |
|---|---|---|
| 2.1 | Layout: header + cart badge, footer, mobile nav, floating WhatsApp button, `es-PY` metadata, self-hosted fonts | Sonnet 5 |
| 2.2 | `/` home: hero, destacados, grid de categorías | Sonnet 5 |
| 2.3 | `/categoria/[slug]`: filtros (precio, marca), orden, paginación, ISR | Sonnet 5 |
| 2.4 | `/producto/[slug]`: galería, selector de variante, disponibilidad, nota "IVA incluido", JSON-LD Product | Sonnet 5 |
| 2.5 | Primitives: `ProductCard`, `PriceTag`, `StockBadge`, `QuantityStepper` | Sonnet 5 |
| 2.6 | Zustand cart with `persist` + versioned migration, variant-level lines | Sonnet 5 |
| 2.7 | Slide-over cart (Radix Dialog): edit, remove, subtotal, "Seguí comprando" / "Ir al checkout" | Sonnet 5 |
| 2.8 | **Cart revalidation** — on cart open and checkout entry, re-price and re-check stock server-side; surface "cambió el precio / se quedó sin stock" | **Opus 5** |
| 2.9 | Búsqueda con MySQL `FULLTEXT` (o `LIKE` + índice si FULLTEXT rinde mal en el plan de Hostinger) | Sonnet 5 |
| 2.10 | Cloudinary image pipeline + blur placeholders + long cache headers | Sonnet 5 |
| 2.11 | Empty / loading / error states, skeletons, `not-found.tsx` | Sonnet 5 |

**Exit:** Lighthouse mobile ≥ 90 perf/a11y on the product page; client JS < 120 KB gz.

---

## PR #3 — Checkout: SPI/QR manual + contra entrega  ← **the MVP ships here**
*Branch: `feat/checkout` · Demo: a real order placed and confirmed on a phone, start to finish, with zero payment-gateway fees and zero third-party credentials*

Decision: the manual + COD path ships **first**. It needs no Pagopar account, no sandbox keys, no fees, and it is how most PY stores actually get paid. Pagopar is PR #5 and touches no schema.

| # | Task | Model |
|---|---|---|
| 3.1 | `/checkout` form (RHF + Zod): nombre, WhatsApp, RUC/CI con validación de DV, toggle consumidor final, ciudad/barrio/dirección/referencia, método de pago | Sonnet 5 |
| 3.2 | Envío por zona desde `shipping_zones` + umbral de envío gratis | Sonnet 5 |
| 3.3 | **`createOrder` server action** — re-price everything from DB, insert order + items + holds in ONE transaction, mint `access_token`, set `reserved_until` per method | **Opus 5** |
| 3.4 | Página SPI/QR: datos bancarios con botones de copiar en cada campo, QR, total exacto, instrucciones paso a paso | Sonnet 5 |
| 3.5 | Subida de comprobante: validación MIME/tamaño/cantidad, upload privado a Cloudinary, fila en `receipts`, → `esperando_verificacion` | **Opus 5** |
| 3.6 | Botón "Enviar comprobante por WhatsApp" con mensaje pre-armado (`waLink`) | Sonnet 5 |
| 3.7 | Contra entrega: mismo state machine, sin comprobante; el dueño confirma al entregar | Sonnet 5 |
| 3.8 | **`/pedido/[order_number]?t=`** — comparación de token en tiempo constante, timeline del pedido, se auto-actualiza al confirmarse el pago | Sonnet 5 (guard: **Opus 5**) |
| 3.9 | **`/pedido/buscar`** — nro. de pedido + teléfono, rate-limited (5 intentos / 15 min / IP), mensaje de error genérico, redirige a la URL con token | **Opus 5** |
| 3.10 | Notificación al dueño de un pedido nuevo (email o wa.me con un clic desde el admin) | Sonnet 5 |

**Exit:** an order can be placed, paid by transfer, verified and marked shipped without any external payment service existing. **This is a sellable product.**

---

## PR #5 — Pagopar (después del MVP, sin tocar el schema)
*Branch: `feat/pagopar` · Demo: sandbox purchase paid automatically end-to-end*

| # | Task | Model |
|---|---|---|
| 5.1 | **Pagopar client**: `iniciar-transaccion`, `sha1(private + order_number + total)` con total como string entero, req/res tipados, timeout + retry con jitter | **Opus 5** |
| 5.2 | **Webhook `POST /api/webhooks/pagopar`**: guard en querystring → `sha1(private + hash_pedido)` con `timingSafeEqual` → idempotencia `INSERT IGNORE payment_events` → verificación de monto → `transitionOrder` → 200 en el formato que espera el proveedor, con logging redactado | **Opus 5** |
| 5.3 | **Webhook test suite**: válido · firma alterada · replay ×3 · monto distinto · pedido inexistente · webhook antes del redirect · pedido ya enviado | **Opus 5** |
| 5.4 | Confirmar contra la doc v2 actual + sandbox el formato exacto de la respuesta del webhook, y fijarlo con un test de integración | **Opus 5** |
| 5.5 | Método "Tarjeta / Pagopar" en el checkout + página de retorno | Sonnet 5 |
| 5.6 | Reserva de stock a 45 min para este método (ya soportado por `reserved_until`) | Sonnet 5 |

**Exit:** sandbox order paid end-to-end; a replayed webhook changes nothing; a tampered signature returns 401 and logs.

---

## PR #4 — Admin & Hardening
*Branch: `feat/admin` · Demo: owner logs in on a phone, approves a receipt, marks an order shipped*

| # | Task | Model |
|---|---|---|
| 4.1 | Login + session + `/admin/*` middleware, role re-checked in every action | **Opus 5** |
| 4.2 | `/admin/pedidos`: filtros por estado/método/fecha, búsqueda por nro./WhatsApp/RUC, paginación server-side, **usable en celular** | Sonnet 5 |
| 4.3 | `/admin/pedidos/[id]`: items, desglose de IVA, datos del cliente, timeline de `order_events`, botón wa.me | Sonnet 5 |
| 4.4 | Revisión de comprobantes: preview con URL firmada, aprobar/rechazar con motivo | Sonnet 5 |
| 4.5 | Acciones de estado conectadas **sólo** a `transitionOrder` | **Opus 5** |
| 4.6 | `/admin/productos`: CRUD, subida de imágenes, ajuste de stock con motivo (auditado) | Sonnet 5 |
| 4.7 | Dashboard: ventas del día/mes en ₲, pedidos esperando verificación, stock bajo | Sonnet 5 |
| 4.8 | Cron (Hostinger cron job → ruta protegida por `CRON_SECRET`): vencer pedidos sin pago, GC de reservas viejas | Sonnet 5 |
| 4.9 | **Security review**: guards en cada server action, rate limits, headers (CSP/HSTS/X-Frame-Options), scan de secretos, redacción de logs del webhook | **Opus 5** |
| 4.10 | **Money audit**: cero `float`/`DECIMAL` en el camino del dinero, redondeo de IVA por línea, query de reconciliación de totales | **Opus 5** |
| 4.11 | Deploy a Hostinger (slot Node.js, env vars, dominio, HTTPS), smoke test en producción, script de backup de la DB | Sonnet 5 |

**Exit:** full order lifecycle demoable in Spanish on a phone; RLS-equivalent guard tests green; DB backup script proven.

---

## FASE 2 — deliberately deferred
0. **Pagopar** — now its own PR #5 above, post-launch.
1. **FacturaPY integration** — contract already specified in `ARCH.md` §7. Store calls FacturaPY's `POST /api/public/invoices` with a Bearer API key; FacturaPY webhooks back the CDC + KuDE URL. Store needs three columns and one button. Requires the merchant's own timbrado/DNIT authorization — a legal prerequisite, not a software feature.
2. Customer accounts + order history.
3. Cupones, carritos abandonados, devoluciones/RMA.
4. Multi-tenant (one install, many stores) — add `tenant_id` before this, not after.
5. WhatsApp Cloud API automation (paid; manual deeplinks first).
