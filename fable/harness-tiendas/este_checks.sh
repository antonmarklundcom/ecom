#!/bin/bash
# O36: la tienda "Este" (modo consulta) contra su base con datos de demo, en un
# `next start` de verdad. Cada chequeo imprime OK/FALLA y lo que vio.
#   este_checks.sh <base> <puerto>
set -uo pipefail
source "$(dirname "$0")/lib.sh"
db=$1; port=$2
cd "$S/stores/este"
source "$S/env-e2e.sh"
export DATABASE_URL="${DATABASE_URL%/*}/$db" TEST_DATABASE_URL="${DATABASE_URL%/*}/$db"
printf '%s\n' 'este-*.mts' 'este-*.cjs' >> .git/info/exclude
recrear_db "$db"
pnpm db:migrate > e-migrate.log 2>&1; echo "migrate $?"; tail -1 e-migrate.log
pnpm db:seed > e-seed.log 2>&1; echo "seed $?"
pnpm create-owner > e-owner.log 2>&1; echo "create-owner $?"
pnpm categorias:aplicar > e-cat1.log 2>&1; echo "categorias ensayo $?"; grep -E "^\s*[+~=] " e-cat1.log
pnpm categorias:aplicar --aplicar > e-cat2.log 2>&1; echo "categorias aplicar $?"
pnpm categorias:aplicar > e-cat3.log 2>&1; echo "categorias segunda corrida $?"; grep -E "^\s*[+~=] " e-cat3.log
pnpm preflight > e-preflight.log 2>&1; echo "preflight $?"; grep -iE "modo|no aplica|✗" e-preflight.log | head -12
pnpm seo:auditar > e-seo.log 2>&1; echo "seo:auditar $?"; tail -15 e-seo.log
pnpm seo:auditar --estricto > e-seo2.log 2>&1; echo "seo:auditar --estricto $?"
# Pedido armado a mano contra el dominio: tiene que rechazarse.
cat > este-pedido.mts <<'TS'
import "./src/lib/load-env";
import { eq, count } from "drizzle-orm";
import { db, closePool } from "./src/db";
import { variants, products, orders } from "./src/db/schema";
import { createOrder } from "./src/domain/create-order";
const [v] = await db.select({ id: variants.id }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(eq(products.slug, "auriculares-bluetooth-tws")).limit(1);
try {
  await createOrder({ items: [{ variantId: v!.id, qty: 1 }], customerName: "Prueba", customerPhone: "0981 123 456", docType: "NINGUNO", isConsumidorFinal: true, shipCity: "Asunción", shipAddress: "Calle 1", paymentMethod: "transferencia" });
  console.log("pedido: FALLA (se creó)");
} catch (e) { console.log(`pedido: ${(e as Error).name === "VentasCerradasError" ? "OK" : "FALLA"} rechazado con ${(e as Error).name}`); }
const [n] = await db.select({ n: count() }).from(orders);
console.log(`pedidos en la base: ${n!.n}`);
await closePool();
TS
pnpm exec tsx este-pedido.mts 2>&1 | grep -E "pedido"
# Un producto sin stock propio: en consulta tiene que salir como "por encargo" (BackOrder).
mysql_cli "$db" -e "UPDATE variants v JOIN products p ON p.id = v.product_id SET v.on_hand = 0 WHERE p.slug = 'parlante-portatil-20w'"
rm -rf .next
pnpm build > e-build.log 2>&1; echo "build $?"; grep -E "/guias" e-build.log | head -4
( pnpm exec next start --port "$port" > e-start.log 2>&1 & echo $! > e-start.pid )
for i in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && break; sleep 1; done
u="http://127.0.0.1:$port"
home=$(curl -sS "$u/")
echo "$home" | grep -q 'data-testid="header-cart-link"' && echo "sin carrito: FALLA" || echo "sin carrito: OK (home sin header-cart-link)"
echo "checkout: $(curl -s -o /dev/null -w '%{http_code}' "$u/checkout")  pedido/buscar: $(curl -s -o /dev/null -w '%{http_code}' "$u/pedido/buscar")"
sm=$(curl -sS "$u/sitemap.xml")
echo "sitemap guías: $(echo "$sm" | grep -o "<loc>[^<]*/guias[^<]*</loc>" | paste -sd ' ')"
echo "sitemap contacto: $(echo "$sm" | grep -c '/contacto</loc>')"
ficha=$(curl -sS "$u/producto/auriculares-bluetooth-tws")
echo "ficha JSON-LD: $(echo "$ficha" | grep -o '"availability":"[^"]*"' | sort | uniq -c | paste -sd ' ')"
echo "ficha línea: $(echo "$ficha" | grep -o 'data-testid="product-availability"[^>]*>[^<]*' | sed 's/.*>//' | head -1)"
sin=$(curl -sS "$u/producto/parlante-portatil-20w")
echo "sin stock propio, JSON-LD: $(echo "$sin" | grep -o '"availability":"[^"]*"' | sort | uniq -c | paste -sd ' ')  línea: $(echo "$sin" | grep -o 'data-testid="product-availability"[^>]*>[^<]*' | sed 's/.*>//' | head -1)"
echo "ficha botón WhatsApp: $(echo "$ficha" | grep -c 'data-testid="variant-inquiry-link"')  agregar al carrito: $(echo "$ficha" | grep -c 'data-testid="product-add-to-cart"')"
echo "feed ítems: $(curl -sS "$u/feed.xml" | grep -c '<item>')"
echo "guía: $(curl -s -o /dev/null -w '%{http_code}' "$u/guias/como-elegir-en-el-navegador")  borrador: $(curl -s -o /dev/null -w '%{http_code}' "$u/guias/borrador-de-prueba")"
# Un clic de verdad en el botón de WhatsApp de la ficha.
cat > este-clic.cjs <<'JS'
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/wa\.me|api\.whatsapp\.com/, (r) => r.abort());
  await p.goto(process.argv[2] + "/producto/auriculares-bluetooth-tws");
  const beacon = p.waitForRequest((r) => r.url().endsWith("/api/consulta") && r.method() === "POST", { timeout: 15000 });
  await p.getByTestId("variant-inquiry-link").first().click({ modifiers: [] }).catch(() => {});
  const r = await beacon; console.log("beacon:", r.postData());
  await p.waitForTimeout(1500); await b.close();
})().catch((e) => { console.log("clic: FALLA", e.message); process.exit(1); });
JS
node este-clic.cjs "$u" 2>&1 | tail -2
mysql_cli "$db" -N -e "SELECT CONCAT('enquiry_daily: ', origin, ' producto ', product_id, ' variante ', variant_id, ' = ', count) FROM enquiry_daily"
kill "$(cat e-start.pid)" 2>/dev/null; pkill -f "next start --port $port" 2>/dev/null; true
