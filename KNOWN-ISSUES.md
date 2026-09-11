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
no lo va a ver. Al escribir una resta así, castear los dos lados a `SIGNED` o
envolver en `GREATEST(..., 0)` como hace `consumeReservations`, y no confiar en
que el verde local signifique algo. Arreglo de fondo, si alguna vez molesta lo
suficiente: correr la suite contra MySQL 8 en local (Docker) en vez de MariaDB.

## El backup se sube como un solo archivo — fase O8

`/api/cron/backup` sube el dump entero como **un** `.jsonl.gz`. Cloudinary
limita el tamaño por archivo según el plan (10 MB en el free), así que una
tienda con muchísimos pedidos podría llegar a un punto en que la subida falle
—y ahí sí se entera, porque el aviso de backup fallido le llega al dueño por
WhatsApp y queda el motivo en `job_runs.last_error`.

No se arregló partiendo el dump en un archivo por tabla, que es lo que sugiere
plan-operacion §5.4 A como alternativa: hoy ninguna tienda está cerca de ese
tamaño, y partirlo agrega una forma nueva de fallar a medias (tres tablas
subidas y dos no, sin nada que diga que ese backup está incompleto). Arreglo,
cuando alguna tienda se acerque: un archivo por tabla **más** un manifiesto con
la lista y el conteo de filas de cada uno, y que `restore` se niegue a correr
si falta alguno. Mientras tanto, el dump comprimido de una tienda con miles de
pedidos entra cómodo en 10 MB.

## `saveProduct` no revalidea la vidriera — fase S17

Marcar un producto destacado (o publicarlo, desactivarlo, cambiarle el
precio) desde `/admin/productos` actualiza la base al toque, pero la home y
las fichas públicas pueden tardar hasta `revalidate = 300` (`src/app/page.tsx`)
en mostrarlo: `saveProduct`, `bulkSetActive`, `bulkMoveCategory` y
`duplicateProduct` (`src/app/actions/admin-products.ts`) sólo llaman
`revalidatePath("/admin/productos"...)`, nunca `revalidatePath("/", "layout")`.
Se descubrió escribiendo el e2e de S17 ("marcar destacado y verlo en la
home"): con la home ya prerenderizada por `next build` antes del test, un
producto nuevo no aparecía ni de casualidad dentro de la ventana del test.

`src/app/actions/admin-categories.ts` ya resuelve exactamente esto —
`revalidarVidriera()` llama `revalidatePath("/", "layout")` después de
`crearCategoria`/`editarCategoria`/`uploadCategoryImage`— pero el equivalente
nunca se escribió para productos. No se arregló en S17 porque
`src/app/actions/**` es límite duro de las fases Sonnet (§4.7 de
`fable/plan-crecimiento.md`): ni "un cambio chiquito" ahí. El e2e de S17
(`tests/e2e/productos.spec.ts`, "marcar un producto como destacado") verifica
contra `/admin/productos?destacados=1` (`force-dynamic`, siempre fresco) en
vez de la home pública, así que el flujo real queda probado igual — lo que no
queda probado es la latencia con la que la compradora lo ve.

Arreglo: agregar a `saveProduct`, `bulkSetActive`, `bulkMoveCategory` y
`duplicateProduct` el mismo `revalidatePath("/", "layout")` que ya tiene
`admin-categories.ts` (y, si hace falta acotar más, `revalidatePath` de
`/categoria/[slug]` y `/producto/[slug]` del producto tocado). Es un cambio
mecánico de una fase con acceso a `src/app/actions/**` — O14 ya cerró la
deuda de dominio de este plan, así que es candidato para S19 o un PR aparte.
S19 no lo tocó: `src/app/actions/**` es fuera de sus "Owns" y ninguna
dependencia nueva lo exigía para compilar (la única excusa que S19 tenía
para tocar afuera de docs/config). Sigue abierto.

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
