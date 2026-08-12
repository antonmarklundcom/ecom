/**
 * Rate limit en memoria, ventana deslizante.
 *
 * Alcanza para el slot único de Node de Hostinger, que es donde corre esto.
 * Con más de una instancia hay que moverlo a la DB o a Redis: cada proceso
 * tiene su propio contador y el límite efectivo se multiplica. Está acá
 * aislado justamente para que ese cambio sea de un archivo.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** Cada tanto se limpia lo vencido para que el Map no crezca para siempre. */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Segundos hasta que se libere un intento. */
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now: number = Date.now()
): RateLimitResult {
  sweep(now, options.windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  const windowStart = now - options.windowMs;
  const hits = bucket.hits.filter((time) => time > windowStart);

  if (hits.length >= options.limit) {
    buckets.set(key, { hits });
    const oldest = hits[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return { ok: true, remaining: options.limit - hits.length, retryAfterSeconds: 0 };
}

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const alive = bucket.hits.filter((time) => time > now - windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, { hits: alive });
  }
}

/** Sólo para tests. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/**
 * Borra el contador de una clave. Se usa después de un login exitoso: el que
 * probó tres contraseñas y acertó no tiene por qué quedar a un intento del
 * bloqueo.
 */
export function resetRateLimitKey(key: string): void {
  buckets.delete(key);
}

/**
 * IP del cliente detrás del proxy de Hostinger.
 *
 * `x-forwarded-for` lo pone el proxy y puede venir con varias IPs: la del
 * cliente es la primera. Es un header, o sea que es falsificable — para un
 * límite anti-fuerza-bruta alcanza, pero no sirve como identidad.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "desconocida";
}

/**
 * Límite del formulario "buscar mi pedido" (PLAN.md 3.9).
 *
 * Viven acá y no en la server action porque un módulo `"use server"` sólo
 * puede exportar funciones async: exportar una constante deja el módulo sin
 * exports y el build falla con "has no exports at all".
 */
export const LOOKUP_LIMIT = 5;
export const LOOKUP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Límite del login del panel (PLAN.md 4.1).
 *
 * Más apretado que el de "buscar mi pedido": del otro lado hay una contraseña
 * que abre todos los pedidos del comercio, y el dueño es una sola persona que
 * entra una vez por día. Se aplica por IP **y** por email, porque el atacante
 * puede rotar cualquiera de los dos por separado.
 */
export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Límite del cron: la ruta es pública y compara un secreto, así que sin esto
 * es un oráculo para adivinarlo a fuerza de intentos.
 */
export const CRON_LIMIT = 30;
export const CRON_WINDOW_MS = 60 * 1000;

/**
 * Límite del webhook de Pagopar (PLAN.md 5.2).
 *
 * Más holgado que el resto y a propósito: del otro lado hay avisos de pago
 * reales, y tirar uno cuesta un pedido cobrado que la tienda no marca. Alcanza
 * para que nadie use la ruta como oráculo de firmas —cada intento necesita un
 * sha1 acertado— sin castigar un sábado con muchas ventas. Pagopar reintenta
 * ante un 429, así que un aviso legítimo que caiga acá vuelve.
 */
export const PAGOPAR_WEBHOOK_LIMIT = 120;
export const PAGOPAR_WEBHOOK_WINDOW_MS = 60 * 1000;

/**
 * Límite del checkout.
 *
 * No es contra el fraude con tarjeta —de eso se ocupa Pagopar— sino contra el
 * agotamiento de stock: cada pedido creado reserva unidades por 45 minutos o
 * 24 horas, y nadie tiene que pagar nada para crearlo. Sin límite, un script
 * deja la vidriera entera en "sin stock" con un rato de pedidos que nunca se
 * van a pagar, y el comercio no vende hasta que venzan.
 *
 * Holgado en serio: una familia detrás de un mismo NAT, o un comprador que
 * corrige el formulario cinco veces, tienen que pasar sin fricción. Lo que se
 * corta es el volumen que sólo puede ser automático.
 */
export const CHECKOUT_LIMIT = 20;
export const CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
