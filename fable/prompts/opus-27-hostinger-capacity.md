# Phase O27 — Hostinger capacity, measured. Opus 5.5 session. Needs Anton's inputs first.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §5.3, §7, the phase table and §9,
  `docs/log/o22.md`, `fable/REVIEW-2026-11-10.md` § "Hundreds of stores", `DEPLOY.md` § "Procesos que
  se apilan" and §5, `docs/decisions/0001-hosting.md`. Load skill `nextjs-deploy-hostinger`.
- Start condition: plan §7 items 2 and 3 answered in `docs/decisions-needed.md` (which store, which
  plan, SSH access). If not: write the question there, commit, push, end (§4.4).
- Owns: `docs/decisions/0002-capacity.md` (new), `DEPLOY.md`, `scripts/preflight.ts`,
  `src/domain/preflight-*.ts`, `scripts/start.mjs`, `scripts/start-guard.mjs`, `package.json`
  (`start*` scripts), `docs/ENV-OPCIONAL.md`, their tests, `docs/log/o27.md`.
- Production is READ-ONLY: `ps`, `ls`, `/proc`, logs. No redeploy, kill, env change, hPanel click or
  DNS change. If a measurement needs one, ask (§4.4).
### Measure on the live store over SSH; put the raw output in the phase log
- threads, processes and RSS of the app: `ps -u "$USER" -L -o pid,ppid,nlwp,rss,etime,args`;
- whether `www.<domain>` and the apex each run their own process;
- the exact start command hPanel runs (is it the `start` script?);
- plan totals against NPROC and RAM (hPanel → Resource Usage, read out by Anton).
### Exit
- `docs/decisions/0002-capacity.md`: measured threads and RSS per store; stores per Cloud plan by
  NPROC, by RAM and by the 10-app cap; the `www` rule; each number with the command behind it.
- Start guard decided with evidence (removed, opt-in, or in-process); code, tests and `DEPLOY.md`
  agree, and Hostinger's guidance against child processes is addressed.
- `pnpm preflight` warns when apex and `www` both resolve to the app; a unit test covers it.
- `DEPLOY.md` has "Cuántas tiendas por plan" with measured numbers instead of "~200".
- Full gate §4.2 green; PR merged with a merge commit; `docs/log/o27.md` committed.
## After this phase
Plan §4.10. No automatic next phase: report the numbers and what they mean for review Q5.
Never use Fable.
