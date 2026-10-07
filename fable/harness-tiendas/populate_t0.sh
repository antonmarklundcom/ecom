#!/bin/bash
# Fase 1 (T0): base, fixtures, planilla de la tienda, roles y la suite de navegador
# de la propia tienda (checkout, panel) contra su base desechable.
set -uo pipefail
S="${HARNESS_DIR:?export HARNESS_DIR=<carpeta de trabajo con env-e2e.sh, stores/ y wt-main/>}"
store=$1; db=$2; port=$3; extra_role=$4
cd $S/stores/$store
source $S/env-e2e.sh
export DATABASE_URL="${DATABASE_URL%/*}/$db" E2E_PORT=$port; export TEST_DATABASE_URL="$DATABASE_URL"
docker exec ecom-mysql8 mysql -uroot -proot -e "DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" 2>/dev/null
pnpm db:migrate > t0-migrate.log 2>&1; echo "migrate $?"
pnpm exec tsx scripts/prepare-browser-tests.ts > t0-prepare.log 2>&1; echo "prepare $?"
pnpm importar:productos $S/stores/$store.csv --aplicar > t0-import.log 2>&1; echo "import $?"; grep -E "producto|variante|categor" t0-import.log | tail -3
cat > crear-rol.mts <<TS
import "./src/lib/load-env";
import { createUser } from "./src/lib/auth";
import { closePool } from "./src/db";
await createUser({ email: "$extra_role@$store.example.test", password: process.env.OWNER_PASSWORD!, role: "$extra_role" });
await closePool();
console.log("rol $extra_role creado");
TS
pnpm exec tsx crear-rol.mts 2>&1 | tail -1; rm -f crear-rol.mts
pnpm build > t0-build.log 2>&1; echo "build $?"
timeout 1800 pnpm exec playwright test > t0-e2e.log 2>&1; echo "e2e $?"; grep -E "passed|failed|flaky" t0-e2e.log | tail -3
