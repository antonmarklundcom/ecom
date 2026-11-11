#!/bin/bash
# O24, fase 3: Oeste, ya adoptada, sincroniza con el template.
# La guardia de migraciones tiene que pasar. `src/db/schema.ts` choca (Oeste
# portó una versión vieja del schema a mano): se resuelve como lo haría una
# persona, el del template más la columna propia, y `pnpm db:generate` tiene
# que quedar sin drift contra la migración propia que escribió la adopción.
#   sync_oeste.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"
cd "$S/stores/oeste"
bash "$HERE/sync_store.sh" oeste
estado=$(tail -n 1 sync.json | "$PY" -c 'import json,sys; print(json.loads(sys.stdin.read()).get("estado"))' 2>/dev/null)
echo "estado del sync: $estado"
conflictos=$(git diff --name-only --diff-filter=U; grep -rl '^<<<<<<< ' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' --include='*.md' . 2>/dev/null | grep -v node_modules | sed 's|^\./||')
conflictos=$(printf '%s\n' $conflictos | sort -u)
echo "con marcadores: ${conflictos:-(ninguno)}"
for f in $conflictos; do
  if [ "$f" != src/db/schema.ts ]; then echo "CONFLICTO QUE NO ES EL SCHEMA: $f"; exit 1; fi
done
if [ -n "$conflictos" ]; then
  git show template/main:src/db/schema.ts > src/db/schema.ts
  agregar_pais_origen src/db/schema.ts
  git add -A; git commit -qm "Sync: schema.ts del template con la columna propia de Oeste" && echo "schema resuelto y commiteado"
fi
echo "baseline: $(grep -v '^#' .template-baseline) · template/main $(git rev-parse template/main)"
pnpm install --frozen-lockfile > s-install.log 2>&1; echo "install $?"
pnpm db:generate > s-generate.log 2>&1; echo "db:generate $?"; tail -2 s-generate.log
echo "drift: $(git status --porcelain drizzle | wc -l) archivo(s) nuevos en drizzle/ (tiene que ser 0)"
