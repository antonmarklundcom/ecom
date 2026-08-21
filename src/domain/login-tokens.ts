import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MessageKey, Params } from '@/i18n';

import { DomainError } from './errors';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { customers, loginTokens } from '@/db/schema';

import type { Executor } from './executor';
import type { MessageChannel } from './messaging';

/**
 * Códigos de un solo uso para entrar sin contraseña (PLAN.md FASE 2, PR F.1).
 *
 * Las cinco propiedades que lo hacen seguro, y por qué cada una:
 *
 * 1. **Se guarda el hash, nunca el código.** Un dump de la base, un backup o
 *    una consulta de soporte no pueden abrir la sesión de nadie.
 * 2. **Un solo uso.** `consumed_at` se escribe adentro de la transacción que
 *    lo canjea, con un UPDATE condicional: dos pestañas con el mismo código no
 *    abren dos sesiones.
 * 3. **Expira a los 10 minutos.** Es el tiempo de mirar el teléfono, no el de
 *    encontrar un WhatsApp viejo el mes que viene.
 * 4. **Pedir uno nuevo invalida los anteriores.** Si no, cada pedido suma otro
 *    código vivo y la ventana de adivinación crece con cada intento.
 * 5. **Comparación en tiempo constante.** Sobre el hash, con `timingSafeEqual`.
 *
 * El código es de 6 dígitos porque se tipea desde un mensaje; lo que compensa
 * ese espacio chico es el rate limit y la expiración, no el largo.
 */

/** 10 minutos, como pide el plan. */
export const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;

const CODE_DIGITS = 6;

export class LoginTokenError extends DomainError {
  constructor(code: MessageKey, params?: Params) {
    super(code, params);
    this.name = 'LoginTokenError';
  }
}

/**
 * Seis dígitos con aleatoriedad criptográfica y **sin sesgo**.
 *
 * `randomBytes % 1000000` parece equivalente y no lo es: los primeros valores
 * quedan levemente más probables. Se descarta y se vuelve a tirar en vez de
 * repartir mal el espacio, que es chico de por sí.
 */
export function generateLoginCode(): string {
  const limit = 10 ** CODE_DIGITS;
  const max = Math.floor(0xffffffff / limit) * limit;

  for (;;) {
    const value = randomBytes(4).readUInt32BE(0);
    if (value < max) return String(value % limit).padStart(CODE_DIGITS, '0');
  }
}

/** SHA-256 hex. Ver el comentario de la tabla: no hace falta bcrypt acá. */
export function hashLoginCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Emite un código para esta cuenta e invalida los anteriores.
 *
 * Devuelve el código **en claro una sola vez**: es lo único que se le manda a
 * la persona, y no vuelve a existir en ningún lado.
 */
export async function issueLoginToken(
  customerId: number,
  channel: MessageChannel,
  executor?: Executor,
): Promise<{ code: string; expiresAt: Date }> {
  const tx = executor ?? getDb();
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);

  // Invalidar primero: si esto fallara después de insertar, quedarían dos
  // códigos vivos, que es exactamente lo que la regla 4 evita.
  await tx
    .update(loginTokens)
    .set({ invalidatedAt: sql`NOW()` })
    .where(
      and(
        eq(loginTokens.customerId, customerId),
        isNull(loginTokens.consumedAt),
        isNull(loginTokens.invalidatedAt),
      ),
    );

  /**
   * Reintentar ante una colisión de hash.
   *
   * `token_hash` es UNIQUE sobre **toda la tabla**, y las filas no se borran
   * nunca (consumidas e invalidadas se conservan para poder reconstruir un
   * incidente). Con seis dígitos, el código nuevo que choca contra *cualquiera*
   * de los históricos rompe el INSERT — y el efecto es el peor posible: la
   * persona nunca recibe su código y no hay nada en pantalla que lo explique.
   *
   * La probabilidad crece con el uso: son N/1.000.000 por emisión, con N el
   * total histórico. Arranca en cero y a los diez mil logins ya es un 1%.
   *
   * La unicidad global **tiene** que quedarse: `consumeLoginToken` busca sólo
   * por hash, y dos filas con el mismo hash harían ambigua esa búsqueda. Lo
   * que se arregla es la reacción — tirar de nuevo, que es gratis.
   */
  for (let intento = 0; intento < 5; intento += 1) {
    const code = generateLoginCode();
    const tokenHash = hashLoginCode(code);

    try {
      await tx.insert(loginTokens).values({ customerId, tokenHash, channel, expiresAt });
      return { code, expiresAt };
    } catch (error) {
      if (!esColisionDeHash(error)) throw error;
    }
  }

  throw new LoginTokenError('error.cuenta.codigoNoPude');
}

export type ConsumedToken = { customerId: number };

/**
 * Canjea un código. Devuelve `null` en **cualquier** fallo, sin distinguir
 * cuál: no existe, ya se usó, venció, lo invalidó otro pedido, o la cuenta se
 * desactivó. Distinguirlos convertiría este formulario en un oráculo.
 *
 * El `UPDATE ... WHERE consumed_at IS NULL` es lo que hace el único uso real:
 * dos pestañas con el mismo código corren la misma sentencia y sólo una toca
 * una fila.
 */
export async function consumeLoginToken(code: string): Promise<ConsumedToken | null> {
  const candidate = code.trim();
  if (!/^\d{6}$/.test(candidate)) return null;

  const tokenHash = hashLoginCode(candidate);

  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: loginTokens.id,
        customerId: loginTokens.customerId,
        tokenHash: loginTokens.tokenHash,
        expiresAt: loginTokens.expiresAt,
        consumedAt: loginTokens.consumedAt,
        invalidatedAt: loginTokens.invalidatedAt,
      })
      .from(loginTokens)
      .where(eq(loginTokens.tokenHash, tokenHash))
      .limit(1)
      .for('update');

    const token = rows[0];
    if (!token) return null;

    // Sobre el hash y en tiempo constante. La consulta de arriba ya seleccionó
    // por igualdad —o sea que MySQL ya comparó—, pero la comparación explícita
    // es la que sobrevive a que alguien cambie ese WHERE por un LIKE o por una
    // búsqueda por prefijo.
    const esperado = Buffer.from(token.tokenHash, 'utf8');
    const recibido = Buffer.from(tokenHash, 'utf8');
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;

    if (token.consumedAt || token.invalidatedAt) return null;
    if (token.expiresAt.getTime() < Date.now()) return null;

    const active = await tx
      .select({ id: customers.id, isActive: customers.isActive })
      .from(customers)
      .where(eq(customers.id, token.customerId))
      .limit(1);
    if (!active[0]?.isActive) return null;

    // El UPDATE condicional es el candado real del "un solo uso".
    await tx
      .update(loginTokens)
      .set({ consumedAt: sql`NOW()` })
      .where(and(eq(loginTokens.id, token.id), isNull(loginTokens.consumedAt)));

    const confirmed = await tx
      .select({ consumedAt: loginTokens.consumedAt })
      .from(loginTokens)
      .where(eq(loginTokens.id, token.id))
      .limit(1);
    if (!confirmed[0]?.consumedAt) return null;

    /**
     * Entrar con un código que llegó al teléfono **prueba** que ese teléfono es
     * suyo, que es justo lo que faltaba en el PR E. A partir de acá `/cuenta`
     * puede mostrarle los pedidos viejos que hizo como invitada con ese
     * número: ya no es "alguien que tipeó un número", es su número.
     */
    await tx
      .update(customers)
      .set({ phoneVerifiedAt: sql`NOW()`, lastLoginAt: sql`NOW()` })
      .where(eq(customers.id, token.customerId));

    return { customerId: token.customerId };
  });
}

/** El INSERT chocó contra el UNIQUE de `token_hash` y no contra otra cosa. */
function esColisionDeHash(error: unknown): boolean {
  const code = (error as { code?: string; errno?: number } | null)?.code;
  const errno = (error as { errno?: number } | null)?.errno;
  return code === 'ER_DUP_ENTRY' || errno === 1062;
}

/** El texto que se manda. Corto: entra entero en la notificación del celular. */
export function loginCodeMessage(code: string): string {
  return `${code} es tu código para entrar. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.`;
}
