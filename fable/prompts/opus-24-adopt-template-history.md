# Phase O24 — a store adopts the template's migration history. Opus 5.5 session. Sequential, after O23.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.6, the phase table and §9,
  `docs/log/o23.md`, `fable/REVIEW-2026-11-10.md` finding F13, `scripts/template-migrations.ts`,
  `scripts/migrate.ts`, NEW-STORE.md § "Migraciones propias de una tienda", and
  `fable/harness-tiendas/` (scripts only). Execute under the autonomy protocol §4.
- Owns: `scripts/template-adoptar-historial.ts` (new), `scripts/template-migrations.ts`, their tests,
  `package.json` (one script), `fable/harness-tiendas/**`, NEW-STORE.md (that section), `docs/log/o24.md`.
- Hard limits: local, disposable databases only. Never connect to a real store's database or push to
  a real store repo; reading their `drizzle/` folders with `gh api` for the real shapes is all.
### Rules
- Branch `phase/o24-adopt-history` off latest `main`. This is schema-history work: every behaviour
  starts from a failing integration test against MySQL 8.
- Harness store "Oeste": baseline `f9979ce`, plus two store-made migrations that duplicate template
  changes under the template's numbers (the shape of mascota's `0011_tiny_may_parker` and
  `0012_old_puppet_master`), plus one genuinely store-only column.
- `pnpm template:adoptar-historial` runs in the store, dry-run by default. Per template migration it
  decides from the live schema: already there (mark applied) / not there (stays pending for
  `db:migrate`) / there but different (refuse). Also refuses without a backup from the last hour.
- `--aplicar`: replace the store's `drizzle/` with the template's, write ONE new store migration
  (numbered after the template's last) holding the store-only objects, and rewrite the
  `__drizzle_migrations` rows, all in one transaction. Re-running it is a no-op.
### Exit
- Oeste: dry-run report correct; after `--aplicar` the data fingerprint (`snapshot.py`) is identical,
  `pnpm db:check` is clean, `template:sync` to `main` completes, `verify_store.sh` is green.
- A store whose live schema differs from the template's is refused with the exact differences, and
  nothing is written (integration test). An interrupted run leaves the store as it was (test).
- NEW-STORE.md has the runbook and the rule "a store never runs `db:generate` to port a template fix".
- Full gate §4.2 green; PR merged with a merge commit; `docs/log/o24.md` committed.
## After this phase
Plan §4.10. Next: `fable/prompts/opus-28-distribution-at-scale.md`, Opus 5.5. Never use Fable.
