# Decisions needed (Anton)

Open items a phase could not decide alone (plan §4.4). Newest first. Close an
item by deleting it in the PR that acts on it.

## Answered

- Q1: GitHub Actions switched back on for ecom (2026-11-11).
- Q2: tag v2.0.0: yes (item 1).
- Q3 / O31: go, productos.com.py moves back onto the template (plan §5.5); start conditions for O31 otherwise unchanged.
- Q4: `tiendas.json` loses the old `antonmarklundcom/productos` entry (unused repo; the live productos.com.py returns as a new repo in O31), gains `antonmarklundcom/anillos` paused; lenceria and mascota stay paused (2026-11-11). The GitHub repo is not deleted or archived.

## 4. Distribution token: GitHub App or fine-grained PAT (O28, 2026-11-11 — plan §5.4 item 5)

`distribuir.yml` needs one credential (`secrets.TIENDAS_TOKEN` today) that can clone each
store, push `template/sync` (it carries `.github/workflows/*`) and open/edit the PR.
`GITHUB_TOKEN` cannot: it only reaches its own repo. Nothing has been created.

| | Fine-grained PAT (today) | GitHub App (recommended past ~10 stores) |
|---|---|---|
| Repository permissions | Contents: Read and write; Pull requests: Read and write; Workflows: Read and write; Metadata: Read (automatic); Issues: Read and write (optional, only to create the `ci-completo` label) | the same five, set on the App |
| Account permissions | none | none |
| Which repos | a hand-kept list in the token (or "All repositories", i.e. every repo you own, not only stores) | the installation: "Only select repositories" (one click per new store, no secret change), or "All repositories" of a dedicated stores org |
| Lifetime | up to a year, then every store fails at "no pude clonarla" until you rotate it | private key does not expire; each job mints a token that lives 1 hour |
| Tied to | your user account (PRs show as you) | a bot identity (`<app>[bot]`) |
| API rate limit | 5,000 requests/h shared with everything else you do | per installation, grows with the number of repos (up to 12,500/h) |
| Triggers the store's CI on push/PR | yes | yes |

**Recommendation: a GitHub App**, owned by `antonmarklundcom`, with exactly the repository
permissions above, no webhook, installed on "Only select repositories" = the stores in
`tiendas.json`. If the store count passes ~50, move the stores to their own org and install
the App on all of that org's repos (adding a store is then zero steps). The workflow change
when you create it (not done, nothing on GitHub yet): repo variable `TIENDAS_APP_ID`, secret
`TIENDAS_APP_PRIVATE_KEY`, and in the `distribuir` job one step
`actions/create-github-app-token` (with `owner: antonmarklundcom`) whose output replaces
`secrets.TIENDAS_TOKEN` as `TIENDAS_TOKEN`; `preparar` checks the key instead of the token.
A per-job token is why the App fits the batched matrix: a lote never runs near an hour.
Until then the fine-grained PAT works as NEW-STORE.md describes.

## 3. Stores paused in `tiendas.json` (O28, 2026-11-11 — review Q4 and F13)

Q4 is answered (2026-11-11). All three listed stores are
`"estado": "pausada"`: no tag and no manual run sends them anything.

| Store | Ring | Why paused |
|---|---|---|
| `antonmarklundcom/lenceria` | 0 (canary) | its own migrations collide with the template's (F13); the sync would stop at the migration guard until it adopts the template's history (O24's tool, run with your approval; item 2: refused by that tool today until a manual schema step) |
| `antonmarklundcom/mascota` | 1 | same (F13; item 2 applies too), and its first sync conflicts in `admin-products.ts` |
| `antonmarklundcom/anillos` | 1 | not adopted the template's history yet (O24, F13); its migrations were not checked in detail |

The old `productos` entry was removed (Q4).
**To activate a store**, after it adopted the template's history: in a PR to `main`, change
its line `"estado": "pausada"` to `"estado": "activa"`. Check first with
`pnpm template:ensayar-distribucion --repo <owner/store>` and see where it stands with
`pnpm template:atraso`. Activating a store stays your call, store by store.

## 2. mascota and lenceria cannot adopt the template's migration history as they are (O24, 2026-11-11)

`pnpm template:adoptar-historial` (O24) decides from the live schema. It was
proven on the harness store Oeste. The real stores are a different shape: both
mascota (`0011_tiny_may_parker`, `0012_old_puppet_master`) and lenceria
(`0017_bent_robin_chapel`, `0018_foamy_ezekiel`) added **two pieces of template
`0018_worthless_rage`** by hand: `login_tokens.attempts` (identical) and
`customers.session_version` with **DEFAULT 0** (the template has DEFAULT 1).
They do not have the rest of 0018 (`users.session_version`, dropping index
`login_tokens_hash_uq`, the `UPDATE` that invalidates open login tokens), nor
the template migrations between their baseline and 0018. The tool therefore
refuses both, by design (the O24 integration test "Mascota" uses exactly
mascota's two files). It never ran against their databases: their `drizzle/`
was read with `gh api`, nothing else.

What it needs, per store, in a maintenance window, after a backup, tried first
on a restored copy:
1. Bring the live schema to a point the template explains: apply the missing
   template migrations before 0018 by hand, then finish 0018 (drop the index,
   add `users.session_version`, run its `UPDATE`) and
   `ALTER TABLE customers ALTER session_version SET DEFAULT 1` (only the
   default changes; existing values stay, so no session is invalidated).
2. Then `template:adoptar-historial` → `--aplicar` → sync (NEW-STORE.md runbook).

**Recommendation:** do lenceria first (more active), as a small reviewed
script per store. Not automated on purpose: it is DDL on a production database,
which O24 never does. anillos and productos.new were not checked in detail.

## 1. First release tag: v2.0.0 (decided 2026-11-11)

Decided by Anton on 2026-11-11: tag `v2.0.0` goes on the merge commit of the
release-notes PR (or a later `main`), pushed by the manager and nobody else.
The CHANGELOG heading is already `v2.0.0 — 2026-11-11` (Migración: sí, `0014`–`0025`).

**Never tag a commit older than O28's merge**: a tag push runs `distribuir.yml` and its
scripts as they are in the tagged commit, and before O28 that workflow has no rings and
no pause, so it would send the version to every store in that commit's `tiendas.json`.

**What it triggers today**: `distribuir.yml` runs, but every store in `tiendas.json` is
`"estado": "pausada"` (item 3), so the run picks zero stores. No `TIENDAS_TOKEN` is set
(item 4), so it could not clone a store anyway.
