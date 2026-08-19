import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * Sesión de **cliente** — separada de la del panel, a propósito y en todo.
 *
 * Guardarraíl 4 del PLAN.md, y no es paranoia de manual: si compradoras y
 * empleados compartieran cookie, un bug de rol convierte a una clienta en
 * staff. Acá no hay ningún camino entre las dos sesiones.
 *
 * | | Panel | Cliente |
 * |---|---|---|
 * | Cookie | `ecom_admin` | `ecom_cliente` |
 * | Secreto | `SESSION_SECRET` | `CUSTOMER_SESSION_SECRET` |
 * | Tabla | `users` | `customers` |
 * | Guard | `requireAdminSession` | `requireCustomerSession` |
 *
 * **El secreto es propio y obligatorio.** Reusar `SESSION_SECRET` haría que
 * una cookie de cliente forjada con ese secreto la pudiera desencriptar el
 * lado del panel: el contenido no coincidiría con lo que espera `requireAdmin`
 * y hoy no pasaría nada, pero es exactamente el tipo de "hoy no pasa nada" que
 * deja de ser cierto con el próximo campo que se agregue. Dos secretos, cero
 * razonamiento.
 */
export type CustomerSession = {
  customerId?: number;
  /** `+595XXXXXXXXX`. Sólo para mostrar; la autorización es por `customerId`. */
  phone?: string;
  name?: string;
};

export const CUSTOMER_SESSION_COOKIE = 'ecom_cliente';

export function customerSessionOptions(): SessionOptions {
  const password = process.env.CUSTOMER_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      'CUSTOMER_SESSION_SECRET debe existir y tener al menos 32 caracteres cuando ' +
        'TIENDA.cuentasClientes está prendido. Generalo con: openssl rand -base64 32 ' +
        '(uno propio: no reuses SESSION_SECRET).',
    );
  }
  return {
    password,
    cookieName: CUSTOMER_SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // 30 días: del otro lado no hay plata del comercio ni datos de terceros,
      // sólo los pedidos de quien entra. La del panel dura 8 horas porque abre
      // la caja; ésta se comporta como lo que es, la comodidad de no volver a
      // tipear la dirección.
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

/** ¿Está configurado el secreto? Sin él, la feature no se puede ofrecer. */
export function customerSessionConfigured(): boolean {
  const password = process.env.CUSTOMER_SESSION_SECRET;
  return Boolean(password && password.length >= 32);
}

export async function getCustomerSession(): Promise<IronSession<CustomerSession>> {
  const cookieStore = await cookies();
  return getIronSession<CustomerSession>(cookieStore, customerSessionOptions());
}

export class CustomerUnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'Entrá a tu cuenta para ver esto') {
    super(message);
    this.name = 'CustomerUnauthorizedError';
  }
}

export type CustomerActor = { customerId: number; phone: string; name: string };

/**
 * Guard de toda acción y página de `/cuenta`.
 *
 * Mismo razonamiento que `requireAdminSession`: una server action es un
 * endpoint HTTP con su propio id y se la puede invocar sin pasar por ninguna
 * URL. Esconder la pantalla no es el control de acceso.
 */
export async function requireCustomerSession(): Promise<CustomerActor> {
  const session = await getCustomerSession();
  if (!session.customerId || !session.phone || !session.name) {
    throw new CustomerUnauthorizedError();
  }
  return { customerId: session.customerId, phone: session.phone, name: session.name };
}

/** La sesión si la hay, sin tirar. Para prefills y para el header. */
export async function currentCustomer(): Promise<CustomerActor | null> {
  if (!customerSessionConfigured()) return null;
  try {
    return await requireCustomerSession();
  } catch {
    return null;
  }
}

export async function destroyCustomerSession(): Promise<void> {
  const session = await getCustomerSession();
  session.destroy();
}
