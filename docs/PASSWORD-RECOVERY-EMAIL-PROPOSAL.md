# Password recovery and transactional email proposal

Status: proposed separately; this catalogue upgrade does not implement or enable delivery.

## Password recovery

Add an optional administrator email recovery flow after a store has a verified sender. Return the same response for existing and unknown addresses, rate-limit requests and consumption, and send links only to the stored account address. Never accept a caller-supplied return URL or recipient. Construct HTTPS links from the configured store origin.

Generate cryptographically random, single-use tokens; store only their digest with account ID, purpose and short expiry. Consume the token and update the password atomically, increment `sessionVersion`, revoke outstanding recovery tokens and retain the existing password policy. Disabled accounts stay disabled and roles never change. Remove tokens from the address bar before loading third-party assets, use noindex/no-store and do not log tokens. Email changes invalidate outstanding recovery links.

Keep recovery separate from guarded `/api/setup/init` and its force/reset authorization. A phone number, order number or receipt cannot prove administrator ownership. Customer authentication uses the existing customer flow and requires its own assessment; administrator recovery must not expose private customer order links.

## Transactional delivery

Choose and configure a provider per store rather than embedding one store's sender or credentials in the template. Validate sender ownership and domain authentication before enabling delivery. Use the existing encrypted integration boundary for secrets and expose readiness to the owner without returning credentials to browsers.

Use an outbox written with the domain transaction, with unique event keys, bounded retry/backoff and explicit sent/failed state. Order email reads authoritative order/payment state; delivery success must never mark an order paid or change stock. Keep messages minimal, and distinguish transactional notices from separately opted-in marketing. Recovery messages must never contain an existing password.

If provider webhooks are used, validate signatures and event deduplication before accepting delivery state. Define retention for delivery metadata and redact provider errors and message bodies from public diagnostics. When disabled or unavailable, the owner sees a clear readiness/failure message; checkout and the existing authorized order pages continue to work.

## Delivery sequence and acceptance

1. Agree on administrator/customer scope, store sender and delivery provider; verify its current requirements during implementation.
2. Add nullable/optional settings, token/outbox migrations and private owner readiness controls.
3. Implement token issuance/atomic consumption/session revocation, then the delivery adapter and retry worker.
4. Test expiry, replay, racing consumption, generic responses, rate limits, account/role preservation, safe origins, redaction, disabled delivery, duplicate retries and verified webhooks against disposable fixtures.
5. Review generated-store defaults and store-update preservation, then separately authorize/configure delivery in each store. No live sending, sender verification, DNS change or deployment is performed by this proposal.
