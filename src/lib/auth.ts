import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { users, type UserRole } from '@/db/schema';

import type { Executor } from '@/domain/executor';
import { hashPassword, verifyPassword } from './password';

export type AuthenticatedUser = { id: number; email: string; role: UserRole; name: string | null };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Login del admin. Devuelve `null` en cualquier fallo — nunca distingue
 * "no existe" de "contraseña incorrecta" hacia afuera.
 */
export async function authenticate(
  email: string,
  password: string,
  executor?: Executor,
): Promise<AuthenticatedUser | null> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);

  const user = rows[0];
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!ok || !user || !user.isActive) return null;

  return { id: user.id, email: user.email, role: user.role, name: user.name };
}

/**
 * Alta de usuario del panel. **No hay ruta pública de registro**: esto se llama
 * desde `scripts/create-owner.ts` o desde una acción de admin protegida por
 * `requireOwner()`.
 */
export async function createUser(
  input: { email: string; password: string; name?: string | null; role: UserRole },
  executor?: Executor,
): Promise<{ id: number; email: string; role: UserRole }> {
  const tx = executor ?? getDb();
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  await tx.insert(users).values({
    email,
    passwordHash,
    name: input.name ?? null,
    role: input.role,
  });

  const rows = await tx.select().from(users).where(eq(users.email, email)).limit(1);
  const created = rows[0];
  if (!created) throw new Error(`No pude crear el usuario ${email}`);
  return { id: created.id, email: created.email, role: created.role };
}
