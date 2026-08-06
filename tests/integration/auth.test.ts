import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { authenticate, createUser } from '@/lib/auth';
import { requireAdmin, requireOwner } from '@/lib/session';

import { closeTestDb, hasTestDb, resetTables } from '../helpers/db';

describe.skipIf(!hasTestDb)('auth', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('crea el dueño y lo autentica', async () => {
    const created = await createUser({
      email: 'Due@Tienda.PY',
      password: 'tienda2026segura',
      role: 'owner',
      name: 'La Dueña',
    });
    expect(created.email).toBe('due@tienda.py'); // normalizado

    const user = await authenticate('due@tienda.py', 'tienda2026segura');
    expect(user).toMatchObject({ email: 'due@tienda.py', role: 'owner' });

    const session = { userId: user!.id, email: user!.email, role: user!.role };
    expect(requireOwner(session).role).toBe('owner');
  });

  it('el email es case-insensitive al entrar', async () => {
    await createUser({ email: 'staff@tienda.py', password: 'tienda2026segura', role: 'staff' });
    expect(await authenticate('STAFF@TIENDA.PY', 'tienda2026segura')).not.toBeNull();
  });

  it('contraseña incorrecta y usuario inexistente devuelven null (sin distinguirse)', async () => {
    await createUser({ email: 'staff@tienda.py', password: 'tienda2026segura', role: 'staff' });
    expect(await authenticate('staff@tienda.py', 'otra-cosa')).toBeNull();
    expect(await authenticate('nadie@tienda.py', 'tienda2026segura')).toBeNull();
  });

  it('un staff no pasa el guard de dueño pero sí el de admin', async () => {
    await createUser({ email: 'staff@tienda.py', password: 'tienda2026segura', role: 'staff' });
    const user = await authenticate('staff@tienda.py', 'tienda2026segura');
    const session = { userId: user!.id, email: user!.email, role: user!.role };

    expect(requireAdmin(session).role).toBe('staff');
    expect(() => requireOwner(session)).toThrow();
  });

  it('la contraseña nunca se guarda en claro', async () => {
    const { id } = await createUser({ email: 'x@tienda.py', password: 'tienda2026segura', role: 'staff' });
    const { getTestDb } = await import('../helpers/db');
    const { users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const row = (await getTestDb().select().from(users).where(eq(users.id, id)))[0];
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.passwordHash).not.toContain('tienda2026segura');
  });
});
