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

## "Destacado" no tiene botón en el panel — fase S10

O7 dejó `updateProduct` (dominio) aceptando `isFeatured` y `getFeaturedProducts`
armado, pero **la server action `saveProduct`** (`src/app/actions/admin-products.ts`)
nunca ganó el campo — el `ProductSchema` de esa acción no lo tiene, así que hoy
no existe ningún camino, ni de panel ni de API, para que alguien marque un
producto como destacado más allá de escribir la columna a mano en la base.
`listAdminProducts` tampoco selecciona `is_featured`, así que el listado no
podría dibujar el chip ni el filtro "destacados" aunque el toggle existiera.

S10 no lo arregló porque los dos archivos que hacen falta tocar —
`src/app/actions/admin-products.ts` y `src/domain/admin-products.ts` (el
`SELECT` de `listAdminProducts`)— están fuera de sus límites duros (§4.7):
`src/app/actions/**` y `src/domain/**`. No hay workaround de piel para esto:
sin una acción que acepte el campo, no hay ningún fetch del lado del cliente
que pueda escribirlo sin inventar un camino nuevo, que el plan prohíbe
explícitamente (§0.9, "no un fetch inventado").

Arreglo: una fase con permiso de tocar `src/app/actions/**` agrega
`isFeatured: z.boolean()` (opcional, default `false`) a `ProductSchema` en
`saveProduct`, lo pasa a `updateProduct`/`createProduct` (que ya lo aceptan), y
suma `isFeatured: products.isFeatured` al `SELECT` de `listAdminProducts`. Con
eso puesto, el toggle en `product-form.tsx`, el chip en el listado y el filtro
"destacados" en `product-filters.tsx` son un cambio chico y quedan afuera de
`src/domain/**`/`src/app/actions/**` de ahí en más.

## La foto de una categoría se carga pegando el `public_id`, no subiendo el archivo — fase S10

`crearCategoria`/`editarCategoria` (O7) aceptan `imageCloudinaryId` como texto,
no como archivo: la subida real (`cloudinary.uploader.upload`) vive hoy sólo
adentro de acciones atadas a una entidad concreta —`uploadProductImage`
(producto), la de banco, la de comprobantes— y todas están en
`src/app/actions/**`, fuera de los límites de S10. Sin una acción
`uploadCategoryImage` (o una genérica), no hay forma de ofrecer un
`<input type="file">` real en `categories-manager.tsx`.

El formulario de categoría de este PR pide el `public_id` a mano (subido antes
a la carpeta `categorias/` por fuera del panel) más el alt. Funciona —los tres
campos ya llegan a `createCategory`/`updateCategory` tal cual— pero es peor
UX que arrastrar un archivo. Arreglo: una fase Opus agrega
`uploadCategoryImage` en `src/app/actions/admin-categories.ts` (mismo patrón
que `uploadProductImage`, carpeta `categorias/`) y S10 (o quien la reemplace)
cambia el campo de texto por el mismo `<input type="file">` que ya usa
`product-images.tsx`.

## El formulario de editar categoría no muestra la descripción ni la foto que ya tiene cargadas — fase S10

`listAdminCategories` (dominio) no selecciona `description`, `imageCloudinaryId`
ni `imageAlt` — sólo `id`, `slug`, `name`, `position`, `isActive` y los dos
conteos de productos. `categories-manager.tsx` no tiene entonces cómo prellenar
esos campos al editar una categoría que ya los tiene puestos.

Se resolvió con un checkbox "Cambiar descripción o foto", destildado por
defecto al editar: mientras esté destildado, esos tres campos ni siquiera
viajan en el payload (`crearCategoria`/`editarCategoria` tratan la ausencia
como "no tocar", no como "borrar") así que editar sólo el nombre de una
categoría con foto no se la borra. Tildarlo permite escribir valores nuevos,
a ciegas de los actuales. Arreglo: sumar las tres columnas al `SELECT` de
`listAdminCategories` (fuera de los límites de S10) y prellenar el formulario
como corresponde.

## `@/db/schema` filtra `drizzle-orm` (y toda la definición de tablas) al bundle del cliente — fase S12

Midiendo el presupuesto de JS (`tests/e2e/presupuesto.spec.ts`, plan-operacion
§6.4) apareció un chunk de ~17 KB gz, presente en `/`, en la página de
producto y en `/checkout`, cuyo contenido es código real de `drizzle-orm`
(el tracer de spans de sus queries) — no un string suelto.

La causa: varios componentes cliente importan un **valor** (no sólo un tipo)
desde `@/db/schema` — `order-status-tabs.tsx` y `order-filters.tsx`
(`ORDER_STATUSES`), `users-manager.tsx` (`USER_ROLES`), `coupons-manager.tsx`
(`COUPON_TYPES`). `schema.ts` define todas las tablas con `mysqlTable(...)`
al alcance del módulo — llamadas con efecto, no puras — así que ningún
bundler puede tree-shakear el resto del archivo (ni su `import` de
`drizzle-orm`) sólo porque el componente use una constante. El resultado es
que esas cuatro pantallas de panel (y cualquier chunk compartido con ellas)
cargan el ORM entero para un array de strings.

No se arregla acá: el archivo que hay que tocar es `src/db/schema.ts`
(fuera de los límites duros de las fases Sonnet, §4.7). Arreglo, cuando una
fase con permiso sobre `src/db/**` lo tome: mover `ORDER_STATUSES`,
`PAYMENT_METHODS`, `USER_ROLES`, `COUPON_TYPES`, `DOC_TYPES` (los arrays de
valores del enum, sin ninguna tabla) a un archivo sin `import` de
`drizzle-orm` — `src/db/enums.ts`, por ejemplo — y que `schema.ts` los
re-exporte para el uso del lado del servidor. Los cuatro componentes de
arriba cambian el import a ese archivo nuevo y el chunk compartido baja sin
tocar una sola línea de dominio.

Mientras tanto, el presupuesto de esta fase ya incluye ese peso en sus
techos (medido, no aspiracional — plan-operacion §9): no bloquea el CI, pero
sí deja usado buena parte del margen del 10% contra el próximo crecimiento
real.

## Reembolso parcial: "ya devuelto" arranca en 0 en cada carga de la pantalla — fase S10

`refund-form.tsx` (nuevo, S10) muestra `amount_pyg`, `refunded_pyg` y lo que
queda por devolver, pero el `refunded_pyg` que recibe como prop
(`refundedPygInicial`) es **siempre 0** al montarse: `findUnmatchedPayments`
(`src/domain/payment-recovery.ts`, dominio) no selecciona
`payments.refunded_pyg`, así que "Pagos sin pedido vivo" —el único lugar de
hoy con los datos de un pago para dibujar algo— no tiene ese número para
pasar. Adentro de la misma sesión de pantalla el número sí se mantiene
correcto (se actualiza en el cliente después de cada reembolso exitoso, sin
volver a preguntarle al servidor), así que el caso roto es sólo: alguien hace
un reembolso parcial, **recarga la página**, y el formulario vuelve a mostrar
"queda por devolver: `amount_pyg`" en vez de restarle lo ya devuelto. El
servidor no se equivoca nunca —`refundPayment` relee `refunded_pyg` real con
la fila bloqueada y rechaza un monto que se pase—, así que esto es sólo un
número mal mostrado, nunca una plata mal movida.

Tampoco hay hoy una consulta de dominio que traiga el pago de un pedido
**vivo** (`enviado`, `entregado`, etc.) para el caso de uso real que describe
plan-operacion §5.3.A ("la compradora se queda con dos de tres remeras"):
`findUnmatchedPayments` excluye a propósito esos pedidos (`SETTLED_STATUSES`),
así que el formulario de este PR quedó montado en "Pagos sin pedido vivo"
(`unmatched-payments.tsx`, dashboard) y no en la ficha del pedido
(`pedidos/[id]`), que es donde el plan lo imaginaba. Los dos huecos son el
mismo: falta una función de dominio tipo `getPaymentForOrder(orderId)` que
devuelva `paymentId`, `amountPyg` y `refundedPyg`. Arreglo: una fase con
permiso sobre `src/domain/**` la agrega, y entonces `refund-form.tsx` se monta
en `pedidos/[id]/page.tsx` con los datos reales en vez de en el dashboard con
un `refundedPygInicial` fijo en 0.
