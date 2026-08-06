import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Lee un archivo sin sus comentarios.
 *
 * Los tests que grepean el código buscan lo que el código **hace**; un
 * comentario que documenta la regla ("nunca COUNT(*)") no puede hacerlos
 * fallar, y borrar el comentario para que pasen sería el peor incentivo.
 */
export async function readCode(relativePath: string): Promise<string> {
  const content = await readFile(path.join(process.cwd(), relativePath), 'utf8');
  return stripComments(content);
}

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export async function listSourceFiles(roots: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) {
    for await (const file of walk(path.join(process.cwd(), root))) {
      files.push(path.relative(process.cwd(), file));
    }
  }
  return files.sort();
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}
