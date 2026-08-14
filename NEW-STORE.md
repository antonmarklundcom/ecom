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

Cambiá también el favicon y el `og-image` en `public/`.

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
| `PAGOPAR_*` | credenciales del comercio; vacías = sin tarjeta, o `PAGOPAR_MODE="mock"` para demo |

`.env.example` documenta cada trampa — leelo, no lo adivines.

### 4. Base de datos y catálogo

```bash
docker compose up -d     # MySQL local (base `ecom`)
pnpm db:push             # schema + FULLTEXT + FK + contador
pnpm db:seed             # catálogo de ejemplo — reemplazalo por el real
pnpm create-owner        # única forma de crear usuario del panel
pnpm dev                 # tienda en / y panel en /admin
```

Para una demo mostrable al cliente antes de tener productos reales:
`pnpm demo` (catálogo + un pedido en cada estado).

Los productos reales se cargan desde el panel (`/admin/productos`), o
adaptando `scripts/seed.ts` si vienen de un CSV/planilla.

Las zonas de envío del seed son las de Gran Asunción — ajustalas al alcance
real del comercio.

### 5. Diseño

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

Deploy: seguí el playbook de Hostinger (Node.js + MySQL remoto), acordate del
cron cada 15 minutos contra `/api/cron/vencer-pedidos` y de registrar la URL
de respuesta de Pagopar.

---

## Arreglos que aparecen después

Los repos creados desde un template **no reciben** los commits posteriores del
template. Si arreglás un bug de checkout acá, las tiendas ya creadas no se
enteran.

Con dos o tres tiendas eso se maneja a mano:

```bash
git remote add template git@github.com:antonmarklundcom/ecom.git
git fetch template
git cherry-pick <sha>
```

Si algún día son muchas tiendas, recién ahí conviene sacar `src/domain` y
`src/lib` a un paquete compartido. Antes de eso es complejidad sin pagar.
