# Phase E7 — design of "one process, many stores". Fable 5.2, in a conversation Anton opens.
This is the one phase of `fable/plan-100-tiendas.md` not run by Opus (plan §1.2 decision 5). It is
never started with `create_session`, as a subagent or by a schedule: Anton opens the window and
pastes: `Read fable/prompts/e7-diseno-multi-tienda.md in this repo and execute it.`
- Read: this file; `fable/plan-100-tiendas.md` §1, §2.2, §4, §5.7, §5.8; `CLAUDE.md`; ARCH.md;
  `docs/decisions/0001-hosting.md` and `0002-flota.md` if it exists; `src/db/index.ts`,
  `src/proxy.ts`, `src/lib/vidriera-cache.ts`, `src/lib/site-url.ts`, `src/lib/integraciones.ts`,
  `src/lib/integraciones-store.ts`, `src/lib/rate-limit.ts`, `src/lib/session*.ts`,
  `src/lib/secret-box.ts`, `src/domain/store-settings.ts`, `src/app/api/cron/**`, `next.config.ts`,
  `scripts/start.mjs`, and `docs/log/e1.md` if E1 has merged.
- Owns: `docs/decisions/0003-multi-tienda.md` (new), one proof test and its fixtures under
  `tests/`, `docs/log/e7.md`. No change to code that ships.
### Work
1. For each of the seven requirements of plan §2.2, try the candidate mechanisms on a throwaway
   branch against the real framework version, not from memory: where the store is chosen (the
   proxy, a custom server, the layout), how that choice reaches `db`, the definition, the public
   URL and the secrets without passing an argument through the domain, how the three cached routes
   and the data cache are kept apart per store, what happens to process-wide memory, how cron fans
   out. Record what was run and what it showed.
2. Write the record: the mechanism chosen per requirement, the ones rejected with the experiment
   that rejected them, the build order for E8, the files E8 may not touch, the failure modes that
   need a test (two stores under concurrent load, a forged host header, revalidation, a store
   whose database is down, an unknown host), and what changes for an own store (nothing).
3. Commit one proof test, "dos tiendas, un proceso": two databases, two definitions, one running
   app, assertions for requirements 1–3 and 6. It fails on `main` and is skipped by default
   behind a flag E8 removes.
4. Write the prompt for E8 (`fable/prompts/e8-modo-flota.md`) from the record.
### Rules
- A database per store; no `store_id` column (plan §1.2 decision 2). Single-store mode unchanged.
- Decide by experiment. Where an experiment was not possible, say so and give E8 the check to run
  first.
- Do not implement fleet mode. Do not supervise E8. One PR (docs and the skipped test), opened and
  merged in this conversation when Anton says so.
