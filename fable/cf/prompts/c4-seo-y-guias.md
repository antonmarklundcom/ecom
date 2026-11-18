# Phase C4 — search appearance and guides. Opus 5.5 session (`claude-opus-5-5`). Beside C2, C3, C5.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2, §4, §5.4; `docs/log/c0.md`, `c1.md`,
  `docs/DATOS.md`, `CLAUDE.md`. In `ecom` (`origin/main`, and the open or merged work of its
  phases O34 and O35 if present): `src/lib/seo.ts`, `src/lib/guias.ts`, the guide renderer,
  `src/app/guias/**`, `src/app/sitemap.ts`, `robots.ts`, `docs/GUIAS.md`, `docs/SEO.md`,
  `scripts/seo-auditar.ts`, `scripts/categorias-aplicar.ts`, `fable/plan-trafico.md` §2.3–§2.4,
  `tests/unit/seo.test.ts`, the guide tests and fixtures.
- Owns: `src/seo/**`, `src/tienda/contenido/**`, `src/app/(seo)/**` (sitemap, robots, guide
  pages, feed), `herramientas/contenido/**`, `docs/GUIAS.md`, `docs/SEO.md`, their tests,
  `docs/log/c4.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Every absolute URL comes from the request's own store: its primary domain from the registry.
  No environment variable holds a site URL. A request on a redirect domain answers 301 to the
  primary one (the redirect itself is C6's; your canonicals already point there).
- Structured data follows `ecom`'s rules after O35, including: an offer only with a shown,
  chargeable price; back order unless the store's own stock or a supplier stock checked in the
  last 7 days says otherwise; no supplier data in the page.
- Guides live in the store (front matter and Markdown), rendered with the escape-first renderer
  ported from `ecom`. A store with no published guide has no `/guias`, no link, no sitemap entry.
- `contenido:aplicar` reads a store's folder of files and loads it through the panel's
  authenticated API: dry run by default, idempotent, fills empty fields unless `--pisar`.
  `seo:auditar` only reads. Both take the store as an argument.
- Wiring structured data into C2's pages is C8's: export the functions, list the wiring.
### Exit
- Plan §5.4 "Exit", every line. The ported `seo` and guide tests green.
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
