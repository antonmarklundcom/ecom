# Phase C0 — foundations. Opus 5.5 session (`claude-opus-5-5`). Alone. Merges itself.
- Read: this file; `docs/plan/plan-ecom-cf.md` whole (if `docs/plan/` does not exist yet, your
  first commit creates it: copy `fable/cf/plan-ecom-cf.md`, `fable/cf/MANAGER.md` and
  `fable/cf/prompts/*` from `antonmarklundcom/ecom` `origin/main` into `docs/plan/`, unchanged).
  In `ecom`: `CLAUDE.md`, ARCH.md, `src/proxy.ts`, `src/lib/vidriera-cache.ts`, `next.config.ts`,
  `package.json`, `tests/e2e/csp.spec.ts`, `tests/e2e/vidriera-cache.spec.ts`.
- Read on the web, today, and cite in the record: the OpenNext Cloudflare docs, Cloudflare's
  Next.js / vinext guide, Durable Objects SQLite storage API and limits, Workers limits and custom
  domains, the Cache API, D1 limits, the Workers vitest integration.
- Owns: everything in the repo at this point. Later phases own what the plan's table gives them.
### Work
1. Skeleton: pnpm (same major as `ecom`), strict TypeScript, ESLint, `wrangler.jsonc` with the
   bindings of plan §2.1 (local only), vitest running **inside the Workers runtime**, Playwright
   against the built app on two hosts (`uno.localhost`, `dos.localhost`), CI with those steps and
   a job that fails when the bundle passes the plan's size limit.
2. The framework decision (plan §2.2): the thin slice of step 5 on OpenNext; then the same slice on
   vinext for at most two hours. Compare on: does every piece of §2.2 work (store context for the
   whole request, own cache in front, nonce CSP, server actions, streaming), bundle size, local
   test story, what had to be worked around. Write `docs/decisions/0001-framework.md`. Keep one;
   delete the other's code.
3. The Worker entry: host → store through the registry (D1, two stores seeded for tests), store
   context in `AsyncLocalStorage`, `tiendaActual()`, unknown host 404, any incoming header or
   query that tries to name a store is ignored and a test proves it.
4. The store object `Tienda` (plan §2.3): SQLite, Drizzle, migrations on start, one table
   (products: name, slug, price), typed RPC, one write method that bumps the content version.
5. One page end to end: `/` lists that store's products. Cached by the Worker as plan §2.2 says.
6. Security headers and CSP on rendered and on cached responses, as `ecom` does it.
7. `CLAUDE.md`: the rules of plan §2 a later session must not break, each with the test that
   guards it. `README.md`: how to run and test locally.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Nothing is deployed and no Cloudflare account is touched: everything runs on the local runtime.
- Decide by experiment and write down what was run. Where the platform contradicts plan §2.9,
  the record says so, and if it breaks a decision of plan §1 or §2 you stop (plan §4.6).
- No feature beyond the slice. The value of this phase is that the next eight can trust it.
### Exit
- Plan §5.0 "Exit", every line, each with the name of the test that proves it in `docs/log/c0.md`.
- A concurrent test: 200 interleaved requests to two stores, zero cross-store answers.
- Local gate and CI green; PR merged by you with a merge commit; gate re-run once on `main`.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
