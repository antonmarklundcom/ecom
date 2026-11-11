# Decisions needed (Anton)

Open items a phase could not decide alone (plan §4.4). Newest first. Close an
item by deleting it in the PR that acts on it.

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
repo in `tiendas.json` (today `productos`, `lenceria`, `mascota`) it clones the store
with `secrets.TIENDAS_TOKEN`, runs `template:sync --commitear-conflictos` and opens
or updates a `template/sync` PR there (draft if it conflicted). A store whose sync
stops at a precondition (migration guard) fails its matrix job and gets no PR.

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
