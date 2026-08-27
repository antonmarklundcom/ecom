# CLAUDE.md

Este repo es el **template** de tiendas online (`antonmarklundcom/ecom`), o
una tienda creada desde él con "Use this template". Antes de tocar código,
leé:

- **NEW-STORE.md** — el camino completo para levantar una tienda nueva:
  `pnpm nueva-tienda`, entorno, base de datos, catálogo, diseño, preflight.
- **ARCH.md** — arquitectura: dominio, estados del pedido, plata, Pagopar.
- **PLAN.md** / **TASKS.md** — qué falta y en qué fase está.
- **DEPLOY.md** — el runbook de Hostinger.

## La regla que más importa: maquinaria vs. piel

| Maquinaria — no se toca por tienda | Piel — libre de rediseñar |
|---|---|
| `src/domain/**` (estados del pedido, stock, plata, Pagopar) | `site-header`, `site-footer`, home, `product-card`, categorías |
| `src/lib/**` (sesión, seguridad, guaraníes) | tokens de `globals.css`, tipografía, imágenes |
| checkout y sus rutas API, `src/app/actions` | textos y copy |
| `/admin` (lógica; el markup se puede repintar) | `src/config/tienda.ts` (marca, hero, flags) |

Regla práctica: si el archivo toca plata, stock o estados de pedido, no se
toca por tienda. Si sólo dibuja, es libre. Ver NEW-STORE.md §5 para el
detalle completo y las excepciones (`checkout-form.tsx`, `src/app/admin`).

## Antes de cualquier cambio

- Marca, textos y contacto salen de `src/config/tienda.ts` — no hardcodees el
  nombre de la tienda en otro archivo (`tests/unit/marca-centralizada.test.ts`
  lo bloquea).
- No inventes credenciales de terceros ni valores "por si acaso" (ver
  `.env.example`): una variable vacía debe apagar la feature, no fallar en
  silencio ni usar un default inventado.
- Cambios de schema van con su migración generada y commiteada
  (`pnpm db:generate`) — CI falla si `schema.ts` se despega de `drizzle/`.
- Antes de dar por terminado algo: `pnpm typecheck && pnpm lint && pnpm test`.
- Para saber si una tienda ya puede cobrar: `pnpm preflight`. Para control de
  caja: `pnpm reconcile`.

## Si este repo es una tienda (no el template)

Corré `pnpm template:diff` de vez en cuando para ver qué arreglos de
`antonmarklundcom/ecom` le faltan a esta tienda (requiere el remoto
`template`, ver NEW-STORE.md). No cherry-pickees piel que ya rediseñaste.
