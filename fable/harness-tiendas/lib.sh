# Lo que comparten los scripts del arnés. Se carga con `source`.
#
#   HARNESS_DIR    carpeta de trabajo: env-e2e.sh, stores/ (con tpl.git) y wt-main/
#   TEMPLATE_DIR   checkout del template objetivo con node_modules (default $HARNESS_DIR/wt-main)
#   HARNESS_MYSQL  cliente mysql con host, puerto y usuario, sin base
#                  (default: `docker exec -i ecom-mysql8 mysql -uroot -proot`)
#   HARNESS_PYTHON intérprete de Python (default python3)
#   DB_PREFIX      prefijo de cada base que crean los scripts (default vacío)
S="${HARNESS_DIR:?export HARNESS_DIR=<carpeta de trabajo con env-e2e.sh, stores/ y wt-main/>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${HARNESS_PYTHON:-python3}"
TEMPLATE_DIR="${TEMPLATE_DIR:-$S/wt-main}"
DB_PREFIX="${DB_PREFIX:-}"

mysql_cli() {
  if [ -n "${HARNESS_MYSQL:-}" ]; then
    # shellcheck disable=SC2086
    $HARNESS_MYSQL "$@" 2> >(grep -v "Using a password" >&2)
  else
    docker exec -i ecom-mysql8 mysql -uroot -proot "$@" 2>/dev/null
  fi
}

recrear_db() {
  mysql_cli -e "DROP DATABASE IF EXISTS \`$1\`; CREATE DATABASE \`$1\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
}

# Logs y archivos del arnés dentro de la tienda: fuera de git, porque
# template:sync se niega a correr con el árbol sucio.
excluir_logs() {
  printf '%s\n' '*.log' 'sync.json' 'sync.err' 'pre-sync.sha' '*-migrate.json' \
    'crear-rol.mts' 'backups-drill/' >> .git/info/exclude
}
