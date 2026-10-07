# Template improvement plan — October 2026

Scope: the reusable template `antonmarklundcom/ecom` only. Anillos
(`antonmarklundcom/anillos`, a store created from this template at
`c5422e3`) and its review-fixes PR #14 were read as **evidence of possible
defects**, never as patches to copy. Every entry below was re-verified against
this repository at `45f4336` (main after #147), and every fix starts from a
focused regression test that failed on that commit.

Nothing here is store-specific. Ring copy and assets, supplier records, the
Paraguay keyword dataset, any phone number, bank details and any single-bank
launch policy stay in the stores that own them. No GTIN, review, price, stock,
material or delivery term is invented by the template.

## How to read this file

- **ID**: batch letter + number. One batch = one PR, in dependency order.
- **Priority**: P1 = money, stock, data integrity or operational safety;
  P2 = buyer- or owner-visible correctness; P3 = polish.
- **Failure**: what happens today, with the code path that causes it.
- **Fix**: the smallest sound change.
- **Hook**: the neutral extension point a store uses instead of forking
  machinery (when one is needed).
- **Acceptance**: what the regression test asserts; these are the criteria a
  reviewer checks.
- **Status**: `fixed in PR <batch>` once the batch's tests pass on MySQL 8 and
  MariaDB 10.11; `planned` before that; `not present` when the suspected
  defect was checked and does not exist here (kept so nobody re-audits it).

## Baseline (before any change)

Local, Node 22.22.0 and pnpm 11.22.0 (the versions `.nvmrc`, `engines`,
`packageManager` and CI declare), disposable loopback databases whose names
contain `test`:

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, lockfile unchanged |
| `pnpm typecheck` / `pnpm lint` | PASS / PASS |
| `pnpm test`, MySQL 8.4.11 | PASS: 179 files, 1,863 passed, 1 skipped (live Pagopar sandbox, needs external credentials) |
| `pnpm test --project integration`, MariaDB 10.11.19 | PASS: 84 files, 875 passed, 1 skipped (same live Pagopar test) |
| Playwright Chromium, desktop + 390 px | PASS: 39 passed |

Note: run the suites through `pnpm test`, not `pnpm vitest`. The importer and
seed CLI tests re-launch the package manager through `npm_execpath`, which
`pnpm vitest` does not set; that invocation fails six CLI tests with
`Cannot find module '…/undefined'` on an unmodified checkout. Run browser
suites with nothing else using the same database server: an overlapping
integration run (which drops and recreates its own test database) made five
storefront specs time out once; the isolated rerun passed.

## PR order

| PR | Batch | Depends on | Why this order |
| --- | --- | --- | --- |
| 1 | A — money, stock and public inventory | — | Every later batch reuses the "chargeable price" rule. |
| 2 | B — migrations, backups, health and sync guards | A | Must land before any batch adds a migration (E). |
| 3 | C — supplier CSV import and export | A | Import writes prices and stock; it must obey A1. |
| 4 | D — payment readiness and receipts | A | Independent of C; ordered after it to keep diffs small. |
| 5 | E — verified facts, image provenance and SEO projection | B | Adds migration `0024`; B's guards protect stores during sync. |
| 6 | F — accessibility and catalogue usability | A, E | Shows E's provenance on cards; reuses A's price rule. |

---

## Batch A — money, stock and public inventory (PR 1)

### A1 · Zero or invalid prices are purchasable and displayed as "₲ 0" — P1

- **Failure.** `variants.price_pyg` accepts 0 (correct for drafts and
  enquiry products), but nothing stops a published stock product from
  selling at 0:
  - `priceCart` (`src/domain/cart.ts`) never checks the price, so
    `createOrder` creates a `pendiente_pago` order of ₲0 and reserves stock;
  - the admin accepts 0 on an active variant of a published stock product
    (`saveVariant`, `updateProduct`), including switching an enquiry product
    with zero prices to stock;
  - the storefront prints "₲ 0" (and "−100 %" next to a compare-at price) on
    the product card, product page "Desde", sticky buy bar, recently viewed and
    comparison table;
  - `minPriceSql` sorts ₲0 first under "lowest price" and lets it pass a
    "max ₲X" filter;
  - a bulk percentage change turns ₲0 into ₲100/₲1,000 (`precioAjustado`);
  - JSON-LD emits `"offers": []` when no variant has a price.
  Legacy rows already in a store's database are not reported anywhere.
- **Fix.** One rule, `isChargeablePrice` (`src/lib/money.ts`): a safe
  integer greater than zero. The cart rejects anything else as
  `no_disponible`; `hydrate` reports such variants as unavailable;
  `minPriceSql` ignores them; `PriceTag` renders nothing; the product page,
  comparison and recently viewed use `lowestChargeablePrice`; JSON-LD omits
  `offers` when empty; `precioAjustado(0, …)` stays 0. The admin rejects an
  active variant priced ≤ 0 on an active, published stock product (and
  publishing or switching to stock while one exists) with
  `adminError.producto.precioCero`, naming the SKU. The dashboard counts
  published stock variants still at ₲0 (`countUnpricedSellableVariants`).
- **Hook.** None needed: drafts, inactive variants and enquiry/showcase
  products keep accepting 0, so a store's quotation workflow is unchanged.
- **Acceptance.** `tests/integration/positive-prices.test.ts`: cart rejects a
  legacy ₲0 row; `createOrder` creates no order and no reservation; the admin
  rejects ₲0 on a sellable variant but accepts it on a draft, an inactive
  variant and an enquiry product; publishing/switching to stock with an
  active ₲0 variant is rejected without changing the product; ₲0 is not
  "available", not first by price and not inside a max-price filter; the
  dashboard count ignores drafts, enquiry products and inactive variants.
  `tests/unit/money.test.ts`, `tests/unit/seo.test.ts` (no empty `offers`),
  `tests/integration/admin-bulk.test.ts` (₲0 stays ₲0),
  `src/components/__tests__/zero-price-display.test.tsx` (no "₲ 0" on
  `PriceTag`, card, enquiry selector or recently viewed, including a stored
  legacy entry).
- **Status.** fixed in PR A.

### A2 · Related products crash with `ORDER BY 0` when the source has no price — P1

- **Failure.** `getSameCategoryRelated` (`src/db/queries.ts`) used `sql\`0\``
  as the price-distance term when the source product had no price. MySQL and
  MariaDB read an integer literal in `ORDER BY` as a column position:
  `ER_BAD_FIELD_ERROR: Unknown column '0' in 'order clause'`. A published
  product with no active variants returned HTTP 500. Fixing A1 (hidden prices
  pass no reference price) would have widened the exposure to every
  hidden-price product, so this is fixed first.
- **Fix.** Omit the term when there is no chargeable reference price; order
  by brand, then name.
- **Acceptance.** `tests/integration/relacionados-sugerencias.test.ts`: no
  reference price → brand then name order; no candidates → `[]`. Both failed
  with the SQL error before the fix.
- **Status.** fixed in PR A.

### A3 · Enquiry and showcase products publish warehouse stock counts — P2

- **Failure.** `hydrate` computed `available` for every sale mode, and the
  product page passes the whole product to the client `AddToCart`, and the
  public `getWishlistProducts` action returns it as JSON. A consultation
  store's inventory is not public information.
- **Fix.** `hydrate` reports `available: 0` unless the product is a stock
  product with a visible, chargeable price. Related suggestions keep
  non-stock products (their SQL already requires `on_hand > 0`).
- **Acceptance.** `positive-prices.test.ts`: enquiry and showcase products
  report 0 through `getProductBySlug`, `getCatalog` and `getProductsBySlugs`.
- **Status.** fixed in PR A.

### Checked in batch A and not present

- **Integer money.** Admin money inputs use zod 4 `.int()` (safe integers),
  CSV prices accept digits only, coupons and bulk changes round to integers,
  `lineTotal` asserts guaraníes, columns are `BIGINT UNSIGNED`.
- **Status changes outside `transitionOrder`.** None; the only other
  `status` write is the Pagopar transaction table.

---

## Batch B — migrations, backups, health and template sync (PR 2)

### B1 · Template sync writes colliding or rewritten migration history — P1

- **Failure.** `scripts/template-sync.ts` treats `drizzle/` as ordinary
  machinery. When a store and the template both add migration index *n*, the
  template's SQL file is written before the journal conflict is detected, and
  `--commitear-conflictos` (used by `distribuir.yml`) commits conflict
  markers. Drizzle's MySQL migrator applies a migration only when its journal
  `when` is greater than the newest applied `created_at`
  (`drizzle-orm/mysql-core/dialect.js`), so any incoming template migration
  older than the store's newest applied one is **skipped forever**, silently.
  A template that rewrites an already released migration (same tag, new SQL)
  syncs as "completado" with no warning. This is not hypothetical: Anillos
  has its own `0023_previous_mockingbird` while this template ships
  `0023_lucky_black_widow` (same DDL plus a slug backfill), and Anillos'
  `0024` is newer than the template's `0023`.
- **Fix.** A pre-write check of the merged journal (contiguous indexes,
  unique tags, strictly increasing `when`, template entries identical to the
  store's copy, no template SQL rewrite, no snapshot collisions) runs in
  `template:sync` before any file is written — also in dry runs — and in
  `template:diff`. A violation stops with a `precondicion` result naming the
  colliding entries and the safe-regeneration steps; the working tree stays
  clean.
- **Hook.** Documented safe regeneration for a store that needs its own
  migration (NEW-STORE.md): take the template update first, then regenerate
  the store's unapplied migration; an already-applied store migration that
  collides is a manual, reviewed operation, never an automated rewrite.
- **Acceptance.** `tests/integration/template-sync.test.ts` (real git
  repositories): an index collision is rejected in both dry run and real run,
  also with `--commitear-conflictos`, leaving `HEAD` and the working tree
  untouched (not even non-migration machinery is written); a rewritten
  released migration is rejected; a store without its own migrations
  receives the template's, and a store with its own migrations still syncs
  when the template brings none. The three rejection cases failed on the
  original script. `tests/unit/template-migrations.test.ts` covers the pure
  rules, including conflict markers in the journal, and checks that this
  repository's own journal is contiguous, strictly increasing and complete.
- **Status.** fixed in PR B.

### B2 · No diagnostic for pending or skipped migrations — P1

- **Failure.** Health, `/api/version`, `pnpm db:check` and the admin never
  compare `__drizzle_migrations` with `drizzle/meta/_journal.json`. Health's
  `catalog` flag catches only missing catalogue columns.
- **Fix.** `src/db/migration-status.ts` compares applied rows with the
  journal by position (hash and `created_at`). `db:check` exits non-zero on
  pending/skipped/unknown migrations; `/api/version` lists pending tags; health
  adds a `schema` boolean; `db:migrate` reports before applying.
- **Acceptance.** `migration-safety.test.ts`: deleting the last applied row
  makes health report `migrations:false` and `/api/version` list the tag as
  pending; a foreign row newer than a pending migration is reported as
  `foreign` and the pending one as `skipped`. `tests/unit/migration-status.test.ts`
  covers the pure comparison and the `db:check` wording. The health key is
  `migrations` (not `schema`): the existing test forbids the word "schema" in
  the public response.
- **Status.** fixed in PR B.

### B3 · Migrations can wait a year for a metadata lock — P1

- **Failure.** `scripts/migrate.ts` and `/api/setup/init` call `migrate()`
  with MySQL's default `lock_wait_timeout` (31,536,000 s). One open
  transaction (or the nightly consistent-snapshot backup) blocks an `ALTER`,
  and every storefront query on that table queues behind it.
- **Fix.** A bounded `lock_wait_timeout` on the migration connection (a
  dedicated connection, not a pooled one).
- **Acceptance.** `tests/integration/migration-safety.test.ts`: with a
  concurrent open transaction on `products`, a pending `ALTER` fails with
  `ER_LOCK_WAIT_TIMEOUT` in about two seconds and leaves no column and no
  migration row behind. The same scenario with plain `migrate()` was still
  waiting after 15 s (scratch reproduction; not committed as a test because
  it would hang). `db:migrate` and `/api/setup/init` also refuse to migrate
  over a history with skipped or foreign rows.
- **Status.** fixed in PR B.

### B4 · Backup inventory follows the code, not the database — P1

- **Failure.** `backupManifest` records the database's applied migration
  but lists the code's `BACKUP_TABLES`, and `dumpDatabase` selects from every
  one of them. Between a deploy and its migration (the documented order), a
  database at `0022` with code at `0023` fails the nightly backup on the
  missing `product_slug_redirects`. The existing older-backup test writes its
  manifest by hand and never exercises the real producer.
- **Fix.** Derive the table list from the applied migration's snapshot and
  use it for the dump and the counts.
- **Acceptance.** `migration-safety.test.ts`: a database migrated through
  `0022` dumps with exactly the `0022` table list (no
  `product_slug_redirects`) and `inspectBackup` accepts the file. On the
  original code the same test failed with `ER_NO_SUCH_TABLE …
  product_slug_redirects`.
- **Status.** fixed in PR B.

### B5 · Backup and digest jobs can stop silently — P2

- **Failure.** Health and the admin dashboard track only `vencer_pedidos`.
  A missing backup cron entry is never reported; the WhatsApp alert fires
  only when a job runs and fails.
- **Fix.** Freshness from `job_runs.last_ok_at` for the backup job (only
  when backups are configured): a `backup` health flag and an owner banner.
  It reports what ran; it does not claim that any hosted schedule exists.
- **Acceptance.** A 30-hour-old successful backup with storage configured
  reports `backup:false`; with backups disabled the flag is `true` and the
  banner is hidden.
- **Status.** fixed in PR B.

### B6 · pnpm 11 passes a literal `--` to CLI scripts — P2

- **Failure.** `pnpm backup -- --dry-run` (and template sync/diff, doctor,
  bootstrap, nueva-tienda) reaches the parser as `["--", "--dry-run"]` and
  fails with "no conozco la opción --". `restore` and the importer already
  ignore it.
- **Fix.** Ignore a leading `--` in each argument parser.
- **Acceptance.** `tests/unit/cli-separator.test.ts`: all six parsers give
  the same result with and without a leading `--` (all six failed before);
  unknown options still fail.
- **Status.** fixed in PR B.

### B7 · The documented uptime keyword never matches — P2

- **Failure.** DEPLOY.md §8 told monitors to alert unless the body contains
  `"db":true,"cron":true`; since #147 the response is
  `{"ok":true,"db":true,"catalog":true,"cron":true}`, so that substring never
  appears and a monitor configured as documented alerts permanently (or, set
  to "contains", never).
- **Fix.** Keep the existing keys in their order, append `migrations` and
  `backup`, and document the keyword
  `"db":true,"catalog":true,"cron":true,"migrations":true` plus a separate
  `"backup":true` monitor.
- **Acceptance.** `tests/integration/health-route.test.ts` keeps asserting the
  documented substring order.
- **Status.** fixed in PR B.

### Checked in batch B and not present

- **Unbounded health probes.** Every probe races a 3 s timer.
- **Unsafe restore target.** Restore requires a `restore`/`test` database
  name *and* an empty target, and refuses a newer or foreign schema.

---

## Batch C — supplier CSV import and export (PR 3)

Reproduced on the original code with a scratch test (MariaDB 10.11, same
result expected on MySQL): a price-only file with "pisar stock" left the
product with description and brand `null`, IVA 10, label "Único",
compare-at `null` and stock 0 (C2); `taz-s` moved another product's `TAZ-S`
variant and changed its price with zero plan errors (C4); an inactive product
was reactivated and a new one published (C5); a write failure on the third
product left the first product, a new category and a changed price behind
(C1); no `price_adjustments` row was written (C7). The panel and the CLI now
share one plan (`buildCatalogImportPlan`) and one transactional writer
(`applyCatalogImportPlan`); the CLI's duplicated planning code is gone.
Acceptance tests: `tests/integration/catalog-import-safeguards.test.ts`
(every C item, including an export → import no-op and a conflict inserted
between preview and write) and `tests/unit/catalog-import.test.ts`.

### C1 · A late failure leaves a partial import — P1

- **Failure.** Categories are committed outside any transaction and each
  product in its own transaction (`scripts/seed.ts`); a later row that the
  database rejects (for example a 65-character SKU, which `parseCatalogo`
  does not length-check) leaves earlier rows written.
- **Fix.** One transaction for categories and products; per-line length
  validation so these become preview errors.
- **Acceptance.** A batch whose last row fails writes nothing.
- **Status.** fixed in PR C.

### C2 · Absent optional columns overwrite stored data — P1

- **Failure.** A supplier file with only SKU, product, category and price
  resets IVA to 10, clears description, brand and compare-at price, relabels
  every variant "Único" and, with stock reset, zeroes stock.
- **Fix.** An absent column means "keep"; defaults apply only on insert. An
  explicitly empty cell keeps its documented meaning.
- **Acceptance.** Re-importing a price-only file changes only prices.
- **Status.** fixed in PR C.

### C3 · Export does not round-trip — P1

- **Failure.** Export lacks slug, description, brand, IVA, compare-at price
  and the draft flag; re-importing an export derives a different slug and is
  rejected or wipes fields. A stored compare-at of 0 is rejected on import.
- **Fix.** Stable export columns covering every importable field; compare-at
  0 round-trips as "none".
- **Acceptance.** Export → import of the seeded catalogue is a no-op.
- **Status.** fixed in PR C.

### C4 · SKU ownership ignores database collation and locks — P1

- **Failure.** Ownership is checked with a case-sensitive JS `Map`, while
  `utf8mb4_*_ci` treats `abc-1`, `ABC-1` and `ÁBC-1` as equal; the upsert then
  moves another product's variant (with its order history) to the importing
  product. Nothing is locked between plan and write.
- **Fix.** Inside the write transaction, `SELECT … FOR UPDATE` by SKU using
  the database's comparison and reject an owner mismatch; never update
  `product_id`. Case/accent duplicates in one file are rejected.
- **Acceptance.** A collation-equivalent SKU of another product is rejected
  and nothing is written.
- **Status.** fixed in PR C.

### C5 · Imports publish new products and reactivate unpublished ones — P1

- **Failure.** New products are inserted active and published; every
  re-import sets `is_active = true` on products and variants, undoing a bulk
  unpublish.
- **Fix.** New products enter as drafts; updates never change activation.
- **Acceptance.** New rows are drafts; an inactive product stays inactive.
- **Status.** fixed in PR C.

### C6 · Staff can mass-change prices and reset stock through import — P1

- **Failure.** Import apply needs only a staff session, while mass price
  changes are owner-only (`precios.masivo`).
- **Fix.** Applying an import that changes prices or resets stock requires
  `precios.masivo`; the actor is recorded.
- **Acceptance.** A staff apply that changes a price is rejected; owner
  passes.
- **Status.** fixed in PR C.

### C7 · Price and stock changes from import and variant edits are not audited — P1

- **Failure.** `price_adjustments` is written only by bulk price changes;
  single-variant edits and imports change prices silently, and the stock reset
  writes no `stock_adjustments` row.
- **Fix.** Write `price_adjustments` / `stock_adjustments` with the actor
  for every change from import and the variant editor.
- **Acceptance.** Each changed price or stock value has one audit row with
  before/after and actor.
- **Status.** fixed in PR C.

---

## Batch D — payment readiness and receipts (PR 4)

Reproduced on the original code before fixing: `paymentPolicy(null, "")`
returned `[]` (every method closed) and a `checkout` section stored as a
string parsed to `metodosPago: null` (inherit, reopening a paused checkout)
(D2); the original receipt sequence (unlocked checks → upload → record →
transition) stored **4** receipts against a limit of 3 under two parallel
uploads, and an order cancelled mid-upload kept a `pending` receipt while the
buyer saw `InvalidTransitionError` (D4); the stock hold still expired 59 s
after the receipt arrived (D5). Acceptance tests:
`tests/unit/preflight.test.ts` (D1), `tests/unit/payment-policy.test.ts`
(D2), `src/components/__tests__/receipt-section.test.tsx` (D3),
`tests/integration/receipt-finalization.test.ts` (D4, D5, lock order).

### D1 · Preflight reports "ready" when checkout cannot take payment — P1

- **Failure.** `pnpm preflight` checks bank details from `BANCO_*` only, as
  a warning, and never asks `readyPaymentMethods()`. With no bank details and
  `STORE_PAYMENT_METHODS=transferencia`, checkout is closed and preflight
  prints "Nada bloquea el cobro".
- **Fix.** Preflight evaluates the effective policy (panel > environment >
  config) and blocks when no method is ready or a selected method is not.
- **Status.** fixed in PR D.

### D2 · Empty or corrupted payment policy fails open or closes everything — P1

- **Failure.** `STORE_PAYMENT_METHODS=""` (the example in
  `docs/ENV-OPCIONAL.md`) closes every method instead of meaning "unset"; a
  corrupted `checkout` settings section falls back to "inherit", reopening a
  checkout the owner had paused.
- **Fix.** Empty environment value = unset; a corrupted stored section =
  no methods (closed) until saved again.
- **Status.** fixed in PR D.

### D3 · Receipt upload offered without storage — P2

- **Failure.** The order page always renders the upload form; without image
  storage the buyer picks a file, waits and gets a generic error.
- **Fix.** Hide the form when storage is not configured and show the
  existing WhatsApp fallback (or a plain "send it to the store" message);
  the action refuses early with a clear message. The browser test server
  gets clearly-labelled disposable Cloudinary values (only when none are
  set) so the "2 MB receipt reaches the action" spec keeps exercising the
  form; its invalid file is rejected by validation before any upload.
- **Status.** fixed in PR D.

### D4 · Receipt quota and order state are checked outside the lock — P1

- **Failure.** `uploadReceipt` checks state and quota before the slow
  upload, records the receipt in autocommit and transitions in a separate
  transaction: parallel uploads exceed the quota, and a receipt can land on a
  paid or cancelled order and stay pending forever.
- **Fix.** One locked transaction (order → receipts) re-checks state and
  quota, records the receipt and transitions; the uploaded asset is removed
  if it was not recorded. `reviewReceipt` takes the same lock order.
- **Status.** fixed in PR D.

### D5 · The stock hold can lapse while a receipt waits for review — P1

- **Failure.** A transfer order's hold expires at `reservedUntil` even after
  the buyer uploaded a receipt; another buyer can take the last unit and the
  owner's approval then fails.
- **Fix.** Registering a receipt extends the order's **live** holds to the
  first receipt + a bounded review window (repeated uploads do not extend
  it; a hold that already lapsed is not revived without checking stock —
  approval re-secures it if the unit is still there). The window lives in a
  new store-owned file rather than `src/config/checkout.ts`, whose inline
  type stores may have customised (a new required field would break their
  typecheck on sync).
- **Hook.** `src/config/receipt-review.ts` → `RECEIPT_REVIEW.holdHours`
  (default 48 — an operational default each store can change).
- **Status.** fixed in PR D.

### Checked in batch D and not present

- **Saving another settings section converts "inherit" into an override.**
  The payment policy uses an explicit opt-in; unrelated saves keep `null`.

---

## Batch E — verified facts, image provenance and SEO projection (PR 5)

Reproduced before fixing:
- **E1.** `updateProduct` stored a hand-typed `verifiedAt: 2001-01-01` and
  published it.
- **E2.** The sharing image of a product whose photos were marked
  illustrative was the illustrative `fixture-front` photo (browser test
  against a production build).
- **E3.** `og:site_name` and `og:locale` were missing on every product page,
  and a product without photos had no `og:image` at all: the page's
  `openGraph` replaces the layout's.
- **E4.** `SupplierDetailsSchema` threw `TypeError: Invalid URL`.
- **E5.** A→B→A was rejected with "La URL bottle ya está reservada".
- **E6.** For a two-variant product, JSON-LD published `sku: "A-2"` (the
  first variant in stock). The feed claimed `identifier_exists=no` and sent
  `item_group_id` without any variant attribute.

Acceptance tests:
- `tests/unit/verification-stamps.test.ts` and
  `tests/integration/verification-stamping.test.ts` (E1);
- `tests/unit/image-provenance.test.ts` and
  `tests/integration/image-provenance.test.ts` (E2);
- `tests/e2e/sharing-metadata.spec.ts` and `tests/unit/og-image.test.ts`
  (E2, E3);
- `tests/integration/catalogue-inheritance.test.ts` (E5);
- `tests/unit/structured-identifiers.test.ts` and
  `tests/unit/product-feed.test.ts` (E6).

### E1 · Verification dates are typed by the browser and never attributed — P1

- **Failure.**
  - `verifiedAt` is free JSON in a textarea: any staff user can back-date it,
    and the actor is discarded.
  - Changed facts keep the old date.
  - Duplicating a product copies the verification.
  - A spreadsheet can set any date, including on GTINs.
- **Fix.**
  - `src/lib/verification-stamps.ts` drops every submitted
    `verifiedAt`/`verifiedBy`.
  - The form's "Verifiqué estos datos" checkbox makes the server stamp the
    time and the session's user (`verifiedBy`, private).
  - Saving unchanged content keeps the previous stamp as it was; a
    historical stamp without an author gets no invented author.
  - Changed content without confirmation stays unverified, so it is not
    published.
  - Applies to specifications, supplier details, variant attributes and
    identifiers.
  - Identifiers only exist verified: a changed GTIN/MPN without confirmation
    is rejected (`adminError.producto.identificadoresSinVerificar`).
  - A spreadsheet never verifies. An equal value keeps its stamp; a
    different one is stored unverified, and a new or different GTIN/MPN is
    rejected in the preview.
  - Duplicates are unverified.
  - Public projections strip `verifiedBy`.
- **Status.** fixed in PR E.

### E2 · Image provenance is per product; the sharing image ignores it — P1

- **Failure.** Provenance lives in `supplierDetails.imageProvenance`, so one
  illustrative image marks or unmarks them all. The OG image used the first
  photo even when the product was marked illustrative.
- **Fix.**
  - Migration `0024`: nullable `product_images.provenance` and
    `verified_at timestamp(3)`.
  - The panel marks each photo, and the server stamps the date.
  - Effective provenance = the photo's own, else the product's, else
    unknown.
  - Illustrative photos never go outside the page (OG, JSON-LD, feed) and
    are captioned in the gallery.
  - Completeness reads each photo.
- **Hook.** `src/config/public-facts.ts` (new store-owned file) →
  `PUBLIC_FACTS.publishUnknownImages`. The template default `true` keeps
  publishing unmarked photos as before; a store that requires declared
  provenance sets `false`.
- **Cross-store note.** A store created from the baseline added the same two
  columns in its own `0024` with byte-identical SQL, but its `0023` differs
  from this template's. B1's guard stops that store's sync with a `choque`
  report; adopting the template's history is a store-side decision (see
  "Needs a decision").
- **Status.** fixed in PR E.

### E3 · Product metadata drops the site's sharing image — P2

- **Failure.** Next replaces the layout's `openGraph` with the page's, so
  every product page lost `og:site_name` and `og:locale`. A product without
  photos had no `og:image` either.
- **Fix.**
  - The product page repeats the site name (`nombreTienda()`) and locale.
  - Without a publishable photo it points at the site's own
    `/opengraph-image`.
  - Skipping `openGraph` altogether would also have dropped `og:title` and
    `og:description`, so it is kept.
- **Status.** fixed in PR E.

### E4 · Supplier URL validation throws — P2

- **Failure.** `.refine(new URL(v))` runs after `z.url()` already failed, so
  "not a url" throws `TypeError` and the admin shows a generic error.
- **Fix.** `z.url({ protocol: /^https$/ })` with a Spanish message.
- **Status.** fixed in PR E.

### E5 · A product cannot take back its own previous slug — P2

- **Failure.** A→B→A is rejected as a conflict, although the alias belongs
  to the same product.
- **Fix.**
  - Only aliases owned by another product are rejected.
  - There is no chain or cycle risk: `getProductSlugRedirect` always
    resolves straight to the current slug.
  - The import preview still refuses a historical slug, because there the
    slug identifies the product.
- **Status.** fixed in PR E.

### E6 · Structured data and feed claim facts nobody verified — P2

- **Failure.**
  - Product JSON-LD takes the top-level `sku`/`gtin`/`mpn` from the first
    in-stock variant, so they change when it sells out.
  - The feed sends `identifier_exists=no` merely because no identifier was
    entered (Merchant Center disapproves a branded product that does have
    one).
  - The feed sends `item_group_id` for any multi-variant product, with no
    variant attribute.
- **Fix.**
  - Top-level identifiers only for single-variant products; offers keep
    their SKU.
  - `identifier_exists=no` only when the store declares it.
  - One grouping rule, `src/lib/variant-grouping.ts`, for both outputs: a
    declared `schemaProperty` dimension, verified on every variant, with
    more than one value. The feed then also sends `g:color`, `g:size`, etc.
- **Hook.** `PUBLIC_FACTS.noManufacturerIdentifiers` (`false` in the
  template).
- **Status.** fixed in PR E.

### Checked in batch E and not present

- Sold-out `?variante=` selecting another variant, invalid SKUs in the
  canonical, 308 slug redirects dropping the variant, ProductGroup shape
  changing on sell-out, supplier identity in public queries, jewellery
  vocabulary in `src/`.

---

## Batch F — accessibility and catalogue usability (PR 6)

Reproduced before fixing:
- **F1.** Product, variant, category and settings forms: no field got
  `aria-invalid`, and focus stayed on the submit button.
- **F2.** Customer registration and password change had no confirmation
  field.
- **F3.** The product-card link contained the wishlist `<button>`.
- **F4.**
  - At 390 px the filter controls were all open, with no disclosure button.
  - Brand and attribute counts could not take the other filters at all: the
    query functions had no parameter for them.
  - The price filter showed for categories with no visible price.
  - "Limpiar todo" dropped the sort order.
- **F5.** `/comparar` shipped the SKUs of products not being compared.
- **F6.** Recently viewed cards had no caption for an illustrative photo,
  and the generic placeholder used the product name as its alt text.

Acceptance tests:
- `src/components/__tests__/admin-field-errors.test.tsx` (F1);
- `src/components/__tests__/customer-password.test.tsx` (F2);
- `src/components/__tests__/catalogue-cards.test.tsx` (F3, F6);
- `src/components/__tests__/catalogue-filters.test.tsx` and
  `tests/integration/catalogue-filters.test.ts` (F4);
- `tests/e2e/accesibilidad.spec.ts`: axe (WCAG 2.1 A/AA) on seven storefront
  and admin pages at 1280 and 390 px, plus F4 and F5 in a real browser.

axe found no violations on those pages before F, so they were already
clean. It does not flag F3: a `<button>` inside an `<a>` is invalid HTML,
but axe's `nested-interactive` rule only applies to roles with
presentational children. The component test covers F3.

### F1 · Admin validation errors are not tied to fields — P2

- **Failure.** Product, variant, settings and category forms show the first
  zod issue, often in English, in one alert. Fields get no `aria-invalid`,
  no `aria-describedby` and no focus, and collapsed sections stay closed.
- **Fix.**
  - Actions return `fields` (`name` → message) next to `error`, parsed with
    zod's Spanish messages (`parseEs`; the schemas' own messages still win).
  - Domain errors that belong to a field are mapped to it: repeated slug or
    SKU, ₲0 price, unverified GTIN.
  - Each field gets `aria-invalid` and `aria-describedby`. Focus moves to
    the first invalid field and opens its `<details>`.
  - A broken JSON field is marked on its own instead of with a generic
    alert.
  - Settings fields are drawn by the page, so that form marks them by
    `name` without touching their markup.
- **Hook.**
  - `src/lib/field-errors.ts`: `parseEs`, `zodFieldErrors`.
  - `src/components/admin/field-error.tsx`: `fieldA11y`, `FieldError`,
    `useFocusFirstInvalid`.
  - `adminFieldError`/`fieldFor` in `src/lib/admin-guard.ts`.
- **Status.** fixed in PR F.

### F2 · Customer password forms lack confirmation and visibility — P2

- **Failure.** `/cuenta` password change and registration use a bare input,
  so a typo is saved silently. Setup already confirms and reveals.
- **Fix.**
  - Both forms use `NewPasswordFields`: typed twice, with show/hide.
  - `registrarCliente` and `guardarContrasena` also compare
    `passwordConfirmation` on the server, like setup.
- **Status.** fixed in PR F.

### F3 · Product-card controls are nested inside the link — P2

- **Failure.** The wishlist `<button>` is inside the card `<a>`. That is
  invalid interactive content, and the link's name includes "Guardar en
  favoritos".
- **Fix.**
  - The heart is a sibling of the link.
  - The link still covers the whole card through a stretched `::after`.
  - `data-testid` and `data-slug` stay on the link.
- **Status.** fixed in PR F.

### F4 · Catalogue filters are unusable on mobile and counts ignore other filters — P2

- **Failure.**
  - Up to eleven open controls sit above the grid on a phone.
  - The result count is not announced.
  - Facet counts ignore the other selected filters.
  - Empty facets and an always-on price filter offer choices that return
    nothing.
  - "Limpiar todo" drops the sort order and attribute filters that had no
    chip.
- **Fix.**
  - Mobile disclosure: `FilterDisclosure` with `aria-expanded`, always open
    from `md` up.
  - The count paragraph is `role="status"`.
  - Every brand and attribute count is conditioned on the other filters.
    Options come from the whole category, so a 0 option is shown but
    disabled.
  - For variant attributes, the same variant must satisfy the other
    variant filters and the stock filter.
  - Attributes without values are hidden.
  - The price filter is offered only when some product in the category
    shows a price (`categoryHasPrices`).
  - Attributes and stock get chips, and "Limpiar todo" keeps the sort
    order.
- **Hook.** `CatalogFilters` takes optional `showPrice` and `facets`;
  `getBrands`/`getCatalogueFacets` take an optional filter context. Existing
  calls keep working.
- **Status.** fixed in PR F.

### F5 · Comparison serializes the whole catalogue to the client — P3

- **Failure.** `/comparar` loads up to 100 hydrated products and passes them
  to the client picker, which needs only slug and name.
- **Fix.**
  - A slim, bounded `getComparisonCandidates`.
  - The chosen products come first, so they can be unchecked even when they
    are outside the first 100.
- **Status.** fixed in PR F.

### F6 · Recently viewed and cards drop image provenance — P2

- **Fix.**
  - Product cards and recently viewed caption an illustrative photo
    ("Imagen ilustrativa").
  - Recently viewed stores the first non-illustrative photo, and an
    illustrative one is flagged.
  - The generic placeholder gets `alt=""`.
- **Status.** fixed in PR F.

### Checked in batch F and not present

- Role-aware sidebar (server-filtered), mobile admin drawer with logout,
  remito print rules, setup confirmation/visibility and success hand-off.

---

## Needs a decision

These are business or store-side choices. The template ships a neutral default
and a hook; none of them is decided for a store.

- **A store whose own migrations collide with the template's** (B1, E2). A
  store created from the baseline has its own `0023` (the template's DDL
  without the current-slug backfill) and its own `0024`, whose SQL is
  identical to the template's new `0024`.
  - B1's guard stops its sync before writing anything, which is the safe
    outcome.
  - To adopt the template's history, the store has to reconcile its
    `__drizzle_migrations` rows and journal by hand, following the steps in
    NEW-STORE.md § "Migraciones propias de una tienda". It should take a
    backup first and rehearse on a disposable copy.
  - The other option is to keep its own history and port template changes
    by hand.
  - That is the store owner's call, not the template's.
- **Unmarked photos outside the page** (E2). Should a store publish photos
  whose provenance nobody declared (`PUBLIC_FACTS.publishUnknownImages`)?
  The template keeps publishing them.
- **Receipt review window** (D5). `RECEIPT_REVIEW.holdHours` defaults to 48
  hours.
