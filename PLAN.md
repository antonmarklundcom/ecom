# PLAN.md — Tienda PY · FASE 2

**Stack (locked):** Next.js 16 + Drizzle + **Hostinger MySQL** + **Hostinger Node.js slot** + Cloudinary.
No Supabase, no Vercel, no Cloudflare. Deploy mechanics live in `DEPLOY.md` and the `nextjs-deploy-hostinger` skill.

**Estado:** el plan original (PR #1–#5: schema, vidriera, checkout, admin, Pagopar) está **terminado y mergeado**, más los PRs de endurecimiento #6–#12 — el historial completo vive en `TASKS.md`. Este archivo es el plan de la **FASE 2**: cuentas de cliente opcionales, roles de verdad, cupones, ABMs que faltan del panel, UX de la vidriera e i18n por tienda.

**Objetivo de la FASE 2:** que el template sea *vendible* — que el dueño administre su tienda entera (usuarios, categorías, zonas) desde el navegador sin llamar al desarrollador, que la tienda pueda tener clientes con cuenta (para perks y marketing) **sin obligar a nadie a registrarse**, y que una tienda nueva pueda salir en otro idioma cambiando un solo archivo.

Task tags: **[Opus 5]** = schema, plata, auth/sesiones, guards, review final · **[Sonnet 5]** = UI, rutas, formularios, ABMs, extracción de strings.

**Ejecución en dos chats, para poder ir AFK:**

- **CHAT 1 (Opus 5):** PR A–G — maquinaria: roles, cuentas de cliente, cupones. Todo lo que toca auth, sesiones o plata.
- **CHAT 2 (Sonnet 5):** PR H–S — UX de vidriera, ABMs del panel, feed de actividad, i18n. Arranca **después** de mergear el chat 1.

Dentro de cada chat: abrir el PR, esperar CI verde completo (unitarios **e integración** contra MySQL), mergear, seguir con el próximo. Los PRs sin dependencia entre sí pueden ir en paralelo; los `depende de:` no.

---

## Guardarraíles (leer antes de escribir una línea)

Los seis de `README.md` §"Reglas no negociables" siguen vigentes y tienen tests que los verifican en CI. Para la FASE 2 se suman:

1. **Todo lo nuevo es opcional con default seguro.** Cada feature nueva visible (cuentas de cliente, login sin contraseña, cupones, hero de la home) va detrás de un flag en `src/config/tienda.ts` o de "cero filas = invisible". Con todos los flags apagados la tienda se comporta **exactamente** como hoy. El PR E agrega un test de CI que arranca con todos los flags apagados y verifica que nada nuevo se renderice.
2. **El split maquinaria/piel es sagrado** (NEW-STORE.md). Todo esto es maquinaria (`src/domain`, `src/lib`, `/admin`, checkout) salvo el hero de la home (PR O, piel). `template:diff` tiene que seguir marcando bien.
3. **Guards primero, siempre.** Toda server action nueva de `/admin` llama a su guard en la primera línea. Si un PR agrega una función guard nueva (`requireVendedorSession`, `requireCustomerSession`), **el mismo PR** actualiza el regex de `tests/unit/admin-guards.test.ts`.
4. **Clientes ≠ usuarios del panel.** Tabla propia (`customers`), sesión propia con **cookie propia** (nunca la del admin), rate limit en el login, y el error de login jamás distingue "no existe" de "contraseña incorrecta" — igual que `authenticate()` hoy.
5. **Descuentos son plata.** Los cupones pasan por `computeOrderTotals` y por los invariantes de `pnpm reconcile` (extenderlos en el mismo PR). El navegador nunca calcula un descuento.
6. **Merge sólo con CI verde completo.** "Verde" = typecheck + lint + unitarios + integración (contenedor MySQL) + build + drift de migraciones. Nunca mergear con sólo los unitarios.
7. **Migraciones versionadas** (`pnpm db:generate`), nunca `db:push` contra una base con pedidos reales. `/api/setup/init` las corre solo en el próximo deploy — no hay trabajo manual de base.

---

# CHAT 1 — Opus 5 · maquinaria: roles, cuentas, cupones

## PR A — Higiene (sin dependencias, chico)
*Branch: `feat/higiene-docs`*

| # | Task | Model |
|---|---|---|
| A.1 | Docs: "Next.js 15" → "Next.js 16" en ARCH.md/TASKS.md/README.md donde aparezca | Sonnet 5 |
| A.2 | **Una sola fuente de labels de estado**: unificar `ORDER_STATUS_LABEL` (`src/components/admin/labels.tsx`) y el `STATUS_LABEL` inline de `src/app/pedido/[orderNumber]/page.tsx` en un módulo compartido (puede conservar la variante "para el comprador" y "para el panel", pero en un solo archivo). Prerrequisito del i18n del chat 2 | Sonnet 5 |
| A.3 | Campo de email en el checkout: el schema ya lo acepta (`CheckoutInputSchema`), pero el `<Input>` nunca se renderizó y siempre viaja vacío. Agregarlo **opcional**, con label honesto ("por si tu WhatsApp falla") | Sonnet 5 |

**Exit:** `rg "Next.js 15"` sin resultados; un solo módulo exporta labels de estado; un checkout con email lo persiste en `orders.customer_email`.

## PR B — Roles de verdad: owner / staff / vendedor
*Branch: `feat/roles-reales` · Sin dependencias*

Hoy `requireOwnerSession()` existe pero **nadie la llama**: owner y staff pueden lo mismo, incluidos reembolsos. Este PR cablea los dos niveles y agrega el tercero.

| # | Task | Model |
|---|---|---|
| B.1 | Migración: `USER_ROLES = ['owner', 'staff', 'vendedor']` + `users.last_login_at` | **Opus 5** |
| B.2 | Matriz de permisos (documentarla en ARCH.md §1): **owner** = todo + gestión de usuarios, reembolsos (`markPaymentRefunded`), borrado de productos/variantes, edición de categorías y zonas, exports CSV · **staff** = pedidos, comprobantes (aprobar/rechazar), productos, ajustes de stock · **vendedor** = ver pedidos y transicionar sólo `pagado → enviado → entregado`; sin comprobantes, sin precios, sin stock, sin dashboard de plata, sin exports | **Opus 5** |
| B.3 | Cablear: `requireOwnerSession()` en las acciones owner-only; nuevo `requireStaffSession()` (owner+staff, excluye vendedor) en las de plata/stock/productos; `requireAdminSession()` queda para lo que los tres pueden. Actualizar el regex de `admin-guards.test.ts` en este mismo PR | **Opus 5** |
| B.4 | UI por rol: ocultar en el panel los botones/nav que el rol no puede usar (la defensa real son los guards; esto es UX) | Sonnet 5 |
| B.5 | Tests: por cada acción, el rol de abajo recibe `ForbiddenError`; `authenticate()` actualiza `last_login_at` | **Opus 5** |

**Exit:** un `staff` que intenta reembolsar recibe error prolijo; un `vendedor` sólo ve pedidos y los marca enviados/entregados.

## PR C — `/admin/usuarios` (depende de: B)
*Branch: `feat/admin-usuarios`*

La página que hace al template vendible: el dueño gestiona a sus empleados sin SSH ni llamarte.

| # | Task | Model |
|---|---|---|
| C.1 | Página owner-only: listar usuarios del panel (email, nombre, rol, activo, último login), crear (email + contraseña temporal + rol), desactivar/reactivar, resetear contraseña, cambiar rol | Sonnet 5 |
| C.2 | Server actions con `requireOwnerSession()`; reglas duras: no podés desactivarte a vos mismo, ni desactivar/degradar al último owner activo | **Opus 5** |
| C.3 | `pnpm create-owner` queda como bootstrap del primer owner; documentar en README que el resto se crea desde el panel | Sonnet 5 |

**Exit:** flujo completo probado: owner crea un staff, el staff entra, el owner lo desactiva y el staff ya no entra.

## PR D — Atribución auditable (depende de: B, chico)
*Branch: `feat/actor-user-id`*

| # | Task | Model |
|---|---|---|
| D.1 | Migración: `order_events.actor_user_id` y `stock_adjustments.actor_user_id` (FK nullable a `users.id`); las escrituras nuevas lo completan junto al `actor` de texto que ya existe (no se backfillea el histórico) | **Opus 5** |

**Exit:** un evento nuevo de admin queda con FK consultable, no sólo el string `admin:email`.

## PR E — Cuentas de cliente (flag, apagado por defecto) (paralelo con B)
*Branch: `feat/cuentas-clientes`*

**El checkout como invitado no se toca.** La cuenta es un upsell ("guardá tus datos para la próxima"), nunca una pared. Con `TIENDA.cuentasClientes: false` (el default) nada de esto se renderiza.

| # | Task | Model |
|---|---|---|
| E.1 | Migración: tabla `customers` (id, `phone` único normalizado PY, `email` único nullable, `password_hash` nullable, nombre, `marketing_opt_in`, `is_active`, `created_at`, `last_login_at`) + `orders.customer_id` (FK nullable). **Separada de `users`** — un cliente jamás pisa el panel | **Opus 5** |
| E.2 | Sesión de cliente: iron-session con **cookie y secreto propios** (`customer_session`), `requireCustomerSession()`. Registro y login con **teléfono O email** + contraseña (bcrypt, mismos helpers), rate-limited, error genérico que no revela si la cuenta existe. Sin verificación de email/SMS en esta fase (no hay proveedor de envío) — documentar la limitación | **Opus 5** |
| E.3 | Flag `cuentasClientes` en `tienda.ts`: apagado ⇒ las rutas `/cuenta/*` devuelven 404 y el header no muestra nada. **Test de CI "flags apagados = tienda de hoy"** (guardarraíl 1) | **Opus 5** |
| E.4 | UI: `/cuenta` (mis pedidos — por `customer_id` y también los pedidos viejos que matcheen el teléfono verificado de la cuenta —, mis datos), login/registro, entrada discreta en el header | Sonnet 5 |
| E.5 | Checkout logueado: prefill de nombre/WhatsApp/email/dirección, el pedido queda con `customer_id`. Checkout invitado: idéntico a hoy, con un "¿querés guardar tus datos?" opcional post-pedido | Sonnet 5 |
| E.6 | Panel: `/admin/clientes` muestra si el comprador tiene cuenta y su opt-in de marketing; export CSV de clientes con opt-in (owner-only) — la lista de marketing que hoy no existe | Sonnet 5 |

**Exit:** con el flag apagado, snapshot de la tienda idéntico a `main`; con el flag prendido, registro → compra logueada → historial en `/cuenta`, y el invitado compra igual que siempre.

## PR F — Login sin contraseña, pre-armado (depende de: E)
*Branch: `feat/login-sin-password`*

Pre-construido para todas las tiendas, **inactivo hasta que la tienda tenga con qué mandar mensajes**: mandar un OTP por WhatsApp requiere WhatsApp Cloud API (credenciales + número verificado de Meta) — eso es lo que una tienda nueva "tiene que verificar antes de usarlo".

| # | Task | Model |
|---|---|---|
| F.1 | Maquinaria de OTP/magic-link: token de un solo uso, hasheado en DB, expira a los 10 min, rate-limited, invalida los anteriores | **Opus 5** |
| F.2 | Interfaz `MessageSender` con dos implementaciones: `whatsappCloud` (usa `WHATSAPP_CLOUD_*` del env) y `consola` (dev). Sin credenciales ⇒ la opción no se ofrece en el login — jamás un botón que no puede funcionar | **Opus 5** |
| F.3 | UI del flujo + sección en NEW-STORE.md y `.env.example`: qué pide Meta y cómo prenderlo por tienda | Sonnet 5 |

**Exit:** en dev (sender `consola`) el flujo completo anda; sin credenciales el login sólo ofrece contraseña.

## PR G — Cupones (depende de: B; `solo_clientes` degrada sin E)
*Branch: `feat/cupones`*

| # | Task | Model |
|---|---|---|
| G.1 | Migración: `coupons` (código único, tipo `porcentaje`/`monto_fijo` — el monto en **Gs enteros**, jamás float —, mínimo de pedido, vigencia, límite de usos global y por cliente, `solo_clientes`, activo) + `orders.coupon_id` + columna de descuento en el desglose | **Opus 5** |
| G.2 | Dominio: validación y aplicación **dentro de `computeOrderTotals` en el server**, redondeo de IVA por línea intacto; extender los invariantes de `pnpm reconcile` con el descuento en el mismo PR | **Opus 5** |
| G.3 | Checkout: campo "código de descuento" plegado, feedback claro (vencido/mínimo no alcanzado/agotado), el desglose muestra el descuento; `solo_clientes` exige sesión de cliente (con el flag de cuentas apagado esos cupones simplemente no validan) | Sonnet 5 |
| G.4 | `/admin/cupones` (owner-only): ABM + usos consumidos. Cero cupones = nada visible en el checkout | Sonnet 5 |
| G.5 | Tests de concurrencia: dos checkouts simultáneos no gastan dos veces un cupón de un solo uso (`FOR UPDATE`, como el stock) | **Opus 5** |

**Exit:** `pnpm reconcile` cuadra con pedidos con descuento; el cupón agotado pierde la carrera limpiamente.

**Cierre del chat 1:** correr `/security-review` sobre el acumulado, `pnpm reconcile` y `pnpm preflight`, y dejar en el chat un informe: qué se hizo, riesgos vistos, ideas que surgieron.

---

# CHAT 2 — Sonnet 5 · UX, ABMs, i18n (arranca con el chat 1 mergeado)

## PR H — Skeletons (sin dependencias) — **hecho**
`loading.tsx` para `/` reusando `ProductCardSkeleton` (antes sólo `/buscar` lo tenía).

**Corrección de alcance:** el plan pedía además `/categoria/[slug]` y `/producto/[slug]`, y esas dos **no llevan `loading.tsx` a propósito** — decisión ya tomada y comentada en el código desde el PR de las fichas. Las dos deciden su 404 en el cuerpo (`notFound()`), y el Suspense de un `loading.tsx` manda el shell —y con él un HTTP 200— antes de que se sepa si la página existe: un producto borrado respondería 200 con la pantalla de 404, que es exactamente lo que hace que Google indexe fantasmas. El esqueleto de la home no tiene ese problema porque la home siempre existe.

## PR I — SEO técnico (sin dependencias) — **hecho**
`src/app/sitemap.ts` (home + categorías activas + productos publicados, con el mismo filtro `PUBLISHED()` de la vidriera) + `robots.ts` (bloquea `/admin`, `/api`, `/checkout`, `/pedido`, `/cuenta`, `/dev`) + JSON-LD `BreadcrumbList` e `ItemList` en categoría (producto ya tenía el suyo).

Las piezas puras viven en `src/lib/seo.ts` para que se testeen sin Next ni base. Dos decisiones que valen: sin `NEXT_PUBLIC_SITE_URL` el sitemap sale **vacío** y `robots.txt` no declara `sitemap:` —una URL relativa no le sirve a ningún crawler y un dominio inventado es peor que no publicar—, y el `ItemList` numera desde la página actual (en la página 2 el primer producto es el 13). El test `tests/unit/seo.test.ts` recorre `src/app` y exige que toda ruta de nivel uno que no sea pública esté en `RUTAS_PRIVADAS`: una `/cuenta` nueva que se olvide de la lista se indexaría en silencio.

## PR J — `/admin/categorias` (owner-only) — **hecho**
ABM completo: crear, renombrar, cambiar el enlace, reordenar (subir/bajar) y activar/desactivar. Antes de este PR la tabla la escribía sólo el seed.

**Lo que se decidió sobre "qué pasa con los productos de adentro":** apagar una categoría ahora los esconde también a ellos. Hasta acá `is_active = false` sacaba el link del menú y 404-eaba la página de la categoría, pero sus productos seguían apareciendo en la home y en el buscador, con una miga de pan que apuntaba a una página que ya no existía. Ahora el helper `PUBLISHED()` de `src/db/queries.ts` exige categoría activa —una línea, todas las consultas de vidriera— y `priceCart()` los rechaza, así que un carrito viejo en `localStorage` tampoco compra lo que el comercio acaba de esconder. Los productos no se modifican: conservan `is_active` y `published_at` y vuelven enteros al reactivar. La confirmación dice el número concreto de productos que se van a esconder, no un "¿estás seguro?".

Reordenar reescribe el orden completo en vez de intercambiar el par: las posiciones que deja el seed pueden venir empatadas, y un swap sobre empates no mueve nada (botón que parece roto y no da error).

## PR K — `/admin/envios` (owner-only) — **hecho**
ABM de `shipping_zones`: nombre, ciudades (una por línea), precio, umbral de envío gratis y activar/desactivar. Owner-only por lo mismo que los cupones: el flete es plata.

Los montos pasan por `assertGs` —enteros en guaraníes— y las ciudades se deduplican con el mismo `normalizeCity()` que usa la cotización, así que "Asunción" y "asuncion" no entran dos veces. Un umbral de ₲0 se rechaza con la explicación ("regala todos los envíos; si es lo que querés, poné el precio en 0") en vez de guardarse en silencio. La pantalla marca cuál es la zona más cara —la que paga una ciudad que no está en ninguna lista— y avisa cuando no queda ninguna activa, que es el estado en el que la tienda deja de cobrar envío. Las zonas no se borran: `orders.shipping_zone_id` las nombra.

Los pedidos en vuelo no se rompen: la cotización se recalcula server-side en cada paso y los pedidos ya creados guardan su propio `shipping_pyg`.

## PR L — `/admin/actividad` (owner y staff) — **hecho**
Feed global paginado de `order_events` + `stock_adjustments`, filtrable por usuario (el `actor_user_id` del PR D), tipo y fecha, con la fecha en la URL para poder mandar el link.

La mezcla es un `UNION ALL` en SQL y no dos consultas juntadas en JS: con dos listas separadas la paginación miente —traer 30 de cada tabla y ordenar después no da las 30 más recientes del conjunto, y la página 2 repite lo que la 1 ya mostró—. El orden desempata por id dentro del mismo segundo, por lo mismo. Lo que movió el cron o un webhook aparece sin usuario, que es la verdad: no lo hizo nadie del panel.

De paso, `rowsOf()` —las cuatro líneas que sacan las filas de un `execute()` crudo— estaba copiado en `reconciliation.ts`, `manual-payments.ts` y `payment-recovery.ts`; ahora vive en `src/domain/rows.ts`.

## PR M — Productos relacionados — **hecho**
"También te puede interesar" en `/producto/[slug]`: misma categoría, con stock, sin el actual; sin nada que mostrar la sección no se renderiza.

"Con stock" es la parte que tiene trampa: el stock que se ve no es `on_hand`, es `on_hand` menos las reservas vigentes. El SQL descarta por `on_hand > 0` —barato— pero el filtro real pasa después de `hydrate()`, que es quien conoce la disponibilidad. Por eso se piden más candidatos de los que se muestran.

## PR N — Filtros y búsqueda — **hecho**
Chips de filtros activos con su ✕ (sacan ese filtro y dejan los otros), contadores por marca, y sugerencias mientras se escribe.

El contador cuenta sobre la categoría entera y **no** sobre los otros filtros ya puestos: "Marca X (12)" contesta "¿cuánto hay de esta marca acá?", que es la pregunta que se hace antes de elegirla; recalcularlo contra el rango de precio ya elegido diría 0 en casi todas.

Las sugerencias salen del mismo `searchProducts()` que `/buscar` —lo que se ve en la lista es lo que se encuentra al entrar—, con debounce de 250 ms y rate limit propio en el servidor (el debounce es del cliente, y el cliente no es de fiar). El buscador ahora es un `<form action="/buscar" method="get">` de verdad: **sin JavaScript sigue andando**, y las sugerencias son un agregado encima que puede no aparecer sin romper nada.

## PR O — Hero de la home (piel, config-driven)
Slot de hero/banner en `tienda.ts` (imagen Cloudinary + título + CTA, o lista para carrusel simple). Sin configurar ⇒ la home actual intacta. **Es piel**: cada tienda lo rediseña libre. *Branch: `feat/home-hero`*

## PR P–S — i18n por tienda (Nivel A: un idioma por tienda, elegido en `tienda.ts`)
**En serie y al final** (así las features de arriba se extraen una sola vez). No hay switcher para el visitante ni rutas por locale — eso sería un Nivel B futuro sobre esta base. Las URLs quedan en español para siempre (decisión: son parte del template). Moneda y dinero **fuera de alcance**: `money.ts` queda PYG-entero con su `₲` literal.

| PR | Task |
|---|---|
| P | Infra: catálogo de mensajes (next-intl sin routing o equivalente liviano), `TIENDA.lang` elige el catálogo, `es-PY` completo como default y fallback. *Branch: `feat/i18n-infra`* |
| Q | Extraer strings de la vidriera (~90) usando el módulo unificado de labels del PR A.2. *Branch: `feat/i18n-vidriera`* (depende de: P) |
| R | Extraer strings del panel (~150). *Branch: `feat/i18n-admin`* (depende de: P) |
| S | Los difíciles: templates de WhatsApp (`order-messages.ts`) parametrizados, y errores de dominio convertidos a **códigos** + lookup de mensaje (los ~20 throw sites de `src/domain/*` que hoy llevan prosa). *Branch: `feat/i18n-dominio`* (depende de: P, Q) |

**Exit del chat 2:** con `lang: "es-PY"` la tienda es byte-idéntica en textos a la actual; un segundo catálogo (`en`) de prueba renderiza la vidriera completa sin strings hardcodeados; CI verde en todo.

**Cierre del chat 2:** mismo informe final: hecho, riesgos, ideas.

---

## FASE 3 — deliberadamente afuera (no arrancar sin decisión explícita)

1. **FacturaPY** — contrato listo en `ARCH.md` §7; requiere timbrado/DNIT del comercio.
2. **Nivel B de i18n** — switcher para el visitante, rutas por locale, hreflang. Sobre la base del PR P.
3. **Wishlist y reseñas** — recién tienen sentido con cuentas de cliente maduras y moderación.
4. **Multi-tenant** — agregar `tenant_id` antes, no después.
5. **WhatsApp Cloud API para notificaciones salientes** (pedido confirmado, enviado) — el sender del PR F.2 ya deja la interfaz lista.
6. **Carritos abandonados, devoluciones/RMA.**
