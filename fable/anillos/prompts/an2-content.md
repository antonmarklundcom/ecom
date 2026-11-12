# Phase AN2 — content. Sonnet 5.5 session (safe for Sonnet). After AN1, parallel with AN3.
- Read ONLY: this file; in ecom `fable/anillos/plan-anillos-tienda.md` §1, §5, §6 AN2,
  `fable/anillos/INVENTORY-2026-11-11.md` §2.1, §4 (rows 5–7, 28) and §7.5; in the store
  `docs/log/an1.md`, `src/config/catalogue.ts`, `src/config/editorial-tools.ts`, NEW-STORE.md §5; in
  the old store (`C:\dev\.cache\anillos-old`, read-only) `src/content/**`, `src/app/guias/**`, the
  category and collection texts, `tests/**/keyword-coverage*`.
- Owns (store repo `C:\Projects\anillos.tienda`): `src/content/**`, `src/app/guias/**` except
  `talles` (AN3 owns it), `src/config/catalogue.ts`, `src/config/editorial-tools.ts`, their tests,
  i18n keys it adds, `docs/log/an2.md`.
- Hard limits (plan §5): no machinery (`src/domain/**`, `src/lib/**`, `src/app/actions/**`,
  `src/db/**`, `drizzle/**`, checkout, auth, cron). No file AN1 or AN3 owns. No Hostinger, Cloudflare,
  DNS, live database or paid service. Nothing in the old repo.
### Rules
- Branch `phase/an2-content` off the store's latest `main`.
- The twelve guides (all but `talles`), the ten category texts, FAQs and the keyword list move as
  CONTENT onto the template's mechanisms (editorial slots in `src/config/catalogue.ts`,
  `EDITORIAL_TOOLS`, the keyword coverage panel under `/admin/seo`). Do not port the old store's
  components for them when the template already draws the same thing.
- Text is copied, not rewritten. Never invent a fact (material, size, price, delivery, guarantee): a
  gap is `[COMPLETAR]` and goes in the log's list for Anton.
- No supplier names, quotes or contact details from the old `docs/`.
- Port the old `keyword-coverage` test so the coverage numbers are checked, not asserted by hand.
### Exit
- Every old guide URL and category URL answers on the new store with the same slug (list them).
- Store gate green (plan §5.4; wait for AN3's turn on MySQL if it is running the gate: databases
  `anillos_test_an2_*`, `E2E_PORT=3312`); GitHub checks green, including "Tests en MariaDB".
- PR merged with a merge commit; `C:\dev\anillos-wt\an2-carryover\DONE.md` written.
## After this phase
Start nothing. Never use Fable.
