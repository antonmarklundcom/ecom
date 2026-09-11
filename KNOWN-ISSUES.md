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
