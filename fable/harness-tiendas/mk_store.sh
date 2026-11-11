#!/bin/bash
# Crea una tienda como "Use this template": árbol de T0, historia nueva.
#   mk_store.sh <tienda> <flags de pnpm nueva-tienda…>
set -euo pipefail
source "$(dirname "$0")/lib.sh"
T0="${T0:-45f4336}"
name=$1; shift
dir=$S/stores/$name
rm -rf "$dir"; mkdir -p "$dir"
git -C "$S/stores/tpl.git" archive "$T0" | tar -x -C "$dir"
cd "$dir"
git init -q -b main
git config user.name "Tienda $name"; git config user.email "$name@example.test"
git config core.autocrlf false
excluir_logs
git add -A
# En Windows (core.filemode=false) git no ve el bit de ejecución: sin esto el
# árbol del primer commit no es el del template y el wizard no encuentra el baseline.
git -C "$S/stores/tpl.git" ls-tree -r "$T0" | awk '$1 == "100755" {print $4}' | while read -r f; do git update-index --chmod=+x "$f"; done
git commit -qm "Initial commit"
[ "$(git rev-parse HEAD^{tree})" = "$(git -C "$S/stores/tpl.git" rev-parse "$T0^{tree}")" ] && echo "árbol = $T0" || echo "ÁRBOL DISTINTO de $T0"
git remote add template "$S/stores/tpl.git"
pnpm install --frozen-lockfile > install.log 2>&1 && echo "install ok"
pnpm nueva-tienda "$@" > wizard.log 2>&1 && echo "wizard ok" || { echo "wizard FAILED"; tail -20 wizard.log; }
git add -A; git commit -qm "nueva-tienda" && echo "wizard commiteado"
# En Windows el wizard llama `pnpm` sin shell y no lo encuentra (pnpm.cmd):
# el paso que él mismo sugiere, a mano.
if [ ! -f .template-baseline ]; then
  pnpm template:diff --marcar --origen > marcar.log 2>&1
  git add .template-baseline && git commit -qm "Baseline del template" && echo "baseline marcado a mano"
fi
grep -v '^#' .template-baseline 2>/dev/null || echo "(sin baseline)"
