# Decisions needed (Anton)

Open items a phase could not decide alone (plan §4.4). Newest first. Close an
item by deleting it in the PR that acts on it.

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
