# Phase O36 — proof and release v2.1.0. Opus 5.5 session (`claude-opus-5-5`). After O32–O35 are all on `main`. Last template phase.
- Read ONLY: this file; `fable/plan-trafico.md` §1, §4, §5.5 and the phase table;
  `fable/plan-2026-11.md` §1 item 6 and §4; `CLAUDE.md`; `docs/log/o32.md` … `o35.md`;
  `docs/log/o23.md` (how the harness was used); `fable/harness-tiendas/README.md`;
  `docs/decisions-needed.md` item 1 (the tag rule); `CHANGELOG.md`; NEW-STORE.md "En una página".
- Owns: `fable/harness-tiendas/**`, `CHANGELOG.md`, NEW-STORE.md ("En una página" and the sections
  the four phases touched, for consistency only), `docs/decisions-needed.md` (one new item),
  `docs/log/o36.md`. A defect found in O32–O35's code is fixed here in one commit per defect, each
  named in the log.
### Rules
- Branch from the brief, off latest `main`. Gate and reporting: plan §4.
- The harness needs a local database: the MariaDB of plan §4.2. If the container cannot run one,
  stop per plan §4.5; this phase has no substitute in CI.
- Store "Este": created from `main` the way NEW-STORE.md "En una página" says, `--modo consulta`.
  Store "Norte": cart mode, baseline `v2.0.1`, then `pnpm template:sync` to `main`.
- Never push a tag, never dispatch `distribuir.yml`, never open a PR in a real store.
- **First step, before the harness: the Next.js advisory.** O32 and O34 both saw `next build` stop
  once with a "SecurityFatalError" advisory notice for the installed Next 16.4.3 (their logs).
  Read the notice's full text and the advisory it names. If a 16.4.x patch release fixes it, bump
  `next` (and what must move with it) to that patch only, no minor or major, in its own commit;
  the whole gate and the harness then run on the bumped version. If no patch fixes it, or the fix
  needs a minor or major upgrade, change nothing and write what you found to
  `docs/decisions-needed.md`. Either way the log quotes the notice and says what was done. `package.json`,
  `pnpm-lock.yaml` and `pnpm-workspace.yaml` are yours for this step only.
- Follow the document you are proving. Where NEW-STORE.md is wrong or a step is missing, fix the
  document and note it; do not work around it silently.
### Exit
- Plan §5.5 steps 1–3, with numbers in `docs/log/o36.md`: tests passed, e2e passed, migration
  applied on Norte, what "Este" shows for each check.
- `CHANGELOG.md` has the `v2.1.0` entry ("Migración: sí" with the number); "Sin publicar" is empty.
- `docs/decisions-needed.md` has the tag item: the exact command, the commit it goes on (the merge
  commit of this PR or later), and that every store in `tiendas.json` is `pausada`.
- Gate green locally and on GitHub; PR merged with a merge commit; full gate re-run once on `main`.
## After this phase
Report to the manager (plan §4.5) and end. Start no session. Never use Fable.
