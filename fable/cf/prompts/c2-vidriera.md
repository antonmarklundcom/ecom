# Phase C2 — the storefront. Opus 5.5 session (`claude-opus-5-5`). Beside C3, C4, C5.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2, §4, §5.2; `docs/log/c0.md`, `c1.md`,
  `docs/DATOS.md`, `CLAUDE.md`. In `ecom`: `src/app/page.tsx`, `src/app/categoria/**`,
  `src/app/producto/**`, `src/app/buscar/**`, the storefront components, `src/themes/**`,
  `src/lib/modo-venta.ts`, `src/domain/product-inquiries.ts`, `src/db/queries` (catalogue reads),
  `src/lib/testids.ts`, `tests/e2e/productos.spec.ts`, `modo-consulta.spec.ts`,
  `accesibilidad.spec.ts`, `docs/log/o32.md`.
- Owns: `src/tienda/catalogo/lectura/**`, `src/app/(vidriera)/**`, `src/componentes/vidriera/**`,
  `src/temas/**`, their tests, `docs/log/c2.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Pages of plan §3 version 1 only: no cart, no checkout, no account. Where `ecom`'s page shows a
  buy button, this one shows what `ecom` shows in consulta mode.
- One RPC call per page for its data, two at most. Filters, search and variant choice follow
  `ecom`'s URLs and behaviour.
- Themes are data per store (tokens), applied as CSS variables; `ecom`'s four presets at least.
  No colour or font is hard-coded in a component.
- Every `data-testid` of `ecom`'s storefront is kept. Texts through the i18n layer, brand and
  contact only from the store's settings.
- Structured data, sitemap and guides are C4's: leave the slots, list them in "Para el pase de
  enlace". Counting clicks is C5's.
- Port components with Sonnet subagents (`claude-sonnet-5-5`) after you have ported two yourself.
### Exit
- Plan §5.2 "Exit", every line, on two demo stores with different themes and different modes.
- A product edited through the store object shows on its cached page on the next request.
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
