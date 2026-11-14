# Phase MU2 — design mockup. Opus 5.5 session (`claude-opus-5-5`). After MU1. Stops for Anton.
- Start only if the manager's brief says Anton approved this session in chat. The brief may carry a
  folder of supplier photos from Anton (plan §3 input 3); without it, use the template's drawn
  placeholders (`public/placeholders/`). Never generate or download images.
- Read ONLY: this file; in ecom `fable/muebles/plan-muebles-tienda.md` §1, §2, §4, §5 MU2 and MU3,
  §8; NEW-STORE.md §5 (all); in the store `docs/log/mu1.md`, `docs/log/mu1-shots/`,
  `src/themes/presets/vitrina.ts`, `src/themes/tipos.ts`, `src/lib/testids.ts`, the header, footer,
  home, product card, category and product page files. Load skills `impeccable` and
  `taste-skill:design-taste-frontend`.
- Owns (store): `docs/design/**`, `docs/log/mu2.md`. No file under `src/**` or `public/**`.
### Work
1. Goal: a furniture store design Anton calls 10/10, built on `vitrina`'s structure (centred logo,
   air, serif headings) with its own palette, small radius, and a home that leads with categories
   by room. Buyers are in Paraguay, mostly on a phone, and close many purchases over WhatsApp.
2. `docs/design/mockup/`: static HTML and CSS, no build step, no external scripts: `home.html`,
   `categoria.html` (grid, filters, sort), `producto.html` (gallery, price, measures and materials
   block, delivery block, add to cart and WhatsApp enquiry), `carrito.html`. Each works at 390 and
   1440 px, light and dark.
3. `docs/design/DESIGN.md`: the 19 colour tokens in oklch for light and dark plus the semantic
   ones, radius, scale, the font pairing (must exist in `next/font/google`), header and footer
   variant, home section order, product card rules (one crop ratio, neutral ground: supplier photos
   are uneven and are not cut-outs), and a table mapping every mockup part to its file from
   NEW-STORE.md §5 "Del mockup al código".
4. Texts: Spanish (es-PY). Anything that would be a fact (price, measure, material, delivery time,
   warranty, supplier) is visibly `[COMPLETAR]` or the template's demo data, never invented. Brand
   name from the store's `tienda.ts`; no logo is drawn as if it were final.
5. Header contract: the header shows at least one category link that is **visible without opening
   anything** (a strip or row, at 390 and 1440 px). The template's e2e specs click
   `getByTestId(TESTIDS.headerCategoryLink).first()` (`tests/e2e/helpers.ts`, `capturas.spec.ts`,
   `presupuesto.spec.ts`, `accesibilidad.spec.ts`; id in `src/lib/testids.ts`), so categories only
   inside a closed dropdown or drawer make 19 specs hang (`docs/log/o31.md` "Decisions"). A dropdown
   or drawer may exist in addition. Say in `DESIGN.md` which element carries the id.
6. Anything the mockup would need from machinery (plan §6 T1–T3 or new) is NOT drawn as working:
   list it in `docs/log/mu2.md` as a proposal.
7. Screenshots of every mockup page, both sizes, light, into `docs/design/shots/`.
### Exit
- Gate green (docs-only change, still run once); "CI" green or skipped by its own path rules (say
  which); "Tests en MariaDB" dispatched on the branch and green; PR `phase/mu2-design-mockup` merged
  with a merge commit; `DONE.md` ends with the line "Waiting for Anton's approval of the mockup".
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
  Databases `muebles_test_mu2` and `muebles_dev_mu2` only; nothing outside the
  `muebles_` prefix is created or dropped. `E2E_PORT=3322`.
- AND both GitHub workflows green on the PR branch: "CI" and "Tests en MariaDB". In a private repo
  the second runs only by manual dispatch (`gh workflow run mariadb.yml -R
  antonmarklundcom/muebles.tienda --ref <this phase's branch>`): allowed only on the store's own PR
  branches, no other `gh workflow run` anywhere.
- One PR, branch `phase/mu2-<slug>` off the store's latest `main`, merged with a merge commit.
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
- Keep the store's `STATUS.md` current. End by writing `C:\dev\muebles-wt\mu2-carryover\DONE.md`
  (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals) or `FAILED.md` (state, exact blocker).
## After this phase
Start nothing. MU3 starts only after Anton approved the mockup in chat. Never use Fable.
