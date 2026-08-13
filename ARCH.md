# ARCH.md — Tienda PY: Technical Architecture

**Stack:** Next.js 15 (App Router, TS) · **Hostinger Node.js** · **Hostinger MySQL + Drizzle ORM** · Cloudinary (images + receipts) · Tailwind + shadcn/ui · Zustand · Zod
**Currency:** PYG only, stored as `BIGINT` integers. No decimals anywhere in the money path.
**Timezone:** all business logic in `America/Asuncion`; all timestamps stored UTC (`timezone: "Z"` on the pool).
**Language:** Spanish (Paraguayan voseo) UI, `dd/mm/yyyy`.

> **Why not Supabase/Vercel:** the user already pays for Hostinger with free Node.js slots and a proven deploy playbook. One host, one bill, one debugged deploy flow. See `nextjs-deploy-hostinger` skill for the deploy mechanics — this doc is the app.

---

## 1. Security model (read this first — it's short)

**The browser never talks to the database.** Every request is `browser → Next.js server → MySQL`. There is no Postgres RLS here and none is needed; MySQL doesn't have it and the attack surface it defends against doesn't exist in this topology.

The entire security model is four rules:

1. **Never trust the client about money or identity.** Prices, totals, stock and order ownership are always re-read from the DB server-side. The cart in the browser is a *wish list*, not a source of truth.
2. **Every mutating server action calls a guard first.** `requireAdmin(session)` for admin routes, `requireOrderAccess(orderNumber, token)` for buyer routes. Hiding a button is UX, not security.
3. **Buyers are anonymous, identified by an unguessable token.** No accounts in v1.
4. **Secrets live in `.env` on the server only.** Anything `NEXT_PUBLIC_*` is public by definition.

### How a buyer accesses their order (no login)

| Path | How |
|---|---|
| **Primary — the WhatsApp link** | `/pedido/PY-000123?t=<32-byte random token>`. Token stored in `orders.access_token`, compared with `crypto.timingSafeEqual`. This is the exact URL pasted into WhatsApp. |
| **Fallback — lookup form** | `/pedido/buscar`: order number + the phone number used on the order. Rate-limited (5 attempts / 15 min / IP), generic error message so it can't be used to enumerate orders. On success, redirects to the tokenized URL. |

Accounts are a v2 feature (repeat buyers, order history). Forcing registration before a first purchase is the single biggest conversion killer in PY e-commerce.

### Admin
`iron-session` cookie + `users` table (bcrypt hashes, `role` enum `owner | staff` from day one). Middleware protects `/admin/*`; **every** server action re-checks the role. No public signup route — the owner account is created by a seed script.

---

## 2. Data model (ERD)

MySQL 8, InnoDB, `utf8mb4`. All money columns `BIGINT UNSIGNED` (integer guaraníes).

```
                              ┌──────────────┐
                              │  categories  │
                              │──────────────│
                              │ id  PK       │
                              │ slug UQ      │
                              │ name         │
                              │ parent_id FK ├──┐ self-ref
                              │ position     │◄─┘
                              └──────┬───────┘
                                     │ 1
                                     │ N
┌────────────────────┐        ┌──────┴────────────┐        ┌──────────────────────┐
│  product_images    │  N   1 │     products      │ 1    N │      variants        │
│────────────────────│◄───────│───────────────────│───────►│──────────────────────│
│ id PK              │        │ id PK             │        │ id PK                │
│ product_id FK      │        │ slug UQ           │        │ product_id FK        │
│ cloudinary_id      │        │ name              │        │ sku UQ               │
│ blur_data_url      │        │ description TEXT  │        │ label ("Talle M")    │
│ alt                │        │ category_id FK    │        │ price_pyg BIGINT     │
│ position           │        │ brand             │        │ compare_at_pyg NULL  │
└────────────────────┘        │ iva_rate  10|5|0  │        │ on_hand INT UNSIGNED │◄── stock lives here
                              │ is_active         │        │ is_active            │
                              │ published_at      │        └───────┬──────────────┘
                              │ FULLTEXT(name,    │                │ 1
                              │          descr)   │                │ N
                              └───────────────────┘      ┌─────────┴──────────────┐
                                                         │  stock_reservations    │
                                                         │────────────────────────│
                                                         │ id PK                  │
                                                         │ variant_id FK          │
                                                         │ order_id FK            │
                                                         │ qty INT                │
                                                         │ expires_at DATETIME    │
                                                         │ state: held|consumed|  │
                                                         │        released        │
                                                         │ IDX(variant_id,state,  │
                                                         │     expires_at)        │
                                                         └────────────────────────┘

┌───────────────────────────────┐
│            orders             │
│───────────────────────────────│        ┌────────────────────────────┐
│ id PK                         │ 1    N │        order_items         │
│ order_number  UQ  "PY-000123" ├───────►│────────────────────────────│
│ access_token  UQ  (32 bytes)  │        │ id PK                      │
│ status ENUM (see §3)          │        │ order_id FK                │
│ customer_name                 │        │ variant_id FK  (RESTRICT)  │
│ customer_phone  +5959XXXXXXXX │        │ name_snapshot              │
│ customer_email NULL           │        │ sku_snapshot               │
│ doc_type ENUM: RUC|CI|NINGUNO │        │ unit_price_pyg BIGINT      │
│ doc_number  (DV-validated)    │        │ qty INT                    │
│ is_consumidor_final BOOL      │        │ iva_rate TINYINT           │
│ ship_city / ship_barrio       │        │ line_total_pyg BIGINT      │
│ ship_address / ship_reference │        └────────────────────────────┘
│ ship_maps_url NULL            │
│ subtotal_pyg  BIGINT          │        ┌────────────────────────────┐
│ shipping_pyg  BIGINT          │ 1    N │         payments           │
│ total_pyg     BIGINT          ├───────►│────────────────────────────│
│ iva_10_pyg / iva_5_pyg        │        │ id PK                      │
│ payment_method ENUM           │        │ order_id FK                │
│ reserved_until DATETIME       │        │ provider: pagopar|spi|cod  │
│ invoice_status ENUM  ◄────────┼─ FASE 2│ provider_ref               │
│ invoice_cdc / invoice_pdf_url │        │ amount_pyg BIGINT          │
│ created_at / paid_at          │        │ status: pending|paid|      │
│ IDX(status,created_at)        │        │         failed|refunded    │
│ IDX(customer_phone)           │        │ raw_payload JSON           │
└───────────┬───────────────────┘        │ UQ(provider, provider_ref) │
            │ 1                          └─────────┬──────────────────┘
            │ N                                    │ 1
┌───────────┴────────────────┐                     │ N
│         receipts           │           ┌─────────┴──────────────────┐
│────────────────────────────│           │      payment_events        │
│ id PK                      │           │────────────────────────────│
│ order_id FK                │           │ id PK                      │
│ cloudinary_id (private)    │           │ provider                   │
│ mime / bytes               │           │ event_key                  │
│ uploaded_at                │           │ payload JSON               │
│ review: pending|approved|  │           │ received_at                │
│         rejected           │           │ UQ(provider, event_key) ◄──┼─ idempotency
│ reviewed_by FK users       │           └────────────────────────────┘
│ reviewed_at / note         │
└────────────────────────────┘           ┌────────────────────────────┐
                                         │      order_events          │  audit log
┌────────────────────────────┐           │ id, order_id, from_status, │
│           users            │           │ to_status, actor, reason,  │
│ id, email UQ, password_hash│           │ created_at                 │
│ role ENUM: owner|staff     │           └────────────────────────────┘
│ created_at                 │
└────────────────────────────┘           ┌────────────────────────────┐
                                         │       shipping_zones       │
                                         │ id, name, cities JSON,     │
                                         │ price_pyg BIGINT           │
                                         └────────────────────────────┘
```

### Money invariants
- Every `*_pyg` column is `BIGINT UNSIGNED`. **No `DECIMAL`, no `FLOAT`, ever** — guaraníes have no céntimos.
- Display: `new Intl.NumberFormat('es-PY', { style:'currency', currency:'PYG', maximumFractionDigits:0 })` → `₲ 1.234.567`.
- `line_total_pyg = unit_price_pyg * qty`, `total_pyg = subtotal_pyg + shipping_pyg` — asserted in the same server function that writes them, and by a nightly reconciliation query.
- Prices are **IVA incluido** (PY consumer convention). Included IVA per line = `round(line_total * rate / (100 + rate))`, summed into `iva_10_pyg` / `iva_5_pyg`. Never added on top of the displayed price.

### Stock: holds, not decrements
`on_hand` is the physical count and only changes when money confirms. What the storefront shows is:

```
disponible(variant) = on_hand − SUM(reservations.qty WHERE state='held' AND expires_at > NOW())
```

A **hold** is placed when the order is created (45 min for Pagopar, 24 h for bank transfer / COD). It expires on its own — availability is computed live, so a failed cron job can never strand inventory. A nightly job only garbage-collects old rows.

Overselling is prevented at the write: the reservation insert runs inside a transaction that does `SELECT … FOR UPDATE` on the variant row and re-checks availability before committing.

---

## 3. Order state machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          ▼
  pendiente_pago ──────────────► pagado ──► preparando ──► enviado ──► entregado
      │      │   ▲                  ▲
      │      │   │ (admin aprueba)  │
      │      ▼   │                  │
      │  esperando_verificacion ────┘        ← comprobante subido (SPI/QR)
      │      │
      │      └──► rechazado ──► pendiente_pago      (comprobante inválido, reintento)
      ▼
   vencido   ◄── pasó reserved_until sin pago
      │
      └──► cancelado                          (manual, en cualquier estado pre-pago)
                              pagado ──► reembolsado   (sólo manual)
```

Every transition goes through **one** function, `transitionOrder(orderId, to, actor, reason)`, which:
1. opens a transaction and `SELECT … FOR UPDATE` on the order,
2. rejects any edge not in the allow-list (so a duplicate or late webhook can never drag `enviado` back to `pagado`),
3. on `→ pagado`: marks reservations `consumed` and decrements `variants.on_hand` in the same transaction,
4. on `→ vencido | cancelado`: marks reservations `released`,
5. writes an `order_events` row.

No UI or route ever runs a raw `UPDATE orders SET status = …`.

---

## 4. Pagopar v2 flow

```
Browser            Next.js (Hostinger)         Pagopar               MySQL
   │                     │                       │                    │
   │ POST /api/orders    │                       │                    │
   │────────────────────►│ re-price cart from DB (client is ignored)   │
   │                     │──────── tx: order + items + holds ─────────►│
   │                     │                       │                    │
   │                     │ token = sha1(PRIVATE_KEY + order_number + total_pyg)
   │                     │ POST /api/comercios/2.0/iniciar-transaccion │
   │                     │──────────────────────►│                    │
   │                     │  { hash_pedido, ... } │                    │
   │                     │◄──────────────────────│                    │
   │                     │──────── payments row (provider_ref = hash_pedido)
   │ redirect → checkout │                       │                    │
   │◄────────────────────│                       │                    │
   │ ────────────────── paga ──────────────────► │                    │
   │                     │                       │                    │
   │                     │  POST /api/webhooks/pagopar                 │
   │                     │◄──────────────────────│  (puede llegar antes
   │                     │                       │   del redirect, y N veces)
   │                     │ 1. guard token en querystring               │
   │                     │ 2. expected = sha1(PRIVATE_KEY + hash_pedido)
   │                     │ 3. timingSafeEqual vs token recibido        │
   │                     │ 4. INSERT IGNORE payment_events (provider,event_key)
   │                     │    affectedRows === 0 → replay → 200 y salir │
   │                     │ 5. verificar amount === orders.total_pyg    │
   │                     │ 6. transitionOrder(→ pagado)                │
   │                     │ 7. responder 200 en el formato que espera Pagopar
   │ /pedido/[n] hace polling → el estado cambia a "pagado" solo       │
```

**Hash rules that will cost you an afternoon if ignored:**

- `sha1(private_key + order_id + total)` — `total` must be the **integer PYG string exactly as sent**: `"150000"`. Every JS money habit pushes you toward `toFixed(2)`; `"150000.00"` produces a completely different digest and Pagopar rejects it.
- `order_id` = `orders.order_number` (immutable, human-readable), never an internal id.
- The webhook token is `sha1(private_key + hash_pedido)` — a **different input**. Two separate helpers, two unit-test vectors, no shared function.
- Compare with `crypto.timingSafeEqual` on equal-length buffers.
- **The webhook response envelope Pagopar expects has changed between doc revisions.** Confirm against the current v2 docs and pin an integration test against the sandbox during PR #3. Do not trust any remembered shape, including the one in this document.
- Respond within ~5 s or Pagopar retries. Do the slow work after responding, not before.
- Register the webhook URL over **HTTPS on the real domain** — Hostinger provides the certificate; Pagopar will not call `localhost` (use a tunnel in dev).

### 4.1 The payment that arrives after the order died

The cron cancels unpaid orders once `reserved_until` passes. Pagopar's notice can
land a second later — the buyer paid at 14:59:58 and the sweep ran at 15:00:00.
Both systems behaved correctly and the money is now in the merchant's account for
an order that is `vencido`. This is not a rare edge case; with a 45-minute hold on
card payments it will happen.

**The policy, in the order the rules are applied:**

1. **The payment is recorded before anything else, and the recording is never
   rolled back.** `payment_events` gets the raw notice, `payments` goes to `paid`.
   Whatever happens to the order afterwards, the transaction commits. Losing the
   record of a payment that really happened is the only unrecoverable outcome
   here: everything else can be fixed by a human who can *see* what occurred.
2. **The order revives only if the goods are still there.** `vencido → pagado` is
   a legal edge in the state machine, but entering `pagado` re-secures stock first
   (see below). If the last unit was sold while the order was expired, the
   transition throws, the order stays `vencido`, and nothing is oversold.
3. **The owner is told, without depending on a flag anyone has to remember to
   set.** `findUnmatchedPayments()` derives the list from the data — a `paid`
   payment whose order is not in `pagado|preparando|enviado|entregado|reembolsado`
   — and the admin dashboard shows it at the top in red. A boolean column would
   have been cheaper and would eventually drift; a query over the two tables that
   already hold the truth cannot.
4. **A `cancelado` order never revives automatically.** A person cancelled it on
   purpose, so the software does not overrule them. The money still shows up in
   the same list, for the same refund.

**What the owner can do about it.** The list is not read-only: each row carries
the two actions it implies. **Retry** re-runs the revival — `vencido → pagado`
through `transitionOrder`, which re-secures stock first, so it either revives
the order or leaves everything exactly as it was. It is safe to press as often
as the merchant restocks; a failed retry writes nothing. **Mark as refunded**
sets `payments.status = 'refunded'` and moves the order to `cancelado` with the
reason in `order_events`, in one transaction — the software does not move money,
it records that the owner already did.

Both re-read payment and order under `SELECT … FOR UPDATE` instead of trusting
the id the form submitted. The screen was rendered minutes ago and anything
could have happened since: the other owner already refunded it, the cron moved
the order, a sale took the last unit. Deciding on what the page said is deciding
on stale data. Concretely, a refund is refused if the order came back to life in
the meantime, and a retry on an already-revived order is a no-op rather than an
error — two owners pressing the same button at the same time produce exactly one
stock decrement and one `order_events` row.

**Why the stock re-check lives inside `transitionOrder` and not in the webhook.**
There are three ways into `pagado` — the Pagopar webhook, the owner approving a
transfer receipt, and the manual button in the panel — and any of them can be the
one that runs after the goods are gone. A check placed in the caller is a check
someone will forget to copy into the fourth caller. Putting it in the one function
that owns the `pagado` edge makes it structurally impossible to decrement
`on_hand` for stock that no longer exists.

**The reverse case falls out of the same rule.** An order can also still be
`pendiente_pago` with its reservation rows technically `held` but past
`expires_at`, because the cron has not run yet. Availability is computed live
(§2), so the storefront has already been offering that unit to everyone else.
Consuming those rows would decrement `on_hand` on the strength of a promise that
expired. `secureStockForPayment()` therefore releases the order's stale holds
first and re-acquires what it needs against live availability, taking
`SELECT … FOR UPDATE` on the variant and on the competing reservation rows. Either
it can secure every line or it secures none and throws — it verifies the whole
order before it writes anything, so a half-reserved order is not a state that can
exist.

**What the buyer sees.** A recovered order looks like any other paid order; the
`order_events` row records why (`pago tardío recuperado`). An unrecoverable one
stays `vencido` on the buyer's page, which is honest — the merchant owes them a
refund, and pretending the order is alive would be worse than saying nothing.

---

## 5. Manual SPI / QR + WhatsApp stream (the zero-fee path)

1. Order created → `pendiente_pago`, `reserved_until = NOW() + 24h`.
2. Confirmation page shows: Banco, Titular, RUC, nro. de cuenta, **the exact ₲ total with a copy button**, and the SPI QR image. Copy buttons on every field — typing an account number on a phone is where orders die.
3. Buyer uploads the comprobante → server validates MIME + size → uploads to a **private Cloudinary folder** (signed delivery URLs only) → `receipts` row → `esperando_verificacion`.
4. One-tap WhatsApp button: `https://wa.me/595XXXXXXXXX?text=` + `encodeURIComponent(message)`. Message contains order number, total, and the tokenized order URL. Keep under ~1500 chars — long deeplinks truncate on iOS.
5. Owner checks the receipt against the bank statement in `/admin`, clicks **Aprobar** → `transitionOrder(→ pagado)`, which also writes the `payments` row (below).

**Contra entrega (COD)** uses the same states, minus the receipt: the owner confirms on delivery. Worth having on day one — cash on delivery is still a large share of PY e-commerce.

### 5.1 A manual payment is still a payment

For a while `payments` only ever held Pagopar rows, because Pagopar was the
only path with an external system to record. An approved transfer receipt and a
confirmed COD reached `pagado` with no row at all: the money arrived and the
table that exists to record money arriving never heard about it. That is not a
cosmetic gap. It cost the reconciliation its most valuable cross-check —
`pedido_cobrado_sin_pago` had to be scoped to `payment_method = 'tarjeta'`,
which is to say switched off for the two paths the store actually gets paid
through.

**Entering `pagado` writes the payment row, in the same transaction.**
`recordManualPayment()` runs inside `transitionOrder`, next to the stock
re-check and for the same reason (§4.1): there are three ways into `pagado`,
and a record the caller has to remember to write is a record the fourth caller
will not write. If it were a second step, a process that dies in between would
leave the order charged and the payment unrecorded — precisely the mismatch
this exists to make impossible.

| `orders.payment_method` | `payments.provider` | who writes it |
|---|---|---|
| `transferencia` | `spi` | `transitionOrder`, on entering `pagado` |
| `contra_entrega` | `cod` | `transitionOrder`, on entering `pagado` |
| `tarjeta` | `pagopar` | `startPagoparCheckout` before redirecting; the webhook flips it to `paid` |

**`provider_ref` is the order number.** Nobody issues a transaction id for a
bank transfer or for cash in hand, so the reference has to come from something
that already identifies the charge without ambiguity. `orders.order_number` is
immutable, unique, and is what the owner has in front of them when they look
for the transfer on the bank statement. Because it is derivable from the order,
`UNIQUE(provider, provider_ref)` now *means* something — "one manual charge per
order per provider" — and a double-click, a retry, or an order re-entering
`pagado` collides with that index instead of duplicating the money. The insert
is `INSERT IGNORE`: an existing row is never overwritten, so a payment someone
already marked `refunded` cannot be resurrected by the order passing through
again.

**The invariant, restored.** `pedido_cobrado_sin_pago` no longer filters by
payment method: a settled order without a `paid`-or-`refunded` payment row is a
finding, whatever it was paid with. (`refunded` counts as recorded — refunding
money does not erase that it arrived.) Orders charged before this existed are
completed by `pnpm backfill:pagos-manuales`, a dry-run-by-default script rather
than a migration: the schema is applied with `drizzle-kit push`, which never
runs the files in `drizzle/`, so a backfill living there would run in the test
suite and never on the merchant's server.

---

## 6. Images & performance on PY mobile networks

- **Cloudinary** for everything. Product images public with `f_auto,q_auto` transformations; receipts in a **private/authenticated** folder, admin views them via signed URLs.
- Do **not** store uploads on the Hostinger filesystem — a git-based redeploy can wipe them.
- Blur placeholders stored in `product_images.blur_data_url`; `next/image` with `unoptimized` (Cloudinary already does the work) and long cache headers.
- Catalog pages use ISR (`revalidate`); only live availability is fetched client-side.
- Budget: LCP < 2.5 s on Slow-4G, client JS < 120 KB gz on the product page.
- MySQL pool `connectionLimit: 8` — Hostinger caps concurrent connections per user; a bigger pool causes random `ER_CON_COUNT_ERROR` under load.

---

## 7. FASE 2 (not built in MVP): FacturaPY integration

The store MVP issues **no legal invoices**. But the schema is already invoice-complete — RUC/CI with DV validation, `iva_rate` per line, per-rate IVA subtotals — so connecting it later is roughly one day of work, not a remodel.

**Direction of the integration: FacturaPY exposes the API, the store calls it.** The store must never touch FacturaPY's database or Prisma layer.

### Contract to build against

```
POST  https://facturapy.example/api/public/invoices
Header: Authorization: Bearer <API_KEY>        (per Company, hashed at rest, scoped)
Body:
{
  "external_ref": "PY-000123",                 // orders.order_number — idempotency key
  "issued_at":    "2026-07-29T14:03:00-03:00",
  "customer": {
    "doc_type": "RUC" | "CI" | "NINGUNO",
    "doc_number": "80012345-6",
    "name": "Comercial San Roque S.A.",
    "email": "...", "phone": "+595981123456",
    "is_consumidor_final": false
  },
  "payment_method": "transferencia" | "tarjeta" | "efectivo",
  "currency": "PYG",
  "items": [
    { "sku":"CAM-M-AZ", "description":"Camisa azul talle M",
      "qty":2, "unit_price_pyg":110000, "iva_rate":10 }     // IVA INCLUIDO
  ],
  "shipping_pyg": 25000,
  "total_pyg": 245000
}

202 → { "invoice_id":"...", "status":"QUEUED" }
```

Async by design — SIFEN can take time. Two ways back:

```
POST  <STORE_URL>/api/webhooks/facturapy          ← FacturaPY calls the store
      { "external_ref":"PY-000123", "invoice_id":"...",
        "status":"APPROVED"|"REJECTED", "cdc":"01800...", "kude_url":"https://..." }

GET   /api/public/invoices/:id                    ← polling fallback
```

Store side needs only: `orders.invoice_status` (`none|queued|approved|rejected`), `invoice_cdc`, `invoice_pdf_url`, an "Emitir factura" button in `/admin/pedidos/[id]`, and a webhook receiver reusing the same idempotency table (`payment_events` pattern).

**Legal note, not a technical one:** issuing a legal factura requires the *merchant's* own **timbrado from DNIT**, and for electronic invoicing a digital certificate + SIFEN habilitación tied to their RUC. That authorization belongs to the merchant, not to the software. The DNIT rollout phases move — verify current requirements with a contador before making any compliance claim to a client.
