#!/usr/bin/env python3
"""Huella de los datos de una base: filas y MD5 por tabla sobre un juego fijo de
columnas. `snapshot.py <db> <out.json>` guarda las columnas actuales;
`snapshot.py <db> <out.json> <columnas-de.json>` usa las columnas de una huella
anterior (las agregadas por una migración no cuentan) para compararlas."""
import json, subprocess, sys

def q(db, sql):
    out = subprocess.run(["docker", "exec", "ecom-mysql8", "mysql", "-N", "-B", "-uroot", "-proot", db, "-e", sql],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr)
    return [line.split("\t") for line in out.stdout.strip("\n").split("\n") if line]

db, dest = sys.argv[1], sys.argv[2]
prev = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None
tables = [r[0] for r in q(db, "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name")]
result = {}
for t in tables:
    if t == "__drizzle_migrations":
        continue
    cols = prev["tables"][t]["columns"] if prev and t in prev["tables"] else \
        [r[0] for r in q(db, f"SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '{t}' ORDER BY ordinal_position")]
    expr = ",".join(f"IFNULL(CAST(`{c}` AS CHAR),'<null>')" for c in cols)
    pk = q(db, f"SELECT column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name='{t}' AND constraint_name='PRIMARY' ORDER BY ordinal_position")
    order = ",".join(f"`{r[0]}`" for r in pk) or ",".join(f"`{c}`" for c in cols)
    rows = q(db, f"SET SESSION group_concat_max_len = 1073741824; SELECT COUNT(*), MD5(GROUP_CONCAT(CONCAT_WS('|',{expr}) ORDER BY {order} SEPARATOR '\\n')) FROM `{t}`")
    count, digest = rows[-1]
    result[t] = {"rows": int(count), "md5": digest, "columns": cols}
json.dump({"db": db, "tables": result}, open(dest, "w"), indent=1)
print(f"{db}: {len(result)} tablas, {sum(v['rows'] for v in result.values())} filas")
