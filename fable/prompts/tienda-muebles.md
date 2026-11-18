# Store session T-MUE — muebles.tienda, new on v2.1.0. Opus 5.5 session (`claude-opus-5-5`).
- Runs in `antonmarklundcom/muebles.tienda` (created by Anton from the template; this session
  never creates a repo). The plans and prompts live in ecom: read them from
  `https://github.com/antonmarklundcom/ecom` (`origin/main`, public, read-only clone outside the
  store's folder).
- Start only if the brief says Anton approved this session, ecom carries the tag `v2.1.0`, and the
  repo exists with the template's tree. Otherwise report "not ready" (plan §4.5) and end.
- Read ONLY: this file; in ecom `fable/plan-trafico.md` §1, §4, §6.3, §6.5, §7;
  `fable/muebles/plan-muebles-tienda.md` (all) and `fable/muebles/prompts/mu1…mu5` (each when its
  step starts); `docs/GUIAS.md`, `docs/SEO.md`, NEW-STORE.md "En una página" and §5;
  `docs/log/o31.md`, `docs/log/o32.md` … `o36.md`.
- Owns: what the MU prompts list as owned, in the store repo; in ecom, one `tiendas.json` entry
  and the test line that goes with it.
### Work
MU1 → MU2 → (Anton's yes) → MU3 → MU4 → MU5, in this one session, one PR per phase, each with its
`docs/log/mu<n>.md`. Before a phase, check the store's `docs/log/`: a phase whose log exists on
`main` is done. Where an MU prompt and this file disagree, this file wins:
- **Environment.** Ignore Windows paths, `gh` commands, the MySQL on port 3317 and the `DONE.md` /
  `FAILED.md` files: plan-trafico §4.1–§4.5 is the environment, the gate and the way to report.
  The repo already exists; clone nothing over it.
- **Base (MU1).** `pnpm nueva-tienda … --modo consulta --tema vitrina`. `proveedores: true`.
  `marcaBuscable: "muebles.com.py"` is in the template since O32: edit no guard test.
- **Mockup (MU2).** Publish it, report to the manager with the link, and end the turn. Anton
  answers in this session; MU3 starts only after his yes or with his changes applied.
- **Header (MU3).** The template's header test ids from O32 allow a dropdown or drawer; no
  always-visible strip is needed for the tests.
- **Content (MU4)** also does plan-trafico §6.5. The catalogue is empty at launch: categories and
  guides carry the store. Guides answer what a furniture buyer in Paraguay asks before buying
  (measures, materials, how to choose, care), and promise no delivery, assembly or warranty that
  Anton or a supplier did not give.
- **Launch kit (MU5).** The go-live checklist drops what consulta mode makes unnecessary and adds
  `pnpm categorias:aplicar`, Search Console and GA4.
- **Subagents.** The MU plan gives MU4 and MU5 to Sonnet: do them as Sonnet subagents
  (`claude-sonnet-5-5`) or yourself. Never Fable.
### Rules
- Machinery is never edited in the store. A missing hook is a template proposal in the log.
- No image is generated. Without supplier photos the mockup and the store use the template's drawn
  placeholders.
- No production change of any kind: nothing exists yet for muebles.com.py and this session creates
  nothing outside the repo.
- Gate after every phase (plan §4.2); private repo, dispatch workflows only on your own branch.
### Exit
- The muebles plan §9 "Done means", plus plan-trafico §6.5 step 6.
## After this session
Report to the manager (plan §4.5) and end. Start no session.
