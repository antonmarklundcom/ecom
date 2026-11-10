# Phase S29 — faster new store. Sonnet 5.5 session (safe for Sonnet). Sequential, after O28.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §6.3, the phase table and §9,
  `docs/log/o28.md`, NEW-STORE.md "En una página" and §1–§4, `scripts/nueva-tienda.ts`, and
  `fable/REVIEW-2026-11-10.md` § "New-store time". Execute under the autonomy protocol §4.
- Owns: `scripts/nueva-tienda.ts`, `scripts/registrar-tienda.ts` (new), their unit tests,
  `package.json` (one script entry), NEW-STORE.md ("En una página" and §1), `CHANGELOG.md`,
  `docs/log/s29.md`.
- Hard limits (§4.7): no machinery (`src/domain/**`, `src/app/actions/**`, `src/db/**`, `drizzle/**`,
  checkout, auth, cron routes). No call to Hostinger, Cloudflare or any paid service. Tests create
  nothing on GitHub: `gh` is mocked.
### Rules
- Branch `phase/s29-new-store` off latest `main`. Both commands support `--dry-run`.
- `pnpm nueva-tienda --crear-repo <owner/name>`: `gh repo create --template antonmarklundcom/ecom`,
  clone, add the `template` remote, create the `ci-completo` label, then the existing wizard.
  Visibility follows review Q6's answer in `docs/decisions-needed.md`; default private.
- `pnpm registrar-tienda <owner/name>` (run in the template): opens the PR that adds the store to
  `tiendas.json` with `anillo` and `estado`, and prints the one manual step left (token access).
- The wizard writes a git-ignored `HOSTINGER-CHECKLIST.md` in the store: the hPanel clicks in
  order with this store's real values (database name, the five env keys, three cron lines with
  its domain). No secret values: it names the `.env.local` key to copy.
### Exit
- Unit tests: the repo-creation command line, label, remote, registration PR body, checklist
  content for a sample store, and that no secret value reaches the checklist.
- NEW-STORE.md "En una página" matches the new commands and is shorter than before.
- `pnpm template:probar-tienda` green; full gate §4.2 green; PR merged with a merge commit.
- `docs/log/s29.md` lists the manual steps that remain and an honest time estimate.
## After this phase
Last ecom phase: spawn nothing. STOP with the closing report (what merged per phase, what is
still manual for a new store, open items in `docs/decisions-needed.md`). Never use Fable.
