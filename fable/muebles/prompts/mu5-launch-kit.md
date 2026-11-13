# Phase MU5 — launch kit. Sonnet 5.5 session (`claude-sonnet-5-5`, safe for Sonnet). Last phase, after MU3 and MU4.
- Start only if the manager's brief says Anton approved this session in chat.
- Read ONLY: this file; in ecom `fable/muebles/plan-muebles-tienda.md` (all), DEPLOY.md, NEW-STORE.md
  "En una página", §3, §4, §6 and "La distribución automática del template", `tiendas.json`,
  `docs/log/o27.md` if it exists; in the store `docs/log/mu1.md`–`mu4.md`, `HOSTINGER-CHECKLIST.md`
  (git-ignored, written by the wizard). Load skill `project-manual-update`.
- Owns: store `docs/CUTOVER.md`, `docs/log/mu5.md`, `STATUS.md`. In ecom: ONE PR that changes only
  `tiendas.json`, the paused-stores list in `tests/unit/distribuir.test.ts`, and the lines of the
  plan's §11. The owner
  manual `C:\operation manuals\muebles\README.md` and the register files that skill requires.
- Hard limits: no code under `src/**` in either repo. No tag. No Hostinger, hPanel, DNS, Cloudflare,
  R2 or live database.
### Work
1. `docs/CUTOVER.md`: the plan's §7 in order, each step with who does it, where (the DEPLOY.md
   section) and how to check it, using the store's real values from `HOSTINGER-CHECKLIST.md`. No
   secret values: name the `.env.local` key to copy. If `docs/log/o27.md` is missing, say that
   go-live waits for it and leave the `www`/apex rule as "per O27".
2. Run `pnpm preflight` locally and paste its report split into "for Anton" and "should be zero".
   The second list must be empty.
3. In an ecom worktree at latest `origin/main`: `pnpm registrar-tienda
   antonmarklundcom/muebles.tienda --anillo 1 --estado pausada --dominio muebles.com.py --dry-run`,
   then the real PR. In the same PR, add `'antonmarklundcom/muebles.tienda'` at the end of the
   hard-coded list in `tests/unit/distribuir.test.ts`, test "hoy no distribuye a nadie: todas
   pausadas" (after `'antonmarklundcom/productos.tienda'`), with a comment line like O31's. Without
   it the PR from `registrar-tienda` is always red: the script writes only `tiendas.json`, and O31's
   first push failed on both workflows for exactly this (`docs/log/o31.md` "Verification" and
   template proposal 4). Do NOT merge it: Anton merges and activates. Its GitHub checks must be
   green.
4. Closing list in `docs/log/mu5.md`: what merged per phase, every `[COMPLETAR]`, every template
   proposal with a one-line recommendation, what is still open (delivery, settlement, products),
   an honest estimate of Anton's manual time.
5. Owner manual: dated status block, repo and checkout, build and gate commands, remaining owner
   actions. No secrets.
### Exit
- Store PR `phase/mu5-launch-kit` merged with a merge commit, gate and both workflows green (a
  docs-only PR may skip "CI" by its path rules: say so and dispatch "Tests en MariaDB" on the
  branch). Ecom PR open, green, not merged. `DONE.md` written.
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
  Databases `muebles_test_mu5` and `muebles_dev_mu5` only; nothing outside the
  `muebles_` prefix is created or dropped. `E2E_PORT=3325`.
- AND both GitHub workflows green on the PR branch: "CI" and "Tests en MariaDB". In a private repo
  the second runs only by manual dispatch (`gh workflow run mariadb.yml -R
  antonmarklundcom/muebles.tienda --ref <this phase's branch>`): allowed only on the store's own PR
  branches, no other `gh workflow run` anywhere.
- One PR, branch `phase/mu5-<slug>` off the store's latest `main`, merged with a merge commit.
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
- Keep the store's `STATUS.md` current. End by writing `C:\dev\muebles-wt\mu5-carryover\DONE.md`
  (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals) or `FAILED.md` (state, exact blocker).
## After this phase
Last phase: start nothing. STOP with the closing report. Never use Fable.
