# Phase C7 — imports. Opus 5.5 session (`claude-opus-5-5`). After C3; beside C6.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2, §4, §5.7; `docs/log/c1.md`, `c3.md`,
  `docs/DATOS.md`, `CLAUDE.md`. In `ecom`: `docs/CATALOGO-CSV.md`, `src/domain/catalog-csv.ts`,
  `catalog-import-plan.ts`, `catalog-import.ts`, `catalog-duplicates.ts`, `supplier-offers.ts`,
  `src/lib/csv.ts`, `spreadsheet.ts`, their tests, `docs/log/s25.md`, `docs/log/o31.md`
  (the D1 importer and what it learned), `src/domain/backup-format.ts`.
- Owns: `src/tienda/importar/**`, `herramientas/importar/**`, `src/app/admin/importar/**`,
  their tests and fixtures, `docs/CATALOGO-CSV.md`, `docs/log/c7.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Same sheet as `ecom`: same columns, same validation, same plan-then-apply flow with a preview
  the owner confirms. A sheet enters whole or not at all, per product group, as `ecom` defines.
- The Workers runtime has 128 MB per isolate. Parse and apply in bounded chunks through the queue;
  measure memory on a 5,000-row sheet and write the number in the log. If the XLSX library cannot
  stay inside the limit, accept CSV in the panel and convert XLSX in the browser, and say so.
- CSV formula neutralisation and the size caps of `ecom` S25 are kept, with their tests.
- All writes go through C3's write methods; this phase adds no second way to change a product.
- The two importers (productos.com.py's D1 export; an `ecom` backup) run from the command line
  against the local runtime, dry run by default, idempotent, with counts, and keep photo
  references as they are (`r2:p1/…`). Fixtures are generated, never real data.
### Exit
- Plan §5.7 "Exit", every line.
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
