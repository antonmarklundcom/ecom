# fable/TEMPLATE-REVIEW.md — Auditoría del template · 2026-09-19

Quinta pasada de Fable 5.1, sobre `main` en `be9d6ce` (#110 mergeado). Esta vez no se
audita la tienda sino **el template como fábrica de tiendas**: wizard, bootstrap,
`template:diff`/`sync`, flags, docs y CI del día uno. Sólo lectura sobre `src/`; los
arreglos van como despachos a Codex en `fable/codex/08-*` a `12-*`.

## Veredicto

La maquinaria de tienda sigue sana (typecheck, lint y 831 unitarios en verde; los de
integración no corrieron acá: sin daemon de Docker). Lo que **no** está sano es la
maquinaria de *template*: `pnpm template:sync` se rompe en el primer merge commit del
template (y `main` ya tiene seis que tocan maquinaria), así que ninguna tienda puede
ponerse al día sola hoy, ni a mano ni por `distribuir.yml`. Y una tienda que prende las
cuentas de cliente como dice NEW-STORE.md §4b queda con `pnpm test` en rojo para siempre.
Las dos son de un archivo cada una.

## Lo que se corrió

| Chequeo | Resultado |
|---|---|
| `pnpm typecheck` / `pnpm lint` | verde |
| `pnpm test` (sin `TEST_DATABASE_URL`: 84 archivos, 831 tests; 59 archivos de integración salteados) | verde |
| `pnpm nueva-tienda --dry-run --tema calido` con las seis banderas | verde, idempotente |
| `pnpm setup:doctor` (entorno de nube) | detecta el entorno y degrada Docker a aviso, como dice NEW-STORE.md |
| `pnpm preflight` sin `.env.local` | bloquea con motivo, como debe |
| `pnpm bootstrap:repo --destino <repo con sitio viejo>` (dry-run y real) | 550 archivos copiados, `.git`/`.env*`/`.template-baseline` excluidos, `index.html` viejo listado y no tocado |
| `pnpm template:diff` en una tienda de prueba con baseline 4 commits atrás | lista bien, marca `*`/`~` bien |
| `pnpm template:sync --sin-tests` en esa tienda | **rojo**: aplica 3 commits y muere en el merge commit `42ae4ca` (#107) con «falló de una forma que no reconozco» |
| `eslint@10.10.0` + `pnpm lint` | mismo crash de `react/display-name` — KNOWN-ISSUES sigue vigente |
| `typescript-eslint@8.70.0` peer `typescript` | `>=4.8.4 <6.1.0` — TS 7 sigue bloqueado, KNOWN-ISSUES sigue vigente |

## Hallazgos

| id | Sev. | Dónde | Qué pasa | Por qué le pega a toda tienda | Arreglo → despacho |
|---|---|---|---|---|---|
| T1 | **alta** | `scripts/template-shared.ts:143` (`commitsClasificados`) | `git log baseline..template/main -- <maquinaria>` lista también los **merge commits** de PR, y `template-sync.ts:396` los cherry-pickea sin `-m`. git responde `is a merge but no -m option was given`; el sync lo reporta como error desconocido, deja los commits anteriores aplicados y no mueve el baseline. Hay 6 merges así en `main` (#107, #109, #110…) y ningún test los cubre (`tests/integration/template-sync.test.ts` arma el template sólo con commits lineales). | Toda tienda que sincronice cruzando un PR mergeado con merge commit se frena; `distribuir.yml` abre el PR en draft con la mitad aplicada, en todas las tiendas de `tiendas.json`, en cada push a `main`. La lista de `git cherry-pick` que imprime `template:diff` tiene el mismo SHA y falla igual a mano. | `--no-merges` en el `git log` de `commitsClasificados` (los commits reales del PR ya vienen por su propio SHA; el merge no aporta diff propio) + caso de test con `git merge --no-ff`. → `08` |
| T2 | **media** | `tests/unit/flags-apagados.test.ts:32` | `expect(TIENDA.cuentasClientes).toBe(false)` sobre el config **real** del checkout. NEW-STORE.md §4b dice «para prenderla: `cuentasClientes: true`». | La tienda que sigue la doc queda con `pnpm test` y su CI en rojo desde ese commit, y `template:sync` le vuelve a traer el test. `preflight.test.ts:320` ya resuelve el mismo problema mirando si el checkout es el template (`TIENDA.nombre === MARCA_PLACEHOLDER`). | Afirmar el default apagado sólo cuando el checkout sigue siendo el template; la segunda mitad del test (todo `/cuenta` detrás del flag) sigue corriendo siempre. → `09` |
| T3 | **media** | `tests/global-setup.ts`, `KNOWN-ISSUES.md` §O6 | La trampa de la resta `UNSIGNED` (MySQL 8 tira, MariaDB devuelve basura en silencio) sigue puesta y la suite no avisa contra qué motor corre. La entrada dice como arreglo «correr contra MySQL 8 en local (Docker)», pero `docker-compose.yml` **ya es `mysql:8`**: la trampa sólo existe para quien apunta `TEST_DATABASE_URL` a una MariaDB nativa, y no se entera. | Cada tienda tiene su dueño o su IA corriendo la suite en una máquina distinta; el verde falso reaparece en cada una. | `global-setup.ts` hace `SELECT VERSION()` y, si contiene `MariaDB`, imprime un aviso de una línea que nombra KNOWN-ISSUES. Corregir la entrada de KNOWN-ISSUES (compose ya es MySQL 8). → `10` |
| T4 | baja | `.github/workflows/distribuir.yml:6` | Corre en cada push a `main` **de cada tienda** (Use this template y bootstrap copian el workflow, y `template:sync` lo repone con la versión del template). Con `tiendas.json: []` el job `preparar` igual levanta un runner (checkout + node) para decidir que no hay nada. | Un minuto facturado por push en cada tienda, por un workflow que sólo tiene sentido en el template. | `if: github.repository == 'antonmarklundcom/ecom'` a nivel job en `preparar`. Es CI: lo mira Anton antes de mergear. → `11` |
| T5 | baja | `CLAUDE.md:17`, `README.md:21`, `PLAN.md:8` | Dicen que `fable/REVIEW.md` (2026-09-11) es «la revisión vigente». `fable/REVIEW-2026-09-13.md` es posterior y sus arreglos ya están en `main` (#109); es la que cita `fable/codex/README.md`. Aparte, NEW-STORE.md da el remoto por `git@github.com:` y `template-diff.ts:90` sugiere `https://github.com/`. | La próxima sesión en cualquier tienda arranca leyendo la revisión equivocada. | Apuntar los tres a la del 13 como última y dejar la del 11 como origen de `plan-crecimiento.md`; unificar la URL del remoto. → `12` |
| T6 | info | `scripts/bootstrap-into-repo.ts`, NEW-STORE.md §"Arreglos" | Tanto Use this template como `bootstrap:repo` copian `fable/`, `tiendas.json`, `PLAN.md`, `TASKS.md` y `AGENTS.md` a la tienda; NEW-STORE.md y `template-sync.ts` afirman que «las tiendas no tienen `fable/`». El sync lo tolera (borra `fable/` sólo en conflicto), así que es ruido, no rotura. | Cada tienda arrastra el historial de planes del template. | **Pregunta para Anton**, no despacho: ¿excluir `fable/` y `tiendas.json` en bootstrap? No arregla el camino de Use this template, que copia todo. |

## Lo que está bien — no tocar

- **`nueva-tienda`**: idempotente, `--dry-run` real, nunca rota secretos, falla en voz
  alta sin TTY, `--tema` lee el `@import` actual como default. Los tests leen `TEMAS` del
  script (#110), así que un cuarto tema no rompe nada.
- **`bootstrap:repo`**: `.git` primero en la lista de exclusión con test, `.env*` afuera
  salvo `.env.example`, no borra, lista lo ajeno, se puede correr de nuevo.
- **`setup:doctor`** reconoce el contenedor de nube y no bloquea por Docker.
- **Marca centralizada**: `grep` de `TiendaPY` fuera de `tienda.ts` sólo da comentarios y
  los tests del wizard/preflight, que la usan como placeholder a propósito. Ningún
  teléfono ni dominio real en `src/`. `hero: null` y `cuentasClientes: false` son
  defaults seguros; cada `WHATSAPP_CLOUD_TEMPLATE_*` vacía apaga su feature.
- **`template:diff`** clasifica bien `*` y `~`, y el modo sin baseline sirve.
- **KNOWN-ISSUES**: las dos entradas de dependencias siguen siendo ciertas hoy
  (re-verificadas); no hay nada que subir.
- **CI**: el chequeo de drift de `drizzle/` y el presupuesto de JS en bytes reales.

## Despachos

Ver `fable/codex/README.md` § «Auditoría del template (2026-09-19)». Codex CLI no tiene
sesión ni clave en este contenedor, así que los cinco prompts quedan escritos para correr
desde la PC, igual que la tanda anterior. Ninguno toca `src/domain`, `src/lib`, checkout,
`src/app/actions` ni `/admin`; `08` toca `scripts/` (maquinaria de sync) y `11` toca CI:
esos dos los mira Anton antes de mergear.
