# Phase O28 — distribution that survives 100+ stores. Opus 5.5 session. Sequential, after O24.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.4, the phase table and §9,
  `docs/log/o24.md`, `.github/workflows/distribuir.yml`, `scripts/ci/armar-pr-tiendas.mjs`,
  `scripts/ensayar-distribucion.ts`, `scripts/template-shared.ts`, `tiendas.json`, and NEW-STORE.md
  § "La distribución automática del template". Load skill `budgeted-runner-deploy`.
- Owns: `.github/workflows/distribuir.yml`, `tiendas.json`, `scripts/ci/**`,
  `scripts/ensayar-distribucion.ts`, `scripts/template-atraso.ts` (new), their tests, NEW-STORE.md
  (that section only), `package.json` (one script entry), `CHANGELOG.md`, `docs/log/o28.md`.
### Rules
- Branch `phase/o28-distribution` off latest `main`. Never dispatch `distribuir.yml`, never push
  a tag, never open a PR in a store. Proof = `pnpm template:ensayar-distribucion` plus unit tests
  that evaluate the workflow's real `if:` and matrix expressions (as `tests/unit/ci-minutos.test.ts`).
- `tiendas.json` entries gain `anillo` (0 canary, 1 rest) and `estado` (`activa` | `pausada`); the
  reader stays backward compatible. Apply review Q4's answer from `docs/decisions-needed.md`; if
  unanswered, mark `antonmarklundcom/productos` `pausada` and log it.
- A tag distributes to ring 0 only; ring 1 needs a manual dispatch naming the tag.
- Chunk the matrix under GitHub's 256-job cap and set `max-parallel`.
- A hand-edited `template/sync` branch, or a sync PR older than two releases, fails that store's
  job (today a warning and a green job: `scripts/ci/armar-pr-tiendas.mjs:145-151`).
### Exit
- `pnpm template:atraso` prints one row per store: baseline SHA, commits behind, sync PR age.
- Unit tests: ring selection; chunking at 0, 1, 256 and 300 stores; the stale-branch failure.
- `pnpm template:ensayar-distribucion` green against the two harness stores from O23.
- `docs/decisions-needed.md` has GitHub App vs fine-grained PAT with exact permissions and a
  recommendation. Nothing created on GitHub.
- Full gate §4.2 green; PR merged with a merge commit; `docs/log/o28.md` committed.
## After this phase
Plan §4.10. Next: `fable/prompts/sonnet-29-new-store-speed.md`, Sonnet 5.5. Never use Fable.
