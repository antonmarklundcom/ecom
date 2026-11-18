# Phase O33 — measure enquiries and searches. Opus 5.5 session (`claude-opus-5-5`). Runs beside O32 and O34.
- Read ONLY: this file; `fable/plan-trafico.md` §1, §2.2, §4, §5.2 and the phase table;
  `fable/plan-2026-11.md` §4; `CLAUDE.md`; `docs/log/o32.md` if it is on `main`; `src/lib/funnel.ts`,
  `src/lib/rate-limit.ts`, `src/components/variant-inquiry-link.tsx`, `whatsapp-fab.tsx`,
  `src/app/buscar/page.tsx`, `src/domain/daily-digest.ts`, `src/domain/backup-format.ts`,
  `src/domain/maintenance.ts`, `src/domain/admin-dashboard.ts`, NEW-STORE.md § "Migraciones propias
  de una tienda".
- Owns: `src/db/schema.ts` and `drizzle/**` (two tables, one migration), `src/domain/consultas.ts`
  (new), `src/app/api/consulta/route.ts` (new), `src/lib/funnel.ts`, the WhatsApp link components,
  the search count in `src/app/buscar/page.tsx`, `src/app/admin/(panel)/consultas/**` and its entry
  in the admin navigation and permissions, one line in the daily digest, the two tables in backup
  and restore, the pruning in maintenance, their tests, `src/i18n/es-PY.ts` (new keys),
  NEW-STORE.md (panel section), `CHANGELOG.md`, `docs/log/o33.md`.
### Rules
- Branch from the brief, off latest `main`. Gate and reporting: plan §4.
- **Other phases run at the same time** (plan §4.10). Keep your edits to shared files small and
  in a place of their own: new i18n keys next to related ones, not appended at the end; one bullet
  in `CHANGELOG.md` starting with your phase id. You do not merge your PR: the manager does.
- Store mode (O32) may not be on `main` yet. This phase does not need it: it counts clicks on the
  WhatsApp links that enquiry products already have. Do not create `src/lib/modo-venta.ts`.
- Migration with `pnpm db:generate`, committed. It must apply on MySQL 8 and MariaDB 10.11, and on
  a database that already holds orders (additive only: two new tables, nothing altered).
- The WhatsApp link stays a plain anchor to `https://wa.me/...`. The count is a
  `navigator.sendBeacon` on click; a failed or blocked beacon changes nothing for the buyer.
- `/api/consulta`: POST only, same-origin, rate-limited, answers 204 always, validates product,
  variant and origin against the database and a fixed list. It writes with an upsert on the unique
  key (day, product, variant, origin).
- Privacy is a test, not a comment: no column of either table can hold an IP, a user agent, a
  cookie, a phone, an e-mail or free text other than the normalised search term. Terms with seven
  or more digits in a row, or with `@`, are dropped. Day = the Paraguayan day (`src/lib/py.ts`).
- Home and category pages are cached: the handler must work from cached HTML, with no nonce and no
  per-request data in the markup.
- GA4 `generate_lead` and Meta `Contact` go through `src/lib/funnel.ts` and only when the
  integration is on (`src/lib/integraciones.ts`).
- `/admin/consultas` reads; it changes nothing. No product view counts (GA4 has them).
### Exit
- Plan §5.2 "Exit", every line.
- `pnpm test` shows the new integration tests ran (not skipped) with `REQUIRE_DATABASE_TESTS=1`.
- Backup then restore into an empty database keeps both tables' rows (count and sum equal).
- Gate green locally and on GitHub on the PR's last commit; `docs/log/o33.md` committed on the
  branch with its line for plan §9. **Do not merge.** Report to the manager and end the turn. If the
  manager later writes that `main` moved: merge `origin/main` into the branch (main wins on
  conflict, re-apply your change), run the gate again, push, wait for CI, report again.
## After this phase
Report to the manager (plan §4.5) and end. Start no session. Never use Fable.
