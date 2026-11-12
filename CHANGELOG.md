# CHANGELOG.md — versiones del template

Cada versión es un tag `vX.Y.Z` sobre `main` de `antonmarklundcom/ecom`.
Publicar una versión dispara `.github/workflows/distribuir.yml`, que abre un PR
de maquinaria en cada tienda de `tiendas.json` (NEW-STORE.md § "La distribución
automática del template"). Un push a `main` ya **no** distribuye: los arreglos
se juntan acá y viajan todos juntos, así cada tienda recibe un PR por versión y
no uno por merge (cada PR corre el CI de esa tienda, y eso son minutos de
Actions).

## Cómo publicar una versión

1. Todo mergeado en `main` y CI verde.
2. `pnpm template:probar-tienda`: una tienda nueva desde ese commit tiene que
   quedar en verde (0 minutos de Actions, corre en tu máquina).
3. Acá abajo, renombrar "Sin publicar" a la versión nueva con la fecha, y dejar
   un "Sin publicar" vacío arriba. **Marcar "Migración: sí"** si algún cambio
   trae una migración en `drizzle/` (la tienda tiene que redeployar y correr
   el setup, NEW-STORE.md § "Migraciones que llegan por `template:sync`").
4. `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z` (anotado: la
   fecha del tag es la que cuenta la edad de un PR de sync en versiones).
   El tag llega **sólo a las canarias** (`"anillo": 0` en `tiendas.json`).
5. Cuando los PRs de las canarias estén verdes y mergeados: Actions →
   "Distribuir a las tiendas" → Run workflow, `tag: vX.Y.Z`, `anillo: 1`. Antes
   y después, `pnpm template:atraso` muestra cuánto le falta a cada tienda.

Versionado: **mayor** si una tienda tiene que hacer algo a mano además de
mergear el PR (variable nueva obligatoria, paso de deploy); **menor** para
funciones nuevas; **parche** para arreglos.

## Sin publicar

**Migración: no.**

- `tiendas.json`: sale la entrada vieja `productos`, entra `anillos` (pausada); lenceria y mascota siguen pausadas (review Q4).

- `pnpm template:adoptar-historial` probado contra MariaDB 10.11 (job "Tests
  en MariaDB"): un `longtext` cuenta como `json` sólo si tiene su CHECK
  `json_valid(col)` (antes cualquier `longtext` pasaba por `json`), ese CHECK
  ya no aparece como un objeto de la tienda, y un MariaDB anterior a 10.2.7
  (donde un default de texto `'NULL'` y "sin default" se leen igual) se niega
  antes de escribir nada. El test de fidelidad leía la base con el motor fijo
  en MySQL: ése era el rojo de MariaDB, no la herramienta.

## v2.0.0 — 2026-11-11

**Migración: sí (0025)** — la última de esta versión; con ella llegan todas
las de después de v1.0.0 (`0014`–`0025`). Después de mergear el PR
`template/sync`: redeployar y correr el setup (NEW-STORE.md § "Migraciones
que llegan por `template:sync`"). Una tienda con migraciones propias se frena
antes de escribir nada (NEW-STORE.md § "Migraciones propias de una tienda").

**Mayor** por la regla de arriba: las fotos pasan a R2 y cada tienda tiene que
crear su bucket, su regla de bloqueo y migrar las fotos a mano (NEW-STORE.md
§ "Migrar las fotos a R2", el paso a paso). Probada en O23 con dos tiendas
desechables creadas desde `45f4336` (`docs/log/o23.md`). El tag y lo que
dispara: `docs/decisions-needed.md`.

- Tienda nueva más rápida (S29): `pnpm nueva-tienda --crear-repo dueño/nombre` crea el repo desde el
  template (privado; `--publico`), lo clona, agrega el remoto `template`, crea el label
  `ci-completo` y corre el wizard; `pnpm registrar-tienda dueño/nombre` abre el PR que la suma a
  `tiendas.json` (anillo y estado) e imprime el único paso manual (acceso del token). El wizard
  escribe `HOSTINGER-CHECKLIST.md` (git-ignored, sin secretos) con los clics del hPanel y los
  valores de la tienda. NEW-STORE.md "En una página" reescrita, más corta.
- Ningún `git` hijo de `scripts/` ni de `tests/` hereda `GIT_DIR` y compañía: `gitEn` (`template:sync` y otros) y los demás spawns usan `envSinGit()`, con un test que lo vigila (`tests/unit/git-sin-entorno.test.ts`).
- `pnpm template:adoptar-historial` (O24): una tienda con migraciones propias
  ya aplicadas en producción adopta la historia del template sin tocar sus
  datos, decidiendo por el esquema real; lo propio pasa a una
  `NNNN_propias_de_la_tienda`. Se niega con la diferencia exacta cuando la base
  no cuadra (hoy, mascota y lenceria). `template:sync` ya no choca en el journal
  de una tienda que adoptó. Regla nueva: una tienda nunca corre `db:generate`
  para portar un arreglo del template (NEW-STORE.md § "Migraciones propias de
  una tienda").
- Distribución por anillos (O28): `tiendas.json` suma `anillo` (0 canaria, 1
  el resto) y `estado` (`activa` | `pausada`); una entrada sin esos campos es
  activa y del anillo 1. Un tag distribuye sólo al anillo 0; el anillo 1 pide
  un "Run workflow" que nombra el tag. Las tiendas reales quedan pausadas hasta
  adoptar la historia de migraciones del template (review F13, O24).
- `distribuir.yml` arma la matrix en lotes (hasta 8 tiendas por job, nunca más
  de 256 jobs) con `max-parallel: 8`, y lee `tiendas.json` de `main` aunque
  distribuya un tag: pausar una tienda vale para la próxima corrida.
- Una rama `template/sync` editada a mano con el PR abierto, o un PR de sync
  abierto por más de dos versiones, dejan esa tienda en **rojo** (antes: un
  aviso y un job verde).
- `pnpm template:atraso`: una fila por tienda con baseline, commits atrás
  (de maquinaria) y edad del PR de sync. `template:ensayar-distribucion` muestra
  el plan por anillo y acepta `--tiendas`, `--origen`, `--anillo` e
  `--incluir-pausadas` (el arnés de tiendas locales).
- Los scripts de la distribución (`distribuir-lote`, `armar-pr-tiendas`,
  `template:atraso`, `template:ensayar-distribucion`) y los tests de O28 corren
  cada `git` hijo sin las variables `GIT_*` del entorno
  (`scripts/ci/entorno-sin-git.mjs`): dentro de un hook, un `git init` o
  `git clone` heredaba `GIT_DIR` y operaba sobre el repo del template.

- **Una tienda con piel o config propia sigue en verde después del sync**
  (O23, docs/TEMPLATE-INHERITANCE.md). Sin migración. Maquinaria: llega sola.
  - Tests de piel: los que miran cómo dibuja el template su propia piel
    (`TESTS_DE_PIEL` en `scripts/template-shared.ts`) revisan un archivo sólo
    mientras es el del template (huellas en `tests/piel-del-template.json`);
    el rediseñado sale *skipped*, no rojo. En el template, después de tocar
    piel: `pnpm exec tsx tests/helpers/piel.ts --escribir`.
  - La suite del template corre con la política de pago del template
    (`tests/setup/config-del-template.ts`), no con el `checkout.ts` ni el
    `STORE_PAYMENT_METHODS` de la tienda.
  - Piel acoplada: si la tienda retocó un tema en `src/styles/temas/`, su
    `globals.css` queda aunque no lo haya tocado (si no, el retoque dejaba de
    cargarse).
  - `template:sync` en Windows: corre `pnpm` por la shell (`pnpm.cmd`), y el
    commit del sync no dispara el pre-commit de la tienda (con los
    `node_modules` de antes del sync dejaba el árbol a medias).

- **Dependencias al día** (S26, rehace #157): 25 subidas menores y parches (next 16.4.3, react 19.3.1, radix, drizzle-orm, mysql2, zod, vitest, playwright…). Sin migración, sin cambios de código; `eslint` sigue en 9. Detalle en `docs/log/s26.md`.

- **La reserva mientras se revisa un comprobante ya no depende de la zona
  horaria del servidor** (`src/domain/receipts.ts`, F1 de
  `fable/REVIEW-2026-11-10.md`). Sin migración. Maquinaria: llega sola por
  `template:sync`. La hora del primer comprobante se leía en la zona del
  proceso: en un servidor fuera de UTC la reserva duraba de más o de menos
  por su desfase. Ahora se decodifica como la columna (UTC).
- **Decisión de hosting por escrito** (`docs/decisions/0001-hosting.md`). Sin
  migración, sólo documentación: una tienda que cobra corre en Hostinger
  Node.js + MySQL; Cloudflare da DNS (sin proxy), R2 y el ruteo de correo; el
  runtime Workers/D1 de productos.new no entra al template.
- **Pagopar: el aviso de pago, leído a la defensiva** (ARCH.md §4.2, TASKS.md
  §21). Sin migración. Maquinaria: llega sola por `template:sync`, la tienda
  no tiene que hacer nada a mano.
  - El webhook ya no usa `request.json()`: `readWebhookBody()` +
    `parseWebhookEvent()` (zod) aceptan el sobre de siempre, el pedido o la
    lista sin sobre, `resultado` como objeto o string con JSON, números como
    strings, BOM, `content-type` equivocado y form-encoded, con tope de 64 KiB.
    Lo que no se puede leer —incluidos un monto ambiguo o varios pedidos
    distintos en un aviso— contesta 400 sin tocar la base y loguea el motivo,
    nunca el cuerpo.
  - El token `sha1(clave + hash_pedido)` se acepta en el querystring **o** en
    el campo `token` del pedido (mismo digest, tiempo constante): la URL de
    respuesta es fija y el token cambia por pedido, así que no puede venir
    fijo en la URL. El token del cuerpo no se guarda en `payment_events` ni se
    loguea.
  - Un aviso `pagado: false` sobre un pedido ya cobrado deja un `log.error`
    (posible reversión); el pedido sigue sin tocarse.
  - Avisos de prueba en `tests/fixtures/pagopar/` (con README que marca qué es
    forma del repo, hipótesis o sintético) y dos tests que los recorren.
  - La doc oficial de Pagopar no se pudo leer desde la sesión: el sobre de la
    respuesta sigue **sin confirmar** (`WEBHOOK_ENVELOPE_CONFIRMED = false`,
    preflight igual que antes). TASKS.md §21 tiene los pasos exactos para
    cuando haya credenciales de sandbox.
- **CI más barato y dependencias con Renovate.** Sin migración.
  - `ci.yml`: un PR (público o privado) corre sólo `checks`. En un repo
    público (el template), `e2e` y `lighthouse` corren después de cada merge
    (push a `main`, gratis) y ya no en cada PR. En uno privado (una tienda)
    el push a `main` sigue sin correr nada; el e2e corre con el label
    `ci-completo`, en el PR `template/sync` de cada versión y a mano, y
    `lighthouse` sólo a mano. Los minutos de una tienda no cambian (~120 por
    mes, NEW-STORE.md § "CI y minutos de Actions").
  - Lighthouse deja el puntaje de performance (mobile, meta ≥ 90) en el
    resumen de la corrida, sin bloquear (`scripts/ci/resumen-lighthouse.mjs`).
  - Renovate (`.github/renovate.json`, sólo en el template) reemplaza a
    Dependabot: sábado a la madrugada, un PR para todo lo menor, seguridad al
    toque, pines de `eslint` < 10, `typescript` < 7 y `@types/node` 22.
  - Una tienda no tiene que hacer nada: el PR `template/sync` le trae el
    `ci.yml` nuevo y le saca `.github/dependabot.yml` si lo tenía. En el
    template, una persona instala la app de Renovate (NEW-STORE.md §
    "Dependencias: Renovate").
- **SEO y caché de la vidriera.** Sin migración. Nada que hacer a mano.
  - La ficha y la categoría pasan a ISR, como la home (`force-static` +
    `revalidate = 300`). Se rearman en cuanto el panel guarda algo, entra un
    pedido o el cron vence uno: `revalidarVidriera()`
    (`src/lib/revalidar-vidriera.ts`), llamada desde cada escritura. Los
    ajustes de la tienda ahora también invalidan la vidriera.
  - Con filtros, orden, página o `?variante=`, `src/proxy.ts` las manda a una
    gemela por request (`…/con-parametros/`) que reusa la misma `page.tsx`.
    Los parámetros de campañas (`utm_*`, `fbclid`, `srsltid`…) salen de la
    caché con `X-Robots-Tag: noindex`.
  - Arreglo: con GA4 o el Pixel prendidos, el `headers()` del layout volvía
    dinámica toda la vidriera (la home perdía el ISR sin avisar).
  - JSON-LD: `Organization` (con logo) y `WebSite` con el buscador pasan al
    layout de todas las páginas; `BreadcrumbList` en la ficha; la miga de pan
    sigue `categories.parent_id`.
  - Sitemap con fecha en categorías y home (la del último producto que
    cambió).
  - `sizes` correctos en todas las fotos de la vidriera, desde
    `src/lib/image-sizes.ts`, con un test que falla si falta.
  - `.lighthouserc.json`: celular, performance ≥ 0.9 como advertencia, más
    accesibilidad, buenas prácticas y SEO.
  - El presupuesto de JS cuenta el JS de la página, no el prefetch de las
    páginas a las que linkea.
  - **Una tienda que rediseñó la ficha o la categoría:** su `page.tsx` queda
    como está (sigue `force-dynamic`, sin caché) hasta que lo pase a ISR:
    `export const dynamic = "force-static"`, `revalidate = 300` y leer
    `searchParams` sólo con `parametrosDeLaUrl()` (NEW-STORE.md §7b, ARCH.md
    §6). `tests/unit/csp-isr.test.ts` lo marca en rojo mientras tanto.
- **Arranque y apagado del servidor en Hostinger; Cloudflare sólo DNS.** Sin
  migración. **No hay que tocar nada en el hPanel**: el `start` sigue siendo
  el script `start`.
  - `pnpm start` sigue siendo `next start`. El control de instancia única es
    **opcional** hasta que O27 lo mida en Hostinger: `pnpm start:guard`
    (`node scripts/start.mjs`, Node pelado, sin tsx) arranca `next start` con
    los mismos argumentos y `PORT`.
    - Antes, si la instancia anterior de esta app quedó viva, la cierra
      (SIGTERM, 15 s, SIGKILL). Sólo si verifica que es suya, con una ficha
      en `/proc/<pid>/environ`: nunca toca un pid reciclado ni otra tienda de
      la cuenta.
    - Reenvía las señales al servidor y sale con su código.
    - `START_GUARD=off` lo apaga y `START_PIDFILE` mueve el pidfile
      (docs/ENV-OPCIONAL.md).
  - Con SIGTERM/SIGINT el servidor termina los requests en curso, cierra el
    pool de MySQL y sale; a los 10 s sale igual (`src/lib/apagado-ordenado.ts`,
    sólo en producción).
  - `pnpm preflight` revisa al final, por DNS y un `HEAD`, si un Cloudflare
    proxeado está delante. **Una tienda con el dominio proxeado empieza a
    salir con código 1**: pasar los registros a "DNS only". Sin red no
    bloquea.
  - DEPLOY.md: § "Procesos que se apilan" (cómo verlos y matarlos por SSH) y
    § "Cloudflare: sólo DNS (nube gris)".
- **Kit de temas: la piel como configuración** (`src/themes/`, NEW-STORE.md §5).
  Migración: no. Una tienda no tiene que hacer nada: sin el campo `tema` en su
  `tienda.ts` se ve exactamente como antes (`clasico`, que es el `neutro` de
  siempre), y un `globals.css` viejo que importa `src/styles/temas/<x>.css`
  sigue andando.
  - Un tema es datos (`src/themes/presets/*.ts`): colores en claro y oscuro,
    radio, escala de la vidriera (espaciado, ancho, letra), variante de header
    (`clasico` | `centrado`) y de pie (`columnas` | `compacto`) y orden de las
    secciones de la home. Cuatro presets: `clasico` (default, el base),
    `vitrina` (nuevo: logo al centro, pie compacto, destacados primero, más
    aire), `calido` y `oscuro-vivo`. Se elige con `tema` en
    `src/config/tienda.ts` o `pnpm nueva-tienda --tema <x>` (`neutro` sigue
    valiendo como alias).
  - `pnpm temas:css` genera `src/themes/temas.css` (todos los temas, cada uno
    bajo `<html data-tema>`) y mantiene al día los archivos de
    `src/styles/temas/`; `temas.test.ts` falla si quedó viejo.
  - `src/themes/custom.css`: retoques de CSS de la tienda, cargado último.
    `template:sync` no lo pisa nunca (`DE_LA_TIENDA` en
    `scripts/template-shared.ts`), aunque la tienda no lo haya tocado.
  - La vidriera ya no escribe colores a mano: estrellas, descuento, favorito
    y el velo de la portada y los modales leen semánticos (`--estrella`,
    `--oferta`, `--favorito`, `--velo`, `--sobre-velo`) con default en
    `src/themes/semanticos.css` (los mismos valores de antes).
    `tests/unit/piel-sin-colores.test.ts` bloquea un color nuevo escrito a
    mano en un componente de la tienda.
  - Para una tienda con `globals.css` propio (productos): si quiere `vitrina`
    o un preset nuevo, cambia su `@import "../styles/temas/<x>.css";` por
    `@import "../themes/temas.css";` y suma `@import "../themes/custom.css";`
    al final (NEW-STORE.md §5, "Tiendas de antes del kit"). Si no, nada.
- **Importación del catálogo como función del panel, y una sola planilla
  para export, panel y CLI** (docs/CATALOGO-CSV.md). Columnas canónicas en
  orden fijo (SKU, Producto, Categoría, Variante, Precio (₲), Stock,
  Descripción, Marca, IVA, Precio antes (₲), Slug, Fotos, [Proveedor, URL
  proveedor, Costo proveedor, Stock proveedor], Modo de venta, Mostrar
  precio); los encabezados viejos siguen entrando como alias. El **export del
  panel cambia de formato**: antes bajaba 8 columnas, ahora la planilla
  completa (con Slug, Descripción, Fotos, etc.), que vuelve a entrar sin
  cambios en esta tienda o en otra. Vista previa con avisos y **posibles
  productos repetidos** que hay que marcar como revisados (`--revisado` en la
  CLI); la escritura va **por lotes de 25 productos**, cada uno atómico (antes
  era todo el archivo en una transacción), con el avance a la vista y aviso
  claro si se corta la conexión. Columnas de proveedor sólo con
  `proveedores` prendido (si no, se ignoran con aviso). La CLI acepta `.xlsx`.
  Datos de ejemplo: `scripts/fixtures/catalogo-demo.csv`. Migración: no. A
  mano: nada; quien tenga macros o fórmulas sobre el CSV de productos del
  panel tiene que revisar las columnas nuevas.
- **Proveedores (dropshipping) en el panel, opcional y apagado**, y orden
  manual de destacados. **Migración: sí** (`0025`: tabla `supplier_offers`,
  `products.supplier_url` y `products.featured_position`, todas aditivas).
  - `proveedores: true` en `src/config/tienda.ts` suma a la ficha del panel el
    enlace privado de compra y las ofertas de proveedores por variante (costo,
    stock declarado, enlaces https, preferida y margen bruto). Owner y staff.
    Nunca llega a la vidriera, el feed, el sitemap ni el JSON-LD. Ver
    NEW-STORE.md §4b-bis y ARCH.md § "Proveedores".
  - Con el flag apagado —el default— el panel y la tienda quedan iguales. No
    toca los modos de venta (`enquiry`/`showcase`) ni el stock, las reservas o
    los pedidos.
  - "Orden en destacados" en la ficha del panel, para todas las tiendas: la
    home ordena los destacados por ese número y después por fecha de
    publicación. En 0 (el default) el orden es el de antes.
  - `/api/health` ahora prueba la consulta de destacados de la home.
  - Una tienda existente: después del deploy, correr el setup para aplicar la
    `0025` (como toda migración). Su `tienda.ts` no necesita cambios; el campo
    `proveedores` es opcional.
- **R2 reemplaza a Cloudinary para fotos, comprobantes y backups.** Migración:
  no (las columnas `cloudinary_id` quedan con su nombre; cambian sólo las
  propiedades de TypeScript: `imageRef`, `storageKey`, `qrImageRef`). **Cada
  tienda tiene que hacer algo a mano** antes de subir fotos o recibir
  comprobantes: crear su bucket de R2 con dominio público, la regla de WAF que
  bloquea `/comprobantes/*` y `/backups/*`, y un token del bucket, y cargarlo en
  `/admin/integraciones` → R2 (DEPLOY.md §3b). Las que ya tenían fotos en
  Cloudinary corren una vez `pnpm fotos:migrar-cloudinary -- --cloud <nombre>
  --aplicar` (NEW-STORE.md § "Migrar las fotos a R2"); hasta entonces cada foto
  vieja se ve como el placeholder, nunca rota. `TIENDA.hero.imagen.cloudinaryId`
  pasa a ser `imageRef` en `src/config/tienda.ts`.
  - Integración R2 (Account ID, access key, secret cifrado, bucket, dominio
    público; panel > entorno > apagado) y "Probar conexión" que escribe, lee
    y borra un archivo privado y avisa si el dominio público lo sirve.
  - Fotos del panel (producto, categoría, portada, logo, favicon, QR):
    preparadas en el navegador (WebP 240/480/800/1200 + JPEG, ≤ 1200 px),
    verificadas en el servidor por los bytes, claves inmutables con el hash
    del contenido, y la fila se inserta recién después de escribir en R2.
    Se dibujan con `<picture>` y `srcset`.
  - La importación por planilla baja las fotos en el servidor (https, topes de
    tiempo, tamaño y redirecciones, contenido mirado por los bytes); nuevos
    `pnpm fotos:preparar`, `fotos:subir` y `fotos:reparar` para cargas grandes.
  - Comprobantes privados en `comprobantes/` con URL prefirmada de 2 minutos.
  - Backup en un set por tabla con un manifiesto escrito al final; `pnpm
    restore -- --r2 ultimo` y `pnpm restore` rechaza un set incompleto o con un
    conteo o hash que no coincide (el `.jsonl.gz` de formato 2 sigue andando).
  - `pnpm preflight` bloquea sin R2, sale con 1 si el dominio público sirve un
    canario privado, y avisa cuántas referencias de fotos no son de R2.
  - CSP: `img-src` con el dominio público del bucket (y, en el panel, el
    endpoint S3 de la cuenta para ver comprobantes). Sale la dependencia
    `cloudinary`; entran `aws4fetch` y `sharp`.

- **Panel, cuenta y catálogo accesibles** (docs/TEMPLATE-IMPROVEMENT-PLAN.md
  F1–F6). Sin migración.
  - Errores del panel: los formularios de producto, variante, categoría y
    ajustes marcan el campo con error (`aria-invalid`, mensaje en
    castellano), llevan el foco ahí y abren la sección plegada.
  - Cuenta: la clienta escribe la contraseña nueva dos veces y la puede
    mostrar.
  - Tarjeta de producto: el corazón ya no está adentro del link.
  - Filtros:
    - en el celular se pliegan;
    - el total se anuncia;
    - cada conteo tiene en cuenta los otros filtros;
    - el de precio sólo aparece si algo muestra precio;
    - "Limpiar todo" conserva el orden.
  - `/comparar` ya no manda el catálogo entero al navegador.
  - Fotos ilustrativas: llevan leyenda también en las tarjetas y en "vistos
    recientemente".
  - Nuevo spec `accesibilidad.spec.ts` (axe, escritorio y 390 px).
  - Una tienda con la página de categoría rediseñada puede pasarle a
    `CatalogFilters` `showPrice` y `facets`, y envolver los filtros en
    `FilterDisclosure`.
- **Lo verificado lo sella el servidor; las fotos dicen de dónde salen**
  (docs/TEMPLATE-IMPROVEMENT-PLAN.md E1–E6). **Migración: sí** (`0024`:
  `product_images.provenance` y `verified_at`; redeploy + setup).
  - La fecha de verificación ya no se tipea en el JSON: la casilla
    "Verifiqué estos datos" la sella con la hora del servidor y tu usuario
    (privado).
  - Guardar sin cambios conserva el sello; cambiar sin confirmar deja los
    datos sin verificar.
  - Una planilla nunca verifica, y un duplicado empieza sin verificar.
  - Cada foto se marca como propia, autorizada o ilustrativa. Una
    ilustrativa no sale en la imagen para compartir, el JSON-LD ni el feed.
  - La ficha comparte con el nombre del sitio y una imagen siempre.
  - Un producto puede volver a un slug suyo anterior.
  - El JSON-LD ya no publica el GTIN de "la primera variante con stock".
  - El feed no afirma `identifier_exists=no` ni agrupa variantes sin una
    dimensión declarada.
  - Archivo nuevo de la tienda: `src/config/public-facts.ts`.
- **Cobrar lo que el checkout de verdad ofrece** (docs/TEMPLATE-IMPROVEMENT-PLAN.md
  D1–D5). `pnpm preflight` evalúa los medios de pago efectivos (Ajustes >
  `STORE_PAYMENT_METHODS` > `checkout.ts`, con el banco de `/admin/banco`) y
  bloquea si no queda ninguno que cobre; antes decía "Nada bloquea el cobro"
  con el checkout cerrado. `STORE_PAYMENT_METHODS` vacía ya no cierra todo
  (es "no está"), y una sección de Ajustes rota cierra en vez de reabrir. Sin
  almacenamiento de comprobantes, la página del pedido ofrece WhatsApp en vez
  de un formulario que fallaba. El comprobante se registra bajo el lock del
  pedido (no más cupo excedido ni comprobantes colgados de pedidos
  cancelados) y la reserva de stock se sostiene hasta el primer comprobante +
  48 h (`src/config/receipt-review.ts`, archivo nuevo de la tienda). Sin
  migración.
- **La planilla no pisa ni muda lo que no dice** (docs/TEMPLATE-IMPROVEMENT-PLAN.md
  C1–C7). Importar es todo o nada (categorías incluidas); una columna ausente
  no toca lo guardado (antes, una planilla de SKU y precio dejaba IVA 10,
  descripción y marca vacías, variantes "Único" y, con "pisar stock", stock
  0); un SKU con otra mayúscula o acento ya no muda la variante de otro
  producto; lo nuevo entra como **borrador** y lo apagado no se prende; un
  cambio de precios o de stock por planilla lo aplica sólo el dueño
  (`precios.masivo`) y queda auditado, igual que un cambio de precio en el
  editor de variantes. El export trae Slug, Descripción, Marca, IVA y Precio
  antes: exportar e importar el mismo archivo no cambia nada. Sin migración.
- **La historia de migraciones se cuida sola** (docs/TEMPLATE-IMPROVEMENT-PLAN.md
  B1–B7). `template:sync` (también `--dry-run` y `distribuir.yml`) y
  `template:diff --marcar` se frenan **antes de escribir** cuando la tienda
  tiene migraciones propias y el template trae otras, o cuando alguien
  reescribió una migración publicada: drizzle saltea sin avisar una migración
  más vieja que la última aplicada. Cómo salir: NEW-STORE.md § "Migraciones
  propias de una tienda". `pnpm db:check`, `/api/version` y el nuevo
  `migrations` de `/api/health` dicen qué migraciones faltan o se saltearían;
  `db:migrate` y el setup se niegan a migrar sobre una historia cruzada y no
  esperan más de 30 s un lock. El backup vuelca las tablas de la migración que
  la base tiene aplicada (antes, entre deploy y migración, fallaba). `/api/health`
  suma `backup` (el backup automático no corrió bien en 26 h) y el resumen del
  panel lo avisa al dueño. Los scripts aceptan el `--` que pasa pnpm 11.
  **Monitores de uptime:** la palabra clave documentada
  (`"db":true,"cron":true`) dejó de coincidir cuando se agregó `catalog`;
  usar `"db":true,"catalog":true,"cron":true,"migrations":true` (DEPLOY.md §8).
  Sin migración.
- **₲0 no se vende ni se muestra** (docs/TEMPLATE-IMPROVEMENT-PLAN.md A1–A3).
  El carrito rechaza una variante sin precio cobrable aunque esté publicada
  (filas viejas incluidas), el panel no deja publicar con stock una variante
  activa en ₲0 (borradores, variantes apagadas y productos de consulta siguen
  aceptando 0), la vidriera no dibuja "₲ 0" ni "−100 %", el orden por precio
  y el filtro "hasta ₲X" los ignoran, y el resumen del panel cuenta las
  variantes viejas que quedaron a la venta sin precio. Los productos de
  consulta y muestra ya no publican cuántas unidades hay en depósito. Arregla
  además el error 500 de una ficha sin precio de referencia (`ORDER BY 0` en
  "también te puede interesar"). Sin migración.
- **Identidad desde el panel** (`/admin/ajustes` → Identidad): nombre, logo,
  favicon y color de marca, sin tocar `tienda.ts` ni redeployar. `tienda.ts`
  queda como default. Todo lo que mostraba `TIENDA.nombre` (header, títulos,
  Open Graph, remito, mensajes, feed) lee ahora `nombreTienda()`.
- **Cuentas de cliente desde el panel** (`/admin/ajustes` → Cuentas de
  cliente), y **`CUSTOMER_SESSION_SECRET` ya no hace falta**: vacío, se deriva
  de `SESSION_SECRET` con HKDF. Las tiendas que lo tienen cargado siguen igual.
  `cuentasClientesHabilitadas()` se mudó a `src/lib/cuentas.ts` y es async.
- **`/setup`**: la configuración inicial desde el navegador (mismo POST que el
  curl a `/api/setup/init`; sólo existe con `SETUP_SECRET` puesto).
- Sin migración: todo vive en `store_settings` (JSON). Piel rediseñada: ver
  NEW-STORE.md §4a-quater para que header y pie propios lean el nombre y el
  logo del panel.
- **Integraciones desde el panel (`/admin/integraciones`, sólo el dueño).
  Migración: sí (`0017`, tabla nueva `integration_settings`).** Cloudinary,
  WhatsApp (número del comercio, Cloud API y plantillas), Pagopar, GA4/Pixel y
  el reporte de errores se cargan sin tocar el hPanel ni redeployar. Precedencia
  panel > entorno > apagado; secretos cifrados con AES-256-GCM (clave derivada
  de `SESSION_SECRET`), nunca devueltos al navegador; "Probar conexión";
  `pnpm preflight` dice de dónde sale cada valor; el CSP sigue a la medición
  efectiva. **Las tiendas existentes no tienen que hacer nada**: sin filas en
  la tabla, todo sale de sus variables de entorno como antes. Después del sync,
  correr el setup para aplicar la migración (NEW-STORE.md § "Migraciones que
  llegan por `template:sync`").
- **`.env.example` mínimo:** trae sólo las cinco imprescindibles
  (`DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`,
  `SETUP_SECRET`), porque Hostinger lo lee y precarga un campo del hPanel por
  variable. Las demás —con los mismos comentarios— se mudaron a
  `docs/ENV-OPCIONAL.md`; `TEST_DATABASE_URL` pasó al README. **Una tienda
  existente no tiene que hacer nada**: las variables que ya cargó en el hPanel
  siguen funcionando igual, ninguna cambió de nombre ni de significado.
- **`template:sync` trae la maquinaria que le falta a la tienda**, aunque el
  template no la haya cambiado desde el baseline. Antes sólo miraba lo que
  cambió en `baseline..objetivo`, y un baseline marcado "al día" con archivos
  de menos los escondía para siempre: productos llegó a 15 archivos faltantes
  (`src/lib/spreadsheet.ts` entre ellos, que `admin-products.ts` importa) sin
  que nada lo avisara. La piel que falta se sigue respetando.
- **`template:diff` lista esa maquinaria faltante, y `--marcar` se niega**
  mientras falte algo (`--forzar` para marcar igual).
- **Dependencias más viejas que las del template:** en `package.json`, una
  versión de la tienda más vieja que la del template pierde siempre (se lista
  como pisada). Antes contaba como "cambio de la tienda" y se quedaba:
  productos siguió con `iron-session` 8 y React 19.2 y el build no pasaba.
- **Temas propios sin tocar maquinaria:** `tests/unit/temas.test.ts` revisa
  todos los `.css` de `src/styles/temas/`; una tienda con su tema ya no tiene
  que sumarlo a `TEMAS` en `scripts/nueva-tienda.ts` (NEW-STORE.md §5).
- **`distribuir.yml` falla sin `TIENDAS_TOKEN`** en vez de terminar en verde
  con un aviso: en trece corridas no distribuyó nada y nadie se enteró.

Migración: sí (`product_reviews`, `order_returns`, `order_return_items`,
`store_settings`).

- **Planilla de productos con fotos:** la columna opcional `Fotos` (una o más
  URLs `https://` separadas por `|`, espacio o salto de línea) sube las fotos
  a Cloudinary sola al importar — desde `/admin/productos` o
  `pnpm importar:productos --aplicar` — sólo a un producto que todavía no
  tiene ninguna, para que reimportar la misma planilla no duplique nada. Sin
  credenciales de Cloudinary se avisa y se sigue sin ellas; una foto que falla
  no frena el resto de la importación.
- **Ajustes de la tienda (`/admin/ajustes`, sólo el dueño):** bajada, título y
  descripción de la home, portada (con foto subida a Cloudinary), barra de
  anuncio, WhatsApp público, email, dirección, horario y redes, sin tocar
  `tienda.ts` ni el entorno. Vacío = el de siempre, así que una tienda que no
  entra al panel se ve igual que antes. Una fila JSON (`store_settings`): los
  ajustes que vengan después no traen migración. Los avisos al dueño siguen
  yendo a `WHATSAPP_NUMBER`; el número público es el del panel si está.
  La home publica un `Organization` en JSON-LD cuando hay
  `NEXT_PUBLIC_SITE_URL`.
- **Páginas de políticas:** `/envios`, `/devoluciones`,
  `/preguntas-frecuentes`, `/terminos` y `/privacidad`, con textos de arranque
  editables desde el panel (hay que revisarlos antes de lanzar), enlazadas en
  el pie y en el sitemap. Se pueden apagar de a una.
- **Google:** con los datos de envío y devolución cargados en el panel, cada
  `Offer` del JSON-LD de producto lleva `shippingDetails` y
  `hasMerchantReturnPolicy`. Lo que no se cargó no se publica.
- **Vidriera y checkout:** estrellas y cantidad de reseñas en las tarjetas de
  producto (una consulta agrupada por listado), barra de compra fija en el
  celular en la ficha, y un recuadro "Comprá tranquilo" en el checkout con los
  medios de pago que de verdad se ofrecen. Los tres se apagan desde el panel.
- **Stock bajo:** el umbral global (resumen del panel y aviso diario) se
  cambia desde el panel; el de cada variante sigue ganando.
- **Tiendas con piel propia:** `layout.tsx`, `site-footer.tsx` y `page.tsx`
  son piel y `template:sync` no los pisa; la barra de anuncio, los links a las
  páginas y el contacto del pie hay que sumarlos a mano (NEW-STORE.md §4a-bis).

- **Reseñas verificadas:** sólo quien recibió el pedido (estado `entregado`)
  califica, una vez por producto, desde la página de su pedido. El panel
  (`/admin/resenas`, owner y staff) publica, rechaza y responde en público,
  pero no crea ni edita reseñas. Las aprobadas salen en la ficha y en el
  JSON-LD (`aggregateRating` + `review`) para las estrellas de Google. Aviso
  opcional por WhatsApp al entregar: `WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RESENA`
  (vacía = apagado).
- **Devoluciones de mercadería:** en la ficha del pedido (enviado, entregado
  o reembolsado) se registra qué volvió, cuánto de cada línea (nunca más de
  lo vendido) y si vuelve al stock — con su fila en `stock_adjustments` y el
  aviso de "volvió el stock" si estaba agotada. Listado en
  `/admin/devoluciones` (owner y staff). El reembolso sigue siendo un paso
  aparte. La compradora ve "¿Querés cambiar o devolver algo?" por WhatsApp
  con el pedido entregado.
- **Comprobantes de más de 1 MB:** Next cortaba el body de las server
  actions en 1 MB y una foto de comprobante de 2 MB terminaba en la pantalla
  de error. `next.config.ts` ahora sube el límite al del archivo más grande
  (`src/lib/upload-limits.ts`); lo mismo para fotos y planilla.
- **Reservas de stock con MySQL fuera de UTC:** cada conexión del pool fija
  `time_zone = '+00:00'`. Con la hora del servidor (Hostinger: `SYSTEM`), las
  reservas vencían antes de nacer o duraban horas de más. CI corre MySQL a
  -03:00 para que no vuelva.
- **Checkout:** no vende productos sin publicar ni de una categoría apagada
  (un carrito viejo o un POST armado a mano los compraba). El tope de un
  cupón por cliente ya no se pasa con dos checkouts simultáneos del mismo
  WhatsApp. Y editar un pedido sin bajarle el subtotal (corregir la
  dirección) ya no le quita el cupón si el comercio subió el mínimo después.
- **Seguridad:** la limpieza del rate limit usaba la ventana de quien la
  disparaba (una búsqueda de 60 s) y borraba los intentos de login, OTP y
  registro de los últimos 15 min: el tope de login pasaba de 8 cada 15 min a
  ~8 por minuto. Y el log y el reporte de errores (`ERROR_REPORT_URL`) ya no
  llevan la query de la ruta, donde viajan el token del pedido y el secreto
  del cron.
- **Fábrica de tiendas:** `pnpm nueva-tienda` ya no mueve un
  `.template-baseline` existente, y el primero lo marca en el commit del que
  salió la tienda (`template:diff --marcar --origen`), no en la punta de hoy
  —que daba por traídos arreglos que nunca llegaban—. `bootstrap:repo` marca
  el commit que copió. La distribución vuelve a abrir PR en una tienda cuyo
  PR anterior se cerró o se mergeó con squash (antes la salteaba para
  siempre, en verde). `template:sync` trae rutas con tildes y avisa aparte la
  piel rediseñada que el template borró o renombró. `.gitattributes` fija LF.
- **SEO:** el `Product` JSON-LD de la ficha lleva `image`, `url` e
  `itemCondition` (sin imagen Google no da rich result de producto ni listado
  de comercio). Lo arma `productJsonLd` en `src/lib/seo.ts`.
- **Feed de productos `/feed.xml`** para Google Merchant Center y el
  catálogo de Meta: fichas gratuitas en Google Shopping y anuncios de
  catálogo e Instagram Shopping sin cargar productos a mano (NEW-STORE.md §7).
- **Embudo para GA4 y Meta:** `view_item`/`ViewContent` en la ficha,
  `add_to_cart`/`AddToCart` al agregar y `begin_checkout`/`InitiateCheckout`
  en el checkout, con el SKU como id (el mismo `g:id` del feed). Sin
  medidores configurados no carga ni manda nada.
- **Purchase con productos:** el evento de compra de GA4/Meta lleva las
  líneas con el SKU como id (atribución al catálogo) y no se manda para un
  pedido que ya está vencido, cancelado o rechazado cuando se abre el link.
- **Arranque de una tienda:** DEPLOY.md ya no manda `"seed": true` al setup
  (sembraba el catálogo de ejemplo —auriculares, termos— a la venta al lado
  del real) y el cuerpo de ejemplo trae las zonas de envío, que no son
  opcionales. El resumen del panel avisa si quedan productos de ejemplo
  activos o si no hay ninguna zona activa (el envío sale gratis a todo el
  país).
- **Cron de vencimientos visible:** `vencer-pedidos` deja su latido en
  `job_runs`, y el resumen del panel le avisa al dueño si nunca corrió o si
  lleva más de 2 h sin correr. Sin ese cron los pedidos sin pagar no vencen,
  el stock queda reservado y no sale ningún recordatorio — sin nada roto a la
  vista. `/api/health` suma `"cron"`: el monitor de DEPLOY.md §8 ahora
  busca `"db":true,"cron":true`.
- **`next.config.ts`: `experimental.cpus: 1`** (el fix de Hostinger de
  lenceria, vendercrm y propia: un solo build worker, para que un deploy no
  agote los procesos que comparte la cuenta). En una tienda que ya lo tenía
  (lenceria), el PR de sincronización trae un conflicto de un bloque en ese
  archivo: quedarse con el del template.
- CI: un label que no es `ci-completo` ya no cancela la corrida del PR. Con
  Dependabot (que etiqueta el PR apenas lo abre) ningún job llegaba a correr.

## v1.0.0 — 2026-09-22

**Migración: sí** (para las tiendas cuyo baseline es anterior a O5/O14: la
`0011`–`0013` llegan con esta versión). Primera versión publicada: ninguna
distribución corrió antes, así que cada tienda recibe **todo** lo que el
template cambió desde su `.template-baseline`, no sólo lo de esta lista. El PR
de cada tienda lista archivo por archivo qué trae. Después de mergearlo:
redeployar y correr el setup (NEW-STORE.md § "Migraciones que llegan por
`template:sync`").

- `.env.example` ya no trae un WhatsApp de ejemplo y `pnpm preflight` bloquea
  el viejo (`+595981123456`) si quedó en un `.env.local`.
- CI según el repo: en uno **público** (gratis en Actions) `checks` y `e2e`
  corren en cada PR y en cada push a `main`, y `lighthouse` en cada push a
  `main`. En uno **privado**: sólo PRs, `e2e` con el label `ci-completo`, a
  mano o en un PR de distribución, `lighthouse` a mano. Poner `ci-completo`
  dispara la corrida. En los dos: nada en PRs de sólo docs y se cancela la
  corrida vieja. `distribuir.yml` y `pnpm-al-dia.yml` no corren en las tiendas.
- Hook `pre-push` con `pnpm test:unit` (unitarios en paralelo, ~15 s, sin
  base); `pnpm test` sigue corriendo todo.
- Las tiendas ya no heredan `fable/`, Dependabot ni `tiendas.json`
  (`SOLO_TEMPLATE`): `nueva-tienda` los borra, `bootstrap:repo` no los copia,
  `template:sync` los saca.
- **`template:sync` trabaja archivo por archivo** (baseline → versión nueva), no
  commit por commit: en las tres tiendas reales el cherry-pick se frenaba en el
  primer commit que tocaba algo que la tienda había cambiado. Ahora la piel que
  la tienda cambió queda, la maquinaria se fusiona (`package.json` por clave),
  los tests cambiados de los dos lados toman el del template, `src/i18n/es-PY.ts`
  se fusiona (textos de la tienda + claves nuevas), los docs del template
  (`KNOWN-ISSUES.md`, `ARCH.md`, `NEW-STORE.md`, `CHANGELOG.md`) toman el del
  template, y todo queda en un commit. `tests/` y `.husky/` pasan a ser
  maquinaria (un arreglo que sólo tocaba un test no llegaba a las tiendas).
- `distribuir.yml`: corre el `template-sync.ts` del template contra la tienda
  (ya no copia el script adentro, que chocaba consigo mismo, ni corre
  `pnpm install` de la tienda con el token en el entorno); una sola rama
  `template/sync` por tienda (no un PR nuevo por corrida) que no pisa commits
  hechos a mano; base = default branch de la tienda; un conflicto abre el PR en
  draft con los marcadores commiteados (antes no abría nada); crea el label
  `ci-completo` en la tienda. `TIENDAS_TOKEN` necesita además **Workflows:
  write** (NEW-STORE.md).
- `tiendas.json`: productos, lenceria y mascota. Sólo acepta `repo`, `dominio`
  y `notas`, y un test rechaza credenciales o datos de la base de Hostinger.
- Nuevos `pnpm template:probar-tienda` (una tienda nueva desde HEAD, en verde) y
  `pnpm template:ensayar-distribucion [--verificar]` (la distribución contra
  cada tienda de `tiendas.json` en clones temporales, sin empujar nada).
- La suite avisa si corre contra MariaDB (T3).
