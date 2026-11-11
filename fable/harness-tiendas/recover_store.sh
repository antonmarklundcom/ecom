#!/bin/bash
# Fase 2b: una tienda cuyo sync se frenó en la guardia de migraciones, sacada
# por el caso 1 de NEW-STORE.md § "Migraciones propias de una tienda" (la
# migración propia nunca corrió en una base de verdad).
#   recover_store.sh <tienda> <tag-de-la-migración-propia> <base-con-datos> <puerto> <rol-extra>
#   (con SOLO_SYNC=1 hace los pasos 1–2 y no toca la base: el paso 3 corre
#   Playwright y necesita el MySQL para él solo)
#
# 1. En la rama del sync: borra el .sql propio, su snapshot y su entrada del
#    journal, y commitea (el cambio de `schema.ts` queda).
# 2. Sincroniza otra vez (sync_store.sh) y regenera la migración propia con
#    `pnpm db:generate`: renace con el número siguiente y un `when` posterior.
# 3. Recrea la base local desde cero (populate_t0.sh: migrate, fixtures,
#    planilla, rol) y lista las columnas que tienen que existir.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
store=$1; tag=$2; db=$3; port=$4; extra_role=$5
cd "$S/stores/$store"
idx=${tag%%_*}
git rm -q "drizzle/$tag.sql" "drizzle/meta/${idx}_snapshot.json"
"$PY" - drizzle/meta/_journal.json "$tag" <<'PY'
import json, sys
p, tag = sys.argv[1], sys.argv[2]
j = json.load(open(p, encoding="utf-8"))
antes = len(j["entries"])
j["entries"] = [e for e in j["entries"] if e["tag"] != tag]
assert len(j["entries"]) == antes - 1, f"{tag} no está en el journal"
with open(p, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(j, indent=2) + "\n")
PY
git add -A; git commit -qm "Sacar la migración propia $tag antes del sync (NEW-STORE.md, caso 1)" && echo "migración propia sacada: $tag"
bash "$HERE/sync_store.sh" "$store"
pnpm install --frozen-lockfile > r-install.log 2>&1; echo "install $?"
pnpm db:generate > r-generate.log 2>&1; echo "db:generate $?"
nueva=$(git status --short drizzle | awk '/\.sql$/ {print $2}')
echo "migración propia regenerada: ${nueva:-(ninguna)}"
grep -h '"when"\|"tag"' drizzle/meta/_journal.json | tail -6 | tr -s ' '
git add -A; git commit -qm "Migración propia regenerada encima de las del template" && echo "commiteado"
[ -n "${SOLO_SYNC:-}" ] && exit 0
bash "$HERE/populate_t0.sh" "$store" "$db" "$port" "$extra_role"
mysql_cli -N -e "SELECT CONCAT(table_name,'.',column_name) FROM information_schema.columns WHERE table_schema='$db' AND ((table_name='product_images' AND column_name='provenance') OR (table_name='customers' AND column_name='loyalty_note'))"
