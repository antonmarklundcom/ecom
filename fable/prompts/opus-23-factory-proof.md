# Phase O23 — factory proof and first release candidate. Opus 5.5 session. Sequential, after O22.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.2, the phase table and §9,
  `docs/log/o22.md`, `fable/HANDOFF-2026-10-07.md` §3 and §5, `docs/TEMPLATE-INHERITANCE.md`, and
  NEW-STORE.md § "Migraciones propias de una tienda". Execute under the autonomy protocol §4.
- Owns: `fable/harness-tiendas/**`, `scripts/template-shared.ts`, `scripts/template-sync.ts`,
  the template tests it reclassifies or rewrites,
  `docs/TEMPLATE-INHERITANCE.md`, `NEW-STORE.md`, `CHANGELOG.md`, `docs/log/o23.md`.
### Rules
- Branch `phase/o23-factory-proof` off latest `main`. Stores and databases are local and
  disposable; never touch a real store repo (lenceria, mascota, anillos, productos, productos.new).
- Recreate Norte and Sur from `45f4336` (`mk_store.sh`, `populate_t0.sh`); sync both to current
  `main` the way `distribuir.yml` does (`--sin-tests --json --rama-destino template/sync`).
- Every fix starts from a failing test. A template test that renders skin must not fail a store that
  redesigned it: settle the policy once. Photo migration script: dry-run only. No tag, no workflows.
### Exit
- Norte: sync `completado`; `verify_store.sh` green (install, typecheck, lint, suite, `db:migrate`
  with an identical table fingerprint, `db:check`, `preflight`, build, Playwright).
- Sur: sync stops at the migration guard; after NEW-STORE.md case 1 it completes, and
  `product_images.provenance` and `customers.loyalty_note` both exist; `verify_store.sh` green.
- A test proves that a store with a redesigned `product-card.tsx` and a hand-written colour class
  passes the template's suite after sync (covers `piel-sin-colores.test.ts` from #163).
- Backup → restore into an empty database: identical `snapshot.py` fingerprint; restore refuses a
  backup from another migration. `pnpm template:probar-tienda` green. A clean clone builds and
  starts with only the five `.env.example` variables and `GET /api/health` reports every check.
- `CHANGELOG.md` version entry "Migración: sí (0025)"; NEW-STORE.md has the Cloudinary → R2 runbook;
  `docs/decisions-needed.md` has the tag command. Gate §4.2 green on `main`; `docs/log/o23.md` committed.
## After this phase
Plan §4.10. Next: `fable/prompts/opus-24-adopt-template-history.md`, Opus 5.5. Never use Fable.
