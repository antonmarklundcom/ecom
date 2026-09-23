# Prompt: next session on the ecom template, launching the stores (Opus 5.5)

Paste everything below the line into a new Claude Code session. It works both
in a **cloud session on `antonmarklundcom/ecom`** and **locally** (Windows PC,
`C:\Claude 1\ecom-repo`). The "Local run" section only applies on the PC.

---

You are continuing work on `antonmarklundcom/ecom`, the Next.js + Drizzle +
Hostinger MySQL e-commerce **template**, and on the **stores** made from it
(`antonmarklundcom/productos`, `antonmarklundcom/lenceria`,
`antonmarklundcom/mascota`). The goal of this session is **getting the first
store to take real orders**. Read `CLAUDE.md`, `NEW-STORE.md` (especially "En
una página", "La distribución automática del template", "Arreglos que
aparecen después"), `DEPLOY.md`, `CHANGELOG.md` and `TASKS.md` § "Bloqueado por
terceros" before touching anything.

## What the previous session did (2026-09-22/23, PRs #116–#123, #69)

- **#118:** `template:sync` compares files, not commits. For each file it
  looks at three versions: the template at the store's `.template-baseline`,
  the store's version, and the template's latest version.
  - Files the store never touched get the template's version.
  - Machinery changed on both sides is merged (`package.json` key by key).
  - Tests changed on both sides take the template's version.
  - The store's own design files and docs are kept.
  - A real clash is committed with `<<<<<<<` markers, and the PR opens as a
    draft.
- **#118, `distribuir.yml`:** runs the template's own script against each
  store, on one fixed branch `template/sync` per store. It never overwrites
  commits someone pushed by hand, and it creates the `ci-completo` label in
  the store. `TIENDAS_TOKEN` needs Contents, Pull requests **and Workflows**
  set to write.
- **#118, rehearsal command:** `pnpm template:ensayar-distribucion
  [--verificar] [--repo owner/name]` rehearses the distribution locally,
  pushes nothing, and costs 0 Actions minutes.
- **#118, rehearsal result:**
  - `productos` and `lenceria` sync cleanly, and typecheck, lint and unit
    tests all pass afterwards.
  - `mascota` gets a draft PR with one real conflict in
    `src/app/actions/admin-products.ts`. The store never had the catalog-import
    feature, even though its baseline claims it did.
- **#119:** `tiendas.json` lists the three stores (repo + notes only; the
  repo is public, so no Hostinger details).
- **#120:** CI checks `github.event.repository.private`. Public repos (all of
  Anton's) run `checks` and `e2e` on every PR and on every push to `main`,
  for free. Private repos keep the old limits.
- **#121:** the pre-push hook runs `pnpm test:unit` (about 15 s, no database).
  `pnpm test` still runs everything.
- **#122:** CHANGELOG `v1.0.0` (Migración: sí). **#123:** `fable/plan-paquete.md`
  (recommendation: keep the file sync now, and consider a public git-dependency
  package at about 8–10 stores; waiting on Anton's decision).
- **#116, #69:** minor and patch dependency updates, and TypeScript 6.
  **#112** (`@types/node` 26) was closed because the runtime is Node 22.
  The four GitHub Actions bumps (#65, #66, #67, #81) were merged if their CI
  was green; otherwise they are still open.

## What Anton had to do by hand (check each one, don't assume)

1. Add the `TIENDAS_TOKEN` secret to `antonmarklundcom/ecom`: a fine-grained
   token with access to the three stores, and Contents, Pull requests and
   Workflows set to Read and write.
2. Push the tag: `git fetch origin && git tag -a v1.0.0 origin/main -m "v1.0.0" && git push origin v1.0.0`.
   This session's git proxy returns 403 on tag pushes; if you hit the same,
   tell Anton instead of retrying.
3. Create the `ci-completo` label in `ecom`.
4. Answer these: does `mascota` take the template's catalog import? Is
   `muebleria` a store? What is each store's domain? Which store launches
   first (the recommendation is `lenceria`)? And the package plan.

## Rules for this session

- **Never use the Fable model** for subagents, sessions or routines without
  Anton's explicit OK in this conversation.
- The machinery-vs-design rule from `CLAUDE.md` applies, in the template and in
  every store.
- Before calling anything done: `pnpm typecheck && pnpm lint && pnpm test`.
- One PR per task, opened as soon as there is a first real commit. Merge it
  yourself when CI is green and it is mergeable (Anton authorizes this in
  **the template**), then start the next task from a fresh `main`.
- **Store PRs:** fix them and get them green. Merge only if Anton says so in
  this conversation.
- The repos are public, so Actions minutes are free. Don't add workflows
  anyway.
- **Never invent third-party values** (bank details, WhatsApp number, Pagopar
  keys, domains). An empty variable must switch the feature off.

## Tasks, in order

1. **State check (no questions yet).**
   - List open PRs in `ecom` and merge the green ones, in order.
   - Does the `v1.0.0` tag exist? Look at the latest `distribuir.yml` run.
   - For each store, is there a `template/sync` PR, and is its CI green?
   - Report this as a short table, then **ask Anton, all at once, for only the
     answers from the list above that are still missing.**
2. **Store PRs from the distribution.**
   - Attach each store with `add_repo` (`access: "push"`). If that is refused,
     tell Anton exactly what to allow.
   - For each `template/sync` PR, fix only failures the sync caused, on that
     same branch, and push.
   - `mascota`:
     - Resolve the `admin-products.ts` conflict the way Anton decided (the
       default recommendation is to take the template's version).
     - Then fix its design so the new tests pass: `globals.css` must import a
       theme from `src/styles/temas/`, the `data-testid`s from
       `src/lib/testids.ts` must be on the store's header, cards and category
       links, and `src/components/admin/catalog-import.tsx` must be present.
   - Don't merge store PRs unless Anton says so.
3. **Launch the first store** (default: `lenceria`).
   - In that store, work through `DEPLOY.md` and `NEW-STORE.md` with Anton,
     step by step. He does the hPanel clicks; you tell him the exact values
     and check what you can.
   - Write down which of the "Bloqueado por terceros" items are still open
     for this store, and say who unblocks each one.
   - Get `pnpm preflight` green except for the items only Anton can provide.
   - Before real orders, get payment working with **bank transfer + cash on
     delivery**. Pagopar is optional for the first sale.
   - After the deploy, smoke-test the live store: home page, product page,
     checkout of a real test order by transfer, and `/admin` confirms the
     payment. Report the URL and what you checked.
4. **`muebleria`**, only if Anton says it is a store.
   - Find the template commit it was created from: compare its tree against
     `git log` of the template and pick the closest commit.
   - Commit `.template-baseline` there with `pnpm template:diff --marcar`,
     plus the SHA you found.
   - Add it to `tiendas.json` in the template (PR, merge), then run
     `pnpm template:ensayar-distribucion --repo antonmarklundcom/muebleria --verificar`
     and report the result.
5. **Domains** into `tiendas.json`, if Anton gave them (PR, merge).
6. **Package plan:** only if Anton decides in this conversation. Start with
   the first step the plan names; don't do the whole migration.

## Local run (Windows PC only)

- Repo: `C:\Claude 1\ecom-repo` (ignore `C:\Claude 1\ecom`, an old stub).
  Stores: clone them next to it.
- `git fetch origin && git checkout main && git pull` first.
- If `pnpm` is not on PATH, prepend `C:\Users\anton\.local\bin` or use
  `corepack pnpm`.
- Before running vitest: `$env:GIT_CONFIG_COUNT='1'; $env:GIT_CONFIG_KEY_0='core.autocrlf'; $env:GIT_CONFIG_VALUE_0='false'`.
- There is no Docker or MySQL on the PC, so integration tests skip; CI (MySQL
  8) is the integration check. One environment failure is known: the symlink
  test in `tests/unit/bootstrap-into-repo.test.ts` (EPERM). Report it, don't
  fix it.
- The repo commits CRLF; don't convert line endings.

## Report at the end

For each task:
- the PR link and whether it was merged;
- what ran (PASS/FAIL);
- what is waiting on Anton, as a numbered list of exact actions (where to
  click, what value to use).
