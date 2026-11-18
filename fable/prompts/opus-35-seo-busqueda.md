# Phase O35 — search appearance and the two content tools. Opus 5.5 session (`claude-opus-5-5`). After O34.
- Read ONLY: this file; `fable/plan-trafico.md` §1, §2.4, §4, §5.4 and the phase table;
  `fable/plan-2026-11.md` §4; `CLAUDE.md`; `docs/log/o32.md`, `docs/log/o34.md`; `src/lib/seo.ts`,
  `src/app/producto/[slug]/page.tsx` (metadata and the structured data call), `src/lib/product-feed.ts`,
  `src/domain/supplier-offers.ts`, `src/lib/proveedores.ts`, `src/components/stock-badge.tsx`,
  `src/app/categoria/[slug]/page.tsx` (metadata), `src/lib/paginas.ts`, `tests/unit/seo.test.ts`,
  `docs/CATALOGO-CSV.md` (what the catalogue sheet already loads).
- Owns: `src/lib/seo.ts`, `src/domain/disponibilidad.ts` (new), the availability line on the product
  page and card, `src/app/contacto/**` (new), `src/app/sitemap.ts`, the i18n key
  `categoria.metaDescripcion` and new keys, `scripts/seo-auditar.ts` and
  `scripts/categorias-aplicar.ts` (new), two entries in `package.json` scripts, `docs/SEO.md` (new),
  their tests and fixtures, `CHANGELOG.md`, `docs/log/o35.md`.
### Rules
- Branch from the brief, off latest `main`. Gate and reporting: plan §4.
- Availability is decided once, on the server, by the function of plan §2.4. The product page's
  visible line and `productJsonLd` receive its result; neither recomputes it. No supplier field
  (name, cost, stock number, date) is sent to the browser: a test renders the page with
  `proveedores: true` and searches the HTML for them.
- An `Offer` needs a shown, chargeable price (`isChargeablePrice`). No price: no offer. Never an
  empty `offers` list, never a price of 0.
- The merchant feed keeps excluding everything a buyer cannot pay for on the page.
- `/contacto` shows only what the store settings hold. A store that already has its own
  `src/app/contacto/` keeps it on sync: check how `scripts/template-shared.ts` classifies the path
  and say in the log what productos.tienda will see.
- `categorias:aplicar`: reads `src/content/categorias.json`, validates it fully before writing
  anything, dry run by default, one transaction, never deletes a category, fills empty fields only
  unless `--pisar`, prints one line per category. Needs `DATABASE_URL`; refuses a file with a
  duplicate slug or a parent that is not in the file or the database.
- `seo:auditar` only reads. Its checks and thresholds are constants at the top of the script and
  are listed in `docs/SEO.md`. Output: a table for people, `--json` for sessions, `--estricto`
  exits 1 on any finding.
- Nothing here claims shipping, delivery or returns that the owner did not load in the panel.
### Exit
- Plan §5.4 "Exit", every line.
- The structured data of an enquiry product with a shown price validates as `Product` with one
  `Offer` (price, `PYG`, back order, URL); pasted into the log as one JSON block.
- Gate green locally and on GitHub; PR merged with a merge commit; `docs/log/o35.md` committed and
  its line added to plan §9.
## After this phase
Report to the manager (plan §4.5) and end. Start no session. Never use Fable.
