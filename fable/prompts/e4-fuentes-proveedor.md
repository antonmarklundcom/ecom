# Phase E4 — supplier sources. Opus 5.5 session (`claude-opus-5-5`). Wave 2, after E1, beside E2 and E3.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.4, §4, §5.4; `fable/plan-trafico.md` §2.4
  and §4; `CLAUDE.md`; `docs/log/o31.md` ("Template proposals" 3), `docs/log/o35.md`, `docs/log/e1.md`;
  `src/domain/supplier-offers.ts`, `src/domain/catalog-import-plan.ts`, `src/domain/catalog-import.ts`,
  `src/lib/proveedores.ts`, `src/domain/job-runs.ts`, `docs/CATALOGO-CSV.md`, NEW-STORE.md
  § "Proveedores". In `antonmarklundcom/productos.new` (public, read-only clone outside this repo):
  only its Dropi capture and review-queue code, as a reference.
- Owns: `src/domain/fuentes/**` (new: the interface, the sheet adapter, the Dropi adapter),
  tables for sources and staged changes with one migration, the scheduled read (inside an existing
  cron route), `/admin/proveedores/**` (sources and the review screen), their tests and fixtures,
  `docs/CATALOGO-CSV.md`, NEW-STORE.md § "Proveedores", `CHANGELOG.md`, `docs/log/e4.md`.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- Everything is behind `proveedores: true`. With it off, no route, no table read, no job.
- A read never writes the catalogue. It writes staged changes. Applying one goes through the same
  functions the catalogue import uses (price, variants, supplier offers), in a transaction, with
  the audit trail those functions already leave. This phase adds no second way to change a price.
- Auto-apply rules are the owner's and default to "nothing applies by itself".
- Selling stock (`variants` stock) is never changed from a supplier's number. Supplier stock goes
  to `supplier_offers` with `checked_at`.
- A source URL is fetched with a size cap, a timeout, `https://` only, private addresses refused.
  A sheet goes through the existing hardened spreadsheet reader.
- No supplier credential in the environment: if an adapter needs one, it is an integration in
  `/admin/integraciones`. Without it the adapter is off.
- Nothing from a supplier (name, cost, link) reaches the storefront; the existing test that
  searches the public HTML covers the new fields.
### Exit
- Plan §5.4 "Exit", every line. Migration applies on MySQL 8 and MariaDB 10.11.
- A fixture of 300 products read twice produces staged changes once; a changed price produces one.
- Gate green locally and on GitHub on the PR's last commit; `docs/log/e4.md` on the branch. Do not
  merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
