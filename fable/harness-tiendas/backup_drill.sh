#!/bin/bash
# Fase 4: simulacro de backup → restore sobre la base con datos de una tienda
# ya sincronizada (handoff §3 ítem 3).
#   backup_drill.sh <tienda> <base-con-datos> [set-de-otra-tienda]
#
# 1. El set de la app (formato 3, lo que sube el cron a R2), escrito en
#    `backups-drill/` en vez de R2, y `pnpm restore -- <set>` en una base nueva
#    y vacía: la huella de snapshot.py tiene que ser idéntica.
# 2. `pnpm backup` (mysqldump) cargado con `mysql` en otra base nueva: idéntica.
# 3. `pnpm restore` se niega: con un set cuya migración no es de este journal
#    (el de otra tienda con migración propia, si se pasa; si no, este mismo set
#    con la migración del manifiesto cambiada) y contra una base que no está vacía.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
store=$1; data_db=$2; ajeno=${3:-}
cd "$S/stores/$store"
source "$S/env-e2e.sh"
base="${DATABASE_URL%/*}"
r_set="${DB_PREFIX}${store}_restore_set"; r_dump="${DB_PREFIX}${store}_restore_dump"; r_no="${DB_PREFIX}${store}_restore_ajeno"
rm -rf backups-drill; mkdir -p backups-drill
cat > backups-drill/dump-set.mts <<'TS'
import "../src/lib/load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backupSetId, dumpSet } from "../src/domain/backup";
import { closePool } from "../src/db";
const dir = path.join("backups-drill", backupSetId());
mkdirSync(dir, { recursive: true });
const { manifest, bytes } = await dumpSet(async (nombre, contenido) => {
  writeFileSync(path.join(dir, nombre), contenido);
});
await closePool();
console.log(`${dir} ${manifest.objects.length} tablas ${manifest.rows} filas ${bytes} bytes ${manifest.migration.tag}`);
TS
"$PY" "$HERE/snapshot.py" "$data_db" backups-drill/pre.json
DATABASE_URL="$base/$data_db" pnpm exec tsx backups-drill/dump-set.mts > backups-drill/dump.log 2>&1; echo "set $?"; tail -1 backups-drill/dump.log
set_dir=$(tail -1 backups-drill/dump.log | cut -d' ' -f1)

echo "== 1. set de la app → pnpm restore"
recrear_db "$r_set"
DATABASE_URL="$base/$r_set" pnpm restore -- "$set_dir" > backups-drill/restore-set.log 2>&1; echo "restore $?"; grep -E "✓|Credenciales|Error" backups-drill/restore-set.log | head -3
"$PY" "$HERE/snapshot.py" "$r_set" backups-drill/post-set.json backups-drill/pre.json
"$PY" "$HERE/snapshot.py" --comparar backups-drill/pre.json backups-drill/post-set.json

echo "== 2. pnpm backup (mysqldump) → mysql"
DATABASE_URL="$base/$data_db" pnpm backup --salida backups-drill > backups-drill/backup.log 2>&1; echo "backup $?"; tail -1 backups-drill/backup.log
dump=$(ls backups-drill/*.sql.gz 2>/dev/null | tail -1)
recrear_db "$r_dump"
gunzip -c "$dump" | mysql_cli "$r_dump"; echo "carga $?"
"$PY" "$HERE/snapshot.py" "$r_dump" backups-drill/post-dump.json backups-drill/pre.json
"$PY" "$HERE/snapshot.py" --comparar backups-drill/pre.json backups-drill/post-dump.json

echo "== 3. se niega"
if [ -n "$ajeno" ]; then
  otro="$ajeno"
else
  otro=backups-drill/alterado; cp -r "$set_dir" "$otro"
  "$PY" - "$otro/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]; m = json.load(open(p, encoding="utf-8"))
m["migration"]["hash"] = "0" * 64
json.dump(m, open(p, "w", encoding="utf-8"))
PY
fi
# `pnpm restore` imprime sólo el nombre del error (safeError, para no filtrar
# SQL ni URLs): el motivo lo muestra rechazo.mts, que llama a lo mismo.
cat > backups-drill/rechazo.mts <<'TS'
import "../src/lib/load-env";
import { restaurar } from "../scripts/restore-backup";
import { closePool } from "../src/db";
try {
  await restaurar({ archivo: process.argv[2]!, vaciar: true });
  console.log("RESTAURÓ (no debería)");
} catch (error) {
  console.log(`rechazo: ${(error as Error).message}`);
} finally {
  await closePool();
}
TS
recrear_db "$r_no"
DATABASE_URL="$base/$r_no" pnpm restore -- "$otro" > backups-drill/restore-ajeno.log 2>&1; echo "restore de otra migración: exit $? (esperado ≠ 0)"
DATABASE_URL="$base/$r_no" pnpm exec tsx backups-drill/rechazo.mts "$otro" 2>&1 | tail -1
echo "tablas en la base tras el rechazo: $(mysql_cli -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$r_no'")"
DATABASE_URL="$base/$r_set" pnpm restore -- "$set_dir" > backups-drill/restore-llena.log 2>&1; echo "restore sobre base con datos: exit $? (esperado ≠ 0)"
DATABASE_URL="$base/$r_set" pnpm exec tsx backups-drill/rechazo.mts "$set_dir" 2>&1 | tail -1
"$PY" "$HERE/snapshot.py" "$r_set" backups-drill/post-llena.json backups-drill/pre.json > /dev/null
"$PY" "$HERE/snapshot.py" --comparar backups-drill/post-set.json backups-drill/post-llena.json
