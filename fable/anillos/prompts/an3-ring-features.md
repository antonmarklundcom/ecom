# Phase AN3 — ring features. Opus 5.5 session. After AN1, parallel with AN2.
- Read ONLY: this file; in ecom `fable/anillos/plan-anillos-tienda.md` §1, §3 (D3–D5), §5, §6 AN3 and
  the template phases T1–T3, `fable/anillos/INVENTORY-2026-11-11.md` §2.1–§2.5, §4 (rows 1–5, 10, 18,
  22, 23), §6 and §7, `CLAUDE.md`, `ARCH.md` (selling modes); in the store `docs/log/an1.md`,
  `src/db/schema.ts` (`sale_mode`, `show_price`), `src/lib/seo.ts`, `src/app/sitemap.ts`, the feed
  route, the cart; in the old store (`C:\dev\.cache\anillos-old`, read-only) the enquiry components,
  `src/store/**`, `/elegir`, `/guias/talles`, `ring-measurement`, `src/store/search.ts`, their tests.
- Owns (store repo `C:\Projects\anillos.tienda`): the enquiry components and pages, `src/app/elegir/**`,
  `src/app/guias/talles/**`, ring search words and ring facet keys (configuration only), their tests,
  i18n keys it adds, `docs/log/an3.md`, `docs/decisions-needed.md` (upstream requests).
- Hard limits: nothing under `src/domain/**`, `src/lib/**`, `src/app/actions/**`, `src/db/**`,
  `drizzle/**`, checkout, auth or cron routes. No store migration. No file AN2 owns. No Hostinger,
  DNS, Cloudflare, live database or paid service. Nothing in the old repo.
### Rules
- Branch `phase/an3-ring-features` off the store's latest `main`.
- First, VERIFY by running the store what the template already does for a product with
  `sale_mode = 'enquiry'` and `show_price = false`: price display, add-to-cart, checkout, sitemap,
  feed, `robots`. Write the table in the log. Use what exists; build only what is missing.
- Enquiry over WhatsApp on that mode: composer, per-product brief, favourites enquiry (up to five),
  enquiry-mode cart, the page shown when checkout is paused. Browser drafts stay in the browser.
- The old store did this by editing machinery (`domain/cart.ts`, `queries.ts` with a hard-wired slug
  prefix). Do NOT reproduce that. Where the template has no hook (for example `noindex` and sitemap
  exclusion for enquiry-only products, or a synonyms slot for search), write an upstream request in
  `docs/decisions-needed.md`: what is missing, the smallest generic, off-by-default change in the
  template that would cover it, and what the store does until then. Then continue with the rest.
- `/elegir` and `/guias/talles` (with the printable A4 sheet) as store pages. The measuring sheet must
  print at true size: keep the old calibration check and its test.
- Not in this phase (plan D3, D5): the sales workspace, campaigns, search-gap counter, browser-local
  sales tools, cost-floor warnings, image focal point, catalogue-outage fallback.
### Exit
- The old store's tests for these features ported and green; no template test weakened or skipped.
- Store gate green (plan §5.4; databases `anillos_test_an3_*`, `E2E_PORT=3313`; one session on MySQL
  at a time); GitHub checks green, including "Tests en MariaDB".
- PR merged with a merge commit; `C:\dev\anillos-wt\an3-carryover\DONE.md` written, with the upstream
  requests listed first.
## After this phase
Start nothing: template phases are Anton's call through the manager. Never use Fable.
