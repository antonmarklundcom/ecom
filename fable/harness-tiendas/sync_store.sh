#!/bin/bash
# Fase 2: sincroniza una tienda con el template T1 igual que distribuir.yml y
# compara lo que es de la tienda antes y después.
set -uo pipefail
S="${HARNESS_DIR:?export HARNESS_DIR=<carpeta de trabajo con env-e2e.sh, stores/ y wt-main/>}"
store=$1; shift
cd $S/stores/$store
propios="src/config/tienda.ts src/config/checkout.ts src/components/site-footer.tsx src/components/product-card.tsx src/styles/temas/calido.css src/styles/temas/neutro.css src/app/globals.css .env.local"
for f in $propios; do [ -f "$f" ] && sha256sum "$f"; done > pre-sync.sha
antes=$(git rev-parse HEAD)
$S/wt-main/node_modules/.bin/tsx $S/wt-main/scripts/template-sync.ts --sin-tests --json --rama-destino template/sync "$@" > sync.json 2> sync.err
echo "sync exit $?"
tail -n 1 sync.json | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(json.dumps({k: (v if not isinstance(v, list) or len(v) < 12 else v[:12] + ["…"]) for k, v in d.items()}, ensure_ascii=False, indent=1))' 2>/dev/null || { echo "(sin JSON)"; tail -20 sync.err; }
echo "rama: $(git branch --show-current) · HEAD $(git rev-parse --short HEAD) (antes $(git rev-parse --short $antes))"
echo "sin commitear: $(git status --short | wc -l)"
sha256sum -c pre-sync.sha 2>&1 | sed 's/^/  /'
echo "baseline: $(grep -v '^#' .template-baseline)"
