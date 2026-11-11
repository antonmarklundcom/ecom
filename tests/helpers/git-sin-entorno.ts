/**
 * El entorno para un `git` hijo que opera sobre un repo TEMPORAL de un test.
 *
 * Dentro de un hook (el `pre-push` corre `pnpm test:unit`) git exporta
 * `GIT_DIR` y compañía apuntando al repo del template. Un `git init` en una
 * carpeta temporal con ese entorno no crea nada ahí: reinicializa el repo del
 * template, y una vez le dejó `core.bare = true` en la config compartida (O28,
 * `docs/log/o28.md`), con todos los worktrees sin poder hacer `git status`.
 * Todas las `GIT_*` afuera. La función vive en `scripts/ci/entorno-sin-git.mjs`
 * porque los scripts de la distribución usan la misma.
 */
import { envSinGit as envSinGitMjs } from '../../scripts/ci/entorno-sin-git.mjs';

export function envSinGit(base: Record<string, string | undefined> = process.env): NodeJS.ProcessEnv {
  return envSinGitMjs(base) as NodeJS.ProcessEnv;
}
