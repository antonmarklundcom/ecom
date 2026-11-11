#!/bin/bash
# Fase 1b: lo que cada tienda cambió por su cuenta antes del sync, commiteado.
#   Norte: piel rediseñada (pie de página, `product-card.tsx` con un color
#          escrito a mano y el corazón adentro del link, como en T0) y medios
#          de pago propios en `src/config/checkout.ts` (sin tarjeta).
#   Sur:   token `--radius` de su tema, medios de pago por entorno y una
#          migración propia (`customers.loyalty_note`) con su `db:generate`.
#   Oeste: (O24, desde f9979ce) dos migraciones propias que portan la 0011 y
#          la 0012 del template, la segunda con `products.pais_origen`.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
store=$1
cd "$S/stores/$store"
case $store in
  norte)
    sed -i 's|<p className="mt-2">{tagline}</p>|<p className="mt-2">{tagline} · Envíos a todo el país</p>|' src/components/site-footer.tsx
    sed -i 's|<p className="text-muted-foreground text-xs">\(\s*\)$|<p className="text-amber-700 text-xs font-semibold tracking-wide uppercase">\1|' src/components/product-card.tsx
    grep -q 'text-amber-700' src/components/product-card.tsx
    grep -q 'Envíos a todo el país' src/components/site-footer.tsx
    sed -i 's|paymentMethods: \["transferencia", "contra_entrega", "tarjeta"\]|paymentMethods: ["transferencia", "contra_entrega"]|' src/config/checkout.ts
    grep -q '\["transferencia", "contra_entrega"\]' src/config/checkout.ts
    git add -A; git commit -qm "Norte: pie, tarjeta de producto y medios de pago propios"
    ;;
  sur)
    sed -i 's|--radius: 0.625rem;|--radius: 0.25rem;|' src/styles/temas/neutro.css
    grep -q -- '--radius: 0.25rem;' src/styles/temas/neutro.css
    echo 'STORE_PAYMENT_METHODS=transferencia,contra_entrega' >> .env.local
    awk 'BEGIN{d=0} {print} /^export const customers = mysqlTable\(/{c=1} c && !d && /phone: varchar\("phone", \{ length: 20 \}\)\.notNull\(\),/{print "\n    /** Propia de Sur: nota de fidelidad del cliente. */\n    loyaltyNote: varchar(\"loyalty_note\", { length: 200 }),"; d=1}' src/db/schema.ts > schema.tmp && mv schema.tmp src/db/schema.ts
    grep -q 'loyalty_note' src/db/schema.ts
    pnpm db:generate > generate.log 2>&1
    ls drizzle/*.sql | tail -1
    git add -A; git commit -qm "Sur: radio del tema y migración propia loyalty_note"
    ;;
  oeste)
    # La forma de mascota (O24): sobre el baseline f9979ce, dos arreglos del
    # template portados a mano con su propio `db:generate`, bajo los números
    # que el template usa (0011, 0012), y una columna que es sólo de Oeste.
    git -C "$S/stores/tpl.git" show fb20fcf:src/db/schema.ts > src/db/schema.ts
    pnpm db:generate > generate-0011.log 2>&1
    ls drizzle/0011_*.sql
    git add -A; git commit -qm "Oeste: métodos de envío del template, portados a mano"
    git -C "$S/stores/tpl.git" show be45b09:src/db/schema.ts > src/db/schema.ts
    agregar_pais_origen src/db/schema.ts
    pnpm db:generate > generate-0012.log 2>&1
    ls drizzle/0012_*.sql
    grep -q 'pais_origen' drizzle/0012_*.sql
    git add -A; git commit -qm "Oeste: schema del plan de operación portado a mano, y su país de origen"
    ;;
  *) echo "no conozco la tienda $store"; exit 1 ;;
esac
git log --oneline -1
