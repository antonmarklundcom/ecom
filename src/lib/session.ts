import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

import type { UserRole } from '@/db/schema';

/**
 * Sesión de admin. No hay cuentas de comprador en v1: el comprador entra a su
 * pedido con el token de la URL (ARCH.md §1).
 */
export type AdminSession = {
  userId?: number;
  email?: string;
  role?: UserRole;
};

export const SESSION_COOKIE = 'ecom_admin';

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      'SESSION_SECRET debe existir y tener al menos 32 caracteres. ' +
        'Generala con: openssl rand -base64 32',
    );
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    },
  };
}

export async function getSession(): Promise<IronSession<AdminSession>> {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions());
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'Necesitás iniciar sesión') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'No tenés permiso para hacer esto') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export type AdminActor = { userId: number; email: string; role: UserRole };

/**
 * Guard de admin. Se llama al principio de CADA server action y route handler
 * de `/admin` — esconder un botón es UX, no seguridad (ARCH.md §1, regla 2).
 */
export function requireAdmin(session: AdminSession | null | undefined): AdminActor {
  if (!session?.userId || !session.email || !session.role) {
    throw new UnauthorizedError();
  }
  if (session.role !== 'owner' && session.role !== 'staff') {
    throw new ForbiddenError();
  }
  return { userId: session.userId, email: session.email, role: session.role };
}

/** Acciones reservadas al dueño (alta de usuarios, borrados, reembolsos). */
export function requireOwner(session: AdminSession | null | undefined): AdminActor {
  const actor = requireAdmin(session);
  if (actor.role !== 'owner') {
    throw new ForbiddenError('Sólo el dueño puede hacer esto');
  }
  return actor;
}

/** Etiqueta de actor para `order_events`. */
export function actorLabel(actor: AdminActor): string {
  return `admin:${actor.email}`;
}
