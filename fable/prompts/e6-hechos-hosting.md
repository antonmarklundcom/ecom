# Phase E6 — hosting facts and options. Opus 5.5 session (`claude-opus-5-5`). Wave 1. No code.
- Start only if the brief carries Anton's inputs 1–2 of `fable/plan-100-tiendas.md` §7. Without
  SSH, do the parts that need none, mark every measured row "pendiente" and say so in the report.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.2, §3.1, §5.6, §8; `fable/plan-2026-11.md`
  §5.3 and §8 Q5; `docs/decisions/0001-hosting.md`; DEPLOY.md; `docs/log/o22.md` (the start guard);
  `scripts/start.mjs`, `scripts/start-guard.mjs`.
- Owns: `docs/decisions/0002-flota.md` (new), DEPLOY.md (a "cuántas tiendas por plan" section),
  `docs/log/e6.md`. Nothing else.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- Read-only on production: `ps`, `free`, `ulimit`, reading the app's start command and logs.
  Nothing is installed, restarted, redeployed or changed in hPanel, DNS or a database.
- Every number in the record has its source next to it: the command and its output, a Hostinger
  help page with its URL and the date read, or "Anton, hPanel, <date>". No number from memory.
  A fact that could not be established is a row that says so.
- Questions the record must answer: memory and process count of one live store, idle and under a
  small load; the plan's limits (Node apps, databases, connections per database user, processes,
  memory, inodes); whether more than one domain can reach ONE Node app with the host name intact
  and its own certificate, how many, and how they are added; whether cron can call one URL per
  plan instead of three per store; the same questions for a VPS; monthly price of each shape at
  10, 30 and 100 stores from published prices.
- Three options side by side with what each costs in money, in Anton's hours per store, and in
  risk: (a) fleet app on Hostinger with added domains, (b) fleet app on a VPS, (c) one app per
  store with a shorter checklist. One recommendation with its reason. The decision is Anton's.
- Also settle what O27 left open: keep, drop or move in-process the start guard, from what was
  measured.
### Exit
- `docs/decisions/0002-flota.md` with every question answered or marked unanswerable and why.
- PR open and green (docs only); `docs/log/e6.md` on the branch. Do not merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
