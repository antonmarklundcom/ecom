# Phase E3 — leads. Opus 5.5 session (`claude-opus-5-5`). Wave 2, after E1, beside E2 and E4.
- Read ONLY: this file; `fable/plan-100-tiendas.md` §1, §2.3, §4, §5.3; `fable/plan-trafico.md` §2.2
  and §4; `CLAUDE.md`; `docs/log/o33.md`, `docs/log/e1.md`; `src/domain/consultas.ts`,
  `src/domain/product-inquiries.ts`, `src/domain/notification-outbox.ts`, `src/lib/integraciones.ts`,
  `src/lib/secret-box.ts`, `src/lib/rate-limit.ts`, `src/config/paginas-default.ts`, NEW-STORE.md
  §4a-ter. Load the skill `vendercrm-lead-capture` if the session has it.
- Owns: the reference in the WhatsApp message, `src/domain/leads.ts` (new), one table and its
  migration, the form component and its action, the webhook integration (settings, sender, outbox
  kind), `/admin/consultas` (a "Leads" tab), the retention job, the privacy page default text,
  their tests, `docs/ENV-OPCIONAL.md`, NEW-STORE.md §4a-ter, `CHANGELOG.md`, `docs/log/e3.md`.
### Rules
- Branch from the brief, off latest `main`. Protocol, gate and reporting: `fable/plan-trafico.md` §4
  (cloud session, local MariaDB plus GitHub CI, you do not merge your PR, report once and end) and
  `fable/plan-100-tiendas.md` §4.
- This phase touches no order, stock or money code. Say so in the PR body (plan §4.3).
- The reference is short, has no personal data, and decodes to store, product and day with a
  function that has a test. It is text inside the message the buyer can read and delete.
- The form is off by default (empty = feature off). On: server-side validation of a Paraguayan
  phone, rate limit, a honeypot field, and the consent line shown above the button.
- The webhook is configured only in `/admin/integraciones`, its secret stored with
  `secret-box` and never sent back to the browser. Deliveries are signed (HMAC over the body with
  a timestamp), go through the outbox with retries and a dead-letter state the panel shows.
  The destination must be `https://`; private and loopback addresses are refused.
- Personal data: only in the leads table, never in logs or in `job_runs`; deleted by the retention
  job after the owner's period (default 90 days); included in backups.
- VenderCRM is a preset of field names over the same webhook, not a second code path.
### Exit
- Plan §5.3 "Exit", every line. Migration applies on MySQL 8 and MariaDB 10.11.
- e2e: form on → a lead appears in the panel and one signed delivery reaches a local test receiver;
  receiver down → retried, then delivered.
- Gate green locally and on GitHub on the PR's last commit; `docs/log/e3.md` on the branch. Do not
  merge.
## After this phase
Report to the manager (`fable/plan-trafico.md` §4.5) and end. Start no session. Never use Fable.
