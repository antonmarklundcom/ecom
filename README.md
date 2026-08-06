# ecom — Tienda PY

E-commerce para el mercado paraguayo. Guaraníes enteros, español (voseo), WhatsApp-first, mobile-first.

**Stack:** Next.js 15 (App Router, TS) · Drizzle ORM · Hostinger MySQL · Hostinger Node.js · Cloudinary · Tailwind + shadcn/ui · Zustand · Zod

## Documentos

| Archivo | Qué contiene |
|---|---|
| [ARCH.md](./ARCH.md) | Modelo de datos (ERD), modelo de seguridad, máquina de estados del pedido, flujos de pago, integración FacturaPY (fase 2) |
| [PLAN.md](./PLAN.md) | Los 5 PRs con tareas etiquetadas `[Opus 5]` / `[Sonnet 5]` |
| [TASKS.md](./TASKS.md) | Checklist del sprint activo (PR #1) |
| [.env.example](./.env.example) | Todas las variables de entorno con sus trampas documentadas |

## Estado

🚧 **PR #1 (Foundation & Data Layer) en curso.** Schema, máquina de estados, stock, numeración de pedidos, utils PY, auth y seed están listos; falta la vidriera (PR #2) y la cuenta de Hostinger. Ver `TASKS.md`.

## Arrancar en local

```bash
pnpm install
cp .env.example .env.local          # completá SESSION_PASSWORD: openssl rand -base64 32
docker compose up -d                # MySQL 8 en localhost:3306 (tienda_py + tienda_py_test)
pnpm db:push                        # schema + FULLTEXT + FK self-ref + contador
pnpm db:seed                        # 4 categorías, 24 productos, 43 variantes, 4 zonas de envío
pnpm create-owner                   # única forma de crear un usuario del panel
pnpm dev                            # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | lo que corre CI |
| `pnpm test` | unitarios siempre; los de integración necesitan `TEST_DATABASE_URL` (esa base se borra y se recrea en cada corrida) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed -- --reset-stock` | re-siembra pisando `on_hand` |

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
