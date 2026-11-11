#!/bin/bash
# Fase 3: la tienda sincronizada, verificada como la verificaría su CI más el
# deploy: install congelado, tipos, lint, suite, migración sobre su base con
# datos, huella de los datos, preflight, build y navegador.
#   verify_store.sh <tienda> <base-con-datos> <puerto>
set -uo pipefail
source "$(dirname "$0")/lib.sh"
store=$1; data_db=$2; port=$3
cd "$S/stores/$store"
source "$S/env-e2e.sh"
base="${DATABASE_URL%/*}"
suite_db="${DB_PREFIX}${store}_suite_test"; e2e_db="${DB_PREFIX}${store}_e2e_test"
pnpm install --frozen-lockfile > v-install.log 2>&1; echo "install $?"
pnpm typecheck > v-typecheck.log 2>&1; echo "typecheck $?"
pnpm lint > v-lint.log 2>&1; echo "lint $?"
recrear_db "$suite_db"
DATABASE_URL="$base/$suite_db" TEST_DATABASE_URL="$base/$suite_db" REQUIRE_DATABASE_TESTS=1 pnpm test > v-test.log 2>&1; echo "test $?"; grep -E "Test Files|Tests " v-test.log
"$PY" "$HERE/snapshot.py" "$data_db" pre-migrate.json
DATABASE_URL="$base/$data_db" pnpm db:migrate > v-migrate.log 2>&1; echo "migrate $?"; tail -2 v-migrate.log
"$PY" "$HERE/snapshot.py" "$data_db" post-migrate.json pre-migrate.json
"$PY" "$HERE/snapshot.py" --comparar pre-migrate.json post-migrate.json
DATABASE_URL="$base/$data_db" pnpm db:check > v-dbcheck.log 2>&1; echo "db:check $?"; grep -i "migraciones" v-dbcheck.log | head -2
# Sin bucket de R2 (plan §7 ítem 6) el preflight bloquea en R2 y en nada más: es
# lo correcto para una tienda que no puede recibir comprobantes. No se le dan
# credenciales falsas: el canario se conectaría a Cloudflare.
DATABASE_URL="$base/$data_db" pnpm preflight > v-preflight.log 2>&1; echo "preflight $?"
bloquean=$(grep -E "^\s+✗ " v-preflight.log | sed 's/^\s*✗ //' | paste -sd ',' -)
[ "$bloquean" = "Imágenes y archivos (R2)" ] && echo "preflight: sólo bloquea R2 (esperado sin bucket)" || echo "preflight: BLOQUEA [$bloquean]"
grep -A1 "Medios de pago" v-preflight.log | head -2
pnpm build > v-build.log 2>&1; echo "build $?"
export DATABASE_URL="$base/$e2e_db" TEST_DATABASE_URL="$base/$e2e_db" E2E_PORT=$port
recrear_db "$e2e_db"
pnpm db:migrate > v-e2e-migrate.log 2>&1 && pnpm exec tsx scripts/prepare-browser-tests.ts > v-e2e-prepare.log 2>&1; echo "e2e-prepare $?"
timeout 1800 pnpm exec playwright test > v-e2e.log 2>&1; echo "e2e $?"; grep -E "✘|passed|failed|flaky" v-e2e.log | tail -6
