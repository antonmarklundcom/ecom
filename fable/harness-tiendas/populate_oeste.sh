#!/bin/bash
# O24, fase 1: la base de Oeste como la de una tienda en producción desde
# f9979ce: migrada con SU drizzle/ (0000–0010 + sus 0011/0012 propias, como lo
# hace `POST /api/setup/init`), con catálogo, clientes, datos en su columna
# propia y un backup de `pnpm backup` en backups/.
#   populate_oeste.sh <base>
set -uo pipefail
source "$(dirname "$0")/lib.sh"
db=$1
cd "$S/stores/oeste"
source "$S/env-e2e.sh"
export DATABASE_URL="${DATABASE_URL%/*}/$db"
recrear_db "$db"
# f9979ce no tiene `pnpm db:migrate`: el migrador de drizzle, como el setup.
cat > migrar-propio.mts <<'TS'
import "./src/lib/load-env";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { applySchemaExtras } from "./src/db/extras";
const con = await mysql.createConnection({ uri: process.env.DATABASE_URL! });
await migrate(drizzle(con), { migrationsFolder: "drizzle" });
await applySchemaExtras(con as never);
await con.end();
console.log("migrado con el drizzle/ de la tienda");
TS
pnpm exec tsx migrar-propio.mts > o-migrate.log 2>&1; echo "migrate $?"; tail -1 o-migrate.log
pnpm db:seed > o-seed.log 2>&1; echo "seed $?"; tail -2 o-seed.log
mysql_cli "$db" -e "UPDATE products SET pais_origen = IF(id % 2 = 0, 'Paraguay', 'Brasil');
  INSERT INTO customers (phone, name) VALUES ('0981000101', 'Ana Oeste'), ('0981000102', 'Beto Oeste');
  INSERT INTO shipping_methods (slug, name, zone_ids, allowed_payment_methods) VALUES ('moto', 'Moto en el día', '[]', '[\"transferencia\"]');"
echo "datos propios $?"
mysql_cli -N "$db" -e "SELECT COUNT(*), SUM(pais_origen IS NOT NULL) FROM products; SELECT COUNT(*) FROM __drizzle_migrations"
bin=$(dirname "${HARNESS_MYSQLDUMP:?ruta a mysqldump.exe}")
command -v cygpath > /dev/null && bin=$(cygpath -u "$bin")   # Git Bash: C:/… no sirve en PATH
PATH="$bin:$PATH" pnpm backup > o-backup.log 2>&1; echo "backup $?"; tail -1 o-backup.log
