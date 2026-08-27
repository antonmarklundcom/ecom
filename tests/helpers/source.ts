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

/**
 * Saca los comentarios **sin** tocar lo que hay adentro de un string.
 *
 * Escanea de a un carácter en vez de usar dos regex, y no es prolijidad: en
 * `src/proxy.ts` hay una URL de medidores que dice
 * `https://*.google-analytics.com`. Para una regex, ese `/*` abre un comentario
 * — y el primer `*​/` que aparezca más abajo lo cierra, borrando de un saque
 * todas las directivas del CSP que hay en el medio.
 *
 * Lo grave es para qué lado falla. Un test que exige que algo **esté** se cae
 * ruidosamente y alguien lo mira. Pero `expect(csp).not.toContain('unsafe-inline')`
 * pasa feliz cuando el CSP entero desapareció: el test queda en verde
 * justamente porque ya no está mirando nada.
 */
export function stripComments(source: string): string {
  let salida = '';
  let i = 0;
  // El último carácter que no es espacio y que no vino de un comentario. Es
  // lo único que distingue una división de una expresión regular.
  let anterior = '';

  const guardar = (texto: string) => {
    salida += texto;
    const limpio = texto.trimEnd();
    if (limpio !== '') anterior = limpio[limpio.length - 1]!;
  };

  while (i < source.length) {
    const dos = source.slice(i, i + 2);

    if (dos === '//') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (dos === '/*') {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== '*/') i += 1;
      i += 2;
      continue;
    }

    const char = source[i]!;

    // Un string se copia entero, comillas incluidas: adentro no hay comentarios.
    if (char === '"' || char === "'" || char === '`') {
      const cierre = char;
      let texto = char;
      i += 1;
      while (i < source.length && source[i] !== cierre) {
        // Una barra invertida se lleva puesto al carácter que sigue, así que
        // `"\""` no termina el string.
        if (source[i] === '\\') {
          texto += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        texto += source[i];
        i += 1;
      }
      texto += source[i] ?? '';
      i += 1;
      guardar(texto);
      continue;
    }

    /*
      Una expresión regular también se copia entera. Sin esto, el `"` de
      /"([^"]*)"/ abre un string que nunca cierra donde debería, y de ahí en
      adelante el archivo se lee mal: los comentarios que vengan después dejan
      de reconocerse. Pasó de verdad — `scripts/nueva-tienda.ts` tiene ese
      regex, y con él el nombre del template aparecía "en el código" cuando en
      realidad estaba en un comentario.

      Para saber si `/` abre un regex o es una división miramos el carácter
      anterior: después de un identificador, un número, `)` o `]` sólo puede
      ser una división.
    */
    if (char === '/' && !/[\w$)\]]/.test(anterior)) {
      let texto = '/';
      i += 1;
      let enClase = false;
      while (i < source.length) {
        const actual = source[i]!;
        if (actual === '\\') {
          texto += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (actual === '[') enClase = true;
        else if (actual === ']') enClase = false;
        else if (actual === '/' && !enClase) break;
        else if (actual === '\n') break;
        texto += actual;
        i += 1;
      }
      texto += source[i] ?? '';
      i += 1;
      guardar(texto);
      continue;
    }

    guardar(char);
    i += 1;
  }

  return salida;
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
