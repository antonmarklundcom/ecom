# Phase E5 — content with controls. Opus 5.5 session (`claude-opus-5-5`). Wave 1.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.5, §4, §5.5, §6; `fable/plan-trafico.md`
  §1 decision 8, §4, §6.5; `CLAUDE.md`; `docs/GUIAS.md`, `docs/SEO.md`; `docs/log/o33.md` …
  `o35.md`; `scripts/seo-auditar.ts`, `src/lib/guias.ts`, `src/domain/consultas.ts`.
- Owns: `scripts/contenido-auditar.ts` and `scripts/cohorte-informe.ts` (new), two entries in
  `package.json` scripts, `docs/CONTENIDO.md` (new), a brief template, their tests and fixtures,
  `CHANGELOG.md`, `docs/log/e5.md`. No storefront file.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- `contenido:auditar` takes one or more store folders (own repos checked out side by side, or the
  fleet's `tiendas/*` later) and only reads. Checks and thresholds are named constants listed in
  `docs/CONTENIDO.md`. Similarity is computed on normalised sentences; quoting a law or a size
  table is allowed through an explicit allow-list in the store's brief, not by loosening the check.
- It never calls a model and never rewrites text. It reports; a session fixes.
- `cohorte:informe` reads what exists: enquiry and search counters from each store's database
  (`DATABASE_URL` list given by the person running it), guide and category counts from the
  folders, and Search Console numbers only from an export file the person supplies. A number it
  cannot get is printed as "sin dato", never estimated.
- `docs/CONTENIDO.md` is written for the session that will produce a store's content: the brief,
  the order of work, what must come from the brief or a cited source, and the sentence-level
  things that fail the audit.
### Exit
- Plan §5.5 "Exit", every line (the four real stores are checked only if they exist; otherwise
  the log says so).
- Both commands have `--json`; the audit exits 1 on a finding.
- Gate green locally and on GitHub on the PR's last commit; `docs/log/e5.md` on the branch. Do not
  merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
