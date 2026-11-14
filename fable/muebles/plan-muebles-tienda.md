# fable/muebles/plan-muebles-tienda.md — muebles.com.py, a new store on the template

**Written:** 2026-11-12 by a planning session (Fable 5.2, opened by Anton). **Build:** not started.
Anton starts it by pasting the line of §10 into the manager session.
**Corrected 2026-11-13** (docs only) with what O31 hit (`docs/log/o31.md`): the manager creates the
repo (§4.2, §10), the brand guard needs `marcaBuscable` (§5 MU1.3), the header keeps a visible
category link (§4.12), MU5's ecom PR also edits `tests/unit/distribuir.test.ts` (§5 MU5), and the
MySQL server on 3317 is the manager's (§4.4).
**Source:** Anton's answers on 2026-11-12 (§1), `fable/plan-2026-11.md` §1, §4 and §5.5,
`fable/anillos/plan-anillos-tienda.md` (same shape), NEW-STORE.md "En una página", §4 and §5,
`docs/log/s29.md`, `CLAUDE.md`.
**Stack (locked, `docs/decisions/0001-hosting.md`):** Next.js 16 on Hostinger Node.js + MySQL/MariaDB
(Drizzle). Cloudflare only for DNS (grey cloud) and R2. The domain moved to Cloudflare nameservers on
2026-11-12. Nothing else exists yet: no repo, no Hostinger app, no bucket, no old site to move.

| Phase | Repo | Model | Prompt file | Owns | Depends on |
|---|---|---|---|---|---|
| MU1 | muebles.tienda | Opus 5.5 (`claude-opus-5-5`) | `fable/muebles/prompts/mu1-repo-and-base.md` | the new repo (created by the manager, §10); `src/config/tienda.ts`, `src/config/checkout.ts`, the two brand guards (`tests/unit/marca-centralizada.test.ts`, the default-texts test of `tests/unit/store-settings.test.ts`), `docs/log/mu1.md`, `docs/log/mu1-shots/**`, `STATUS.md` | O31 merged; §3 inputs 1–2; repo created by the manager |
| MU2 | muebles.tienda | Opus 5.5 (`claude-opus-5-5`) | `fable/muebles/prompts/mu2-design-mockup.md` | `docs/design/**` (mockup pages, `DESIGN.md`), `docs/log/mu2.md` | MU1 |
| MU3 | muebles.tienda | Opus 5.5 (`claude-opus-5-5`) | `fable/muebles/prompts/mu3-skin.md` | `src/themes/presets/muebles.ts`, `src/themes/presets.ts`, `src/themes/temas.css`, `src/themes/custom.css`, `src/app/layout.tsx` (fonts), `src/app/page.tsx`, header, footer, home hero, product card, category page, product page markup, `public/` media, i18n keys it adds, their tests, `docs/log/mu3.md` | MU2 **approved by Anton in chat** |
| MU4 | muebles.tienda | Sonnet 5.5 (`claude-sonnet-5-5`) | `fable/muebles/prompts/mu4-content-and-suppliers.md` | `src/config/paginas-default.ts`, `src/config/catalogue.ts`, `src/config/public-facts.ts`, `docs/PROVEEDORES.md`, `docs/planillas/**`, `docs/log/mu4.md` | MU1 |
| MU5 | muebles.tienda + ecom | Sonnet 5.5 (`claude-sonnet-5-5`) | `fable/muebles/prompts/mu5-launch-kit.md` | store: `docs/CUTOVER.md`, `docs/log/mu5.md`, `STATUS.md`; ecom: one `tiendas.json` entry and the §9 lines; `C:\operation manuals\muebles\README.md` | MU3, MU4 |

MU4 touches no file of MU2 or MU3 and may run beside them; MySQL is still used by one session at a
time (§4.4). Everything else is sequential. Fable is not in this table and never will be: no phase,
subagent, spawned session, watcher or Routine runs on it.

**Approval rule (Anton, 2026-11-12):** the manager asks Anton in chat before starting **each** build
session and waits for his yes. One yes covers one session. A phase never starts another phase.

---

## 1. Decisions already made (Anton, 2026-11-12) — do not reopen

1. **Repo:** `antonmarklundcom/muebles.tienda`, private, checkout `C:\Projects\muebles.tienda`.
2. **Business model:** Anton finds furniture suppliers in Paraguay (not Dropi), lists their products
   and takes a commission on each sale. The catalogue starts **empty**; no product data exists.
3. **Suppliers in the panel:** `proveedores: true` in `src/config/tienda.ts`. Each variant keeps its
   supplier (type "local"), cost and links, privately; the margin the panel shows is the commission.
   (Stated by the planner with the decision 3 question; Anton did not object.)
4. **Payments at launch:** bank transfer and cash on delivery. `src/config/checkout.ts` lists
   `transferencia` and `contra_entrega` only. Pagopar stays off (no keys); switching it on later is
   one line in that file plus keys Anton enters in `/admin/integraciones`.
5. **Delivery: open.** Anton does not know yet, and it may differ per supplier. The build leaves the
   template default (one implicit home delivery priced by zone). No zone, fee, coverage or delivery
   time is written by any phase. See §6 T1 and §8.
6. **Look:** a custom theme `muebles`, built on the structure of the template's `vitrina`, designed
   as a mockup first that Anton approves before any skin code (MU2 → MU3). Target: a design Anton
   calls 10/10. No brand colours or logo were given: MU2 proposes a palette; the logo stays text.
7. **Customer accounts:** no. Guest checkout only (`cuentasClientes: false`, the template default).
8. **Language:** `es-PY` only.
9. **Machinery is never edited in the store** (`CLAUDE.md`): nothing under `src/domain/**`,
   `src/lib/**`, `src/app/actions/**`, `src/db/**`, `drizzle/**`, checkout, auth or cron routes, and
   no store-made migration. Anything missing becomes a proposal for a template change (§6), shown
   to Anton, never a patch.
10. **Nothing is created before the build starts**, and nothing in this plan changes DNS, Hostinger,
    Cloudflare or a live database. The last phase hands Anton the go-live checklist of §7.

## 2. What the template already gives this store (so no phase rebuilds it)

- Supplier offers per variant with cost, margin, links and notes, private to the panel; supplier
  columns in the catalogue spreadsheet (NEW-STORE.md §4b-bis, `docs/CATALOGO-CSV.md`).
- Selling modes per product: `stock`, `enquiry` (WhatsApp button instead of the cart) and
  `showcase`, with `show_price`. Useful for made-to-order furniture; which products use which mode
  is Anton's call per product, in the panel.
- Specifications and variant attributes, facets, comparison, image provenance
  (`src/config/public-facts.ts`), keyword coverage, SEO overrides, slug redirects.
- Delivery methods (courier, own delivery, pickup) with the payment methods each allows, and zones
  with fees, all store-wide, loaded in `/admin/envios` (NEW-STORE.md §4e).
- Bank data, integrations (R2, WhatsApp, Pagopar), identity (name, logo, favicon, brand colour) and
  policy pages, all edited by the owner in the panel without a deploy.

## 3. Inputs from Anton

| # | Input | First needed by | If missing |
|---|---|---|---|
| 1 | Store name as buyers see it, a one-line tagline, the public WhatsApp number | MU1 (wizard) | name "Muebles.com.py", tagline and WhatsApp `[COMPLETAR]`; all three are editable later in the panel |
| 2 | His yes in chat for each build session (approval rule above) | every phase | the session is not started |
| 3 | 10–20 real product photos from a supplier, if he has any | MU2 | the mockup uses the template's drawn placeholders; no image is generated |
| 4 | Approval of the mockup, or his changes | before MU3 | MU3 does not start |
| 5 | Yes or no on the proposed category list (MU4 writes a proposal by room; it creates nothing) | after MU4 | categories stay the panel's job |
| 6 | Who collects the money and how the supplier is paid (commission settlement); legal identity, RUC, invoicing; return and warranty terms | go-live | policy pages keep the template's generic text with `[COMPLETAR]` |
| 7 | Delivery: methods, zones, fees, who delivers, whether cash on delivery is collected by the supplier | go-live | template default; preflight lists it |
| 8 | Hostinger slot (from O27's numbers), R2 bucket, public image domain and token, bank data | go-live (§7) | not live |

## 4. Rules for every phase

`fable/plan-2026-11.md` §4 (autonomy protocol) applies, with these changes. Every phase prompt
repeats them in short form.

1. **Start condition.** O31 (productos.tienda) is merged: `docs/log/o31.md` exists on ecom
   `origin/main`. Go-live (§7) additionally waits for O27 (`docs/log/o27.md`). A phase that finds
   the condition unmet writes `FAILED.md` (rule 9) and ends.
2. **Where.** The repo is created by the **manager**, on Anton's go, before MU1 (§10): a build
   session's `gh repo create`, and so `pnpm nueva-tienda --crear-repo` (`scripts/nueva-tienda.ts`
   `pasosCrearRepo`), is refused by the permission check (`docs/log/o31.md` "Known issues"). MU1
   clones it to `C:\Projects\muebles.tienda` and runs the wizard there; worktrees go next to it.
   Work on C: only: never build, install or test on E:.
3. **Gate** (in the store's own repo) = `fable/plan-2026-11.md` §4.2: `pnpm install
   --frozen-lockfile && pnpm db:generate` (no diff in `drizzle/`) `&& pnpm typecheck && pnpm lint &&
   pnpm test && pnpm build` with `REQUIRE_DATABASE_TESTS=1`, then Playwright
   (`pnpm exec tsx scripts/prepare-browser-tests.ts`, `pnpm exec playwright test`), then
   `pnpm preflight`, which must show only items that need Anton. Report real numbers.
4. **Local MySQL** 8.4.11 on port 3317 (`C:\dev\tools\mysql`; the command in
   `fable/REVIEW-2026-11-10.md` § "How this was tested" is how the manager starts it). The server
   is the manager's and shared with other sessions: a phase never starts, stops or restarts it,
   and writes `FAILED.md` if nothing listens on 3317. Before the gate: check `SHOW PROCESSLIST` and the other phases' `DONE.md`; if another session is running
   tests, wait. Databases start with `muebles_` and nothing else is created or dropped:
   `muebles_test_mu<N>` for tests (the name must contain `test`), `muebles_dev_mu<N>` for the app.
   `E2E_PORT` 3321–3325, one per phase (MU1 = 3321 … MU5 = 3325).
5. **Both engines.** Hostinger runs MariaDB. A phase is not done until both GitHub workflows are
   green on its PR branch: "CI" (runs on the PR) and "Tests en MariaDB". In a private repo the
   second runs only by manual dispatch: `gh workflow run mariadb.yml -R antonmarklundcom/muebles.tienda
   --ref phase/mu<N>-<slug>`. That dispatch is allowed only on the store's own PR branches. No other
   `gh workflow run`, in any repo.
6. **Git.** One PR per phase, branch `phase/mu<N>-<slug>` off the store's latest `main`, merged by
   the session with a **merge commit** when the gate and both workflows are green. Never
   `--no-verify`, never force-push, never rewrite history. Any git run in a temp folder clears every
   `GIT_*` variable first (`scripts/ci/entorno-sin-git.mjs`). After every push, in any repo:
   `git -C C:/dev/ecom config core.bare` must still print `false`; if not, stop and report.
7. **Machinery.** §1.9. A gap is written as a proposal in the phase log (what is missing, the
   smallest generic template change, off by default) and reaches Anton through the manager.
8. **The removed image provider is never named** in any tracked file of ecom, its logs or PR text
   (`tests/unit/sin-proveedor-viejo.test.ts`), nor in the store.
9. **Sessions.** Nobody answers permission prompts unless Anton is there. A blocked session writes
   its state to `C:\dev\muebles-wt\mu<N>-carryover\FAILED.md` and ends; a finished one writes
   `DONE.md` there (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals). A phase does not
   start other phases, sessions or subagents on Fable; subagents, if any, are Sonnet 5.5 or Haiku
   5.5, set explicitly.
10. **Never invent facts** about products, prices, materials, measures, delivery, the business or
    legal matters, and no reviews or guarantees. Write `[COMPLETAR]` and list it for Anton. No image
    generation, no paid service.
11. **Read-only towards production.** No DNS, Hostinger, hPanel, Cloudflare, R2, live database, tag,
    or store set to `activa` without Anton's go in chat.
12. **Skin contract.** Colours are theme tokens, never literals (`tests/unit/piel-sin-colores.test.ts`).
    Every `data-testid` of `src/lib/testids.ts` stays. The first `header-category-link` is visible
    without opening a dropdown or drawer: the e2e specs click its `.first()` (`tests/e2e/helpers.ts`),
    and with it hidden 19 specs hung in O31 (`docs/log/o31.md` "Decisions"). Brand text comes from `src/config/tienda.ts`
    and `marcaEfectiva()` only. Add i18n keys; never delete a template key.
13. **Status.** Each phase keeps the store's `STATUS.md` current at every stop: done, running now,
    needs Anton, next step.

## 5. Phases

### MU1 — the repo and the base (Opus 5.5)

1. Checks: O31 merged; ecom `main` carries the latest tag and its newest "CI" and "Tests en MariaDB"
   runs are green; `antonmarklundcom/muebles.tienda` **exists**, private, created from the template
   by the manager (§10), with the `ci-completo` label. Missing: `FAILED.md`.
2. Clone it to `C:\Projects\muebles.tienda`, add the `template` remote, `pnpm install
   --frozen-lockfile`, then `pnpm nueva-tienda --dry-run` and the real run (no `--crear-repo`) with
   `--dominio muebles.com.py --tema vitrina` and the name, tagline and WhatsApp of §3 input 1.
3. `src/config/tienda.ts`: `proveedores: true`, `cuentasClientes: false`, `lang: "es-PY"`.
   `src/config/checkout.ts`: `transferencia`, `contra_entrega`. Brand guard as O31 did
   (`docs/log/o31.md` "Decisions", template proposal 1): `marcaBuscable: "muebles.com.py"` in
   `TIENDA`, and the two guards (`tests/unit/marca-centralizada.test.ts`, the default-texts test of
   `tests/unit/store-settings.test.ts`) search `TIENDA.marcaBuscable ?? TIENDA.nombre`, because the
   store's own copy will say "muebles" everywhere.
4. Theme previews for Anton: with the template's demo catalogue (`pnpm demo`) on local MySQL,
   screenshots of home, a category, a product and the cart in each of the four stock themes, desktop
   and mobile, in `docs/log/mu1-shots/`. The theme is switched only in the working tree for the
   shots; the committed one stays `vitrina`.
5. Exit: gate green with the template's Playwright specs unchanged; both workflows green; PR merged.

### MU2 — design mockup (Opus 5.5). Stops for Anton.

1. Load the skills `impeccable` and `taste-skill:design-taste-frontend`. Read NEW-STORE.md §5.
2. Static mockup pages in `docs/design/mockup/` (plain HTML and CSS, no build step): home, category
   listing with filters, product page (with measures, materials, supplier-neutral delivery block,
   WhatsApp enquiry), cart; desktop and mobile. `docs/design/DESIGN.md`: palette as oklch tokens
   (light and dark), type pairing from `next/font/google`, radius, spacing scale, header and footer
   variant, home section order with categories by room first, the product card.
3. Designed for uneven supplier photos: one crop ratio, a neutral card ground, no dependence on
   cut-out images. Photos: Anton's (§3 input 3) or the template's placeholders. Texts that would be
   facts are `[COMPLETAR]`.
4. Every mockup element maps to a file of NEW-STORE.md §5 "Del mockup al código"; anything that
   would need machinery is listed as a proposal, not drawn as if it existed. The header keeps a
   category link visible without opening anything (§4.12); a dropdown or drawer may be added.
5. Exit: screenshots of the mockup in `docs/design/shots/`; PR merged (docs only, gate still run);
   `DONE.md` says "waiting for Anton's approval of the mockup". MU3 does not start without it.

### MU3 — the skin (Opus 5.5)

1. Preset `src/themes/presets/muebles.ts` (copied from `vitrina`, registered in `presets.ts`),
   `pnpm temas:css`, `tema: "muebles"` in `tienda.ts`; fonts in `src/app/layout.tsx`; retouches in
   `src/themes/custom.css`.
2. Header, footer, home, hero, product card, category page and the product page's markup, to the
   approved mockup. The first `header-category-link` is an always-visible link (§4.12); copies in a
   dropdown or drawer do not carry the id. Not the `con-parametros` twins, not `checkout-form.tsx` logic, not `/admin`.
3. Each rewritten skin file stops receiving template updates: list them in the log.
4. Exit: gate green; the template's Playwright specs pass unchanged; `ci-completo` label put on the
   PR once at the end so the e2e job runs on GitHub too; side-by-side screenshots mockup against
   the running store in `docs/log/mu3-shots/`, differences listed, not hidden.

### MU4 — content and supplier kit (Sonnet 5.5)

1. `src/config/paginas-default.ts`: starting texts of the policy pages for a furniture marketplace,
   with `[COMPLETAR]` wherever a fact is needed (returns, warranty, delivery times, who sells).
2. `src/config/public-facts.ts`: recommend `publishUnknownImages: false` (photos belong to
   suppliers: only images marked own or authorised go to Google and Meta) and leave
   `noManufacturerIdentifiers` as the template has it; both are written as recommendations in the
   log and changed only if the manager's brief carries Anton's yes.
3. `docs/PROVEEDORES.md` (Spanish, for Anton): how a supplier's products enter the store. The
   spreadsheet with the supplier columns, photos by `https://` URL or `fotos:preparar`, selling mode
   per product, cost and margin as commission, image provenance.
   `docs/planillas/proveedor-ejemplo.csv`: the template's sheet format with headers only and one
   commented example row built from the template's own demo data, no invented furniture.
4. A proposed category list by room in `docs/log/mu4.md` for Anton (§3 input 5). It creates no
   category.
5. `src/config/catalogue.ts`: editorial slots left empty unless Anton's brief gives text.

### MU5 — launch kit (Sonnet 5.5)

`docs/CUTOVER.md` in the store = §7 with the store's real values from the git-ignored
`HOSTINGER-CHECKLIST.md` (no secret values: name the key to copy). `pnpm preflight` output, split
into "Anton" and "should be zero". In ecom: `pnpm registrar-tienda antonmarklundcom/muebles.tienda
--anillo 1 --estado pausada --dominio muebles.com.py --dry-run`, then the real PR, **not merged**,
which also adds `antonmarklundcom/muebles.tienda` to the hard-coded list of the test "hoy no
distribuye a nadie: todas pausadas" in `tests/unit/distribuir.test.ts`: the script writes only
`tiendas.json`, so without that line the PR is red (O31's first push, `docs/log/o31.md`
"Verification", template proposal 4).
The owner manual `C:\operation manuals\muebles\README.md` with the `project-manual-update` skill.
Closing list: what merged, every `[COMPLETAR]`, every template proposal, Anton's manual time.
**Stops before any Hostinger, DNS, Cloudflare or data change.**

## 6. Template proposals this plan expects (shown to Anton; none is built by a store phase)

- **T1 Delivery per supplier.** The template's delivery methods and zones are store-wide. If
  suppliers deliver on their own terms, a product needs to carry its supplier's delivery rule. Until
  decided: store-wide methods, or enquiry mode for products whose delivery is quoted by WhatsApp.
- **T2 Commission settlement.** The panel shows margin per variant but has no report of sales per
  supplier or of what each supplier is owed. Until decided: the orders export and a spreadsheet.
- **T3 Made-to-order lead time** shown on the product and in the order, if suppliers build on demand.
Each would be its own small PR and release in ecom, generic and off by default, reaching the store by
`template:sync`. Anton decides whether any of them is built.

## 7. Go-live checklist (Anton, by hand; needs O27 merged and MU5 done)

1. **Hostinger** (hPanel), from `HOSTINGER-CHECKLIST.md` and DEPLOY.md §1, §3, §4, §5: create the
   MariaDB database and user; create the Node.js app and connect the private repo with a deploy
   key; enter the five variables (`DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`, `SETUP_SECRET`) plus `NODE_ENV`; Redeploy; open `/setup` once to create the schema
   and the owner; add the three cron entries.
2. **Smoke test** on Hostinger's temporary URL (DEPLOY.md §6) before the domain points there.
3. **Cloudflare DNS** for `muebles.com.py`: the records Hostinger shows for the app, **grey cloud**
   (DNS only). One hostname runs Node, the other (`www` or apex) is a redirect that starts no
   process, as O27 decides (`docs/decisions/0002-capacity.md`).
4. **Cloudflare R2** (DEPLOY.md §3b): bucket, public image domain, API token, the block rule for
   private objects; enter them in `/admin/integraciones` and press "Probar conexión".
5. **Panel:** `/admin/banco` (bank data, RUC), `/admin/ajustes` (identity, contact, policy pages:
   read every text, replace each `[COMPLETAR]`), `/admin/envios` (zones, methods and which allow
   cash on delivery), `/admin/categorias`, first products with their suppliers.
6. `pnpm preflight` green, one real test order by transfer and one by cash on delivery, then cancel
   them.
7. **Distribution:** merge the `tiendas.json` PR (store stays `pausada`); give the distribution
   credential access to the repo; set `activa` when you want template updates to arrive.
8. **Rollback:** before the first real order, point the DNS records away again; nothing else to undo.

## 8. Risks

- **Photos decide most of the look**, and they come from suppliers in uneven quality. The design
  tolerates that (MU2.3) but cannot fix it. No phase generates images.
- **Delivery is undecided** and may not fit the template's store-wide model (T1). The store can be
  built without it but should not take paid orders before §3 input 7 is answered.
- **A marketplace on commission raises questions the template does not answer**: who invoices, who
  collects cash on delivery, how suppliers are paid (T2). These are Anton's facts (§3 input 6).
- **Rewritten skin files stop receiving template updates.** A 10/10 custom design costs that.
- **Private repo minutes:** every PR runs CI; the MariaDB run and the e2e label are used once per
  phase, at the end.
- **Empty store at the end of the build.** Done (§9) is a store ready for products, not a store
  with products.

## 9. Done means, and an honest estimate

Done: five phase PRs merged in `antonmarklundcom/muebles.tienda` with the gate and both workflows
green; the mockup approved; `docs/CUTOVER.md` written; the `tiendas.json` PR open in ecom; the owner
manual written; one list of every `[COMPLETAR]` and every template proposal. The site goes live only
when Anton runs §7.

Estimate, not timed: MU1 2–3 h, MU2 2–3 h, MU3 5–8 h, MU4 2–3 h, MU5 1.5–2 h of session time; with
one MySQL user at a time and Anton's approvals in between, **two to three days** after O31 merges.
Anton's own time: approvals and inputs about 1 h, the mockup review 30–60 min, go-live plumbing
1.5–2 h (`docs/log/s29.md`), plus finding suppliers and loading products, which this plan cannot
estimate.

## 10. How the build starts

Before MU1, the manager creates the empty store repo on Anton's go (a build session cannot:
`docs/log/o31.md` "Known issues"), and makes sure MySQL listens on 3317 (§4.4):

```
gh repo create antonmarklundcom/muebles.tienda --template antonmarklundcom/ecom --private
gh label create ci-completo --repo antonmarklundcom/muebles.tienda --description "Corre también el e2e en este PR" --color 0E8A16 --force
```

Anton pastes this line into the manager session:

`go muebles: on origin/main of ecom read fable/muebles/plan-muebles-tienda.md and run MU1 to MU5 as it says, once O31 is merged. Ask my approval in chat before starting each session. Opus 5.5 or Sonnet 5.5 as the table says, never Fable.`

Each session gets the prompt `Read fable/muebles/prompts/<file>.md in C:\dev\ecom (origin/main) and
execute it.` plus a short brief with Anton's inputs of §3.

## 11. Build log index

| Phase | PR | Log |
|---|---|---|
| (none yet) | | |
