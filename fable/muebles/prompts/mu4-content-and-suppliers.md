# Phase MU4 — content and supplier kit. Sonnet 5.5 session (`claude-sonnet-5-5`, safe for Sonnet). After MU1.
- Start only if the manager's brief says Anton approved this session in chat. The brief carries any
  facts Anton gave (returns, warranty, who sells, image policy); what it does not carry is
  `[COMPLETAR]`.
- Read ONLY: this file; in ecom `fable/muebles/plan-muebles-tienda.md` §1, §2, §4, §5 MU4, §6;
  NEW-STORE.md §4 (4, 4a-bis, 4b-bis, 4e) and `docs/CATALOGO-CSV.md`; in the store `docs/log/mu1.md`,
  `src/config/paginas-default.ts`, `src/config/public-facts.ts`, `src/config/catalogue.ts`,
  `scripts/fixtures/catalogo-demo.csv`.
- Owns (store): `src/config/paginas-default.ts`, `src/config/catalogue.ts`,
  `src/config/public-facts.ts`, `docs/PROVEEDORES.md`, `docs/planillas/**`, `docs/log/mu4.md`.
  No other file under `src/**`; nothing MU2 or MU3 owns.
### Work
1. `paginas-default.ts`: starting texts of `/envios`, `/devoluciones`, `/preguntas-frecuentes`,
   `/terminos`, `/privacidad` for a store that lists furniture from Paraguayan suppliers. Keep the
   template's placeholders (`{{tienda}}`, `{{whatsapp}}`…). The word "muebles" is fine; the store's
   name or domain is only `{{tienda}}` (MU1 pointed the default-texts guard of
   `tests/unit/store-settings.test.ts` at `TIENDA.marcaBuscable`, `muebles.com.py`). No promise, number, term, legal claim or
   delivery time that Anton did not give: `[COMPLETAR]` in the text and in the log's list.
2. `public-facts.ts`: change `publishUnknownImages` to `false` only if the brief carries Anton's
   yes; otherwise leave the file and write the recommendation in the log (supplier photos: only
   images marked own or authorised should reach Google and Meta).
3. `docs/PROVEEDORES.md`, Spanish, for Anton: how a supplier's products enter the store with the
   spreadsheet (supplier columns, selling mode, "Mostrar precio"), photos by `https://` URL or
   `pnpm fotos:preparar`, cost and margin as his commission, image provenance, what stays private.
   Only what the template really does; check each claim against the code or NEW-STORE.md.
4. `docs/planillas/proveedor-ejemplo.csv`: the template's sheet headers (with the supplier columns)
   and example rows taken from the template's own demo fixture, marked as examples. No invented
   furniture, price or supplier.
5. `docs/log/mu4.md`: a proposed category list by room for Anton to accept or change. Create no
   category and no seed.
6. `catalogue.ts`: unchanged unless the brief gives editorial text.
### Exit
- Gate green (wait for MySQL if MU2 or MU3 is testing); both workflows green; PR
  `phase/mu4-content-and-suppliers` merged with a merge commit; `DONE.md` written.
- If a fix needs machinery: write it to the log's Backlog line and stop short of it.
### Rules every muebles phase carries (plan §4)
- Start condition: O31 (productos.tienda) merged = `docs/log/o31.md` exists on ecom `origin/main`.
  Go-live additionally waits for O27 (`docs/log/o27.md`). Unmet: write `FAILED.md` (below) and end.
- The repo `antonmarklundcom/muebles.tienda` is created by the manager on Anton's go, never by a
  phase: `gh repo create` (and so `pnpm nueva-tienda --crear-repo`) is refused in build sessions
  (`docs/log/o31.md` "Known issues"). MU1 clones it to `C:\Projects\muebles.tienda`; worktrees next
  to it. Work on C: only, never on E:.
- Gate = `fable/plan-2026-11.md` §4.2 in the store: `pnpm install --frozen-lockfile && pnpm db:generate`
  (no `drizzle/` diff) `&& pnpm typecheck && pnpm lint && pnpm test && pnpm build` with
  `REQUIRE_DATABASE_TESTS=1`, then Playwright, then `pnpm preflight` showing only items for Anton.
  Local MySQL on port 3317 is the manager's server: a phase never starts, stops or restarts it (not
  listening = `FAILED.md`). Check `SHOW PROCESSLIST` first and wait if another session is testing.
  Databases `muebles_test_mu4` and `muebles_dev_mu4` only; nothing outside the
  `muebles_` prefix is created or dropped. `E2E_PORT=3324`.
- AND both GitHub workflows green on the PR branch: "CI" and "Tests en MariaDB". In a private repo
  the second runs only by manual dispatch (`gh workflow run mariadb.yml -R
  antonmarklundcom/muebles.tienda --ref <this phase's branch>`): allowed only on the store's own PR
  branches, no other `gh workflow run` anywhere.
- One PR, branch `phase/mu4-<slug>` off the store's latest `main`, merged with a merge commit.
  Never `--no-verify`, force-push or history rewrite. Any git run in a temp folder clears every
  `GIT_*` variable first. After every push: `git -C C:/dev/ecom config core.bare` must print `false`.
- A store never edits machinery (`src/domain`, `src/lib`, `src/app/actions`, `src/db`, `drizzle`,
  checkout, auth, cron) and makes no migration. Anything missing becomes a proposal for a template
  change in the phase log, shown to Anton by the manager.
- No tracked file, log or PR text names the removed image provider
  (`tests/unit/sin-proveedor-viejo.test.ts`).
- Never invent facts about products, prices, delivery, the business or legal matters: write
  `[COMPLETAR]` and list it for Anton. No image generation, no paid service.
- Read-only towards production: no DNS, Hostinger, Cloudflare, live database, tag, or store set to
  `activa` without Anton's go in chat.
- Nobody answers permission prompts unless Anton is there. This phase starts no other phase and no
  session. Subagents, if any: Sonnet 5.5 or Haiku 5.5 set explicitly. Never Fable.
- Keep the store's `STATUS.md` current. End by writing `C:\dev\muebles-wt\mu4-carryover\DONE.md`
  (PR, merge SHA, test numbers, `[COMPLETAR]` list, proposals) or `FAILED.md` (state, exact blocker).
## After this phase
Start nothing. Never use Fable.
