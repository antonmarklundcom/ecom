# Phase E2 — themes for a hundred stores. Opus 5.5 session (`claude-opus-5-5`). Wave 2, after E1.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.1, §4, §5.2; `fable/plan-trafico.md` §4;
  `CLAUDE.md`; `docs/log/e1.md`; `src/themes/**`, `scripts/temas-css.ts`; `tests/unit/temas.test.ts`,
  `tema-retocado.test.ts`, `piel-sin-colores.test.ts`; NEW-STORE.md §5 "El kit de temas".
- Owns: `src/themes/**`, `scripts/temas-css.ts`, the theme part of the definition schema, a
  contrast check and a screenshot script under `tests/`, the theme tests, NEW-STORE.md §5,
  `CHANGELOG.md`, `docs/log/e2.md`.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- At least 12 presets, each only tokens: palette, radius, type scale, two fonts from a fixed list
  of self-hosted families, header variant, footer variant, home section order. No preset has a
  component, a selector or a CSS file of its own.
- Per-store overrides in `tienda.json` change tokens only and pass the same checks at build time.
- Every preset, light and dark: text and controls meet WCAG AA contrast (a test computes it from
  the tokens, it does not eyeball it). One screenshot set per preset (home, category, product,
  guide; 1440 and 390 wide) as a CI artifact, never committed.
- Fonts are files in the repo with their licences listed; no request to a font service.
- No `data-testid` changes. The existing four presets render as before (snapshot of their CSS).
- Use Sonnet subagents (`claude-sonnet-5-5`) to draft presets after you have built two by hand;
  you check each against the tests before it is committed.
### Exit
- A harness store switches between three presets by editing `tienda.json` only; e2e passes on each.
- Contrast test and CSS snapshot test in the suite; the screenshot artifact linked in the PR.
- Gate green locally and on GitHub on the PR's last commit; `docs/log/e2.md` on the branch. Do not
  merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
