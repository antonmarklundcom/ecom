/**
 * Utilidades específicas de Paraguay: RUC/CI, teléfonos, WhatsApp, fechas.
 */

export const PY_TIMEZONE = 'America/Asuncion';

/** RUC genérico de consumidor final (DNIT). */
export const CONSUMIDOR_FINAL_RUC = '44444401-7';

// ---------------------------------------------------------------------------
// RUC / CI
// ---------------------------------------------------------------------------

/**
 * Dígito verificador módulo 11 sobre la base del RUC.
 * Multiplicadores 2..11 desde el dígito menos significativo.
 */
export function rucCheckDigit(base: string): number {
  const digits = base.replace(/\D/g, '');
  if (digits.length === 0) {
    throw new Error('La base del RUC no tiene dígitos');
  }
  let total = 0;
  let k = 2;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    total += Number(digits[i]) * k;
    k = k === 11 ? 2 : k + 1;
  }
  const rest = total % 11;
  return rest > 1 ? 11 - rest : 0;
}

/** `"80012345"` → `"80012345-2"`. Acepta la base con o sin DV pegado. */
export function formatRuc(base: string): string {
  const digits = base.replace(/\D/g, '');
  return `${digits}-${rucCheckDigit(digits)}`;
}

/**
 * Valida `12345678-9`. También acepta `123456789` (DV pegado) y espacios.
 * Devuelve el RUC normalizado con guion cuando es válido.
 */
export function validateRuc(input: string): { ok: boolean; normalized?: string; reason?: string } {
  const raw = (input ?? '').trim();
  if (raw === '') return { ok: false, reason: 'vacío' };

  const cleaned = raw.replace(/[.\s]/g, '');
  if (!/^\d{3,10}-?\d$/.test(cleaned)) {
    return { ok: false, reason: 'formato inválido' };
  }
  const digits = cleaned.replace(/-/g, '');
  const base = digits.slice(0, -1);
  const dv = Number(digits.slice(-1));

  if (rucCheckDigit(base) !== dv) {
    return { ok: false, reason: 'dígito verificador incorrecto' };
  }
  return { ok: true, normalized: `${base}-${dv}` };
}

export function isConsumidorFinalRuc(input: string): boolean {
  const result = validateRuc(input);
  return result.ok && result.normalized === CONSUMIDOR_FINAL_RUC;
}

/**
 * Cédula de identidad: sólo dígitos, 5 a 8. La CI **no** lleva DV — el DV
 * aparece recién cuando esa CI se usa como base de un RUC de persona física.
 */
export function validateCi(input: string): { ok: boolean; normalized?: string; reason?: string } {
  const digits = (input ?? '').replace(/[.\s-]/g, '');
  if (!/^\d{5,8}$/.test(digits)) {
    return { ok: false, reason: 'la CI debe tener entre 5 y 8 dígitos' };
  }
  return { ok: true, normalized: digits };
}

/** RUC de persona física a partir de la CI: `"1234567"` → `"1234567-4"`. */
export function rucFromCi(ci: string): string {
  const result = validateCi(ci);
  if (!result.ok || !result.normalized) {
    throw new Error(`CI inválida: ${ci}`);
  }
  return formatRuc(result.normalized);
}

export function validateDoc(
  docType: 'RUC' | 'CI' | 'NINGUNO',
  docNumber: string | null | undefined,
): { ok: boolean; normalized?: string | null; reason?: string } {
  if (docType === 'NINGUNO') {
    return { ok: true, normalized: null };
  }
  if (!docNumber) return { ok: false, reason: 'falta el número de documento' };
  return docType === 'RUC' ? validateRuc(docNumber) : validateCi(docNumber);
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

const PY_COUNTRY_CODE = '595';

/**
 * `normalizePhonePY("0981 123 456")` → `"+595981123456"`.
 *
 * Acepta `0981...`, `981...`, `595981...`, `+595 981...`, con espacios,
 * guiones o paréntesis. Devuelve `null` si no parece un número paraguayo.
 */
export function normalizePhonePY(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  digits = digits.startsWith('+') ? digits.slice(1) : digits;
  if (digits === '') return null;

  if (digits.startsWith('00595')) digits = digits.slice(2);
  if (digits.startsWith(PY_COUNTRY_CODE)) digits = digits.slice(PY_COUNTRY_CODE.length);
  // Nacional: 0981..., 021... — el 0 es prefijo de marcación, no parte del número.
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');

  // Móviles: 9XX + 6 dígitos. Fijos: código de área (2–3) + 6–7 dígitos.
  if (!/^\d{8,9}$/.test(digits)) return null;

  return `+${PY_COUNTRY_CODE}${digits}`;
}

export function isMobilePY(phone: string): boolean {
  const normalized = normalizePhonePY(phone);
  return normalized !== null && /^\+5959\d{8}$/.test(normalized);
}

/** `"+595981123456"` → `"(0981) 123-456"` para mostrar. */
export function formatPhonePY(phone: string): string {
  const normalized = normalizePhonePY(phone);
  if (!normalized) return phone;
  const national = normalized.slice(4);
  if (/^9\d{8}$/.test(national)) {
    return `(0${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return `(0${national.slice(0, 2)}) ${national.slice(2)}`;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/** Los deeplinks largos se truncan en iOS; nos quedamos bien por debajo. */
export const WA_TEXT_LIMIT = 1500;

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneError';
  }
}

/**
 * `waLink("0981123456", "Hola")` → `"https://wa.me/595981123456?text=Hola"`.
 * El texto se recorta a `limit` caracteres (con `…`) antes de codificarse.
 */
export function waLink(phone: string, text = '', limit: number = WA_TEXT_LIMIT): string {
  const normalized = normalizePhonePY(phone);
  if (!normalized) {
    throw new PhoneError(`Número de WhatsApp inválido: ${phone}`);
  }
  const target = normalized.slice(1); // wa.me no lleva el "+"
  const trimmed = text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  return trimmed === ''
    ? `https://wa.me/${target}`
    : `https://wa.me/${target}?text=${encodeURIComponent(trimmed)}`;
}

// ---------------------------------------------------------------------------
// Fechas — dd/mm/yyyy, America/Asuncion
// ---------------------------------------------------------------------------

const DATE_FMT = new Intl.DateTimeFormat('es-PY', {
  timeZone: PY_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_TIME_FMT = new Intl.DateTimeFormat('es-PY', {
  timeZone: PY_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDatePY(date: Date): string {
  return DATE_FMT.format(date).replace(/\//g, '/');
}

export function formatDateTimePY(date: Date): string {
  return DATE_TIME_FMT.format(date).replace(', ', ' ');
}
