# Phase S25 — CSV and spreadsheet hardening. Sonnet 5.5 session (safe for Sonnet). Parallel with S26, S30.
- Read ONLY: this file, `fable/plan-2026-11.md` §1, §4, §6.1, the phase table and §9, and
  `docs/log/o22.md`. Execute under the autonomy protocol §4.
- Owns: `src/lib/csv.ts`, `src/lib/spreadsheet.ts`, `tests/unit/csv*.test.ts`,
  `tests/unit/spreadsheet*.test.ts`, `CHANGELOG.md` § "Sin publicar", `docs/log/s25.md`.
- Hard limits (§4.7): nothing under `src/domain/**`, `src/app/actions/**`, `src/db/**`, `drizzle/**`.
  If a caller must change, write it under Backlog in the phase log and stop short of it.
### Rules
- Branch `phase/s25-csv-xlsx` off latest `main`. Tests first, then the fix.
- CSV: a cell starting with `=`, `+`, `-` or `@` is only quoted today (`src/lib/csv.ts:49`), so
  Excel still runs it as a formula. Port `neutralizeFormula` from `antonmarklundcom/productos.new`
  (`src/lib/csv.ts:43-57` there, commits `7e90bda` and `4d2670a`): make the text inert, keep phone
  numbers (`+595…`) unprefixed. Export then import of the same file must round-trip.
- XLSX: `workbook.xlsx.load` (`src/lib/spreadsheet.ts:77`) has no limit on decompressed size, and
  the 5,000-row cap applies after the sheet is converted. Reject before conversion: caps on
  decompressed bytes, rows and columns, in the existing error style.
### Exit
- New unit tests (formula cells, phone number, negative-number text, oversize sheet, too many
  rows) fail on `main` and pass on the branch; their names are in the phase log.
- `tests/integration/importar-productos.test.ts` and the catalog import tests still green.
- Full gate §4.2 green (Playwright not required). PR merged with a merge commit.
- `docs/log/s25.md` committed; plan §9 has the index line.
## After this phase
Plan §4.10. Spawn nothing; end with the phase report. Never use Fable.
