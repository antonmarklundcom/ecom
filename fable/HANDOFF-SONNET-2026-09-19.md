# fable/HANDOFF-SONNET-2026-09-19.md — Plan de ejecución para Sonnet 5 + Codex

Escrito por Fable 5.1 (low) el 2026-09-19. Este archivo es el punto de entrada de la
sesión que ejecuta el resto de la auditoría del template. Fable analiza y planifica;
**Sonnet 5 (medium) dirige y audita; Codex CLI `gpt-6-astra` low escribe todo el código.**
Fable no vuelve a correr hasta la próxima revisión.

## Dónde está todo

| Qué | Dónde |
|---|---|
| Repo local | `C:\Claude 1\ecom-repo` (clon de `github.com/antonmarklundcom/ecom`). Ignorar `C:\Claude 1\ecom`: es un stub viejo sin remoto. |
| Rama de trabajo | `codex/template-audit-2026-09-19`, PR #114 contra `main` |
| Hallazgos y por qué | `fable/TEMPLATE-REVIEW.md` (T1–T6) y § "Hallazgo T7" abajo |
| Prompts listos para Codex | `fable/codex/10-*.txt`, `11-*.txt`, `12-*.txt`, `13-*.txt` |
| Tier y orden | tabla en `fable/codex/README.md` § "Auditoría del template (2026-09-19)" |
| Proceso | skill `manager-worker-codex` + `fable-cost-guardrail` |

## Estado al escribir esto

| Tarea | Estado | Commit |
|---|---|---|
| T1 · codex 08 · sync salta merge commits | hecho y auditado (repro manual verde) | `9e8720e` |
| T2 · codex 09 · flags test en tienda renombrada | hecho y auditado | `554083c` |
| T3 · codex 10 · aviso MariaDB | hecho en PR #115 (sin Codex) | |
| T4 · codex 11 · distribuir.yml sólo en el template | hecho en PR #115 | |
| T5 · codex 12 · docs revisión vigente + URL remoto | hecho en PR #115 (remoto → `https://`) | |
| T7 · codex 13 · sync choca en docs mixtos | hecho en PR #115 | |
| T6 · bootstrap copia `fable/` | hecho en PR #115: `SOLO_TEMPLATE` | |

## Hallazgo T7 (salió del repro de 08)

Tienda de prueba con baseline en `9bc85c1` (anterior a #107) sincronizando hasta el tip:
después de saltar bien los 4 merge commits, `template:sync` para con conflicto real en
`KNOWN-ISSUES.md` y `fable/codex/README.md` en el commit `4d51e32` (codex 04, #109).
Causa: commits de **piel** salteados (`6151f04` #108, `3aadfb3` S17) editaron esos mismos
docs antes; cuando llega un commit de maquinaria que también los toca, el cherry-pick no
tiene el contexto. `fable/` ya se auto-resuelve (se descarta el lado del template);
`KNOWN-ISSUES.md` no está en esa lista. Toda tienda que cruce #108/#109 lo va a ver.

Arreglo propuesto (prompt `13`): tratar `KNOWN-ISSUES.md` como doc del template en la
auto-resolución del sync, quedándose con el lado del template (`--theirs`) y siguiendo, igual
que hoy con `fable/` pero al revés. Caso de test con un commit de piel salteado que toca el
doc y uno de maquinaria posterior que también. Toca `scripts/template-sync.ts`: **Anton lo
mira antes de mergear.**

## Entorno de esta máquina (Windows, sin Docker)

Poner esto arriba de cada prompt de Codex, ya está en `fable/codex/13-*.txt` como modelo:

- `pnpm` no está en PATH: anteponer `C:\Users\anton\.local\bin` al PATH en cada comando, o usar `corepack pnpm`. Husky también lo necesita para commitear.
- Sin Docker ni MySQL: `pnpm test` corre los 831 unitarios y saltea integración. CI (MySQL 8) es la verificación de integración; **mergear sólo en verde de CI**.
- Git a nivel sistema tiene `core.autocrlf=true`. Antes de cualquier vitest: `$env:GIT_CONFIG_COUNT='1'; $env:GIT_CONFIG_KEY_0='core.autocrlf'; $env:GIT_CONFIG_VALUE_0='false'`.
- Fallo conocido y pre-existente: el test de symlink en `tests/unit/bootstrap-into-repo.test.ts` (EPERM, sin modo desarrollador). Reportar, no arreglar.
- El repo commitea CRLF; no convertir finales de línea.

## Bucle de ejecución (Sonnet)

1. `git fetch origin && git checkout codex/template-audit-2026-09-19 && git pull`.
2. Por cada prompt, en orden 10 → 11 → 12 → 13, con el tier de la tabla del README:
   `& "$env:USERPROFILE\.claude\skills\manager-worker-codex\scripts\codex-run.ps1" -Repo "C:\Claude 1\ecom-repo" -Tier <tier> -PromptFile "C:\Claude 1\ecom-repo\fable\codex\<n>-*.txt"`
3. Auditar corriendo, no leyendo: `pnpm typecheck && pnpm lint && pnpm test`, y `git diff --stat` para confirmar que sólo se movieron los archivos listados.
4. Si falla: resumir la misma sesión de Codex con el error exacto. Si falla dos veces: parar y preguntar a Anton (no escalar a high solo).
5. Un commit por despacho (`T3: ... (codex 10)`, etc.), push después de cada uno, fila del Registro en `fable/codex/README.md` con session id, modelo y effort **leídos del log de sesión**, no del chat del worker.
6. Reporte final por despacho: session id, modelo/effort, comandos con PASS/FAIL, qué se rechazó, qué queda abierto. 11 y 13 quedan marcados para revisión de Anton.
