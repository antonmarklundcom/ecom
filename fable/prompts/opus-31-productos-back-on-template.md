# Phase O31 — productos.com.py back on the template (productos.tienda). Opus 5.5 session.

Updated 2026-11-12 with Anton's answers (`docs/decisions-needed.md` § "Answered", 2026-11-12 lines).

- **Start condition:** O31 go recorded (Q3); tag `v2.0.1` exists. O27 is NOT a start condition for
  the build, only for the cutover. Catalogue data: the D1 export Anton makes, at
  `C:\Projects\_data\productos.tienda\d1-export-20261112.sql` (a later date in the name is fine).
  If no export is there: do everything that does not need it (repo, skin, import script tested
  on a fixture), write "D1 export missing" under Needs Anton in `docs/log/o31.md`, and stop
  before the import proof.
- **Read ONLY:** this file; `fable/plan-2026-11.md` §1, §4, §5.5; `fable/REVIEW-2026-11-10.md`
  § "productos.new" (P1–P8); `docs/decisions-needed.md` § "Answered"; `docs/log/o23.md`;
  `docs/log/s29.md`; NEW-STORE.md "En una página", §4 (with §4b-bis "proveedores"), §5;
  `docs/CATALOGO-CSV.md` § "Proveedores". In productos.new, read-only checkout
  `C:\Projects\productos-workers-staging` (never write, commit or run wrangler there):
  `docs/STATUS-2026-11.md`, `workers/d1/schema.ts`, `docs/operations/workers-recovery.md`.
  `docs/log/o27.md` does not exist yet; do not wait for it. Load skills `nextjs-deploy-hostinger`
  and `nodejs-mysql-hostinger-stack`.

### Anton's decisions (2026-11-12)
1. Repo `antonmarklundcom/productos.tienda`, **private**, checkout `C:\Projects\productos.tienda`.
2. Payments at launch: bank transfer and cash on delivery. Pagopar code stays, switched off
   (empty env); no keys yet (Needs Anton).
3. Suppliers on: `proveedores: true` in `src/config/tienda.ts`. The 262 historical Dropi offers
   are imported as supplier offers (`source_type` dropi, cost, supplier stock, capture date, URLs).
4. Dropi review queue ("Revisar ofertas Dropi"): not on day one. Write it as a proposal for a
   later template phase (every store with `proveedores: true`), not in the store.
5. Look: keep productos.com.py's current look. Port header, footer, home, product card, tokens,
   logo and `/contacto` as skin; list every visible difference left.
6. Dropi Product Lab (`C:\Claude 1\dropi-product-lab\data\lab.sqlite3`): **read-only cross-check
   only**. Open with `file:...?mode=ro`; match `listings.live_sku` (262 rows) to the store SKUs;
   report mismatches in Dropi URL, buy cost and supplier stock (Dropi's suggested sale price only
   for information). Nothing is imported from the Lab, nothing written to it, the Lab program is
   not started. Selling prices come from the D1 export only.
7. "Tests en MariaDB" runs in a private repo only by manual dispatch: Anton allows dispatching
   **that one workflow** on O31's own PR branches in productos.tienda. No other manual run.

### Owns
- The new repo productos.tienda: skin, store config, `scripts/importar-desde-d1.ts` and the Lab
  cross-check script, with tests. Never machinery (`src/domain`, `src/lib`, `src/app/actions`,
  `src/db`, `drizzle`, checkout, auth, cron). A need there = a proposal in `docs/log/o31.md`
  § "Template proposals", shown to Anton, not an edit.
- In ecom: `tiendas.json` (one entry, via `pnpm registrar-tienda antonmarklundcom/productos.tienda
  --estado pausada --anillo 1`), `docs/log/o31.md`, the §9 index line of the plan. Nothing in
  productos.new.

### Steps
1. From a worktree of ecom cut from the latest `origin/main` (never switch `C:\dev\ecom` itself):
   `pnpm nueva-tienda --crear-repo antonmarklundcom/productos.tienda --en C:\Projects\productos.tienda`,
   `--dry-run` first. Wizard values come from productos.com.py's public pages; unknown = `[COMPLETAR]`.
2. Store config: `proveedores: true`, payment methods transfer + cash on delivery.
3. Skin port (decision 5). Keep every `data-testid`.
4. `scripts/importar-desde-d1.ts`: D1 rows → template schema: categories, products, variants,
   `product_images` (`r2:p1/…` references byte for byte; bucket `productos-images` reused),
   supplier offers, `products.supplier_url` from `dropi_url`, settings that map. D1 dates are UTC
   text, booleans integers. Idempotent, dry-run by default, `--aplicar` writes, counts per table.
   Workers-only tables are archived as JSON next to the export, outside every repo. The owner
   login is created fresh with `pnpm create-owner`, locally only.
5. Lab cross-check (decision 6); summary in the log.

### Exit
- On local MySQL (database prefix `o31_`, `E2E_PORT=3131`) loaded from the export: 262 products,
  9 categories, 821 images, 262 supplier offers (or the export's own counts, stated); every image
  reference resolves (public GET only); slugs identical to the live sitemap.
- Store gate: plan §4.2 with `REQUIRE_DATABASE_TESTS=1` on MySQL :3317 (process time zone
  America/Asuncion), Playwright; `pnpm preflight` reports only items that need Anton (Pagopar keys,
  bank data, domain, R2 token).
- GitHub, store repo: each PR has CI green (label `ci-completo`, so e2e runs) and "Tests en
  MariaDB" green (dispatched, decision 7); merged with a merge commit.
- GitHub, ecom: the `registrar-tienda` PR (with `docs/log/o31.md`) has BOTH workflows green, CI
  and "Tests en MariaDB"; merged with a merge commit. A phase is done only with both workflows
  green, never on one engine.
- `docs/log/o31.md`: counts against the export, Lab cross-check, template proposals, Needs Anton
  (`[COMPLETAR]` list), and Anton's cutover checklist: freeze admin edits; final export; import;
  Hostinger Node app, the five env variables, `/setup`, three cron entries; R2 API token and the
  block rule for `/comprobantes/*` and `/backups/*`; smoke test and `pnpm preflight` on the
  temporary URL; low TTL beforehand; DNS switch (detach the two Worker Custom Domains, point `@`
  and `www`, DNS only, at Hostinger); rollback = re-attach the Custom Domains (valid until the
  first real order); what to delete after 14 days; honest time estimate. The cutover waits for
  O27's numbers.

### Rules
- Read-only towards production: no wrangler, no D1 or R2 write, no DNS, Hostinger or Cloudflare
  change, no tag, no store set to active, no paid service, no image generation. Public GET of
  productos.com.py pages, its sitemap and image URLs is allowed.
- Any test or script that runs git in a temp folder clears every `GIT_*` variable first. After
  every push, `git --git-dir="C:/dev/ecom/.git" config --get core.bare` must print `false`.
- No tracked file in ecom names the removed image provider
  (`tests/unit/sin-proveedor-viejo.test.ts`), logs and PR text included.
- Never invent facts about products, prices, the business or legal matters: `[COMPLETAR]`.
- Work on C: only. You are the only MySQL user during this phase; only `o31_` databases.
- Nobody answers permission prompts unless Anton is there: a blocked command goes under Needs
  Anton in the log, and you continue with other work.
- Subagents: Sonnet 5.5 for normal work, Haiku 5.5 for mechanical fan-out, set explicitly.
  Never Fable. WIP commit at least every 30 minutes; the prompt is re-runnable.

## After this phase
Spawn nothing, start no other phase. STOP and report: PR links with merge SHAs, counts, test
numbers, the cutover checklist and Needs Anton.
