# ARCH.md — Tienda PY: Technical Architecture

**Stack:** Next.js 16 (App Router, TS) · **Hostinger Node.js** · **Hostinger MySQL + Drizzle ORM** · Cloudinary (images + receipts) · Tailwind + shadcn/ui · Zustand · Zod
**Currency:** PYG only, stored as `BIGINT` integers. No decimals anywhere in the money path.
**Timezone:** all business logic in `America/Asuncion`; all timestamps stored UTC (`timezone: "Z"` on the pool).
**Language:** Spanish (Paraguayan voseo) UI, `dd/mm/yyyy`.

> **Why not Supabase/Vercel:** the user already pays for Hostinger with free Node.js slots and a proven deploy playbook. One host, one bill, one debugged deploy flow. See `nextjs-deploy-hostinger` skill for the deploy mechanics — this doc is the app.

---

## 1. Security model (read this first — it's short)

**The browser never talks to the database.** Every request is `browser → Next.js server → MySQL`. There is no Postgres RLS here and none is needed; MySQL doesn't have it and the attack surface it defends against doesn't exist in this topology.

The entire security model is four rules:

1. **Never trust the client about money or identity.** Prices, totals, stock and order ownership are always re-read from the DB server-side. The cart in the browser is a *wish list*, not a source of truth.
2. **Every mutating server action calls a guard first.** `requireAdmin` / `requireStaff` / `requireOwner` for admin routes (see the permission matrix below), `requireOrderAccess(orderNumber, token)` for buyer routes. Hiding a button is UX, not security.
3. **Buyers are anonymous, identified by an unguessable token.** No accounts in v1.
4. **Secrets live in `.env` on the server only.** Anything `NEXT_PUBLIC_*` is public by definition.

### How a buyer accesses their order (no login)

| Path | How |
|---|---|
| **Primary — the WhatsApp link** | `/pedido/PY-000123?t=<32-byte random token>`. Token stored in `orders.access_token`, compared with `crypto.timingSafeEqual`. This is the exact URL pasted into WhatsApp. |
| **Fallback — lookup form** | `/pedido/buscar`: order number + the phone number used on the order. Rate-limited (5 attempts / 15 min / IP), generic error message so it can't be used to enumerate orders. On success, redirects to the tokenized URL. |

Forcing registration before a first purchase is the single biggest conversion killer in PY e-commerce, so **the guest checkout above is the main path and does not change**.

Desde la FASE 2 hay cuentas de cliente **opcionales**, detrás de
`TIENDA.cuentasClientes` (apagado por defecto). Lo que hay que saber:

| | Panel | Cliente |
|---|---|---|
| Tabla | `users` | `customers` |
| Cookie | `ecom_admin` | `ecom_cliente` |
| Secreto | `SESSION_SECRET` | `CUSTOMER_SESSION_SECRET` |
| Guard | `requireAdminSession` | `requireCustomerSession` |
| Duración | 8 h | 30 días |

Tablas, cookies y secretos **separados**, no por prolijidad: si compartieran
cookie, un bug de rol convertiría a una compradora en staff. No hay ningún
camino desde `customers` hacia `/admin` — la tabla ni siquiera tiene columna de
rol.

`orders.customer_id` es nullable para siempre: lo pone la server action leyendo
**la cookie**, nunca el navegador. Un `customerId` que viajara en el input
dejaría atar la compra propia a la cuenta de cualquiera.

**`customers.phone_verified_at` y por qué existe vacía.** `/cuenta` muestra los
pedidos por `customer_id`. Los pedidos viejos de invitada que sólo matchean por
teléfono se muestran **únicamente** si ese teléfono está verificado. En esta
fase no hay proveedor de mensajería, así que la columna es siempre NULL y ese
camino está cerrado: sin la condición, registrarse tipeando el WhatsApp de otra
persona muestra su historial completo, con nombre, dirección y el token de
acceso de cada pedido. El login por OTP es lo que la va a escribir.

### Admin
`iron-session` cookie + `users` table (bcrypt hashes, `role` enum `owner | staff | vendedor`). Middleware protects `/admin/*`; **every** server action re-checks the role. No public signup route — the first owner is created by `pnpm create-owner`, el resto se dan de alta desde `/admin/usuarios` (owner-only).

**Los usuarios no se borran, se desactivan.** `order_events.actor_user_id` y `stock_adjustments.actor_user_id` apuntan a esta tabla: el historial de lo que hizo una persona tiene que sobrevivir a su salida del comercio. `is_active = false` corta el acceso igual de rápido (`authenticate()` lo rechaza) y conserva la auditoría. Dos reglas duras, validadas **adentro de la transacción y con la fila bloqueada**, no en el formulario: nadie se desactiva ni se degrada a sí mismo, y no se puede dejar la tienda sin ningún `owner` activo.

`users.last_login_at` la escribe `authenticate()` en el login exitoso y nadie más. NULL es "nunca entró", que es información distinta de "entró hace mucho".

#### Matriz de permisos

Tres roles, tres niveles de confianza. El de abajo nunca puede lo del de arriba.

| | `owner` | `staff` | `vendedor` |
|---|:---:|:---:|:---:|
| Ver pedidos y su ficha | ✅ | ✅ | ✅ |
| Preparar / despachar / entregar | ✅ | ✅ | ✅ |
| Dar por cobrado, cancelar, vencer, rechazar | ✅ | ✅ | ❌ |
| Ver montos (totales, IVA, precios) | ✅ | ✅ | ❌ |
| Comprobantes: ver, aprobar, rechazar | ✅ | ✅ | ❌ |
| Productos y variantes (ABM) | ✅ | ✅ | ❌ |
| Ajustar stock a mano | ✅ | ✅ | ❌ |
| Resumen de ventas (`/admin`) | ✅ | ✅ | ❌ |
| Listado de clientes | ✅ | ✅ | ❌ |
| Registrar una devolución | ✅ | ❌ | ❌ |
| Exports CSV | ✅ | ❌ | ❌ |
| Gestión de usuarios del panel | ✅ | ❌ | ❌ |
| Cupones (ABM) | ✅ | ❌ | ❌ |
| Categorías (ABM) | ✅ | ❌ | ❌ |
| Zonas de envío (ABM) | ✅ | ❌ | ❌ |
| Datos bancarios de la tienda | ✅ | ❌ | ❌ |

Lo que el `owner` no delega tiene siempre el mismo motivo: **el error no se ve y no se puede deshacer**. Una devolución es plata que sale y nadie la revisa después; un CSV es la base de clientes del comercio en un archivo que se lleva quien renuncia; repartir accesos es repartir todo lo anterior. Los tres ABMs que se sumaron en la FASE 2 son de la misma familia: un cupón mal puesto se descubre cuando ya lo usaron cien personas, apagar una categoría le saca de la vidriera a todos sus productos de una vez, y una zona de envío con el precio viejo cobra de menos en cada pedido sin romper nada, sin dejar log y sin que nadie se entere hasta cerrar el mes. Los datos bancarios (FASE 2, PR T) son el caso más puro de la familia: quien puede cambiar el número de cuenta al que transfieren las compradoras desvía la facturación entera a otra cuenta sin generar un solo pedido raro — la tienda sigue andando igual y el dueño se entera cuando mira su banco.

Lo que queda afuera del `vendedor` es todo lo que mueve plata o suelta stock. Le queda el mostrador: ver qué hay que armar y marcarlo despachado.

**Cómo se implementa** (la tabla de arriba es la especificación, no la defensa):

| Capa | Archivo | Qué hace |
|---|---|---|
| Guards | `src/lib/session.ts` | `requireAdmin` (los tres), `requireStaff` (owner+staff), `requireOwner`. Tiran `ForbiddenError`. |
| Guards async | `src/lib/admin-guard.ts` | `requireAdminSession` / `requireStaffSession` / `requireOwnerSession` — **primera línea de cada server action**. |
| Transiciones | `src/lib/session.ts` | `assertCanTransitionTo(actor, to)`: `advanceOrder` es la misma acción para los tres roles y lo que cambia es el destino. `VENDEDOR_TRANSITIONS = preparando, enviado, entregado`. |
| Matriz de UI | `src/lib/permissions.ts` | `can(role, capability)` — decide qué botón se dibuja. **Es UX**: esconder un botón no frena nada. |

Nota sobre `VENDEDOR_TRANSITIONS`: el plan lo escribe como "sólo `pagado → enviado → entregado`", pero la máquina de estados (§3) pasa obligatoriamente por `preparando` entre `pagado` y `enviado`. Sin ese destino el rol no podría completar ni una vez el camino que se le asigna, así que los tres del despacho están adentro.

#### Quién hizo qué (`actor_user_id`)

`order_events` y `stock_adjustments` guardan **las dos cosas**:

| Columna | Qué es | Cuándo |
|---|---|---|
| `actor` | El texto de ese momento: `admin:due@tienda.py`, `cron`, `pagopar:webhook`, `buyer` | Siempre |
| `actor_user_id` | FK a `users.id` | Sólo cuando lo disparó una persona del panel |

No es redundancia. `actor` es la **verdad histórica**: no cambia si esa persona
cambia de email, y sobrevive al borrado de su usuario (la FK es
`ON DELETE SET NULL`, porque borrar a alguien no puede borrar el historial de
lo que hizo). `actor_user_id` es para **preguntar**: "todo lo que hizo el
usuario 4 en agosto" no se puede consultar contra un string sin adivinar.

Nullable en los dos sentidos: el histórico anterior a la columna **no se
backfillea** —inventar la atribución del pasado es peor que no tenerla— y hay
escrituras legítimas sin persona detrás (el cron que vence pedidos, el webhook
de Pagopar, la compradora subiendo su comprobante).

`tests/unit/atribucion.test.ts` verifica en CI que toda acción de admin que
dispare una escritura auditada pase el id que ya tiene en la mano.

`tests/unit/admin-guards.test.ts` clava esta tabla acción por acción en CI: una acción nueva que no declare su guard falla el test, y cambiar `requireOwnerSession` por el genérico en la acción de reembolsos también.

---


##### El feed: `/admin/actividad` (FASE 2, PR L)

`order_events` y `stock_adjustments` guardaban todo desde el principio, pero
repartido: los eventos de un pedido sólo se veían abriendo ese pedido, y los
ajustes de stock abriendo esa variante. `/admin/actividad` los junta en un solo
feed paginado, filtrable por persona, por tipo y por fecha. Es de **lectura
pura** —las dos tablas son append-only y nadie las edita— y lo ven `owner` y
`staff`: muestra el trabajo de cada persona con nombre y apellido, o sea
supervisión, no mostrador.

Dos decisiones que valen:

- **El orden y la paginación los hace MySQL sobre el conjunto entero**, con un
  `UNION ALL` que trae sólo `(tipo, id, fecha)`. Traer N filas de cada tabla y
  ordenarlas en memoria funciona en la página 1 y miente en la 2: con 300
  eventos y 3 ajustes en el rango, los eventos tapan a los ajustes y la segunda
  página muestra filas que en un feed real irían antes. Los detalles (número de
  pedido, SKU, nombre del producto) se buscan después y sólo para las filas de
  esa página.
- **El desempate es por `id`, no sólo por fecha.** Dos eventos escritos en la
  misma transacción comparten `created_at` al segundo; sin un segundo criterio,
  MySQL puede devolverlos en distinto orden en cada consulta y entonces una
  fila sale dos veces y otra no sale nunca.

"El sistema" es un filtro de primera clase: son las filas con `actor_user_id`
NULL —el cron, el webhook de Pagopar, la compradora subiendo su comprobante— y
es exactamente lo que se quiere mirar cuando algo cambió y nadie lo tocó. El
desplegable de personas incluye a los usuarios **desactivados**, porque revisar
qué hizo alguien antes de que le cortaran el acceso es justo la consulta que
importa.

## 2. Data model (ERD)

MySQL 8, InnoDB, `utf8mb4`. All money columns `BIGINT UNSIGNED` (integer guaraníes).

```
                              ┌──────────────┐
                              │  categories  │
                              │──────────────│
                              │ id  PK       │
                              │ slug UQ      │
                              │ name         │
                              │ parent_id FK ├──┐ self-ref
                              │ position     │◄─┘
                              └──────┬───────┘
                                     │ 1
                                     │ N
┌────────────────────┐        ┌──────┴────────────┐        ┌──────────────────────┐
│  product_images    │  N   1 │     products      │ 1    N │      variants        │
│────────────────────│◄───────│───────────────────│───────►│──────────────────────│
│ id PK              │        │ id PK             │        │ id PK                │
│ product_id FK      │        │ slug UQ           │        │ product_id FK        │
│ cloudinary_id      │        │ name              │        │ sku UQ               │
│ blur_data_url      │        │ description TEXT  │        │ label ("Talle M")    │
│ alt                │        │ category_id FK    │        │ price_pyg BIGINT     │
│ position           │        │ brand             │        │ compare_at_pyg NULL  │
└────────────────────┘        │ iva_rate  10|5|0  │        │ on_hand INT UNSIGNED │◄── stock lives here
                              │ is_active         │        │ is_active            │
                              │ published_at      │        └───────┬──────────────┘
                              │ FULLTEXT(name,    │                │ 1
                              │          descr)   │                │ N
                              └───────────────────┘      ┌─────────┴──────────────┐
                                                         │  stock_reservations    │
                                                         │────────────────────────│
                                                         │ id PK                  │
                                                         │ variant_id FK          │
                                                         │ order_id FK            │
                                                         │ qty INT                │
                                                         │ expires_at DATETIME    │
                                                         │ state: held|consumed|  │
                                                         │        released        │
                                                         │ IDX(variant_id,state,  │
                                                         │     expires_at)        │
                                                         └────────────────────────┘

┌───────────────────────────────┐
│            orders             │
│───────────────────────────────│        ┌────────────────────────────┐
│ id PK                         │ 1    N │        order_items         │
│ order_number  UQ  "PY-000123" ├───────►│────────────────────────────│
│ access_token  UQ  (32 bytes)  │        │ id PK                      │
│ status ENUM (see §3)          │        │ order_id FK                │
│ customer_name                 │        │ variant_id FK  (RESTRICT)  │
│ customer_phone  +5959XXXXXXXX │        │ name_snapshot              │
│ customer_email NULL           │        │ sku_snapshot               │
│ doc_type ENUM: RUC|CI|NINGUNO │        │ unit_price_pyg BIGINT      │
│ doc_number  (DV-validated)    │        │ qty INT                    │
│ is_consumidor_final BOOL      │        │ iva_rate TINYINT           │
│ ship_city / ship_barrio       │        │ line_total_pyg BIGINT      │
│ ship_address / ship_reference │        └────────────────────────────┘
│ ship_maps_url NULL            │
│ subtotal_pyg  BIGINT          │        ┌────────────────────────────┐
│ shipping_pyg  BIGINT          │ 1    N │         payments           │
│ total_pyg     BIGINT          ├───────►│────────────────────────────│
│ iva_10_pyg / iva_5_pyg        │        │ id PK                      │
│ payment_method ENUM           │        │ order_id FK                │
│ reserved_until DATETIME       │        │ provider: pagopar|spi|cod  │
│ invoice_status ENUM  ◄────────┼─ FASE 2│ provider_ref               │
│ invoice_cdc / invoice_pdf_url │        │ amount_pyg BIGINT          │
│ created_at / paid_at          │        │ status: pending|paid|      │
│ IDX(status,created_at)        │        │         failed|refunded    │
│ IDX(customer_phone)           │        │ raw_payload JSON           │
└───────────┬───────────────────┘        │ UQ(provider, provider_ref) │
            │ 1                          └─────────┬──────────────────┘
            │ N                                    │ 1
┌───────────┴────────────────┐                     │ N
│         receipts           │           ┌─────────┴──────────────────┐
│────────────────────────────│           │      payment_events        │
│ id PK                      │           │────────────────────────────│
│ order_id FK                │           │ id PK                      │
│ cloudinary_id (private)    │           │ provider                   │
│ mime / bytes               │           │ event_key                  │
│ uploaded_at                │           │ payload JSON               │
│ review: pending|approved|  │           │ received_at                │
│         rejected           │           │ UQ(provider, event_key) ◄──┼─ idempotency
│ reviewed_by FK users       │           └────────────────────────────┘
│ reviewed_at / note         │
└────────────────────────────┘           ┌────────────────────────────┐
                                         │      order_events          │  audit log
┌────────────────────────────┐           │ id, order_id, from_status, │
│           users            │           │ to_status, actor, reason,  │
│ id, email UQ, password_hash│           │ created_at                 │
│ role ENUM: owner|staff     │           └────────────────────────────┘
│ created_at                 │
└────────────────────────────┘           ┌────────────────────────────┐
                                         │       shipping_zones       │
                                         │ id, name, cities JSON,     │
                                         │ price_pyg BIGINT           │
                                         └────────────────────────────┘
```

### Cupones y descuentos (FASE 2, PR G)

La identidad del pedido pasa a ser:

```
total_pyg = subtotal_pyg − discount_pyg + shipping_pyg
```

Reglas, todas verificadas por `pnpm reconcile`:

1. **El descuento sale del subtotal, nunca del envío.** El flete es un costo
   real; una promoción de la tienda no puede convertirlo en pérdida.
2. **El navegador manda el código, jamás el monto.** El descuento lo calcula
   `computeOrderTotals` en el servidor, contra la tabla `coupons`.
3. **Todo entero.** El porcentaje se aplica con `Math.floor` — ante medio
   guaraní, el redondeo favorece a quien paga la promoción.
4. **El descuento se topea al subtotal.** Un cupón de ₲100.000 sobre una compra
   de ₲80.000 descuenta ₲80.000: nunca deja un total negativo ni empieza a
   pagar el envío.
5. **El IVA se sigue desglosando por línea.** El descuento se reparte entre las
   líneas en proporción a lo que pesa cada una (`distributeDiscount`, con el
   resto a la línea más grande para que la suma cierre exacta) y el IVA sale de
   cada base descontada con el mismo `ivaIncluded` de siempre.
6. **El umbral de envío gratis se mira contra el subtotal sin descontar.** Si
   no, un cupón le sacaría a la compradora el envío gratis que ya tenía en
   pantalla — un cupón nunca puede empeorar el total.

`coupons.times_used` se incrementa **adentro de la transacción que crea el
pedido y con la fila bloqueada** (`SELECT … FOR UPDATE`), igual que el stock:
sin eso, dos checkouts simultáneos gastan dos veces un cupón de un solo uso. La
validación previa no decide nada por sí sola — decide la re-lectura con el
candado tomado.

El pedido guarda `coupon_code` como **snapshot** además de la FK: si el dueño
borra el cupón (`ON DELETE SET NULL`), ese pedido tiene que seguir explicando de
dónde salió su descuento.

Controles cruzados nuevos: `descuento_sin_cupon` (y su inverso),
`descuento_mayor_al_subtotal` y `usos_del_cupon_no_cuadran`.

### Money invariants
- Every `*_pyg` column is `BIGINT UNSIGNED`. **No `DECIMAL`, no `FLOAT`, ever** — guaraníes have no céntimos.
- Display: `new Intl.NumberFormat('es-PY', { style:'currency', currency:'PYG', maximumFractionDigits:0 })` → `₲ 1.234.567`.
- `line_total_pyg = unit_price_pyg * qty`, `total_pyg = subtotal_pyg + shipping_pyg` — asserted in the same server function that writes them, and by a nightly reconciliation query.
- Prices are **IVA incluido** (PY consumer convention). Included IVA per line = `round(line_total * rate / (100 + rate))`, summed into `iva_10_pyg` / `iva_5_pyg`. Never added on top of the displayed price.

### Columnas de la compra que no son plata

`orders` guarda además tres cosas que no entran en la cuenta pero se deciden
en el mismo formulario:

| Columna | Por qué es así |
|---|---|
| `marketing_opt_in` **nullable** | Tres estados, no dos: `NULL` = no se preguntó, `false` = dijo que no, `true` = aceptó. Un `NOT NULL DEFAULT false` mezcla el primero con el segundo, y el consentimiento es lo único que no se puede completar retroactivamente. `marketing_opt_in_at` guarda cuándo contestó. **El MVP no manda nada**: no hay proveedor de mensajería en el stack. |
| `is_gift` **NOT NULL** | Acá `false` y "no contestó" sí son lo mismo: un pedido que nadie marcó no es un regalo. `gift_note` sólo se escribe si `is_gift`, para que destildar la casilla no deje un mensaje viejo colgado. |

### Qué se ve en la vidriera (FASE 2, PR J)

Un producto sale a la calle cuando se cumplen **tres** condiciones, no dos:
`products.is_active`, `products.published_at IS NOT NULL` y
`categories.is_active` de la categoría a la que pertenece. Eso es el filtro
`PUBLISHED()` de `src/db/queries.ts`, y lo comparten la home, la página de
categoría, la ficha de producto, el buscador, el filtro de marcas y el sitemap.
Toda consulta que lo use tiene que hacer `innerJoin(categories)`.

La tercera condición entró con el ABM de categorías. Antes el filtro miraba
sólo el producto, y desactivar una categoría dejaba la tienda incoherente: la
categoría desaparecía del menú y `/categoria/<slug>` devolvía 404, pero sus
productos seguían apareciendo en la home, en el buscador y en el sitemap, con
una miga de pan que llevaba derecho a ese 404. Mientras la tabla la escribía
sólo el seed casi no pasaba; con un botón en el panel iba a pasar el primer
día.

Consecuencia para el dueño, y la pantalla se la dice con el número exacto antes
de confirmar: **apagar una categoría apaga todos sus productos.** No borra
nada — los productos quedan como estaban y vuelven solos al reactivarla.

### Zonas de envío: quién las escribe (FASE 2, PR K)

`shipping_zones` la edita el `owner` desde `/admin/envios`, y el dominio
sostiene tres reglas que existen porque cada una es una forma de perder plata
sin enterarse:

- **Una ciudad va en una sola zona.** `quoteShipping` se queda con la primera
  coincidencia por `position`, en silencio: con "Luque" en dos zonas, el flete
  depende del orden de las filas y el dueño que corrigió el precio en la zona
  equivocada no lo sabe nunca.
- **Una zona sin ciudades es válida**: nunca matchea exacto, así que sólo puede
  salir sorteada como "la más cara", que es justo el comodín que cubre el
  interior.
- **No se puede apagar la última zona activa.** Sin ninguna, `quoteShipping`
  devuelve `sin_zonas` con envío ₲0 — la tienda pasa a regalar el flete de todo
  el país sin que ningún cartel lo diga. Que una tienda recién clonada arranque
  así está bien; que una que cobra ₲35.000 llegue ahí de un clic, no.

Editar una zona **no toca los pedidos en vuelo**: el flete quedó copiado en
`orders.shipping_pyg` cuando se creó cada pedido.

### Datos bancarios: dos fuentes con precedencia (FASE 2, PR T)

A dónde transfieren las compradoras vivía sólo en `BANCO_*` del entorno, y eso
hacía que corregir un dígito del número de cuenta fuera un cambio en el hPanel
más un Redeploy a mano — una llamada al desarrollador para arreglar el dato del
que depende el método de pago principal de la tienda.

Ahora sale de `getDatosBancarios()` (`src/lib/comercio.ts`), que lee **en este
orden**:

1. La tabla `bank_details` — singleton con el patrón de `setup_state` (una sola
   fila, `id` siempre 1, columnas explícitas), que el `owner` edita desde
   `/admin/banco`.
2. Los `BANCO_*` del entorno, de fallback.

El orden es lo que hace que una tienda que ya está vendiendo no cambie en nada
el día que actualiza el template: tabla vacía ⇒ manda el entorno.

**Esto es copy de display, no plata.** No entra en `computeOrderTotals` ni en
ningún total: lo consumen la página del pedido, `order-messages.ts` y el
listado de "por cobrar". Cambiarlo cambia lo que una pantalla dice, nunca
cuánto paga alguien.

Dos reglas en el dominio (`src/domain/admin-bank.ts`), las dos porque **una
cuenta a medias es peor que ninguna**:

- **Todos-o-nada** en los cinco campos de texto. Media cuenta cargada mostraría
  un banco sin número, y esa transferencia se hace mal. Sin los cinco, la
  página avisa que faltan los datos en vez de inventar — el criterio de siempre.
- **El RUC se valida con su dígito verificador** (`validateRuc`, módulo 11 de la
  DNIT). Es el único de los cinco que se puede verificar solo, y un RUC mal
  tipeado no rompe nada de este lado: rompe la transferencia de otra persona, en
  el banco.

El QR del SPI se sube a un folder **público** de Cloudinary (`banco/`), nunca a
`comprobantes/`, que es `authenticated` y sólo se sirve firmado. El tipo de
archivo se valida por los bytes, igual que las fotos de producto.

`pnpm preflight` sigue siendo env-only y **no toca la base a propósito** (se
corre en el servidor de producción), así que desde ahí los `BANCO_*` vacíos
pasaron a **advertir** en vez de bloquear: pueden estar legítimamente vacíos con
la tabla cargada. El aviso que sí sabe es el cartel de `/admin`, que lee la base
y aparece cuando no hay datos en ninguna de las dos fuentes.

### La cotización de envío no cobra

`computeOrderTotals(items, ciudad, { executor })` es **la** cuenta del pedido:
subtotal re-preciado, flete por zona, IVA incluido del flete, total. La usan
dos caminos y a propósito no hay un tercero:

1. `quoteCartShipping` — server action pública, sólo lectura. No crea pedido,
   no reserva stock, no toca `on_hand`. Es lo que ve la compradora antes de
   confirmar.
2. `createOrder` — la vuelve a llamar **adentro de su transacción**, con el
   executor de esa transacción, y cobra lo que salga de ahí.

El total cotizado **no se cobra nunca**: es la misma función corriendo dos
veces, y lo que se cobra es lo que sale de la segunda (§1 regla 1).

Lo que sí viaja de vuelta es el total que ella tenía **en pantalla**, para
poder comparar. Si no coincide con el recalculado, `createOrder` tira
`TotalChangedError` adentro de la transacción y antes de escribir: no queda
pedido, ni reserva, ni número de pedido consumido. La pantalla muestra el
número nuevo y ella confirma otra vez. El número del navegador se compara,
nunca se cobra — mismo criterio que `expectedPrices` en `priceCart`.

Existe porque el umbral de envío gratis hace que el total **no** sea monótono
en el precio: un producto de ₲500.000 con envío gratis desde ₲500.000 que el
comercio baja a ₲490.000 cae abajo del umbral y pasa a pagar flete, o sea
₲515.000. Producto más barato, total más caro. Cobrar eso sin avisar es
indistinguible de un error de la tienda.

El progreso hacia el envío gratis (`free-shipping.ts`) devuelve un estado y no
un número, porque `free_threshold_pyg` es nullable y por zona: antes de que la
compradora ponga su ciudad puede no existir ninguna respuesta verdadera, y
"indefinido" se dibuja con la aclaración en vez de con una promesa.

### Stock: holds, not decrements
`on_hand` is the physical count and only changes when money confirms. What the storefront shows is:

```
disponible(variant) = on_hand − SUM(reservations.qty WHERE state='held' AND expires_at > NOW())
```

A **hold** is placed when the order is created (45 min for Pagopar, 24 h for bank transfer / COD). It expires on its own — availability is computed live, so a failed cron job can never strand inventory. A nightly job only garbage-collects old rows.

Overselling is prevented at the write: the reservation insert runs inside a transaction that does `SELECT … FOR UPDATE` on the variant row and re-checks availability before committing.

---

### Errores del dominio: código, no prosa (FASE 2, PR S)

Los errores que **una persona lee** se lanzan con una clave del catálogo, no
con su texto: `throw new CheckoutError("error.checkout.carritoVacio")`. La base
`DomainError` (`src/domain/errors.ts`) arma el `message` con esa clave, así que
todo lo que ya leía `error.message` —los formularios, los logs,
`adminActionError`— sigue funcionando sin cambios, y además queda el `code`
para poder preguntar *qué* pasó sin comparar prosa.

El motivo no es estético: con la prosa adentro de cada `throw`, los textos que
la compradora ve quedan repartidos por veinte archivos de dominio, entre
transacciones y bloqueos de fila, y quien traduce tiene que ir a buscarlos ahí.

**Lo que no se traduce**: los errores que sólo lee un desarrollador siguen
siendo `Error` a secas con su mensaje técnico. `qty inválida para la variante
3` o `Transición inválida para el pedido 12: pagado → pendiente_pago` no van a
un catálogo — nadie los va a leer en guaraní, y un stack trace tiene que decir
exactamente qué pasó.

## 3. Order state machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          ▼
  pendiente_pago ──────────────► pagado ──► preparando ──► enviado ──► entregado
      │      │   ▲                  ▲
      │      │   │ (admin aprueba)  │
      │      ▼   │                  │
      │  esperando_verificacion ────┘        ← comprobante subido (SPI/QR)
      │      │
      │      └──► rechazado ──► pendiente_pago      (comprobante inválido, reintento)
      ▼
   vencido   ◄── pasó reserved_until sin pago
      │
      └──► cancelado                          (manual, en cualquier estado pre-pago)
                              pagado ──► reembolsado   (sólo manual)
```

Every transition goes through **one** function, `transitionOrder(orderId, to, actor, reason)`, which:
1. opens a transaction and `SELECT … FOR UPDATE` on the order,
2. rejects any edge not in the allow-list (so a duplicate or late webhook can never drag `enviado` back to `pagado`),
3. on `→ pagado`: marks reservations `consumed` and decrements `variants.on_hand` in the same transaction,
4. on `→ vencido | cancelado`: marks reservations `released`,
5. writes an `order_events` row.

No UI or route ever runs a raw `UPDATE orders SET status = …`.

---

## 4. Pagopar v2 flow

```
Browser            Next.js (Hostinger)         Pagopar               MySQL
   │                     │                       │                    │
   │ POST /api/orders    │                       │                    │
   │────────────────────►│ re-price cart from DB (client is ignored)   │
   │                     │──────── tx: order + items + holds ─────────►│
   │                     │                       │                    │
   │                     │ token = sha1(PRIVATE_KEY + order_number + total_pyg)
   │                     │ POST /api/comercios/2.0/iniciar-transaccion │
   │                     │──────────────────────►│                    │
   │                     │  { hash_pedido, ... } │                    │
   │                     │◄──────────────────────│                    │
   │                     │──────── payments row (provider_ref = hash_pedido)
   │ redirect → checkout │                       │                    │
   │◄────────────────────│                       │                    │
   │ ────────────────── paga ──────────────────► │                    │
   │                     │                       │                    │
   │                     │  POST /api/webhooks/pagopar                 │
   │                     │◄──────────────────────│  (puede llegar antes
   │                     │                       │   del redirect, y N veces)
   │                     │ 1. guard token en querystring               │
   │                     │ 2. expected = sha1(PRIVATE_KEY + hash_pedido)
   │                     │ 3. timingSafeEqual vs token recibido        │
   │                     │ 4. INSERT IGNORE payment_events (provider,event_key)
   │                     │    affectedRows === 0 → replay → 200 y salir │
   │                     │ 5. verificar amount === orders.total_pyg    │
   │                     │ 6. transitionOrder(→ pagado)                │
   │                     │ 7. responder 200 en el formato que espera Pagopar
   │ /pedido/[n] hace polling → el estado cambia a "pagado" solo       │
```

**Hash rules that will cost you an afternoon if ignored:**

- `sha1(private_key + order_id + total)` — `total` must be the **integer PYG string exactly as sent**: `"150000"`. Every JS money habit pushes you toward `toFixed(2)`; `"150000.00"` produces a completely different digest and Pagopar rejects it.
- `order_id` = `orders.order_number` (immutable, human-readable), never an internal id.
- The webhook token is `sha1(private_key + hash_pedido)` — a **different input**. Two separate helpers, two unit-test vectors, no shared function.
- Compare with `crypto.timingSafeEqual` on equal-length buffers.
- **The webhook response envelope Pagopar expects has changed between doc revisions.** Confirm against the current v2 docs and pin an integration test against the sandbox during PR #3. Do not trust any remembered shape, including the one in this document.
- Respond within ~5 s or Pagopar retries. Do the slow work after responding, not before.
- Register the webhook URL over **HTTPS on the real domain** — Hostinger provides the certificate; Pagopar will not call `localhost` (use a tunnel in dev).

### 4.1 The payment that arrives after the order died

The cron cancels unpaid orders once `reserved_until` passes. Pagopar's notice can
land a second later — the buyer paid at 14:59:58 and the sweep ran at 15:00:00.
Both systems behaved correctly and the money is now in the merchant's account for
an order that is `vencido`. This is not a rare edge case; with a 45-minute hold on
card payments it will happen.

**The policy, in the order the rules are applied:**

1. **The payment is recorded before anything else, and the recording is never
   rolled back.** `payment_events` gets the raw notice, `payments` goes to `paid`.
   Whatever happens to the order afterwards, the transaction commits. Losing the
   record of a payment that really happened is the only unrecoverable outcome
   here: everything else can be fixed by a human who can *see* what occurred.
2. **The order revives only if the goods are still there.** `vencido → pagado` is
   a legal edge in the state machine, but entering `pagado` re-secures stock first
   (see below). If the last unit was sold while the order was expired, the
   transition throws, the order stays `vencido`, and nothing is oversold.
3. **The owner is told, without depending on a flag anyone has to remember to
   set.** `findUnmatchedPayments()` derives the list from the data — a `paid`
   payment whose order is not in `pagado|preparando|enviado|entregado|reembolsado`
   — and the admin dashboard shows it at the top in red. A boolean column would
   have been cheaper and would eventually drift; a query over the two tables that
   already hold the truth cannot.
4. **A `cancelado` order never revives automatically.** A person cancelled it on
   purpose, so the software does not overrule them. The money still shows up in
   the same list, for the same refund.

**What the owner can do about it.** The list is not read-only: each row carries
the two actions it implies. **Retry** re-runs the revival — `vencido → pagado`
through `transitionOrder`, which re-secures stock first, so it either revives
the order or leaves everything exactly as it was. It is safe to press as often
as the merchant restocks; a failed retry writes nothing. **Mark as refunded**
sets `payments.status = 'refunded'` and moves the order to `cancelado` with the
reason in `order_events`, in one transaction — the software does not move money,
it records that the owner already did.

Both re-read payment and order under `SELECT … FOR UPDATE` instead of trusting
the id the form submitted. The screen was rendered minutes ago and anything
could have happened since: the other owner already refunded it, the cron moved
the order, a sale took the last unit. Deciding on what the page said is deciding
on stale data. Concretely, a refund is refused if the order came back to life in
the meantime, and a retry on an already-revived order is a no-op rather than an
error — two owners pressing the same button at the same time produce exactly one
stock decrement and one `order_events` row.

**Why the stock re-check lives inside `transitionOrder` and not in the webhook.**
There are three ways into `pagado` — the Pagopar webhook, the owner approving a
transfer receipt, and the manual button in the panel — and any of them can be the
one that runs after the goods are gone. A check placed in the caller is a check
someone will forget to copy into the fourth caller. Putting it in the one function
that owns the `pagado` edge makes it structurally impossible to decrement
`on_hand` for stock that no longer exists.

**The reverse case falls out of the same rule.** An order can also still be
`pendiente_pago` with its reservation rows technically `held` but past
`expires_at`, because the cron has not run yet. Availability is computed live
(§2), so the storefront has already been offering that unit to everyone else.
Consuming those rows would decrement `on_hand` on the strength of a promise that
expired. `secureStockForPayment()` therefore releases the order's stale holds
first and re-acquires what it needs against live availability, taking
`SELECT … FOR UPDATE` on the variant and on the competing reservation rows. Either
it can secure every line or it secures none and throws — it verifies the whole
order before it writes anything, so a half-reserved order is not a state that can
exist.

**What the buyer sees.** A recovered order looks like any other paid order; the
`order_events` row records why (`pago tardío recuperado`). An unrecoverable one
stays `vencido` on the buyer's page, which is honest — the merchant owes them a
refund, and pretending the order is alive would be worse than saying nothing.

---

## 5. Manual SPI / QR + WhatsApp stream (the zero-fee path)

1. Order created → `pendiente_pago`, `reserved_until = NOW() + 24h`.
2. Confirmation page shows: Banco, Titular, RUC, nro. de cuenta, **the exact ₲ total with a copy button**, and the SPI QR image. Copy buttons on every field — typing an account number on a phone is where orders die.
3. Buyer uploads the comprobante → server validates MIME + size → uploads to a **private Cloudinary folder** (signed delivery URLs only) → `receipts` row → `esperando_verificacion`.
4. One-tap WhatsApp button: `https://wa.me/595XXXXXXXXX?text=` + `encodeURIComponent(message)`. Message contains order number, total, and the tokenized order URL. Keep under ~1500 chars — long deeplinks truncate on iOS.
5. Owner checks the receipt against the bank statement in `/admin`, clicks **Aprobar** → `transitionOrder(→ pagado)`, which also writes the `payments` row (below).

**Contra entrega (COD)** uses the same states, minus the receipt: the owner confirms on delivery. Worth having on day one — cash on delivery is still a large share of PY e-commerce.

### 5.1 A manual payment is still a payment

For a while `payments` only ever held Pagopar rows, because Pagopar was the
only path with an external system to record. An approved transfer receipt and a
confirmed COD reached `pagado` with no row at all: the money arrived and the
table that exists to record money arriving never heard about it. That is not a
cosmetic gap. It cost the reconciliation its most valuable cross-check —
`pedido_cobrado_sin_pago` had to be scoped to `payment_method = 'tarjeta'`,
which is to say switched off for the two paths the store actually gets paid
through.

**Entering `pagado` writes the payment row, in the same transaction.**
`recordManualPayment()` runs inside `transitionOrder`, next to the stock
re-check and for the same reason (§4.1): there are three ways into `pagado`,
and a record the caller has to remember to write is a record the fourth caller
will not write. If it were a second step, a process that dies in between would
leave the order charged and the payment unrecorded — precisely the mismatch
this exists to make impossible.

| `orders.payment_method` | `payments.provider` | who writes it |
|---|---|---|
| `transferencia` | `spi` | `transitionOrder`, on entering `pagado` |
| `contra_entrega` | `cod` | `transitionOrder`, on entering `pagado` |
| `tarjeta` | `pagopar` | `startPagoparCheckout` before redirecting; the webhook flips it to `paid` |

**`provider_ref` is the order number.** Nobody issues a transaction id for a
bank transfer or for cash in hand, so the reference has to come from something
that already identifies the charge without ambiguity. `orders.order_number` is
immutable, unique, and is what the owner has in front of them when they look
for the transfer on the bank statement. Because it is derivable from the order,
`UNIQUE(provider, provider_ref)` now *means* something — "one manual charge per
order per provider" — and a double-click, a retry, or an order re-entering
`pagado` collides with that index instead of duplicating the money. The insert
is `INSERT IGNORE`: an existing row is never overwritten, so a payment someone
already marked `refunded` cannot be resurrected by the order passing through
again.

**The invariant, restored.** `pedido_cobrado_sin_pago` no longer filters by
payment method: a settled order without a `paid`-or-`refunded` payment row is a
finding, whatever it was paid with. (`refunded` counts as recorded — refunding
money does not erase that it arrived.) Orders charged before this existed are
completed by `pnpm backfill:pagos-manuales`, a dry-run-by-default script rather
than a migration: the schema is applied with `drizzle-kit push`, which never
runs the files in `drizzle/`, so a backfill living there would run in the test
suite and never on the merchant's server.

---

## 6. Images & performance on PY mobile networks

- **Cloudinary** for everything. Product images public with `f_auto,q_auto` transformations; receipts in a **private/authenticated** folder, admin views them via signed URLs.
- Do **not** store uploads on the Hostinger filesystem — a git-based redeploy can wipe them.
- Blur placeholders stored in `product_images.blur_data_url`; `next/image` with `unoptimized` (Cloudinary already does the work) and long cache headers.
- Catalog pages use ISR (`revalidate`); only live availability is fetched client-side.
- Budget: LCP < 2.5 s on Slow-4G, client JS < 120 KB gz on the product page.
- MySQL pool `connectionLimit: 8` — Hostinger caps concurrent connections per user; a bigger pool causes random `ER_CON_COUNT_ERROR` under load.

---

## 7. FASE 2 (not built in MVP): FacturaPY integration

The store MVP issues **no legal invoices**. But the schema is already invoice-complete — RUC/CI with DV validation, `iva_rate` per line, per-rate IVA subtotals — so connecting it later is roughly one day of work, not a remodel.

**Direction of the integration: FacturaPY exposes the API, the store calls it.** The store must never touch FacturaPY's database or Prisma layer.

### Contract to build against

```
POST  https://facturapy.example/api/public/invoices
Header: Authorization: Bearer <API_KEY>        (per Company, hashed at rest, scoped)
Body:
{
  "external_ref": "PY-000123",                 // orders.order_number — idempotency key
  "issued_at":    "2026-07-29T14:03:00-03:00",
  "customer": {
    "doc_type": "RUC" | "CI" | "NINGUNO",
    "doc_number": "80012345-6",
    "name": "Comercial San Roque S.A.",
    "email": "...", "phone": "+595981123456",
    "is_consumidor_final": false
  },
  "payment_method": "transferencia" | "tarjeta" | "efectivo",
  "currency": "PYG",
  "items": [
    { "sku":"CAM-M-AZ", "description":"Camisa azul talle M",
      "qty":2, "unit_price_pyg":110000, "iva_rate":10 }     // IVA INCLUIDO
  ],
  "shipping_pyg": 25000,
  "total_pyg": 245000
}

202 → { "invoice_id":"...", "status":"QUEUED" }
```

Async by design — SIFEN can take time. Two ways back:

```
POST  <STORE_URL>/api/webhooks/facturapy          ← FacturaPY calls the store
      { "external_ref":"PY-000123", "invoice_id":"...",
        "status":"APPROVED"|"REJECTED", "cdc":"01800...", "kude_url":"https://..." }

GET   /api/public/invoices/:id                    ← polling fallback
```

Store side needs only: `orders.invoice_status` (`none|queued|approved|rejected`), `invoice_cdc`, `invoice_pdf_url`, an "Emitir factura" button in `/admin/pedidos/[id]`, and a webhook receiver reusing the same idempotency table (`payment_events` pattern).

**Legal note, not a technical one:** issuing a legal factura requires the *merchant's* own **timbrado from DNIT**, and for electronic invoicing a digital certificate + SIFEN habilitación tied to their RUC. That authorization belongs to the merchant, not to the software. The DNIT rollout phases move — verify current requirements with a contador before making any compliance claim to a client.
