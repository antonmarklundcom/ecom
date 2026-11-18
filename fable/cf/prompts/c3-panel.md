# Phase C3 — the store panel. Opus 5.5 session (`claude-opus-5-5`). Beside C2, C4, C5.
- Read: this file; `docs/plan/plan-ecom-cf.md` §1, §2 (§2.3, §2.7, §2.8 closely), §4, §5.3;
  `docs/log/c0.md`, `c1.md`, `docs/DATOS.md`, `CLAUDE.md`. In `ecom`: `src/app/admin/**` (login,
  layout, `productos`, `categorias`, `ajustes`, `usuarios`, `bienvenida`), `src/app/actions/admin-*.ts`
  for those screens, `src/lib/auth.ts`, `session*.ts`, `password*.ts`, `permissions.ts`, `roles.ts`,
  `src/domain/admin-products.ts`, `admin-categories.ts`, `admin-bulk.ts`, `product-images.ts`,
  `src/lib/preparar-imagen.ts`, `imagenes-r2.ts`, `imagen-bytes.ts`, `tests/e2e/panel.spec.ts`,
  `admin-workspace.spec.ts`.
- Owns: `src/tienda/acceso/**`, `src/tienda/catalogo/escritura/**`, `src/tienda/ajustes/**`,
  `src/app/admin/**` (except `importar/`), `src/componentes/panel/**`, their tests, `docs/log/c3.md`.
### Rules
- Branch from the manager's brief, off latest `main`. Protocol, gate, ownership and reporting: plan §4.
- `ecom` (public, read-only clone outside this repo) is the specification of behaviour (plan §1.5,
  §4.11). Name the source file in each porting commit.
- Every panel method checks session and role **inside the store object**. The route and the
  server action are not the defence. One test enumerates the object's panel methods and fails if
  any lacks a rule or a no-session / wrong-role case.
- Passwords: a standard, slow hash available in the Workers runtime, chosen with its parameters and
  reason in the log; `ecom`'s password policy and lockout rules. Sessions as plan §2.8.
- Every write is one transaction and bumps the content version when it can show on a page.
- Photos as plan §2.7: prepared in the browser, verified by bytes, stored under the store's own
  prefix; a store can never write or list another store's prefix (test).
- CSRF protection on every form and action; upload size limits enforced before reading the body.
- The fleet hand-off (plan §2.8) is C6's; expose one method that creates a panel session for a
  verified hand-off and nothing more. Imports are C7's. Orders are version 2.
### Exit
- Plan §5.3 "Exit", every line.
- First run: a new empty store gets its owner through a one-time setup that closes itself.
- Local gate and CI green on the PR's last commit. Do not merge.
## After this phase
Report to the manager (plan §4.7) and end. Start no session. Never use a Fable or Mythos-class model.
