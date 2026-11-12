# Phase AN4 — data move. Opus 5.5 session. After AN1; best after AN2 and AN3.
- Inputs (plan §4): Anton's catalogue export from the old admin and, if he made one, a backup file,
  at the path the manager's brief gives; R2 bucket, domain and token entered by Anton in the new
  store. Missing inputs do not block: build and prove on fixtures and say so.
- Read ONLY: this file; in ecom `fable/anillos/plan-anillos-tienda.md` §1, §3 (D2, D6), §5, §6 AN4,
  `fable/anillos/INVENTORY-2026-11-11.md` §2.7, §6 and §8, NEW-STORE.md §4 and "Migrar las fotos a
  R2"; in the store `src/lib/product-attributes.ts`, the batch import (`scripts/importar-productos.ts`,
  the canonical sheet), `scripts/fotos-*.ts`; in the old store (`C:\dev\.cache\anillos-old`,
  read-only) `src/db/schema.ts`, its attribute schemas, its export code and `scripts/seed-store.ts`.
- Owns (store repo `C:\Projects\anillos.tienda`): `scripts/importar-desde-anillos-viejo.ts` (new),
  its tests and fixtures, one `package.json` script entry, `docs/log/an4.md`. Nothing under `src/`.
- Hard limits: READ-ONLY towards production. This session never connects to the old store's
  database, never logs in to the live admin, never writes to any bucket except this store's own and
  only with Anton's token present. No Hostinger, DNS or live database. No store migration.
### Rules
- Branch `phase/an4-data-move` off the store's latest `main`.
- The script reads the export file and writes the template's canonical import sheet. It moves the
  flat ring fields under `values` (`material`, `purity`, `stone`, `stoneShape`, `widthMm`, `unit`;
  variants: `interiorMm`, `interiorMmSecond`, `sizeSystem`, `sizeLabel`), keeps every slug byte for
  byte, keeps `verifiedAt` / `verifiedBy`, and maps concept products to `sale_mode = 'enquiry'`,
  `show_price = false`. Dry run by default, idempotent, counts per table, a list of rows it refused
  and why. Customer, order and sales-workspace data are not read at all.
- Import with the template's own batch import on local MySQL (databases `anillos_test_an4_*`); the
  same test runs on MariaDB through the store's GitHub check.
- Photos: the template's tooling, dry run always. A real run only when the store's R2 integration is
  configured by Anton, only into this store's bucket, and never deleting anything at the source.
- Sizes, prices and materials come from the export. A missing value stays empty or `[COMPLETAR]`.
### Exit
- On local MySQL loaded from the export (or the fixture, stated): product, variant, category and
  image counts equal the source; every image reference resolves or is listed; every product and
  category slug of the live sitemap (read-only GET of `sitemap.xml`) resolves on the new store.
- Store gate green; GitHub checks green, including "Tests en MariaDB".
- PR merged with a merge commit; `C:\dev\anillos-wt\an4-carryover\DONE.md` written, with the exact
  commands Anton runs for the final import at cutover.
## After this phase
Start nothing. Never use Fable.
