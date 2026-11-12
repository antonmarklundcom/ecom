# fable/anillos/plan-anillos-tienda.md — anillos.com.py rebuilt on the template

**Written:** 2026-11-11 by the manager session of `fable/plan-2026-11.md`. **Build:** not started;
Anton starts it with `fable/anillos/KICKOFF.md` in a Fable 5.2 window he opens himself.
**Source:** `fable/anillos/INVENTORY-2026-11-11.md` (read-only inventory of the old store against
template `v2.0.0`), `C:\operation manuals\anillos\README.md` (owner manual, 8 October 2026), and
Anton's answers on 2026-11-11.
**Stack (locked, `docs/decisions/0001-hosting.md`):** Next.js 16 on Hostinger Node.js + MySQL/MariaDB
(Drizzle). Cloudflare only for DNS, R2 and email.

| Phase | Repo | Model | Prompt file | Owns | Depends on |
|---|---|---|---|---|---|
| AN1 | anillos.tienda | Opus 5.5 | `fable/anillos/prompts/an1-repo-and-skin.md` | the new repo; `src/config/tienda.ts`, `src/config/checkout.ts`, `src/themes/custom.css`, header, footer, home, product card, category pages, `public/` media, i18n keys it adds, policy copy | §3 D1, D4, D8 answered |
| AN2 | anillos.tienda | Sonnet 5.5 (safe) | `fable/anillos/prompts/an2-content.md` | `src/content/**`, `src/app/guias/**` except `talles`, `src/config/catalogue.ts`, `src/config/editorial-tools.ts`, their tests | AN1 |
| AN3 | anillos.tienda | Opus 5.5 | `fable/anillos/prompts/an3-ring-features.md` | enquiry components, `/elegir`, `/guias/talles`, ring search words, facet keys for ring attributes, their tests | AN1; §3 D4 |
| AN4 | anillos.tienda | Opus 5.5 | `fable/anillos/prompts/an4-data-move.md` | `scripts/importar-desde-anillos-viejo.ts` (new, store repo) and its tests; nothing under `src/` | AN1; §4 inputs 1–3 (runs on fixtures without them) |
| AN5 | anillos.tienda + ecom | Sonnet 5.5 (safe) | `fable/anillos/prompts/an5-launch-kit.md` | store: `docs/log/**`, `docs/CUTOVER.md`; ecom: one `tiendas.json` entry; `C:\operation manuals\anillos\README.md` | AN2, AN3, AN4 |

AN2 and AN3 touch disjoint files and run in parallel after AN1. Everything else is sequential. Fable is
not in this table and never will be: it only manages, in a window Anton opened.

---

## 1. Decisions already made — do not reopen

1. **A new repo, not an edit of the old one**: `antonmarklundcom/anillos.tienda`, created from the
   template. The old store generated migrations under numbers the template also uses (`0023`, `0024`
   with equal DDL and other names; `0025` with unrelated content), changed 17 files in `src/domain` and
   8 in `src/lib`, and still depends on the removed image provider in about 60 source files. A fresh
   repo with a fresh database avoids all three.
2. **The old repo is a read-only reference.** `antonmarklundcom/anillos` keeps serving the live site
   until the cutover. No phase pushes to it, opens a PR in it, or touches its database or hosting.
3. **No orders and no customers move** (Anton, 2026-11-11: the store has no real orders). The new
   store gets a new database with exactly the template's schema and history.
4. **The current live design is kept**: olive and cream palette, small radius, serif headings, the
   home hero, the collection pages.
5. **Machinery is never edited in the store** (`CLAUDE.md`): nothing under `src/domain/**`,
   `src/lib/**`, `src/app/actions/**`, `src/db/**`, `drizzle/**`, checkout, auth or cron routes. A
   feature that needs a hook the template lacks becomes an *upstream request* (§6), never a patch.
6. **No store-made migration in this plan.** The new database is the template's schema and nothing
   else, so `template:sync` and distribution work from day one. This is why the shared sales
   workspace (its own tables) is not in the first build (§3 D3).
7. **Nothing is created before the build starts**: no repo, no Hostinger app, no bucket. Nothing in
   this plan changes DNS, Hostinger, Cloudflare or a live database; the last phase hands Anton a
   cutover checklist.

## 2. What the old store is (from the inventory)

- 1,059 tracked files against the template's 925 at `v2.0.0`: 417 only in the store (192 of them
  media), 258 common files that differ, 84 store-only test files.
- It is a **demand test**: 24 "concept" products with the price hidden, not purchasable, `noindex`
  and out of the sitemap; buyers enquire over WhatsApp; payment methods are paused.
- Store-only public pages: `/elegir` (ring finder), `/guias/**` (twelve guides, including
  `/guias/talles` with a printable measuring sheet), collection pages, `/campanas/**`.
- Store-only admin: `/admin/ventas` (shared sales workspace, about 5,800 lines, tables
  `sales_workspace`, `sales_workspace_audit`, `sales_search_gaps` from store migration `0025`, which
  the owner manual says was **not** applied in production as of 8 October) and
  `/admin/herramientas-ventas` (browser-local tools the workspace replaced).
- Much of what the store built by hand is now **in the template** under generic names: slug
  redirects, SEO overrides, specifications and variant attributes, facets, comparison, image
  provenance, keyword coverage, selling mode (`sale_mode`: `stock` | `enquiry` | `showcase`) and
  `show_price`.
- Two data shapes differ and need a transform: `products.specifications` and `variants.attributes`
  are flat ring fields in the store and `{ unit, values{…} }` / `{ values{…} }` in the template.
  Photo references point at the removed image provider; the template expects `r2:p1/…`.
- Not known (nobody looked at production): how many real products exist, whether concept rows exist
  in production, whether `0025` was applied since, where the live site deploys from.

## 3. Decisions for Anton before the build (the manager asks these first, one at a time)

| # | Question | Recommended answer |
|---|---|---|
| D1 | Repo visibility | **Private.** It can be made public later with one click; the reverse leaks nothing but cannot un-publish what was seen. Costs about 18 Actions minutes per template release. |
| D2 | What is in the production database today: real products (how many), concept products, any saved record in `/admin/ventas`; was migration `0025` ever applied? | Anton looks in the admin and answers. It sets the size of AN4 and decides D3. |
| D3 | The shared sales workspace `/admin/ventas`, campaigns and the search-gap counter | **Not in the first build.** It needs its own tables (a store migration, §1.6) and is a third of the store's own code. If it holds real records, export them with its own export button and keep the file privately. Revisit after launch as a template module (§6 T3). `/admin/herramientas-ventas`: drop. |
| D4 | Selling mode at launch | **Same demand test as today**: products in the template's `enquiry` mode with `show_price = false`, payment methods empty, WhatsApp enquiry flow. Switching to real checkout later is a settings change plus `pnpm preflight`. |
| D5 | Small generic features the store has and the template lacks: image focal point, catalogue-outage fallback, cost-floor warnings, quick view | **Do not port into the store.** Focal point is worth having in every store: template backlog (§6 T2). Outage fallback and cost-floor warnings: drop. Quick view: only if AN1 can do it as pure skin. |
| D6 | Photos: an R2 bucket, public image domain and API token for this store (NEW-STORE.md §4a-ter and "Migrar las fotos a R2") | **Yes, before AN4.** Without them AN4 proves the photo move as a dry run only. |
| D7 | Hosting: which Hostinger plan has a free Node.js app and database for the new store | From O27's numbers, or a slot Anton names. Needed only at cutover. |
| D8 | Template version to build from | **Latest `main`, which must carry the latest tag and be green on both workflows** (CI and "Tests en MariaDB"). "Use this template" copies `main`, not a tag. |
| D9 | Distribution | When the new store is live: register `anillos.tienda` in `tiendas.json` as **ring 0, the first real canary** (it has the template's history, unlike lenceria and mascota), and remove the paused entry of the old `anillos` repo. |

## 4. Inputs from Anton

| # | Input | First needed by |
|---|---|---|
| 1 | Answers D1–D5 and D8 | before AN1 |
| 2 | A catalogue export from the old admin (products CSV or XLSX) and, if he can, a `pnpm backup` file of the old store, both made by him; the sessions never connect to production | AN4 (it runs on fixtures without them) |
| 3 | R2 bucket, public domain and token (D6), entered by him in the new store's `/admin/integraciones` or `.env.local` | AN4 photo step |
| 4 | The five to seven pages that must look the same (default: home, one collection, one product, `/elegir`, `/guias/talles`, cart, the paused-checkout page) | AN1 exit |
| 5 | Hostinger slot (D7), domain switch window, go for the cutover | after AN5 |

## 5. Rules for every phase

`fable/plan-2026-11.md` §4 (autonomy protocol) applies, with these changes for a store:

1. **Where.** The store lives at `C:\Projects\anillos.tienda`; worktrees go next to it. Never build,
   install or test on E:. The old store is read from a reference clone at `C:\dev\.cache\anillos-old`
   (`git clone https://github.com/antonmarklundcom/anillos`, read-only; `C:\Projects\anillos` is a
   junction to an archive drive that may be unplugged).
2. **Never copy from the old store**: anything under `src/domain`, `src/lib`, `src/app/actions`,
   `src/db`, `drizzle`; `src/i18n/es-PY.ts` as a file (add keys instead: the old store deleted 18
   template keys); `globals.css` as a file (it drops the theme imports); `package.json` scripts or
   build flags (`next build --webpack` and friends); the admin layout; `docs/` with supplier names,
   quotes or contact details. Re-create behaviour on the template's mechanisms.
3. **Skin contract.** Colours are theme tokens (`src/themes/`, `custom.css`), not hex literals. Every
   `data-testid` of `src/lib/testids.ts` stays. The brand comes from `src/config/tienda.ts` only.
4. **Gate for a store** (the store's own repo): `pnpm install --frozen-lockfile && pnpm typecheck &&
   pnpm lint && pnpm test && pnpm build` with `REQUIRE_DATABASE_TESTS=1` and a `TEST_DATABASE_URL`
   whose database name contains `test`, then Playwright. Local MySQL 8.4.11 is at
   `C:\dev\tools\mysql` (start command: `fable/REVIEW-2026-11-10.md` § "How this was tested"; port
   3317). Database names start `anillos_test_an<N>_`; `E2E_PORT` 3311–3315, one per phase. One
   session uses MySQL at a time: a phase waits for the previous phase's `DONE.md`.
5. **Both engines.** Hostinger databases are MariaDB. A phase is not done until the store's GitHub
   checks are green, including "Tests en MariaDB". (On 2026-11-11 the template was tagged after only
   the MySQL workflow had run; the MariaDB one was red. Do not repeat that.)
6. **Git.** Any test or script that runs git in a temp folder clears every `GIT_*` variable first
   (`scripts/ci/entorno-sin-git.mjs`). Never `--no-verify`, never force-push, never rewrite history.
7. **One PR per phase** in the store repo, branch `phase/an<N>-<slug>`, merge commit, merged by the
   session when the gate and the checks are green. Phase log `docs/log/an<N>.md` in the store.
8. **Sessions.** At most 3 build sessions at once. Each is started with the model set explicitly and
   the manager checks the model after the start. Nobody answers permission prompts unless Anton is
   there; a blocked session writes its state to its `DONE.md` / `FAILED.md` folder
   (`C:\dev\anillos-wt\an<N>-carryover\`) and ends. No session starts another phase.
9. **No production, no spending.** No Hostinger, DNS, Cloudflare dashboard or live database; no push
   to the old repo; no paid service; no image generation.
10. **Never invent facts**: prices, materials, sizes, delivery terms, legal or business identity.
    What is not in the old store or in Anton's export is written `[COMPLETAR]` and listed for Anton.

## 6. Phases

### AN1 — the repo and the skin (Opus 5.5)

1. In an ecom checkout at latest `main` (D8): `pnpm nueva-tienda --crear-repo
   antonmarklundcom/anillos.tienda --en C:\Projects` (private unless D1 says otherwise); run the
   wizard with the old store's identity from its `src/config/tienda.ts`.
2. Theme: pick the closest preset (the inventory suggests `calido` or `vitrina`) and express the rest
   as tokens in `src/themes/custom.css`: palette, radius 0.25rem, serif headings. No hex outside
   `src/themes`.
3. Header, footer, home (the hero included), product card, collection and category pages, collection
   navigation, policy pages and WhatsApp copy. Media: copy only files the new code references; the
   inventory found 174 frame images and two videos with no reference in the old source.
4. `src/config/checkout.ts`: payment methods per D4.
5. Exit: store gate green; the template's Playwright specs still pass unchanged; a side-by-side set of
   screenshots (live site, read-only GET of public pages, against the new store locally) for the
   pages of §4 input 4, saved in the store under `docs/log/an1-shots/`; differences listed, not hidden.

### AN2 — content (Sonnet 5.5, parallel with AN3)

The twelve guides except `talles`, the ten category texts, FAQs, the keyword list, on the template's
mechanisms (`src/config/catalogue.ts` editorial slots, `EDITORIAL_TOOLS`, the keyword coverage panel).
About 3,900 lines of Spanish content move as content, not as components. The store's
`keyword-coverage` test is ported. No machinery, no invented facts.

### AN3 — ring features (Opus 5.5, parallel with AN2)

1. Enquiry over WhatsApp on the template's `enquiry` mode: composer, per-product brief, favourites
   enquiry, enquiry-mode cart, the paused-checkout page.
2. Concept behaviour: first **verify** what the template does for an `enquiry` product with
   `show_price = false` (cart, sitemap, feed, `robots`). What it already does is used as is. What it
   lacks (the old store had `noindex`, out of the sitemap and feed) is an upstream request (T1).
3. `/elegir` (ring finder) and `/guias/talles` with the printable sheet, as store pages.
4. Ring search words (argolla, alianza, typos) and facet keys for ring attributes, as configuration
   if the template has the slot; otherwise an upstream request (T1), not a patch of `queries.ts`.
5. Exit: the old store's tests for these features, ported and green; store gate and checks green.

### AN4 — data move (Opus 5.5)

1. `scripts/importar-desde-anillos-viejo.ts` in the store: reads Anton's export, moves the flat ring
   fields under `values` (`material`, `purity`, `stone`, `stoneShape`, `widthMm`, `unit`;
   `interiorMm`, `interiorMmSecond`, `sizeSystem`, `sizeLabel`), keeps slugs byte for byte, writes
   the template's canonical import sheet. Dry run by default, idempotent, counts per table.
2. Import through the template's own batch import, on local MySQL; then the same on MariaDB through
   the store's check.
3. Photos to R2 with the template's tooling (`fotos:*`, NEW-STORE.md "Migrar las fotos a R2"): dry
   run always; real run only with input 3 and only into this store's bucket.
4. Without Anton's export: build and prove against a fixture made from the old repo's own seed data,
   and say so in the log. Exit: counts match the export; every slug of the live sitemap resolves.

### AN5 — launch kit (Sonnet 5.5)

`docs/CUTOVER.md` in the store: freeze edits in the old admin, final export, import, Hostinger app and
database from `HOSTINGER-CHECKLIST.md`, five env variables, `/api/setup/init`, three cron entries,
smoke test on the temporary URL, `pnpm preflight`, switch the domain, rollback (switch it back; valid
until the first real order), archive the old repo after 14 quiet days. In ecom: the PR that registers
`anillos.tienda` in `tiendas.json` (D9), left for Anton to merge. Update the owner manual.
**Stops before any Hostinger, DNS or data change.**

### Template phases this plan may ask for (in ecom, each its own small PR and release)

- **T1** (only if AN3 finds the gap): enquiry-only products can be `noindex` and left out of the
  sitemap and feed by a flag; a synonyms slot for search. Generic, off by default.
- **T2** (backlog): image focal point (`product_images.focal_point_x/y`), a template migration.
- **T3** (after launch, Anton's call): the sales workspace as an optional template module.
A template change reaches the store by `template:sync`: a good first exercise for distribution.

## 7. Done means

All five phase PRs merged in `antonmarklundcom/anillos.tienda` with the gate and both GitHub checks
green; the screenshot set and the import counts in the logs; `docs/CUTOVER.md` written; the
`tiendas.json` PR open in ecom; the owner manual updated; a list of what was left behind (D3, D5) and
of every `[COMPLETAR]`. The site itself goes live only when Anton runs the cutover.

## 8. Risks

- **The design does not fit the theme kit cleanly.** The old CSS has 56 hard-coded colours in three
  stylesheets. AN1 may need many tokens in `custom.css`; that is allowed. Rewriting template skin
  files is allowed too, but each rewritten file stops receiving template updates.
- **Unknown production data** (D2). If real products exist with photos on the removed image provider,
  AN4 depends on that provider's files still being downloadable.
- **Scope creep from the sales workspace.** It is the one item that would add a store migration.
  Keep it out of the first build (§1.6).
- **Private repo minutes.** Every push runs CI and MariaDB tests; draft PRs and few pushes.

## 9. Build log index

| Phase | PR | Log |
|---|---|---|
| (none yet) | | |
