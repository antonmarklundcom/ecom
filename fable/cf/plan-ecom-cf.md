# plan-ecom-cf.md — the shop, built for Cloudflare

**Written:** 2026-11-18 by a planning session (Fable 5.2, opened by Anton), in
`antonmarklundcom/ecom` under `fable/cf/`. **Build:** not started. The build happens in a new repo,
`antonmarklundcom/ecom-cf`; its first phase copies this plan and the prompts into it, and from then
on the copy in `ecom-cf` is the one that counts.
**Source:** Anton, 2026-11-18 ("make it perfect for Cloudflare; my 5 USD plan plus usage and nothing
new to buy; Opus sessions build over night under a Fable manager; I come back with feedback");
Cloudflare's documentation as read on 2026-11-18 (§2.9); `antonmarklundcom/ecom` at `aa5282f`
(the Hostinger shop: the reference for behaviour, screens, texts and tests);
`fable/REVIEW-2026-11-10.md` § "productos.new" (a catalogue-only version of this shop has run on
Workers since 2026-10-10).
**Relation to ecom:** `docs/decisions/0001-hosting.md` stays true for `ecom` (one runtime, Hostinger
+ MySQL). `ecom-cf` is the "new decision" that record says another runtime needs, in its own repo.
Nothing from `ecom-cf` is merged back into `ecom`.

| Phase | Model | Prompt | Sections | Owns | Depends on |
|---|---|---|---|---|---|
| C0 | Opus 5.5 (`claude-opus-5-5`) | `prompts/c0-cimientos.md` | §2, §5.0 | the repo skeleton, the Worker entry, the store object, one page end to end, `docs/decisions/**` | — |
| C1 | Opus 5.5 | `prompts/c1-contrato-de-datos.md` | §2.3–§2.5, §5.1 | `src/tienda/esquema/**`, migrations, the registry schema, RPC conventions, test helpers, backup format | C0 |
| C2 | Opus 5.5 | `prompts/c2-vidriera.md` | §5.2 | `src/tienda/catalogo/lectura/**`, `src/app/(vidriera)/**`, `src/componentes/vidriera/**`, `src/temas/**` | C1 |
| C3 | Opus 5.5 | `prompts/c3-panel.md` | §5.3 | `src/tienda/acceso/**`, `src/tienda/catalogo/escritura/**`, `src/tienda/ajustes/**`, `src/app/admin/**`, `src/componentes/panel/**` | C1 |
| C4 | Opus 5.5 | `prompts/c4-seo-y-guias.md` | §5.4 | `src/seo/**`, `src/tienda/contenido/**`, `src/app/(seo)/**`, `herramientas/contenido/**` | C1 |
| C5 | Opus 5.5 | `prompts/c5-consultas-y-salida.md` | §5.5 | `src/tienda/consultas/**`, `src/tienda/salida/**`, `src/tienda/integraciones/**`, `src/cola/**`, `src/app/api/consulta/**` | C1 |
| C6 | Opus 5.5 | `prompts/c6-flota.md` | §5.6 | `src/flota/**`, `src/app/(flota)/**`, `src/cron/**`, `herramientas/flota/**` | C3 |
| C7 | Opus 5.5 | `prompts/c7-importar.md` | §5.7 | `src/tienda/importar/**`, `herramientas/importar/**`, the import screens under `src/app/admin/importar/**` | C3 |
| C8 | Opus 5.5 | `prompts/c8-pase-de-enlace.md` | §5.8 | every cross-cutting edit, the two-store end-to-end suite, the docs for Anton | C2–C7 |
| V1… | Opus 5.5 | written by the manager after C8 | §5.9 | orders, stock, payments, checkout | C8 |

Lane 1: C0 then C1, one at a time. Lane 2: C2, C3, C4, C5 side by side as soon as C1 is merged;
C6 and C7 as soon as C3 is merged. C8 alone, after all of lane 2. Fable is in this table nowhere:
it manages (§4.M) and builds only what an Opus session failed at twice (§4.8).

---

## 1. Decisions already made — do not reopen

1. **Cloudflare only, on what Anton already pays:** the Workers Paid plan and its usage. No other
   paid product is added: no Workers for Platforms, no Cloudflare for SaaS, no Images subscription,
   no VPS, no external database. A feature that would need one is redesigned or left out.
2. **One Worker serves every store.** A store is a domain, a row in the registry and its own
   database. Adding a store needs no deploy and no code.
3. **A database per store: one Durable Object with SQLite storage per store** (§2.3). No shared
   table carries a store column for store data.
4. **First the shop that brings conversations, then the shop that takes money.** Version 1 is
   catalogue, guides, search appearance, WhatsApp enquiries, the store panel and the fleet panel.
   Orders, stock reservation, payments and checkout are version 2 (§5.9). The full data contract,
   version 2 tables included, is written in C1 so version 2 changes no existing table.
5. **`ecom` is the specification of behaviour.** Where this plan is silent, the shop does what
   `ecom` does: same URLs (`/producto/<slug>`, `/categoria/<slug>`, `/guias/<slug>`, `/admin`),
   same texts (`src/i18n/es-PY.ts`), same `data-testid` values, same rules. Screens and pure
   logic are ported from it, with the file they came from named in the commit. What is not ported:
   anything that talks to MySQL, to the Node process, or to Hostinger.
6. **Language and money:** storefront and panel in `es-PY`; identifiers and comments may follow
   `ecom`; every user-facing string goes through the i18n layer. Money is whole guaraníes in
   integers. Times are stored in UTC and shown in Paraguay's time.
7. **Nothing invented** (as `ecom`'s `fable/plan-trafico.md` §1 decision 8): no stock, delivery
   time, price, material, origin, review or search volume that Anton or a supplier did not give. No
   generated product photos. Demo data is marked as demo and never reaches a real store.
8. **No session deploys.** Nothing is created or changed in Anton's Cloudflare account, DNS or any
   live site by this plan. Everything is built and tested on the local Workers runtime. Going to
   staging and live is §7 and needs Anton.
9. **Models:** Opus 5.5 builds. Sonnet 5.5 or Haiku 5.5 for subagents, set explicitly. Fable only
   as §4.8 says.

## 2. Architecture

### 2.1 Shape

```
request ─► Worker "ecom-cf" (one deploy, every domain)
            1. host → store        registry (D1 "flota"), cached in memory for seconds
            2. cached page?        Cache API, key = host + path + the store's content version
            3. render              Next.js app; store context held for the whole request
            4. data                RPC to that store's Durable Object (SQLite inside)
          side doors:  /admin (store panel)   fleet host (fleet panel)   /api/*
          bindings:    TIENDA (Durable Object namespace)   FLOTA (D1)   MEDIOS, PRIVADO (R2)
                       SALIDA (Queue)   LIMITE (rate limiting)   one Cron Trigger
```

### 2.2 The Worker and the framework

- Next.js 16 App Router, because the storefront, the panel, the themes and the i18n of `ecom` are
  written for it and are ported, not rewritten.
- Two ways to run it on Workers exist: the OpenNext adapter (says it supports every Next 16 minor;
  Node-runtime `proxy.ts` is "experimental") and Cloudflare's vinext (Cloudflare's default
  recommendation, "in beta"; productos.new uses it). **C0 decides by building the same thin slice
  on both, at most two hours on the second one, and writes the record.** Default if both pass:
  OpenNext, the more mature one by vinext's own README.
- The store is chosen in the Worker's entry, from the `Host` header, before the framework runs,
  and held in `AsyncLocalStorage` for the request. Application code asks `tiendaActual()`; it never
  reads a host, a header or a parameter to find the store. An unknown host is a plain 404.
- **The framework's own page and data caches are not used** (they are keyed by path, not by
  domain). Storefront pages render per request and are cached by the Worker with the Cache API.
  The key holds the host, the path and the store's *content version*, a number the store bumps on
  every change that can show on a page. A bump makes every old page unreachable at once, in every
  data centre, with no purge. Entries live at most five minutes.
- Pages behind a login, forms and `/api` are never cached. A response with `Set-Cookie` is never
  cached.
- Security headers and a nonce-based CSP on every response that is rendered per request; cached
  pages get the CSP without nonce that `ecom` uses for its cached routes (`ecom` `src/proxy.ts`).

### 2.3 The store object

- One Durable Object class, `Tienda`, SQLite-backed. Its name is the store's id from the registry,
  never the host. Created with a location hint for South America.
- It holds **all** of a store's data and **all** code that reads or writes it. The rest of the
  Worker reaches it only through typed RPC methods. **No SQL outside the object. No business rule
  outside the object.**
- Drizzle over the object's SQLite. Migrations are files in the repo and run inside the object
  when it starts (`blockConcurrencyWhile`), so every store migrates itself the first time it is
  touched after a deploy. A migration that fails leaves the store on its last good schema and the
  store answers 503 with its id in the log; other stores are untouched.
- A method that changes data does it in one synchronous transaction and makes no network call
  inside it. Anything that must leave the store (a WhatsApp message, a webhook) is a row in the
  store's outbox written in that same transaction (§2.6).
- Reads for a page are one RPC call returning what the page needs, not a call per query.
- Recovery: the platform's 30-day point-in-time recovery, **and** a nightly export of every store
  to the private bucket (§2.7), because a restore has to be possible into a different store.

### 2.4 The registry

- One D1 database, `flota`: stores (id, name, state), domains (host → store, primary or redirect),
  fleet users, the fleet audit log, last-seen health per store. It holds nothing a storefront page
  needs except the host → store answer, which the Worker keeps in memory for a few seconds.
- A store's own users, settings and secrets live in the store object, not here.

### 2.5 Data contract (C1)

The schema of `ecom` (`src/db/schema.ts`, 30 tables) translated to SQLite in full, version 2
tables included, with these rules: integer primary keys; money as integer guaraníes; timestamps as
integer milliseconds UTC; enums as text with a check constraint; JSON as text validated by zod at
the edge of the object; every foreign key declared and enforced; no `store_id` anywhere. What
`ecom` solved with `SELECT … FOR UPDATE` needs no lock here: the object runs one method at a time.
Added tables: guides, pages, the outbox, enquiry and search counters, leads, the content version.

### 2.6 Leaving the store: the outbox and the queue

A store never calls the outside world from inside a transaction. It writes an outbox row; after
commit the Worker puts a message on the queue `SALIDA`; the consumer asks the store for the row,
sends it (WhatsApp Cloud API, a signed webhook, e-mail later), and reports the result back to the
store. Retries with backoff, then a dead state the panel shows. Sending twice is prevented by the
row's id travelling as an idempotency key.

### 2.7 Files

- `MEDIOS` (public bucket, one for all stores): `/<store id>/p1/<name>@<W>x<H>.<ext>`, the same
  pre-sized set `ecom` uses (WebP at 240/480/800/1200 plus a JPEG), prepared **in the browser** by
  the panel exactly as `ecom`'s `src/lib/preparar-imagen.ts` does, verified by their bytes on
  upload. No image is resized on Cloudflare.
- `PRIVADO` (private bucket, never public): nightly exports, and later payment receipts.

### 2.8 Secrets, sessions, limits

- One Worker secret, the master key. A store's integration secrets are encrypted in its object
  with a key derived from the master key and the store id; they never go back to the browser.
- Store panel sessions: a cookie on the store's own domain, checked inside the store object.
  Fleet sessions: a cookie on the fleet host only, with a second factor. A fleet user enters a
  store's panel through a short-lived signed hand-off the store verifies, and every action they
  take there is logged in that store with their name.
- Logins and public forms: an exact counter inside the store object, plus the platform's rate
  limiting in front.

### 2.9 Platform facts this design rests on (read 2026-11-18; C0 re-checks the ones marked *)

Workers Paid: 10 M requests and 30 M CPU-ms a month included; 128 MB per isolate; up to 1,000
routed zones per Worker and 100 custom domains per zone*. Durable Objects with SQLite: 10 GB per
object, synchronous transactions, 30-day point-in-time recovery, included in the plan with usage*.
D1: batch transactions only (the reason store data is not in D1); fine for the registry. Hyperdrive:
25 configurations per account (the reason MySQL is not kept). Cache API: per data centre, delete is
local only (the reason for versioned keys). Queues, R2 and Cron Triggers are in the plan with
included usage. OpenNext supports Next 16; vinext is in beta.

## 3. Scope

- **Version 1 (C0–C8):** storefront (home, category with filters, product with variants, search,
  policy pages, contact, 404), themes as data, store mode "consulta" with WhatsApp buttons, guides,
  structured data, sitemap and robots per domain, enquiry and search counters, optional lead form,
  outbox and queue, integrations with encrypted secrets, the store panel (login, users, products,
  variants, categories, photos, settings, pages, enquiries), spreadsheet import, supplier offers
  (private), the fleet registry and panel, cron, nightly export and restore, importers from
  productos.com.py's D1 export and from an `ecom` backup.
- **Version 2 (after C8):** cart, checkout, orders and their states, stock reservation, transfer
  and cash payments with receipts, then coupons, shipping, returns, reviews, customer accounts,
  Pagopar. Ported from `ecom`'s domain with its integration tests as the specification.
- **Out:** anything in §1.1; a page builder; multi-language; moving a live site.

## 4. Autonomy protocol

1. Work until every exit line of the phase prompt passes. Never ask permission for in-plan work.
2. **Where sessions run:** cloud containers started by the manager. Node and pnpm, no Docker, no
   `gh` CLI (GitHub through the session's GitHub tools), Chromium preinstalled for Playwright
   (never `playwright install`; `--trace off`). No database server is needed: the Workers runtime
   with Durable Objects, D1, R2 and Queues runs locally.
3. **Gate:** `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm
   build && pnpm e2e`, all local, **and** the repo's CI green on the PR's last commit. Report
   numbers. `pnpm test` runs inside the Workers runtime, not in Node with fakes.
4. **One PR per phase**, branch given by the manager (`fase/<id>-<slug>`), body ≤ 25 lines. Open it
   when the local gate is green. **A phase does not merge its PR** (the manager does), except C0
   and C1, which run alone and merge themselves with a merge commit when CI is green.
5. **File ownership:** a phase writes only inside its `Owns`, its own tests, its own
   `docs/log/<id>.md`, new i18n keys in a block of its own, and one bullet in `CHANGELOG.md`. A
   change it needs elsewhere is written in its log under "Para el pase de enlace" and done by C8.
   On a conflict with `main`: main wins, re-apply your change, re-run the gate.
6. **Stop only for** a missing credential with no fallback, or a foundation decision (§2) that
   turned out wrong. Then: write it to `docs/decisions-needed.md`, commit, push, report, end.
   Everything else: choose, record it in the log, continue.
7. **Report once:** last step, one message of ≤ 6 lines to the manager session named in the brief
   (PR, last commit, gate numbers, log path, what C8 or Anton must do), then end the turn. If the
   manager later writes that `main` moved: merge `origin/main`, re-run the gate, push, report again.
8. **Fable** builds a phase only when an Opus session has failed its exit twice and the manager
   judges a third try would fail the same way. Then the manager does it itself, in its own
   conversation; it never starts another Fable session.
9. **Subagents:** Sonnet 5.5 for porting and same-shaped units, Haiku 5.5 for mechanical work,
   model always set explicitly; every result is read by the Opus session before it is committed.
10. **Phase log** `docs/log/<id>.md`: ≤ 12 lines Built, ≤ 8 Decisions, ≤ 8 Known issues, "Para el
    pase de enlace", one Verification line with commit and numbers.
11. **Porting from `ecom`:** clone `https://github.com/antonmarklundcom/ecom` (public) read-only
    outside the repo folder. Name the source file in the commit message. Port the tests with the
    code they cover. Never copy `fable/`, `drizzle/`, `scripts/` for Hostinger, or MySQL code.
12. **No secrets in the repo**, no real customer data in fixtures, no deploy (§1.8).
13. **Polish cap:** one screenshot pass per phase (≤ 5 pages × 2 widths, as a CI artifact, never
    committed), one adversarial re-read of the diff, one follow-up commit.

### 4.M The manager (a Fable conversation Anton opens on `ecom-cf`)

Runs from `fable/cf/MANAGER.md` (in `ecom`; copied to `docs/plan/MANAGER.md` in `ecom-cf` by its
first act). In short: it starts sessions, merges PRs one at a time, keeps the plan true, and
writes the report Anton reads when he comes back. It does not watch sessions work.

## 5. Phases

### 5.0 C0 — foundations (alone; the phase everything rests on)
Repo skeleton (pnpm, strict TypeScript, lint, CI), the framework decision of §2.2 with its record,
the Worker entry (§2.1 steps 1–3), the store object with one table and its migration (§2.3), the
registry with two stores, and **one page end to end**: the home of each of two stores lists that
store's own products, served from the cache on the second request and fresh after a change.
Exit: a test in the Workers runtime and an e2e with two hosts prove each line of §2.2 and §2.3
that C0 can prove (two stores never see each other's data or cached pages, under concurrent
requests; an unknown host is 404; a forged store header from outside is ignored; a bump makes old
pages unreachable); the platform facts marked * re-checked with their URLs in the record;
`CLAUDE.md` with the rules of §2 a later session must not break; bundle size against the limit.

### 5.1 C1 — the data contract
§2.5 in full, plus: RPC conventions (naming, errors as typed results, input validated by zod inside
the object, no raw rows returned), the registry schema, test helpers (`crearTienda()`, two stores,
a clock), demo data marked as demo, the export format and `restaurar` with a round-trip test, the
content version and the rule for when it bumps.
Exit: every table of `ecom`'s schema has its SQLite counterpart or a written reason; migrations
apply from empty and are idempotent; export → restore into another store gives equal data;
`docs/DATOS.md` lists every table with its owner phase.

### 5.2 C2 — the storefront
Read side of the catalogue inside the store object and the pages of §3 version 1, ported from
`ecom`'s storefront with its components, themes (as tokens stored per store; at least `ecom`'s
four presets) and `data-testid` values. Store mode "consulta" as `ecom` O32 built it. Uses the
cache of §2.2 and proves a product edit shows after the bump.
Exit: `ecom`'s storefront e2e specs that do not need a cart pass against two demo stores with two
different themes; no storefront page makes more than two RPC calls; accessibility spec passes.

### 5.3 C3 — the store panel
Login, sessions, users and roles, password reset, first-run setup of a store; products, variants,
categories, bulk edits, photos (§2.7), store settings (identity, contact, mode, theme), policy
pages. Every panel RPC checks the session and the role **inside the store object**; a test calls
each one without a session and with a wrong role.
Exit: `ecom`'s panel e2e specs for these screens pass; the authorisation test covers every panel
method (it fails when a new method is added without a rule); photo upload verified by bytes.

### 5.4 C4 — search appearance and guides
Pure SEO library ported from `ecom` (`src/lib/seo.ts` after O35: structured data with the
back-order rule, breadcrumbs, organisation, web site), sitemap and robots **per domain**, canonical
URLs from the request's own domain, guides stored in the store (front matter and Markdown, the
renderer of `ecom` O34) with their pages, and the tools that load a store's content from files:
`contenido:aplicar` (guides, categories, pages; dry run by default; through the panel's API, not
around it) and `seo:auditar`.
Exit: sitemap, robots and canonicals of two stores never name the other's domain; guide content
test ported; structured data of an enquiry product validates; the audit runs on demo data.

### 5.5 C5 — enquiries, leads and the way out
Counters for WhatsApp clicks and searches (as `ecom` O33, same privacy rules), `/api/consulta`,
the optional lead form, the outbox, the queue consumer with WhatsApp Cloud API and a signed
webhook, integrations with encrypted secrets (§2.8), the panel's "Consultas" screen.
Exit: nothing personal in counters or logs (a test); a delivery survives a receiver that is down;
a message is never sent twice; secrets never appear in an RPC result.

### 5.6 C6 — the fleet
The registry in full, `flota:nueva` (a store from a definition folder: registry rows, object,
owner), domains and redirects, the fleet panel on its own host (login with second factor, stores
with health, enquiries and leads across stores, hand-off into a store's panel with audit), the
Cron Trigger fanning out through the queue to every store's `tick`, nightly export, `flota:restaurar`.
Exit: ten demo stores created by the command; one store's failing `tick` does not stop the others;
a fleet user's action inside a store appears in that store's log; restore into a new store works.

### 5.7 C7 — imports
The catalogue spreadsheet of `ecom` (`docs/CATALOGO-CSV.md`: same columns, same validation, with
size caps and work split in chunks through the queue so no step nears the memory limit), supplier
offers, an importer from productos.com.py's D1 export and one from an `ecom` backup file.
Exit: `ecom`'s import tests ported and green; a 5,000-row sheet imports within limits; both
importers are dry-run by default, idempotent, and report counts.

### 5.8 C8 — link pass and hardening
Every "Para el pase de enlace" item; navigation and footers; structured data wired into the pages;
the two-store end-to-end suite over the whole of version 1; a security pass (authorisation on
every method, CSRF on every form, headers, upload limits, the forged-host and forged-hand-off
cases); bundle and CPU budget; `KNOWN-ISSUES.md`; and the documents Anton needs: `README.md`,
`docs/OPERACION.md`, `docs/NUEVA-TIENDA.md`, `docs/DEPLOY.md` (§7, every step his).
Exit: full gate green on `main`; a fresh clone builds and passes from the README alone.

### 5.9 Version 2 — orders and money (prompts written by the manager after C8)
V1 orders, stock reservation, totals and order numbers inside the store object, with `ecom`'s
integration tests as the specification; V2 cart, checkout and the panel's order screens; V3
transfer and cash payments, receipts in the private bucket, expiry by `tick`, notifications;
V4 coupons, shipping, returns, reviews, customer accounts; V5 Pagopar. V1 is the phase most likely
to need §4.8.

## 6. What "done for the night" means

Version 1 merged and green, or as far as it got, with `docs/INFORME.md` on `main`: what is built,
what each phase's numbers are, what failed and why, every decision the manager took, what Anton
has to decide, and how to see it running on his own machine in three commands.

## 7. Human inputs (Anton)

| # | Input | When |
|---|---|---|
| 1 | The repo `antonmarklundcom/ecom-cf` with a README, and the Claude GitHub App allowed on it | before the manager starts |
| 2 | Feedback on `docs/INFORME.md` | when he is back |
| 3 | Staging: a Cloudflare API token and his word; the first deploy to a `workers.dev` address | after version 1 |
| 4 | The first real store: productos.com.py's D1 export, or which store goes first | after staging |
| 5 | Live: domains attached to the Worker, the fleet host (`ecom.antonmarklund.com` proposed) | his decision, store by store |
| 6 | What happens to `ecom` and the four store builds of `fable/plan-trafico.md` | after he has seen version 1 |

## 8. Open questions

1. Is `ecom-cf` public like `ecom`? Public repos do not use up GitHub Actions minutes; a private
   one does, and a night of many PRs can use several hundred.
2. One WhatsApp number per store, or shared (as asked in `ecom`'s plans).
3. Which domain serves the public photos (one for the fleet, or one per store).

## 9. Build log index

| Phase | PR | Log |
|---|---|---|

## 10. Backlog

Enquiry list across products; guide editor in the panel; Search Console data in the fleet panel;
one stock shared by several stores; e-mail through Cloudflare's sending service.
