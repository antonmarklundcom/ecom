# Phase S30 — productos.new docs tell the truth. Sonnet 5.5 session (safe for Sonnet).
- Runs in `antonmarklundcom/productos.new`, not in ecom. The prompt lives in ecom because
  productos.new has no `fable/` folder.
- Read ONLY: this file; in ecom `fable/plan-2026-11.md` §1, §4, §6.4 and
  `fable/REVIEW-2026-11-10.md` § "productos.new"; in productos.new `CLAUDE.md`, `README.md`,
  `PLAN.md`, `docs/HOSTINGER-STORE.md`, `docs/operations/workers-domain-cutover-2026-10-10.md`,
  `docs/operations/workers-main-production-2026-10-11.md`, `wrangler.jsonc`,
  `workers/d1/policy.mjs`, `workers/d1/build-plugin.mjs`.
- Owns (productos.new): `PLAN.md`, `README.md`, `CLAUDE.md`, `docs/HOSTINGER-STORE.md`,
  `docs/STATUS-2026-11.md` (new). Docs only.
- Hard limits: no code, no config, no `wrangler`, no deploy, no DNS, no D1 or R2 access. A push to
  `main` of productos.new triggers a Cloudflare build: open a PR and leave the merge to Anton.
### Fix, citing the evidence line for each claim
- `PLAN.md:13-14` "Stack (locked) … No Cloudflare": say what serves the site since 2026-10-10
  (Worker `productos`, D1 `productos-workers-staging`, R2 `productos-images`).
- `README.md:18` and `:250` (Hostinger MySQL, Node.js and Cloudinary given as the stack).
- `CLAUDE.md:31` (DEPLOY.md described as the runbook of the live site).
- `docs/HOSTINGER-STORE.md:5` says a `template` remote exists; `git remote -v` shows only `origin`.
- New `docs/STATUS-2026-11.md`, one page: what runs where; what the owner can do in /admin and
  what returns "Pendiente" or 404 (`policy.mjs`, `build-plugin.mjs`); the `rollback-hostinger*`
  records and that D1 and the old Hostinger database are not in sync; the store is NOT in ecom's
  `tiendas.json`, its baseline is `c5422e3`; ecom decision 0001 says it is rebuilt from the
  template when it needs checkout.
### Exit
- `git grep -n "No Cloudflare" -- PLAN.md README.md` returns nothing.
- Every statement in `docs/STATUS-2026-11.md` cites a file and line in productos.new.
- `git diff --stat main` shows only the five owned files. PR open, not merged; link reported.
## After this phase
Spawn nothing. End with the PR link and a three-line summary for Anton. Never use Fable.
