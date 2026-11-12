# Old store inventory: anillos.com.py vs template v2.0.0

Date: 2026-11-11. Read-only inventory, produced to plan a rebuild of the store as a new repo from
`antonmarklundcom/ecom` at tag `v2.0.0`. It locates and classifies; it does not design the rebuild.

Notation. Paths are relative to the repo root. "Store" = the old store at `main` `bec7855`.
"Baseline" = template commit `c5422e3` (the store's `.template-baseline`). "v2" = template tag `v2.0.0`
(`3d4f086`). Spanish file and key names (`tienda.ts`, `maquinaria`, `piel`) are kept as in the repos.

## 0. How this was produced, and what is verified

- **Source of the store.** The store checkout `C:\Projects\anillos` is a junction to an archive drive
  that was not mounted during this work (the target drive letter did not exist). No file in it was read.
  Instead the public GitHub repo was cloned bare into a scratch folder and the tree at commit `bec7855`
  was read. `git log bec7855..main` on that clone lists exactly three commits (a Next.js security
  upgrade touching package files), matching the brief, so `bec7855` is the same commit the local
  checkout holds. Content at `bec7855` is therefore verified; the local working tree (uncommitted
  files, `node_modules`, `.env*`, ignored files, database) was not inspected.
- **Method.** Blob hashes from `git ls-tree -r` for store HEAD, baseline and v2, compared three ways;
  then the files that matter were read (schema, migrations, `tienda.ts`, `layout.tsx`, `globals.css`,
  queries, domain files, actions, store adapters, scripts, docs).
- **Evidence labels.** "Read" = I read the code. "Grep" = verified by text search across the three
  trees. "Inferred" = deduced from names, docs or structure; marked as such.
- Nothing was written in the store repo, in `C:\dev\ecom`, or in any database.

## 1. Numbers

File counts are blobs. `fable/**` is excluded from the v2 columns (a store deletes it); the baseline
had 50 `fable/*` files that the store deleted.

| Comparison | Only in left | Only in right | Common, content differs |
|---|---|---|---|
| Store vs v2 (left = store) | 417 | 203 (283 with fable) | 258 |
| Store vs baseline (left = store) | 437 | 3 (53 with fable) | 125 |
| Baseline vs v2 (left = baseline) | 5 | 225 (255 with fable) | 207 |

Totals: store 1059 files, baseline 675, v2 925. Common and identical between store and v2: 384.

Breakdown by top-level area.

| Area | Store only vs v2 | v2 only vs store (no fable) | Differ store vs v2 | Store only vs baseline | Store changed vs baseline |
|---|---|---|---|---|---|
| `public/` | 192 | 0 | 0 | 192 | 0 |
| `src/` | 111 | 75 | 153 | 125 | 89 |
| `tests/` | 55 | 94 | 58 | 57 | 18 |
| `docs/` | 46 | 13 | 2 | 46 | 2 |
| `scripts/` | 8 | 16 | 20 | 9 | 7 |
| `drizzle/` | 3 | 3 | 4 | 6 | 1 |
| root and `.github` | 2 | 2 | 21 | 2 | 8 |

Notes that change how the numbers should be read:

1. Many of the 125 baseline-changed files are mixed: real changes plus Prettier-style reformatting
   (double quotes, 80 columns) of template files. Grep/diff shows this in `stock-alerts.ts`,
   `admin-categories.ts`, `users-manager.tsx`, `product-form.tsx` and others. No changed `.ts/.tsx/.css`
   file is formatting-only (all 114 have a real change), but line counts overstate the real change.
2. Of the 125 store-changed baseline files, 94 were also changed by the template since the baseline
   (merge-conflict zone), 31 are untouched by the template, and 1 is now byte-identical to v2
   (`src/app/actions/admin-auth.ts`: the store's login-after-setup work was upstreamed verbatim).
3. 23 store-added paths also exist in v2 under the same path with different content (the template
   re-implemented the idea): see section 3.3.
4. The store has 3 files v2 deleted (`src/lib/<removed-provider>.ts` and its two unit tests) and lacks
   `src/app/loading.tsx` and `.github/dependabot.yml` (v2 also removed both).
5. Test files: baseline 179, store 263, v2 247.

## 2. Store-only files (417 vs v2; 437 vs baseline)

### 2.1 Public pages and routes (read)

| Route | File | What it is |
|---|---|---|
| `/colecciones` | `src/app/colecciones/page.tsx` (290 lines) | Index of the ten ring collections plus campaign links |
| `/elegir` | `src/app/elegir/page.tsx` | Ring finder: occasion and style, suggests up to three collections and guides |
| `/guias`, `/guias/[slug]` | `src/app/guias/page.tsx`, `src/app/guias/[slug]/page.tsx` | Twelve editorial guides; `/guias/talles` is the sizing guide with a printable A4 sheet |
| `/campanas`, `/campanas/[slug]` | `src/app/campanas/**` | Editorial campaign pages driven by the private sales workspace; disabled or unknown slug returns 404 |
| `/contacto` | `src/app/contacto/page.tsx` | Contact and enquiry page |
| `/como-funciona` | `src/app/como-funciona/page.tsx` | How enquiries work (demand-test explanation) |
| `/comparar` | exists in v2 as well (different file) | Store version in section 3.3 |
| icon | `src/app/icon.svg` | Brand icon |

Also changed (not new): `/`, `/categoria/[slug]`, `/producto/[slug]`, `/buscar`, `/favoritos`, `/checkout`,
`/pedido/[orderNumber]`, `sitemap.ts`, `opengraph-image.tsx`, `feed.xml`, `error.tsx`, `favicon.ico`.

### 2.2 Admin pages, routes and actions (read)

- Pages: `/admin/ventas` (shared sales workspace; owner only through `requireOwnerSession`),
  `/admin/herramientas-ventas` (older browser-local follow-up ledger, margin calculator, marketing
  draft text). `/admin/bienvenida`, `/admin/guia`, `/admin/seo` exist in v2 too, with different content.
- Actions: `src/app/actions/sales-workspace.ts` (read, save, audit, undo, export, delete, record and read
  search gaps), `admin-sales-price-floors.ts` (preview of cost-floor warnings for bulk price changes),
  `admin-image-focal.ts` (save image focal point; move image).
- No new API routes. The store changed `api/health`, `api/version`, `api/setup/init`.

### 2.3 Components (read headers, sizes)

Public: `cinematic-hero.tsx` (240, scroll-driven hero), `editorial-image.tsx`, `collection-navigation.tsx`,
`catalogue-choices.tsx`, `catalogue-interactions.css`, `catalog-unavailable.tsx`, `checkout-enquiry.tsx`,
`enquiry-composer.tsx` (337, WhatsApp message builder), `product-enquiry-brief.tsx`, `product-comparison.tsx`,
`product-faqs.tsx`, `product-gallery.tsx` (305, zoom and focal point), `product-quick-view.tsx`,
`ring-content.tsx`, `ring-finder.tsx`, `ring-measurement.tsx` (184), `search-gap-counter.tsx`,
`ui/new-password-fields.tsx`, `ui/password-input.tsx` (identical to v2).
Admin: `admin-navigation.tsx` (337), `field-validation.tsx`, `image-focal-controls.tsx`,
`product-attribute-fields.tsx` (342), `product-faq-editor.tsx`, `product-seo-checklist.tsx`,
`sales-operations.tsx` (2595 lines), `sales-operations-evidence.tsx`, `sales-operations-history.tsx`,
`sales-operations-helpers.ts`, `sales-workbench.tsx` (678), `seo-coverage-dashboard.tsx`, two CSS modules.
Component-level tests: 25 files (`src/components/__tests__/**`, `src/components/admin/**`, `cart-sheet.test.tsx`).

### 2.4 Styles (read)

`src/styles/catalogue-choices.css`, `catalogue-editorial.css` (500), `product-editorial.css` (290),
`sales-tools.css`, `src/components/catalogue-interactions.css`. Together with about 750 added lines in
`src/app/globals.css` these hold the visual identity (see section 5).

### 2.5 `src/domain`, `src/lib`, `src/store`, `src/config`, `src/content`, `src/db` additions (read)

| Group | Files |
|---|---|
| Domain, store-only | `sales-workspace.ts` (1169, zod schemas for ~20 record kinds), `sales-workspace-store.ts` (784, read/save/audit/undo), `sales-price-floors.ts`, `image-focal-point.ts` |
| Domain, also in v2 with different content | `catalogue-facets.ts`, `payment-policy.ts`, `product-slugs.ts` |
| Lib, store-only | `concept-products.ts`, `admin-navigation.ts`, `admin-validation.ts`, `gallery-zoom.ts`, `product-comparison.ts`, `product-image-provenance.ts` |
| Lib, also in v2 with different content | `product-attributes.ts`, `public-product-facts.ts`, `variant-url.ts` |
| `src/store/` (12, all store-only) | `identity.ts`, `catalog.ts`, `search.ts`, `seo.ts`, `campaigns.ts`, `enquiry-brief.ts`, `enquiry-draft.ts`, `product-guidance.ts`, `product-metadata.ts`, `product-seo-readiness.ts`, `ring-finder.ts`, `sales-workbench.ts` |
| `src/config/` | `ring-store.ts` (10 collections, 24 concept entries, notice text), `ring-display.ts`, `home-hero.ts`, `product-placeholders.ts`, `checkout.ts` (also in v2) |
| `src/content/` (8, ~3,900 lines of Spanish copy) | `category-pages.ts` (820), `guide-pages.ts` (619), `guides.ts` (313), `ring-expansion.ts` (573), `keyword-coverage.ts` (1313, a 166-label keyword plan), `catalogue-choices.ts`, `collection-guidance.ts`, `ring-content.ts` |
| `src/db/` | `product-image-compat.ts` (reads image rows tolerating missing migration columns), `migration-status.ts` (also in v2, different) |

### 2.6 `src/db/schema.ts` changes (read, section 6 has detail)

Added: `product_slug_redirects`, `sales_workspace`, `sales_workspace_audit`, `sales_search_gaps`; columns on
`categories` (`seo_title`, `seo_description`), `products` (`specifications`, `supplier_details`, `seo_title`,
`seo_description`), `variants` (`attributes`, `identifiers`), `product_images` (`provenance`, `verified_at`,
`focal_point_x`, `focal_point_y`). Backup table inventory extended with the new tables.

### 2.7 `drizzle/` migrations made by the store (read)

The store's journal has 26 migrations (`0000`..`0025`); the baseline has `0000`..`0022`. Store-made:

| # | Name | Creates / alters | Same thing in v2? |
|---|---|---|---|
| 0023 | `0023_previous_mockingbird` | Creates `product_slug_redirects` (+ FK, index); adds `categories.seo_title`, `seo_description`; `products.specifications`, `supplier_details`, `seo_title`, `seo_description`; `variants.attributes`, `identifiers` | Yes: v2 `0023_lucky_black_widow` has identical DDL plus one extra statement that back-fills `product_slug_redirects` from existing products (read; the template's own docs say the same) |
| 0024 | `0024_silent_star_brand` | `product_images.provenance` enum(`supplier-authorized`,`owned-photo`,`illustrative`), `product_images.verified_at` timestamp(3) | Yes: v2 `0024_condemned_franklin_storm`, same SQL (read; the template's handoff states byte-identical) |
| 0025 | `0025_dizzy_sentry` | Creates `sales_workspace`, `sales_workspace_audit`, `sales_search_gaps`; adds `product_images.focal_point_x`, `focal_point_y` | **No.** v2 `0025_dear_arachne` is unrelated (creates `supplier_offers`; adds `products.featured_position`, `products.supplier_url`). Same number, different content |

Per the owner manual, 0023 and 0024 are applied in production and 0025 is generated but not applied (as of
the manual's date, 8 Oct 2026; current production state not checked). Store snapshots
`drizzle/meta/0023..0025_snapshot.json` differ from v2's.

### 2.8 Scripts (read headers)

`scripts/seed-store.ts` (creates the ten collections; with `--with-concepts` only on a disposable loopback test
database, adds the 24 concept products), `scripts/check-store-catalog.ts` (read-only catalogue diagnosis),
`scripts/prepare-supplier-catalogue.ts` + `supplier-catalogue-data.ts` (build unpriced enquiry-mode draft CSV from
`docs/supplier-models-2026-10.json`, 12 models, no DB access; `pnpm catalogue:prepare`),
`scripts/local-storefront-audit.ts` (466) + `-policy.ts` (Chromium run on a local build: budgets, screenshots),
`scripts/verify-backup.ts` (`pnpm backup:verify`, restore rehearsal on a `_restore_check` test database),
`scripts/test-admin-workspace-fixture.ts` (isolated admin browser fixture), `scripts/template-migrations.ts`
(store's earlier migration-history guard; v2 has a 354-line replacement), `playwright.store.config.ts`.

### 2.9 Tests (84 store-only test files)

`tests/unit` 35, `tests/integration` 11, `tests/store` 11 (Playwright specs run by `playwright.store.config.ts`:
admin setup, admin workspace, audit, catalogue outage, editorial, comparison, SEO, store), `src/**` 25 and
`src/app/**` 2. Topics: sales workspace (schema, normalization, operations, price floors, workbench), enquiry
draft, ring finder and ring search, concept products, catalogue facets and choices, product guidance/metadata/
SEO readiness, image provenance and focal compat, payment policy and inheritance, receipt finalization, backup
(versioned, verify), health deadline, local audit policy, wishlist normalization, gallery zoom, admin login and
safe redirect.

### 2.10 Docs (46 store-only files)

Operations: `OWNER-OPERATING-GUIDE.md`, `WHATSAPP-SALES-WORKSPACE.md`, `SALES-ENQUIRY-TOOLS-2026-10.md`,
`MERGE-READINESS-2026-10.md`, `DEMAND-TEST-REVIEW-2026-10.md`, `ADMIN-SETUP.md`, `ADMIN-WORKSPACE.md`,
`LAUNCH-CHECKLIST.md`, `STORE-IMPLEMENTATION.md`, `VERIFICATION.md`, `LOCAL-STOREFRONT-AUDIT.md`,
`CLOUDFLARE-EMAIL-HANDOFF.md`, `CLAUDE-EMAIL-INVESTIGATION.md`.
Research/planning: `COMPETITOR-RESEARCH.md`, `SUPPLIER-*` (6), `SEO-*`/`CATALOGUE-SEO-REVIEW.md`,
`WHATSAPP-OPERATIONS-*` (2), `IMPROVEMENT-PLAN-2026-10.md`, `CODING-HANDOFF-2026-10.md`,
`ECOM-TEMPLATE-UPSTREAM.md`, `ECOM-BUG-AUDIT-PROMPT.md`, `REVIEW-FIXES-ROLLOUT.md`, `SITE-IMPROVEMENTS.md` and
others. Data: `supplier-models-2026-10.json`, `supplier-candidates-draft.csv` (12 rows),
`supplier-catalogue-coverage.csv`, `catalogue-intents-2026-10.json`, `MEDIA-PROVENANCE.json`, `docs/review/`
(6 screenshots, 1.17 MB). Several contain supplier business names, prices or phone numbers: do not copy blindly
into a template-derived repo that will be public or shared.

### 2.11 Public assets (grep and tree sizes)

`public/media/` holds 192 files, 6,794,665 bytes (6.5 MiB): 185 `.webp` (3,778,264 B), 2 `.mp4` (2,574,204 B),
1 `.png` logo (280,608 B), 1 `.jpg` Open Graph image (129,292 B), 3 `.json` (32,297 B).
Of these, 174 files (2.73 MB) are scroll-sequence frames in `media/frames/desktop/` (97) and
`media/portrait-frames/` (77), and the two `.mp4` files: a grep of `src/` and `scripts/` finds no reference to
`frames`, `.mp4` or the two video names, so they appear to be unused by current code (they are mentioned only in
audit docs and `docs/MEDIA-PROVENANCE.json`). The 18 root files (hero, collection images such as `steel.webp`,
`silver.webp`, `pair.webp`, `gold-pair.webp`, `engagement.webp`, detail images, `logo-wordmark.webp`,
`logo-anillos.png`, `og-editorial.jpg`, `assets.json`) are referenced by `config/home-hero.ts`,
`config/ring-store.ts` and `tienda.ts` helpers. `docs/MEDIA-PROVENANCE.json` says the media are concept editorial
images generated with image tools, "not supplier photos or proof of materials". Rights: not determined.
`public/placeholders/` (6 SVG) is common with the template.

## 3. Template files the store changed since the baseline

Reading guide. "Skin" and "machinery" follow the table in the template `CLAUDE.md` and `NEW-STORE.md` §5.
"v2 equiv" names the v2.0.0 file where an equivalent exists. Status: R = verified by reading both sides,
G = verified by grep of the symbol in v2, I = inferred. 125 files total.

### 3.1 Machinery changes

| File | What the store changed | v2 equivalent |
|---|---|---|
| `src/db/schema.ts` | Section 2.6 | v2 `src/db/schema.ts` has all but `sales_*` tables and `focal_point_*` (R). v2 also renamed TS properties (`imageRef`, `storageKey`, `qrImageRef`) over the same legacy column names (R) |
| `src/db/queries.ts` | Concept policy in SQL (price hidden, concept-last ordering, min price rule with live availability), facet predicate, FULLTEXT-missing fallback, query length bounds, comparison candidate query, image reads via compat layer, new public fields (specs, seo, focal, provenance) | v2 `queries.ts`: FULLTEXT fallback, facet predicate, `getComparisonCandidates`, `verifiedSpecifications` (G). Not in v2: concept policy, focal point, compat image read |
| `src/domain/cart.ts` | Rejects non-positive price; blocks concept slugs | Price rule: v2 `isChargeablePrice` (R). Concept block: none |
| `src/domain/orders.ts` | 48 h receipt-verification hold anchored on first receipt | v2 does it in `receipts.ts` with `RECEIPT_REVIEW.holdHours: 48` (R); `orders.ts` identical to baseline |
| `src/domain/receipts.ts`, `receipt-review.ts`, `src/app/actions/receipt.ts` | Atomic `finalizeUploadedReceipt`, lock order order then receipt then variants, `receiptAssetRecorded` to keep an asset when a commit acknowledgement is lost | `finalizeUploadedReceipt` exists in v2 (G, R for receipts.ts). `receiptAssetRecorded`: not found in v2 (G). Review the action's cleanup path before assuming parity (I) |
| `src/domain/payment-readiness.ts`, `store-settings.ts`, `store-settings-schema.ts`, `scripts/preflight.ts` | `checkout.metodosPago` setting (null inherit, [] pause), effective payment preflight, env `STORE_PAYMENT_METHODS` | v2 has `metodosPago`, `paymentPolicy`, preflight payments (R/G). Store default is empty; v2 knob is `src/config/checkout.ts` `CHECKOUT.paymentMethods` |
| `src/domain/admin-products.ts`, `admin-categories.ts`, `catalog-import.ts`, `catalog-import-plan.ts`, `admin-bulk.ts`, `scripts/seed.ts`, `scripts/importar-productos.ts` | Verified specifications, supplier details, variant attributes/identifiers, SEO fields, slug history claims, draft-by-default imports, atomic plan apply, SKU ownership under lock, audit rows | v2 has the same CSV headers (`ficha tecnica json`, `proveedor json`, `atributos variante json`, `titulo seo`) in `catalog-csv.ts` (R) and a plan/apply flow (G). **JSON shape differs** (section 6) |
| `src/domain/backup.ts`, `backup-format.ts` | Backup tables follow the applied migration; new tables in inventory | v2 has `backupTablesForMigration` (G) |
| `src/domain/job-runs.ts`, `daily-digest.ts`, `src/app/api/health/route.ts`, `admin/(panel)/page.tsx` | Backup-overdue flag (26 h), included in the daily digest and health, migration status | `backupAtrasado` in v2 `job-runs.ts`, health, dashboard (G). Daily-digest line: not in v2 (G) |
| `src/domain/stock-alerts.ts` | Back-in-stock alert only for active category, variant and positive price | Not in v2 (R) |
| `src/lib/cart-store.ts`, `wishlist-store.ts`, `safe-redirect.ts`, `admin-guard.ts`, `comercio.ts`, `images.ts`, `seo.ts`, `product-feed.ts` | Stale-response guard in cart refresh; slug validation in wishlist; admin redirect normalization; field errors in guard result; contact fallback from `TIENDA.whatsapp`; `card-fit` image size; JSON-LD and feed with verified facts; 503 on feed outage | Feed 503 and JSON-LD/ProductGroup: v2 has them (G). `TIENDA.whatsapp` fallback, `card-fit`, wishlist and cart guards: not in v2 (G, I) |
| `src/app/actions/admin-products.ts`, `admin-categories.ts`, `admin-export.ts`, `admin-auth.ts`, `search-suggest.ts` | Attribute validation, SEO fields, extra export columns, `loginAdminAfterSetup`, suggestions through `suggestStoreProducts` | `admin-auth.ts` is byte-identical to v2 (R). Others differ; v2 versions are larger (R for sizes) |
| `src/app/api/health/route.ts`, `api/version/route.ts`, `api/setup/init/route.ts` | Per-probe deadlines, migration status, session-version bump on owner reset | v2 changed all three too (R for existence) |
| `scripts/migrate.ts`, `db-check.ts`, `template-sync.ts`, `template-diff.ts` | Migration history guard, lock wait timeout, compare applied hashes | v2 has all (R/G), larger |
| `src/app/admin/(panel)/layout.tsx` | Replaces the admin header with grouped `AdminNavigation` | v2 uses `components/admin/sidebar.tsx` and `menu.ts` (R) |

### 3.2 Skin changes (and mixed skin/machinery pages)

| File | Change |
|---|---|
| `src/app/globals.css` | Imports `calido.css`, five store stylesheets, adds ~750 lines (hero, sections, buttons, header, footer, prose), hex colours |
| `src/styles/temas/calido.css` | Token values replaced: olive and cream palette, `--radius: 0.25rem` (read, section 5) |
| `src/app/layout.tsx` | Drops `next/font` Geist, adds skip link and `id="contenido"`, `storeIdentity()` instead of `marcaEfectiva()`, passes `enquiryMode` to cart sheet |
| `src/app/page.tsx` (home) | Cinematic hero, collections and guides sections, concept filter (mixed) |
| `src/app/categoria/[slug]/page.tsx` | Editorial copy, catalogue choices, store category adapter, concept filter (mixed, 564 lines changed) |
| `src/app/producto/[slug]/page.tsx` | Gallery, FAQs, enquiry brief, guidance, variant URLs, concept notice and noindex (mixed, 491 lines) |
| `src/components/site-header.tsx`, `site-footer.tsx`, `product-card.tsx`, `catalog-filters.tsx`, `search-box.tsx`, `wishlist-view.tsx`, `recently-viewed.tsx`, `add-to-cart.tsx`, `product-image.tsx`, `cart-sheet.tsx` | Store presentation and enquiry copy; `cart-sheet` and `add-to-cart` carry enquiry-mode behaviour (mixed) |
| `src/app/buscar/page.tsx`, `favoritos/page.tsx`, `checkout/page.tsx`, `pedido/[orderNumber]/page.tsx`, `error.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `feed.xml/route.ts`, `favicon.ico` | Copy, enquiry checkout state (`CheckoutEnquiry` when no payment method is ready), brand image, sitemap additions (guides, collections, campaigns, concept exclusion) |
| `src/config/tienda.ts` | Section 5 |
| `src/config/paginas-default.ts` | Replaces shipping and returns default policy text with demand-test wording (text) |
| `src/i18n/es-PY.ts`, `src/i18n/public-catalogs.ts` | Adds keys (password, setup, concept errors, enquiry messages); removes 18 template keys such as `header.categorias`, `footer.*`, `home.*`, `setup.preflight`, `setup.seed` (risk, section 7) |
| Admin skin and forms | `product-form.tsx`, `variant-editor.tsx`, `product-images.tsx`, `categories-manager.tsx`, `users-manager.tsx`, `bulk-price-dialog.tsx`, `login-form.tsx`, `store-settings-form.tsx`, `setup-form.tsx`, `cuenta/*` forms, admin pages `ajustes`, `banco`, `categorias`, `productos/[id]`, `login`, `pedidos/[id]/imprimir`, `setup/page.tsx` | Mostly added fields, validation and Prettier reformatting; `setup-form.tsx` adds post-setup login and disables the demo catalogue (machinery-adjacent) |

### 3.3 Store-added paths that v2 re-implemented (same path, different content)

`src/app/comparar/page.tsx` (store 106 lines vs v2 132), `src/components/product-gallery.tsx` (305 vs 194),
`src/lib/product-attributes.ts` (184 vs 128, different JSON shape), `src/lib/public-product-facts.ts`,
`src/lib/variant-url.ts` (5 changed lines), `src/domain/catalogue-facets.ts` (216 vs 277),
`src/domain/payment-policy.ts` (26 vs 39), `src/domain/product-slugs.ts`, `src/config/checkout.ts`,
`src/db/migration-status.ts` (23 vs 115), `scripts/template-migrations.ts` (64 vs 354),
`src/app/admin/(panel)/{bienvenida,guia,seo}/page.tsx` (store far larger), `src/components/ui/new-password-fields.tsx`,
`tests/integration/{catalog-import-safeguards,image-provenance,receipt-finalization}.test.ts`,
`tests/unit/payment-policy.test.ts`. `src/components/ui/password-input.tsx` is identical to v2.

### 3.4 Docs and tooling

`AGENTS.md`, `CLAUDE.md`, `README.md`, `DEPLOY.md`, `NEW-STORE.md` (store-specific notes; v2 versions are the
reference), `docs/BACKUP-RECOVERY.md`, `docs/ENV-OPCIONAL.md` (section 5), `eslint.config.mjs` (more ignores),
`package.json`, `pnpm-workspace.yaml`, `drizzle/meta/_journal.json`.

## 4. Store-only features

Legend for v2: **covered** = v2.0.0 has an equivalent; **partial**; **none**. Suggested class: SKIN, FEATURE
(store-only feature), COVERED, DROP. Classes are suggestions for planning, not a design.

| # | Feature | Routes and components | Tables / columns | Scripts and tests | v2.0.0 | Suggested class |
|---|---|---|---|---|---|---|
| 1 | Concept products: price hidden, enquiry only, noindex, out of sitemap and feed, blocked in cart, slug prefix `concepto-` (24 entries in `config/ring-store.ts`) | `/producto/[slug]` (robots noindex, read), `product-card`, `recently-viewed`, `wishlist-view`, `sitemap.ts`, `domain/cart.ts`, `queries.ts`, `product-slugs.ts` boundary | none new; uses `products.sale_mode='enquiry'`, `show_price=false` | `seed-store.ts --with-concepts` (test DB only), `concept-products.test.ts`, `ring-display.test.ts` | partial: `sale_mode` (stock/enquiry/showcase) and `show_price` exist (R); no concept flag, no noindex or sitemap or cart rule by slug | FEATURE |
| 2 | Enquiry over WhatsApp: composer, per-product brief, favourites enquiry (up to five), checkout enquiry state, enquiry-mode cart | `enquiry-composer`, `product-enquiry-brief`, `checkout-enquiry`, `cart-sheet` (`enquiryMode`), `store/enquiry-brief.ts`, `store/enquiry-draft.ts` (browser drafts) | none | `enquiry-draft.test.ts`, `enquiry-composer.test.tsx` | partial: `variant-inquiry-link.tsx`, `whatsapp-fab.tsx`, `enquiry` sale mode (R); no composer, no paused-checkout page | FEATURE (copy is SKIN) |
| 3 | Payments paused by default (demand test) | `config/checkout.ts` empty list | `store_settings.checkout.metodosPago` JSON | payment tests | covered: `CHECKOUT.paymentMethods` in v2 (R) | COVERED (set value) |
| 4 | Ring finder `/elegir` | `ring-finder.tsx`, `store/ring-finder.ts`, page | none | `ring-finder.test.ts` | none | FEATURE |
| 5 | Sizing guide `/guias/talles`, printable A4 calibration sheet, `ring-measurement` | `ring-measurement.tsx`, `ring-content.tsx`, `content/guide-pages.ts`, `guides.ts` | none | `ring-measurement.test.tsx` | none (v2 `catalogue-editorial.tsx` renders generic sections, FAQ, guide links) | FEATURE + content |
| 6 | Twelve guides, ten category pages, collection guidance, keyword plan data | `/guias/**`, `content/*` (~3,900 lines) | none | `keyword-coverage.test.ts` | partial: `config/catalogue.ts` editorial slots and `editorial-tools.ts` keyword list, both empty by default (R) | content: FEATURE data over COVERED mechanism |
| 7 | `/admin/seo` coverage dashboard (166 labels) | `seo-coverage-dashboard.tsx`, `content/keyword-coverage.ts` | none | `seo-coverage-dashboard.test.tsx` | covered mechanism: `admin/keyword-coverage.tsx` + `EDITORIAL_TOOLS` (R) | COVERED + data |
| 8 | Shared sales workspace `/admin/ventas`: enquiries, supplier quotes, customer quotes with revisions, samples, supplier performance, demand, purchasing drafts, comparisons, fulfilled sales and contribution report, after-sales, reminders, product FAQs, campaigns, audit and undo, export and delete | `sales-operations*.tsx` (~3,800 lines), `domain/sales-workspace*.ts` (~1,950), actions, `src/store/sales-workbench.ts` | `sales_workspace`, `sales_workspace_audit` | 8 unit/integration tests, `tests/store/admin-workspace.spec.ts` | none | FEATURE |
| 9 | Browser-local sales tools `/admin/herramientas-ventas` (follow-ups, margin calculator, marketing text) | `sales-workbench.tsx` | none (browser storage) | `sales-workbench.test.ts(x)` | none | FEATURE (candidate for DROP: superseded by #8, per docs) |
| 10 | Search-gap counter (aggregate intent counts, off by default) | `search-gap-counter.tsx` on `/buscar` | `sales_search_gaps` | `ring-search.test.ts` | none | FEATURE |
| 11 | Campaign pages `/campanas/**` driven from workspace | pages, `store/campaigns.ts` | inside `sales_workspace.payload` | store specs | none | FEATURE |
| 12 | Cost-floor warnings in bulk price dialog | `bulk-price-dialog.tsx`, `admin-sales-price-floors.ts`, `domain/sales-price-floors.ts` | reads workspace payload | `sales-price-floors.test.ts` | partial: v2 `supplier_offers` + `lib/supplier-margin.ts` (R, names only) | FEATURE or COVERED (decide) |
| 13 | Image focal point and reorder controls | `image-focal-controls.tsx`, `admin-image-focal.ts`, `product-gallery` | `product_images.focal_point_x/y` | focal tests | none (G: no `focal` in v2) | FEATURE |
| 14 | Image provenance per image | `lib/product-image-provenance.ts` | `product_images.provenance/verified_at` | tests | covered: `lib/image-provenance.ts`, `config/public-facts.ts` (R) | COVERED |
| 15 | Verified specifications, supplier details, variant attributes and identifiers; SEO title/description overrides; completeness checklist | `product-attribute-fields`, `product-seo-checklist`, `store/product-seo-readiness.ts` | section 6 | tests | covered mechanism: `product-completeness`, `metadata-field`, same columns (R); **JSON shape differs** | COVERED (data transform) |
| 16 | Slug 301 history | `product-slugs.ts`, `admin-bulk.ts` | `product_slug_redirects` | tests | covered (v2 migration 0023, `product-slugs.ts`) (R) | COVERED |
| 17 | Variant URLs and ProductGroup | `variant-url.ts`, `lib/seo.ts` | none | tests | covered (`variant-url.ts`, `variant-grouping.ts`) (R/G) | COVERED |
| 18 | Facets (material, stone shape, width, unit, stock) | `catalogue-facets.ts`, `catalogue-choices.tsx` | reads `specifications` | tests | covered mechanism (`attribute-filters.tsx`, `catalogue-facets.ts`); ring keys are store data | COVERED + config |
| 19 | Comparison `/comparar` (3 models, sticky label column) | `product-comparison.tsx`, `lib/product-comparison.ts` | none | `tests/store/product-comparison.spec.ts` | covered (`/comparar`, `comparison-picker.tsx`, `CATALOGUE.comparisonLimit`) | COVERED |
| 20 | Recently viewed | `recently-viewed.tsx` (concept filter) | none | `recently-viewed-prices.test.tsx` | covered (exists in baseline and v2); concept filter is part of #1 | COVERED |
| 21 | Gallery zoom, quick view, collection navigation (mobile menu) | `product-gallery`, `product-quick-view`, `collection-navigation`, `lib/gallery-zoom.ts` | none | component tests | partial: v2 gallery exists (CSS-class based); quick view and nav variants: none (header variants `clasico/centrado` in themes) | SKIN/FEATURE |
| 22 | Catalogue outage fallback (editorial collections still render, hidden categories stay hidden) | `store/catalog.ts`, `catalog-unavailable.tsx` | none | `store-catalog.test.ts`, `catalog-outage.spec.ts` | none (G: no `catalogAvailable`) | FEATURE |
| 23 | Ring search vocabulary (typos, synonyms such as argolla/alianza) | `store/search.ts` | none | `ring-search.test.ts` | none | FEATURE |
| 24 | Owner welcome, admin guide, grouped admin navigation | `admin/bienvenida`, `admin/guia`, `admin-navigation.tsx` | none | `admin-navigation.test.ts` | covered (v2 has welcome, guide, sidebar) | COVERED |
| 25 | Supplier catalogue preparation (12 research models to draft CSV) and local storefront audit, backup rehearsal | scripts in 2.8 | none | tests | partial: v2 `catalogo-demo.csv`, `catalog-csv.ts`, `catalog-export.ts`; backup verify exists in store and v2 `restore-backup` | store data = DROP or archive; tools = COVERED/FEATURE |
| 26 | Hero scroll animation | `cinematic-hero.tsx`, `config/home-hero.ts`, `media/frames`, 2 mp4 | none | `home-hero` tests | none (v2 home sections are theme-ordered) | SKIN |
| 27 | Password show/hide and confirm fields | `ui/password-input`, `new-password-fields` | none | `password-forms.test.tsx` | covered (same file in v2) | COVERED |
| 28 | Demo-test copy, policy pages, WhatsApp messages | `paginas-default.ts`, i18n keys | none | none | text | SKIN |

## 5. Store identity and settings

### 5.1 `src/config/tienda.ts` (read)

- `nombre` "Anillos.com.py"; `titulo` "Anillos en Paraguay | Acero, plata y alianzas"; `descripcion` and `tagline` set;
  `lang` "es-PY"; `ogLocale` "es_PY"; `cuentasClientes: false`; `hero: null`.
- Added to the type: `whatsapp?: string` (public contact fallback, set to the business number; not reproduced here).
- Added helpers: `nombrePublicoDeMarca()` (strips the `.com.py` suffix for the wordmark and replaces preview hostnames
  `*.hostingersite.com`) and `logoPredeterminado()` (returns `/media/logo-wordmark.webp`). `src/store/identity.ts` wraps
  `marcaEfectiva()` with these.
- **No `tema` field, no `proveedores` flag** (v2 requires `tema: TemaId`; `proveedores` optional).
- The `hero.imagen` type field is named after the removed image provider and holds its id; v2 uses `imageRef` with `r2:` references. Store
  `hero` is `null`, so the type change is not a data issue.

### 5.2 Theme and tokens

- `globals.css` imports `src/styles/temas/calido.css` (old pre-kit format). The store modified that file: radius 0.25rem,
  background oklch(0.967 0.012 84) (warm cream), foreground oklch(0.28 0.013 125), primary oklch(0.37 0.025 130) (dark
  olive); dark mode block unchanged from template.
- Beyond tokens, `globals.css` (~750 added lines) and the store stylesheets hardcode colours: 24 hex literals in
  `globals.css`, 12 in `catalogue-editorial.css`, 20 in `product-editorial.css` (for example olive `#343b33` button, cream
  `#f8f4ec` stage). Hex or palette classes also appear in `home-hero.tsx`, `ring-measurement.tsx` (4),
  `opengraph-image.tsx` (4, template-allowed), and one each in several `ui/*` files.
- Fonts: no `next/font`; `globals.css` sets `--font-geist-sans: "Segoe UI", Arial, sans-serif`, mono Consolas, and headings
  in `Georgia, "Times New Roman", serif`. v2 theme kit suggests `Playfair Display + DM Sans` for `vitrina`
  (a boutique/jewellery preset) and `Fraunces + Figtree` for `calido`.
- v2 theme kit: `src/themes/presets/{calido,oscuro-vivo,vitrina}.ts`, `src/themes/custom.css` (store retouches). The
  store never adopted it (grep: no `src/themes` in store).

### 5.3 Hardcoded brand outside `tienda.ts` (grep)

- The literal `anillos.com.py` appears only in `tienda.ts`: the template's `marca-centralizada` rule would pass.
- The word "anillos" (ring vocabulary, domain terms) is in 42 non-test source files; this is product vocabulary, not the
  brand string. `scripts/test-admin-workspace-fixture.ts` and `docs/` use "anillos" as a test database name.
- The business WhatsApp number is in `tienda.ts` only (and docs). Supplier names and URLs are in `docs/` and
  `scripts/supplier-catalogue-data.ts` inputs.

### 5.4 Environment variables

- `docs/ENV-OPCIONAL.md` diff: adds a Chromium section (`CHROMIUM_PATH`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, local audit only),
  `STORE_ADMIN_E2E` (+ `STORE_CHROME_E2E`) for isolated admin browser tests, and a payment-policy section for
  `STORE_PAYMENT_METHODS` (also in v2).
- `process.env` reads present in store code but not in the baseline (grep of `src` and `scripts`): `CHROMIUM_PATH`,
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `STORE_ADMIN_E2E`, `STORE_PAYMENT_METHODS`. Only the last is in v2.
- The store still reads the removed provider's cloud-name variable and the integration `cloudName` setting (60 source
  files reference the provider: product, category, hero, bank QR, receipts, logo, favicon, backup cron). `.env.example`
  is unchanged from baseline.

### 5.5 `package.json` and tooling

- Scripts added: `build:webpack`, `catalogue:prepare`, `backup:verify`. Changed: `build` is `next build --webpack`
  (Turbopack not used; docs say Hostinger-supported webpack build), `prebuild` runs `tsx scripts/client-messages.ts`
  (v2: `pnpm i18n:client`). Missing vs v2: `registrar-tienda`, `start:guard`, `fotos:*`, `temas:css`,
  `template:adoptar-historial`, `template:atraso`.
- Dependencies: no additions vs baseline in the store. Against v2, the store is older on all tracked packages
  (next 16.3.6 vs 16.4.3, react 19.3.0 vs 19.3.1) and lacks `aws4fetch`, `@axe-core/playwright`, `sharp`;
  it carries the removed provider's SDK as a dev dependency. GitHub `main` upgrades Next to 16.4.1.
- `pnpm-workspace.yaml`: `frozenLockfile: true`, `verifyDepsBeforeRun: false` (Hostinger install behaviour).
  `eslint.config.mjs`: ignores `.env*`, `.review/**`, `playwright-report/**`, `test-results/**`.
  `next.config.ts` is identical to the baseline.

## 6. Data shape (schema read, no database access)

| Object | Store vs v2 |
|---|---|
| Tables in store schema | 37; v2 has 35 |
| Store-only tables | `sales_workspace` (one row, id, revision, `payload` JSON, updated_at), `sales_workspace_audit` (revision unique, actor, kind save/undo/delete, `changes` JSON, before/after payload JSON), `sales_search_gaps` (day, intent enum of 10 buckets, count; unique day+intent) |
| v2-only tables | `supplier_offers` (variant cost, source, stock, flags) |
| Same table in both | `product_slug_redirects` (slug PK, product_id FK cascade) |
| Store-only columns | `product_images.focal_point_x`, `focal_point_y` (int) |
| Columns v2 has and store lacks | `products.featured_position`, `products.supplier_url` |
| Columns in both, same DDL | `categories.seo_title/seo_description`; `products.specifications/supplier_details/seo_title/seo_description`; `variants.attributes/identifiers`; `product_images.provenance/verified_at` |
| Legacy-named columns | Both keep the image-id columns of `product_images`, `receipts`, `categories` and the bank QR setting under their legacy provider-based names (no rename migration); v2 only renamed TS properties. **Values differ**: the store holds the removed provider's public ids, v2 expects `r2:p1/...` references (tooling: v2 `scripts/fotos-migrar-*` and `domain/imagenes-legacy.ts`) |
| JSON shape of `products.specifications` | Store: flat object `verifiedAt, verifiedBy{userId,label}, material, purity, stone, stoneShape, widthMm, unit('individual'\|'pair')`, strict. v2: `verifiedAt, verifiedBy, unit(text), values{key: string\|number\|boolean}`, strict. A store row fails v2 validation until moved under `values` (read of both schemas) |
| JSON shape of `variants.attributes` | Store: `interiorMm, interiorMmSecond, sizeSystem, sizeLabel`. v2: `values{...}` only |
| `variants.identifiers`, `products.supplier_details` | Compatible in intent. `verifiedBy.userId` is nullable in v2 (superset); `identifiers` now requires `verifiedAt` in v2 as in store |
| `store_settings` JSON | Same `checkout.metodosPago`; integration `data` holds the removed provider's cloud name in the store vs bucket in v2 |
| Backups | Store backup manifests include the three `sales_*` tables; v2 restore (not run) is likely to reject unknown tables (inferred) |
| Settings carrying the shared workspace | One JSON blob up to 750 KB, 30 audit recovery points (docs). Contents are private commercial records |

Migrations: store applied journal up to 0024 in production per the owner manual (0025 not applied as of that manual);
tags `0023_previous_mockingbird`, `0024_silent_star_brand` differ from v2's tags. The template has an adoption
procedure (`template:adoptar-historial`, NEW-STORE.md "case 2") that matters only if the old database is reused; a new
repo with a new database avoids it. Catalogue size in production: not known (the manual says no confirmed assortment;
12 supplier candidates exist only as draft CSV and JSON; the 24 concept fixtures are seeded only in test databases by
the script's guard).

## 7. What would break template contracts if ported as is

1. **Colours.** `tests/unit/piel-sin-colores.test.ts` (v2) blocks hex and palette classes in template-owned storefront
   files. It only checks files still equal to the template skin, so rewritten files are exempt, but the store's CSS (hex
   throughout) would not follow theme changes (verified by grep; test logic read).
2. **Theme kit.** The store has no `tema`; v2 `tienda.ts` and `layout.tsx` (`data-tema`) assume it. Copying the store's
   `globals.css` over v2's drops the `@import "../themes/temas.css"` line and `custom.css`.
3. **`src/domain` and `src/lib` edits.** The store changed 17 domain files and 8 lib files. Copying them onto v2 reverts
   upstream fixes (v2 has newer `receipts.ts`, `payment-readiness.ts`, `store-settings*.ts`, `catalog-import-plan.ts`).
   `domain/cart.ts` imports `lib/concept-products` (a store rule inside domain). `domain/catalog-import-plan.ts` imports
   from `../../scripts/seed` (domain depending on a script). `queries.ts` hardwires the `concepto-` prefix into SQL.
4. **`process.env` reads.** The store's `domain/payment-policy.ts` reads `STORE_PAYMENT_METHODS` directly (the same is
   done in v2). The store's `domain/payment-readiness.ts` reads it again as a default argument. No new integration
   secrets are read outside `src/lib` (grep), but the removed provider's cloud-name variable remains in many places.
5. **Removed template i18n keys.** The store deleted 18 keys (`header.categorias`, `footer.*`, `home.*`, `panel.nav.resenasPendientes`,
   `setup.preflight`, `setup.seed` and others; v2 may have changed some since, not checked key by key). Components that still use them in v2 would render raw keys. Do not copy `es-PY.ts`; add keys.
6. **Testids.** Grep: all 100 keys of the baseline `src/lib/testids.ts` are still referenced by non-test source in the store,
   and `testids.ts` is byte-identical to the baseline. v2 adds three keys (`adminProductFeaturedPosition`,
   `adminProductSupplierUrl`, `adminSupplierOffers`) that the store lacks. The store adds 15 literal `data-testid` strings
   outside the contract (listed in appendix). No removed testid found.
7. **Brand rule.** `marca-centralizada` would pass on the store (name only in `tienda.ts`); the helper functions in
   `tienda.ts` (`nombrePublicoDeMarca`) bake the `.com.py` suffix and a hostname pattern into the config file.
8. **Hosting config.** `next build --webpack`, `frozenLockfile` and `verifyDepsBeforeRun: false` are Hostinger-era
   choices; v2 has `start-guard.mjs` and a different build path. Do not copy blindly.
9. **Migration numbers.** Store 0025 collides in number (not content) with v2 0025; store 0023/0024 collide in number
   with equal DDL under different names. A new database from v2 never needs the store's tags.
10. **Admin shell.** `admin/(panel)/layout.tsx` replaces the admin header with `AdminNavigation`; v2 has a sidebar. Copying
    drops v2's menu items for modules the store never had (suppliers, integrations).
11. **Data in docs.** Supplier names, quotes, a business phone and an owner guide containing operational details live in
    `docs/`; they must not be copied into the shared template repo.

## 8. Not determined, and why

- The local working tree of the store (archive drive unmounted): untracked or ignored files, `.env*`, `node_modules`, any
  local database dump, and whether uncommitted work exists.
- Production database content: no access by instruction. Number of products, whether `concepto-*` rows exist in production,
  which categories exist, whether photo ids point at the removed provider or are empty, and whether 0025 was applied since
  the manual's date.
- Whether the live site is deployed from `main`, and which environment variables are set in hosting.
- Rights and provenance of the 192 media files (docs say generated concept imagery; no licence verified).
- Whether the store's remaining v2-vs-store differences in `admin-products`/`admin-categories` actions and the 51
  changed `src/app` files carry any behaviour not noted here: I read the highlights, not every line (inferred).
- Exact feature parity of v2's comparison, gallery and filter UI with the store's versions: names and structure were
  compared, behaviour was not run. Nothing was built, run or tested.

## Appendix A: store-only `data-testid` literals (grep)

`catalogue-design-grid`, `checkout-enquiry-link`, `customer-comparison-print`, `customer-quote-print`, `enquiry-composer`,
`loading-card`, `product-enquiry-brief`, `product-enquiry-brief-link`, `resolved-card`, `ring-concept-notice`, `ring-finder`,
`ring-price-unit`, `sales-operations`, `seo-coverage-row`, `wishlist-enquiry`.

## Appendix B: v2.0.0 files the store lacks (203, no fable), by group

Theme kit `src/themes/**` (11); R2 images (`lib/r2*.ts`, `imagenes-r2.ts`, `imagen-bytes.ts`, `components/imagen-r2.tsx`,
`preflight-r2.ts`, `scripts/fotos-*`); supplier model (`supplier-offers.ts`, `proveedores.ts`, `supplier-margin.ts`,
`admin/supplier-offers-editor.tsx`); catalogue CSV/export/duplicates; `storefront-shell.tsx`, `home-loading.tsx`;
`config/{catalogue,editorial-tools,public-facts,receipt-review}.ts`; attribute filters, comparison picker, filter
disclosure; admin `sidebar.tsx`, `menu.ts`, `field-error.tsx`, `metadata-field.tsx`, `product-completeness.tsx`;
`scripts/{registrar-tienda,start,start-guard,temas-css,template-adoptar-historial,template-atraso}`, CI scripts;
`.github/renovate.json`; `tiendas.json`; 94 test files; 13 docs including `TEMPLATE-INHERITANCE.md`, `CATALOGO-CSV.md`;
migrations 0023..0025 (v2 numbering).
