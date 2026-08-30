# Deploy a Hostinger (Websites → Node.js + MySQL)

Este es el runbook del deploy, adentro del repo y no en la cabeza de nadie.
Vale para cualquier tienda salida de este template: el producto de Hostinger es
**Websites** con la app de Node.js conectada a git, y la base es un MySQL del
mismo hPanel.

El orden importa. Cada sección de acá abajo salió de algo que ya rompió una vez.

---

## 1. Conectar el repo (git deploy)

En el hPanel, dentro del sitio:

1. **Websites → tu sitio → Advanced → GIT**: pegá la URL del repo y la rama
   (`main`). Si el repo es privado, copiá la clave pública que muestra
   Hostinger y cargala como *deploy key* en GitHub (Settings → Deploy keys).
2. **Node.js**: versión **22** (la misma de `.nvmrc` y del CI), y los comandos:

   | Campo | Valor |
   |---|---|
   | Install command | `npm install` |
   | Build command | `npm run build` |
   | Start command | `npm start` |

   **Con `npm`, no con `pnpm` — a pesar de que el repo entero desarrolla y
   corre CI en pnpm.** Esto no es lo que hubiéramos elegido de entrada; es lo
   que quedó después de que el primer deploy real (ver §2.1) tardó cuatro PRs
   en salir. La versión corta: pnpm 11 en el hosting compartido de Hostinger
   lanza un subproceso anidado que no encuentra su propio binario en el PATH
   y el deploy se cae con `ENOENT` aunque el install ya había terminado bien;
   ningún pin de versión lo arregla porque Corepack ahí siempre corre la
   versión que Hostinger ya trae instalada. La mitigación que sí funciona es
   instalar con npm, usando el `package-lock.json` que este repo versiona
   junto a `pnpm-lock.yaml` — **no** dejar que Hostinger "detecte" el proyecto
   solo, que resuelve el árbol de cero sin ese lockfile y te deja en
   producción versiones que nadie testeó.

   Pisá los tres campos antes del primer deploy y verificá que quedaron
   guardados: el panel a veces los vuelve a su valor detectado si guardás la
   sección dos veces.

   `package-lock.json` se regenera con `npm install` (nunca a mano) cada vez
   que cambia `pnpm-lock.yaml`, y el build tiene que pasar con **los dos**
   lockfiles antes de mergear — la segunda línea de abajo reproduce
   exactamente lo que corre Hostinger, variable de entorno incluida, y es la
   única forma de agarrar el bug de `NODE_ENV=production` de §2.1 antes de
   que lo agarre el deploy:

   ```bash
   pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
   rm -rf node_modules && NODE_ENV=production npm install && NODE_ENV=production npm run build
   ```

3. **Environment variables**: cargá una por una las de `.env.example` que la
   tienda necesita — `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`,
   `WHATSAPP_NUMBER`, `CLOUDINARY_*`, `NEXT_PUBLIC_SITE_URL`, `PAGOPAR_*` si va
   con tarjeta, y `NODE_ENV=production`.

   Los `BANCO_*` **ya no hacen falta acá**: los datos bancarios se cargan una
   vez desde `/admin/banco` con la tienda arriba, y eso es lo que conviene —
   corregir un dígito del número de cuenta desde el hPanel obliga a un
   Redeploy (ver el aviso de abajo), y desde el panel es un botón. Siguen
   funcionando como fallback para las tiendas que ya los tenían cargados: si
   están puestos y la tabla está vacía, la tienda muestra los del entorno.

   No hay `.env.local` en el servidor: en Hostinger las variables viven en el
   panel, no en un archivo. Lo que no cargues ahí, no existe.

> **Cambiar una variable en el panel de Hostinger NO reinicia ni rebuildea la
> app.** Guardás el valor nuevo, el panel te dice "guardado", y el proceso que
> está atendiendo sigue corriendo con el build viejo y los valores viejos. Hay
> que apretar **Redeploy** a mano. Esto es la causa número uno de "cambié la
> contraseña de la base y el sitio sigue tirando Access denied".

**Trampa:** el deploy automático por push también arrastra esto. Un push
rebuildea, pero un cambio de variable sin push no dispara nada — si tocaste
sólo variables, Redeploy es obligatorio.

### Las `NEXT_PUBLIC_*` se hornean en el build, no se leen al arrancar

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA4_ID` y `NEXT_PUBLIC_META_PIXEL_ID` no
son variables que el servidor lea cuando atiende un request: Next las
**reemplaza por su valor dentro del JavaScript** mientras buildea. O sea que
cambiarlas en el hPanel y reiniciar el proceso no cambia nada, ni siquiera
después de un restart: hay que **rebuildear** (Redeploy), porque el valor viejo
está escrito adentro de los archivos ya compilados.

Se nota tarde y de formas raras: los links compartidos por WhatsApp siguen sin
foto porque la URL de Open Graph quedó en `localhost`, o Analytics no mide
porque el ID viejo sigue adentro del bundle. Si cambiaste una `NEXT_PUBLIC_*`,
Redeploy, y recién después probá.

### Deployar antes de que el dominio apunte

No hace falta esperar al DNS para tener la tienda arriba. Cada sitio de
Hostinger viene con una URL temporal del tipo
`https://algo-algo-123456.hostingersite.com`, y sirve para el deploy completo:
build, base, `/api/setup/init`, `create-owner` y la prueba de humo del §6.

Lo único que hay que hacer bien es `NEXT_PUBLIC_SITE_URL`: **poné ahí la URL
temporal mientras uses la URL temporal**. Con el dominio final cargado antes de
tiempo, el sitio anda pero se sabotea solo — los links de Open Graph y el
sitemap apuntan a un dominio que todavía no resuelve, y las cookies de sesión
del panel se emiten para otro host. Con la URL temporal, en cambio, todo cierra
y podés probar de verdad.

Cuando el DNS del dominio real ya resuelve: cargá el dominio en el hPanel,
cambiá `NEXT_PUBLIC_SITE_URL` al dominio final, **Redeploy** (es una
`NEXT_PUBLIC_*`, ver arriba), y recién ahí registrá la URL de respuesta de
Pagopar y el cron del §5 con el dominio definitivo. Correr `pnpm preflight`
después del cambio confirma que no quedó nada apuntando a la URL vieja.

---

## 2. Trampas del SSH de Hostinger

Con la ruta de setup del punto 4 (`POST /api/setup/init`) **no deberías
necesitar SSH para nada**. Queda documentado igual, porque el día que entres
por SSH a debuggear te vas a comer estas tres, y las tres parecen bugs del repo
cuando en realidad son los ulimits del hosting compartido: los planes con SSH
limitan la cantidad de threads por proceso, y las herramientas modernas de JS
asumen que pueden abrir todos los que quieran.

### `pnpm install` muere con `[ERR_WORKER_INIT_FAILED]` / `EAGAIN`

pnpm 10 resuelve el árbol con worker threads. Bajo el límite de threads, el
primer worker no arranca y pnpm aborta. Reintentar lo empeora: cada intento
deja procesos colgados y el siguiente arranca con menos margen todavía.

Workaround, sin worker threads:

```bash
npm install --legacy-peer-deps
```

### `tsx` / `drizzle-kit` panican con `newosproc`

El binario de esbuild que usa `tsx` (y por debajo `drizzle-kit`) es Go, y el
runtime de Go intenta abrir un thread por CPU visible. Bajo el mismo límite
revienta con un panic de `runtime: newosproc` y un volcado de stack que no
tiene nada que ver con tu código.

Workaround, antes de **cualquier** comando `tsx` o `drizzle-kit`:

```bash
export GOMAXPROCS=1
```

### `node` y `npm` no están en el PATH, y el checkout no es la app

Al entrar por SSH no hay `node`. Los binarios viven adentro del directorio de
la app de Node.js; buscalos con:

```bash
ls ~/.nvm/versions/node
export PATH="$HOME/.nvm/versions/node/v22.*/bin:$PATH"
node -v
```

**Trampa:** el checkout de git queda en `hbuilds/last-source/` y **ese no es el
filesystem de la app que está corriendo**. Es la fuente desde donde Hostinger
buildea. Editar ahí no cambia nada de lo que sirve el sitio, y correr un script
ahí puede correrlo contra un `.env` que no es el que usa la app. Si necesitás
tocar la base, hacelo desde tu máquina con la URL remota, o mejor: usá la ruta
de setup.

---

## 2.1 La saga pnpm → npm (por qué el primer deploy real tardó 4 PRs)

Esto pasó de verdad la primera vez que una tienda de este template salió a
Hostinger, en orden, y cada intento parecía la solución hasta el siguiente
commit. Va completo acá para que la próxima tienda no vuelva a pisar los
mismos cuatro escalones — y para que quede claro por qué §1 pide `npm` en
Hostinger cuando todo el resto del repo (CI incluido) usa pnpm.

1. **Corepack bloqueaba el build**: `packageManager` en `package.json` pedía
   una versión de pnpm distinta a la que Hostinger ya tiene provista en su
   imagen. Corepack no las concilia: si no coinciden, no arranca.
2. **Alinear la versión (pnpm 11) destapó otro bug**: pnpm 11 agrega
   `verify-deps-before-run`, que antes de correr un script (`pnpm run build`)
   re-verifica `node_modules` contra el lockfile y, ante cualquier duda,
   lanza un **`pnpm install` anidado como subproceso**. Ese subproceso no
   encuentra `pnpm` en el PATH del hosting compartido y tira `ENOENT` — el
   deploy se reporta roto aunque el install real, corrido segundos antes,
   ya había terminado bien.
3. **Pinnear pnpm a una versión vieja no sirve**: el build de Hostinger no
   deja que Corepack cambie de versión por proyecto. Siempre corre la que
   trae instalada, y esa misma pnpm 11 se niega a arrancar en cuanto ve que
   `packageManager` pide otra. El pin queda comido por el propio problema
   que intentaba evitar.
4. **La causa real se apaga con `.npmrc`**: `verify-deps-before-run=warn`
   (ver el archivo en la raíz de este template) mantiene el aviso de un
   lockfile desalineado sin lanzar el subproceso que rompe todo. Esto
   arregla pnpm **si Hostinger pudiera correr pnpm de forma estable** — pero
   en la práctica no pudo, ni con esto puesto.
5. **Mitigación final: instalar con npm en Hostinger.** `pnpm-lock.yaml`
   sigue siendo la fuente de verdad para CI y desarrollo local; el hosting
   usa `package-lock.json` (versionado en este template, regenerado con
   `npm install` cada vez que cambia el otro lockfile — nunca a mano).
6. **npm destapó un quinto bug**: con `NODE_ENV=production` puesto en las
   Environment variables del sitio (§1), `npm install` **omite
   devDependencies por completo**. `tailwindcss`, `@tailwindcss/postcss`,
   `cloudinary` y `dotenv` estaban clasificados como devDependencies aunque
   el build/runtime de producción los necesita de verdad (el compilador de
   Tailwind v4 corre dentro de `next build`; `cloudinary` y `dotenv` entran
   al bundle del servidor vía rutas reales, no scripts). El deploy sólo
   instaló una fracción de los paquetes y el build tiró `Cannot find
   module`. Ya están reclasificados en este template — la trampa es para
   cuando una tienda agregue una dependencia nueva.

**La regla que queda de esto, para toda tienda salida de este template:**
cualquier paquete que un archivo bajo `src/app`, `src/lib`, `src/domain` o
`src/db` importe — directa o transitivamente — tiene que estar en
`dependencies`, nunca en `devDependencies`, sin importar que "sea una
herramienta de build". La forma de probarlo antes de mergear es la segunda
línea del bloque de comandos en §1, no `pnpm build` solo: `pnpm` nunca
reproduce el recorte de `NODE_ENV=production` que hace `npm install`.

---

## 2.2 El límite de procesos de una cuenta de Hostinger: qué lo gasta y qué no

Los planes de hosting compartido de Hostinger ponen un techo de procesos
(threads incluidos, vía cgroups) **por cuenta entera**, no por sitio: si la
cuenta aloja varias tiendas de este template, todas comparten el mismo pool.

**Lo que casi no lo toca: la tienda sirviendo tráfico.** `next start` corre
como un proceso Node con un puñado de threads del propio runtime (libuv,
threadpool) — del orden de una decena, estable, sin importar cuántos
visitantes entren. Con `images.unoptimized: true` (Cloudinary hace la
optimización, ver `next.config.ts`) tampoco hay un pool de workers de
`sharp` sumándose acá. Una tienda de este tamaño en régimen normal no es la
que agota el límite.

**Lo que sí lo gasta, y en ráfaga, es el build/install:**

- El binario Go de `esbuild` (`tsx`, `drizzle-kit`) abre un thread por CPU
  visible (`GOMAXPROCS`) — el mismo `newosproc` de más arriba.
- El resolver de pnpm usa worker threads en paralelo al instalar.
- Cada subproceso anidado que la saga de §2.1 describe (el `pnpm install`
  fantasma de `verify-deps-before-run`, los `postinstall` de dependencias
  nativas) suma al mismo pool mientras dura, sin límite propio.

Nada de esto es grande para **una** tienda corriendo sola, pero se acumula
con cualquier otra cosa activa en la misma cuenta al mismo tiempo: otro
sitio buildeando, un cron corriendo, una sesión SSH con procesos colgados de
un intento anterior (reintentar sin limpiar empeora esto, como ya avisa la
sección de arriba). Cuando el proceso de la app no puede arrancar o se cae
por tocar el techo, lo que ve el visitante no es un error de Next: hPanel
sirve una pantalla de espera o de verificación mientras no hay proceso
respondiendo detrás — fácil de confundir con un problema de Cloudflare o
SSL, pero este template no usa Cloudflare (DNS directo en Hostinger).

**Con varias tiendas en la misma cuenta**, el lever real no es achicar una
tienda — cada una sola ya pesa poco en régimen normal — sino no hacerlas
buildear todas juntas: escalonar los redeploys y fijar `GOMAXPROCS=1` en las
variables de entorno del sitio (no sólo en una sesión SSH manual) baja el
pico de la ráfaga de instalación, que es donde de verdad se gasta el pool.

**Si pasa "el sitio no carga" después de un deploy** y no está claro por
qué, antes de asumir "es el límite de procesos": entrá por SSH y contá lo
que hay vivo en la cuenta —

```bash
ps -u $USER | wc -l
ulimit -u
```

— así queda un número, no una corazonada, para la próxima vez.

---

## 3. Base de datos

### Crear la base y el usuario

hPanel → **Databases → Management**. Creás base y usuario en el mismo
formulario.

**Trampa:** el panel lista **"MySQL Database"** y **"MySQL User"** en dos
columnas pegadas, con nombres casi idénticos (`u123456789_tienda` y
`u123456789_tiendausr`). Transponerlas es el error más común del deploy, y el
error que devuelve MySQL —`Access denied`— no dice cuál de las dos está mal.

Ante cualquier duda, el **primer** paso de debugging es:

```bash
pnpm db:check
```

Te imprime en castellano con qué usuario, contra qué base, en qué host y en qué
puerto va a conectar (nunca la contraseña), corre un `SELECT 1` y te dice qué
significa el error si falla.

### Remote MySQL

Para correr `pnpm db:check`, `pnpm db:push` o `pnpm reconcile` desde tu
máquina, la base tiene que aceptar conexiones de afuera: hPanel → **Databases →
Remote MySQL** → agregá tu IP pública (o `%` sólo mientras debuggeás, y sacalo
después).

Sin eso el error es `ETIMEDOUT` o `ECONNREFUSED` y parece que la base está
caída, cuando lo único que pasa es que tu IP no está en la lista.

### Cambiar la contraseña de la base

```
cambiaste la contraseña en el hPanel
  → DATABASE_URL de la app quedó con la contraseña vieja
  → la tienda entera tira Access denied
```

Cambiar la contraseña **no** actualiza la variable de la app. Hay que hacer las
dos cosas:

1. Editar `DATABASE_URL` en las Environment variables del sitio.
2. Apretar **Redeploy** (ver el punto 1: guardar la variable no reinicia nada).

**Trampa:** si la contraseña tiene `?`, `#`, `@` o `/`, hay que URL-encodearla o
`mysql2` parsea cualquier cosa. Lo más simple es generar contraseñas sin
símbolos raros.

---

## 4. Primer deploy de una tienda nueva

Sin SSH y sin Node instalado en el servidor: la app que ya está corriendo se
inicializa sola con un curl.

1. **Cargá las variables** en el hPanel (punto 1), incluida `SETUP_SECRET` —
   mínimo 16 caracteres, `openssl rand -base64 32`.
2. **Deploy** (push, o Redeploy si sólo tocaste variables).
3. **Inicializá la tienda**:

   ```bash
   curl -X POST https://DOMAIN/api/setup/init \
     -H "Authorization: Bearer $SETUP_SECRET" \
     -H "content-type: application/json" \
     -d '{"seed":true,"owner":{"email":"...","password":"..."}}'
   ```

   Corre las migraciones de `./drizzle`, aplica los extras (FULLTEXT, FK
   self-ref, contador de pedidos), siembra el catálogo de ejemplo y crea la
   cuenta del dueño. Responde con el resultado de cada paso **y con el reporte
   completo de `pnpm preflight`**, medido contra el entorno de este servidor —
   que es el único que importa.

   Si ya tenés las zonas de envío reales de la tienda, van en el mismo cuerpo y
   te ahorran cargarlas a mano desde `/admin/envios`:

   ```json
   {
     "seed": true,
     "owner": { "email": "...", "password": "..." },
     "zonas": [
       { "slug": "asuncion", "name": "Asunción", "cities": ["Asunción"], "pricePyg": 25000, "freeThresholdPyg": 500000 },
       { "slug": "interior", "name": "Interior", "cities": [], "pricePyg": 80000 }
     ]
   }
   ```

   Upsert por `slug`, así que repetir la llamada actualiza en vez de duplicar.
   **No borra las zonas que no vengan en la lista**: borrar una zona que la
   tienda usa no se ofrece por HTTP.

4. **Verificá**:

   ```bash
   curl -fsS https://DOMAIN/api/health   # {"ok":true,"db":true}
   ```

   El `preflight` ya vino en la respuesta del paso 3 (mirá `blocking` y los
   checks con severidad `bloquea`). Correr `pnpm preflight` desde tu máquina
   mide tu `.env.local`, no el del servidor: sirve como ensayo, no como
   verificación del deploy.

5. **Sacá `SETUP_SECRET`** de las Environment variables y apretá **Redeploy**.
   La ruta vuelve a responder 503 y ahí queda para siempre.

**Trampa:** el paso 5 no es opcional y no se hace solo. Guardar la variable
—o borrarla— no reinicia nada: hasta el Redeploy, el proceso viejo sigue con el
secreto en memoria y la ruta viva. `pnpm preflight` avisa si `SETUP_SECRET`
quedó puesta en producción.

### Llamarla de nuevo

Las migraciones y los extras son idempotentes y corren en **cada** llamada, así
que la misma ruta es el corredor de migraciones de los deploys siguientes:

```bash
curl -X POST https://DOMAIN/api/setup/init \
  -H "Authorization: Bearer $SETUP_SECRET" \
  -H "content-type: application/json" -d '{}'
```

Lo que no se repite solo es lo que escribe datos del negocio: con la tienda ya
inicializada, un `seed`, unas `zonas` o un `owner` responden **409** con el
resumen de lo que ya estaba, en vez de volver a sembrar el catálogo sobre una
tienda que ya vende.
Para reabrirlos hay que pedirlo con `{"force":true}`. El stock nunca se resetea
por esta vía, ni con `force`.

### Si preferís hacerlo a mano

Sigue funcionando, contra la base remota (Remote MySQL habilitado, punto 3):

```bash
pnpm db:check      # ¿la URL de la base es la correcta?
pnpm db:push       # schema + FULLTEXT + FK + contador
pnpm db:seed       # catálogo de ejemplo — reemplazalo por el real
pnpm create-owner  # única forma de crear usuario del panel
```

**Trampa:** `db:push` compara contra `schema.ts` y decide él solo qué ALTER
correr — está bien para desarrollo, no para una base con pedidos adentro. La
ruta de setup corre las migraciones versionadas de `./drizzle`, que es lo que
se revisó en un PR.

---

## 5. Cron cada 15 minutos

`/api/cron/vencer-pedidos` vence los pedidos sin pago y limpia reservas viejas.
Sin él, los pedidos muertos quedan para siempre en `pendiente_pago` y el panel
miente.

hPanel → **Advanced → Cron Jobs** → cada 15 minutos:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/vencer-pedidos
```

**Trampa:** si el cron de tu plan no deja mandar headers, la ruta también acepta
`?secret=...`, pero entonces el secreto queda escrito en los logs de acceso del
servidor. Preferí el header siempre que se pueda.

Sin `CRON_SECRET` configurado (o con menos de 16 caracteres) la ruta responde
503 y no vence nada: una ruta "abierta hasta que la configuren" es una ruta
abierta.

---

## 6. Prueba de humo post-deploy

```bash
curl -fsS https://TU-DOMINIO/api/health
```

Tiene que devolver `{"ok":true,"db":true}`. `db:false` significa que la app
levantó pero no llega a MySQL — volvé al punto 3 con `pnpm db:check`.

Y desde tu máquina, apuntando al entorno real:

```bash
pnpm preflight
```

Lista qué falta para cobrar plata de verdad (datos bancarios, `CRON_SECRET`,
modo de la pasarela, Cloudinary) y sale con código 1 si algo bloquea. No toca la
base ni la red, así que se puede correr todas las veces que quieras.

Después, a mano: entrar a la tienda, agregar algo al carrito, llegar al
checkout, y entrar a `/admin` con la cuenta del dueño.

---

## 7. Copias de la base

La tienda guarda pedidos, pagos y comprobantes de plata que entró de verdad. Si
mañana la base desaparece —un `DROP` con la base equivocada, un plan que se
vence, un disco— sin copia no hay a quién reclamarle.

Desde **tu máquina**, con Remote MySQL habilitado (punto 3):

```bash
pnpm backup                 # copia comprimida en backups/
pnpm backup --retener 30    # y borra las de más de 30 días (default: 14)
```

Deja un `.sql.gz` con la fecha en el nombre, así ordenar por nombre es ordenar
por fecha. `backups/` está en `.gitignore`: son datos de clientes, nunca van al
repo.

No corre en el servidor: en el slot de Node de Hostinger no hay `mysqldump` y
conseguirlo pelea con los mismos ulimits del punto 2. Corré esto desde tu
máquina o desde cualquier máquina con `mysql-client` instalado.

**Trampa:** una copia que nunca restauraste no es una copia, es un archivo.
Probá el camino completo **hoy**, contra una base vacía, no el día que la
necesites:

```bash
mysql -h HOST -u USUARIO -p -e "CREATE DATABASE prueba_restore"
gunzip -c backups/TU-COPIA.sql.gz | mysql -h HOST -u USUARIO -p prueba_restore
```

Y contá las tablas y los productos ahí adentro antes de confiar.

Para que corra sola, en tu máquina (no en Hostinger), un cron diario:

```bash
0 3 * * * cd /ruta/al/repo && /usr/local/bin/pnpm backup >> backups/backup.log 2>&1
```

El hPanel de Hostinger también ofrece sus propias copias según el plan. Usá las
dos: la de ellos te salva del disco, ésta te salva de vos.

---

## 8. Monitoreo

`/api/health` ya contesta si la tienda está viva; falta alguien que lo pregunte
cada tanto. Cualquier servicio de uptime gratis sirve (UptimeRobot, Better
Stack, Hetrix): apuntalo a `https://TU-DOMINIO/api/health` cada 5 minutos.

> **Configuralo por palabra clave, no por código HTTP.** La ruta devuelve **200
> igual cuando no llega a la base** —`{"ok":true,"db":false}`— justamente para
> poder distinguir "el proceso murió" de "el proceso vive pero no ve MySQL". Un
> monitor que sólo mira el 200 te va a decir que todo anda mientras la tienda no
> puede vender nada.

En el monitor, entonces: alertar si la respuesta **no contiene** `"db":true`.

Con varias tiendas, uno por tienda y con el nombre del comercio en la alerta:
a las 3 de la mañana no vas a adivinar cuál de las cuatro se cayó.
