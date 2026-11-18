# Phase C5 — enquiries, leads and the way out. Opus 5.5 session (`claude-opus-5-5`). Beside C2, C3, C4.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2 (§2.6, §2.8 closely), §4, §5.5;
  `docs/log/c0.md`, `c1.md`, `docs/DATOS.md`, `CLAUDE.md`. In `ecom`: `docs/log/o33.md` and the
  code it names (counters, `/api/consulta`, the click component), `src/domain/notification-outbox.ts`,
  `src/domain/messaging/**`, `src/lib/integraciones*.ts`, `src/lib/secret-box.ts`,
  `src/lib/rate-limit.ts`, `src/lib/funnel.ts`, `fable/plan-100-tiendas.md` §2.3.
- Owns: `src/tienda/consultas/**`, `src/tienda/salida/**`, `src/tienda/integraciones/**`,
  `src/cola/**`, `src/app/api/consulta/**`, `src/componentes/consulta/**`, the panel screens
  `src/app/admin/consultas/**` and `src/app/admin/integraciones/**` (C3 leaves these two folders
  to you), their tests, `docs/log/c5.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Counters as `ecom` O33: daily counts, no IP, user agent, cookie or message text; search terms
  that look like a phone or contain `@` are dropped; a test reads the schema to prove it.
- The WhatsApp link stays a plain anchor; counting is a beacon that can fail silently.
- The outbox (plan §2.6): the row is written in the same transaction as the event; the queue
  message carries only store id and row id; the consumer asks the store for the row, sends, and
  reports back; retries with backoff, then a dead state; the row id is the idempotency key.
- Outgoing HTTP: `https://` only, private and loopback addresses refused, timeouts, a size cap.
  Webhooks are signed (HMAC over body and timestamp).
- Secrets as plan §2.8; a test calls every RPC method and searches the results for a planted
  secret. With an integration not configured, the feature is off and nothing is sent.
- The lead form is off by default; on, it has consent text, server-side validation of a
  Paraguayan phone, a honeypot, the exact counter and the platform limiter.
### Exit
- Plan §5.5 "Exit", every line.
- A test with the queue: receiver down three times then up → one delivery, row ends "sent".
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
