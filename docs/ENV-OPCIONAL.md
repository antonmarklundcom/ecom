# Variables de entorno opcionales

`.env.example` trae **sólo las cinco variables imprescindibles** para que una
tienda arranque en producción: `DATABASE_URL`, `SESSION_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` y `SETUP_SECRET` (`NODE_ENV` lo pone el
hosting). Es a propósito: Hostinger (Node.js Web Apps + GitHub) lee
`.env.example` y precarga un campo de "Environment variables" por cada
variable que encuentra. Con las ~45 de antes, el hPanel de una tienda nueva
arrancaba con 45 campos vacíos y ninguna pista de cuáles importaban.

Todo lo demás está acá, con **los mismos comentarios y trampas** que tenía
`.env.example`. Nada de esta documentación se perdió: sólo se mudó a un
archivo que Hostinger no lee como plantilla.

Reglas que siguen valiendo para todas:

- **Vacía = apagada.** Cada variable de este archivo, vacía o ausente, apaga
  su feature (o cae en el fallback que dice su comentario) — nunca rompe la
  tienda ni usa un valor inventado.
- En desarrollo local van en `.env.local` (nunca en `.env`). Copiá el bloque
  que necesites; los bloques son `dotenv` válido.
- En producción van en el hPanel → **Environment variables**, una por una, y
  después hay que apretar **Redeploy**: cambiar una variable no rebuildea.
- Ningún secreto lleva el prefijo `NEXT_PUBLIC_`.

**La mayoría ni siquiera hace falta en el hPanel.** R2
(`R2_*`), WhatsApp (`WHATSAPP_NUMBER`, `WHATSAPP_CLOUD_*`), Pagopar
(`PAGOPAR_PUBLIC_KEY`, `PAGOPAR_PRIVATE_KEY`, `PAGOPAR_BASE_URL`), la medición
(`NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_META_PIXEL_ID`) y `ERROR_REPORT_URL` se
cargan desde **`/admin/integraciones`**, sin redeploy, con los secretos
cifrados en la base (NEW-STORE.md §4a-ter). Precedencia: **lo del panel > la
variable de este archivo > apagado**. Las variables siguen andando como
fallback — una tienda que ya las tiene cargadas no cambia en nada — y los
comentarios de abajo valen igual para los dos lugares (las trampas de Meta, de
Pagopar y de R2 son las mismas).

Se quedan sólo en el entorno: `CUSTOMER_SESSION_SECRET`, `PAGOPAR_MODE`, las
`PAGOPAR_SANDBOX_*` (tests), `FACTURAPY_*` (sin uso todavía), los `OWNER_*` y
los `BANCO_*` (esos se cargan en `/admin/banco`).

`TEST_DATABASE_URL` (la base de los tests de integración) también está acá
abajo y en el README: es sólo de desarrollo, y en `.env.example` era una
trampa — si alguien la apuntaba a la base real, el runner de tests la borra.

## Tests de integración (sólo desarrollo)

```dotenv
# Base separada para los tests de integración: el runner la BORRA y la recrea
# en cada corrida, por eso el nombre tiene que contener "test". Dejala vacía y
# esos tests se saltan solos (los unitarios siguen corriendo).
TEST_DATABASE_URL="mysql://ecom:ecom@localhost:3306/ecom_test"
```

## Sesión de cliente (iron-session)

```dotenv
# **Ya no hace falta.** Vacía, el secreto de las sesiones de cliente se deriva
# de SESSION_SECRET con HKDF (otro secreto, independiente del del panel), y las
# cuentas se prenden desde /admin/ajustes → Cuentas de cliente. Cargala sólo si
# querés un secreto propio; una tienda que ya la tenía sigue usando la suya.
#
# Si la cargás, la trampa de siempre: tiene que ser **otro** secreto, no una
# copia de SESSION_SECRET. Son dos poblaciones distintas —empleados del panel y
# compradoras— y compartir el secreto es lo que hace posible que una cookie de
# una sirva del otro lado. Mismo comando, valor nuevo:
#   openssl rand -base64 32
#
# Cargada con menos de 32 caracteres, las rutas de `/cuenta` tiran un error
# explícito (no cae al derivado): una config rota tiene que romper fuerte, no
# fallar en silencio. `pnpm preflight` lo bloquea si las cuentas están prendidas.
CUSTOMER_SESSION_SECRET=""
```

## WhatsApp Cloud API (login sin contraseña)

```dotenv
# Sólo si esta tienda quiere ofrecer "entrar con un código por WhatsApp" además
# de la contraseña. Vacío = la opción no se ofrece, y el login sigue siendo
# sólo contraseña. Nunca aparece un botón que no pueda funcionar.
#
# Lo que hay que conseguir de Meta antes de que esto sirva (NEW-STORE.md §4c):
#
#   1. App en Meta for Developers con el producto WhatsApp agregado.
#   2. Un número verificado por Meta. **No sirve el WhatsApp común del
#      comercio**: tiene que estar dado de alta en la plataforma.
#   3. Un token de acceso permanente. Los que da la consola por defecto duran
#      24 horas y después de eso todo falla en silencio.
#   4. Una plantilla de mensaje **aprobada**. Ésta es la trampa que sorprende:
#      fuera de la ventana de 24 h desde el último mensaje de la persona, Meta
#      no deja mandar texto libre, y un código de login siempre está fuera de
#      esa ventana. La aprobación puede tardar días.
#
# La plantilla necesita exactamente un parámetro en el cuerpo (el código).
# En dev, sin nada de esto, el código se imprime en la consola del servidor y
# el flujo se puede recorrer entero.
WHATSAPP_CLOUD_PHONE_NUMBER_ID=""
WHATSAPP_CLOUD_ACCESS_TOKEN=""
WHATSAPP_CLOUD_TEMPLATE_NAME=""

# Recuperación del enlace privado: plantilla aprobada distinta a la del login.
# Un parámetro de cuerpo: URL completa del pedido. Vacía = sólo se recupera
# desde una cuenta con teléfono verificado, o mediante contacto con la tienda.
WHATSAPP_CLOUD_TEMPLATE_RECUPERAR_PEDIDO=""
# Opcional: por defecto v21.0
WHATSAPP_CLOUD_API_VERSION=""

# Segunda plantilla aprobada por Meta: el aviso al COMERCIO de que entró un
# pedido nuevo (fable/plan.md §5.2). Es otra plantilla y hay que pedirla
# aparte —Meta las aprueba de a una—, con **un** parámetro en el cuerpo (el
# texto del aviso, igual que la del login).
#
# Vacía = el comercio no recibe aviso y la tienda es exactamente la de antes:
# `pnpm preflight` lo dice como advertencia, no como bloqueo. Además necesita
# WHATSAPP_NUMBER (más abajo): ése es el destino.
#
# En dev, sin credenciales de Cloud, el aviso se imprime en la consola del
# servidor y se puede ver el flujo entero.
WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO=""

# Tres plantillas más, para los avisos a la COMPRADORA (O3, sigue a la de
# arriba). Cada una es una decisión aparte del comercio y Meta las aprueba de
# a una, con **un** parámetro en el cuerpo (el texto del aviso):
#
#   CONFIRMADO — el pedido quedó registrado (justo después de crearse).
#   PAGADO     — se registró el pago: transferencia aprobada, Pagopar
#                acreditado o contra entrega confirmada, cualquiera sea el
#                camino.
#   ENVIADO    — el pedido salió a reparto.
#
# Cada una vacía apaga SÓLO ese aviso — a diferencia de la de arriba, acá no
# hay sender de consola de respaldo: sin la plantilla no sale ni en dev,
# porque cuál de los tres avisos manda cada tienda es una decisión suya, no
# un default. No necesitan WHATSAPP_NUMBER: el destino es el WhatsApp de cada
# compradora, que ya está en su pedido.
WHATSAPP_CLOUD_TEMPLATE_CLIENTE_CONFIRMADO=""
WHATSAPP_CLOUD_TEMPLATE_CLIENTE_PAGADO=""
WHATSAPP_CLOUD_TEMPLATE_CLIENTE_ENVIADO=""

# Una cuarta del mismo grupo (O15), y la única que no la dispara un cambio de
# estado sino el reloj: el **recordatorio de pago**. Sale una sola vez por
# pedido, cuando a un pedido sin pagar le quedan menos de 6 horas de reserva,
# desde el mismo cron que vence pedidos (no hay entrada nueva que agregar en el
# hPanel). Dice el número, el total, hasta qué hora puede pagar y el link a su
# pedido — nada de datos bancarios: ésos ya están en esa página.
#
# Un parámetro en el cuerpo, como las demás, y Meta la aprueba aparte.
#
# **Vacía = apagado**, y la tienda queda exactamente como antes: el pedido que
# se olvidaron vence en silencio, que es lo de hoy. `pnpm preflight` lo dice
# como advertencia, no como bloqueo.
WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RECORDATORIO=""

# Otra más del mismo grupo: el **pedido de reseña**. Sale una sola vez por
# pedido, cuando pasa a entregado (mismo disparo que ENVIADO, desde el panel):
# "¿Qué tal tu pedido PY-000123? Contanos qué te pareció: <link a su pedido>".
# En esa página está el formulario de reseña, que sólo aparece con el pedido
# entregado — las reseñas son de compras verificadas, ver src/domain/reviews.ts.
#
# Un parámetro en el cuerpo, como las demás, y Meta la aprueba aparte.
#
# **Vacía = apagado**: el formulario sigue en la página del pedido para quien
# entre, pero nadie la invita por WhatsApp.
WHATSAPP_CLOUD_TEMPLATE_CLIENTE_RESENA=""

# El resumen diario al dueño (O6): comprobantes por revisar, pedidos sin pagar
# hace más de un día, stock bajo y las ventas de ayer. Lo manda el cron de
# `/api/cron/resumen-diario` una vez por día — ver DEPLOY.md para la entrada
# del hPanel.
#
# Un parámetro en el cuerpo (el texto completo del resumen). Va al número de
# WHATSAPP_NUMBER, igual que el aviso de pedido nuevo.
#
# **Vacía = el dueño no recibe el resumen.** Sin plantilla no sale ni en dev:
# es un mensaje diario, y una tienda recién actualizada no puede empezar a
# mandarlo sola. `pnpm preflight` avisa si falta.
WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO=""

# "Avisame cuando haya stock" (O6): el aviso que recibe una compradora que se
# anotó para una variante agotada, cuando vuelve a haber.
#
# Un parámetro en el cuerpo. El destino es el teléfono que ella dejó.
#
# **Vacía = la feature entera está apagada**: el formulario no se dibuja y el
# alta se rechaza. Guardar suscripciones que nadie va a poder avisar sería
# prometer algo que la tienda no puede cumplir. Es opcional de verdad —
# `pnpm preflight` no la pide.
WHATSAPP_CLOUD_TEMPLATE_STOCK_DISPONIBLE=""
```

### Puerto del navegador de pruebas

```dotenv
# Vacío = 3000. Para una validación local aislada, elegí otro puerto libre.
# `test:full` usa el mismo puerto para el servidor, los enlaces y las mediciones.
E2E_PORT=""
```

## Cuenta del dueño (pnpm create-owner)

```dotenv
# Opcionales: si no están, el script las pregunta por consola. No hay ruta
# pública de registro — esta es la única forma de crear un usuario del panel.
OWNER_EMAIL=""
OWNER_PASSWORD=""
OWNER_NAME=""
```

## R2 (Cloudflare): fotos, comprobantes y copias de seguridad

Un bucket de R2 **por tienda**, con un dominio público propio (`Settings →
Custom Domains` del bucket, por ejemplo `imagenes.tienda.com.py`). El template
habla con R2 por su API compatible con S3, sobre HTTPS, desde Node: no hay
Workers ni bindings. Lo normal es cargarlo desde `/admin/integraciones` → R2
(el secret queda cifrado y nunca vuelve al navegador); estas variables son el
fallback. Vacías y sin nada en el panel, **no se puede subir ninguna foto**
(el panel lo dice), la compradora no puede subir el comprobante y el backup
automático se saltea; `pnpm preflight` bloquea.

```dotenv
# El Account ID de Cloudflare (32 hex, arriba a la derecha del dashboard de
# R2). Es el subdominio del endpoint S3: https://<id>.r2.cloudflarestorage.com
R2_ACCOUNT_ID=""
# Un token de API de R2 con permiso "Object Read & Write" **sólo sobre este
# bucket** (R2 → Manage API tokens). El secret NUNCA va a un archivo
# commiteado ni a un NEXT_PUBLIC_: con él se leen los comprobantes.
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
# El nombre del bucket (minúsculas, números y guiones).
R2_BUCKET=""
# El dominio público del bucket, https y sin barra final. Es lo único que ve el
# navegador: las fotos se arman como <R2_PUBLIC_URL>/p1/<slug>-<hash>-480.webp.
# Ese dominio tiene que BLOQUEAR /comprobantes/* y /backups/* (regla de WAF,
# DEPLOY.md): `pnpm preflight` lo prueba con un canario y bloquea si no.
R2_PUBLIC_URL=""
```

Lo que hay en el bucket:

- `p1/…` — fotos **públicas** (producto, categoría, portada, logo, favicon, QR
  del banco). Nombre con el hash del contenido: nunca se pisan, se cachean un
  año (`immutable`), y quitar una foto de la galería **no** borra el archivo.
- `comprobantes/<aleatorio>/…` — **privados**. El panel los muestra con una URL
  prefirmada de dos minutos.
- `backups/backup-<fecha>-<aleatorio>/…` — **privados**. Un objeto por tabla y
  un `manifest.json`; 14 días de retención.

## WhatsApp

```dotenv
# Formato +5959XXXXXXXX, sin espacios ni guiones — se usa tal cual en wa.me
# links. Vacía a propósito: un número de ejemplo acá terminaba de default en
# `pnpm nueva-tienda` (Enter y listo) y la tienda salía a producción mandando
# a los compradores a un WhatsApp ajeno. Vacía = sin botón de WhatsApp, y
# `pnpm preflight` bloquea hasta que se cargue el real.
#
# Dos usos, y desde /admin/ajustes se separan:
#   - Los avisos AL DUEÑO (pedido nuevo, resumen diario, el link "avisar" del
#     panel) van SIEMPRE a este número.
#   - El número PÚBLICO (botón flotante, pie, páginas de políticas, "consultá
#     por WhatsApp") es éste mientras el dueño no cargue otro en
#     /admin/ajustes → "Contacto y redes". Cargado ahí, gana el del panel.
WHATSAPP_NUMBER=""
```

## Datos bancarios (SPI/QR, ARCH.md §5) — LEGACY / FALLBACK

```dotenv
# Desde la FASE 2 (PR T) esto se carga desde **/admin/banco**, con la tienda ya
# arriba y sin redeploy: banco, titular, RUC, cuenta, tipo de cuenta y el QR.
# Es lo que conviene — corregir un dígito del número de cuenta desde el hPanel
# obliga a un Redeploy a mano; desde el panel es un botón, y lo aprieta el
# dueño.
#
# Estas variables siguen andando y son **el fallback**: sin fila cargada en la
# tabla `bank_details`, la tienda muestra lo que esté acá. Una tienda que ya
# venía con esto configurado no cambia en nada. En cuanto se guarda desde el
# panel, la fila pisa al entorno — y ahí conviene vaciar estas variables, para
# que no queden dos verdades.
#
# Sin inventar valores, como siempre: si falta cualquiera de los cinco en las
# dos fuentes, la página del pedido muestra un aviso en vez de datos bancarios
# — mismo criterio que el 503 del webhook de Pagopar sin configurar. `/admin`
# le pone un cartel al dueño cuando pasa eso.
BANCO_NOMBRE=""
BANCO_TITULAR=""
BANCO_RUC=""
BANCO_CUENTA=""
BANCO_TIPO_CUENTA=""

# URL pública de la imagen del QR SPI — también legacy. Lo normal ahora es
# subir el QR desde /admin/banco (va a R2, público bajo `p1/`, nunca con los
# comprobantes, que son privados). Esta variable se sigue usando cuando la
# fila no tiene QR propio. Dos formas de completarla:
#   1) Subí el archivo a `public/banco-qr.png` y dejá "/banco-qr.png".
#   2) Pegá cualquier URL https:// pública de la imagen.
# Vacía y sin QR en el panel, la sección muestra sólo los datos con botón de
# copiar, sin QR.
BANCO_QR_URL=""
```

## Pagopar (PR #5, post-lanzamiento)

```dotenv
# Trampa: PAGOPAR_PRIVATE_KEY firma el token de cada request
# (sha1(PRIVATE_KEY + order_number + total_pyg)) — si se filtra, cualquiera
# puede iniciar transacciones a nombre del comercio Y falsificar avisos de
# pago. Con las tres vacías, el checkout no ofrece tarjeta y el webhook
# responde 503 en vez de aceptar cualquier cosa.
PAGOPAR_PUBLIC_KEY=""
PAGOPAR_PRIVATE_KEY=""

# Modo de la pasarela: vacío / "real" (default) o "mock".
#
# `mock` levanta una Pagopar simulada en memoria: sin red, sin credenciales y
# sin cuenta. El checkout ofrece tarjeta, manda al comprador a /dev/pagopar/...
# —una pantalla de esta misma app— y desde ahí se dispara el aviso de pago
# contra la ruta real del webhook, firmado como corresponde. Sirve para
# demostrar el ciclo completo (pendiente_pago → pagado) y para provocar a mano
# los casos feos: aviso repetido, monto distinto, firma inválida.
#
# El simulador NO existe en producción: con NODE_ENV=production el modo se
# apaga solo y cada función del simulador tira si alguien la llama igual
# (src/domain/pagopar/mode.ts, tests/unit/pagopar-mock-mode.test.ts). Dejar
# esta variable en "mock" en el servidor real no habilita nada.
PAGOPAR_MODE=""

# Host de la API, sin barra final, tal como figura en la documentación 2.0 de
# Pagopar (el path `/api/comercios/2.0/...` lo pone el cliente). No tiene
# default en el código a propósito: una URL "por si acaso" es la forma de
# mandarle los datos del comercio al host equivocado.
#
# Trampa: Pagopar no llama a `localhost`. Para probar el webhook en desarrollo
# hace falta un túnel con HTTPS y registrar esa URL como "URL de respuesta".
#
# También se usa para armar el link a la página de pago alojada por Pagopar
# (PLAN.md 5.5, ver `pagoparCheckoutUrl` en src/domain/pagopar/config.ts) —
# confirmar contra la doc si el host de esa página difiere del de la API.
# En el panel del comercio de Pagopar ("Integrar con mi sitio web"):
#   URL de respuesta (el aviso de pago):  https://tu-dominio/api/webhooks/pagopar
#   URL de redireccionamiento / retorno:  https://tu-dominio/pedido/pagopar/retorno
# Lo que falta confirmar del aviso y los pasos con credenciales: ARCH.md §4.2
# y TASKS.md §21.
PAGOPAR_BASE_URL=""

# Credenciales del sandbox, sólo para el test de integración que fija el
# formato de la respuesta del webhook (tests/integration/pagopar-sandbox.test.ts).
# Vacías, ese test se saltea solo.
PAGOPAR_SANDBOX_PUBLIC_KEY=""
PAGOPAR_SANDBOX_PRIVATE_KEY=""
PAGOPAR_SANDBOX_BASE_URL=""
```

## FacturaPY (fase 2, no usado en el MVP)

```dotenv
# Trampa: la tienda nunca toca la DB de FacturaPY directamente — sólo llama a
# su API pública con este token.
FACTURAPY_API_KEY=""
FACTURAPY_BASE_URL=""
```

## Medición (GA4 / Meta Pixel) — opcional

```dotenv
# Vacíos, la tienda no carga ni un byte de terceros (como siempre). Con uno o
# los dos, el layout carga el medidor y la página del pedido manda el evento
# de venta (purchase/Purchase) con el monto en guaraníes, una vez por
# navegador. El CSP se abre solo para los hosts del medidor configurado
# (src/proxy.ts) — no hay nada más que tocar.
#
# Estos ids NO son secretos (viajan en el HTML de cualquier sitio que mida):
# el prefijo NEXT_PUBLIC_ acá es correcto.
#
# GA4: el "ID de medición" del flujo web, formato G-XXXXXXXXXX
# (Administrar → Flujos de datos → tu web). Trampa: es el id de MEDICIÓN, no
# el "ID de la propiedad" (numérico) ni la URL — un valor con otro formato se
# ignora entero, no se carga "más o menos".
NEXT_PUBLIC_GA4_ID=""

# Meta Pixel: el id numérico (Administrador de eventos → Orígenes de datos).
NEXT_PUBLIC_META_PIXEL_ID=""
```

## Reporte de errores (O8)

```dotenv
# Reporte de errores a un webhook propio (O8). **Opcional y apagado de fábrica.**
#
# Sin esta variable, un error del servidor queda en el log del hPanel y **no
# sale nada de la máquina**: no hay telemetría, no hay SDK de terceros, no hay
# un default "por si acaso".
#
# Con ella, `src/instrumentation.ts` hace un POST con
# `{ message, stack, path, method, reqId, sha }`. Sirve para un webhook de
# Slack, de Discord o de n8n. Tiene que ser `https://` (el reporte lleva el
# mapa interno del servidor) y tiene un tope de 10 por minuto, para que una
# tormenta de errores no sea además una tormenta de POSTs.
#
# **Qué NO viaja, ni con esto configurado:** teléfonos, nombres, direcciones,
# tokens de acceso a pedidos, cookies, cuerpos de request, ni ninguna variable
# de entorno.
ERROR_REPORT_URL=""
```

# Proxy y sesiones

```dotenv
TRUSTED_PROXY_HOPS=""
```

`TRUSTED_PROXY_HOPS` (por defecto `1`) elige la IP desde la derecha de
`X-Forwarded-For`. Antes de abrir la tienda, comprobar que el proxy sobrescribe
o agrega la IP observada y confirmar la cantidad de saltos (por ejemplo, `2`
con un proxy adicional). Una cabecera reenviada sin validar no prueba identidad.
Los límites por IP viven en cada proceso; los intentos de OTP se guardan en DB.

La migración de seguridad cierra las cookies existentes: cada login incorpora
`session_version`, y cada guard consulta el estado actual de la cuenta. Un
cambio de rol, desactivación o contraseña revoca las sesiones previas.

## Arranque del servidor (`pnpm start:guard`, opcional)

```dotenv
START_GUARD=""
START_PIDFILE=""
```

`pnpm start` es `next start` y **no lee ninguna de estas dos**. Sólo cuentan
con `pnpm start:guard` (`node scripts/start.mjs`), que arranca `next start` y,
antes, cierra la instancia anterior de esta app si quedó viva y se puede
verificar que es nuestra (DEPLOY.md § "Procesos que se apilan"). El guard es
**opcional hasta que la fase O27 lo mida en Hostinger**: suma un proceso Node
por tienda contra el cupo compartido de la cuenta y nunca corrió allá. Con el
guard puesto y las dos vacías, es su comportamiento por defecto.

- `START_GUARD=off` apaga el control: arranca `next start` pelado, sin
  pidfile y sin cerrar nada. Es la salida de emergencia si algún día molesta,
  sin tocar `package.json`. Cualquier otro valor (o vacía) lo deja prendido.
  El apagado ordenado del servidor (cerrar el pool de MySQL con SIGTERM) no
  depende de esto.
- `START_PIDFILE`: ruta del pidfile. Vacía, uno en el directorio temporal del
  sistema con nombre derivado de la ruta de la app (sale en el log del
  arranque). Cargala con una ruta fija sólo si Hostinger arranca la app desde
  un directorio distinto en cada deploy y el log muestra que el pidfile del
  deploy anterior no se encuentra.

La variable `ECOM_SERVIDOR_FICHA` que aparece en el entorno del servidor la
pone el guard; no se carga a mano.

### Required database validation

```dotenv
REQUIRE_DATABASE_TESTS=""
```

Set `REQUIRE_DATABASE_TESTS=1` to refuse integration skips. `pnpm test:full` requires a disposable TEST_DATABASE_URL, then runs typecheck, lint, all tests, build and browser tests. CI also refuses missing test database configuration.

## Política de pago opcional

```dotenv
STORE_PAYMENT_METHODS=""
```

`STORE_PAYMENT_METHODS`: lista separada por comas de `transferencia`, `contra_entrega`, `tarjeta`. Prioridad: selección explícita del dueño en Ajustes > variable > `src/config/checkout.ts`. **Vacía o en blanco es como no tenerla** (manda `src/config/checkout.ts`), igual que cualquier variable opcional: pegar este bloque tal cual no cierra el checkout. Un valor inválido (un método mal escrito) cierra los medios de pago en vez de abrir uno que nadie eligió, y una selección vacía **en Ajustes** es una pausa a propósito. Los requisitos de banco y proveedor se aplican siempre en servidor, y `pnpm preflight` bloquea si con la política efectiva no queda ningún medio que pueda cobrar (docs/TEMPLATE-IMPROVEMENT-PLAN.md D1–D2). La plantilla mantiene los tres métodos como política por defecto, sin inventar datos bancarios.
