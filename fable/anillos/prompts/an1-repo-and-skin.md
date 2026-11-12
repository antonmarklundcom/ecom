# Phase AN1 — the repo and the skin. Opus 5.5 session. First phase.
- Start condition: the manager's brief gives Anton's answers to D1, D4 and D8 of
  `fable/anillos/plan-anillos-tienda.md` §3. Without them: write the question to
  `C:\dev\anillos-wt\an1-carryover\FAILED.md` and end.
- Read ONLY: this file; in ecom `fable/anillos/plan-anillos-tienda.md` (all of it),
  `fable/anillos/INVENTORY-2026-11-11.md` §3.2, §4 (rows 21, 26, 28), §5 and §7, `CLAUDE.md`,
  NEW-STORE.md "En una página", §2 and §5, `fable/plan-2026-11.md` §4; in the old store (reference
  clone, see below) `src/config/tienda.ts`, `src/app/layout.tsx`, `src/app/globals.css`,
  `src/styles/**`, the header, footer, home, hero, product card and collection components.
- Owns: the new repo `antonmarklundcom/anillos.tienda`. In it: `src/config/tienda.ts`,
  `src/config/checkout.ts`, `src/themes/custom.css`, header, footer, home, product card, category and
  collection pages, `public/` media, i18n keys it ADDS, policy and WhatsApp copy, `docs/log/an1.md`.
- Hard limits: nothing under `src/domain/**`, `src/lib/**`, `src/app/actions/**`, `src/db/**`,
  `drizzle/**`, checkout, auth or cron routes. No push, PR or issue in `antonmarklundcom/anillos` (the
  old repo). No Hostinger, DNS, Cloudflare or live database. No image generation, no paid service.
### Rules
- Reference clone of the old store, read-only: `git clone https://github.com/antonmarklundcom/anillos
  C:\dev\.cache\anillos-old` (clear every `GIT_*` variable first). Never build or install in it.
- Create the store from an ecom worktree at latest `origin/main` (must be green on CI and on "Tests en
  MariaDB"): `pnpm nueva-tienda --crear-repo antonmarklundcom/anillos.tienda --en C:\Projects`
  (private unless the brief says public; `--dry-run` first and read what it prints). Identity for the
  wizard from the old `src/config/tienda.ts`.
- Theme: closest preset plus tokens in `src/themes/custom.css` (palette, radius 0.25rem, serif
  headings). No hex colour outside `src/themes`. Keep every `data-testid` of `src/lib/testids.ts`.
- Never copy `globals.css`, `es-PY.ts`, `package.json` scripts or the admin layout from the old
  store (plan §5.2). Add i18n keys; never delete a template key.
- Media: copy only files the new code references. Say in the log what was left behind and why.
- `src/config/checkout.ts`: payment methods per D4 (default: empty, demand test).
### Exit
- Store gate green (plan §5.4; databases `anillos_test_an1_*`, `E2E_PORT=3311`); the template's
  Playwright specs pass unchanged; the store's GitHub checks green, including "Tests en MariaDB".
- Screenshots, live site (read-only GET of public pages) against the new store locally, for the pages
  of plan §4 input 4, in `docs/log/an1-shots/`; every visible difference listed in `docs/log/an1.md`.
- PR `phase/an1-skin` merged with a merge commit; `C:\dev\anillos-wt\an1-carryover\DONE.md` written
  (PR, merge SHA, numbers, differences, `[COMPLETAR]` items).
## After this phase
Start nothing. The manager starts AN2 and AN3. Never use Fable.
