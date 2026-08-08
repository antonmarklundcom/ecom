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
 * Plantilla de la URL de checkout hospedado de Pagopar (PLAN.md 5.5).
 *
 * Sin default a propósito, mismo criterio que `PAGOPAR_BASE_URL`: no hay
 * acceso a la doc v2 vigente para confirmar el host correcto, y una URL "por
 * si acaso" manda al comprador a pagar al lugar equivocado. Se completa en
 * `.env` cuando se confirme contra la doc o el sandbox.
 */
export function pagoparCheckoutUrlTemplate(): string | null {
  const value = read("PAGOPAR_CHECKOUT_URL");
  return value === "" ? null : value;
}

/** El checkout sólo ofrece "Tarjeta" si además de las claves está la URL de pago. */
export function isPagoparCheckoutOfferable(): boolean {
  return isPagoparConfigured() && pagoparCheckoutUrlTemplate() !== null;
}
