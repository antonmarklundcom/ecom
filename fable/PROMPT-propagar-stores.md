# Fable: ¿hace falta propagar el endurecimiento de `ecom` a las tiendas hijas?

Prompt para una sesión de **Fable 5.1 (medium)** que Anton abre él mismo. Pegalo tal cual.

---

You are Fable 5.1 (medium effort) in a session Anton opened himself. This is an
**investigation + estimate**, not a build — do not implement anything except a trivial fix
(a typo, under 5 minutes). Load skill `fable-cost-guardrail` first: this session never spawns
itself as a subagent, workflow agent, or child session, and never proposes a plan where Fable
executes a phase — only Opus/Sonnet execute, same as `fable/plan.md` already does.

## Contexto

`antonmarklundcom/ecom` is the store template. Four hardening phases (O1 xlsx/Zod edge cases,
O2 WhatsApp "new order" notification, S3 Playwright in CI, S4 deps/CI/docs) just closed —
`fable/plan.md` has the full history, `fable/REVIEW.md` the original audit that spawned it.

At least three repos are live stores cloned from this template: `antonmarklundcom/lenceria`,
`antonmarklundcom/productos`, `antonmarklundcom/mascota`. There may be more — check
`list_repos` / `search_repositories` for other repos that look like they came from this
template (same stack, same `NEW-STORE.md`/`ARCH.md`/`fable/` layout, or a `template` git
remote pointing at `antonmarklundcom/ecom`) rather than assuming these three are the whole set.

The template already has a built-in mechanism for exactly this: `pnpm template:diff` (see
`scripts/template-diff.ts` and `NEW-STORE.md` §"Ya tengo una tienda") diffs a store against
the template's commit history and marks with `*` the commits that touch **maquinaria**
(`src/domain/**`, `src/lib/**`, checkout, `/admin` logic — the do-not-redesign zone in
`CLAUDE.md`). Machinery commits are meant to be cherry-picked into stores as-is; "piel"
(skin — header/footer/home/product-card/copy) is never cherry-picked because each store has
redesigned it.

## What to answer

For each store repo found:

1. Clone it (or read via GitHub) and run `pnpm template:diff` against `template` remote
   pointing at `antonmarklundcom/ecom`, or reconstruct the same commit-range comparison by
   hand if the store hasn't set up the `template` remote / `.template-baseline` yet.
2. Of the four phases' commits (O1/O2/S3/S4, PRs #75/#76/#77/#79 in `ecom`), which are
   marked machinery (`*`) and therefore apply as-is, and which are skin the store already
   diverged on?
3. For each store, is a plain cherry-pick realistic, or did the store's own history touch the
   same files enough that it'll conflict? Give a real effort estimate per store — "clean
   cherry-pick, ~10 min" vs "conflicts in X, needs a real session" — not a guess.
4. Is there a way to do this **once** instead of three-to-N times — e.g. a Sonnet phase whose
   job is exactly "cherry-pick these N commits into these repos and open a PR each, stop at
   the first real conflict" — and is that worth it given how small each individual diff is,
   versus Anton just running `template:diff` + cherry-pick by hand per store (which
   `NEW-STORE.md` already documents as a few commands)?

## Deliverable

A short report (no `fable/plan.md`/`fable/prompts/` machinery needed unless you find real
conflict work that justifies a full Sonnet phase) that gives Anton, in order:

1. The actual list of stores that need this and which ones are already caught up.
2. Per store: which of the four phases' commits are missing, machinery vs skin, and the
   real effort to bring it current.
3. Your recommendation — direct cherry-pick per store (by Anton, or by a spawned Sonnet
   session per store if the volume justifies it — never Fable) vs. skip because it's cheap
   enough to do by hand — with the actual reasoning, not a hedge.
4. If you recommend spawning Sonnet sessions, don't spawn them yourself in this
   investigation — write the one-line prompt(s) Anton would use to kick each off
   (`create_session`, same pattern as `fable/plan.md` §4.9: model Sonnet, permission mode
   not `plan`, prompt naming the store repo and the exact commits/PRs to cherry-pick and the
   exit criteria — CI green, no `template:diff` conflicts against `main`).

Be blunt about whether this is worth automating at all — three stores with a few small
commits each may just not be worth more than doing it by hand once.
