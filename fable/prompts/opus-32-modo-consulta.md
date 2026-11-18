# Phase O32 — store mode "consulta" and three factory fixes. Opus 5.5 session (`claude-opus-5-5`). First phase.
- Read ONLY: this file; `fable/plan-trafico.md` §1, §2.1, §4, §5.1 and the phase table;
  `fable/plan-2026-11.md` §4; `CLAUDE.md`; `docs/log/o31.md` ("Decisions", "Template proposals");
  `src/lib/cuentas.ts` and `cuentasEfectivas` in `src/domain/store-settings-schema.ts` (the pattern
  to copy); `src/domain/product-inquiries.ts`; `src/components/add-to-cart.tsx`,
  `site-header.tsx`, `product-card.tsx`, `sticky-buy-bar.tsx`; `src/domain/launch-checks.ts`.
- Owns: `src/config/tienda.ts` (type and default only), `src/lib/modo-venta.ts` (new), the `ventas`
  part of the store settings (schema, domain, action, `/admin/ajustes` form), the order refusal in
  `src/domain/create-order.ts` and `src/app/actions/checkout.ts`, `src/app/checkout/**`,
  `src/app/pedido/buscar/**`, the storefront components named above plus `cart-button.tsx` and
  `whatsapp-fab.tsx`, the empty state of `src/app/categoria/[slug]/page.tsx`,
  `src/domain/launch-checks.ts`, `scripts/preflight.ts`, `scripts/nueva-tienda.ts`,
  `src/lib/testids.ts`, the e2e helpers and one new spec, `tests/unit/marca-centralizada.test.ts`,
  the default-texts test in `tests/unit/store-settings.test.ts`, `tests/unit/distribuir.test.ts`,
  `src/i18n/es-PY.ts` (new keys), NEW-STORE.md and `docs/ENV-OPCIONAL.md` (selling modes only),
  `CHANGELOG.md` § "Sin publicar", `docs/log/o32.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Gate and reporting: plan §4.
- No migration: the setting lives in the JSON of `store_settings`. If you believe one is needed,
  stop per plan §4.5 instead.
- `modoVentaEfectivo()` is the only reader of the setting. The rule "stock behaves as enquiry in
  consulta" is one pure function; the card, the product page, `product-inquiries.ts` and the order
  path all call it. `sale_mode` in the database is never rewritten.
- The server refuses the order in consulta mode even if a request is forged. Hiding the button is
  not the defence.
- `"carrito"` is the default and must behave exactly as before: no existing test or e2e spec may
  change its expectation. If one must, that is a finding for the log, not an edit.
- No `data-testid` is removed. New ids go in `src/lib/testids.ts`.
- Brand and contact only through `marcaEfectiva()` / the store settings; the WhatsApp number only
  through `src/lib/comercio.ts`.
- Not this phase: counting clicks, structured data, guides.
### Exit
- Plan §5.1 "Exit", every line.
- `pnpm nueva-tienda --dry-run --modo consulta` prints the mode it would write.
- `pnpm preflight` in consulta mode against a local database: bank, shipping and payment lines read
  "no aplica"; without a WhatsApp number it blocks.
- Gate green locally and on GitHub; PR merged with a merge commit; `docs/log/o32.md` committed and
  its line added to plan §9.
## After this phase
Report to the manager (plan §4.5) and end. Start no session. Never use Fable.
