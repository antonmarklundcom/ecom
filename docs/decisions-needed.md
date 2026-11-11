# Decisions needed (Anton)

Open items a phase could not decide alone (plan §4.4). Newest first. Close an
item by deleting it in the PR that acts on it.

## 3. Distribution token: GitHub App or fine-grained PAT (O28, 2026-11-11 — plan §5.4 item 5)

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

## 2. Stores paused in `tiendas.json` (O28, 2026-11-11 — review Q4 and F13)

Q4 is unanswered, so O28 applied the fallback. All three listed stores are
`"estado": "pausada"`: no tag and no manual run sends them anything.

| Store | Ring | Why paused |
|---|---|---|
| `antonmarklundcom/lenceria` | 0 (canary) | its own migrations collide with the template's (F13); the sync would stop at the migration guard until it adopts the template's history (O24's tool, run with your approval) |
| `antonmarklundcom/mascota` | 1 | same (F13), and its first sync conflicts in `admin-products.ts` |
| `antonmarklundcom/productos` | 1 | dead store (F4; the review recommends removing it); kept and paused until you confirm |

No store was added (anillos is not listed; the review suggests adding it, paused).
**To activate a store**, after it adopted the template's history: in a PR to `main`, change
its line `"estado": "pausada"` to `"estado": "activa"`. Check first with
`pnpm template:ensayar-distribucion --repo <owner/store>` and see where it stands with
`pnpm template:atraso`. To drop productos, delete its entry.

## 1. First release tag: v2.0.0 (O23, 2026-11-10 — plan §7 item 4, review Q2)

O23 turned `CHANGELOG.md` "Sin publicar" into **v2.0.0 — candidata** (Migración: sí,
`0014`–`0025`; major because every store must set up R2 and migrate its photos by
hand). No phase pushes the tag (plan §1.6). When you decide to publish, on an
up-to-date `main`:

```bash
git fetch origin
git tag -a v2.0.0 <MERGE_SHA> -m "v2.0.0"
git push origin v2.0.0
```

`<MERGE_SHA>` = the O23 merge commit on `main` (in `docs/log/o23.md`), or a later
`main` if more phases have landed (then move the CHANGELOG heading with it).

**What it triggers.** The tag push runs `.github/workflows/distribuir.yml`: for each
active ring-0 (canary) repo in `tiendas.json` it clones the store with
`secrets.TIENDAS_TOKEN`, runs `template:sync --commitear-conflictos` and opens or
updates a `template/sync` PR there (draft if it conflicted). Ring 1 only gets the
version from a manual "Run workflow" naming the tag (O28). Since O28 every listed
store is paused (item 2), so today the tag would distribute to nobody. A store whose
sync stops at a precondition (migration guard) is red in its job and gets no PR.

- **Today it triggers nothing**: GitHub Actions is disabled on `ecom` (review Q1).
  The tag only distributes once Actions is back on, and the job fails without
  `TIENDAS_TOKEN`.
- **Expected result if it ran now**: all three real stores have their own
  migrations or old baselines (review F13), so they would stop at the migration
  guard; `productos` is dead (review Q4). O23 proved only the easy case (case 1:
  a store migration never applied anywhere). The real stores need O24
  (`template:adoptar-historial`) first.

**Recommendation** (review Q2/Q4): before tagging, edit `tiendas.json` to drop
`productos` and keep only stores that already adopted the template's migration
history (lenceria first, after O24 and a backup). Or tag now and run nothing until
then: the tag is harmless while Actions is off.
