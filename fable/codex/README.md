# fable/codex — despachos a Codex CLI (revisión 2026-09-13)

Los hallazgos de `fable/REVIEW-2026-09-13.md` se arreglan con el proceso
manager/worker: una sesión de Claude Code **local** (en la PC de Anton, dentro de
este repo, rama `claude/tender-dijkstra-nlj4py`) dirige y audita; Codex CLI escribe.
Fable escribió estos prompts en la nube y no puede correr Codex desde ahí.

## Orden y tier

| # | Archivo | Arregla | Tier | Depende de |
|---|---|---|---|---|
| 01 | `01-stock-unsigned.txt` | C2 | normal (`gpt-6-astra` low) | — |
| 02 | `02-rechazado-salida.txt` | C1, S6, N7 | normal | 01 mergeado en la rama |
| 03 | `03-avisos-reconcile.txt` | S1, N1 | normal | 02 |
| 04 | `04-revalidate-docs.txt` | S7, N5 | cheap (`gpt-5.6-luna` low) | — |
| 05 | `05-cupon-edicion.txt` | S4 | normal | — |
| 06 | `06-contra-entrega.txt` | S2 (versión mínima) | normal | 02 |
| 07 | `07-reembolso-total.txt` | S3 | **hard** (`gpt-6-astra` high) | 02 y 03 |

01 → 02 → 03 van en serie porque los tres tocan `src/domain/orders.ts` y los mismos
tests. 04 y 05 pueden ir en paralelo con cualquiera. 06 y 07 son decisiones de
producto que Anton confirmó al arrancar la sesión local (si no, se saltean).

Fuera de alcance de Codex: S5 (sobre del webhook de Pagopar, bloqueado por
credenciales de sandbox), N2, N3, N4, N6.

## Cómo correr cada uno (PowerShell, en la PC)

```powershell
$S = "$env:USERPROFILE\.claude\skills\manager-worker-codex\scripts\codex-run.ps1"
& $S -Repo "C:\ruta\a\ecom" -Tier normal -PromptFile "C:\ruta\a\ecom\fable\codex\01-stock-unsigned.txt"
```

Después de cada despacho, el manager local:

1. corre él mismo `pnpm typecheck && pnpm lint && pnpm test` (con `docker compose up -d`);
2. confirma con `git status` y `git diff --stat` que sólo se tocaron los archivos listados;
3. lee "Flagged or not done" del reporte; si hay algo, lo resuelve o reenvía con
   `-Resume <session id>` y el error textual;
4. commitea con el mensaje `C2: resta sin signo en consumeReservations (codex 01)` (uno por
   despacho) y pushea la rama;
5. anota en la tabla de abajo el session id y el modelo leído del log.

Escalación: cheap falla una vez → normal en despacho nuevo; normal falla dos veces →
hard en despacho nuevo. Nunca `--last`, nunca resume sin `-Tier`.

## Prompt de arranque para la sesión local (Opus)

Copiar tal cual al abrir Claude Code en la carpeta del repo:

> Sos el manager del proceso manager-worker-codex (cargá esa skill y fable-cost-guardrail).
> Estamos en la rama `claude/tender-dijkstra-nlj4py` del repo ecom. Leé
> `fable/REVIEW-2026-09-13.md` y `fable/codex/README.md`. Despachá los prompts de
> `fable/codex/` en el orden y tier de la tabla, uno por vez, auditando cada uno como dice
> el README antes de pasar al siguiente. Decisiones ya tomadas: 06 (contra entrega, versión
> mínima) SÍ; 07 (reembolso total) SÍ. Al final reportame por despacho: session id, modelo y
> effort leídos del log, comandos corridos con PASS/FAIL, lo rechazado y lo abierto. No
> abras PR; dejá la rama pusheada y yo la reviso desde la nube.

## Registro

| # | Session id | Modelo / effort (del log) | Resultado |
|---|---|---|---|
| 01 | `01a09bc6-14ce-7d21-8327-d0668d5ba649` | gpt-6-astra / low | OK: typecheck, lint, transition-order (18) y suite completa verdes salvo fallos de entorno Windows |
| 02 | `01a09bce-c509-7cd2-b780-5306cdc56f19` | gpt-6-astra / low | OK: el worker no encontró pnpm en su sandbox; manager corrió typecheck, lint y suite (verdes salvo entorno) |
| 03 | `01a09bdc-a18a-7633-9737-1096af1055ae` | gpt-6-astra / low | OK; manager ajustó una aserción en tests/integration/order-notifications.test.ts (fuera de la lista) que fijaba from NULL |
| 04 | `01a09be6-da1c-7f03-a22b-4f47e985804e` | gpt-5.6-luna / low | OK: typecheck, lint y tests/unit (763) verdes; worker sin pnpm en sandbox, verificado por el manager |
| 05 | `01a09bec-8f22-7633-abef-e8bfe7608876` | gpt-6-astra / low | OK: typecheck, lint, edit-order+coupons (46) y suite verdes salvo entorno; worker sin pnpm en sandbox |
| 06 | `01a09bf5-89a9-77a3-aff6-6e2c43301fda` (2 turnos) | gpt-6-astra / low | OK: paró bien por tests/integration/stock.test.ts (fuera de lista), autorizado en resume; typecheck, lint y suite verdes salvo entorno |
| 07 | `01a09c00-6e78-7f52-884f-6119584485cf` | gpt-6-astra / high | OK: typecheck, lint, suite y build verdes salvo entorno; manager revirtió la quita de `transicion.reembolsado` en order-labels.ts (rompía el test de claves muertas de i18n) |

## Auditoría del template (2026-09-19)

Segunda tanda, salida de `fable/TEMPLATE-REVIEW.md`. Mismo proceso; Codex CLI tampoco
tenía sesión ni clave en el contenedor de la nube, así que se corre desde la PC. Rama
de esta tanda: `claude/keen-babbage-772ht4`.

| # | Archivo | Arregla | Tier | Depende de | Mira Anton antes de mergear |
|---|---|---|---|---|---|
| 08 | `08-sync-merge-commits.txt` | T1 (sync muere en merge commits) | normal (`gpt-6-astra` low) | — | sí: toca `scripts/` (maquinaria del sync) |
| 09 | `09-flags-test-tienda-renombrada.txt` | T2 (test rojo al prender cuentas) | normal | — | no |
| 10 | `10-aviso-mariadb-en-tests.txt` | T3 (aviso de MariaDB) | normal | — | no |
| 11 | `11-distribuir-solo-en-el-template.txt` | T4 (runner por push en cada tienda) | cheap (`gpt-5.6-luna` low) | — | sí: es CI |
| 12 | `12-docs-revision-vigente.txt` | T5 (docs: revisión vigente, URL del remoto) | cheap | — | no |
| 13 | `13-sync-docs-mixtos.txt` | T7 (sync choca en KNOWN-ISSUES.md por piel salteada; ver fable/HANDOFF-SONNET-2026-09-19.md) | normal | 08 | sí: toca `scripts/` |

Los cinco son independientes; 08 primero porque es el que bloquea a las tiendas hoy.
Auditoría extra de 08: además de la suite, repetir a mano la prueba que lo encontró —
tienda de prueba con `.template-baseline` en un commit anterior a `42ae4ca` (#107),
remoto `template` apuntando al checkout local, `pnpm template:sync --sin-tests` en una
rama: tiene que terminar en verde y el `git log` de la tienda no debe contener el merge.
T6 (bootstrap copia `fable/` y `tiendas.json`) no tiene despacho: es una pregunta.

| # | Session id | Modelo / effort (del log) | Resultado |
|---|---|---|---|
| 08 | 01a0b9f4-09be-7712-88e8-3056756892f6 | gpt-6-astra / low | commit 9e8720e. typecheck, lint y 831 unitarios PASS. Repro manual: 4 merge commits salteados, sync verde, baseline al tip. Pendiente revisión de Anton (toca scripts/) |
| 09 | 01a0ba01-025d-7301-bd8d-85cc6758df30 | gpt-6-astra / low | typecheck, lint y 831 unitarios PASS. Rename simulado: 1 test salteado, el resto verde |
| 10–13 | — (Claude Code en la nube, sin Codex) | — | PR #115, junto con T6 y el recorte de minutos de Actions. 10: aviso de MariaDB en `global-setup.ts`. 11: `distribuir.yml` y `pnpm-al-dia.yml` sólo en el template. 12: docs + remoto unificado a `https://` (anda en la nube y en CI sin llave SSH; no a `git@` como decía el prompt). 13: `DOCS_DEL_TEMPLATE` en `template-shared.ts`, test de integración que falla sin el arreglo. T6: `SOLO_TEMPLATE` (`fable/`, Dependabot) |
| 10 | pendiente | | no despachado en esta tanda: Fable paró a pedido de Anton, sigue Sonnet 5 + Codex |
| 11 | pendiente | | idem. Es CI: lo mira Anton antes de mergear |
| 12 | pendiente | | idem |
| 13 | pendiente | | nuevo, T7 |
