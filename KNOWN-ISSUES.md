# KNOWN-ISSUES.md

Cosas menores o bloqueadas que aparecieron durante las fases de `fable/plan.md`
y que no valían un desvío. Cada entrada dice qué es, por qué no se arregló y
cuál sería el arreglo. Si una entrada se resuelve, se borra.

## MariaDB local no reproduce el error de resta sin signo de MySQL 8 — fase O6

`variants.on_hand` y `variants.reorder_point` son `INT UNSIGNED`, así que
`on_hand - reorder_point` se calcula en aritmética **sin signo**. Cuando el
resultado sería negativo —que es justo el caso que busca `lowStockVariants`—
MySQL 8 tira `ER_DATA_OUT_OF_RANGE` y **MariaDB devuelve la vuelta al revés
en silencio**. O6 lo descubrió recién en CI: la suite pasaba entera contra la
MariaDB local y la misma consulta explotaba contra el MySQL 8 del job.

Ya está arreglado donde apareció (`CAST(... AS SIGNED)` en el `ORDER BY` de
`lowStockVariants`, con su test). Queda anotado porque **la trampa sigue
puesta para el resto del repo**: toda resta entre dos columnas `UNSIGNED`
—`on_hand`, `qty`, cualquier `*_pyg`— tiene el mismo problema y la suite local
no lo va a ver. Al escribir una resta así, castear los operandos sin signo a
`SIGNED` antes de restar, o usar `IF(on_hand >= qty, on_hand - qty, 0)`.
`GREATEST(..., 0)` solo no evita el error porque la resta se evalúa antes.
`consumeReservations` tuvo ese bug y se arregló en esta fase (C2 de la revisión
2026-09-13), con un test de integración para una reserva mayor al stock físico.
`docker-compose.yml` ya levanta MySQL 8, así que la trampa sólo aplica cuando
`TEST_DATABASE_URL` apunta a una MariaDB nativa. La suite lo avisa al arrancar
(`tests/global-setup.ts` mira `SELECT VERSION()`): con ese aviso, el verde local
no dice nada sobre estas restas.

## `eslint` 10 no anda con `eslint-plugin-react` — fase S19

`eslint-config-next@16.3.4` declara el peer como `eslint: ">=9.0.0"` (acepta
10 en el papel), pero al correr `pnpm lint` con `eslint@10.10.0` instalado
tira en runtime: `TypeError: Error while loading rule
'react/display-name': contextOrFilename.getFilename is not a function`.
ESLint 10 sacó `context.getFilename()` (deprecado hace rato, removido en
esta mayor) y `eslint-plugin-react@7.37.5` —que llega transitivo a través de
`eslint-config-next`, no es una dependencia directa de este repo— todavía lo
usa. No hay flag ni config que lo esquive: es la regla `react/display-name`
la que explota apenas lint toca cualquier archivo `.tsx`.

No se fuerza nada: no hay versión de `eslint-plugin-react` publicada que
arregle esto todavía (depende de que `eslint-config-next` suba el bundle
completo). Arreglo: subir `eslint` a 10 recién cuando `eslint-config-next`
libere una versión que declare (y funcione con) `eslint-plugin-react` >= la
que arregle `getFilename`. Reintentar entonces con `pnpm outdated` +
`pnpm lint`, no antes.

## `typescript` 7 no anda con `typescript-eslint` — fase S19

`tsc --noEmit` pasa limpio con `typescript@7.0.2` (cero errores en todo el
repo), pero `pnpm lint` no llega a evaluar ni un archivo:
`typescript-eslint@8.69.0` tira, en texto explícito, `typescript-eslint does
not support TS 7.0. […] See also
https://github.com/typescript-eslint/typescript-eslint/issues/10940 for
tracking typescript-eslint's support for TS >=7.1`. Es la librería la que
todavía no se declara compatible, no un error para "adaptar".

Arreglo: reintentar `typescript` 7 cuando `typescript-eslint` cierre el
issue 10940 y publique una versión que declare soporte para TS >= 7.1 (o la
serie que sea). Hasta entonces, `typescript` se queda en 5.9.x.

## Presupuesto de JS: producto y checkout subieron el techo — 2026-09-23

`tests/e2e/presupuesto.spec.ts` bloqueó el PR de reseñas y favoritos por
0,2–0,3 KB: producto 229.2 KB > 229, checkout 223.3 KB > 223. Lo nuevo en el
cliente es el link de favoritos del header (en todas las páginas, con su store
de `zustand/persist`) y el corazón de la ficha y la tarjeta. Según la regla del
spec, el techo pasó al valor medido + 10% (producto 252, checkout 246) en vez de
achicar código desde el test. Si se quiere recuperar ese margen, el candidato es
cargar `wishlist-header-link` con `next/dynamic` (no hace falta en el primer
render) — fase aparte.

## Presupuesto de JS: home subió el techo por el catálogo de textos — 2026-09-29

El PR de identidad y cuentas desde el panel (nombre, logo, favicon, color,
`/setup`) pasó el techo de la home por 0,6 KB: 224.6 KB > 224. No es código
nuevo del lado del cliente en la home: es **el catálogo de mensajes**
(`src/i18n/es-PY.ts`) que viaja entero al navegador en un solo chunk (~1560
claves, 28,7 KB comprimido) porque los componentes cliente importan `t()`. Cada
clave nueva —aunque sea de `/admin` o de `/setup`, que la vidriera nunca
muestra— suma a todas las páginas. Según la regla del spec, el techo de la
home pasó al valor medido + 10% (247) en vez de borrar textos desde el test.

Resuelto en el hardening del template (2026-10-05): `src/i18n/client.ts` usa
un catálogo público generado que excluye panel, setup y preflight. Las formas
de cuenta importan sólo la política de contraseña, sin incluir bcrypt.
Chromium midió 235,1 KB en home, 246,4 KB en producto y 240,4 KB en checkout
con el catálogo poblado. Los límites anteriores no se aumentaron. Esto
resuelve la importación del diccionario completo; los bundles de Next y las
otras funciones del cliente siguen formando parte del presupuesto.

## Presupuesto de JS: producto subió el techo con las fotos de R2 — 2026-11-04

El cambio a R2 pasó el techo de la ficha de producto por 0,7 KB: 252.7 KB >
252 (home 239.7 KB y checkout 244.9 KB siguen adentro; las dos crecieron ~4,5
KB desde la medición del 2026-10-05 sin tocar fotos, así que la ficha ya venía
justa). Lo nuevo en el cliente de la ficha es la galería con `<picture>` y
`srcset` (`src/components/imagen-r2.tsx`), que convive con `next/image` para
las fotos locales. Antes de subir el techo se sacó de la ficha el código que
arma URLs de R2 (vistos recientemente guarda las URLs que arma el servidor) y
una clave de texto del panel que viajaba en el catálogo público. Según la
regla del spec, el techo pasó al valor medido + 10% (278). Candidato para
recuperar el margen, en una fase aparte: que la galería no importe
`next/image` cuando todas sus fotos son de R2.

## MariaDB 10.11 puede rechazar `RENAME COLUMN` de una columna JSON — 2026-10-07

MariaDB guarda una columna `json` como `longtext` con un `CHECK
(json_valid(...))` automático. Con la suite de integración se reprodujo que,
después de ciertas consultas previas en el servidor (sólo SELECT y DML, sin
DDL), `ALTER TABLE variants RENAME COLUMN identifiers TO …` falla con
`Unknown column 'identifiers' in 'CHECK'`, también desde una sesión nueva del
cliente. `ALTER TABLE … CHANGE identifiers otro_nombre JSON NULL` (con la
definición explícita) sí funciona, en MariaDB y en MySQL 8.

Hoy ninguna migración del template renombra una columna JSON; el test que
simulaba una columna faltante con `RENAME COLUMN` pasó a usar `CHANGE`
(docs/TEMPLATE-IMPROVEMENT-PLAN.md, batch B). Si algún día `pnpm db:generate`
produce un `RENAME COLUMN` sobre una columna JSON, reescribir esa sentencia
como `CHANGE … JSON NULL` antes de commitear la migración y probarla contra
MariaDB (`.github/workflows/mariadb.yml`). La causa exacta en MariaDB no se
investigó más allá de reproducirla.
