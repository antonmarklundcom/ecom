# Fable: ¿hace falta propagar el endurecimiento de `ecom` a lenceria/productos/mascota?

Prompt para una sesión **nueva** de **Fable 5.1 (low effort)** que Anton abre él mismo, sin
contexto de ninguna conversación anterior. Pegalo tal cual.

---

You are Fable 5.1 (**low** effort) in a brand-new session Anton opened himself — you have no
memory of any prior conversation. Load skill `fable-cost-guardrail` first and follow it to the
letter: it says you never execute a phase, subagent, workflow, or scheduled job yourself, and
you never spawn yourself. Your own job here is small on purpose — **decide, then delegate to
Sonnet (or Opus only if genuinely warranted) to do the actual work**, so total Claude usage on
this stays minimal. Stay at low effort throughout; this does not need deep reasoning, it needs
a correct read of four small repos and a clear decision.

## The four repos

Attach all four (`add_repo` if they aren't already available in this session):

- `antonmarklundcom/ecom` — the store template. It just closed four hardening phases: O1
  (xlsx/Zod edge-case fixes), O2 (WhatsApp "new order" notification to the merchant), S3
  (Playwright added to CI), S4 (dependency bumps, CI split, doc pointers) — PRs #75, #76, #77,
  #79, all merged into `main`. Full history: `fable/plan.md` §9 (build log) and
  `fable/REVIEW.md` (the audit that started it). Read those before anything else.
- `antonmarklundcom/lenceria`, `antonmarklundcom/productos`, `antonmarklundcom/mascota` — three
  live stores cloned from `ecom`. Each may or may not have a `template` git remote pointing at
  `ecom` and a `.template-baseline` file (see `ecom`'s `NEW-STORE.md` §"Ya tengo una tienda" and
  `scripts/template-diff.ts`) — that's the template's own built-in mechanism for exactly this
  question: it diffs a store against the template's commit history and marks with `*` the
  commits that touch **maquinaria** (`src/domain/**`, `src/lib/**`, checkout, `/admin` logic —
  the do-not-redesign zone `ecom`'s `CLAUDE.md` defines). Machinery commits are meant to be
  cherry-picked into stores as-is; "piel" (skin — header/footer/home/product-card/copy) never
  is, because each store already redesigned it.

Don't go looking for other stores beyond these three — Anton named exactly these four repos.

## Step 1 — find out what's actually missing (per store)

For each of the three stores: if it has the `template` remote already, run `pnpm template:diff`
for real. If not, add the remote yourself and run it, or reconstruct the same comparison by
hand (`git log` range between the store's last-known template SHA and `ecom`'s `main`). Get a
real answer, not a guess, for each store:

- Which of the four phases' commits (O1/O2/S3/S4) are machinery it's missing, vs. skin it
  correctly never took.
- Would a cherry-pick of the missing machinery commits actually apply cleanly, or has the
  store's own history touched the same files enough to conflict? Look, don't estimate blind.

## Step 2 — decide

You decide whether this is worth fixing at all. It might not be — three stores each missing a
handful of small commits (a Zod tweak, one sender wire-up, a CI workflow file, some dep bumps)
could be cheaper for Anton to cherry-pick by hand in ten minutes each than to spin up sessions
for. Be blunt. If you decide it's not worth it, say why and stop — that's a complete answer,
don't manufacture work.

## Step 3 — if it IS worth fixing, delegate it, don't do it

If real conflict-free (or nearly so) work exists across the three stores:

- **Do not implement the cherry-picks yourself.** Spawn one Sonnet session per store (Opus only
  for a store where the conflict genuinely needs architectural judgment — money/auth/schema —
  which is unlikely for a dependency-and-doc-pointer set of commits). Use `create_session`,
  same pattern as `ecom/fable/plan.md` §4.9: that store's repo as source, permission mode that
  doesn't block on approval (never `plan`), a self-contained prompt naming the exact commits/PR
  numbers to cherry-pick from `ecom`, the target branch, and concrete exit criteria (CI green,
  `pnpm template:diff` shows those commits no longer missing, PR opened).
- Keep each spawned session's task as narrow as the actual diff — don't let "bring the store up
  to date" balloon into a broader audit of that store.
- After spawning, you're done — you are not the one watching those sessions to completion.
  Report back to Anton with what you spawned and where to check on them (session IDs / a
  `list_sessions` pointer), not a promise to babysit them yourself.

## Deliverable

One message to Anton: the per-store finding from Step 1, your decision from Step 2 with the
real reasoning, and — only if you spawned anything — exactly what you spawned and how to check
on it. No `fable/plan.md` / `fable/prompts/` phase machinery needed for something this small.
