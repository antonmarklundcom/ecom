# KNOWN-ISSUES.md

Cosas menores o bloqueadas que aparecieron durante las fases de `fable/plan.md`
y que no valían un desvío. Cada entrada dice qué es, por qué no se arregló y
cuál sería el arreglo. Si una entrada se resuelve, se borra.

## Un `.xlsx` corrupto muestra un error genérico — fase O1

`spreadsheetToCsvText` sólo convierte en `UnsupportedSpreadsheetError` la
extensión desconocida y la planilla sin hojas. Un `.xlsx` con el ZIP dañado
tira el error crudo de la librería (`Corrupted zip: ...`), que
`readCatalogFile` re-lanza y el panel muestra como error genérico en vez de "el
archivo está dañado, exportalo de nuevo". No corrompe nada ni deja pasar datos
—hay un test que lo fija (`tests/unit/spreadsheet.test.ts`)—; es sólo el texto
que ve el staff. Arreglo, cuando alguien toque ese camino: envolver
`workbook.xlsx.load` en un `try/catch` que devuelva `UnsupportedSpreadsheetError`
con un mensaje en castellano.

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
