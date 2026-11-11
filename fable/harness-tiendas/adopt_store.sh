#!/bin/bash
# O24, fase 2: la tienda adopta la historia de migraciones del template.
# Corre el script del template objetivo parado en la tienda (una tienda de
# f9979ce todavía no lo tiene), como dice NEW-STORE.md.
#   adopt_store.sh <tienda> <base-con-datos>
#
# 1. Ensayo: el informe, y nada escrito (drizzle/ y __drizzle_migrations iguales).
# 2. --aplicar en una rama: huella de los datos idéntica antes y después.
# 3. Otra vez --aplicar: no hace nada.
# 4. drizzle/ commiteado; `pnpm db:check` con el código viejo dice lo que falta.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
store=$1; db=$2
cd "$S/stores/$store"
source "$S/env-e2e.sh"
export DATABASE_URL="${DATABASE_URL%/*}/$db"
adoptar() { "$TEMPLATE_DIR/node_modules/.bin/tsx" "$TEMPLATE_DIR/scripts/template-adoptar-historial.ts" "$@"; }
filas() { mysql_cli -N "$db" -e "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id" | sha256sum | cut -c1-16; }
git fetch -q template main
git checkout -q -B template/adopcion

echo "== 1. ensayo"
antes_archivos=$(git ls-files -s drizzle | sha256sum | cut -c1-16); antes_filas=$(filas)
adoptar > adopcion-ensayo.log 2>&1; echo "ensayo exit $?"
cat adopcion-ensayo.log
echo "drizzle/ igual: $([ "$(git status --porcelain drizzle | wc -l)" = 0 ] && echo sí || echo NO) · filas iguales: $([ "$(filas)" = "$antes_filas" ] && echo sí || echo NO)"

echo "== 2. --aplicar"
"$PY" "$HERE/snapshot.py" "$db" pre-adopcion.json
adoptar --aplicar > adopcion-aplicar.log 2>&1; echo "aplicar exit $?"
tail -6 adopcion-aplicar.log
"$PY" "$HERE/snapshot.py" "$db" post-adopcion.json pre-adopcion.json
"$PY" "$HERE/snapshot.py" --comparar pre-adopcion.json post-adopcion.json
echo "drizzle/: $(git status --porcelain drizzle | wc -l) archivo(s) cambiados · filas: $(mysql_cli -N "$db" -e 'SELECT COUNT(*) FROM __drizzle_migrations')"
ls drizzle/*.sql | tail -2
git add drizzle; git commit -qm "Adoptar la historia de migraciones del template (template:adoptar-historial)" && echo "commiteado $(git rev-parse --short HEAD)"

echo "== 3. otra vez"
despues_filas=$(filas)
adoptar --aplicar > adopcion-repetir.log 2>&1; echo "repetir exit $?"; grep -E "✓|✗" adopcion-repetir.log | head -2
echo "sin cambios: $([ "$(git status --porcelain drizzle | wc -l)" = 0 ] && [ "$(filas)" = "$despues_filas" ] && echo sí || echo NO)"
