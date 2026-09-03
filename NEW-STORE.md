# Tienda nueva a partir de este template

Este repo es un **template repository** de GitHub: cada tienda nueva sale de
"Use this template" → repo propio, historia limpia, sin relación de fork con
el original. No copies carpetas a mano y no hagas fork.

La idea del template: **la maquinaria ya está hecha y no se toca**. Por tienda
sólo hay cuatro trabajos — marca, diseño, base de datos, productos.

---

**Los pasos de la base de datos corrélos en tu máquina, en una terminal.**
`docker compose up -d`, `db:push`, `db:seed` y `create-owner` necesitan Docker
Desktop corriendo de verdad, y un contenedor de Claude Code en la nube no tiene
daemon de Docker.

Todo lo demás —el bootstrap, `pnpm nueva-tienda`, el rediseño, el catálogo—
anda igual desde una sesión en la nube, que en la práctica es de donde salieron
las primeras tiendas. `pnpm setup:doctor` reconoce solo ese entorno y degrada el
control de Docker a advertencia en vez de bloquearte; si no lo detecta, forzalo
con `pnpm setup:doctor --skip-docker`. Lo que queda pendiente en ese caso son
los cuatro comandos de arriba, en una máquina con Docker, antes de que la tienda
pueda levantar.

## El camino corto

```bash
git clone <tu-repo> && cd <tu-repo> && pnpm install
git remote add template git@github.com:antonmarklundcom/ecom.git
pnpm setup:doctor              # ¿Node, pnpm, Docker y los remotos están listos?
pnpm nueva-tienda        # seis preguntas: marca, WhatsApp, dominio
docker compose up -d && pnpm db:push && pnpm db:seed && pnpm create-owner
pnpm preflight
```

Eso es si el repo salió de "Use this template" y está vacío. **Si el repo de la
tienda ya existe y ya tiene algo adentro**, el primer paso es otro:
`pnpm bootstrap:repo` — ver §1b.

`pnpm setup:doctor` revisa la máquina, no la tienda: versión de Node contra
`.nvmrc`, versión de pnpm contra `packageManager`, si el daemon de Docker
responde, si los remotos `origin` y `template` son alcanzables (esto último
agarra el caso de una SSH key de GitHub que todavía no está cargada) y si `main`
se quedó atrás de trabajo que vive sin mergear en otras ramas. Corré esto
**antes** de `pnpm nueva-tienda`: los tres problemas que más tiempo hacen
perder — Docker Desktop cerrado, SSH sin configurar, Node viejo — se ven todos
juntos acá en vez de descubrirse uno por uno a mitad del wizard.

```bash
pnpm setup:doctor                 # todo
pnpm setup:doctor --skip-docker   # sé que acá no hay Docker; no me bloquees por eso
```

**El aviso de "main se quedó atrás"** sale de una tienda real: `main` tenía un
ajuste de CI y nada más, mientras meses de trabajo ya mergeado en PRs —marca,
catálogo, rediseño de la home, preparación del deploy— vivían en ramas que
nadie bajó. Nada lo avisaba; se descubrió a mano con `git log` cuando ya
molestaba, y para entonces media sesión se había ido en rehacer cosas que ya
estaban hechas. El doctor mira ahora las ramas locales y las de `origin`, y
avisa si hay dos o más sin mergear cuya punta es más nueva que la de `main` por
más de dos semanas (o una sola con más de mes y medio). Es sólo una advertencia
y nunca bloquea: una rama en vuelo es normal y no tiene que hacer ruido.

Eso es todo lo que se puede automatizar. **Lo único que queda a mano es lo de
terceros**, porque son cuentas de otro que nadie puede abrir por vos:

| Qué | Dónde | Para qué |
|---|---|---|
| Hosting y base | hPanel de Hostinger | `DATABASE_URL` y el deploy (DEPLOY.md) |
| Dominio | tu registrador | `NEXT_PUBLIC_SITE_URL` — el wizard ya lo escribe, falta apuntarlo |
| Cloudinary | cloudinary.com | fotos de producto y comprobantes de pago |
| Pagopar | el comercio | sólo si va con tarjeta; sin credenciales el checkout no la ofrece |
| Datos bancarios | `/admin/banco`, con la tienda arriba | a dónde transfieren (§4a) |
| Fotos y favicon | el comercio | `src/app/favicon.ico` y `/admin/productos` |
| Medición (opcional) | GA4 / Meta Business | `NEXT_PUBLIC_GA4_ID` y/o `NEXT_PUBLIC_META_PIXEL_ID` — con eso el sitio mide visitas y ventas (evento de compra incluido); vacíos, no carga ni un byte de terceros. Ver `.env.example` |

El resto de este documento es el detalle de cada paso: leelo si algo no
cuadra, o si querés saber por qué el wizard hace lo que hace.

---

## Checklist (en orden)

### 1. Crear el repo

1. En GitHub, "Use this template" → repo nuevo (ej. `ropa-store`).
2. `git clone` y `pnpm install`.
3. Agregá el remoto del template **ahora**, no el día que lo necesites:

   ```bash
   git remote add template git@github.com:antonmarklundcom/ecom.git
   ```

   `pnpm nueva-tienda` (paso 2) corre `template:diff --marcar` solo y deja
   `.template-baseline` escrito —commitealo—; sin el remoto no puede, te lo
   avisa, y el primer `pnpm template:diff` corre en modo degradado con los
   commits del template apareciendo todos, para siempre (ver "Arreglos que
   aparecen después" al final).

4. `pnpm setup:doctor` — confirma que Node, pnpm, Docker y los dos remotos están
   listos antes de seguir. Es la máquina, no la tienda; `pnpm preflight`
   (paso 6) es la otra mitad, la de si esta tienda ya puede cobrar.

### 1b. Si el repo ya existe y ya tiene algo adentro

El paso 1 supone el camino de GitHub: repo nuevo, vacío, creado con "Use this
template". En la práctica pasa seguido lo contrario — las tres primeras tiendas
(`productos`, `lenceria`, `mascota`) ya tenían repo propio, con historia,
remoto y contenido, de antes de que este template existiera. Para ésas "Use this
template" no sirve: crearía un repo distinto y habría que mudar todo.

Para ese caso está `pnpm bootstrap:repo`, que copia el árbol del template
adentro de un repo que ya existe:

```bash
# parado en el template
cd ecom
pnpm bootstrap:repo --destino ../lenceria --dry-run   # qué haría
pnpm bootstrap:repo --destino ../lenceria             # hacerlo
```

**No lo hagas a mano.** Lo que sale natural es `cp -a ecom/. ../lenceria/`, y
eso copia también el `.git` del template encima del `.git` del destino: al repo
de la tienda le quedan la historia y el remoto del template. No falla, no avisa;
se descubre al hacer `git push`. `.git` es la primera línea de la lista de
exclusiones del script, y hay un test que lo fija.

Lo que hace y lo que no:

- **excluye** `.git`, `node_modules`, `.next`, `out`, `coverage`, `backups/`,
  `.claude/` y todos los `.env*` menos `.env.example`. Tampoco copia
  `.template-baseline`: ese archivo dice hasta dónde está al día **esa** tienda
  (ver el final de este documento), así que lo escribe `pnpm nueva-tienda` en el
  destino, no el template;
- **no borra nada.** Lo que ya estaba en el destino y el template no conoce
  queda donde está, y se lista al final para que lo mires. Típicamente es el
  sitio viejo: sacalo a mano, o vas a terminar con dos apps mezcladas;
- **se puede correr de nuevo.** No reescribe un archivo cuyo contenido ya es
  idéntico, así que la segunda pasada sólo trae lo que cambió — sirve igual para
  el primer bootstrap que para traer el template al día más adelante;
- **no usa `rsync`**, que no está instalado en todos lados (entre otros, los
  contenedores de Claude Code en la nube, que es justo desde donde se
  bootstrapearon las tres primeras tiendas). Es Node puro;
- **no toca git en el destino**: no commitea, no pushea, no cambia de rama.
  Deja todo en el working tree, que es donde lo querés para mirarlo con
  `git diff` antes de commitear.

Por eso mismo pide que el destino esté limpio (`git status` sin cambios) y se
niega si no lo está: con el working tree limpio, todo lo que escriba el script
se deshace con un `git checkout .`. Si sabés lo que estás haciendo, `--forzar`.

Después de la copia, el resto del camino es el mismo:

```bash
cd ../lenceria
git status                 # mirá qué entró antes de commitear
git remote add template git@github.com:antonmarklundcom/ecom.git
pnpm install
pnpm setup:doctor          # acá te va a avisar si `main` se quedó atrás
pnpm nueva-tienda
```

Ese `pnpm setup:doctor` en un repo que ya tenía vida es el que más paga: es
exactamente el escenario donde `main` puede estar meses atrás de lo que ya se
mergeó en PRs, y bootstrapear encima de un `main` viejo es rehacer trabajo ya
hecho.

### 2. Marca y secretos — `pnpm nueva-tienda`

```bash
pnpm nueva-tienda            # interactivo
pnpm nueva-tienda --dry-run  # muestra qué haría, no escribe nada
```

Pregunta seis cosas —nombre, título del navegador, meta description, tagline
del pie, WhatsApp y dominio— y con eso:

- reescribe los campos de marca de [`src/config/tienda.ts`](./src/config/tienda.ts);
- genera `SESSION_SECRET`, `CRON_SECRET` y `SETUP_SECRET` con
  `crypto.randomBytes` (no con `openssl`, que en Windows no existe) y los
  escribe en `.env.local` junto con el WhatsApp y el dominio;
- imprime el bloque exacto de variables para pegar en el hPanel;
- corre `pnpm template:diff --marcar`.

**Es idempotente:** correrlo de nuevo ofrece los valores de hoy como default
—Enter los deja— y **nunca regenera un secreto que ya exista**. Eso último no
es prolijidad: un `SESSION_SECRET` nuevo cierra todas las sesiones del panel, y
un `CRON_SECRET` nuevo deja al cron de Hostinger llamando con la llave vieja
hasta que alguien lo mire.

Sin terminal interactiva (un script, CI) las seis respuestas van por bandera y
el script falla diciéndolo si falta alguna:

```bash
pnpm nueva-tienda --nombre "Lencería Guaraní" \
  --titulo "Lencería Guaraní — Comprá online en Paraguay" \
  --descripcion "…" --tagline "…" \
  --whatsapp 0981123456 --dominio lenceria.com.py
```

Lo que el wizard **no** hace, a propósito: no toca la base, no sube nada a
ningún lado y no inventa las credenciales de terceros. Eso es lo de la tabla
de arriba.

#### Lo que igual conviene saber

Editás [`src/config/tienda.ts`](./src/config/tienda.ts) a mano cuando quieras
cambiar `lang`, `ogLocale`, los flags o el `hero`. Header, pie, títulos del
navegador y Open Graph salen todos de ahí.

Hay un test que falla si alguien vuelve a escribir el nombre a mano en otro
archivo (`tests/unit/marca-centralizada.test.ts`). Si te grita, la solución es
leer de `TIENDA`, no agregar una excepción. Y si te salteás este paso entero,
`pnpm preflight` bloquea: una tienda con `nombre: "TiendaPY"` no cobra.

Cambiá también el favicon (`src/app/favicon.ico`) — eso ningún control lo
verifica, así que va en la misma pasada.

Dos cosas que **no** son por tienda, a propósito: los números de pedido salen
`PY-000123` en todas las tiendas (el prefijo participa del hash de Pagopar y
cambiarlo con pedidos ya emitidos es tocar el camino de la plata), y las
ilustraciones de `public/placeholders/` sólo conocen las cuatro categorías del
seed — una categoría real sin foto cae en el placeholder genérico, que es feo a
propósito: la solución son fotos, no más placeholders.

La imagen que se ve cuando alguien comparte un link por WhatsApp o Instagram
**no hay que cargarla**: `src/app/opengraph-image.tsx` la dibuja con el nombre
y el tagline de `TIENDA`. Cada ficha de producto usa su foto principal y sólo
cae en esa imagen si el producto todavía no tiene fotos. Lo que sí es
obligatorio es `NEXT_PUBLIC_SITE_URL`: sin el dominio final, la URL de la
imagen sale relativa y el link se comparte sin foto.

### 3. Entorno

`pnpm nueva-tienda` ya creó `.env.local` y completó los secretos, el WhatsApp
y el dominio. Lo que falta completar a mano es lo de terceros. La tabla
entera, para saber qué es cada cosa:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | base local (docker) y después la de Hostinger |
| `SESSION_SECRET` | **lo genera el wizard.** Uno nuevo por tienda, nunca reciclado |
| `WHATSAPP_NUMBER` | **lo escribe el wizard.** El del comercio |
| `BANCO_*` | **legacy/fallback.** Podés dejarlos vacíos: los datos bancarios se cargan desde `/admin/banco` con la tienda ya arriba (ver §4a). Si los ponés y la tabla está vacía, mandan éstos |
| `CLOUDINARY_*` | cuenta de Cloudinary de esta tienda |
| `CLOUDINARY_FOLDER_PREFIX` | opcional, vacío por defecto. Ponelo **si varias tiendas comparten una cuenta de Cloudinary**: el `public_id` de un comprobante sale del número de pedido, y todas las tiendas acuñan `PY-000123`, así que sin prefijo los comprobantes de las dos terminan mezclados en la misma carpeta. Elegilo al crear la tienda y no lo toques más |
| `NEXT_PUBLIC_SITE_URL` | **lo escribe el wizard.** El dominio final |
| `CRON_SECRET` | **lo genera el wizard.** ≥ 16 caracteres, nuevo por tienda |
| `SETUP_SECRET` | **lo genera el wizard.** Va sólo en el servidor y sólo durante el primer deploy: habilita `/api/setup/init` y después se borra (DEPLOY.md §4) |
| `PAGOPAR_*` | credenciales del comercio; vacías = sin tarjeta, o `PAGOPAR_MODE="mock"` para demo |
| `CUSTOMER_SESSION_SECRET` | **sólo** si esta tienda prende las cuentas de cliente (ver abajo). Otro secreto, nunca una copia de `SESSION_SECRET` |

`.env.example` documenta cada trampa — leelo, no lo adivines.

### 4. Base de datos y catálogo

```bash
docker compose up -d     # MySQL local (base `ecom`)
pnpm db:push             # schema + FULLTEXT + FK + contador
pnpm db:seed             # catálogo de ejemplo — reemplazalo por el real
pnpm create-owner        # el primer dueño; el resto se crean desde /admin/usuarios
pnpm dev                 # tienda en / y panel en /admin
```

Para una demo mostrable al cliente antes de tener productos reales:
`pnpm demo` (catálogo + un pedido en cada estado).

Los productos reales entran por dos caminos:

- **Pocos, o de a uno:** el panel, `/admin/productos`.
- **El catálogo entero de una vez:** `pnpm importar:productos lista.csv`. El
  comercio ya tiene su lista de precios en Excel; el formato es el mismo que
  baja el export del panel (una fila por variante: SKU, Producto, Categoría,
  Variante, Precio (₲), Stock) más columnas opcionales — Descripción, Marca,
  IVA, Precio antes (₲), Slug. Separador `;` o `,`, como venga. Sin `--aplicar`
  es un ensayo que sólo cuenta; los errores salen todos juntos con número de
  línea. Idempotente: re-importar actualiza precios sin duplicar y **no pisa el
  stock** de variantes existentes (`--pisar-stock` si de verdad querés eso).
  Las categorías que no existan se crean al final del menú. Las fotos no van
  por acá: se cargan después en `/admin/productos`.

El seed deja un punto de partida que **se termina de ajustar desde el panel**,
sin volver a tocar código:

| Qué | Dónde | Ojo con |
|---|---|---|
| Categorías del menú | `/admin/categorias` | Desactivar una **le saca de la vidriera también a sus productos**; la pantalla te dice cuántos antes de confirmar. Cambiar el slug rompe las URLs viejas: no hay redirección. |
| Zonas de envío | `/admin/envios` | Las del seed son las de Gran Asunción. Una ciudad va en **una sola** zona. La ciudad que no esté en ninguna lista se cobra como la zona activa más cara — conviene tener una zona *Interior* sin ciudades y cara, que haga de comodín. |
| Formas de entrega | `/admin/envios` (abajo) | Courier, moto propia, retiro en el local — y con cuáles se puede pagar. **Vacío está bien**: sin ninguna, el checkout ofrece "Envío a domicilio" con el precio de la zona y los tres medios de pago, que es cómo funcionó siempre. Ver §4e. |
| Datos bancarios | `/admin/banco` | A dónde transfieren. Vacío, la página del pedido avisa en vez de inventar una cuenta. Ver §4a. |

Todas esas pantallas son owner-only.

### 4a. Los datos bancarios se cargan desde el navegador

La transferencia es el método de pago principal de una tienda paraguaya, y el
dato del que depende —banco, titular, RUC, número y tipo de cuenta, más el QR
del SPI— **se carga desde `/admin/banco`**, no desde un archivo. El motivo es
concreto: corregir un dígito mal tipeado de la cuenta era, hasta este PR, un
cambio de variable en el hPanel y un Redeploy a mano; ahora es un botón, y lo
puede hacer el dueño sin llamarte.

Dos reglas que la pantalla sostiene:

- **Los cinco campos van juntos.** Media cuenta cargada mostraría un banco sin
  número, y esa transferencia se hace mal. Con alguno vacío no se guarda nada, y
  la página del pedido sigue avisando que faltan los datos en vez de inventar.
- **El RUC se verifica** con su dígito verificador (módulo 11 de la DNIT). Un
  RUC mal tipeado no rompe nada de este lado: rompe la transferencia de otra
  persona, en el banco.

El QR del SPI es opcional y se sube desde la misma pantalla (JPG/PNG/WebP, hasta
5 MB). Va a una carpeta **pública** de Cloudinary, separada de la de
comprobantes. Sin QR, la página muestra los datos con botón de copiar, que es lo
que hacía siempre.

**Compatibilidad con lo de antes:** los `BANCO_*` del entorno siguen andando y
son el fallback. Tabla vacía ⇒ manda el entorno, así que una tienda que ya está
vendiendo no cambia en nada el día que actualiza el template. En cuanto el dueño
guarda desde el panel, la fila pisa al entorno para siempre — y ahí conviene
vaciar las variables, para que no queden dos verdades. `pnpm preflight` avisa
(sin frenar el deploy) si están vacías, porque desde afuera de la base no puede
saber si la tabla está cargada; el que sí sabe es el cartel de `/admin`.

### 4b. ¿Esta tienda quiere cuentas de cliente?

**Por defecto no**, y para la mayoría de las tiendas ese default está bien: en
Paraguay se compra por WhatsApp y obligar a registrarse antes de la primera
compra es el mayor asesino de conversión que hay. El checkout de invitado es y
va a seguir siendo el camino principal.

La cuenta sirve cuando el comercio quiere **volver a hablarle** a quien ya le
compró: historial de pedidos, datos guardados para la próxima, y una lista de
gente que aceptó recibir novedades (la única que se puede usar para promociones
— comprar no es aceptar que te escriban).

Para prenderla:

1. `cuentasClientes: true` en `src/config/tienda.ts`.
2. `CUSTOMER_SESSION_SECRET` en el entorno: `openssl rand -base64 32`, **uno
   nuevo**, distinto de `SESSION_SECRET`. Con el flag prendido y sin este
   secreto, `/cuenta` rompe con un error explícito — a propósito.

Con el flag apagado, `/cuenta/*` responde 404, el header no muestra nada y el
checkout es exactamente el de siempre. Hay un test de CI
(`tests/unit/flags-apagados.test.ts`) que lo verifica en cada commit.

**Limitación conocida de esta fase:** no hay verificación de teléfono ni de
email — el stack todavía no tiene con qué mandar un mensaje. Consecuencia
concreta: los pedidos que alguien hizo *como invitada* antes de crear su cuenta
**no** aparecen en `/cuenta`, aunque el WhatsApp coincida. Mostrarlos sin
verificar el número dejaría ver el historial de compras de otra persona a
cualquiera que tipee su número al registrarse. Se habilitan solos cuando el
teléfono quede verificado (login por OTP).

### 4c. ¿Entrar sin contraseña? (opcional, apagado)

El login por código de WhatsApp está **construido y listo**, y apagado hasta
que la tienda tenga con qué mandar mensajes. Sin credenciales, el login sólo
ofrece contraseña — nunca aparece un botón que no pueda funcionar.

Para prenderlo hace falta **WhatsApp Cloud API de Meta**, y conviene saber qué
implica antes de prometérselo a un cliente:

1. App en Meta for Developers con el producto WhatsApp.
2. Un número verificado por Meta. **No sirve el WhatsApp común del comercio**:
   tiene que darse de alta en la plataforma, y ese número deja de poder usarse
   en la app normal de WhatsApp.
3. Un token de acceso permanente (los de la consola duran 24 h).
4. Una **plantilla de mensaje aprobada**, con un parámetro en el cuerpo. Ésta es
   la que sorprende: fuera de la ventana de 24 h desde el último mensaje de la
   persona, Meta no permite texto libre, y un código de login siempre cae
   fuera. La aprobación puede tardar días.

Las variables están en `.env.example` (`WHATSAPP_CLOUD_*`).

**En dev no hace falta nada de esto:** sin credenciales y con
`NODE_ENV != production`, el código se imprime en la consola del servidor y el
flujo completo se puede probar. Ese sender **no existe en producción**, a
propósito: los logs de un hosting compartido no son lugar para un código que
abre la sesión de una compradora.

Efecto secundario que vale la pena: entrar con un código **verifica el
teléfono**, y ahí `/cuenta` empieza a mostrar los pedidos que esa persona hizo
como invitada con ese número (ver la limitación del §4b).

**La segunda plantilla: el aviso de pedido nuevo al comercio.** Con las mismas
credenciales de Cloud, la tienda puede avisarle al dueño por WhatsApp cada vez
que entra un pedido, en vez de depender de que la compradora toque el botón.
Meta aprueba las plantillas de a una, así que hay que pedirle **otra**, también
con un parámetro en el cuerpo (el texto del aviso), y ponerle el nombre en
`WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO`. El destino es `WHATSAPP_NUMBER`, el
número del comercio que ya estaba configurado.

Sin esa variable el aviso queda apagado y la tienda no cambia en nada:
`pnpm preflight` lo dice como advertencia. En dev, sin credenciales, el aviso se
imprime en la consola del servidor igual que el código de login. El envío nunca
puede demorar ni hacer fallar un pedido: sale después de que el pedido está
guardado, y salga o falle queda anotado en la historia del pedido.

### 4d. ¿En qué idioma habla esta tienda?

Por defecto `es-PY`, y las URLs quedan en español siempre (son parte del
template). Para otro idioma:

1. Copiá `src/i18n/es-PY.ts` a `src/i18n/<lang>.ts` y traducí **los valores**.
   Las claves no se tocan: son el contrato, y hay un test de CI que exige que
   todos los catálogos tengan exactamente las mismas.
2. Agregalo a `CATALOGOS` en `src/i18n/index.ts`.
3. `lang: "<lang>"` en `tienda.ts`.

`es-PY` queda de fallback por clave, así que una traducción a medio hacer
muestra español donde falte en vez de un `undefined`. No es una red de
seguridad silenciosa: el test de CI no deja mergear un catálogo incompleto.

El catálogo cubre **la vidriera y el panel**: son unas 890 claves, y traducirlas
todas es un rato largo. Si sólo te interesa que compre gente en otro idioma,
empezá por las áreas `header/footer/home/catalogo/producto/carrito/checkout/
pedido/cuenta/error*` y dejá `panel*` y `adminError*` para después — el dueño
suele hablar el idioma del comercio. El test de claves completas se aplica a
los catálogos **registrados**, así que traducí y registrá recién cuando esté
entero.

**La plata no se traduce.** Los montos siguen en guaraníes enteros con su `₲`
(`src/lib/money.ts`): cambiar de moneda no es traducir, es tocar el camino del
dinero. No hay switcher para el visitante ni rutas por idioma — eso sería otra
fase.

### 4e. Formas de entrega (courier, moto, retiro)

**Esto es opcional y se puede dejar para después.** Una tienda recién clonada
no tiene ninguna forma de entrega cargada, y así el checkout se comporta
exactamente como venía: una sola opción implícita, *Envío a domicilio*, con el
precio de la zona y los tres medios de pago. Todo lo de acá es para el comercio
que entrega de más de una manera.

Se cargan en `/admin/envios`, debajo de las zonas. Cada forma de entrega tiene:

| Campo | Qué hace |
|---|---|
| **Tipo** | `Courier` (empresa que lleva), `Reparto propio` (tu moto) o `Retiro en el local`. Retiro no viaja: no cobra flete ni usa zonas, pongas lo que pongas. |
| **Cómo se cobra** | *Con el precio de la zona* (y conserva el envío gratis desde el umbral de esa zona) o *Tarifa plana* (lo mismo siempre, sin umbral). |
| **Zonas donde aplica** | Sin ninguna tildada, aplica a **todas** las zonas activas — el caso del courier nacional. Tildá zonas sólo si esa forma de entrega llega nada más que ahí. |
| **Medios de pago habilitados** | Al menos uno. Es lo que ve quien compra después de elegir esta entrega. |
| **Descripción** | Una línea para el checkout: "Llega en 24-48 h a todo el país". |

**El campo que justifica toda la pantalla es el de los medios de pago.** Contra
entrega sólo tiene sentido donde alguien tuyo va a estar en la puerta para
cobrar: dejalo tildado en la moto propia y destildalo en el courier. El checkout
filtra solo, y el servidor rechaza el pedido si alguien fuerza la combinación.

Una configuración típica de un comercio de Asunción que también manda al
interior:

| Nombre | Tipo | Cómo se cobra | Zonas | Se paga con |
|---|---|---|---|---|
| Moto Asunción | Reparto propio | Tarifa plana ₲15.000 | Asunción, Gran Asunción | Transferencia, contra entrega |
| Courier nacional | Courier | Precio de la zona | (ninguna: todas) | Transferencia, tarjeta |
| Retiro en el local | Retiro | — | — | Transferencia, contra entrega |

El orden importa: es el que ve quien compra, y el primero es el que se usa si
el navegador no eligió ninguno. Se cambia con las flechas.

Dos cosas que conviene saber antes de tocar nada:

- **Cambiar o borrar una forma de entrega no toca los pedidos ya hechos.** El
  flete quedó copiado en el pedido, y también el nombre con el que se entregó.
- **`pnpm preflight` avisa** si dejaste una forma de entrega prendida cuyas
  zonas están todas apagadas: está activa, se ve activa, y no le aparece a
  nadie en el checkout.

### 5. Diseño

#### Del mockup al código

El primer paso de un rediseño por tienda es un mockup de Claude Design: se ve
antes de escribir nada, se corrige barato y evita el rediseño a ciegas. Lo que
cuesta cada vez es lo de después — traducir ese mockup a archivos. Esta tabla es
esa traducción, para no volver a deducirla en cada sesión:

| Lo que ves en el mockup | Dónde vive en el código | Nota |
|---|---|---|
| Paleta: fondo, texto, color principal, bordes | `src/app/globals.css` → `:root` y `.dark` | Tokens de shadcn en **oklch**. Cambiás las variables, no las clases: todo el sitio las consume vía Tailwind |
| Modo oscuro | mismo archivo, bloque `.dark` | Si sólo tocás `:root`, la tienda queda linda de día y rota de noche. Cambiá los dos o ninguno |
| Redondeo de botones, cards, inputs | `--radius` en `globals.css` | Un solo número; `--radius-sm/md/lg/xl` salen de ahí |
| Tipografía (títulos y cuerpo) | `src/app/layout.tsx` | Fuentes de `next/font/google`. Reemplazá `Geist`/`Geist_Mono` manteniendo las variables `--font-geist-sans` / `--font-geist-mono`, que es lo que `globals.css` mapea en `@theme inline` |
| Barra de arriba: logo, buscador, carrito, menú de categorías | `src/components/site-header.tsx` | Libre. Lo único que no conviene sacar es `CartButton` |
| Portada / hero de la home | `hero` en `src/config/tienda.ts`, y si no alcanza `src/components/home-hero.tsx` | Ver abajo: una portada de temporada no necesita tocar código |
| Resto de la home: grilla de destacados, categorías, secciones nuevas | `src/app/page.tsx` | Es de la tienda entera |
| Ficha de producto en la grilla | `src/components/product-card.tsx` | El precio "desde" y el badge de stock salen de `price-tag.tsx` y `stock-badge.tsx` |
| Foto de producto y sus placeholders | `src/components/product-image.tsx`, `public/placeholders/` | Los placeholders sólo conocen las cuatro categorías del seed |
| Pie: columnas, contacto, WhatsApp | `src/components/site-footer.tsx` | El nombre y el tagline salen de `TIENDA`, no los escribas a mano |
| Botón flotante de WhatsApp | `src/components/whatsapp-fab.tsx` | El número sale del entorno (`src/lib/comercio.ts`) |
| Nombre, título del navegador, tagline, meta description | `src/config/tienda.ts` | **Nunca** en un componente: `tests/unit/marca-centralizada.test.ts` lo bloquea |
| Imagen que se ve al compartir el link | `src/app/opengraph-image.tsx` | Se dibuja sola con el nombre y el tagline. No hay que subir nada |
| Favicon | `src/app/favicon.ico` | Ningún control lo verifica; se olvida siempre |

Dos cosas que el mockup va a mostrar y **no** son piel: el checkout
(`src/components/checkout-form.tsx` es markup con lógica de plata adentro — se
repinta con cuidado, ver la tabla de abajo) y `/admin`, que se puede repintar
pero no rediseñar en su lógica.

Orden que funciona: tokens de `globals.css` → tipografía en `layout.tsx` →
header y footer → home → `product-card`. Los dos primeros pasos ya mueven el
80% de lo que se ve, y hacerlos antes evita retocar a mano colores que las
variables iban a resolver solas.

**La portada de la home** se cambia sin tocar código: `hero` en
[`src/config/tienda.ts`](./src/config/tienda.ts) acepta una foto de Cloudinary,
un título, una bajada y un botón. Con `hero: null` (el default) sale la portada
del template. Es lo que le permite al comercio cambiar su banner de temporada
solo; todo lo demás de la home se rediseña editando `src/app/page.tsx`.

Todo el color y el radio viven en `src/app/globals.css` (`:root` y `.dark`,
tokens de shadcn en oklch) y se consumen vía Tailwind. Cambiar la paleta =
editar esas variables, nada más. La tipografía se cambia en
`src/app/layout.tsx` (fuentes de `next/font/google`).

Qué se puede redibujar libremente y qué no:

| Piel — rediseñá lo que quieras | Maquinaria — no la bifurques por tienda |
|---|---|
| `site-header`, `site-footer`, home, `product-card`, páginas de categoría | `src/domain/**` (estados del pedido, stock, plata, Pagopar) |
| tokens de `globals.css`, tipografía, imágenes | checkout y sus rutas API |
| textos y copy | `/admin` completo |
| | `src/lib/**` (sesión, seguridad, guaraníes) |

Regla práctica: si el archivo toca plata, stock o estados de pedido, no se
toca por tienda. Si sólo dibuja, es libre.

#### La única excepción: los `data-testid`

Los specs de `tests/e2e/**` (compra, panel de admin, CSP) localizan los
elementos por `data-testid`, nunca por texto ni por markup — es lo que les
permite correr contra el catálogo real de cualquier tienda, no sólo el del
seed. El contrato completo, con qué elemento lleva cada id, vive en
[`src/lib/testids.ts`](./src/lib/testids.ts).

Rediseñar es libre —cambiar clases, mover el elemento, reescribir el texto
que lleva adentro—, con una sola regla: **no le saques el atributo
`data-testid` a un elemento que ya lo tiene.** Agregarle uno a un elemento
nuevo no rompe nada; sacarle el que ya tenía rompe el spec que lo busca, en
esta tienda y en la próxima sincronización. `tests/unit/testids-contrato.test.ts`
avisa si alguno de la lista deja de aparecer en `src/`.

### 6. Antes de cobrar de verdad

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm preflight     # qué falta para cobrar plata (banco, cron, modo Pagopar)
pnpm reconcile     # control de caja: totales e invariantes entre tablas
```

Deploy: el runbook completo está en **[DEPLOY.md](./DEPLOY.md)** — el flujo git
de Hostinger, las trampas del SSH, la base de datos, el cron cada 15 minutos
contra `/api/cron/vencer-pedidos` y la prueba de humo. Acordate además de
registrar la URL de respuesta de Pagopar.

---

## Arreglos que aparecen después

Los repos creados desde un template **no reciben** los commits posteriores del
template. Si arreglás un bug de checkout acá, las tiendas ya creadas no se
enteran.

`pnpm template:diff` te dice cuáles le faltan a **esta** tienda:

```bash
git remote add template git@github.com:antonmarklundcom/ecom.git
pnpm template:diff              # qué commits del template no están acá
git cherry-pick <sha> <sha>     # los que quieras traer
pnpm template:diff --marcar     # "ya me puse al día"
```

Marca con `*` los que tocan la maquinaria (`src/domain`, `src/lib`, `src/db`,
`src/app/api`, `src/app/actions`, `scripts`, `drizzle`): ésos los quiere toda
tienda. El resto suele ser piel que vos reescribiste, y cherry-pickearlo te pisa
el rediseño. Con `~` marca `src/components/checkout-form.tsx` y `src/app/admin`:
markup tuyo con lógica compartida adentro, así que ahí leé el diff en vez de
cherry-pickear. Las *actions* de admin sí van con `*` — ahí está la plata.

**Trampa:** un repo hecho con "Use this template" **no comparte historia** con
el original, así que `git log HEAD..template/main` lista todo y no sirve. Por
eso el comando guarda un punto de partida en `.template-baseline` —commitealo—
y `--marcar` es el que lo mueve. Si te olvidás de marcar, los mismos commits
te vuelven a aparecer para siempre.

Si algún día son muchas tiendas, recién ahí conviene sacar `src/domain` y
`src/lib` a un paquete compartido. Antes de eso es complejidad sin pagar.
