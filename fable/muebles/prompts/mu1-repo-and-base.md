# Phase MU1 — the repo and the base. Opus 5.5 session (`claude-opus-5-5`). First phase.
- Start only if the manager's brief says Anton approved this session in chat, and gives the store
  name, tagline and public WhatsApp (plan §3 input 1; missing ones use the plan's fallbacks).
- Read ONLY: this file; in ecom (`origin/main`) `fable/muebles/plan-muebles-tienda.md` (all),
  `fable/plan-2026-11.md` §1 and §4, `CLAUDE.md`, NEW-STORE.md "En una página", §2, §3, §4 and §5
  "El kit de temas", `docs/log/s29.md`, `fable/REVIEW-2026-11-10.md` § "How this was tested".
- Owns: the new repo `antonmarklundcom/muebles.tienda`. In it: `src/config/tienda.ts`,
  `src/config/checkout.ts`, `docs/log/mu1.md`, `docs/log/mu1-shots/**`, `STATUS.md`.
### Work
1. Check: O31 merged; ecom `main` carries the latest tag and its newest "CI" and "Tests en MariaDB"
   runs are green (`gh run list -R antonmarklundcom/ecom --limit 6`); `gh repo view
   antonmarklundcom/muebles.tienda` fails (the repo must not exist: `--crear-repo` is not
   re-runnable; if it exists, continue from the clone instead).
2. In an ecom worktree at latest `origin/main` (never switch `C:\dev\ecom` itself): `pnpm
   nueva-tienda --crear-repo antonmarklundcom/muebles.tienda --en C:\Projects --dry-run` and read
   the output; then the real run (private, the default) with `--dominio muebles.com.py --tema
   vitrina` and the brief's `--nombre`, `--titulo`, `--descripcion`, `--tagline`, `--whatsapp`.
   A text Anton did not give and the wizard requires is a neutral placeholder containing
   `[COMPLETAR]`, listed in the log.
3. `src/config/tienda.ts`: `proveedores: true`, `cuentasClientes: false`, `lang: "es-PY"`.
   `src/config/checkout.ts`: `paymentMethods: ["transferencia", "contra_entrega"]`.
4. Theme previews: with `pnpm demo` data in `muebles_dev_mu1`, screenshots (Playwright, desktop
   1440 and mobile 390) of home, one category, one product and the cart for each stock theme
   (`clasico`, `vitrina`, `calido`, `oscuro-vivo`) into `docs/log/mu1-shots/<tema>-<page>-<size>.png`.
   Switch `tema` only in the working tree for the shots; commit `vitrina`.
### Exit
- Gate green, the template's Playwright specs unchanged and passing; both workflows green; PR
  `phase/mu1-repo-and-base` merged with a merge commit; `docs/log/mu1.md` (≤ 12 lines Built, the
  verification line with numbers, the `[COMPLETAR]` list); `DONE.md` written.
### Rules every muebles phase carries (plan §4)
- Start condition: O31 (productos.tienda) merged = `docs/log/o31.md` exists on ecom `origin/main`.
  Go-live additionally waits for O27 (`docs/log/o27.md`). Unmet: write `FAILED.md` (below) and end.
- The store is created with `pnpm nueva-tienda --crear-repo` and lives at `C:\Projects\muebles.tienda`;
  worktrees next to it. Work on C: only, never on E:.
- Gate = `fable/plan-2026-11.md` §4.2 in the store: `pnpm install --frozen-lockfile && pnpm db:generate`
  (no `drizzle/` diff) `&& pnpm typecheck && pnpm lint && pnpm test && pnpm build` with
  `REQUIRE_DATABASE_TESTS=1`, then Playwright, then `pnpm preflight` showing only items for Anton.
  Local MySQL on port 3317 is shared: check `SHOW PROCESSLIST` first and wait if another session is
  testing. Databases `muebles_test_mu1` and `muebles_dev_mu1` only; nothing outside the
  `muebles_` prefix is created or dropped. `E2E_PORT=3321`.
- AND both GitHub workflows green on the PR branch: "CI" and "Tests en MariaDB". In a private repo
  the second runs only by manual dispatch (`gh workflow run mariadb.yml -R
  antonmarklundcom/muebles.tienda --ref <this phase's branch>`): allowed only on the store's own PR
  branches, no other `gh workflow run` anywhere.
- One PR, branch `phase/mu1-<slug>` off the store's latest `main`, merged with a merge commit.
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
- Keep the store's `STATUS.md` current. End by writing `C:\dev\muebles-wt\mu1-carryover\DONE.md`
  (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals) or `FAILED.md` (state, exact blocker).
## After this phase
Start nothing. The manager asks Anton before MU2 and MU4. Never use Fable.
