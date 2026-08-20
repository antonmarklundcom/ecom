# Tienda nueva a partir de este template

Este repo es un **template repository** de GitHub: cada tienda nueva sale de
"Use this template" → repo propio, historia limpia, sin relación de fork con
el original. No copies carpetas a mano y no hagas fork.

La idea del template: **la maquinaria ya está hecha y no se toca**. Por tienda
sólo hay cuatro trabajos — marca, diseño, base de datos, productos.

---

## Checklist (en orden)

### 1. Crear el repo

1. En GitHub, "Use this template" → repo nuevo (ej. `ropa-store`).
2. `git clone` y `pnpm install`.

### 2. Marca — un solo archivo

Editá [`src/config/tienda.ts`](./src/config/tienda.ts): nombre, título, meta
description, tagline del pie, `lang` y `ogLocale`. Header, pie, títulos del
navegador y Open Graph salen todos de ahí.

Hay un test que falla si alguien vuelve a escribir el nombre a mano en otro
archivo (`tests/unit/marca-centralizada.test.ts`). Si te grita, la solución es
leer de `TIENDA`, no agregar una excepción.

Cambiá también el favicon (`src/app/favicon.ico`).

La imagen que se ve cuando alguien comparte un link por WhatsApp o Instagram
**no hay que cargarla**: `src/app/opengraph-image.tsx` la dibuja con el nombre
y el tagline de `TIENDA`. Cada ficha de producto usa su foto principal y sólo
cae en esa imagen si el producto todavía no tiene fotos. Lo que sí es
obligatorio es `NEXT_PUBLIC_SITE_URL`: sin el dominio final, la URL de la
imagen sale relativa y el link se comparte sin foto.

### 3. Entorno

`cp .env.example .env.local` y completá. Lo que cambia sí o sí por tienda:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | base local (docker) y después la de Hostinger |
| `SESSION_SECRET` | `openssl rand -base64 32` — **uno nuevo por tienda**, nunca reciclado |
| `WHATSAPP_NUMBER` | el del comercio |
| `BANCO_*` | datos reales de la cuenta; incompletos, la página avisa en vez de inventar |
| `CLOUDINARY_*` | cuenta o folder propio de esta tienda |
| `NEXT_PUBLIC_SITE_URL` | dominio final |
| `CRON_SECRET` | ≥ 16 caracteres, nuevo por tienda |
| `SETUP_SECRET` | sólo en el servidor y sólo durante el primer deploy: habilita `/api/setup/init` y después se borra (DEPLOY.md §4) |
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

Los productos reales se cargan desde el panel (`/admin/productos`), o
adaptando `scripts/seed.ts` si vienen de un CSV/planilla.

El seed deja un punto de partida que **se termina de ajustar desde el panel**,
sin volver a tocar código:

| Qué | Dónde | Ojo con |
|---|---|---|
| Categorías del menú | `/admin/categorias` | Desactivar una **le saca de la vidriera también a sus productos**; la pantalla te dice cuántos antes de confirmar. Cambiar el slug rompe las URLs viejas: no hay redirección. |
| Zonas de envío | `/admin/envios` | Las del seed son las de Gran Asunción. Una ciudad va en **una sola** zona. La ciudad que no esté en ninguna lista se cobra como la zona activa más cara — conviene tener una zona *Interior* sin ciudades y cara, que haga de comodín. |

Las dos pantallas son owner-only.

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

### 5. Diseño

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
