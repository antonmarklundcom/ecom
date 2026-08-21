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

/**
 * Encuentra la llave que abre el cuerpo de una función, saltándose los
 * parámetros y el tipo de retorno.
 *
 * Tomar la primera `{` que aparece no sirve: en
 * `): Promise<AdminActionResult<{ productId: number }>> {` esa llave es la del
 * tipo genérico, y el cuerpo extraído queda vacío — o sea, una función sin lo
 * que el test busca "pasa" con el cuerpo de otro. Los tres tests que extraen
 * cuerpos (`admin-guards`, `atribucion`, `flags-apagados`) usan esta única
 * implementación a propósito: la versión ingenua ya dejó pasar tres acciones
 * sin revisar una vez.
 *
 * @param from índice justo después del `(` que abre los parámetros.
 */
export function findBodyStart(code: string, from: number): number {
  let parens = 1;
  let index = from;
  while (index < code.length && parens > 0) {
    if (code[index] === '(') parens += 1;
    else if (code[index] === ')') parens -= 1;
    index += 1;
  }

  // Ya pasamos los parámetros: ahora el tipo de retorno. La `{` del cuerpo es
  // la primera que aparece fuera de todo `<...>`.
  let angles = 0;
  for (; index < code.length; index += 1) {
    const char = code[index];
    if (char === '<') angles += 1;
    else if (char === '>') angles = Math.max(0, angles - 1);
    else if (char === '{' && angles === 0) return index;
  }
  return -1;
}

/**
 * Extrae nombre y cuerpo de cada `export async function` del módulo.
 *
 * Cuenta llaves para encontrar el cierre en vez de usar una regex sobre todo
 * el archivo: si no, una función sin guard "pasa" porque la de al lado sí lo
 * tiene.
 */
export function exportedAsyncFunctions(code: string): Array<{ name: string; body: string }> {
  const functions: Array<{ name: string; body: string }> = [];
  const signature = /export\s+async\s+function\s+(\w+)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = signature.exec(code)) !== null) {
    const name = match[1];
    if (!name) continue;

    const bodyStart = findBodyStart(code, signature.lastIndex);
    if (bodyStart === -1) continue;

    let depth = 0;
    let end = bodyStart;
    for (let i = bodyStart; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    functions.push({ name, body: code.slice(bodyStart, end + 1) });
  }
  return functions;
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
