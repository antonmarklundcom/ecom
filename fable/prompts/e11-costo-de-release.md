# Phase E11 — the cost of a release. Opus 5.5 session (`claude-opus-5-5`). Wave 1.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §3.1, §4, §5.11; `fable/plan-trafico.md` §4;
  `CLAUDE.md`; `docs/log/o28.md`; `docs/decisions-needed.md` items 3 and 4;
  `.github/workflows/*.yml`; `scripts/ci/**`, `scripts/ensayar-distribucion.ts`,
  `scripts/template-atraso.ts`; `tests/unit/ci-minutos.test.ts`, `tests/unit/distribuir.test.ts`;
  NEW-STORE.md § "La distribución automática del template". Load the skill
  `budgeted-runner-deploy` if the session has it.
- Owns: `.github/workflows/**`, `scripts/ci/**`, `scripts/ensayar-distribucion.ts`, their tests,
  NEW-STORE.md (that section), `docs/decisions-needed.md` (item 4 updated), `CHANGELOG.md`,
  `docs/log/e11.md`.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- Never dispatch `distribuir.yml`, never push a tag, never open a PR in a real store, never
  create anything on GitHub. Proof is `pnpm template:ensayar-distribucion` and unit tests that
  evaluate the workflows' real `if:` and matrix expressions, as `ci-minutos.test.ts` does.
- A sync PR (`template/sync`) in a store runs install, typecheck, lint and unit tests. The e2e and
  the MariaDB run happen on the canary store (ring 0) only, and on any store by label.
- A store with no custom code (after E1: nothing outside its definition folder differs from the
  template) may auto-merge its sync PR when green; a store with custom code never does. The check
  that tells them apart is a script with tests, not a setting someone remembers.
- The workflow reads the GitHub App's id and key if present and falls back to the token; with
  neither it distributes to nobody and says so. Creating the App is Anton's.
- Write down the minutes: per sync PR in a store before and after, and per release at 10 own
  stores, computed from the jobs' measured durations in this repo's recent runs (cite the runs).
### Exit
- The numbers above in `docs/log/e11.md`; tests for the auto-merge check and the ring rule.
- Gate green locally and on GitHub on the PR's last commit. Do not merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
