import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// El nombre del template se escribe en un solo lugar y se lee de ahí
// (`marca-centralizada.test.ts` lo verifica en CI). Los **valores** de los
// campos, en cambio, se leen del archivo como texto y no importando el módulo:
// importarlo daría `nombre` ya resuelto, y este script necesita distinguir
// "sigue siendo la constante del template" de "la tienda se llama así".
import { MARCA_PLACEHOLDER } from '../src/config/tienda';

/**
 * `pnpm nueva-tienda` — de "Use this template" a una tienda que corre.
 *
 * El template ya tenía todo automatizado salvo la parte más aburrida y más
 * fácil de arruinar: abrir `tienda.ts` y cambiar seis campos a mano, generar
 * tres secretos con `openssl` (que en Windows no está), copiar `.env.example`,
 * y después acordarse de `template:diff --marcar`. Cuatro archivos y ninguna
 * regla que verifique que quedaron coherentes. Esto lo pregunta una vez y lo
 * escribe.
 *
 * **Idempotente a propósito.** Correrlo dos veces no rompe nada y no regenera
 * ningún secreto que ya exista: `SESSION_SECRET` nuevo = todas las sesiones
 * del panel cerradas, y `CRON_SECRET` nuevo = el cron de Hostinger llamando
 * con la llave vieja hasta que alguien mire. Los valores de hoy se ofrecen
 * como default de cada pregunta, así que la segunda corrida es "Enter, Enter,
 * Enter" salvo lo que quieras cambiar.
 *
 * Con `--dry-run` no escribe nada: imprime lo que haría. Útil para ver el
 * bloque del hPanel sin tocar el repo.
 *
 * Las seis respuestas también se pueden pasar por bandera
 * (`--nombre`, `--titulo`, `--descripcion`, `--tagline`, `--whatsapp`,
 * `--dominio`). Sin terminal interactiva —un pipe, un script, CI— las
 * banderas son el único camino y el script **falla diciéndolo** en vez de
 * salir en silencio: `readline` sobre un stdin cerrado deja la pregunta
 * colgada y Node se va con código 0, que es la peor forma de no hacer nada.
 *
 * Lo que este script **no** hace, a propósito: no toca la base (eso es
 * `db:push` / `db:seed`), no sube nada a ningún lado, y no inventa los datos
 * de terceros (Hostinger, dominio, Pagopar, banco, fotos). Ver NEW-STORE.md.
 */

// ---------------------------------------------------------------------------
// Lo puro: todo lo que se puede probar sin una terminal ni un filesystem
// ---------------------------------------------------------------------------

export type DatosTienda = {
  nombre: string;
  titulo: string;
  descripcion: string;
  tagline: string;
  whatsapp: string;
  dominio: string;
};

/**
 * El título que se propone cuando el que hay sigue siendo el del template.
 *
 * Es el único de los cuatro campos que lleva la marca adentro
 * (`titulo` arranca como `"<MARCA> — Comprá online en Paraguay"`), así que es
 * el único donde
 * apretar Enter sin mirar deja el nombre del template en el `<title>` de
 * todas las pantallas y en cada link compartido por WhatsApp. Los otros tres
 * son texto genérico y no mienten sobre quién es la tienda.
 */
export function sugerirTitulo(actual: string, nombre: string): string {
  if (nombre.trim() === '') return actual;
  if (actual.trim() === '' || actual.includes(MARCA_PLACEHOLDER)) {
    return `${nombre} — Comprá online en Paraguay`;
  }
  return actual;
}

/** Los campos de `TIENDA` que el wizard escribe. El resto no se toca. */
const CAMPOS_TIENDA = ['nombre', 'titulo', 'descripcion', 'tagline'] as const;
type CampoTienda = (typeof CAMPOS_TIENDA)[number];

/**
 * El valor actual de un campo de `TIENDA` en `src/config/tienda.ts`.
 *
 * Se lee del archivo y no se importa el módulo: importarlo traería el resto
 * del grafo (i18n, dominio) para leer cuatro strings, y sobre todo daría el
 * valor **ya resuelto** — `nombre: MARCA_PLACEHOLDER` volvería como
 * `"TiendaPY"` y el script no podría distinguir "todavía es el template" de
 * "esta tienda se llama TiendaPY".
 */
export function leerCampoTienda(source: string, campo: CampoTienda): string | null {
  const literal = literalTienda(source);
  if (literal === null) return null;

  // El valor puede venir en una línea o partido en varias (prettier corta las
  // descripciones largas), y puede ser una constante en vez de un string.
  const match = new RegExp(`\\n\\s*${campo}:\\s*([\\s\\S]*?),\\n`).exec(literal);
  const crudo = match?.[1]?.trim();
  if (crudo === undefined) return null;
  if (!crudo.startsWith('"') && !crudo.startsWith("'")) return null;

  // Un string partido en varias líneas son varios literales pegados.
  const partes = [...crudo.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map(
    (parte) => parte[1] ?? parte[2] ?? '',
  );
  return partes.join('').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/** El cuerpo de `export const TIENDA: Tienda = { … }`, o `null`. */
function literalTienda(source: string): string | null {
  const inicio = source.indexOf('export const TIENDA: Tienda = {');
  if (inicio === -1) return null;
  const abre = source.indexOf('{', inicio);

  let nivel = 0;
  for (let i = abre; i < source.length; i += 1) {
    if (source[i] === '{') nivel += 1;
    else if (source[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return source.slice(abre, i + 1);
    }
  }
  return null;
}

/** Escapa un valor para meterlo entre comillas dobles en el .ts. */
function comillas(valor: string): string {
  return `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Reescribe los cuatro campos de marca de `src/config/tienda.ts`.
 *
 * Reemplazo quirúrgico sobre el archivo existente y **no** un archivo
 * regenerado desde una plantilla: `tienda.ts` tiene ~120 líneas de comentarios
 * que explican por qué cada flag existe, y una tienda nueva los necesita más
 * que nadie. Regenerarlo sería cambiar seis strings a cambio de perder toda la
 * documentación.
 *
 * `nombre` es el caso especial: en el template dice `MARCA_PLACEHOLDER`, que
 * es una constante y no un string, y `marca-centralizada.test.ts` sólo le
 * permite a este archivo escribir el nombre a mano.
 */
export function reescribirTienda(source: string, datos: DatosTienda): string {
  const literal = literalTienda(source);
  if (literal === null) {
    throw new Error(
      'No encontré `export const TIENDA: Tienda = {` en src/config/tienda.ts. ' +
        '¿Lo reescribiste a mano? Editalo vos y salteá este paso.',
    );
  }

  const valores: Record<CampoTienda, string> = {
    nombre: datos.nombre,
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    tagline: datos.tagline,
  };

  let nuevo = literal;
  for (const campo of CAMPOS_TIENDA) {
    // La sangría se conserva y el valor sale **en una línea**: el original
    // puede tener la descripción partida por prettier, y dejar el `campo:`
    // solo arriba de un string corto sería un archivo que el próximo
    // `prettier --write` vuelve a tocar. Una línea larga tampoco es el
    // formato final —una descripción de 150 caracteres pasa el printWidth—,
    // así que después de escribir se corre prettier sobre el archivo
    // (`formatearTienda`): sin eso, el primer commit de la tienda nueva
    // arranca con lint-staged reformateando un archivo que nadie tocó.
    const regex = new RegExp(`(\\n)([ \\t]*)${campo}:\\s*[\\s\\S]*?,(\\n)`);
    if (!regex.test(nuevo)) {
      throw new Error(`No encontré el campo "${campo}" en TIENDA. Editalo a mano.`);
    }
    nuevo = nuevo.replace(regex, (_todo, nl: string, sangria: string, fin: string) =>
      `${nl}${sangria}${campo}: ${comillas(valores[campo])},${fin}`,
    );
  }

  return source.replace(literal, nuevo);
}

/**
 * Deja `src/config/tienda.ts` como lo dejaría `prettier --write`.
 *
 * El reemplazo de arriba escribe cada campo en una línea, y una descripción
 * de 150 caracteres se pasa del `printWidth`. Sin esta pasada el archivo
 * queda formateado distinto de todo el repo y el primer `git commit` de la
 * tienda nueva lo reformatea solo (husky + lint-staged), que es ruido en el
 * peor momento: el diff inicial deja de ser "cambié la marca".
 *
 * Si prettier no se puede cargar —alguien corre el wizard sin instalar las
 * devDependencies— no es un error: el archivo queda escrito igual y sólo se
 * pierde el formato. Un wizard que se cae después de escribir es peor que uno
 * que deja una línea larga.
 */
async function formatearTienda(archivo: string): Promise<void> {
  try {
    const prettier = await import('prettier');
    const source = readFileSync(archivo, 'utf8');
    const config = await prettier.resolveConfig(archivo);
    const formateado = await prettier.format(source, {
      ...config,
      filepath: archivo,
    });
    if (formateado !== source) writeFileSync(archivo, formateado);
  } catch {
    // Ver el comentario de arriba: formatear es prolijidad, no el trabajo.
  }
}

/**
 * Un secreto nuevo, con `crypto.randomBytes` y no con `openssl` por
 * `execSync`.
 *
 * `openssl rand -base64 32` es lo que dice NEW-STORE.md desde siempre y
 * funciona… en la máquina de quien lo escribió. En Windows no existe salvo que
 * haya Git Bash en el PATH, y un `execSync` que falla dejaría el `.env.local`
 * escrito con un secreto vacío — que es peor que no escribir nada, porque
 * parece hecho. `randomBytes` viene con Node y es el mismo CSPRNG.
 *
 * 32 bytes en base64 son 44 caracteres, arriba de los 32 que exige
 * iron-session y de los 16 del cron.
 */
export function generarSecreto(bytes = 32): string {
  return randomBytes(bytes).toString('base64');
}

/** Las seis respuestas, tal como pueden venir por bandera. */
export type Respuestas = Partial<DatosTienda>;

/**
 * `--nombre "Lencería Guaraní" --dominio lenceria.com.py` → `{ … }`.
 *
 * Sirve para dos cosas distintas: correrlo sin terminal (un script, CI) y
 * repetir exactamente la misma corrida sin volver a tipear seis campos.
 * Una bandera desconocida es un error y no algo que se ignora: `--nombr` mal
 * tipeado tiene que doler ahora y no cuando el header diga "TiendaPY".
 */
export function parseFlags(argv: readonly string[]): Respuestas {
  const conocidas: Record<string, keyof DatosTienda> = {
    '--nombre': 'nombre',
    '--titulo': 'titulo',
    '--descripcion': 'descripcion',
    '--tagline': 'tagline',
    '--whatsapp': 'whatsapp',
    '--dominio': 'dominio',
  };
  const sinValor = new Set(['--dry-run']);

  const salida: Respuestas = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === undefined || sinValor.has(flag)) continue;

    const campo = conocidas[flag];
    if (campo === undefined) throw new Error(`no conozco la opción "${flag}"`);

    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) {
      throw new Error(`${flag} espera un valor`);
    }
    salida[campo] = valor;
    i += 1;
  }
  return salida;
}

export type ValoresEnv = Record<string, string>;

/**
 * ¿Este valor cuenta como "todavía no configurado"?
 *
 * La misma regla que `pnpm preflight` usa para rechazar un secreto
 * (`/changeme|generate/i`), y por el mismo motivo: `.env.example` trae
 * `SESSION_SECRET="changeme-generate-with-openssl-rand-base64-32"`, y un
 * wizard que lo tomara por un valor cargado dejaría la tienda con el secreto
 * del ejemplo — que es público, está en el repo, y firma las cookies del
 * panel.
 */
export function esPlaceholder(valor: string): boolean {
  const limpio = valor.trim();
  return limpio === '' || /changeme|generate/i.test(limpio);
}

/**
 * Mete `valores` en el contenido de un `.env`, **sin pisar lo que ya está**.
 *
 * Ésta es la regla que hace idempotente al script: una clave que ya tiene un
 * valor no vacío se deja como está, y sólo se completan las vacías y se
 * agregan las que faltan. Sin eso, la segunda corrida cambiaría los secretos y
 * cerraría todas las sesiones del panel.
 *
 * Devuelve el contenido nuevo y qué claves cambió, para poder decirlo en
 * pantalla en vez de escribir en silencio.
 */
export function completarEnv(
  contenido: string,
  valores: ValoresEnv,
): { contenido: string; escritas: string[]; conservadas: string[] } {
  const escritas: string[] = [];
  const conservadas: string[] = [];
  let salida = contenido;

  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === '') continue;

    // Sólo líneas activas: una `# CLAVE=` comentada es documentación, no un
    // valor, y pisarla dejaría el comentario convertido en configuración.
    const regex = new RegExp(`^(${clave}=)(.*)$`, 'm');
    const match = regex.exec(salida);

    if (match) {
      const actual = (match[2] ?? '').trim().replace(/^["']|["']$/g, '');
      if (!esPlaceholder(actual)) {
        conservadas.push(clave);
        continue;
      }
      salida = salida.replace(regex, `$1${JSON.stringify(valor)}`);
      escritas.push(clave);
      continue;
    }

    if (!salida.endsWith('\n')) salida += '\n';
    salida += `${clave}=${JSON.stringify(valor)}\n`;
    escritas.push(clave);
  }

  return { contenido: salida, escritas, conservadas };
}

/**
 * Escribe `valores` **pisando** lo que haya.
 *
 * Es la otra mitad de `completarEnv`, y la diferencia importa: un secreto no
 * se pisa nunca (regenerarlo cierra las sesiones del panel y deja al cron
 * llamando con la llave vieja), pero el WhatsApp y el dominio son la respuesta
 * que la persona **acaba de dar**. Conservar el valor viejo ahí sería ignorar
 * en silencio lo que acaba de tipear.
 */
export function fijarEnv(
  contenido: string,
  valores: ValoresEnv,
): { contenido: string; escritas: string[] } {
  const escritas: string[] = [];
  let salida = contenido;

  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === '') continue;

    const regex = new RegExp(`^(${clave}=)(.*)$`, 'm');
    const match = regex.exec(salida);
    const actual = (match?.[2] ?? '').trim().replace(/^["']|["']$/g, '');
    if (actual === valor) continue;

    if (match) salida = salida.replace(regex, `$1${JSON.stringify(valor)}`);
    else {
      if (!salida.endsWith('\n')) salida += '\n';
      salida += `${clave}=${JSON.stringify(valor)}\n`;
    }
    escritas.push(clave);
  }

  return { contenido: salida, escritas };
}

/**
 * El bloque para pegar en el hPanel de Hostinger, una variable por línea.
 *
 * Hostinger las carga de a una, a mano, así que lo que sirve es la lista
 * exacta y en el mismo formato que espera el panel (`CLAVE=valor`, sin
 * comillas: el panel las guardaría como parte del valor). Se imprimen sólo las
 * que este script conoce; el resto —Cloudinary, Pagopar, la base— las trae
 * quien tiene esas cuentas, y el script no las va a inventar.
 */
export function bloqueHPanel(valores: ValoresEnv): string {
  return Object.entries(valores)
    .filter(([, valor]) => valor !== '')
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('\n');
}

/** `tienda.com.py` / `https://tienda.com.py/` → `https://tienda.com.py`. */
export function normalizarDominio(entrada: string): string {
  const limpio = entrada.trim().replace(/\/+$/, '');
  if (limpio === '') return '';
  if (/^https?:\/\//i.test(limpio)) return limpio.replace(/^http:\/\//i, 'https://');
  return `https://${limpio}`;
}

/** `0981123456` / `981123456` → `+595981123456`. Vacío si no se entiende. */
export function normalizarWhatsApp(entrada: string): string {
  const digitos = entrada.trim().replace(/[^\d+]/g, '');
  if (digitos === '') return '';
  if (digitos.startsWith('+595')) return digitos;
  if (digitos.startsWith('595')) return `+${digitos}`;
  if (digitos.startsWith('0')) return `+595${digitos.slice(1)}`;
  return `+595${digitos}`;
}

// ---------------------------------------------------------------------------
// De acá para abajo: preguntas, archivos y git
// ---------------------------------------------------------------------------

const TIENDA_FILE = 'src/config/tienda.ts';
const ENV_FILE = '.env.local';
const ENV_EXAMPLE = '.env.example';

/** Las claves que este script sabe completar. El resto las trae otra persona. */
const CLAVES_GENERADAS = ['SESSION_SECRET', 'CRON_SECRET', 'SETUP_SECRET'] as const;

/**
 * Las seis preguntas, con lo que ya está como sugerencia. Enter deja el
 * default; una bandera pisa el default y se muestra como tal.
 */
async function preguntarTodo(
  inicial: DatosTienda,
  flags: Respuestas,
  dryRun: boolean,
): Promise<DatosTienda> {
  let actuales = inicial;
  console.log('\n  Tienda nueva — seis preguntas y listo.');
  console.log('  Entre paréntesis va lo que hay hoy: Enter lo deja como está.');
  if (dryRun) console.log('  (--dry-run: no se escribe nada)');
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const preguntar = async (etiqueta: string, campo: keyof DatosTienda): Promise<string> => {
      const actual = flags[campo] ?? actuales[campo];
      const sufijo = actual === '' ? '' : ` (${actual})`;
      const respuesta = (await rl.question(`  ${etiqueta}${sufijo}: `)).trim();
      return respuesta === '' ? actual : respuesta;
    };

    const nombre = await preguntar('Nombre del comercio', 'nombre');
    // El título se sugiere a partir del nombre recién dado si el que hay
    // sigue siendo el del template: si no, Enter deja "TiendaPY" en el
    // `<title>` de todas las pantallas.
    actuales = { ...actuales, titulo: sugerirTitulo(actuales.titulo, nombre) };

    return {
      nombre,
      titulo: await preguntar('Título del navegador', 'titulo'),
      descripcion: await preguntar('Meta description (150-160)', 'descripcion'),
      tagline: await preguntar('Tagline del pie', 'tagline'),
      whatsapp: await preguntar('WhatsApp del comercio', 'whatsapp'),
      dominio: await preguntar('Dominio final', 'dominio'),
    };
  } finally {
    rl.close();
  }
}

/**
 * Sin terminal interactiva: mandan las banderas, con lo ya escrito de default.
 *
 * Falla si después de eso el nombre sigue vacío. Podría seguir de largo y
 * dejar la marca del template, pero eso es exactamente el error que
 * `pnpm preflight` bloquea después — mejor decirlo acá, con la bandera que
 * falta escrita en el mensaje.
 */
function sinTerminal(actuales: DatosTienda, flags: Respuestas): DatosTienda {
  const datos: DatosTienda = { ...actuales, ...limpiar(flags) };
  datos.titulo = flags.titulo ?? sugerirTitulo(datos.titulo, datos.nombre);

  if (datos.nombre.trim() === '') {
    throw new Error(
      'No hay terminal interactiva (stdin no es un TTY) y falta el nombre.\n' +
        '  Pasá las respuestas por bandera:\n\n' +
        '    pnpm nueva-tienda --nombre "Lencería Guaraní" \\\n' +
        '      --titulo "Lencería Guaraní — Comprá online en Paraguay" \\\n' +
        '      --descripcion "…" --tagline "…" \\\n' +
        '      --whatsapp 0981123456 --dominio lenceria.com.py',
    );
  }

  return datos;
}

/** Una bandera vacía no pisa lo que ya está escrito. */
function limpiar(flags: Respuestas): Respuestas {
  return Object.fromEntries(
    Object.entries(flags).filter(([, valor]) => (valor ?? '').trim() !== ''),
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!existsSync(TIENDA_FILE)) {
    throw new Error(`No encuentro ${TIENDA_FILE}. ¿Estás parado en la raíz del repo?`);
  }

  const tiendaSource = readFileSync(TIENDA_FILE, 'utf8');
  const envActual = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, 'utf8')
    : existsSync(ENV_EXAMPLE)
      ? readFileSync(ENV_EXAMPLE, 'utf8')
      : '';

  const flags = parseFlags(process.argv.slice(2));

  // Los defaults salen de lo que ya está escrito: en la primera corrida son
  // los del template, y en la segunda son los de esta tienda — que es lo que
  // hace que repetir el wizard sea "Enter, Enter, Enter".
  const actuales: DatosTienda = {
    nombre: leerCampoTienda(tiendaSource, 'nombre') ?? '',
    titulo: leerCampoTienda(tiendaSource, 'titulo') ?? '',
    descripcion: leerCampoTienda(tiendaSource, 'descripcion') ?? '',
    tagline: leerCampoTienda(tiendaSource, 'tagline') ?? '',
    whatsapp: leerValorEnv(envActual, 'WHATSAPP_NUMBER'),
    dominio: leerValorEnv(envActual, 'NEXT_PUBLIC_SITE_URL'),
  };

  const crudos = stdin.isTTY
    ? await preguntarTodo(actuales, flags, dryRun)
    : sinTerminal(actuales, flags);

  const datos: DatosTienda = {
    ...crudos,
    whatsapp: normalizarWhatsApp(crudos.whatsapp),
    dominio: normalizarDominio(crudos.dominio),
  };

  // --- tienda.ts ----------------------------------------------------------
  const tiendaNueva = reescribirTienda(tiendaSource, datos);
  const tiendaCambia = tiendaNueva !== tiendaSource;

  // --- .env.local ---------------------------------------------------------
  const generados: ValoresEnv = {};
  for (const clave of CLAVES_GENERADAS) {
    // Sólo se genera lo que falta: ver `completarEnv`. El valor se calcula
    // igual porque `completarEnv` decide, pero uno ya cargado gana.
    generados[clave] = generarSecreto(clave === 'CRON_SECRET' ? 24 : 32);
  }

  const respuestas: ValoresEnv = {
    WHATSAPP_NUMBER: datos.whatsapp,
    NEXT_PUBLIC_SITE_URL: datos.dominio,
  };

  // Primero lo que la persona acaba de contestar (pisa), después los secretos
  // (sólo si faltan). Ver `fijarEnv` y `completarEnv`.
  const fijado = fijarEnv(envActual, respuestas);
  const env = completarEnv(fijado.contenido, generados);
  const aEscribir: ValoresEnv = { ...generados, ...respuestas };
  const escritas = [...fijado.escritas, ...env.escritas];

  // --- Contarlo antes de hacerlo -----------------------------------------
  console.log('');
  console.log(`  ${TIENDA_FILE}: ${tiendaCambia ? 'marca actualizada' : 'sin cambios'}`);
  console.log(
    `  ${ENV_FILE}: ${escritas.length === 0 ? 'sin cambios' : `escribe ${escritas.join(', ')}`}`,
  );
  if (env.conservadas.length > 0) {
    console.log(`     (se conservan los valores ya cargados de ${env.conservadas.join(', ')})`);
  }

  if (dryRun) {
    console.log('\n  --dry-run: no se escribió nada.\n');
    imprimirHPanel(env.contenido, aEscribir);
    return;
  }

  if (tiendaCambia) {
    writeFileSync(TIENDA_FILE, tiendaNueva);
    await formatearTienda(TIENDA_FILE);
  }
  writeFileSync(ENV_FILE, env.contenido);

  imprimirHPanel(env.contenido, aEscribir);
  marcarBaseline();

  console.log(
    '\n  Falta lo que no depende de este repo (NEW-STORE.md):\n' +
      '    · el favicon (src/app/favicon.ico) — ningún control lo verifica\n' +
      '    · Cloudinary, la base de Hostinger y, si va con tarjeta, Pagopar\n' +
      '    · los datos bancarios, que se cargan desde /admin/banco\n\n' +
      '  Y después, la base:\n\n' +
      '    docker compose up -d && pnpm db:push && pnpm db:seed && pnpm create-owner\n' +
      '    pnpm preflight\n',
  );
}

/** El valor de una clave en un `.env`, o `''`. */
export function leerValorEnv(contenido: string, clave: string): string {
  const match = new RegExp(`^${clave}=(.*)$`, 'm').exec(contenido);
  const crudo = (match?.[1] ?? '').trim();
  const limpio = crudo.replace(/^["']|["']$/g, '');
  return esPlaceholder(limpio) ? '' : limpio;
}

/**
 * El bloque del hPanel se arma con lo que quedó **en el archivo**, no con lo
 * que este script generó: si `SESSION_SECRET` ya estaba, lo que hay que pegar
 * en Hostinger es ése y no uno nuevo que nadie va a usar.
 */
function imprimirHPanel(contenidoEnv: string, claves: ValoresEnv): void {
  const finales: ValoresEnv = {};
  for (const clave of Object.keys(claves)) finales[clave] = leerValorEnv(contenidoEnv, clave);

  console.log('\n  Para pegar en el hPanel de Hostinger (una por una):\n');
  for (const linea of bloqueHPanel(finales).split('\n')) console.log(`    ${linea}`);
  console.log('    NODE_ENV=production');
  console.log(
    '\n  SETUP_SECRET va sólo durante el primer deploy y después se borra\n' +
      '  del hPanel (DEPLOY.md §4). Cambiar una variable en Hostinger no\n' +
      '  rebuildea: hay que apretar Redeploy a mano.\n',
  );
}

/**
 * `pnpm template:diff --marcar`, que es el paso que todo el mundo se saltea.
 *
 * Sin baseline, el primer `template:diff` de esa tienda lista los commits del
 * template enteros y para siempre (NEW-STORE.md). Es la clase de cosa que sólo
 * duele meses después, así que la hace el wizard.
 *
 * No es un error que falle: en el repo del template no hay remoto `template`,
 * y ahí no hay nada que marcar.
 */
function marcarBaseline(): void {
  try {
    execFileSync('pnpm', ['template:diff', '--marcar'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    console.log('  .template-baseline escrito — commitealo junto con el resto.');
  } catch {
    console.log(
      '  (no pude marcar el baseline del template: falta el remoto `template`.\n' +
        '   Agregalo y corré `pnpm template:diff --marcar` — sin eso, los commits\n' +
        '   del template te van a aparecer todos, para siempre.)',
    );
  }
}

// Igual que el resto de los scripts: los tests importan las funciones puras de
// arriba sin abrir una terminal interactiva.
if (process.argv[1] && /nueva-tienda\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
