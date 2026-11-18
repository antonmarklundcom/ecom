# Store session T-PRO — productos.tienda on v2.1.0, content and SEO. Opus 5.5 session (`claude-opus-5-5`).
- Runs in `antonmarklundcom/productos.tienda`. The plan and this prompt live in ecom: read them from
  `https://github.com/antonmarklundcom/ecom` (`origin/main`, public; clone it read-only outside the
  store's folder, never push to it except the one PR named in step 4).
- Start only if the manager's brief says Anton approved this session, and ecom carries the tag
  `v2.1.0`. Otherwise report "not ready" (plan §4.5) and end.
- Read ONLY: this file; in ecom `fable/plan-trafico.md` §1, §4, §6.1, §6.5, §7, §8 and
  `docs/log/o31.md`, `docs/log/o32.md` … `o36.md`, `docs/GUIAS.md`, `docs/SEO.md`, NEW-STORE.md
  § "Arreglos que aparecen después"; in the store `CLAUDE.md`, `STATUS.md` if present, `docs/log/**`.
- Owns: the store repo's skin, content and docs: `src/config/tienda.ts`, `src/config/catalogue.ts`,
  `src/config/paginas-default.ts`, `src/content/**`, header and footer components, `src/themes/custom.css`,
  `docs/**`. Machinery (`src/domain`, `src/lib`, `src/db`, `drizzle`, `src/app/actions`, `src/app/api`,
  `scripts`, checkout) changes only through `pnpm template:sync`, never by hand.
### Work — one PR per step, each with its line in the store's `docs/log/t-pro.md`
1. **Sync.** On a branch: `pnpm template:sync` to `v2.1.0`. Resolve conflicts the way NEW-STORE.md
   says (skin stays, machinery merges). The store's own `/contacto` stays. Drop the store-side
   edits of the two brand guards and of `seo.test.ts` that the template now covers. Set
   `modoVenta: "consulta"`. Replace the always-visible category strip with the header test ids and
   e2e helper from O32, so the header matches productos.com.py again.
2. **Content, plan §6.5 steps 1–5.** Nine categories, 262 products. For products: run
   `pnpm seo:auditar --json` on the imported data, rank the weakest, and improve at most 40
   (description and SEO fields) as a sheet for the catalogue import, not by hand in a database.
   The catalogue data is not in the repo: use `pnpm importar:d1` on a local database only if the
   brief gives the export; without it, do the categories, guides and pages, and list the product
   work as waiting for the export.
3. **Slug list.** `docs/seo/slugs-proveedor.csv`: every product slug that carries a supplier code,
   and the clean slug it would get. Rename nothing (plan §8 Q1).
4. **Cutover checklist.** `docs/CUTOVER.md` in the store, from the checklist in ecom's
   `docs/log/o31.md`: remove what consulta mode makes unnecessary (bank data, shipping zones, stock
   and sale modes, the test order by transfer), add `pnpm categorias:aplicar`, the content import,
   Search Console (domain property by DNS, submit the sitemap) and the GA4 id. No step is run.
   In ecom: no change, except if `tiendas.json` or a test needs the store's entry corrected (one PR).
### Rules
- Plan §1 decision 8: nothing invented. The 262 products are supplier listings: a claim about
  material, size or what is in the box comes from the product's own data or is left out.
- No production change: productos.com.py, its Worker, D1, R2 and DNS are not touched; only public
  GETs to compare.
- Gate after every step (plan §4.2), in the store: private repo, so dispatch "CI" and "Tests en
  MariaDB" only on your own branch and only when the local gate is green.
- Guides: one exemplar by you, then Sonnet subagents (`claude-sonnet-5-5`), each result read before
  it is committed. Never Fable.
### Exit
- `pnpm seo:auditar --estricto` clean for categories and guides; products: the count before and
  after, and the list left for later.
- 10–15 published guides passing the content test; `docs/seo/mapa.md` with every guide and
  category on its own row.
- All four steps merged; `docs/log/t-pro.md` lists every `[COMPLETAR]` and what Anton does next.
## After this session
Report to the manager (plan §4.5) and end. Start no session.
