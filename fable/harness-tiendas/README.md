# Arnés de tiendas (O23, O24)

Dos tiendas desechables creadas desde el template de antes de la auditoría
(`45f4336`), sincronizadas con el template de hoy y verificadas como las
verificaría su CI más un deploy. Resultados de la última corrida:
`docs/log/o23.md`. O24 suma la tienda "Oeste" (desde `f9979ce`, con la forma
de mascota) para `template:adoptar-historial`: `docs/log/o24.md`.

## Preparar (una vez, ~2 min)

```bash
H=C:/dev/ecom-wt/<carpeta>                       # fuera del repo; nunca en E:
mkdir -p $H/stores
git clone --bare <checkout-del-template> $H/stores/tpl.git
git -C <checkout> push -f $H/stores/tpl.git HEAD:refs/heads/main   # el template objetivo
```

- `$H/harness.env`: `HARNESS_DIR=$H`, `TEMPLATE_DIR=<checkout con node_modules>`,
  `HARNESS_MYSQL="<mysql.exe> -h127.0.0.1 -P3317 -uroot -proot"`,
  `HARNESS_PYTHON=python`, `DB_PREFIX=<prefijo>_` (con `test` adentro).
- `$H/env-e2e.sh` desde `env-e2e.example.sh`, con secretos generados una vez.
- Copiá estos scripts a `$H/h/` y corré la copia: bash lee un script mientras
  lo ejecuta, y editar el del repo a mitad de una corrida la rompe.

## Correr (desde `$H/stores`, con `source ../harness.env`)

| Paso | Comando | Dura |
|---|---|---|
| Crear | `bash ../h/mk_store.sh <tienda> <flags>` (abajo) | 2 min |
| Retoques propios | `bash ../h/customize.sh norte` / `sur` | 1 min |
| T0 | `bash ../h/populate_t0.sh norte <db> <puerto> vendedor` | 5 min |
| Sync | `bash ../h/sync_store.sh norte` | 1 min |
| Sur, caso 1 | `bash ../h/recover_store.sh sur <tag-propio> <db> <puerto> vendedor` | 8 min |
| Verificar | `bash ../h/verify_store.sh norte <db> <puerto>` | 20 min |
| Backup/restore | `bash ../h/backup_drill.sh norte <db> [set-de-sur]` | 2 min |
| Oeste (O24) | `T0=f9979ce bash ../h/mk_store.sh oeste <flags>`, `customize.sh oeste` | 4 min |
| Oeste, base | `bash ../h/populate_oeste.sh <db>` (con `HARNESS_MYSQLDUMP`) | 2 min |
| Oeste, adoptar | `bash ../h/adopt_store.sh oeste <db>` | 2 min |
| Oeste, sync | `bash ../h/sync_oeste.sh`, después `verify_store.sh oeste <db> <puerto>` | 25 min |
| Clon limpio | `bash ../h/clean_clone.sh <repo> <rama> <db> <puerto>` | 5 min |

Flags de `pnpm nueva-tienda` (la tienda 45f4336 no tiene `--tema vitrina`):

```bash
norte: --nombre "Norte Hogar" --titulo "Norte Hogar — Cocina y casa" --descripcion "Tienda de prueba del arnés" --tagline "Todo para tu cocina" --whatsapp 0981000001 --dominio norte.example.test --tema calido
oeste: --nombre "Oeste Campo" --titulo "Oeste Campo — Herramientas y ferretería" --descripcion "Tienda de prueba del arnés" --tagline "Todo para el campo" --whatsapp 0981000003 --dominio oeste.example.test
sur:   --nombre "Sur Deportes" --titulo "Sur Deportes — Ropa y equipo" --descripcion "Tienda de prueba del arnés" --tagline "Equipate para correr" --whatsapp 0981000002 --dominio sur.example.test --tema neutro
```

Sur, caso 1: `recover_store.sh sur 0024_<su-tag> …` (el tag sale del `ls drizzle` después de `customize.sh sur`).

Playwright (en `populate_t0`, `recover_store` y `verify_store`) necesita el
MySQL para él solo: una tienda por vez. Sin bucket de R2 el `preflight` bloquea
sólo en R2, que es lo esperado.
