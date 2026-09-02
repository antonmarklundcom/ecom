# Cierre de S4 — auditoría pre-handoff + reporte final a Anton

`fable/prompts/sonnet-4-deps-ci-docs.md` (S4) ya se ejecutó: branch `phase/s4`, PR #79
mergeado a `main` con CI verde completo (`checks` + `e2e`, commit de merge `ec9012d`). El
build log de la fase ya está commiteado en `fable/plan.md` §9 ("2026-09-02 · S4"). Esto era
la última fase — no hay S5.

Ya verificado en esta sesión, sobre `main` post-merge: `pnpm install --frozen-lockfile`
reproduce igual que el lockfile mergeado, `pnpm db:generate` sin drift, `pnpm typecheck` y
`pnpm lint` verdes. **Falta correr en esta sesión nueva:**

1. `pnpm test` (suite completa, con `TEST_DATABASE_URL` contra MySQL/MariaDB — no hay
   Docker corriendo en este entorno; si hace falta, instalar `mariadb-server` por `apt` y
   levantarlo a mano, con las credenciales de `docker-compose.yml`, `ecom`/`ecom`, bases
   `ecom` y `ecom_test` — así lo hicieron las sesiones de O1/O2/S3/S4).
2. `pnpm test:e2e` (necesita catálogo sembrado y el owner de prueba:
   `pnpm db:push && pnpm db:seed && pnpm create-owner`; Chromium ya viene preinstalado en
   `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, no correr `playwright install`).
3. Releer el diff mergeado de PR #79 (`git show ec9012d` o el diff de PR #79 en GitHub) como
   adversario: ¿algo de lo que se tocó (dependencias, los dos workflows, los tres punteros de
   doc) tiene un defecto que sólo se ve mirándolo de nuevo, no corriéndolo? Si aparece algo,
   arreglarlo con un commit directo a `main` (es un defecto chico de una fase ya cerrada, no
   una fase nueva) y anotarlo en `fable/plan.md` §9, al final de la entrada de S4 ya escrita.
4. Si los tres pasos de arriba salen limpios, no hace falta commit nuevo — las cuatro
   puertas de `fable/plan.md` §4.9 (PR mergeado verde ✓, checklist de salida ✓, auditoría
   pre-handoff, build log commiteado ✓) quedan cumplidas con eso.

Después: **reporte de cierre a Anton**, en este orden exacto (lo pide
`fable/prompts/sonnet-4-deps-ci-docs.md`, sección "Después de esta fase"):

1. Tabla de las cuatro fases con su PR y fecha de merge — O1 (PR #75), O2 (PR #76), S3 (PR
   #77), S4 (PR #79); confirmar fechas exactas con `gh`/GitHub si hace falta.
2. Lo que quedó en `KNOWN-ISSUES.md` y en `fable/plan.md` §10, una línea cada uno.
3. Pasos manuales numerados que sólo Anton puede hacer:
   - Pedirle a Meta la plantilla de "pedido nuevo" y cargar
     `WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO` en el hPanel de cada tienda.
   - Correr `pnpm template:diff` en las tiendas ya creadas desde este template y
     cherry-pickear los commits de O1 y O2 marcados con `*` (maquinaria).
   - (Sumar acá el bloqueo de `xlsx` de `KNOWN-ISSUES.md` si sigue sin resolverse: habilitar
     `cdn.sheetjs.com` en la política de red o correr el swap desde otra máquina.)
4. Recordatorio: `fable/plan.md` queda como historial de acá en adelante; la próxima
   revisión de endurecimiento arranca de nuevo desde `fable/PROMPT.md`.

No hay fase siguiente que spawnear. No usar `create_session` al terminar esto.
