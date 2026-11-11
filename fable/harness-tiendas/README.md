# Arnés de tiendas (O23)

Dos tiendas desechables creadas desde el template de antes de la auditoría
(`45f4336`), sincronizadas con el template de hoy y verificadas como las
verificaría su CI más un deploy. Resultados de la última corrida:
`docs/log/o23.md`.

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
| Crear | `bash ../h/mk_store.sh norte --nombre "Norte Hogar" … --tema calido` (flags en `docs/log/o23.md`) | 2 min |
| Retoques propios | `bash ../h/customize.sh norte` / `sur` | 1 min |
| T0 | `bash ../h/populate_t0.sh norte <db> <puerto> vendedor` | 5 min |
| Sync | `bash ../h/sync_store.sh norte` | 1 min |
| Sur, caso 1 | `bash ../h/recover_store.sh sur <tag-propio> <db> <puerto> vendedor` | 8 min |
| Verificar | `bash ../h/verify_store.sh norte <db> <puerto>` | 20 min |
| Backup/restore | `bash ../h/backup_drill.sh norte <db> [set-de-sur]` | 2 min |
| Clon limpio | `bash ../h/clean_clone.sh <repo> <rama> <db> <puerto>` | 5 min |

Playwright (en `populate_t0`, `recover_store` y `verify_store`) necesita el
MySQL para él solo: una tienda por vez. Sin bucket de R2 el `preflight` bloquea
sólo en R2, que es lo esperado.
