#!/bin/bash
# O36: Norte desde v2.0.1 de punta a punta — T0 (con su e2e), sync al template
# de tpl.git main, verify. El build de v2.0.1 (Next 16.4.3) frena una vez con
# el aviso de seguridad de Next; se reintenta.
#   norte_o36.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"
cd "$S/stores/norte"
git checkout -q -f main && git branch -D template/sync >/dev/null 2>&1; git clean -qfdx -e .env.local -e node_modules >/dev/null
echo "norte en $(git rev-parse --short HEAD), baseline $(grep -v '^#' .template-baseline)"
pnpm install --frozen-lockfile > t0-install.log 2>&1; echo "install $?"
cd "$S/stores"
bash ../h/populate_t0.sh norte h36_norte_data_test 3101 vendedor
cd "$S/stores/norte"
if grep -q SecurityFatalError t0-build.log; then
  echo "t0 build: aviso de Next 16.4.3 (v2.0.1); reintento"
  source "$S/env-e2e.sh"; export DATABASE_URL="${DATABASE_URL%/*}/h36_norte_data_test" E2E_PORT=3101; export TEST_DATABASE_URL=$DATABASE_URL
  pnpm build > t0-build2.log 2>&1; echo "build $?"
  timeout 1800 pnpm exec playwright test --trace off > t0-e2e2.log 2>&1; echo "e2e $?"; grep -E "passed|failed|flaky" t0-e2e2.log | tail -3
fi
cd "$S/stores"
bash ../h/sync_store.sh norte | grep -vE '^\s+"' 
bash ../h/verify_store.sh norte h36_norte_data_test 3102
