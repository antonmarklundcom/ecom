# ecom — template de tienda online (Paraguay)

Base reutilizable para montar tiendas online paraguayas: la maquinaria (pedidos,
stock, pagos, panel) viene hecha y por tienda sólo se cambian marca, diseño,
base y productos — ver **[NEW-STORE.md](./NEW-STORE.md)**.

Guaraníes enteros, español (voseo), WhatsApp-first, mobile-first.

**Stack:** Next.js 15 (App Router, TS) · Drizzle ORM · Hostinger MySQL · Hostinger Node.js · Cloudinary · Tailwind + shadcn/ui · Zustand · Zod

## Documentos

| Archivo | Qué contiene |
|---|---|
| [ARCH.md](./ARCH.md) | Modelo de datos (ERD), modelo de seguridad, máquina de estados del pedido, flujos de pago, integración FacturaPY (fase 2) |
| [PLAN.md](./PLAN.md) | Los 5 PRs con tareas etiquetadas `[Opus 5]` / `[Sonnet 5]` |
| [TASKS.md](./TASKS.md) | Checklist por PR |
| [NEW-STORE.md](./NEW-STORE.md) | Checklist para arrancar una tienda nueva desde este template |
| [.env.example](./.env.example) | Todas las variables de entorno con sus trampas documentadas |

## Estado

✅ **PR #1 a #5 del `PLAN.md` mergeados**: schema y dominio (PR #1), vidriera (PR #2), checkout SPI/QR + contra entrega (PR #3), panel del dueño con su endurecimiento (PR #4) y Pagopar (PR #5, con modo mock para probarlo sin cuenta).

Falta para poder vender de verdad: la cuenta de Hostinger (deploy, PLAN.md 4.11), los datos bancarios reales del comercio, el número de WhatsApp, las credenciales de Pagopar y las fotos de producto. Son bloqueos de terceros, no trabajo pendiente de este repo — están todos juntos en la sección **"Bloqueado por terceros"** de `TASKS.md`.

## Arrancar en local

```bash
pnpm install
cp .env.example .env.local          # completá SESSION_PASSWORD: openssl rand -base64 32
                                     # y opcionalmente PAGOPAR_MODE="mock" (probar tarjeta sin cuenta de Pagopar)
docker compose up -d                # MySQL 8 en localhost:3306 (base `ecom`)
pnpm db:push                        # schema + FULLTEXT + FK self-ref + contador
pnpm db:seed                        # 4 categorías, 24 productos, 43 variantes, 4 zonas de envío
pnpm create-owner                   # única forma de crear un usuario del panel
pnpm dev                            # http://localhost:3000 · panel en /admin
```

Para ver la tienda con pedidos de verdad en vez de un catálogo vacío, `pnpm demo`
reemplaza los pasos `db:seed` de arriba — ver la sección de abajo.

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | lo que corre CI |
| `pnpm test` | unitarios siempre; los de integración necesitan `TEST_DATABASE_URL` (esa base se borra y se recrea en cada corrida) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed -- --reset-stock` | re-siembra pisando `on_hand` |
| `pnpm demo` | deja la base en un estado mostrable: catálogo + un pedido en cada estado |
| `pnpm reconcile` | control de caja: los totales de cada pedido más cinco invariantes entre tablas; sale con código 1 si algo no cuadra |
| `pnpm backfill:pagos-manuales` | completa la fila de `payments` de los pedidos cobrados por transferencia o contra entrega **antes** de que eso se registrara solo (ARCH.md §5.1). Ensayo por defecto: agregá `--apply` para escribir |
| `pnpm preflight` | qué falta para cobrar plata de verdad (webhook sin confirmar, `BANCO_*`, `CRON_SECRET`, `PAGOPAR_MODE` en producción); sale con código 1 si algo es inseguro |

### `pnpm demo` — la tienda lista para mostrar

Un solo comando después del quickstart de arriba (`db:push` ya corrido, no hace
falta `db:seed` a mano — `pnpm demo` siembra el catálogo él solo):

```bash
pnpm demo
pnpm dev   # y abrí /admin/pedidos
```

Deja sembrado el catálogo (si todavía no lo estaba) y crea un pedido de
ejemplo — nombre, WhatsApp, dirección paraguayos, no genéricos — en cada
estado de la máquina (ARCH.md §3): `pendiente_pago`, `esperando_verificacion`,
`pagado`, `enviado`, `entregado`, `cancelado`, `vencido`. Suma un octavo
pedido con método tarjeta parqueado en la pasarela simulada de Pagopar
(enciende `PAGOPAR_MODE=mock` él solo, sin tocar `.env.local`) e imprime el
link `/dev/pagopar/<hash_pedido>` al final para pagarlo, rechazarlo o
reenviar el aviso desde ahí.

Idempotente: cada pedido de ejemplo se identifica por el teléfono del
cliente, así que correr `pnpm demo` de nuevo reusa lo que ya existe en vez de
duplicarlo. Se niega a correr con `NODE_ENV=production` — es data de mentira,
no algo para dejar suelto donde hay plata de verdad.

### Demo del pago con tarjeta sin cuenta de Pagopar

`PAGOPAR_MODE="mock"` en `.env.local` levanta una Pagopar simulada en memoria:
sin red, sin credenciales y sin cuenta. El checkout vuelve a ofrecer tarjeta y,
en vez de mandar al comprador a Pagopar, lo manda a `/dev/pagopar/<hash_pedido>`
—una pantalla de esta misma app— con un botón por escenario: pagar, reenviar el
mismo aviso, rechazar, pagar de menos, mandar un aviso sin firma válida.

Lo simulado es **la contraparte, no nuestro código**: cada botón postea un aviso
firmado contra la ruta real `POST /api/webhooks/pagopar`, así que el pedido se
mueve por el mismo camino de siempre (firma → idempotencia → verificación de
monto → `transitionOrder()`). Alcanza para ver el ciclo completo
`pendiente_pago → pagado`, con su fila en `order_events` y el stock descontado.

El simulador **no existe en producción**: con `NODE_ENV=production` el modo se
apaga solo y cada función del simulador tira si alguien la llama igual
(`src/domain/pagopar/mode.ts`). Está probado en
`tests/unit/pagopar-mock-mode.test.ts`, y que el camino mockeado ejercite los
mismos guardarraíles que el real, en `tests/integration/pagopar-mock-flow.test.ts`.

## El panel (`/admin`)

Se entra con la cuenta que crea `pnpm create-owner` — **no hay ruta pública de registro**.

| Ruta | Qué hace |
|---|---|
| `/admin` | ventas del día y del mes, comprobantes por revisar, stock bajo |
| `/admin/pedidos` | filtros por estado/método/fecha, búsqueda por nro., WhatsApp o RUC, paginación server-side |
| `/admin/pedidos/[id]` | ítems, desglose de IVA, datos del cliente, timeline, botón de WhatsApp, aprobar/rechazar comprobante |
| `/admin/productos` | ABM de productos y variantes, fotos, ajuste de stock con motivo obligatorio (auditado) |

### Cron de Hostinger

Vence los pedidos sin pago que pasaron su `reserved_until` y limpia reservas viejas. En el hPanel, cada 15 minutos:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/vencer-pedidos
```

La ruta compara `CRON_SECRET` en tiempo constante y está rate-limited. Sin la variable configurada responde 503, nunca 200: una ruta "abierta hasta que la configuren" es una ruta abierta.

### `pnpm preflight` — antes de cobrar de verdad

Se corre **en el servidor**, después de configurar las variables: la mitad de lo
que revisa es sobre el entorno donde va a correr, no sobre el repo. Contesta una
sola pregunta —si mañana un desconocido compra acá, ¿se pierde algo?— y sale con
código 1 si la respuesta es que sí, para que un deploy automatizado se frene
solo.

```bash
pnpm preflight
```

Bloquea con: el sobre de la respuesta del webhook de Pagopar sin confirmar
(TASKS.md §21), `BANCO_*` incompletos, `CRON_SECRET` o `SESSION_SECRET` vacíos o
demasiado cortos, Cloudinary sin configurar, y `PAGOPAR_MODE=mock` en un entorno
con `NODE_ENV=production`. Advierte —sin frenar— con las credenciales de Pagopar
faltantes: la tienda cobra igual por transferencia y contra entrega.

No toca la base ni la red, y nunca imprime el valor de un secreto: sólo si está
y si tiene el largo mínimo.

## Decisiones tomadas

- **Hosting:** Hostinger (cuenta LATAM), slot Node.js + MySQL propio. No Supabase, no Vercel.
- **Pagos MVP:** transferencia SPI/QR manual + contra entrega. Pagopar es el PR #5, post-lanzamiento.
- **Sin cuentas de usuario** para compradores: link con token vía WhatsApp + búsqueda por nro. de pedido + teléfono.
- **Sin facturación legal en el MVP.** El schema queda listo para conectar FacturaPY después (contrato en `ARCH.md` §7).

## Reglas no negociables

- Todo monto es **entero** en guaraníes (`BIGINT UNSIGNED`). Nunca `float`, nunca `DECIMAL`, nunca `toFixed(2)`.
- Precios son **IVA incluido**. El IVA se desglosa, no se suma encima.
- El navegador nunca decide precios ni stock — el servidor recalcula todo desde la DB.
- El estado de un pedido sólo cambia vía `transitionOrder()`. Nunca un `UPDATE orders SET status` suelto.
- Nada de secretos con prefijo `NEXT_PUBLIC_`.
- **Toda** server action de `/admin` llama a `requireAdminSession()` como primera línea. El proxy que protege `/admin/*` es UX: una server action es un endpoint HTTP propio y se la puede invocar sin pasar por ninguna URL `/admin`.

Cada una de estas reglas tiene un test que la verifica sobre el código en CI (`tests/unit/no-raw-status-update.test.ts`, `money-path.test.ts`, `admin-guards.test.ts`, `security-review.test.ts`): un checklist que se corrió una vez a mano se rompe en el commit siguiente.
