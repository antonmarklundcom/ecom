# Phase E1 — a store is data. Opus 5.5 session (`claude-opus-5-5`). Wave 1, beside E5, E6, E11.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.1, §4, §5.1 and the phase table;
  `fable/plan-trafico.md` §4; `CLAUDE.md`; `docs/log/o32.md` … `o36.md`; `src/config/*.ts`;
  `src/lib/marca.ts`, `src/lib/cuentas.ts`, `src/lib/modo-venta.ts`, `src/themes/index.ts`;
  `scripts/nueva-tienda.ts`, `scripts/template-shared.ts`; `tests/unit/marca-centralizada.test.ts`;
  NEW-STORE.md "En una página" and §5; `docs/TEMPLATE-INHERITANCE.md`.
- Owns: the definition folder and its schema, `src/lib/tienda-def.ts` (new, the only loader), the
  `src/config/*.ts` files (now thin, typed views over the loader), every place that reads
  `TIENDA.…` directly, `scripts/nueva-tienda.ts`, `scripts/tienda-a-datos.ts` (new),
  `scripts/template-shared.ts` (classification of the folder), the brand guards, their tests,
  NEW-STORE.md, `CLAUDE.md` (the "Antes de cualquier cambio" lines that name `tienda.ts`),
  `CHANGELOG.md`, `docs/log/e1.md`.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- The definition is plain JSON and Markdown, validated by one zod schema with messages a person can
  act on. No TypeScript, no function, no import inside it. It must be readable from a folder that
  is not part of the build (E8 will read it per store at run time): the loader takes the folder as
  an argument and has one default.
- `tiendaActual()` is the only reader. After this phase a search for `TIENDA.` outside
  `src/config` and tests finds nothing; a unit test keeps it that way.
- Nothing under `src/domain/**` reads the definition for a business rule (`CLAUDE.md`). Flags are
  read where they are read today.
- A store with edited `src/config/*.ts` and no definition folder keeps working unchanged after a
  sync. `pnpm tienda:a-datos` writes the folder from those files, dry run by default, and the two
  forms never both apply silently: if both exist and disagree, the build fails naming the key.
- Legal identity fields (plan §7 input 8) exist in the schema as optional; nothing prints them yet
  except the footer and `/contacto` when filled.
- No secret and nothing that lives in the database moves into the definition.
### Exit
- Plan §5.1 "Exit", every line, with the before/after HTML comparison in the log as numbers.
- A harness store made by `pnpm nueva-tienda` differs from the template only inside its definition
  folder (file list in the log), and `pnpm template:sync` on it has nothing to merge by hand.
- Gate green locally and on GitHub on the PR's last commit; `docs/log/e1.md` on the branch. Do not
  merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
