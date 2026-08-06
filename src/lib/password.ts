import bcrypt from 'bcryptjs';

/** Coste de bcrypt. 12 ≈ 250 ms en el slot Node de Hostinger — suficiente. */
export const BCRYPT_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 10;

export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` };
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, reason: 'La contraseña debe combinar letras y números' };
  }
  return { ok: true };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Siempre corre un hash, incluso si el usuario no existe: comparar contra un
 * hash señuelo mantiene constante el tiempo de respuesta y evita que el login
 * sirva para enumerar cuentas.
 */
let dummyHash: string | undefined;

function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync('contraseña-inexistente', BCRYPT_ROUNDS);
  return dummyHash;
}

export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, getDummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}
