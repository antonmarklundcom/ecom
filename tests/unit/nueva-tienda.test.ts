import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bloqueHPanel,
  completarEnv,
  esPlaceholder,
  fijarEnv,
  generarSecreto,
  leerCampoTienda,
  leerValorEnv,
  normalizarDominio,
  normalizarWhatsApp,
  parseFlags,
  reescribirTienda,
  sugerirTitulo,
  type DatosTienda,
} from '../../scripts/nueva-tienda';

/**
 * `pnpm nueva-tienda` (PLAN.md FASE 2, PR U).
 *
 * Todo lo que decide algo vive en funciones puras justamente para poder
 * probarlo sin abrir una terminal interactiva. Lo que se prueba acá es lo que
 * puede salir mal en silencio: reescribir `tienda.ts` y romperlo, o —peor—
 * pisar un secreto que ya estaba cargado, que cierra todas las sesiones del
 * panel y deja al cron de Hostinger llamando con la llave vieja.
 */

/**
 * El `tienda.ts` **del template**, tal como sale de "Use this template".
 *
 * Es una copia y no el archivo real a propósito. Lo que se prueba acá es el
 * lector y el reescritor —que sepan sacar un string partido por prettier, y
 * que `nombre: MARCA_PLACEHOLDER` no se lea como un valor—, no cómo se llama
 * esta tienda. Leyendo `src/config/tienda.ts` de verdad, estos tres tests
 * pasaban sólo mientras nadie corriera `pnpm nueva-tienda`: la primera tienda
 * que se pone su marca los rompe, y el bug estaría en el test, no en el
 * wizard.
 */
const TIENDA_TEMPLATE = `export type Tienda = {
  nombre: string;
  titulo: string;
};

export const MARCA_PLACEHOLDER = "TiendaPY";

export const TIENDA: Tienda = {
  nombre: MARCA_PLACEHOLDER,
  titulo: "TiendaPY — Comprá online en Paraguay",
  descripcion:
    "Tienda online paraguaya. Precios en guaraníes, IVA incluido, envíos a todo el país " +
    "y atención por WhatsApp.",
  tagline: "Precios en guaraníes, IVA incluido. Enviamos a todo el país.",
  lang: "es-PY",
  ogLocale: "es_PY",
  cuentasClientes: false,
  hero: null,
};

export function cuentasClientesHabilitadas(): boolean {
  return TIENDA.cuentasClientes;
}
`;

const DATOS: DatosTienda = {
  nombre: 'Lencería Guaraní',
  titulo: 'Lencería Guaraní — Comprá online en Paraguay',
  descripcion: 'Lencería en Asunción. Precios en guaraníes, IVA incluido, envíos a todo el país.',
  tagline: 'Enviamos a todo el país.',
  whatsapp: '+595981123456',
  dominio: 'https://lenceria.com.py',
};

describe('leer la marca de tienda.ts', () => {
  it('lee los campos que son strings', () => {
    expect(leerCampoTienda(TIENDA_TEMPLATE, 'titulo')).toContain('TiendaPY');
    expect(leerCampoTienda(TIENDA_TEMPLATE, 'tagline')).toBe(
      'Precios en guaraníes, IVA incluido. Enviamos a todo el país.',
    );
  });

  it('lee una descripción partida en varias líneas por prettier', () => {
    // El archivo real la tiene partida: si el lector se quedara con el primer
    // pedazo, la segunda corrida del wizard propondría media meta description.
    expect(leerCampoTienda(TIENDA_TEMPLATE, 'descripcion')).toBe(
      'Tienda online paraguaya. Precios en guaraníes, IVA incluido, envíos a todo el país y atención por WhatsApp.',
    );
  });

  it('el nombre del template no se lee como un valor: es una constante', () => {
    // `nombre: MARCA_PLACEHOLDER`. Devolver "TiendaPY" haría imposible
    // distinguir "todavía no lo renombraron" de "la tienda se llama TiendaPY".
    expect(leerCampoTienda(TIENDA_TEMPLATE, 'nombre')).toBeNull();
  });

  it('el tienda.ts de verdad sigue siendo legible, se llame como se llame', () => {
    // El contrapeso de usar una copia: si el archivo real cambia de forma
    // —otro formato de string, otro nombre de campo— la copia no se entera y
    // los tests de arriba pasarían contra un archivo que ya no existe. Esto
    // mira el real, pero **sin** mirar los valores: una tienda que ya corrió
    // el wizard tiene su marca acá, y eso no es una falla.
    const real = readFileSync(path.join('src', 'config', 'tienda.ts'), 'utf8');

    for (const campo of ['titulo', 'descripcion', 'tagline'] as const) {
      expect(leerCampoTienda(real, campo), `no pude leer "${campo}" del tienda.ts real`).toEqual(
        expect.any(String),
      );
    }
  });
});

describe('reescribir tienda.ts', () => {
  it('cambia los cuatro campos y deja el resto del archivo intacto', () => {
    const salida = reescribirTienda(TIENDA_TEMPLATE, DATOS);

    expect(leerCampoTienda(salida, 'nombre')).toBe(DATOS.nombre);
    expect(leerCampoTienda(salida, 'titulo')).toBe(DATOS.titulo);
    expect(leerCampoTienda(salida, 'descripcion')).toBe(DATOS.descripcion);
    expect(leerCampoTienda(salida, 'tagline')).toBe(DATOS.tagline);

    // Los flags y los comentarios que explican por qué existen no se tocan:
    // una tienda nueva los necesita más que nadie.
    expect(salida).toContain('cuentasClientes: false');
    expect(salida).toContain('hero: null');
    expect(salida).toContain('export const MARCA_PLACEHOLDER = "TiendaPY";');
    expect(salida).toContain('export function cuentasClientesHabilitadas()');
  });

  it('es idempotente: reescribir lo ya escrito no cambia nada', () => {
    const una = reescribirTienda(TIENDA_TEMPLATE, DATOS);
    expect(reescribirTienda(una, DATOS)).toBe(una);
  });

  it('escapa las comillas en vez de romper el archivo', () => {
    const salida = reescribirTienda(TIENDA_TEMPLATE, { ...DATOS, tagline: 'La tienda "de barrio"' });
    expect(salida).toContain('\\"de barrio\\"');
    expect(leerCampoTienda(salida, 'tagline')).toBe('La tienda "de barrio"');
  });

  it('avisa en vez de escribir cualquier cosa si el archivo ya no tiene TIENDA', () => {
    expect(() => reescribirTienda('export const OTRA_COSA = 1;\n', DATOS)).toThrow(/tienda\.ts/);
  });
});

describe('completar el .env sin pisar lo que ya está', () => {
  it('completa una clave vacía', () => {
    const { contenido, escritas } = completarEnv('SESSION_SECRET=""\n', {
      SESSION_SECRET: 'un-secreto',
    });
    expect(leerValorEnv(contenido, 'SESSION_SECRET')).toBe('un-secreto');
    expect(escritas).toEqual(['SESSION_SECRET']);
  });

  it('NO pisa un secreto ya cargado', () => {
    // Es la regla que hace idempotente al wizard. Un SESSION_SECRET nuevo
    // cierra todas las sesiones del panel; un CRON_SECRET nuevo deja al cron
    // de Hostinger llamando con la llave vieja hasta que alguien lo mire.
    const { contenido, escritas, conservadas } = completarEnv('SESSION_SECRET="el-de-antes"\n', {
      SESSION_SECRET: 'uno-nuevo',
    });
    expect(leerValorEnv(contenido, 'SESSION_SECRET')).toBe('el-de-antes');
    expect(escritas).toEqual([]);
    expect(conservadas).toEqual(['SESSION_SECRET']);
  });

  it('trata el placeholder de .env.example como vacío', () => {
    const { contenido } = completarEnv('CLOUDINARY_CLOUD_NAME="changeme"\n', {
      CLOUDINARY_CLOUD_NAME: 'tienda-py',
    });
    expect(leerValorEnv(contenido, 'CLOUDINARY_CLOUD_NAME')).toBe('tienda-py');
  });

  it('agrega la clave que no existe, al final', () => {
    const { contenido } = completarEnv('OTRA=1\n', { CRON_SECRET: 'abc' });
    expect(contenido).toContain('OTRA=1');
    expect(leerValorEnv(contenido, 'CRON_SECRET')).toBe('abc');
  });

  it('no convierte un comentario en configuración', () => {
    // `# BANCO_QR_URL=""` es documentación. Pisarla dejaría una variable
    // activa que nadie escribió.
    const { contenido } = completarEnv('# CRON_SECRET="ejemplo"\n', { CRON_SECRET: 'abc' });
    expect(contenido).toContain('# CRON_SECRET="ejemplo"');
    expect(leerValorEnv(contenido, 'CRON_SECRET')).toBe('abc');
  });
});

describe('los secretos', () => {
  it('son largos de sobra para iron-session y para el cron', () => {
    // iron-session exige 32; la ruta del cron, 16. `pnpm preflight` bloquea
    // por debajo de eso, así que un secreto corto sería un wizard que deja la
    // tienda sin poder deployar.
    expect(generarSecreto(32).length).toBeGreaterThanOrEqual(32);
    expect(generarSecreto(24).length).toBeGreaterThanOrEqual(16);
  });

  it('no se repiten', () => {
    const muestras = new Set(Array.from({ length: 20 }, () => generarSecreto()));
    expect(muestras.size).toBe(20);
  });

  it('no salen del placeholder que preflight rechaza', () => {
    expect(generarSecreto()).not.toMatch(/changeme|generate/i);
  });
});

describe('lo que se pega en el hPanel', () => {
  it('va sin comillas: Hostinger las guardaría como parte del valor', () => {
    const bloque = bloqueHPanel({ SESSION_SECRET: 'abc', WHATSAPP_NUMBER: '+595981123456' });
    expect(bloque).toBe('SESSION_SECRET=abc\nWHATSAPP_NUMBER=+595981123456');
  });

  it('no lista lo que quedó vacío', () => {
    expect(bloqueHPanel({ SESSION_SECRET: 'abc', PAGOPAR_PUBLIC_KEY: '' })).toBe(
      'SESSION_SECRET=abc',
    );
  });
});

describe('normalización de lo que tipea una persona', () => {
  it('el dominio queda absoluto, en https y sin barra final', () => {
    // `NEXT_PUBLIC_SITE_URL` sin https bloquea el preflight en producción, y
    // una URL relativa deja los links del pedido rotos.
    for (const entrada of ['tienda.com.py', 'https://tienda.com.py/', 'http://tienda.com.py']) {
      expect(normalizarDominio(entrada)).toBe('https://tienda.com.py');
    }
    expect(normalizarDominio('  ')).toBe('');
  });

  it('el WhatsApp queda en la forma que acepta wa.me', () => {
    for (const entrada of ['0981123456', '0981 123 456', '+595981123456', '595981123456']) {
      expect(normalizarWhatsApp(entrada)).toBe('+595981123456');
    }
    expect(normalizarWhatsApp('')).toBe('');
  });
});

describe('las banderas', () => {
  it('leen las seis respuestas', () => {
    expect(
      parseFlags(['--nombre', 'Lencería', '--dominio', 'lenceria.com.py', '--dry-run']),
    ).toEqual({ nombre: 'Lencería', dominio: 'lenceria.com.py' });
  });

  it('una bandera desconocida es un error, no algo que se ignora', () => {
    // `--nombr` mal tipeado tiene que doler ahora y no cuando el header diga
    // "TiendaPY".
    expect(() => parseFlags(['--nombr', 'Lencería'])).toThrow(/--nombr/);
  });

  it('una bandera sin valor es un error', () => {
    expect(() => parseFlags(['--nombre', '--dominio', 'x'])).toThrow(/espera un valor/);
    expect(() => parseFlags(['--nombre'])).toThrow(/espera un valor/);
  });
});

describe('el placeholder de .env.example cuenta como vacío', () => {
  it('reconoce el que trae el ejemplo, no sólo la palabra "changeme"', () => {
    // `.env.example` trae SESSION_SECRET="changeme-generate-with-openssl-rand-base64-32".
    // Tomarlo por un valor cargado dejaría la tienda firmando las cookies del
    // panel con un secreto que está publicado en el repo.
    expect(esPlaceholder('changeme-generate-with-openssl-rand-base64-32')).toBe(true);
    expect(esPlaceholder('changeme')).toBe(true);
    expect(esPlaceholder('   ')).toBe(true);
    expect(esPlaceholder('un-secreto-de-verdad')).toBe(false);
  });

  it('es la misma regla que usa preflight para rechazar un secreto', async () => {
    const { preflight } = await import('../../src/domain/preflight');
    const placeholder = 'changeme-generate-with-openssl-rand-base64-32';
    const check = preflight({
      SESSION_SECRET: placeholder,
    }).checks.find((item) => item.id === 'session_secret');

    expect(esPlaceholder(placeholder)).toBe(true);
    expect(check?.severity).toBe('bloquea');
  });
});

describe('fijar lo que la persona acaba de contestar', () => {
  it('pisa el valor viejo', () => {
    // Al revés que un secreto: conservar el dominio de .env.example sería
    // ignorar en silencio lo que se acaba de tipear.
    const { contenido, escritas } = fijarEnv('NEXT_PUBLIC_SITE_URL="http://localhost:3000"\n', {
      NEXT_PUBLIC_SITE_URL: 'https://lenceria.com.py',
    });
    expect(leerValorEnv(contenido, 'NEXT_PUBLIC_SITE_URL')).toBe('https://lenceria.com.py');
    expect(escritas).toEqual(['NEXT_PUBLIC_SITE_URL']);
  });

  it('no anuncia un cambio cuando el valor es el mismo', () => {
    const { escritas } = fijarEnv('WHATSAPP_NUMBER="+595981123456"\n', {
      WHATSAPP_NUMBER: '+595981123456',
    });
    expect(escritas).toEqual([]);
  });
});

describe('el título se sugiere a partir del nombre', () => {
  it('reemplaza el del template, que es el único que lleva la marca adentro', () => {
    // Apretar Enter sin mirar dejaría "TiendaPY" en el <title> de todas las
    // pantallas y en cada link compartido por WhatsApp.
    expect(sugerirTitulo('TiendaPY — Comprá online en Paraguay', 'Lencería Guaraní')).toBe(
      'Lencería Guaraní — Comprá online en Paraguay',
    );
  });

  it('no toca un título que la tienda ya eligió', () => {
    expect(sugerirTitulo('Lo mejor en lencería', 'Lencería Guaraní')).toBe('Lo mejor en lencería');
  });

  it('sin nombre no sugiere nada', () => {
    expect(sugerirTitulo('TiendaPY — Comprá online en Paraguay', '  ')).toBe(
      'TiendaPY — Comprá online en Paraguay',
    );
  });
});
