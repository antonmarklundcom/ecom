# Store session T-LEN — lenceria.tienda, new on v2.1.0. Opus 5.5 session (`claude-opus-5-5`).
- Runs in `antonmarklundcom/lenceria.tienda` (created by Anton from the template; this session
  never creates a repo). The plan and this prompt live in ecom: read them from
  `https://github.com/antonmarklundcom/ecom` (`origin/main`, public, read-only clone outside the
  store's folder). The old store `antonmarklundcom/lenceria` (public) is a read-only reference for
  the look: never push to it, never open a PR in it.
- Start only if the brief says Anton approved this session, ecom carries the tag `v2.1.0`, and the
  repo exists with the template's tree. Otherwise report "not ready" (plan §4.5) and end.
- Read ONLY: this file; in ecom `fable/plan-trafico.md` §1, §3.1, §4, §6.4, §6.5, §7;
  `docs/GUIAS.md`, `docs/SEO.md`, NEW-STORE.md "En una página", §4 and §5 ("El kit de temas");
  `docs/log/o31.md` ("Decisions"), `docs/log/o32.md` … `o36.md`. In the old repo only:
  `src/config/tienda.ts`, `src/app/layout.tsx` (fonts), its global and theme CSS, header, footer,
  home and product card.
- Owns: in the store repo `src/config/tienda.ts`, `src/config/checkout.ts`,
  `src/config/catalogue.ts`, `src/config/paginas-default.ts`, `src/content/**`,
  `src/themes/presets/lenceria.ts`, `src/themes/presets.ts`, `src/themes/temas.css`,
  `src/themes/custom.css`, `src/app/layout.tsx` (fonts), `src/app/page.tsx`, header, footer, home
  hero, product card, category and product page markup, `public/` media, i18n keys it adds, their
  tests, `docs/**`. In ecom: one `tiendas.json` entry (`pausada`) and the test line with it.
### Work — one PR per step, each with `docs/log/len<n>.md`; a step whose log is on `main` is done
1. **Base.** `pnpm nueva-tienda --dry-run` then the real run: `--dominio lenceria.com.py --modo
   consulta`, name, tagline and WhatsApp from the brief (missing: the domain as name,
   `[COMPLETAR]`). Payments `transferencia`, `contra_entrega`. `cuentasClientes: false`.
   `marcaBuscable: "lenceria.com.py"`. Commit `.template-baseline`.
2. **Look.** A theme `lenceria` on the template's kit that reproduces the live site's look (fonts,
   palette, header, footer, home). Compare with screenshots of lenceria.com.py's home (the only
   page of it that renders) at 1440 and 390 wide; list the differences left. Every `data-testid`
   stays; the template's e2e specs pass unchanged.
3. **Catalogue.** The seven live category names as the starting tree in
   `src/content/categorias.json`. Products only from the source in the brief (plan §7 input 5),
   through the catalogue sheet, in enquiry mode. No source: no products, and the log says so.
4. **Content, plan §6.5.** Guides answer what a buyer asks before choosing (sizes and how to
   measure, fabrics, care, what to give as a gift), in a plain, respectful voice.
5. **Launch kit.** `docs/CUTOVER.md`: new Hostinger app and a NEW database, the five variables,
   `/setup`, the three cron entries (DEPLOY.md §5), R2 bucket with the block rule,
   `pnpm categorias:aplicar`, DNS, Search Console, GA4, then how to retire the old app and
   database. No step is run. The `tiendas.json` PR in ecom.
### Rules
- **Not carried over** unless the brief says they are real: the ten products of the live site and
  the claims "hecho a mano", "bordada a mano en Itauguá", "envío gratis desde ₲ 500.000", "envíos a
  todo el país". No order and no customer moves. Plan §1 decision 8 applies to every sentence.
- Photos: only supplier or own photos Anton gave. No generated image. Without photos the store
  uses the template's placeholders.
- Machinery is never edited in the store, and the store makes no migration.
- No production change: lenceria.com.py, its hosting and database are untouched; public GETs only.
- Gate after every step (plan §4.2); private repo, dispatch workflows only on your own branch.
- Guides: one exemplar by you, then Sonnet subagents (`claude-sonnet-5-5`), each read before it is
  committed. Never Fable.
### Exit
- Five steps merged; `pnpm seo:auditar --estricto` clean; 10–15 guides passing the content test;
  `pnpm preflight` red only on what needs Anton; `docs/log/len5.md` lists every `[COMPLETAR]` and
  what Anton does next.
## After this session
Report to the manager (plan §4.5) and end. Start no session.
