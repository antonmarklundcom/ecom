#!/bin/bash
# Crea una tienda como "Use this template": árbol de T0, historia nueva.
set -euo pipefail
S="${HARNESS_DIR:?export HARNESS_DIR=<carpeta de trabajo con env-e2e.sh, stores/ y wt-main/>}"
name=$1; shift
dir=$S/stores/$name
rm -rf "$dir"; mkdir -p "$dir"
git -C $S/stores/tpl.git archive 45f4336 | tar -x -C "$dir"
cd "$dir"
git init -q -b main
git config user.name "Tienda $name"; git config user.email "$name@example.test"
git add -A; git commit -qm "Initial commit"
git remote add template $S/stores/tpl.git
pnpm install --frozen-lockfile > install.log 2>&1 && echo "install ok"
pnpm nueva-tienda "$@" > wizard.log 2>&1 && echo "wizard ok" || { echo "wizard FAILED"; tail -20 wizard.log; }
cat .template-baseline 2>/dev/null || echo "(sin baseline)"
