# Phase C6 — the fleet. Opus 5.5 session (`claude-opus-5-5`). After C3; beside C7.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2 (§2.4, §2.8 closely), §4, §5.6;
  `docs/log/c0.md`, `c1.md`, `c3.md`, `docs/DATOS.md`, `CLAUDE.md`. In `ecom`:
  `fable/plan-100-tiendas.md` §5.9–§5.10, `src/app/api/cron/**`, `src/domain/job-runs.ts`,
  `src/domain/backup.ts`, `restore-backup.ts`, `src/app/api/health/**`.
- Owns: `src/flota/**`, `src/app/(flota)/**`, `src/cron/**`, `herramientas/flota/**`, the
  redirect of non-primary domains in the Worker entry, their tests, `docs/log/c6.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- The fleet panel answers only on the fleet host. On a store's domain its routes do not exist.
- Fleet users are not store users. Login needs a second factor (TOTP). The hand-off into a store
  is a signed, single-use token that lives a minute, names the fleet user and the store, and is
  verified by the store object; every action after it is logged in that store with that name.
  Tests: replayed token, token for another store, expired token, forged signature.
- Combined lists (enquiries, leads, health) are read by asking each store; a store that fails or
  is slow shows as such and does not break the page.
- Cron: one trigger; it puts one message per store on the queue; each store's `tick` is
  idempotent and records its run. Nightly export of every store to the private bucket in C1's
  format; `flota:restaurar` into a new store, dry run by default.
- `flota:nueva` creates a store from a definition folder, dry run by default, and can be run
  twice. Deleting a store is not built: a store is paused, never erased by a command.
- No deploy, no DNS: commands that would touch Cloudflare's API only print what Anton would run.
### Exit
- Plan §5.6 "Exit", every line.
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
