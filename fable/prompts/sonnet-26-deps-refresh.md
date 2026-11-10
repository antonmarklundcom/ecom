# Phase S26 — dependency refresh (replaces #157). Sonnet 5.5 session (safe for Sonnet). Parallel with S25, S30.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §6.2, the phase table and §9,
  `docs/log/o22.md`, `KNOWN-ISSUES.md` (the eslint 10 and typescript 7 entries) and the comments in
  `pnpm-workspace.yaml`. Execute under the autonomy protocol §4.
- Owns: `package.json` (dependency versions only), `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  (overrides only), `KNOWN-ISSUES.md` (dependency entries), `CHANGELOG.md`, `docs/log/s26.md`.
- Hard limits (§4.7): no source change to make a bump compile. A bump that needs one is reverted
  and logged.
### Rules
- Branch `phase/s26-deps` off latest `main`.
- Package list from closed PR #157 (25 minor/patch bumps: next, react, react-dom, radix,
  drizzle-orm, mysql2, zod, zustand, react-hook-form, lucide-react, vitest, playwright, tsx…).
  Minor and patch only. `eslint` stays on 9 and `typescript` on 5.9 (KNOWN-ISSUES).
- `cloudinary` must not come back. Keep the `packageManager` pin; if pnpm itself moves, keep
  `allowBuilds` and `onlyBuiltDependencies` in step.
- `lucide-react` jumps many minors: check every imported icon still exists.
### Exit
- `pnpm install --frozen-lockfile` clean; `pnpm audit --prod` shows no new high or critical.
- Full gate §4.2 green AND Playwright green (this phase moves next, react and radix).
- `tests/e2e/presupuesto.spec.ts` passes without raising a ceiling.
- PR merged with a merge commit. `docs/log/s26.md` lists every package that moved and every bump
  reverted, with the reason; plan §9 has the index line.
## After this phase
Plan §4.10. Spawn nothing; end with the phase report. Never use Fable.
