#!/bin/bash
# Fase 5: un clon limpio arma y arranca como en Hostinger (DEPLOY.md §1: pnpm,
# `pnpm run build`, salida `.next`, `next start`, no standalone) con sólo las
# cinco variables de `.env.example`, y `GET /api/health` reporta cada check
# después de `POST /api/setup/init` (handoff §3 ítem 5).
#   clean_clone.sh <repo-o-ruta> <ref> <base> <puerto>
#
# Arranca `next start` en segundo plano y lo para por su PID (el árbol de ese
# PID y nada más).
set -uo pipefail
source "$(dirname "$0")/lib.sh"
origen=$1; ref=$2; db=$3; port=$4
dir="$S/clean-clone"
source "$S/env-e2e.sh"
base="${DATABASE_URL%/*}"
rm -rf "$dir"
git clone -q --no-hardlinks --branch "$ref" "$origen" "$dir" 2>/dev/null || { git clone -q --no-hardlinks "$origen" "$dir" && git -C "$dir" checkout -q "$ref"; }
cd "$dir"
echo "clon $(git rev-parse --short HEAD) · node $(node -v) · pnpm $(pnpm -v) (.nvmrc $(cat .nvmrc))"
[ -f .env.local ] || [ -f .env ] && echo "AVISO: el clon trae .env" || true
recrear_db "$db"
# Sólo las cinco, con el resto del entorno de esta máquina vacío.
cinco=(env -i "PATH=$PATH" "SYSTEMROOT=${SYSTEMROOT:-}" "TEMP=${TEMP:-}" "TMP=${TMP:-}" "USERPROFILE=${USERPROFILE:-}" "APPDATA=${APPDATA:-}" "LOCALAPPDATA=${LOCALAPPDATA:-}" "HOME=${HOME:-}"
  "DATABASE_URL=$base/$db" "SESSION_SECRET=$SESSION_SECRET" "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:$port"
  "CRON_SECRET=$CRON_SECRET" "SETUP_SECRET=$SETUP_SECRET" "NODE_ENV=production")
"${cinco[@]}" pnpm install --frozen-lockfile > c-install.log 2>&1; echo "install $?"
"${cinco[@]}" pnpm run build > c-build.log 2>&1; echo "build $?"; grep -E "Compiled|Failed|Error" c-build.log | head -3
"${cinco[@]}" node node_modules/next/dist/bin/next start -p "$port" > c-start.log 2>&1 &
pid=$!; winpid=$(cat /proc/$pid/winpid 2>/dev/null || echo "")
for _ in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$port/api/health" 2>/dev/null && break; sleep 2; done
echo "start: $(head -c 300 c-start.log | tr '\n' ' ' | cut -c1-160)"
echo "health antes del setup: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health")"
curl -s -X POST "http://127.0.0.1:$port/api/setup/init" -H "Authorization: Bearer $SETUP_SECRET" -H "content-type: application/json" -d '{}' > c-setup.json; echo "setup: $(head -c 400 c-setup.json)"
echo
curl -s "http://127.0.0.1:$port/api/health" > c-health.json; echo "health: $(cat c-health.json)"
echo
"$PY" - c-health.json <<'PY'
import json, sys
h = json.load(open(sys.argv[1], encoding="utf-8"))
faltan = [k for k in ("db", "catalog", "cron", "migrations", "backup") if k not in h]
print("health reporta db, catalog, cron, migrations y backup" if not faltan else f"FALTAN en /api/health: {faltan}")
PY
if [ -n "$winpid" ]; then taskkill //PID "$winpid" //T //F > /dev/null 2>&1; else kill "$pid"; fi
wait "$pid" 2>/dev/null; echo "servidor parado (pid $pid${winpid:+, win $winpid})"
