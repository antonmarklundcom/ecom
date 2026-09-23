# Prompt: next session on the ecom template (Opus 5.5)

Paste everything below the line into a new Claude Code session. It works both
in a **cloud session on `antonmarklundcom/ecom`** and **locally** (Windows PC,
`C:\Claude 1\ecom-repo`). Section "Local run" only applies to the PC.

---

You are continuing work on `antonmarklundcom/ecom`, the Next.js + Drizzle +
Hostinger MySQL e-commerce **template** that Anton copies ("Use this template")
into many **private** store repos. Read `CLAUDE.md`, `NEW-STORE.md` (especially
"En una página", "CI y minutos de Actions", "La distribución automática del
template", "Arreglos que aparecen después") and `CHANGELOG.md` before touching
anything.

## What was already done (PR #115, merged 2026-09-22)

- CI cut for Actions minutes: `ci.yml` only on PRs (no push to main),
  `paths-ignore` for docs, `concurrency` cancel; `e2e` only with label
  `ci-completo`, manual dispatch, or `template/…` branches; `lighthouse` manual
  only. `distribuir.yml` / `pnpm-al-dia.yml` only run in the template repo;
  distribution triggers on tag `v*`. Dependabot monthly. Husky `pre-push` runs
  `pnpm test`.
- `.env.example` has no sample WhatsApp; `preflight` blocks `+595981123456`.
- `SOLO_TEMPLATE` (`fable/`, `.github/dependabot.yml`) removed by
  `nueva-tienda`, skipped by `bootstrap:repo`, dropped by `template:sync`.
- `template:sync` auto-resolves `KNOWN-ISSUES.md`, `ARCH.md`, `NEW-STORE.md`,
  `CHANGELOG.md` to the template side (T7). MariaDB warning in the suite (T3).
- New `pnpm template:probar-tienda` (fresh store from HEAD in a temp worktree,
  typecheck + unit tests, 0 Actions minutes).
- `fable/TEMPLATE-REVIEW.md` findings T1–T7 are all closed.

## Rules for this session

- GitHub Actions minutes are scarce (private repos). Don't add workflows or
  jobs. Don't label PRs `ci-completo` unless the PR touches checkout, `/admin`,
  or `data-testid`s. Docs-only PRs run no CI at all.
- Never use the Fable model for subagents/sessions/routines without Anton's
  explicit OK in this conversation.
- Maquinaria vs piel rule from `CLAUDE.md` applies.
- Before calling anything done: `pnpm typecheck && pnpm lint && pnpm test`.
- One PR per task below, created as soon as there is a first real commit;
  merge each one yourself when `checks` is green and it is mergeable (Anton
  authorizes this), then start the next from fresh `main`.

## Tasks, in order

1. **Ask Anton first (one question, all at once):** the list of existing store
   repos (owner/name), each one's domain and Hostinger account/slot, and
   whether `TIENDAS_TOKEN` is already set as a secret in the template repo. Do
   not guess repo names.
2. **Fill `tiendas.json`** with those stores (fields `repo`, `dominio`,
   `hosting`, `base`, `notas` — no secrets). PR, merge.
3. **Publish `v1.0.0`:** on up-to-date `main`, run `pnpm template:probar-tienda`
   (must end with ✓), move the "Sin publicar" block of `CHANGELOG.md` under
   `## v1.0.0 — <date>` with "Migración: no", add a new empty "Sin publicar",
   PR + merge, then `git tag v1.0.0 && git push origin v1.0.0`. That triggers
   `distribuir.yml`; check its run and report which stores got a PR (if the
   token is missing, the run says so — tell Anton what to set).
4. **For each store PR opened by the distribution** (needs `add_repo` for
   each store repo): check CI, fix only sync-caused failures, report the rest.
   Don't merge store PRs — each store owner decides.
5. **Design doc, not code:** write `fable/plan-paquete.md` proposing how to
   move the shared machinery (`src/domain`, `src/lib`, `src/db`, `drizzle`,
   checkout actions, Pagopar) into a versioned package (private npm package
   via GitHub Packages vs git submodule vs keep cherry-pick sync). Compare cost
   in Actions minutes, Hostinger build compatibility (Hostinger builds from
   the repo with pnpm; private registry auth there is a real risk), migration
   path for existing stores, and what breaks in `template:sync`. End with a
   recommendation and **stop for Anton's decision** — do not implement.
6. Small leftovers if time allows (each its own PR): the pre-push hook takes
   ~80 s — consider `vitest --changed` or unit-only; make sure `ci-completo`
   label exists in the template repo (tell Anton if you can't create labels).

## Local run (Windows PC only)

- Repo: `C:\Claude 1\ecom-repo` (ignore `C:\Claude 1\ecom`, an old stub).
- `git fetch origin && git checkout main && git pull` first.
- If `pnpm` is not on PATH: prepend `C:\Users\anton\.local\bin` or use
  `corepack pnpm`.
- Before vitest: `$env:GIT_CONFIG_COUNT='1'; $env:GIT_CONFIG_KEY_0='core.autocrlf'; $env:GIT_CONFIG_VALUE_0='false'`.
- No Docker/MySQL: integration tests skip; CI (MySQL 8) is the integration
  check. Known env failure: the symlink test in
  `tests/unit/bootstrap-into-repo.test.ts` (EPERM) — report, don't fix.
  `template:probar-tienda` uses a junction for `node_modules`, which works
  without developer mode.
- The repo commits CRLF; don't convert line endings.

## Report at the end

Per task: PR link, merged or not, what ran (PASS/FAIL), what is waiting on
Anton.
