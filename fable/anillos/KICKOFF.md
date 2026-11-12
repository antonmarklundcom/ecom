# Kickoff prompt — anillos.tienda (paste into a new Fable 5.2 session)

How to use: open a new session in the Claude desktop app on Fable 5.2, with no folder or with
`C:\dev\ecom`, and paste everything below the line. Written 2026-11-11; the repo wins over this text.

---

You are the manager for rebuilding my store anillos.com.py as a new repo,
`antonmarklundcom/anillos.tienda`, from my store template `antonmarklundcom/ecom` (checkout
`C:\dev\ecom`). I opened this chat on Fable 5.2 on purpose: you plan, check, decide and report. Every
build step runs on Opus 5.5 (`claude-opus-5-5`) or Sonnet 5.5 (`claude-sonnet-5-5`), as a session or a
subagent with the model set explicitly. Never start anything on Fable.

Read first, on `origin/main` of ecom: `fable/anillos/plan-anillos-tienda.md` (all of it),
`fable/anillos/INVENTORY-2026-11-11.md` (sections 0, 4, 6, 7, 8), the five files in
`fable/anillos/prompts/`, `fable/plan-2026-11.md` §4, `CLAUDE.md`, NEW-STORE.md "En una página" and §5,
`docs/decisions-needed.md`. Then `C:\operation manuals\anillos\README.md`. Check the real state
yourself; the repo wins over this text:
- `gh pr list -R antonmarklundcom/ecom --state all --limit 10`, the latest tag, and that the newest
  runs of both workflows on ecom `main` are green (`gh run list -R antonmarklundcom/ecom --limit 6`):
  CI and "Tests en MariaDB".
- Whether `antonmarklundcom/anillos.tienda` already exists (`gh repo view`). On 2026-11-11 it did not.
- Whether MySQL listens on port 3317; if not, start it with the command in
  `fable/REVIEW-2026-11-10.md`, section "How this was tested". If `C:\dev\tools\mysql` is gone, tell me.

State on 11 Nov 2026:
- The template is released as v2.0.0. The old store repo `antonmarklundcom/anillos` is live on
  anillos.com.py, was made from the template as of 5 October and has a lot of its own code. It has no
  real orders. Nothing of the rebuild exists yet: no repo, no Hostinger app, no bucket.
- The old checkout `C:\Projects\anillos` is a junction to my external drive, which may be unplugged.
  The phases read the old store from a fresh read-only clone of the public repo instead.

What I want, in this order:
1. Ask me the decisions D1 to D9 of the plan's section 3, one at a time, each with your
   recommendation, and the inputs of section 4. Do not start AN1 before D1, D2, D3, D4, D5 and D8 are
   answered. Write my answers into the plan (a small docs PR in ecom) before the build starts.
2. AN1 on Opus 5.5. When it is merged and you have verified it: AN2 (Sonnet 5.5) and AN3 (Opus 5.5)
   at the same time. Then AN4 (Opus 5.5), then AN5 (Sonnet 5.5). Each session gets the prompt
   `Read fable/anillos/prompts/<file>.md in C:\dev\ecom and execute it.` plus a short brief with my
   answers, the paths it needs and the rules below. Start sessions in the same turn as one of my
   messages: the app refuses to start sessions on automated turns; if it refuses, use subagents on
   the same model.
3. If AN3 writes upstream requests for the template (plan section 6, T1), show them to me with your
   recommendation. A template change is its own small PR in ecom with the full gate and both
   workflows green, and I decide whether it ships as a new version.
4. At the end: the closing list from AN5, the cutover checklist, what was left behind, what I must
   do by hand and how long you estimate it takes. Do not run the cutover.

Rules:
- At most 3 build sessions at once. After starting a session, check that it really runs on the model
  you set. Tell each one that nobody answers permission prompts unless I am here, and that it must
  not start other phases.
- A phase is done only when its PR is merged with a merge commit, its local gate is green with real
  numbers, and the store's GitHub checks are green, including "Tests en MariaDB". Verify merges and
  check results yourself; a session's report is not proof. Hostinger runs MariaDB: on 11 November the
  template was tagged after only the MySQL workflow had run, and the MariaDB one turned out red.
- One session uses MySQL at a time: each phase waits for the previous one's `DONE.md` in
  `C:\dev\anillos-wt\an<N>-carryover\` before it runs its gate.
- The store never edits machinery (`src/domain`, `src/lib`, `src/app/actions`, `src/db`, `drizzle`,
  checkout, auth, cron) and makes no migration of its own. Never copy those folders from the old
  store.
- Any test or script that runs git in a temp folder clears every `GIT_*` variable first.
- No tracked file in ecom may contain the name of the removed image provider (guard test
  `tests/unit/sin-proveedor-viejo.test.ts`); that includes logs and PR text.
- Never invent facts about the products or the business: write `[COMPLETAR]` and list it for me.
- Work on C: only (`C:\Projects\anillos.tienda`, worktrees next to it). Nothing is built on E:.
- No push, PR or change in the old repo `antonmarklundcom/anillos`. No DNS, Hostinger, Cloudflare or
  live database, no tag, no paid service and no image generation, unless I say so in this chat.
- Keep me posted in short status messages: what merged, test counts, what you need from me. For long
  unattended stretches, a short check-in about every 45 minutes, with a maximum number of rounds.
- At the end, update `C:\operation manuals\anillos\README.md` and the build log index in the plan.
