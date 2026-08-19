import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES, USER_ROLES, type OrderStatus, type UserRole } from '@/db/schema';
import { CAPABILITIES, ROLE_CAPABILITIES, can } from '@/lib/permissions';
import {
  ForbiddenError,
  UnauthorizedError,
  VENDEDOR_TRANSITIONS,
  assertCanTransitionTo,
  requireAdmin,
  requireOwner,
  requireStaff,
  type AdminActor,
} from '@/lib/session';

/**
 * Los tres roles del PR B, probados por el lado que importa: **quién no
 * puede**. Un guard que deja pasar a quien corresponde y también a quien no
 * pasa igual de verde que uno correcto.
 */

const actores: Record<UserRole, AdminActor> = {
  owner: { userId: 1, email: 'due@tienda.py', role: 'owner' },
  staff: { userId: 2, email: 'encargado@tienda.py', role: 'staff' },
  vendedor: { userId: 3, email: 'mostrador@tienda.py', role: 'vendedor' },
};

describe('los guards por rol', () => {
  it('requireAdmin deja pasar a los tres roles del panel', () => {
    for (const role of USER_ROLES) {
      expect(requireAdmin(actores[role])).toEqual(actores[role]);
    }
  });

  it('requireStaff excluye al vendedor y deja pasar a owner y staff', () => {
    expect(requireStaff(actores.owner)).toEqual(actores.owner);
    expect(requireStaff(actores.staff)).toEqual(actores.staff);
    expect(() => requireStaff(actores.vendedor)).toThrow(ForbiddenError);
  });

  it('requireOwner excluye a staff y a vendedor', () => {
    expect(requireOwner(actores.owner)).toEqual(actores.owner);
    expect(() => requireOwner(actores.staff)).toThrow(ForbiddenError);
    expect(() => requireOwner(actores.vendedor)).toThrow(ForbiddenError);
  });

  it('un rol que no es del panel no entra ni al guard más flojo', () => {
    // Es la forma que va a tener una sesión de cliente (PR E) si alguien
    // llega a pasarla por acá: rol que no está en el ENUM del panel.
    const cliente = { userId: 9, email: 'compradora@gmail.com', role: 'cliente' as never };
    expect(() => requireAdmin(cliente)).toThrow(ForbiddenError);
  });

  it('una sesión a medio armar es 401, no 403', () => {
    expect(() => requireStaff(null)).toThrow(UnauthorizedError);
    expect(() => requireOwner({ userId: 1 })).toThrow(UnauthorizedError);
  });
});

describe('qué transiciones puede apretar cada rol', () => {
  it('owner y staff pueden cualquier destino de la máquina de estados', () => {
    for (const to of ORDER_STATUSES) {
      expect(() => assertCanTransitionTo(actores.owner, to)).not.toThrow();
      expect(() => assertCanTransitionTo(actores.staff, to)).not.toThrow();
    }
  });

  it('el vendedor sólo puede preparar, despachar y entregar', () => {
    for (const to of VENDEDOR_TRANSITIONS) {
      expect(() => assertCanTransitionTo(actores.vendedor, to)).not.toThrow();
    }
  });

  it('el vendedor no puede dar por cobrado, cancelar, vencer ni reembolsar', () => {
    // Lo importante del rol: todo lo que mueve plata o suelta stock queda
    // afuera, y se enumera desde el ENUM para que un estado nuevo tenga que
    // pasar por acá en vez de colarse permitido.
    const prohibidos: OrderStatus[] = ORDER_STATUSES.filter(
      (status) => !VENDEDOR_TRANSITIONS.includes(status),
    );
    expect(prohibidos).toContain('pagado');
    expect(prohibidos).toContain('reembolsado');
    expect(prohibidos).toContain('cancelado');
    expect(prohibidos).toContain('vencido');
    expect(prohibidos).toContain('rechazado');

    for (const to of prohibidos) {
      expect(() => assertCanTransitionTo(actores.vendedor, to)).toThrow(ForbiddenError);
    }
  });
});

describe('la matriz de capacidades', () => {
  it('el dueño puede todo lo que existe', () => {
    for (const capability of CAPABILITIES) {
      expect(can('owner', capability)).toBe(true);
    }
  });

  it('el staff no toca reembolsos, exports ni usuarios', () => {
    expect(can('staff', 'reembolsos')).toBe(false);
    expect(can('staff', 'exports')).toBe(false);
    expect(can('staff', 'usuarios')).toBe(false);
    // …pero sí la operación diaria completa.
    expect(can('staff', 'comprobantes')).toBe(true);
    expect(can('staff', 'stock')).toBe(true);
    expect(can('staff', 'productos')).toBe(true);
  });

  it('el vendedor ve y despacha pedidos, y nada más', () => {
    expect(ROLE_CAPABILITIES.vendedor).toEqual(['pedidos.ver', 'pedidos.despachar']);
    for (const capability of CAPABILITIES) {
      if (capability === 'pedidos.ver' || capability === 'pedidos.despachar') continue;
      expect(can('vendedor', capability)).toBe(false);
    }
  });

  it('cada rol del ENUM tiene su fila (agregar un rol obliga a decidir)', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined();
    }
  });
});
