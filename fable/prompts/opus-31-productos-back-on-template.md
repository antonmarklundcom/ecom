# Phase O31 — productos.com.py back on the template. Opus 5.5 session. Only on Anton's go.
- Start condition: `docs/decisions-needed.md` in ecom has Anton's go for review Q3; O23 and O27 are
  merged; a version tag exists. Otherwise write the question, commit, push, end (§4.4).
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.5, `fable/REVIEW-2026-11-10.md`
  § "productos.new" (P1–P8), `docs/log/o23.md`, `docs/log/o27.md`, NEW-STORE.md "En una página"; in
  productos.new `docs/STATUS-2026-11.md`, `workers/d1/schema.ts`, `docs/operations/workers-recovery.md`.
  Load skills `nextjs-deploy-hostinger` and `nodejs-mysql-hostinger-stack`.
- Owns: a NEW store repo created from the template (name from Anton) and, in it,
  `scripts/importar-desde-d1.ts` with tests. In ecom only `tiendas.json` (one entry) and
  `docs/log/o31.md`. Nothing in productos.new.
- Hard limits: READ-ONLY towards production. No DNS change, no Custom Domain detach, no write to D1
  or to bucket `productos-images`, no hPanel change. D1 data arrives as an export file Anton makes
  (`wrangler d1 export`); this session never runs wrangler against production.
### Rules
- A new repo from the template, not a merge: productos.new has 289 files the template lacks and
  its migrations 0023–0026 collide with the template's. The new store uses the template's history.
- The import maps D1 rows to the template schema: products, variants, categories, product_images
  (`r2:p1/…` references byte-for-byte; the bucket is reused), supplier offers into
  `supplier_offers`. Idempotent, dry-run by default, counts printed per table.
- Store-only features (catalog audit, Dropi queue, inquiry metrics) are listed, not ported.
### Exit
- On a local MySQL 8 loaded from the export: 262 products, 9 categories, 821 images (or the export's
  own counts, stated); every image reference resolves; slugs identical to the live sitemap.
- Store gate green (typecheck, lint, suite, build, Playwright); `pnpm preflight` reports only
  items that need Anton (Pagopar keys, bank data, domain).
- `docs/log/o31.md` holds Anton's cutover checklist: freeze admin edits, final export, import,
  Hostinger app and env, smoke test on the temporary URL, DNS switch (two records), rollback =
  re-attach the Worker Custom Domains, what to delete after 14 days.
## After this phase
Spawn nothing. STOP and report counts, the checklist and what was left behind. Never use Fable.
