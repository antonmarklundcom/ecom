# Store session T-ANI — anillos.tienda, new on v2.1.0. Opus 5.5 session (`claude-opus-5-5`).
- Runs in `antonmarklundcom/anillos.tienda` (created by Anton from the template; this session
  never creates a repo). The plans and prompts live in ecom: read them from
  `https://github.com/antonmarklundcom/ecom` (`origin/main`, public, read-only clone outside the
  store's folder). The old store `antonmarklundcom/anillos` is a read-only reference: never push
  to it, never open a PR in it.
- Start only if the brief says Anton approved this session, ecom carries the tag `v2.1.0`, and the
  repo exists with the template's tree. Otherwise report "not ready" (plan §4.5) and end.
- Read ONLY: this file; in ecom `fable/plan-trafico.md` §1, §4, §6.2, §6.5, §7;
  `fable/anillos/plan-anillos-tienda.md` (all) and `fable/anillos/prompts/an1…an5` (each when its
  step starts); `fable/anillos/INVENTORY-2026-11-11.md`; `docs/GUIAS.md`, `docs/SEO.md`,
  NEW-STORE.md "En una página" and §5; `docs/log/o32.md` … `o36.md`.
- Owns: what the AN prompts list as owned, in the store repo; in ecom, one `tiendas.json` entry.
### Work
AN1 → AN2 → AN3 → AN4 → AN5, in this one session, one PR per phase, each with its
`docs/log/an<n>.md`. Before a phase, check the store's `docs/log/`: a phase whose log exists on
`main` is done. Where an AN prompt and this file disagree, this file wins:
- **Environment.** Ignore Windows paths, `gh` commands and the MySQL on port 3317: plan-trafico
  §4.1–§4.4 is the environment and the gate. The repo already exists; clone nothing over it.
- **Base (AN1).** `pnpm nueva-tienda … --modo consulta`. Payments: `transferencia`,
  `contra_entrega`. `marcaBuscable: "anillos.com.py"` (the template has it since O32; edit no
  guard test).
- **No "concept product" mechanism.** The old store hid 24 concept products from Google. Here a
  product is either published in enquiry mode (with or without its price) or not in the catalogue.
- **Guides (AN2).** Do not build `/guias` pages: the template has them. Move the old store's
  twelve guides into `src/content/guias/<same-slug>.md` so every URL stays, and its category texts
  into `src/content/categorias.json` and `src/config/catalogue.ts`. Check every moved claim against
  plan §1 decision 8 and `docs/GUIAS.md`; a claim with no source is cut or marked.
- **`/guias/talles` (AN3)** stays a store page with its measuring tool. It must win over the
  template's `/guias/[slug]` for that slug without editing machinery; if the template cannot be
  made to yield from the store's side, stop per plan §4.5 with the exact change it needs.
- **Data move (AN4).** Only with the inputs of the anillos plan §4; without them it runs on
  fixtures, as that plan says.
- **Content, plan §6.5,** after AN3: the keyword map covers the moved guides first, then up to 15
  in total.
- **Subagents.** The AN plan gives AN2 and AN5 to Sonnet: do them as Sonnet subagents
  (`claude-sonnet-5-5`) or yourself. Never Fable.
### Rules
- Machinery is never edited in the store. A missing hook is an upstream request in the log.
- No production change: anillos.com.py, its hosting and database are untouched; public GETs only.
- Gate after every phase (plan §4.2); private repo, dispatch workflows only on your own branch.
### Exit
- The anillos plan §7 "Done means", plus plan-trafico §6.5 step 6.
- Every guide URL that anillos.com.py serves today exists in the new store (list in the log, old
  URL → new file).
## After this session
Report to the manager (plan §4.5) and end. Start no session.
