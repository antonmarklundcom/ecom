# Phase C1 — the data contract. Opus 5.5 session (`claude-opus-5-5`). Alone, after C0. Merges itself.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2, §4, §5.1, §5.2–§5.9 (to know who will use
  each table); `docs/log/c0.md`, `docs/decisions/**`, `CLAUDE.md`. In `ecom`: `src/db/schema.ts`
  whole, ARCH.md, `src/domain/backup-format.ts`, `src/domain/store-settings-schema.ts`,
  `src/lib/money.ts`, `src/lib/py.ts`, `docs/log/o33.md`, `docs/log/o34.md`.
- Owns: `src/tienda/esquema/**`, `migraciones/**`, `src/flota/esquema/**`, `src/tienda/rpc/**`
  (conventions and base types only), `src/tienda/respaldo/**`, `pruebas/ayudas/**`,
  `src/comun/{dinero,tiempo}.ts`, demo data, `docs/DATOS.md`, `docs/log/c1.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Plan §2.5 is the brief. Every table of `ecom`'s schema gets its SQLite counterpart now, version
  2 tables included, or a line in `docs/DATOS.md` saying why not. Later phases add columns only
  through a new migration and never reshape a table of yours.
- No `store_id`. Foreign keys on. Constraints carry the invariants `ecom` documents (stock never
  negative, one default variant, unique slugs) so a bug in a later phase fails at the database.
- RPC conventions: inputs validated inside the object, results are plain data with a typed
  ok/error shape, never a raw row and never a secret. Write the two example methods later phases
  copy (one read, one write with the content-version bump) and the test pattern for each.
- The export is a documented, versioned format that restores into a **different** store id.
- Money and time helpers are ported with their tests from `ecom`.
### Exit
- Plan §5.1 "Exit", every line.
- Migrations: from empty, twice in a row, and from C0's schema; all in the Workers runtime.
- Local gate and CI green; PR merged by you with a merge commit; gate re-run once on `main`.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
