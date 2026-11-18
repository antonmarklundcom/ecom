# Phase O34 — guides. Opus 5.5 session (`claude-opus-5-5`). After O33.
- Read ONLY: this file; `fable/plan-trafico.md` §1, §2.3, §4, §5.3 and the phase table;
  `fable/plan-2026-11.md` §4; `CLAUDE.md`; `docs/log/o33.md`; `src/lib/markdown.ts` (the escape
  rule), `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/config/catalogue.ts`,
  `src/components/catalogue-editorial.tsx`, `scripts/template-shared.ts`, `scripts/nueva-tienda.ts`,
  NEW-STORE.md §5, `docs/TEMPLATE-INHERITANCE.md`.
- Owns: `src/lib/guias.ts` and `src/lib/markdown-guia.ts` (new), `src/app/guias/**` (new),
  `src/components/guia-*.tsx` (new), the guide entries in `src/lib/seo.ts` and `src/app/sitemap.ts`,
  the "Guías" block on the category and product pages and on the home, the footer link,
  `scripts/template-shared.ts`, `scripts/nueva-tienda.ts` (keep `src/content/`), `next.config.ts`
  only if the build needs it to ship the files, `src/content/guias/README.md`, `docs/GUIAS.md`,
  `tests/unit/guias-*.test.ts`, `tests/fixtures/guias/**`, one e2e spec, `src/i18n/es-PY.ts`,
  NEW-STORE.md §5, `CHANGELOG.md`, `docs/log/o34.md`.
### Rules
- Branch from the brief, off latest `main`. Gate and reporting: plan §4.
- No database table and no migration. A guide is a file.
- No new runtime dependency for markdown or front matter unless it has no install scripts, no
  transitive dependencies and you say why in the log. The guide renderer follows
  `src/lib/markdown.ts`: escape everything first, then add your own tags; no raw HTML; links only
  `https://` (with `rel="nofollow noopener"`) or internal paths starting with `/` (followed).
  Headings start at `h2`: the page's `h1` is `titulo`.
- The template ships no guide. With none published: `/guias` is 404, no link anywhere, nothing in
  the sitemap. Fixtures for tests live in `tests/fixtures/guias/`.
- Guides are read at build time and the pages are static. Prove it on `pnpm build && pnpm start`,
  the way Hostinger runs it.
- `Article` data: headline, description, `datePublished`, `dateModified`, publisher and author as
  the store (`marcaEfectiva()`), `mainEntityOfPage`, image only if the guide has one. No author
  person, no rating, no FAQ rich-result promise.
- A category or product slug in a guide that does not exist is skipped when rendering and listed by
  the content test's report; it never breaks the build of a store.
- `src/content/` is the store's in `scripts/template-shared.ts`: a sync never overwrites or deletes
  it. Add the test that proves it with the harness helpers already in `tests/`.
- `docs/GUIAS.md` is written for the session that will write guides: format, plan decision 8, and
  the checklist the content test enforces.
### Exit
- Plan §5.3 "Exit", every line.
- A store with its own `src/content/guias/` survives `pnpm template:sync` untouched (test).
- Gate green locally and on GitHub; PR merged with a merge commit; `docs/log/o34.md` committed and
  its line added to plan §9.
## After this phase
Report to the manager (plan §4.5) and end. Start no session. Never use Fable.
