# fable/plan-trafico.md — traffic first: finish the template, then four WhatsApp-first stores

**Written:** 2026-11-18 by a planning session (Fable 5.2, opened by Anton). **Build:** not started.
**Source:** Anton's answers on 2026-11-18 (§1), a read of the live sites on that day (§3.1),
`docs/log/o31.md`, `fable/plan-2026-11.md` §1 and §4, `fable/anillos/plan-anillos-tienda.md`,
`fable/muebles/plan-muebles-tienda.md`.
**Relation to the other plans:** `fable/plan-2026-11.md` stays in force for what it left open
(O27, the cutover checklist of O31). The anillos and muebles plans stay in force **as amended by
§6 of this file**; where they disagree with this file, this file wins.
**Stack (locked, `docs/decisions/0001-hosting.md`):** Next.js 16 on Hostinger Node.js + MySQL/MariaDB
(Drizzle). Cloudflare only for DNS (grey cloud), R2 and email.

| Phase | Repo | Model | Prompt file | Sections | Owns (areas) | Depends on |
|---|---|---|---|---|---|---|
| O32 | ecom | Opus 5.5 (`claude-opus-5-5`) | `fable/prompts/opus-32-modo-consulta.md` | §2.1, §5.1 | store mode setting, header/cart/checkout gates, preflight, `nueva-tienda`, three factory fixes from O31 | — |
| O33 | ecom | Opus 5.5 | `fable/prompts/opus-33-medir-consultas.md` | §2.2, §5.2 | two counter tables + migration, `/api/consulta`, `/admin/consultas`, funnel event, digest, backup | O32 |
| O34 | ecom | Opus 5.5 | `fable/prompts/opus-34-guias.md` | §2.3, §5.3 | `src/lib/guias.ts`, `src/app/guias/**`, guide markdown, sitemap, sync classification, `docs/GUIAS.md` | O33 |
| O35 | ecom | Opus 5.5 | `fable/prompts/opus-35-seo-busqueda.md` | §2.4, §5.4 | `src/lib/seo.ts`, availability, `/contacto`, image sitemap, `pnpm seo:auditar`, `pnpm categorias:aplicar` | O34 |
| O36 | ecom | Opus 5.5 | `fable/prompts/opus-36-release-v210.md` | §5.5 | harness proof, `CHANGELOG.md`, NEW-STORE.md "En una página", the tag request | O35 |
| T-PRO | productos.tienda | Opus 5.5 | `fable/prompts/tienda-productos.md` | §6.1, §6.5 | the store repo | tag v2.1.0 |
| T-ANI | anillos.tienda (new) | Opus 5.5 | `fable/prompts/tienda-anillos.md` | §6.2, §6.5 | the store repo | tag v2.1.0, §7 inputs |
| T-MUE | muebles.tienda (new) | Opus 5.5 | `fable/prompts/tienda-muebles.md` | §6.3, §6.5 | the store repo | tag v2.1.0, §7 inputs |
| T-LEN | lenceria.tienda (new) | Opus 5.5 | `fable/prompts/tienda-lenceria.md` | §6.4, §6.5 | the store repo | tag v2.1.0, §7 inputs |

O32–O36 are sequential: they edit the same storefront files. The four store sessions touch four
different repos and may run at the same time. Fable is not in this table and never will be: it
plans and manages in the window Anton opened, and builds nothing (§4.8).

---

## 1. Decisions already made (Anton, 2026-11-18) — do not reopen

1. **Goal: traffic first.** None of the four stores has stock. Every product is "consultar por
   WhatsApp". No store takes an order until Anton switches selling on, store by store.
2. **Card payment stays off.** `src/config/checkout.ts` lists `transferencia` and `contra_entrega`
   only, in every store. Pagopar code stays in the template, switched off.
3. **Template first.** O32–O36 are merged and tagged `v2.1.0` before any store session starts.
   The stores are born from that tag (or synced to it), so nothing is built twice.
4. **lenceria.com.py is rebuilt as a new repo** `antonmarklundcom/lenceria.tienda`, like anillos.
   This replaces "adopt the template's migration history" for lenceria
   (`docs/decisions-needed.md` item 2). mascota stays parked.
5. **Availability told to Google:** a product not sold from the store's own stock is published as
   back order. "In stock" only with the store's own stock, or a supplier stock confirmed in the last
   7 days (§2.4).
6. **Who runs what:** one Opus 5.5 session per template phase and one per store, started by the
   manager with `create_session`. The manager is the Fable 5.2 conversation Anton opened; it writes
   no code (§4.M).
7. **Guides are files in the store's repo**, not rows in the database (§2.3). They are written by
   sessions and reviewed in a PR; there is no editor in the panel.
8. **Nothing is invented.** No stock, delivery time, shipping fee, price, material, origin,
   certification, review, testimonial or search volume that Anton, a supplier or a cited source did
   not give. No generated product photos. A fact that is missing is left out or marked
   `[COMPLETAR]` and listed in the log.
9. Everything in `CLAUDE.md`, `AGENTS.md` and `fable/plan-2026-11.md` §1 (machinery vs skin, brand
   only via `marcaEfectiva()`, empty variable = feature off, migrations generated and committed,
   `data-testid` contract, merge commits, no tag pushed by a phase).
10. **No production change by any session:** no DNS, hPanel, Cloudflare, R2 or live database write.
    Each store session ends with a go-live checklist for Anton.

## 2. Object model — what the template gains

### 2.1 Store mode (O32)

- One setting, `modoVenta`: `"carrito"` (today's behaviour, the template default) or `"consulta"`.
  Default in `src/config/tienda.ts`; the owner can change it in `/admin/ajustes`. Same pattern as
  `cuentasClientes` (`src/lib/cuentas.ts`): one async function, `modoVentaEfectivo()` in a new
  `src/lib/modo-venta.ts`, is the only reader. Stored in the JSON of `store_settings`: no migration.
- In `"consulta"`: a product whose `sale_mode` is `stock` behaves as `enquiry` everywhere (card,
  product page, structured data). `showcase` stays `showcase`. The column is **not** rewritten, so
  switching selling on later is one switch, not a data change.
- In `"consulta"` the store cannot take an order: the checkout action and `create-order` refuse
  with a domain error (the server is the defence, not the hidden button); `/checkout` and
  `/pedido/buscar` answer 404; the header shows no cart and no "Seguí tu pedido". `/pedido/<n>`
  keeps working for an order that already exists.
- `pnpm preflight` in `"consulta"`: bank data, shipping zones and payment readiness are "no aplica";
  a missing public WhatsApp number is a **blocker** (without it every enquiry button disappears).
- A store in `"carrito"` behaves exactly as before this phase. That is the regression bar.

### 2.2 Enquiry and search counters (O33)

- Two tables of daily counts, no personal data:
  `enquiry_daily` (day, product, variant or null, origin, count) and
  `search_daily` (day, normalised term, had zero results, count). One migration.
- A click on a WhatsApp link adds one to a counter with `navigator.sendBeacon` to `POST
  /api/consulta`. The link stays a plain `https://wa.me/...` anchor: it works without JavaScript,
  and counting never delays or blocks the click.
- Not stored, ever: IP, user agent, cookie, session, the message text. A search term that looks
  like a phone number or contains `@` is not stored.
- `/admin/consultas`: products by enquiries (7, 30, 90 days), most searched terms, searches with no
  result, CSV export. The daily summary gets one line. Backups include both tables. Rows older than
  13 months are pruned by the existing maintenance job.
- With GA4 or the Meta pixel connected, the same click sends `generate_lead` / `Contact` through
  `src/lib/funnel.ts`. Without them, nothing is sent.

### 2.3 Guides (O34)

- A guide is one file `src/content/guias/<slug>.md`: front matter + body. Front matter keys:
  `titulo`, `descripcion`, `publicada`, `actualizada`, `categorias` (slugs), `productos` (slugs),
  `faq` (pregunta/respuesta pairs), `fuentes` (titulo/url pairs), `borrador`, `imagen` (optional).
- `src/content/**` belongs to the store: `template:sync` never overwrites or deletes it. The
  template ships no guide. With no published guide, `/guias` is 404, the footer has no link and the
  sitemap has no entry (empty = feature off).
- `/guias` (index) and `/guias/<slug>`: static pages, `Article` and `BreadcrumbList` structured
  data, canonical, in the sitemap with `actualizada` as last-modified date. A draft is 404 in
  production.
- Links both ways: a guide shows its categories and products; a category or product page shows the
  guides that name it. A slug that does not exist is skipped on the page and reported by the test.
- The body uses a guide renderer with headings, ordered lists, tables and block quotes, built on
  the same rule as `src/lib/markdown.ts` (escape everything first; no raw HTML; links `https://` or
  internal `/…` only). Product descriptions keep the small renderer.

### 2.4 Search appearance (O35)

- **Offer for enquiry products.** `productJsonLd` publishes an `Offer` when the price is shown and
  chargeable, also for `enquiry` (today it leaves the offer out, so Google shows no price).
  `showcase` and hidden prices: no offer, as today.
- **One function decides availability**, on the server, and both the page and the structured data
  use it: own available stock > 0 → in stock; `enquiry` (by column or by store mode) → back order,
  unless `proveedores` is on and the preferred supplier offer has stock > 0 with `checked_at` in the
  last 7 days → in stock; `stock` mode with nothing available → out of stock (unchanged). Only the
  resulting word leaves the server; no supplier data reaches the page. The visible line next to the
  price says the same thing as the structured data.
- The merchant feed (`/feed.xml`) is unchanged: only products a buyer can pay for on the page.
- `/contacto` becomes a template page (WhatsApp, e-mail and social links from the store settings),
  in the sitemap and the footer.
- The sitemap lists up to five public images per product.
- Default category description no longer says "Envíos a todo Paraguay" (a store with no shipping
  set up was promising it).
- **`pnpm categorias:aplicar`**: loads `src/content/categorias.json` (slug, name, parent, position,
  description, SEO title, SEO description) into the database. Dry run by default; fills empty
  fields only, unless `--pisar`. A new store's category tree and texts are then a reviewed file.
- **`pnpm seo:auditar`**: one table of what is missing per category, product and guide (texts, SEO
  fields, photos, duplicate titles, guides pointing at nothing, categories with no guide).
  `--json` for sessions, `--estricto` exits 1. Store sessions work until it is clean.

## 3. Scope

### 3.1 What the live sites looked like on 2026-11-18 (public pages only)

| Domain | Runs on | Found |
|---|---|---|
| productos.com.py | old Cloudflare Worker (`productos.new`); `productos.tienda` is built, not live | 262 products, all enquiry, price shown; `Product` data with no offer; category pages without intro text; no GA4 tag |
| lenceria.com.py | Hostinger, old template copy (`antonmarklundcom/lenceria`) | every category and product page ends in a server render error; product URLs answer 200 with the title "Producto no encontrado"; the home links to no product |
| anillos.com.py | Hostinger, old modified copy (`antonmarklundcom/anillos`) | works; 13 guide pages and long category texts; no product in the sitemap (by design); `/api/health` says `schema: false` |
| muebles.com.py | nothing answers | — |

### 3.2 In scope

- Template: §2.1–§2.4, the three factory fixes of O31 (§5.1 step 1), release `v2.1.0`.
- Four stores on `v2.1.0`, each in consulta mode with: its look, a keyword map, a category tree with
  texts, 10–15 guides, truthful policy pages, a clean `pnpm seo:auditar`, a go-live checklist.

### 3.3 Out of scope

Selling (stock, bank data, shipping zones), Pagopar, any go-live step, mascota, the Dropi review
queue, an article editor in the panel, paid ads, a multi-product enquiry list (§10).

## 4. Autonomy protocol

`fable/plan-2026-11.md` §4 applies (work to the exit criteria, one PR per phase merged with a merge
commit, minor issues to the phase log, stop only for a missing credential or a foundation decision,
re-runnable prompts, file ownership, phase log format, no production changes). These points replace
or add to it, because the sessions now run in the cloud:

1. **Where a session runs.** A cloud container started by the manager: Node and pnpm, no Docker,
   no `gh` CLI. GitHub goes through the GitHub tools of the session. The Windows paths, `gh`
   commands and the MySQL on port 3317 in older prompts do not apply.
2. **Gate.** Local: `apt-get update && apt-get install -y --no-install-recommends mariadb-server &&
   service mariadb start` (MariaDB 10.11; proven in a cloud session on 2026-11-18), a user with a
   password for TCP, databases whose names contain `test`. Then `pnpm install --frozen-lockfile &&
   pnpm db:generate` (no diff in `drizzle/`) `&& pnpm typecheck && pnpm lint && pnpm test && pnpm
   build` with `REQUIRE_DATABASE_TESTS=1`, and Playwright with the browser already in the container
   (never `playwright install`; `--trace off`). **And** GitHub: "CI" with its e2e job (label
   `ci-completo`, or a manual dispatch on the phase's own branch) and "Tests en MariaDB" green on
   the PR. MySQL 8 is only covered by CI, so CI green is required, not optional. Report numbers.
3. **CI minutes.** Open the PR when the local gate is green, not before. Push to an open PR in
   batches. In a private store repo, dispatch a workflow only on the session's own branch.
4. **Branch and PR.** The manager gives the branch name (`phase/<id>-<slug>`). One PR to `main`,
   body ≤ 25 lines, merged by the session with a merge commit when both gates are green. No
   force-push, no history rewrite, no `--no-verify`.
5. **Report.** Last step of every session: one message of ≤ 5 lines to the manager session named
   in the brief (PR number, merge commit, log path, what Anton has to do), then end. A session that
   must stop writes the question to `docs/decisions-needed.md`, commits, pushes, sends the same
   kind of message, and ends. It never waits for an answer.
6. **A phase never starts another session.** Only the manager does (§4.M).
7. **Subagents:** Sonnet 5.5 for normal work, Haiku 5.5 for mechanical fan-out, model always set
   explicitly. Same-shaped units (guides, category texts): one exemplar by the Opus session, then
   Sonnet subagents in parallel, each result read by Opus before it is committed.
8. **Model cost guardrail.** Fable / Mythos-class models are never used by a phase, a subagent, a
   spawned session, a watcher or a scheduled task. A session that believes it needs one writes why
   to `docs/decisions-needed.md` and ends.
9. **Polish cap.** One screenshot pass per phase (≤ 5 pages × 2 widths, as a CI artifact or under
   the scratch folder, never committed), one adversarial re-read of the merged diff, one follow-up
   commit. Ideas found after the exit criteria pass go to §10.

### 4.M The manager (the Fable conversation Anton opened)

- Starts a session only on Anton's word in chat. One word covers one session, unless Anton says
  the template phases may run back to back.
- `create_session` with `model: "claude-opus-5-5"`, the repo as `source_url`, the branch as
  `outcome_branch`, a permission mode that is not `plan`, and the prompt
  `Read fable/prompts/<file>.md in this repo and execute it.` followed by the brief: the manager's
  session id, and the inputs of §7 that Anton gave. For a store repo, which has no `fable/`:
  `Read fable/prompts/<file>.md of antonmarklundcom/ecom (origin/main) and execute it.`
- Does not watch a running session, does not message it, does not read its event stream. It reads
  committed state once when the session reports or when Anton asks: `docs/log/<id>.md` on `main`
  and the PR. To change what a later phase does, it edits that phase's prompt file.
- Writes no code and reviews no diff line by line. It checks the log against the exit list, tells
  Anton in a few lines what landed and what he has to do, and asks for the next go.
- The tag `v2.1.0` is pushed on Anton's go, by the manager or by Anton in the GitHub release page.
  Every store in `tiendas.json` is `pausada`, so the tag distributes to nobody.

## 5. Template phases (ecom)

### 5.1 O32 — store mode "consulta", and three factory fixes

1. Factory fixes every new store hits (`docs/log/o31.md` "Template proposals" 1, 2, 4):
   `TIENDA.marcaBuscable` (optional, default `nombre`) read by `tests/unit/marca-centralizada.test.ts`
   and the default-texts test of `tests/unit/store-settings.test.ts`; test ids for a header that
   keeps its categories in a dropdown or drawer, with an e2e helper that opens it, so a store does
   not need an always-visible category strip; `tests/unit/distribuir.test.ts` checks "every entry
   is `pausada`" instead of a fixed list of repos.
2. §2.1 in full. `pnpm nueva-tienda --modo consulta|carrito` writes the default.
3. In consulta mode the product page keeps one clear action: the WhatsApp button (sticky on
   mobile), with the product, variant, SKU and URL in the message, as `product-inquiries.ts` does
   today. A category with no product shows its text and the same button, not a dead end.
4. Not in this phase: counting clicks (O33), structured data (O35).

Exit: unit and integration tests for the mode function, the refused order, the 404s and preflight;
the whole existing suite and every e2e spec unchanged and green in `"carrito"`; a new e2e spec in
`"consulta"` (no cart in the header, product page offers WhatsApp only, `/checkout` is 404);
NEW-STORE.md and `docs/ENV-OPCIONAL.md` updated where they describe selling modes.

### 5.2 O33 — measure enquiries and searches

§2.2 in full. Counting rules: only a real click in a browser counts (crawlers do not run the
handler); the product must exist and be published; origin is one of a fixed list (product page,
card, floating button, guide, contact page); the route is rate-limited with `src/lib/rate-limit.ts`
and answers 204 whatever happens. Searches are counted once per request of the first results page,
never for a request that names itself a bot, with at most 500 new terms a day.

Exit: migration generated and committed, applies on MySQL 8 (CI) and MariaDB 10.11 (local);
integration tests for both counters, the caps, the pruning and the backup round trip; a unit test
that no column can hold an IP, user agent or message; `/admin/consultas` behind the same permission
as the dashboard; e2e: a click on the product page's WhatsApp button shows up in `/admin/consultas`.

### 5.3 O34 — guides

§2.3 in full, plus:
- `docs/GUIAS.md`: the file format, and the editorial rules a writing session follows (decision 8;
  written for a buyer in Paraguay, `es-PY`; every factual claim that is not common knowledge has a
  source in `fuentes`; one search intent per guide; links to at least one category).
- A content test that travels to the stores: every file parses; slug = file name; `titulo` ≤ 70
  characters; `descripcion` 110–160; valid dates; no duplicate title; external links `https://`;
  at least one category or product; no `[COMPLETAR]` in a published guide. Fixtures live under
  `tests/fixtures/`, not in `src/content/`.
- `scripts/template-shared.ts`: `src/content/` is the store's; `src/app/guias` is mixed (skin over
  machinery); `src/lib/guias.ts` is machinery. `pnpm nueva-tienda` keeps `src/content/`.
- The pages must work with `next start` on Hostinger: prove it with the production build in e2e,
  not only in dev.
- Home: a "Guías" block with the three newest, only when there are published guides, as a theme
  section a store can move or remove.

Exit: tests above; e2e with two fixture guides (index, page, link from a category, sitemap entry,
draft is 404); with zero guides `/guias` is 404 and no link exists; `Article` data has headline,
description, both dates, publisher and URL.

### 5.4 O35 — search appearance

§2.4 in full. Also `docs/SEO.md`: what the template publishes on each page type, what a store has
to write itself, how to read `pnpm seo:auditar`, and the go-live steps that are Anton's (Search
Console domain property by DNS, sitemap submitted, GA4 id in `/admin/integraciones`).

Exit: unit tests for the availability function (every row of §2.4) and for `productJsonLd` with an
enquiry product (offer present with price and back order; absent with hidden price; absent for
showcase); a test that the visible availability line and the structured data come from the same
function; the feed test still excludes enquiry products; `categorias:aplicar` dry run, apply,
second run unchanged, `--pisar`; `seo:auditar` against the demo data prints findings and
`--estricto` exits 1; `/contacto` in sitemap and footer, `tests/unit/seo.test.ts` updated.

### 5.5 O36 — proof and release v2.1.0

1. With `fable/harness-tiendas/` on the local MariaDB: a new store "Este" from `main` with
   `--modo consulta`, demo data, two fixture guides and a `categorias.json`: no cart, order
   refused, a click counted, guide in the sitemap, back order in the product data, `seo:auditar`
   runs. And the existing store "Norte" (cart mode, baseline `v2.0.1`) synced to `main`: the sync
   completes, the new migration applies, the cart and checkout e2e pass unchanged.
2. `CHANGELOG.md` "Sin publicar" becomes `v2.1.0`, marked "Migración: sí" with the migration's
   number. NEW-STORE.md "En una página" gains the consulta path (mode, guides, categories file,
   audit).
3. Do not push the tag. Write the exact tag command, and what it triggers, into the phase log and
   `docs/decisions-needed.md` for the manager.

Exit: both harness runs recorded with numbers in `docs/log/o36.md`; full gate green on `main`
after the merge.

## 6. Store sessions

One Opus 5.5 session per store. Inside the session the work is still split into steps, each with
its own PR and a line in the store's `docs/log/`, so a session that dies resumes from the first
step whose log is missing. §6.5 is the same for all four.

### 6.1 T-PRO — productos.tienda (exists, baseline `ec59045`)

1. `pnpm template:sync` to `v2.1.0` on a branch. The store's own `/contacto` page stays (skin).
   `modoVenta: "consulta"`. Remove the always-visible category strip added only for the e2e
   contract, using the new header test ids.
2. §6.5 for its nine categories and 262 products. Product texts are not rewritten in bulk: the
   audit lists the weakest, and the session improves at most the 40 it ranks first.
3. Update the cutover checklist (`docs/log/o31.md` in ecom is the source): with everything on
   enquiry, steps about bank data, shipping zones, stock and the test order by transfer no longer
   apply; add the Search Console, sitemap and GA4 steps.
4. A list of the product slugs that carry a supplier code (`…-dropi-<n>`), with the clean slug
   each would get. Do not rename: §8 Q1.

### 6.2 T-ANI — anillos.tienda (new)

`fable/anillos/plan-anillos-tienda.md` and its five prompts AN1–AN5, in order, in this one session,
with these changes:
- The store is created from `v2.1.0` and runs in consulta mode. The old store's "concept product"
  mechanism is not ported: enquiry mode with or without price replaces it.
- AN2 does not build guide pages: `/guias` is the template's. AN2 **moves** the twelve guides and
  the category texts of the old repo into `src/content/guias/*.md`, `src/content/categorias.json`
  and `src/config/catalogue.ts`, keeping their URLs (`/guias/<same-slug>`), and checks each claim
  against decision 8. `/guias/talles` with its measuring tool stays a store page (AN3) and must not
  collide with the template route.
- The decisions of that plan's §3 that are still open are asked by the manager before the session
  starts and passed in the brief.

### 6.3 T-MUE — muebles.tienda (new)

`fable/muebles/plan-muebles-tienda.md` and its prompts MU1–MU5, in order, in this one session, with
these changes:
- Created from `v2.1.0`, consulta mode, `proveedores: true`.
- MU2's mockup still needs Anton's yes before MU3. The session publishes the mockup, reports to
  the manager, and ends its turn; Anton answers **in that session**, which then continues.
- MU4 also does §6.5. With an empty catalogue, the category pages and guides carry the store at
  launch; products arrive when Anton has a supplier (§7 input 5).

### 6.4 T-LEN — lenceria.tienda (new)

No earlier plan exists; this section is it.
1. **Base.** Repo created by Anton from the template at `v2.1.0` (§7 input 2). `pnpm nueva-tienda`
   with name, tagline and WhatsApp from the brief; `--modo consulta`; payments as decision 2;
   `cuentasClientes: false`; `marcaBuscable: "lenceria.com.py"`.
2. **Look.** Keep the live site's look: read `antonmarklundcom/lenceria` (read-only, never pushed
   to) for its fonts, palette, header, footer and home, and rebuild them as a theme on the
   template's kit (`src/themes/`, `custom.css`). Every `data-testid` stays.
3. **Not carried over** unless the brief says they are real: the ten products, the claims "hecho a
   mano", "bordada a mano en Itauguá", "envío gratis desde ₲ 500.000" and "envíos a todo el país".
   No orders or customers move.
4. **Catalogue.** The seven category names of the live site are the starting tree. Products come
   only from a source Anton gives (§7 input 5). With none, the store launches with categories and
   guides.
5. §6.5, then the launch kit: `docs/CUTOVER.md` (new Hostinger app and database, the five
   variables, cron, R2 bucket and block rule, DNS, Search Console, GA4, and how to retire the old
   app), and one `tiendas.json` entry in ecom (`pausada`).

### 6.5 Content and SEO work, the same in every store

1. **Keyword map** `docs/seo/mapa.md`: one row per search a buyer in Paraguay would type → the one
   page that answers it (home, a category, a guide, a product) → status. No volumes unless a tool
   Anton connected gave them. One page per search; two pages never target the same one.
2. **Home and category titles** from the map: the search words first, the brand last.
3. **Categories** in `src/content/categorias.json`: description of 120–250 words that helps a buyer
   choose, SEO title ≤ 60 characters, SEO description 110–160. Longer sections and FAQ in
   `src/config/catalogue.ts`.
4. **Guides:** 10–15 in `src/content/guias/`, 800–1,500 words each, one row of the map each,
   following `docs/GUIAS.md`. One exemplar first, then Sonnet subagents; Opus reads every guide.
5. **Policy and contact pages** true for a store that sells by conversation: no fee, zone or
   delivery time that Anton did not give.
6. **Exit:** `pnpm seo:auditar --estricto` clean on the store's data; the content test green; the
   full gate; a `docs/log/` entry listing every `[COMPLETAR]`.

## 7. Human inputs (Anton)

| # | Input | Needed by | If missing |
|---|---|---|---|
| 1 | Go for each session, in chat (or "template back to back") | every session | not started |
| 2 | Three private repos created from the template after the tag: ecom → "Use this template" → `anillos.tienda`, `muebles.tienda`, `lenceria.tienda`; the Claude GitHub App allowed on them and on `productos.tienda` | T-ANI, T-MUE, T-LEN | that store waits |
| 3 | Go for the tag `v2.1.0` | after O36 | stores wait |
| 4 | Per store: name as buyers see it, tagline, public WhatsApp number | each store's first step | domain as name; `[COMPLETAR]` |
| 5 | Per store: where products come from (a supplier list or sheet with photos Anton may use) | catalogue step | the store launches with categories and guides only |
| 6 | lenceria: are the ten live products, or any order, real? | T-LEN | treated as demo data, not moved |
| 7 | anillos: the open decisions of `fable/anillos/plan-anillos-tienda.md` §3 and inputs §4 | T-ANI | that plan's fallbacks |
| 8 | muebles: yes or changes on the mockup | T-MUE, before the skin | the session waits |
| 9 | Optional: a keyword tool or Search Console connected | §6.5 step 1 | the map has no volumes |
| 10 | Go-live, per store: Hostinger app and database, R2, DNS, Search Console, GA4 | after each store session | the store is ready, not live |
| 11 | O27's inputs (`fable/plan-2026-11.md` §7 items 2–3) | before the first cutover | first cutover waits, as decided 2026-11-11 |

## 8. Open questions

1. **productos.com.py slugs with a supplier code** (`adaptador-para-grifo-360-dropi-11896`).
   Recommendation: rename to the clean slug at the cutover; the template answers the old URL with
   a 301 (`product_slug_redirects`). T-PRO only prepares the list.
2. **The broken lenceria.com.py until the new store is live.** Recommendation: leave it; fixing
   the old copy is work thrown away. If the wait will be long, a holding page is a hPanel change
   for Anton, not a session's.
3. **One WhatsApp number for several stores** (anillos and lenceria share one today). Works: the
   message names the product and the URL. A question only if Anton wants separate numbers.

## 9. Build log index

| Phase | PR | Log |
|---|---|---|
| plan | this PR | — |
| O32 | #PR | `docs/log/o32.md` |

## 10. Backlog (not planned)

- Enquiry list: the cart as a multi-product WhatsApp message in consulta mode.
- `seo:auditar` as a card in `/admin`.
- Guide editor in the panel.
- Search Console data inside the panel.
- Landing pages per attribute ("anillos de plata 925") generated from facets.
- From `fable/plan-2026-11.md` §10, unchanged: Dropi review queue, one cron entry per store, private
  bucket for backups.
