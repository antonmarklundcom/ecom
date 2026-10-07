#!/bin/bash
# Fase 3: la tienda sincronizada, verificada como la verificaría su CI más el
# deploy: install congelado, tipos, lint, suite, migración sobre su base con
# datos, huella de los datos, preflight, build y navegador.
set -uo pipefail
S="${HARNESS_DIR:?export HARNESS_DIR=<carpeta de trabajo con env-e2e.sh, stores/ y wt-main/>}"
store=$1; data_db=$2; port=$3
cd $S/stores/$store
source $S/env-e2e.sh
base="${DATABASE_URL%/*}"
pnpm install --frozen-lockfile > v-install.log 2>&1; echo "install $?"
pnpm typecheck > v-typecheck.log 2>&1; echo "typecheck $?"
pnpm lint > v-lint.log 2>&1; echo "lint $?"
DATABASE_URL="$base/${store}_suite_test" TEST_DATABASE_URL="$base/${store}_suite_test" pnpm test > v-test.log 2>&1; echo "test $?"; grep -E "Test Files|Tests " v-test.log
python3 $S/stores/snapshot.py $data_db pre-migrate.json
DATABASE_URL="$base/$data_db" pnpm db:migrate > v-migrate.log 2>&1; echo "migrate $?"; tail -2 v-migrate.log
python3 $S/stores/snapshot.py $data_db post-migrate.json pre-migrate.json
python3 - <<PY
import json
a=json.load(open("pre-migrate.json"))["tables"]; b=json.load(open("post-migrate.json"))["tables"]
diff=[t for t in a if t not in b or a[t]["md5"]!=b[t]["md5"] or a[t]["rows"]!=b[t]["rows"]]
print("datos idénticos tras migrar" if not diff else f"CAMBIARON: {diff}", f"({len(a)} tablas, {sum(v['rows'] for v in a.values())} filas)")
PY
DATABASE_URL="$base/$data_db" pnpm db:check > v-dbcheck.log 2>&1; echo "db:check $?"; grep -i "migraciones" v-dbcheck.log | head -2
DATABASE_URL="$base/$data_db" pnpm preflight > v-preflight.log 2>&1; echo "preflight $?"; grep -iE "medio|pago|transfer|contra|tarjeta" v-preflight.log | head -6
pnpm build > v-build.log 2>&1; echo "build $?"
export DATABASE_URL="$base/${store}_e2e_test" TEST_DATABASE_URL="$base/${store}_e2e_test" E2E_PORT=$port
docker exec ecom-mysql8 mysql -uroot -proot -e "DROP DATABASE IF EXISTS ${store}_e2e_test; CREATE DATABASE ${store}_e2e_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" 2>/dev/null
pnpm db:migrate > v-e2e-migrate.log 2>&1 && pnpm exec tsx scripts/prepare-browser-tests.ts > v-e2e-prepare.log 2>&1; echo "e2e-prepare $?"
timeout 1800 pnpm exec playwright test > v-e2e.log 2>&1; echo "e2e $?"; grep -E "✘|passed|failed|flaky" v-e2e.log | tail -6
