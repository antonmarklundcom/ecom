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
| 04 | | | |
| 05 | | | |
| 06 | | | |
| 07 | | | |
