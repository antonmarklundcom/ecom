import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAX_PATH_LENGTH, normalizarPath } from '@/domain/analytics';
import {
  RANGOS_DIAS,
  RANGO_DIAS_DEFAULT,
  RETENCION_DIAS_DEFAULT,
  corteDeRetencion,
  diasDelRango,
  retencionDias,
  tasa,
} from '@/domain/admin-analytics';
import {
  VISIT_COOKIE,
  VISIT_ID_LENGTH,
  VISIT_TTL_SECONDS,
  esVisitId,
  nuevoVisitId,
  rutaSinVisita,
  visitCookieOptions,
} from '@/lib/visit-id';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/customer-session';
import { SESSION_COOKIE } from '@/lib/session';

import { exportedAsyncFunctions, listSourceFiles, readCode } from '../helpers/source';

/**
 * Analítica propia — la lógica pura y los guardarraíles del diseño.
 *
 * Los números en sí (embudo, conversión por página de entrada) necesitan una
 * base y viven en `tests/integration/`. Acá está lo que se puede verificar sin
 * MySQL, que resulta ser lo que más caro sale si se rompe:
 *
 * 1. **Las funciones puras** — normalizar una ruta, calcular un porcentaje,
 *    validar un rango que viene de la URL.
 * 2. **Las reglas de diseño escritas como test** — que la analítica nunca
 *    pueda tumbar un checkout, que no haya plata en la tabla de eventos, que
 *    el `visitId` no se confunda con una sesión. Ninguna de las tres rompe
 *    nada visible el día que alguien las viola: dejan un agujero que se
 *    descubre tarde, que es exactamente el caso para el que sirve un test de
 *    código.
 */

describe('normalizarPath', () => {
  it('deja pasar las rutas normales de la tienda', () => {
    expect(normalizarPath('/')).toBe('/');
    expect(normalizarPath('/carrito')).toBe('/carrito');
    expect(normalizarPath('/categoria/lenceria')).toBe('/categoria/lenceria');
    // Los guiones de un slug son lo más común que hay: una regex de control
    // mal escrita los rechaza y el ranking de productos queda vacío.
    expect(normalizarPath('/producto/corpino-de-encaje-90b')).toBe(
      '/producto/corpino-de-encaje-90b',
    );
  });

  it('corta el querystring: privacidad y cardinalidad', () => {
    // `?q=` es texto que tipeó una persona; y sin esto `/buscar` sería una
    // ruta distinta por cada búsqueda.
    expect(normalizarPath('/buscar?q=corpi%C3%B1o+rojo')).toBe('/buscar');
    expect(normalizarPath('/categoria/ropa?pagina=3&orden=precio')).toBe('/categoria/ropa');
    expect(normalizarPath('/producto/x#fotos')).toBe('/producto/x');
    expect(normalizarPath('/producto/x?utm_source=instagram#top')).toBe('/producto/x');
  });

  it('unifica la barra final', () => {
    expect(normalizarPath('/carrito/')).toBe('/carrito');
    expect(normalizarPath('/carrito//')).toBe('/carrito');
    // La raíz es la excepción: no se puede quedar sin nada.
    expect(normalizarPath('/')).toBe('/');
  });

  it('descarta lo que no es una ruta de esta tienda', () => {
    for (const basura of [
      // Una URL absoluta disfrazada de ruta: guardarla metería el dominio de
      // otro adentro del reporte de esta tienda.
      '//sitio-ajeno.py/promo',
      '/\\sitio-ajeno.py',
      'https://sitio-ajeno.py/',
      'javascript:alert(1)',
      'carrito',
      '',
      '   ',
      // Nada de esto sale de una navegación real.
      '/carrito\nX-Inyectado: 1',
      '/con espacio',
      undefined,
      null,
      42,
      { path: '/carrito' },
    ]) {
      expect(normalizarPath(basura), `debería descartar ${JSON.stringify(basura)}`).toBeNull();
    }
  });

  it('recorta en vez de hacer fallar el INSERT', () => {
    const largo = `/producto/${'a'.repeat(400)}`;
    const resultado = normalizarPath(largo);
    expect(resultado).not.toBeNull();
    expect(resultado?.length).toBe(MAX_PATH_LENGTH);
  });
});

describe('tasa', () => {
  it('devuelve un porcentaje entero', () => {
    expect(tasa(12, 100)).toBe(12);
    expect(tasa(1, 3)).toBe(33);
    expect(tasa(2, 3)).toBe(67);
    expect(tasa(5, 5)).toBe(100);
  });

  it('sin denominador devuelve null y no cero', () => {
    // Una tienda sin visitas no convirtió el 0 %: no se sabe. Un "0 %" al lado
    // de una página nueva hace tomar decisiones al revés.
    expect(tasa(0, 0)).toBeNull();
    expect(tasa(3, 0)).toBeNull();
    expect(tasa(1, -5)).toBeNull();
    expect(tasa(1, Number.NaN)).toBeNull();
  });
});

describe('diasDelRango', () => {
  it('acepta sólo los rangos que ofrece la pantalla', () => {
    for (const dias of RANGOS_DIAS) {
      expect(diasDelRango(String(dias))).toBe(dias);
    }
  });

  it('cualquier otra cosa cae en el default', () => {
    // Un `?dias=99999` sin esto es un scan de la tabla entera servido a
    // pedido de cualquiera con la URL.
    for (const valor of ['99999', '0', '-7', '1.5', 'todos', '', undefined]) {
      expect(diasDelRango(valor)).toBe(RANGO_DIAS_DEFAULT);
    }
  });
});

describe('retención', () => {
  it('un valor inválido no rompe la tienda: cae en el default', () => {
    for (const valor of [undefined, '', 'un año', '0', '-30', '1.5']) {
      expect(retencionDias(valor)).toBe(RETENCION_DIAS_DEFAULT);
    }
    expect(retencionDias('90')).toBe(90);
    expect(retencionDias(' 90 ')).toBe(90);
  });

  it('el corte es exactamente N días antes', () => {
    const ahora = new Date('2026-08-24T12:00:00.000Z');
    expect(corteDeRetencion(30, ahora).toISOString()).toBe('2026-07-25T12:00:00.000Z');
    expect(corteDeRetencion(365, ahora).toISOString()).toBe('2025-08-24T12:00:00.000Z');
  });
});

describe('la cookie de visita', () => {
  it('acuña ids con la forma que espera la columna', () => {
    const id = nuevoVisitId();
    expect(id).toHaveLength(VISIT_ID_LENGTH);
    expect(esVisitId(id)).toBe(true);
  });

  it('no repite', () => {
    // No es una prueba de criptografía: es la que agarra el día que alguien
    // reemplace `getRandomValues` por algo con poca entropía y dos visitantes
    // empiecen a compartir fila sin que nada falle.
    const ids = new Set(Array.from({ length: 500 }, nuevoVisitId));
    expect(ids.size).toBe(500);
  });

  it('rechaza lo que no tiene forma de id', () => {
    for (const valor of [
      undefined,
      null,
      '',
      'abc',
      'A'.repeat(32), // mayúsculas: el generador siempre escribe minúsculas
      'z'.repeat(32), // fuera del alfabeto hex
      `${'a'.repeat(32)}b`,
      "' OR 1=1 --",
    ]) {
      expect(esVisitId(valor as string | undefined), `debería rechazar ${valor}`).toBe(false);
    }
  });

  it('no se pisa con ninguna de las dos sesiones', () => {
    // Tres poblaciones distintas, tres cookies distintas. Compartir nombre
    // sería la forma más rápida de que un identificador anónimo empiece a
    // llegar a un guard.
    expect(new Set([VISIT_COOKIE, SESSION_COOKIE, CUSTOMER_SESSION_COOKIE]).size).toBe(3);
  });

  it('es httpOnly, dura seis meses y es Lax y no Strict', () => {
    const opciones = visitCookieOptions(true);

    // Nada del navegador la lee: dejarla legible no habilita ninguna feature.
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.secure).toBe(true);
    expect(visitCookieOptions(false).secure).toBe(false);
    expect(opciones.path).toBe('/');
    expect(opciones.maxAge).toBe(VISIT_TTL_SECONDS);
    expect(opciones.maxAge).toBe(180 * 24 * 60 * 60);

    // `strict` no manda la cookie en la navegación que llega desde otro sitio
    // —el click de Instagram o del WhatsApp del comercio— y esa es
    // exactamente la visita cuya página de entrada se quiere medir.
    expect(opciones.sameSite).toBe('lax');
  });

  it('el panel, la API y el simulador no acuñan visita', () => {
    for (const ruta of ['/admin', '/admin/pedidos', '/api/health', '/_next/static/x.js', '/dev/pagopar/abc']) {
      expect(rutaSinVisita(ruta), `${ruta} no debería contar como visita`).toBe(true);
    }
    for (const ruta of ['/', '/carrito', '/checkout', '/producto/x', '/categoria/y', '/administracion']) {
      expect(rutaSinVisita(ruta), `${ruta} sí es vidriera`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Los guardarraíles del diseño, verificados sobre el código
// ---------------------------------------------------------------------------

describe('la analítica no puede tumbar un checkout', () => {
  it('todo lo que escribe un evento atrapa su propio error', async () => {
    // Mismo contrato que `notifyNewOrder`: el pedido y su reserva de stock ya
    // están escritos cuando esto corre. El día que una de estas funciones
    // deje de atrapar, un INSERT fallido de estadística tira un checkout
    // cobrado — y el síntoma sería "a veces el checkout falla".
    const code = await readCode(path.join('src', 'domain', 'analytics.ts'));

    const registrar = /async function registrar\(/.test(code);
    expect(registrar, 'analytics.ts debería tener el `registrar()` central').toBe(true);
    expect(code).toMatch(/try\s*\{[\s\S]*insert\(analyticsEvents\)[\s\S]*\}\s*catch/);

    // Y ninguna de las exportadas puede tirar por su cuenta.
    for (const fn of exportedAsyncFunctions(code)) {
      expect(fn.body, `${fn.name}() no debería tirar`).not.toMatch(/\bthrow\b/);
    }
  });

  it('nada de la analítica entra en la transacción de create-order', async () => {
    // Un INSERT de estadística adentro de esa transacción puede hacer rollback
    // de un pedido bueno, y sostiene un candado más mientras `reserveStock`
    // tiene variantes bloqueadas. Los eventos se anotan desde la acción.
    const createOrder = await readCode(path.join('src', 'domain', 'create-order.ts'));
    expect(createOrder).not.toMatch(/analytics|registrarCompra|analyticsEvents/i);

    const action = await readCode(path.join('src', 'app', 'actions', 'checkout.ts'));
    expect(action).toMatch(/registrarCompra\s*\(/);
  });
});

describe('la tabla de eventos no toca el camino de la plata', () => {
  it('no hay ni una columna de guaraníes en analytics_events', async () => {
    // La tentación es guardar `total_pyg` para que el reporte sume sin joins.
    // Eso sería una copia del monto viviendo fuera del camino del dinero, que
    // `pnpm reconcile` ya no revisa y que un reembolso deja mintiendo para
    // siempre. La fila guarda el `order_id` y el monto se lee de `orders`.
    const schema = await readCode(path.join('src', 'db', 'schema.ts'));
    const tabla = /export const analyticsEvents = mysqlTable\([\s\S]*?\n\);/.exec(schema)?.[0];

    expect(tabla, 'no encontré la tabla analytics_events').toBeTruthy();
    expect(tabla).not.toMatch(/pyg|Pyg|PYG/);
    expect(tabla).not.toMatch(/\bstatus\b/);
  });

  it('el reporte lee el estado de orders y con la misma lista que el resumen', async () => {
    // Que un pedido vencido o reembolsado deje de contar como conversión
    // depende enteramente de este join. Sin él, la pantalla contaría intentos.
    const code = await readCode(path.join('src', 'domain', 'admin-analytics.ts'));
    expect(code).toMatch(/import \{ REVENUE_STATUSES \} from ["']\.\/admin-dashboard["']/);
    expect(code).not.toMatch(/\[\s*["']pagado["']/);
  });
});

describe('el visitId no es una identidad', () => {
  it('ninguna consulta de dominio filtra datos de alguien por visitId', async () => {
    // La regla que hace que falsificar la cookie sea inofensivo: un `visitId`
    // agrupa filas de estadística y no decide qué datos ve nadie. El día que
    // aparezca en un `where` al lado de un `customerId` o de un `accessToken`,
    // la falsificación deja de ser "me ensucio mi propio embudo".
    const offenders: string[] = [];

    for (const file of await listSourceFiles([path.join('src', 'domain'), path.join('src', 'lib')])) {
      // Los dos módulos de la analítica son justamente los que sí lo usan.
      if (file.endsWith('analytics.ts') || file.endsWith('admin-analytics.ts')) continue;
      if (file.endsWith('visit-id.ts') || file.endsWith('visit-cookie.ts')) continue;

      const code = await readCode(file);
      if (/visitId/.test(code)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('no viaja en el input de ninguna server action', async () => {
    // Sale siempre de la cookie. Aceptarlo del formulario dejaría escribir
    // eventos atribuidos a la visita de otra persona — y esa persona es la
    // que después compra.
    const ACTIONS = path.join('src', 'app', 'actions');
    const files = (await listSourceFiles([ACTIONS])).filter((file) => file.endsWith('.ts'));

    for (const file of files) {
      const code = await readCode(file);
      expect(code, `${file} no debería recibir un visitId por input`).not.toMatch(
        /visitId:\s*z\./,
      );
      // Y donde se use, tiene que venir del helper de la cookie.
      if (/\bvisitId\b/.test(code)) {
        expect(code, `${file} debería leer el visitId de la cookie`).toMatch(/visitIdActual\s*\(/);
      }
    }
  });

  it('la ruta del beacon tampoco lo acepta del cuerpo', async () => {
    const route = await readCode(
      path.join('src', 'app', 'api', 'analytics', 'visita', 'route.ts'),
    );
    expect(route).toMatch(/visitIdActual\s*\(/);
    // Del cuerpo se lee `path` y nada más.
    expect(route).not.toMatch(/cuerpo\s*as\s*\{[^}]*visitId/);
    // Y tiene guard, como toda ruta de API (ver security-review).
    expect(route).toMatch(/rateLimit\s*\(/);
  });
});

describe('sin terceros', () => {
  it('no hay ningún script de analítica externo en el código', async () => {
    // La razón de ser de todo esto. Un `<Script src="...google-analytics...">`
    // que aparezca un día en un layout tiene que romper el build, no pasar
    // desapercibido en un diff de piel.
    const PROHIBIDO =
      /googletagmanager|google-analytics|gtag\(|connect\.facebook\.net|fbq\(|hotjar|mixpanel|segment\.com|plausible\.io|posthog/i;

    const offenders: string[] = [];
    for (const file of await listSourceFiles(['src'])) {
      const code = await readCode(file);
      if (PROHIBIDO.test(code)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('el beacon habla sólo con este origen', async () => {
    // El CSP ya lo impone (`connect-src 'self'`), pero el componente tiene que
    // seguir siendo compatible con eso sin que nadie tenga que acordarse.
    const tracker = await readCode(path.join('src', 'components', 'visit-tracker.tsx'));
    expect(tracker).toMatch(/["']\/api\/analytics\/visita["']/);
    expect(tracker).not.toMatch(/https?:\/\//);
  });

  it('no se guarda IP, user-agent ni referrer', async () => {
    for (const file of [
      path.join('src', 'domain', 'analytics.ts'),
      path.join('src', 'app', 'api', 'analytics', 'visita', 'route.ts'),
      path.join('src', 'components', 'visit-tracker.tsx'),
    ]) {
      const code = await readCode(file);
      expect(code, `${file} no debería mirar el referrer`).not.toMatch(/referrer|referer/i);
      expect(code, `${file} no debería mirar el user-agent`).not.toMatch(/user-agent|userAgent/i);
    }

    // `clientIp` se usa para el rate limit —en memoria— y nunca se escribe.
    const route = await readCode(
      path.join('src', 'app', 'api', 'analytics', 'visita', 'route.ts'),
    );
    expect(route).toMatch(/rateLimit\(`analytics:ip:\$\{ip\}`/);
    expect(route).not.toMatch(/registrarVisita\([^)]*\bip\b/);
  });
});
