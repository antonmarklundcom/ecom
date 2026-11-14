# Phase MU3 — the skin. Opus 5.5 session (`claude-opus-5-5`). After MU2 and Anton's approval.
- Start only if the manager's brief says (a) Anton approved the mockup in chat, with his changes if
  any, and (b) Anton approved this session. Otherwise write `FAILED.md` and end.
- Read ONLY: this file; in ecom `fable/muebles/plan-muebles-tienda.md` §1, §4, §5 MU3; NEW-STORE.md
  §5 (all); `CLAUDE.md`; in the store `docs/design/DESIGN.md`, `docs/design/mockup/**`,
  `docs/log/mu2.md`, `src/themes/**`, `src/lib/testids.ts`, the skin files it owns.
  Load skills `impeccable` and `taste-skill:design-taste-frontend`.
- Owns (store): `src/themes/presets/muebles.ts`, `src/themes/presets.ts`, `src/themes/temas.css`
  (generated), `src/themes/custom.css`, `src/config/tienda.ts` (the `tema` line only),
  `src/app/layout.tsx` (fonts), `src/app/page.tsx`, `src/components/site-header.tsx`,
  `site-footer.tsx`, `home-hero.tsx`, `product-card.tsx`, `src/app/categoria/[slug]/page.tsx`,
  `src/app/producto/[slug]/page.tsx` (markup), `public/` media the new code references, i18n keys
  it ADDS, tests for its own change, `docs/log/mu3.md`, `docs/log/mu3-shots/**`.
- Not owned: the `con-parametros` twins, `checkout-form.tsx`, `/admin`, MU4's files
  (`src/config/paginas-default.ts`, `catalogue.ts`, `public-facts.ts`, `docs/PROVEEDORES.md`).
### Work
1. Preset `muebles` copied from `vitrina` with DESIGN.md's tokens; register in `TEMAS`; `pnpm
   temas:css`; commit `temas.css`; `tema: "muebles"`. Fonts in `layout.tsx` keeping the variables
   `--font-geist-sans` / `--font-geist-mono`.
2. Skin files to the approved mockup, in the order of NEW-STORE.md §5: theme → fonts → header and
   footer → home → product card → category → product page. Colours only as tokens. Every existing
   `data-testid` stays. Keep `export const dynamic` / `revalidate` and read no `cookies()` or
   `headers()` in the category and product pages. Brand through `marcaEfectiva()`.
   Header: the first element with `data-testid={TESTIDS.headerCategoryLink}` is an always-visible
   category link (a strip or row, at 390 and 1440 px), never only inside a closed dropdown or
   drawer; copies inside a dropdown or drawer do not carry the id. The e2e specs click its
   `.first()` (`tests/e2e/helpers.ts`, `capturas.spec.ts`, `presupuesto.spec.ts`); with the links
   hidden, 19 specs hung and the CI e2e job hit its 10-minute limit in O31 (`docs/log/o31.md`
   "Decisions").
3. A mockup part that cannot be done as skin is left out and written as a proposal; it is not
   approximated by touching machinery.
4. Screenshots of the running store (demo data, `muebles_dev_mu3`) beside the mockup for home,
   category, product and cart, 390 and 1440 px, in `docs/log/mu3-shots/`; every visible difference
   listed in the log. List every rewritten skin file (it stops receiving template updates).
### Exit
- Gate green; the template's Playwright specs pass unchanged; label `ci-completo` put on the PR once
  at the end (e2e on GitHub); both workflows green; PR `phase/mu3-skin` merged with a merge commit;
  `DONE.md` written.
### Rules every muebles phase carries (plan §4)
- Start condition: O31 (productos.tienda) merged = `docs/log/o31.md` exists on ecom `origin/main`.
  Go-live additionally waits for O27 (`docs/log/o27.md`). Unmet: write `FAILED.md` (below) and end.
- The repo `antonmarklundcom/muebles.tienda` is created by the manager on Anton's go, never by a
  phase: `gh repo create` (and so `pnpm nueva-tienda --crear-repo`) is refused in build sessions
  (`docs/log/o31.md` "Known issues"). MU1 clones it to `C:\Projects\muebles.tienda`; worktrees next
  to it. Work on C: only, never on E:.
- Gate = `fable/plan-2026-11.md` §4.2 in the store: `pnpm install --frozen-lockfile && pnpm db:generate`
  (no `drizzle/` diff) `&& pnpm typecheck && pnpm lint && pnpm test && pnpm build` with
  `REQUIRE_DATABASE_TESTS=1`, then Playwright, then `pnpm preflight` showing only items for Anton.
  Local MySQL on port 3317 is the manager's server: a phase never starts, stops or restarts it (not
  listening = `FAILED.md`). Check `SHOW PROCESSLIST` first and wait if another session is testing.
  Databases `muebles_test_mu3` and `muebles_dev_mu3` only; nothing outside the
  `muebles_` prefix is created or dropped. `E2E_PORT=3323`.
- AND both GitHub workflows green on the PR branch: "CI" and "Tests en MariaDB". In a private repo
  the second runs only by manual dispatch (`gh workflow run mariadb.yml -R
  antonmarklundcom/muebles.tienda --ref <this phase's branch>`): allowed only on the store's own PR
  branches, no other `gh workflow run` anywhere.
- One PR, branch `phase/mu3-<slug>` off the store's latest `main`, merged with a merge commit.
  Never `--no-verify`, force-push or history rewrite. Any git run in a temp folder clears every
  `GIT_*` variable first. After every push: `git -C C:/dev/ecom config core.bare` must print `false`.
- A store never edits machinery (`src/domain`, `src/lib`, `src/app/actions`, `src/db`, `drizzle`,
  checkout, auth, cron) and makes no migration. Anything missing becomes a proposal for a template
  change in the phase log, shown to Anton by the manager.
- No tracked file, log or PR text names the removed image provider
  (`tests/unit/sin-proveedor-viejo.test.ts`).
- Never invent facts about products, prices, delivery, the business or legal matters: write
  `[COMPLETAR]` and list it for Anton. No image generation, no paid service.
- Read-only towards production: no DNS, Hostinger, Cloudflare, live database, tag, or store set to
  `activa` without Anton's go in chat.
- Nobody answers permission prompts unless Anton is there. This phase starts no other phase and no
  session. Subagents, if any: Sonnet 5.5 or Haiku 5.5 set explicitly. Never Fable.
- Keep the store's `STATUS.md` current. End by writing `C:\dev\muebles-wt\mu3-carryover\DONE.md`
  (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals) or `FAILED.md` (state, exact blocker).
## After this phase
Start nothing. Never use Fable.
