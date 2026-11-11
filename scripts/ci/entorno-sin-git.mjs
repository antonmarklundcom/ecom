// El entorno para un `git` hijo que opera sobre OTRO repo (una tienda clonada,
// una carpeta temporal de un test).
//
// Dentro de un hook (el `pre-push` corre `pnpm test:unit`) git exporta
// `GIT_DIR` y compañía apuntando al repo del template. Un `git init` o
// `git clone` en otra carpeta con ese entorno no opera ahí: opera sobre el repo
// del template, y una vez le dejó `core.bare = true` en la config compartida
// (O28, `docs/log/o28.md`), con todos los worktrees sin poder hacer
// `git status`. Todas las `GIT_*` afuera: `GIT_DIR`, `GIT_WORK_TREE`,
// `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_PREFIX`, `GIT_CONFIG_*`,
// `GIT_OBJECT_DIRECTORY`…
//
// Node puro (sin dependencias) para que lo usen los scripts de `scripts/ci/`
// sin instalar nada, los `.ts` de `scripts/` y los tests.

/**
 * Una copia de `base` sin ninguna variable `GIT_*` (sin distinguir mayúsculas).
 * @param {Record<string, string | undefined>} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function envSinGit(base = process.env) {
  return Object.fromEntries(Object.entries(base).filter(([clave]) => !clave.toUpperCase().startsWith('GIT_')));
}

/**
 * Saca las `GIT_*` de `process.env` en el lugar. Lo llama cada CLI de la
 * distribución al arrancar (nunca al importarse), así todo `git` hijo —también
 * los de `gitEn` y `template:sync`, que heredan el entorno— ve un entorno limpio.
 * @param {Record<string, string | undefined>} [env]
 */
export function sacarGitDelEntorno(env = process.env) {
  for (const clave of Object.keys(env)) {
    if (clave.toUpperCase().startsWith('GIT_')) delete env[clave];
  }
}
