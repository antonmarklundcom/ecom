# Phase O22 — land the foundation. Opus 5.5 session. Sequential, first phase.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.1 and the phase table, and in
  `fable/REVIEW-2026-11-10.md` the sections "Per-PR table", "Merge order and conflicts" and "How this
  was tested". They live on `origin/fable/review-2026-11-10` until step 1 merges them.
  Execute under the autonomy protocol §4. Do not re-review or re-merge the nine PRs.
- Owns: branch `phase/o22-land-foundation`; `src/domain/receipts.ts`, `src/domain/admin-customers.ts`
  (line 176), `package.json` (`start` scripts), `tests/unit/start-guard.test.ts` (platform skip only),
  `DEPLOY.md`, `docs/ENV-OPCIONAL.md`, `docs/decisions/0001-hosting.md`, `CLAUDE.md`, `CHANGELOG.md`,
  `docs/log/o22.md`, tests for F1. Budget: one session, about 90 minutes.
### Steps
1. `git fetch --all`; `git switch -c phase/o22-land-foundation origin/foundation/integracion`;
   `git merge origin/fable/review-2026-11-10` (adds `fable/` files only).
2. Start MySQL 8 as the review describes; run the gate once first. Expect exactly the 7 failures the
   review lists for row "integration" (F1 + six `start-guard` tests on Windows). Anything else: stop and look.
3. F1: `holdStockForReview` (`src/domain/receipts.ts:204-213`) reads the first-receipt time through
   the column decoder or keeps it in SQL. Same check for `admin-customers.ts:176`.
4. F2: `"start": "next start"`, `"start:guard": "node scripts/start.mjs"`; docs say the guard is
   opt-in until O27. Keep `apagado-ordenado.ts` and the Cloudflare preflight untouched. The six
   guard tests that fail on Windows pass there or skip on `win32` only.
5. F8: `docs/decisions/0001-hosting.md:62` CDN sentence. `CLAUDE.md` points at this plan.
6. Full gate §4.2 plus Playwright. ONE PR to `main`, body ≤ 25 lines listing #158–#166. Merge it
   with a **merge commit** (never squash).
### Exit (all checkable)
- typecheck, lint, `pnpm test`, build: 0 failed on MySQL 8 with the PC in America/Asuncion AND with
  `TZ=UTC`. Playwright green. `pnpm db:generate` leaves `drizzle/` unchanged (last: `0025_dear_arachne`).
- `gh pr list --state open` shows none of #158–#166; #157 closed with a one-line comment.
- `docs/log/o22.md` has the commit SHA and test counts; plan §9 has the index line.
- No tag pushed, no workflow enabled, no store repo touched.
## After this phase
Plan §4.10. Next: `fable/prompts/opus-23-factory-proof.md`, model Opus 5.5. Never use Fable.
