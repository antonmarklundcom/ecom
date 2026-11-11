#!/usr/bin/env python3
"""Huella de los datos de una base: filas y MD5 por tabla sobre un juego fijo de
columnas. `snapshot.py <db> <out.json>` guarda las columnas actuales;
`snapshot.py <db> <out.json> <columnas-de.json>` usa las columnas de una huella
anterior (las agregadas por una migración no cuentan) para compararlas.
`snapshot.py --comparar <a.json> <b.json>` dice si dos huellas son idénticas
(sale con 1 si no). Una tabla que sólo está en <b> y no tiene filas (la
trajo una migración) no cuenta como cambio: se lista aparte.

El cliente sale de `HARNESS_MYSQL` (p. ej. `mysql.exe -h127.0.0.1 -P3317
-uroot -proot`); sin la variable, `docker exec ecom-mysql8 mysql`."""
import json, os, shlex, subprocess, sys

def cliente():
    propio = os.environ.get("HARNESS_MYSQL")
    return shlex.split(propio, posix=True) if propio else ["docker", "exec", "ecom-mysql8", "mysql", "-uroot", "-proot"]

def q(db, sql):
    out = subprocess.run([*cliente(), "-N", "-B", db, "-e", sql], capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise SystemExit(out.stderr)
    return [line.split("\t") for line in out.stdout.strip("\n").split("\n") if line]

def comparar(a_path, b_path):
    a = json.load(open(a_path, encoding="utf-8"))["tables"]
    b = json.load(open(b_path, encoding="utf-8"))["tables"]
    # Una tabla que trajo una migración y está vacía no es un dato que cambió.
    nuevas = sorted(t for t in set(b) - set(a) if b[t]["rows"] == 0)
    diff = sorted(t for t in (set(a) | set(b)) - set(nuevas) if t not in a or t not in b or a[t]["md5"] != b[t]["md5"] or a[t]["rows"] != b[t]["rows"])
    filas = sum(v["rows"] for v in a.values())
    extra = f"; tablas nuevas vacías: {nuevas}" if nuevas else ""
    print("huellas idénticas" if not diff else f"CAMBIARON: {diff}", f"({len(a)} tablas, {filas} filas{extra})")
    return 0 if not diff else 1

if len(sys.argv) > 1 and sys.argv[1] == "--comparar":
    raise SystemExit(comparar(sys.argv[2], sys.argv[3]))

db, dest = sys.argv[1], sys.argv[2]
prev = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else None
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
json.dump({"db": db, "tables": result}, open(dest, "w", encoding="utf-8"), indent=1)
print(f"{db}: {len(result)} tablas, {sum(v['rows'] for v in result.values())} filas")
