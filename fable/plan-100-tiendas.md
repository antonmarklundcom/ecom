# fable/plan-100-tiendas.md — from ten stores to a hundred

**Written:** 2026-11-18 by a planning session (Fable 5.2, opened by Anton). **Build:** not started.
**Starts after** `fable/plan-trafico.md` has tagged `v2.1.0`. E6 and E7 touch no storefront file and
may start earlier.
**Source:** Anton, 2026-11-18 ("build like 100 stores on this repo; Opus builds everything, Fable
only what is very hard"); `fable/plan-trafico.md`; `fable/plan-2026-11.md` §5.3, §8 Q5 and §10;
`docs/decisions/0001-hosting.md`; `docs/log/o28.md`, `docs/log/o31.md`; a read of the code on
`dbebe01` (§2.2).
**Pace (Anton, 2026-11-18): "we will start with a few stores, not 100."** With two Hostinger
accounts of 10 Node.js apps each, one app per store covers 20 stores at no extra cost. So: after
`v2.1.0`, only E1 (a store is data), E3 (leads) and E4 (supplier sources) are candidates to start,
each on Anton's go. **E7, E8, E9, E10 (fleet part) and E12 are parked** until the stores pass
about 15 or Anton asks. No VPS and no new hosting is bought for this plan before then.
**Status of the main idea (§1.1):** proposed. Phases E1–E6 and E11 are worth doing whatever Anton
answers; E8–E10 and E12 are not started before he says yes to §8 Q1 with E6's numbers in hand.

| Phase | Repo | Model | Prompt file | Sections | Owns (areas) | Depends on |
|---|---|---|---|---|---|---|
| E1 | ecom | Opus 5.5 (`claude-opus-5-5`) | `fable/prompts/e1-tienda-como-datos.md` | §2.1, §5.1 | the store definition as data and its one loader | v2.1.0 |
| E2 | ecom | Opus 5.5 | `fable/prompts/e2-temas.md` | §5.2 | `src/themes/**`, theme checks | E1 |
| E3 | ecom | Opus 5.5 | `fable/prompts/e3-leads.md` | §2.3, §5.3 | reference code in the WhatsApp message, optional lead form, lead webhook | E1 |
| E4 | ecom | Opus 5.5 | `fable/prompts/e4-fuentes-proveedor.md` | §2.4, §5.4 | supplier sources, staged catalogue changes, review screen | E1 |
| E5 | ecom | Opus 5.5 | `fable/prompts/e5-contenido-con-control.md` | §2.5, §5.5 | content checks across stores, the store brief, the cohort report | v2.1.0 |
| E6 | ecom | Opus 5.5 | `fable/prompts/e6-hechos-hosting.md` | §5.6 | `docs/decisions/0002-flota.md` (numbers and options; no code) | §7 inputs 1–2 |
| E7 | ecom | **Fable 5.2, in a window Anton opens** | `fable/prompts/e7-diseno-multi-tienda.md` | §2.2, §5.7 | `docs/decisions/0003-multi-tienda.md`, a failing proof test | — |
| E8 | ecom | Opus 5.5 | written after E6 and E7 | §5.8 | fleet mode in the template | E1–E4, E6, E7, §8 Q1 |
| E9 | flota (new) + ecom | Opus 5.5 | written after E8 | §5.9 | the fleet repo and its commands | E8 |
| E10 | ecom | Opus 5.5 | written after E8 | §5.10 | the fleet panel and alerts | E9 |
| E11 | ecom | Opus 5.5 | `fable/prompts/e11-costo-de-release.md` | §5.11 | `.github/workflows/**`, distribution, CI in stores | v2.1.0 |
| E12 | ecom + flota | Opus 5.5 | written after E10 | §5.12 | proof with 100 test stores, moving a store in and out | E10 |

Waves: **1** = E1, E5, E6, E7, E11 side by side. **2** = E2, E3, E4 side by side, after E1.
**3** = E8 alone. **4** = E9, then E10. **5** = E12. Then stores in cohorts (§6).

---

## 1. Decisions

### 1.1 Proposed — needs Anton's yes (§8 Q1)

**Two kinds of store.**
- **Own store** (*tienda propia*): its own repo from the template, its own Hostinger app and
  database, a custom look allowed. Today's model. For the few stores that earn it: productos,
  anillos, muebles, lenceria, mascota. Ten at most.
- **Fleet store** (*tienda de flota*): no repo and no code. A folder of data (settings, theme,
  categories, guides, policy pages) in one repo `antonmarklundcom/flota`, its own database, its own
  domain. One deployment of the template serves all of them, choosing the store by the domain of
  the request. A hundred stores = up to ten own + ninety fleet.

Why: every cost that grows with the number of stores today is a cost of "one repo and one app per
store" (§3.1). A fleet store has no repo to sync, no CI to run, no app to configure, no cron to
add. What stays per store is what has to: a domain, a database, content.

### 1.2 Already made — do not reopen

1. Everything in `CLAUDE.md`, `AGENTS.md`, `fable/plan-2026-11.md` §1 and `fable/plan-trafico.md` §1
   (traffic first, card payment off, nothing invented, no production change by a session).
2. **A database per store, also in the fleet.** No `store_id` column is added to the template's
   tables. Order, stock and money code keeps reading "the" database; which one that is gets
   decided once per request, outside the domain (§2.2). Backups, restores and migrations stay per
   store, and a store can move between the two kinds by moving its database.
3. **A store is data, not code** (§2.1), in both kinds.
4. **Single-store mode stays the default** and behaves exactly as before every phase of this plan.
   The whole suite green with fleet mode off is the regression bar of E8.
5. **Models (Anton, 2026-11-18):** Opus 5.5 builds every phase. Fable builds only E7, and only in
   a conversation Anton opens: never a spawned session, a subagent or a scheduled task. A phase
   that fails twice on Opus, or stops on a foundation question, may be given to Fable the same
   way, by Anton, phase by phase.
6. **Stores are added in cohorts with a gate between them** (§6). The gate is measured results,
   not the calendar.
7. **Fleet stores never link to each other** and never share a text block. Each has its own niche
   and its own keyword map (§2.5).

## 2. Object model

### 2.1 The store definition (E1)

Everything that differs between two stores and is not a secret or a row in the database, as plain
files validated by one schema:

| File | Holds | Today in |
|---|---|---|
| `tienda.json` | name, searchable brand, title, description, tagline, language, theme id and token overrides, header and footer variant, home sections, `modoVenta`, flags (`cuentasClientes`, `proveedores`), hero, payment methods, legal identity (§7 input 8) | `src/config/tienda.ts`, `src/config/checkout.ts` |
| `catalogo.json` | attributes, filters, comparison, editorial sections per category and product | `src/config/catalogue.ts`, `public-facts.ts`, `editorial-tools.ts` |
| `paginas/*.md` | default policy pages | `src/config/paginas-default.ts` |
| `categorias.json`, `guias/*.md` | as `fable/plan-trafico.md` §2.3–§2.4 | `src/content/**` |

- One loader, `tiendaActual()`, is the only reader. In an own store it reads the folder in the
  repo. In the fleet it reads the folder of the store the request belongs to. Code that reads
  `TIENDA.…` today (54 places in 27 files) goes through it.
- A store that still has its edited `src/config/*.ts` keeps working after a sync with no change in
  behaviour; `pnpm tienda:a-datos` converts it when its owner wants.
- **Test of "zero code":** a store created with `pnpm nueva-tienda` differs from the template only
  inside its definition folder, and a `template:sync` of such a store has nothing to merge by hand.

### 2.2 One process, many stores (E7 designs, E8 builds)

What binds the code to one store today, counted on `dbebe01`:

| Binding | Where | Size |
|---|---|---|
| The database | `src/db/index.ts`: `db` is already a proxy over one pool from `DATABASE_URL` | 1 file; 51 files import it |
| The store definition | `TIENDA.…` | 54 uses in 27 files (gone after E1) |
| The public URL | `siteOrigin()` reads `NEXT_PUBLIC_SITE_URL` | 19 uses in 15 files |
| Secrets from the environment | `SESSION_SECRET`, `CRON_SECRET`, `SETUP_SECRET` | 38 `process.env` reads in 25 files, all kinds |
| Cached pages | home, category and product pages are cached by path (`src/proxy.ts`, `RUTAS_CACHEADAS`) | the cache does not know the domain |
| Cached data | `unstable_cache` / `revalidateTag` | 88 uses in 15 files; tags do not name a store |
| Memory shared by the process | the integrations snapshot (`src/lib/integraciones.ts`), rate-limit buckets, pending browser operations | 3 modules |
| Cron | three routes, one store each | `src/app/api/cron/*` |
| Photos and private files | one R2 bucket per store, private files behind a block rule | per store today |

Requirements E7 must meet and prove with a test, whatever mechanism it picks:
1. The store is chosen from the request's host, once, before any store data is read. An unknown
   host gets a 404 that names no store.
2. `db`, `tiendaActual()`, `siteOrigin()`, the integrations snapshot and the secrets answer for
   that store and for no other, including under concurrent requests to two stores.
3. The same path on two domains is cached separately; revalidating one store never touches another.
4. Cron runs every store from one entry, one store's failure does not stop the others, and
   `job_runs` stays per store.
5. A request, a job or a log line always carries the store it belongs to.
6. One store's admin can never read or change another's, even with a forged host header behind
   the proxy.
7. Adding a store, or changing its content, does not need a rebuild of the app.

### 2.3 Leads (E3)

- The WhatsApp message carries a short reference (store + product + day) so a conversation can be
  matched to its store and product by whoever answers.
- An optional form "te escribimos" (name, phone, product) for buyers who do not want to open
  WhatsApp. Off by default.
- A lead (from the form) and an enquiry click (from O33) can be sent to a CRM through a signed
  webhook configured in `/admin/integraciones`, delivered through the existing outbox with
  retries. VenderCRM is the first preset.
- A lead is personal data: stored only when the form is on, shown only in the panel, deleted
  after a period the owner sets, named in the privacy page.

### 2.4 Supplier sources (E4)

- A **source** is where a store's catalogue comes from: a sheet at a URL, a file dropped in the
  panel, or an adapter for one supplier (Dropi first, from productos.new's capture code).
- A scheduled read produces **staged changes** (new product, price, supplier stock, discontinued),
  never a direct write. Rules the owner sets decide which apply by themselves (for example a price
  change under a percentage) and which wait in a review screen.
- Applying a change writes `supplier_offers` with `checked_at`, which is what the 7-day "in stock"
  rule of `fable/plan-trafico.md` §2.4 reads.

### 2.5 Content with controls (E5)

- A **store brief** (`brief.md` in the definition folder): niche, buyer, what the supplier
  actually states, what must never be claimed. Every content session starts from it.
- `pnpm contenido:auditar`: across all stores it can see, flags guides and category texts that
  are too alike (shared sentences above a threshold), repeated titles, two stores targeting the
  same search, links from one fleet store to another, and any text failing the checks of
  `docs/GUIAS.md`. A store is not published with findings.
- `pnpm cohorte:informe`: per store, the numbers the gate of §6 needs.

## 3. Scope

### 3.1 What grows with every store today

| Cost | Per store today | Source |
|---|---|---|
| Hands-on go-live | about 3 hours (app, database, variables, cron, R2, DNS) | estimate in `docs/log/o31.md` |
| Build of the store | several sessions per store (five phases in the anillos and muebles plans) | those plans |
| CI on a template release | about 18 Actions minutes per private store | `fable/anillos/plan-anillos-tienda.md` §3 D1 |
| Cron entries | three | DEPLOY.md §5 |
| R2 | a bucket and a block rule | NEW-STORE.md |
| Looking after it | open each store's panel and `/api/health` | — |

### 3.2 In scope

E1–E12 (§5), the cohort rule (§6), and what was parked in earlier plans and belongs here: O27's
measurements (in E6), one cron entry per store (in E8), a private bucket for backups and receipts
(in E9), the Dropi review queue (in E4), the fleet status command (in E10), the GitHub App for
distribution (in E11).

### 3.3 Out of scope

Selling from fleet stores (stock, bank data, shipping, Pagopar per store) beyond keeping it
working; electronic invoicing; a visual page builder; paid ads; choosing the hundred niches (§7
input 9 is Anton's); a marketplace that joins the stores.

## 4. Autonomy protocol

`fable/plan-trafico.md` §4 applies in full: cloud sessions, the local MariaDB gate plus GitHub CI,
one PR per phase, parallel phases do not merge themselves, the manager merges one PR at a time,
report once and end. In addition:

1. **Phases whose prompt does not exist yet** (E8, E9, E10, E12) are written by the manager from
   the decision records of E6 and E7, as a docs PR, before the phase starts.
2. **Fable (E7 only).** Runs in a conversation Anton opens, reads committed state, writes
   `docs/decisions/0003-multi-tienda.md` and the proof test, and ends. It does not implement fleet
   mode and does not supervise E8.
3. **A phase that touches order, stock, money or auth code** says so in its PR body with the list
   of files, and its exit needs the full integration suite on MySQL 8 and MariaDB.
4. **Production.** No session touches Hostinger, Cloudflare, a VPS, DNS or a live database. Scripts
   that would (DNS records, creating databases) are dry-run by default and are run by Anton.

## 5. Phases

### 5.1 E1 — a store is data
§2.1. The definition folder, its schema, the loader, `pnpm nueva-tienda` writing data instead of
code, `pnpm tienda:a-datos`, the brand guards reading the definition. Exit: the "zero code" test
of §2.1 with the harness; productos.tienda's current `src/config` (a copy as fixture) syncs with no
manual step and renders the same home, category and product HTML before and after; the full gate.

### 5.2 E2 — themes that cover a hundred stores
From 4 presets to at least 12, each a set of tokens (palette, radius, type scale, fonts from a
fixed self-hosted list, header and footer variant, home section order), plus per-store overrides
in `tienda.json`. Every preset passes a contrast check, in light and dark, and one screenshot set
(home, category, product, guide at 1440 and 390) kept as a CI artifact. No preset needs a
component of its own. Exit: a store changes its whole look by editing `tienda.json` only.

### 5.3 E3 — leads
§2.3. Exit: the reference in the message is stable and decodes to store, product and day; the
form is off by default, validated on the server, rate-limited; webhook delivery survives a CRM
that is down (outbox retry, test); retention job; privacy page text; nothing personal in logs.

### 5.4 E4 — supplier sources
§2.4. Exit: the Dropi adapter and the sheet adapter behind one interface, tested on fixtures; a
run is idempotent; nothing is written to the catalogue without a staged change; the review screen
applies and rejects; a source that fails leaves the catalogue untouched and shows in the panel.

### 5.5 E5 — content with controls
§2.5. Also `docs/CONTENIDO.md`: how one store's content is produced from a brief (map, categories,
guides, pages), what a session may and may not write, and the checks. Exit: the audit catches each
seeded fault in fixtures (near-copy, same search in two stores, cross-link, missing source) and
passes the four stores of `fable/plan-trafico.md` once they exist; the cohort report runs on
fixture data.

### 5.6 E6 — hosting facts and options (no code)
Absorbs O27. With Anton's inputs (§7 1–2), read-only: memory and process count of one live store;
what the plan allows (Node apps, databases, connections per database user, processes, memory);
whether several domains can reach **one** Node app on Hostinger with the host name intact and a
certificate each, and how many; the same for a VPS; price of each shape at 10, 30 and 100 stores.
Every number has its source (a command's output, a Hostinger page with its date, or Anton's panel).
Output `docs/decisions/0002-flota.md`: four options side by side — (a) fleet app on Hostinger
with added domains, (b) fleet app on a VPS, (c) one app per store with a shorter checklist, (d)
fleet app on Cloudflare Workers keeping MySQL (Anton asked on 2026-11-18 whether Cloudflare could
be the better host; it is evaluated here with facts, not built) — and a recommendation. Anton decides (§8 Q1).

### 5.7 E7 — design of "one process, many stores" (Fable, Anton's window)
§2.2. Experiments on a throwaway branch, then `docs/decisions/0003-multi-tienda.md`: the mechanism
chosen for each of the seven requirements, the ones rejected and why, the order E8 builds them in,
and what E8 must not touch. Plus one committed proof: a test "dos tiendas, un proceso" that starts
the app against two databases and two definitions, fails on `main`, and is the exit of E8.

### 5.8 E8 — fleet mode in the template
Builds E7's record. Fleet mode is off unless configured; with it off nothing changes. One cron
entry that runs every store. Exit: E7's proof test green; the whole suite green in single-store
mode; an isolation suite (two stores, concurrent requests, forged host, cache revalidation, cron
with one failing store); release `v3.0.0`.

### 5.9 E9 — the fleet repo and its commands
`antonmarklundcom/flota` (created by Anton): `tiendas/<dominio>/` per store. Commands, all dry-run
by default: `flota:nueva` (folder from a brief, database, migrations, owner), `flota:migrar` (every
database, one canary first, stop at the first failure, resumable), `flota:backup`, `flota:estado`,
`flota:dns` (prints the records; Anton applies them). One R2 bucket with a prefix per store for
photos, and a second private bucket for backups and receipts. Exit: ten test stores created,
migrated, backed up and one restored, from the commands alone; go-live checklist per fleet store
measured in minutes and written down.

### 5.10 E10 — the fleet panel
One place for every store of both kinds: up or down, last backup, last cron run, enquiries and
searches (O33), content audit, version behind (own stores, from `pnpm template:atraso`), and
Search Console numbers when connected. Its own login with a second factor. Alerts through the
existing notifier when a store is down or a backup is older than two days. Own stores report
through a signed, read-only status route.

**Added 2026-11-18 (Anton: "manage stock, orders and logistics from one login").** The panel is
also the back office for the fleet, not only a status page:
- **One login.** A super-admin account that is not a user of any store (its own table in the
  fleet's registry database, second factor required). Proposed address: `ecom.antonmarklund.com`,
  a domain of its own pointing at the fleet app, which serves only the panel on that host.
- **Combined lists across stores**, read from each store's database: orders to prepare and to
  ship, payments waiting for review, low stock, enquiries and leads, supplier changes waiting for
  review. Filter by store; export as CSV.
- **Work inside a store without a second login:** from any row, open that store's own `/admin`
  already signed in, as the super-admin. Order, stock and money changes are made there, by the
  code that already makes them; the panel adds no second way to change an order.
- Every action a super-admin takes inside a store is written to that store's own activity log with
  the super-admin's name. This is the one exception to §2.2 requirement 6, and it has its own tests.
- Not included: one stock shared by several stores (§8 Q6).

### 5.11 E11 — the cost of a release
For the stores that keep their own repo: measure Actions minutes per store per release; sync PRs
run the short checks, the full e2e runs on the canary store only; a sync PR of a store with no
custom code merges itself when green; the GitHub App replaces the personal token
(`docs/decisions-needed.md` item 4). Exit: minutes per release at ten own stores, measured.

### 5.12 E12 — proof at a hundred, and moving stores
A hundred generated test stores in one process: memory, connections, time to migrate all, time to
first byte, a restore of one store while the others serve. And the two moves, each as a command and
a runbook proven on test stores: an own store with no custom code into the fleet, a fleet store out
to its own repo.

## 6. Stores in cohorts

| Cohort | Stores | Kind |
|---|---|---|
| 0 | productos, anillos, muebles, lenceria | own (`fable/plan-trafico.md`) |
| 1 | 6 | fleet, after E9 |
| 2 | 15 | fleet, after E12 |
| 3 | 25 | fleet |
| 4 | 50 | fleet |

A cohort starts when the one before it passes its gate, read from `pnpm cohorte:informe` at least
60 days after that cohort went live: share of its pages Google has indexed, searches it appears
for, enquiries per store, hours and money spent per store. **The thresholds are Anton's** (§8 Q2);
the plan fixes only that there is a gate and that it is measured. A store that brings nothing
after two gates is paused, not polished.

## 7. Human inputs (Anton)

| # | Input | Needed by |
|---|---|---|
| 1 | Which store is live on Hostinger, SSH to that plan, the plan's name and limits as the panel shows them. Known from Anton (2026-11-18): two Hostinger accounts, both in Brazil, 10 Node.js apps each, so 20 stores is the ceiling of "one app per store" on what he has | E6 |
| 2 | Whether a VPS is acceptable if the numbers favour it | E6's recommendation |
| 3 | Yes or no to §8 Q1 | before E8 |
| 4 | A go to open the Fable conversation for E7 | E7 |
| 5 | The repo `antonmarklundcom/flota` (private, empty) and the Claude GitHub App on it | E9 |
| 6 | The CRM endpoint and key for the lead webhook, entered in `/admin/integraciones` | E3 goes live without it; needed to use it |
| 7 | Supplier access: a Dropi export or sheet per source | E4 runs on fixtures without it |
| 8 | Legal identity shown on each store (name, RUC, address, contact) and whether one company stands behind all of them | E1's schema; each store's go-live |
| 9 | The list of domains and niches, in cohort order, with why each | before cohort 1 |
| 10 | The GitHub App for distribution, created with the permissions in `docs/decisions-needed.md` item 4 | E11 |
| 11 | A Cloudflare API token kept on Anton's machine for `flota:dns`, never given to a session | E9, at go-live |
| 12 | Search Console access for the fleet (a service account added to each property) | E10, optional |

## 8. Open questions

1. **The main idea (§1.1): own stores plus a fleet served by one app.** Recommended: yes, decided
   with E6's numbers. If the answer is no, E8–E10 and E12 are replaced by "one app per store with
   the shortest possible checklist", and the ceiling is what one person can look after.
2. **Gate thresholds between cohorts** (§6). Recommended: set them after cohort 0 has 60 days of
   data, from what those four stores actually did.
3. **Which of the four own stores move into the fleet later.** Recommended: decide per store at
   E12; a store with no custom code (lenceria is the likely one) is cheaper in the fleet.
4. **One WhatsApp number per store, per group of stores, or one for all.** It decides how E3's
   reference is used and who answers.
6. **One stock shared by several stores.** Each store has its own stock today, in its own
   database. If the same physical item is sold in two stores (a Dropi product in productos and in
   a niche store), a sale in one does not lower the other. Recommended: do not build it now; with
   no stock anywhere and supplier stock read by E4, the case does not exist yet. If Anton says it
   will, it is a new phase before selling is switched on in the fleet: one central stock that the
   stores reserve from.
5. **Legal:** what Paraguayan law requires an online seller to show, and whether one company can
   stand behind a hundred shop names. A question for Anton's accountant or lawyer; E1 only makes
   room for the answer.

## 9. Build log index

| Phase | PR | Log |
|---|---|---|
| plan | this PR | — |

## 10. Backlog (not planned)

- Selling in fleet stores at scale: Pagopar per store, shipping, invoices.
- A shared search across stores.
- Translating a store.
- Automatic niche discovery.
