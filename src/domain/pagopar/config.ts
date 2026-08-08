/**
 * Configuración de Pagopar, leída del entorno del servidor.
 *
 * Ninguna de estas variables lleva `NEXT_PUBLIC_`: `PAGOPAR_PRIVATE_KEY` firma
 * el token de cada petición y el guard del webhook. Si se filtra, cualquiera
 * puede iniciar transacciones a nombre del comercio **y** falsificar avisos de
 * pago. Nunca se loguea, ni entera ni truncada.
 *
 * `PAGOPAR_BASE_URL` no tiene default a propósito. Poner una URL "por si
 * acaso" es la forma de mandarle los datos del comercio a un host equivocado:
 * el valor sale de la doc de Pagopar y se configura en el `.env`, no acá.
 */

export type PagoparConfig = {
  publicKey: string;
  privateKey: string;
  /** Sin barra final. */
  baseUrl: string;
};

export class PagoparNotConfiguredError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Faltan variables de Pagopar: ${missing.join(", ")}`);
    this.name = "PagoparNotConfiguredError";
  }
}

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Config completa — la necesita el cliente que llama a la API.
 *
 * Tira si falta algo: preferimos un checkout que no arranca a uno que arranca
 * y deja pedidos colgados esperando un pago que nunca se pudo iniciar.
 */
export function pagoparConfig(): PagoparConfig {
  const publicKey = read("PAGOPAR_PUBLIC_KEY");
  const privateKey = read("PAGOPAR_PRIVATE_KEY");
  const baseUrl = read("PAGOPAR_BASE_URL").replace(/\/+$/, "");

  const missing: string[] = [];
  if (publicKey === "") missing.push("PAGOPAR_PUBLIC_KEY");
  if (privateKey === "") missing.push("PAGOPAR_PRIVATE_KEY");
  if (baseUrl === "") missing.push("PAGOPAR_BASE_URL");
  if (missing.length > 0) throw new PagoparNotConfiguredError(missing);

  return { publicKey, privateKey, baseUrl };
}

/**
 * Sólo la clave privada.
 *
 * El webhook no necesita ni la pública ni la URL base: sólo verifica una firma.
 * Que pueda seguir validando aunque falte el resto de la config es deseable —
 * un pago que ya ocurrió tiene que poder confirmarse.
 */
export function pagoparPrivateKey(): string | null {
  const privateKey = read("PAGOPAR_PRIVATE_KEY");
  return privateKey === "" ? null : privateKey;
}

/** Para que el checkout pueda ofrecer o no el método "tarjeta". */
export function isPagoparConfigured(): boolean {
  try {
    pagoparConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * URL de la página de pago alojada por Pagopar para un `hash_pedido` dado.
 *
 * ⚠️ Igual que `webhookResponseBody()` en `protocol.ts`: no hay acceso a la
 * doc v2 vigente para confirmar si la página de pago vive en el mismo host
 * que la API (`PAGOPAR_BASE_URL`) bajo `/pagos/{hash_pedido}` — el patrón
 * público más común de Pagopar — o en un host de checkout separado. Se usa
 * `PAGOPAR_BASE_URL` por ser lo único configurado; confirmar contra la doc
 * y el sandbox antes de cobrar de verdad, y ajustar sólo esta función si el
 * host difiere.
 */
export function pagoparCheckoutUrl(hashPedido: string, config: PagoparConfig = pagoparConfig()): string {
  return `${config.baseUrl}/pagos/${encodeURIComponent(hashPedido)}`;
}
