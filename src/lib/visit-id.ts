/**
 * Identidad anónima de visita — la cookie que hace posible la analítica propia
 * (`src/domain/analytics.ts`).
 *
 * Sirve para **una sola** pregunta que no se puede contestar de otra forma:
 * "esta persona que hoy compró, ¿por qué página entró?". Sin un identificador
 * que dure entre requests, una visita a la home y un pedido veinte minutos
 * después son dos hechos sueltos.
 *
 * ### No es una sesión
 *
 * Este template ya tiene dos sesiones y ésta **no es una tercera**. La
 * diferencia no es de implementación, es de qué autoriza cada una:
 *
 * | | Panel | Cliente | Visita |
 * |---|---|---|---|
 * | Cookie | `ecom_admin` | `ecom_cliente` | `ecom_visita` |
 * | Qué guarda | userId + rol | customerId + teléfono | un número al azar |
 * | Secreto | `SESSION_SECRET` | `CUSTOMER_SESSION_SECRET` | ninguno |
 * | Qué autoriza | todo el panel | los pedidos de esa cuenta | **nada** |
 * | Se puede falsificar | no (iron-session) | no (iron-session) | sí, y no importa |
 *
 * La última fila es la que hay que leer despacio. Un `visitId` **nunca** puede
 * aparecer en un `WHERE` que decida qué datos ve alguien, ni al lado de un
 * `customerId`, ni como fallback de una sesión que no está. Es una etiqueta
 * para agrupar filas de una tabla de estadísticas, y ése es todo su poder. El
 * día que algo lo lea para autorizar, la falsificación pasa de "me ensucio mi
 * propia fila del embudo" a un agujero de verdad.
 *
 * Por eso tampoco va firmada ni encriptada: iron-session existe para que el
 * **contenido** de una cookie no se pueda tocar, y acá no hay contenido —
 * dieciséis bytes al azar sin ninguna afirmación adentro. Firmarlos costaría
 * una operación de cripto por request en el edge para proteger un dato que no
 * afirma nada.
 *
 * ### Lo que la cookie no tiene
 *
 * Ni IP, ni user-agent, ni referrer, ni nada derivado de ellos. No hay
 * fingerprinting, no hay identificador compartido con ningún otro sitio y no
 * sale del servidor de esta tienda. La política completa está escrita en
 * `src/domain/analytics.ts`.
 *
 * Este módulo **no importa nada**, igual que `roles.ts` y por el mismo motivo:
 * lo lee `src/proxy.ts`, que corre en el runtime edge y no puede arrastrar
 * `drizzle-orm` para acuñar un número al azar.
 */

export const VISIT_COOKIE = 'ecom_visita';

/**
 * Cuánto dura la cookie.
 *
 * Seis meses, y el número sale de para qué se usa. Hacia abajo: una compradora
 * paraguaya ve el link en Instagram, mira, cierra, y vuelve a los tres días
 * cuando cobra — una cookie de sesión perdería justamente la conversión que
 * más interesa medir. Hacia arriba: el dueño lee "cuánto convirtió la portada
 * de la campaña de setiembre", y una temporada entra cómoda en seis meses;
 * más que eso ya no contesta ninguna pregunta que alguien vaya a hacer, y un
 * identificador que dura años sin que nadie lo use es lo que hay que evitar.
 */
export const VISIT_TTL_DAYS = 180;
export const VISIT_TTL_SECONDS = VISIT_TTL_DAYS * 24 * 60 * 60;

/** 16 bytes en hex. Entra holgado en el `varchar(32)` de la columna. */
export const VISIT_ID_LENGTH = 32;

const HEX_32 = /^[0-9a-f]{32}$/;

/**
 * Un identificador nuevo, con el `crypto` **global**.
 *
 * `node:crypto` no existe en el edge, que es donde se acuña esto. La Web
 * Crypto API sí, y es la misma primitiva criptográfica: no es un `Math.random`
 * disfrazado. Que sea impredecible no protege nada acá adentro (ver el cuadro
 * de arriba) pero evita lo que sí molesta: dos visitantes con el mismo id
 * porque el generador tenía poca entropía, que arruinaría los números en
 * silencio.
 */
export function nuevoVisitId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * ¿Esto que llegó en la cookie tiene forma de id?
 *
 * No es una validación de seguridad —cualquiera puede mandar 32 caracteres hex
 * inventados— sino de **integridad de los datos**: sin esto, una cookie
 * corrupta o un id de otra versión del template terminan siendo una fila más
 * en la tabla, y el embudo cuenta un visitante que no existe.
 */
export function esVisitId(value: string | undefined | null): value is string {
  return typeof value === 'string' && HEX_32.test(value);
}

/**
 * Las rutas que no acuñan cookie de visita.
 *
 * El panel queda afuera **a propósito**: la analítica mide la vidriera, y las
 * ciento veinte páginas que abre el dueño en una mañana de trabajo no son
 * visitas de nadie. `/api` y `/_next` no son navegaciones, y `/dev` es el
 * simulador de Pagopar.
 *
 * Pura y exportada para poder testearla: es la clase de función que se rompe
 * el día que alguien agrega una ruta y nadie se entera hasta que los números
 * están mal desde hace un mes.
 */
export function rutaSinVisita(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/dev' ||
    pathname.startsWith('/dev/')
  );
}

/**
 * Las opciones de la cookie. Una función y no un objeto suelto porque `secure`
 * depende del ambiente, igual que en las dos sesiones.
 *
 * **`httpOnly: true`.** Nada del navegador necesita leer este valor: el
 * pageview viaja a una ruta del mismo origen y la cookie va sola. Dejarla
 * legible no habilitaría ninguna feature y sí pondría el identificador al
 * alcance de cualquier script — que es exactamente la forma en que un
 * identificador de primera parte se convierte, sin que nadie lo decida, en
 * material para otra cosa.
 *
 * **`sameSite: 'lax'` y no `'strict'`.** Con `strict` el navegador **no manda**
 * la cookie en la navegación que llega desde otro sitio, o sea justo en el
 * click de Instagram o del WhatsApp del comercio. La página de entrada de esa
 * visita saldría en blanco y la conversión por página de entrada —el número
 * más difícil y el que más se pidió— quedaría midiendo sólo a quien ya estaba
 * adentro. `lax` sí la manda en una navegación GET de primer nivel, que es
 * este caso, y sigue sin viajar en un POST cross-site.
 */
export function visitCookieOptions(production: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: VISIT_TTL_SECONDS,
  };
}
