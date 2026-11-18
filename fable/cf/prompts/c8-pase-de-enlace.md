# Phase C8 — link pass and hardening. Opus 5.5 session (`claude-opus-5-5`). Alone, after C2–C7.
- Read: this file; `docs/plan/plan-ecom-cf.md` whole; every `docs/log/c*.md` (their "Para el pase
  de enlace" and "Known issues"); `CLAUDE.md`; `docs/decisions/**`. In `ecom`: `tests/e2e/**`,
  NEW-STORE.md "En una página", DEPLOY.md (for what a runbook must contain).
- Owns: every cross-cutting edit; `pruebas/e2e/**`; `KNOWN-ISSUES.md`, `README.md`,
  `docs/OPERACION.md`, `docs/NUEVA-TIENDA.md`, `docs/DEPLOY.md`, `docs/log/c8.md`.
### Work
1. Every "Para el pase de enlace" item, each as its own commit naming the phase that asked.
2. One journey test on two stores with different themes, modes and content: a buyer finds a
   product by category, search and a guide, opens WhatsApp (counted), sends a lead; the owner logs
   in, edits the product, sees the change live, sees the enquiry; the fleet user sees both stores,
   enters one, and that store's log names them. Then the same with the stores swapped, asserting
   nothing of one appears in the other.
3. Security pass, each finding fixed with a test or written to `KNOWN-ISSUES.md` with its reason:
   authorisation on every object method; CSRF; headers and CSP; uploads; outgoing requests;
   forged host, forged store, forged hand-off; secrets in results and logs; rate limits.
4. Budgets, measured and written down: bundle size against the platform limit, CPU time of the
   five heaviest requests, RPC calls per page, memory of the largest import.
5. Documents for Anton, each followed step by step on a fresh clone before it is committed:
   `README.md` (run it locally in three commands), `docs/NUEVA-TIENDA.md`, `docs/OPERACION.md`,
   `docs/DEPLOY.md` (staging on a `workers.dev` address, then a real domain; every step is his;
   what each costs on his plan, with the Cloudflare page it comes from).
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- No new feature. A gap found here that is not a link or a defect goes to the backlog.
- Use Sonnet subagents (`claude-sonnet-5-5`) as independent reviewers for step 3: give them the
  code, not your conclusion.
### Exit
- Plan §5.8 "Exit". Full gate green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
