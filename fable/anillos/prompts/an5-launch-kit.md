# Phase AN5 — launch kit. Sonnet 5.5 session (safe for Sonnet). Last phase, after AN2, AN3 and AN4.
- Read ONLY: this file; in ecom `fable/anillos/plan-anillos-tienda.md` (all), DEPLOY.md, NEW-STORE.md
  "En una página", §3, §4, §6 and "La distribución automática del template", `tiendas.json`,
  `docs/decisions-needed.md` item 3; in the store `docs/log/an1.md`–`an4.md`,
  `HOSTINGER-CHECKLIST.md` (git-ignored, written by the wizard), `docs/decisions-needed.md`; the
  owner manual `C:\operation manuals\anillos\README.md`. Load skill `project-manual-update`.
- Owns: store repo `docs/CUTOVER.md`, `docs/log/an5.md`, `STATUS.md` if the store has one. In ecom:
  ONE PR that changes only `tiendas.json` (and its test, if it names stores) and adds the plan's §9
  log lines. The owner manual `C:\operation manuals\anillos\README.md` and the register files it
  requires.
- Hard limits: no code under `src/**` in either repo. No Hostinger, hPanel, DNS, Cloudflare or live
  database. No tag, no `gh workflow run`. Nothing in the old repo `antonmarklundcom/anillos`: it is
  not archived, renamed or edited by this phase.
### Rules
- `docs/CUTOVER.md`, in order, each step with who does it and how to check it: freeze edits in the
  old admin; final export; import with AN4's commands; Hostinger Node.js app and database from
  `HOSTINGER-CHECKLIST.md`; the five env variables; `/api/setup/init`; three cron entries; smoke test
  on the temporary URL; `pnpm preflight` (list what it reports and which items are Anton's); switch
  the domain; rollback (switch it back; valid until the first real order in the new database); what
  to archive or delete after 14 quiet days. No secret values anywhere: name the key to copy.
- `pnpm registrar-tienda antonmarklundcom/anillos.tienda --dry-run` first; then the real ecom PR:
  the new store as ring 0 and `pausada`, the old `antonmarklundcom/anillos` entry removed (plan D9).
  Do NOT merge that PR: Anton activates the store himself after the cutover.
- Closing list in `docs/log/an5.md`: what merged per phase, every `[COMPLETAR]`, every upstream
  request from AN3, what was left behind on purpose (D3, D5), an honest estimate of Anton's manual
  time for the cutover.
- Owner manual: dated status block, where the new repo and checkout are, the build and gate
  commands, what is still on the old store, remaining owner actions. No secrets.
### Exit
- Store PR merged with a merge commit; store checks green. Ecom PR open, checks green, not merged.
- `C:\dev\anillos-wt\an5-carryover\DONE.md` written.
## After this phase
Last phase: start nothing. STOP with the closing report. Never use Fable.
