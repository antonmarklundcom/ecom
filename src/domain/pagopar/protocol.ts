import { z } from "zod";

import { assertGs, MoneyError } from "@/lib/money";

/**
 * El formato de cable de Pagopar, en un solo archivo.
 *
 * Todo lo que depende de cómo Pagopar arma sus JSON vive acá: el sobre de sus
 * respuestas, cómo viene el aviso de pago y —lo más delicado— **qué tenemos
 * que contestarle al webhook**.
 *
 * ⚠️ ARCH.md §4 avisa explícitamente que el sobre de la respuesta del webhook
 * cambió entre revisiones de la documentación, y que no hay que confiar en
 * ninguna forma recordada. Está todo concentrado en `webhookResponseBody()`
 * justamente para que confirmarlo contra la doc v2 vigente sea cambiar una
 * función y un test, no salir a buscar el JSON por todo el repo.
 * Ver `tests/integration/pagopar-sandbox.test.ts`.
 */

// ---------------------------------------------------------------------------
// Sobre de las respuestas DE Pagopar
// ---------------------------------------------------------------------------

/**
 * Las respuestas de la API 2.0 vienen envueltas así:
 *
 *   éxito: { "respuesta": true,  "resultado": [ { ... } ] }
 *   error: { "respuesta": false, "resultado": "mensaje de error" }
 */
export type PagoparEnvelope = {
  respuesta: boolean;
  resultado: unknown;
};

export class PagoparProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PagoparProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEnvelope(body: unknown): PagoparEnvelope {
  if (!isRecord(body) || typeof body.respuesta !== "boolean") {
    throw new PagoparProtocolError("la respuesta de Pagopar no trae `respuesta`");
  }
  return { respuesta: body.respuesta, resultado: body.resultado };
}

/**
 * Saca el `hash_pedido` de la respuesta de `iniciar-transaccion`.
 *
 * Según la revisión de la doc el hash viene como `data` o como `hash_pedido`;
 * aceptamos ambos y exigimos que sea un string no vacío. Lo que no hacemos es
 * inventar un default: sin hash no hay forma de reconocer después el webhook
 * de este pedido, así que es un error duro.
 */
export function extractHashPedido(envelope: PagoparEnvelope): string {
  if (!envelope.respuesta) {
    throw new PagoparProtocolError(
      typeof envelope.resultado === "string"
        ? `Pagopar rechazó la transacción: ${envelope.resultado}`
        : "Pagopar rechazó la transacción"
    );
  }

  const first = Array.isArray(envelope.resultado) ? envelope.resultado[0] : envelope.resultado;
  if (!isRecord(first)) {
    throw new PagoparProtocolError("`resultado` no trae el pedido");
  }

  for (const key of ["hash_pedido", "data"] as const) {
    const value = first[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }

  throw new PagoparProtocolError("no encontré `hash_pedido` en la respuesta");
}

// ---------------------------------------------------------------------------
// Montos que llegan de afuera
// ---------------------------------------------------------------------------

/**
 * Convierte a guaraníes enteros un monto que mandó Pagopar.
 *
 * Nada de `parseFloat`: el monto es lo que decide si un pedido se marca pagado
 * y un float que redondea mal es plata regalada. Se aceptan sólo dos formas:
 *
 *   "150000"     → 150000   (lo que mandamos nosotros)
 *   "150000.00"  → 150000   (algún serializador le puso céntimos)
 *
 * Cualquier otra cosa se rechaza, incluido `"150.000"`: en es-PY eso son
 * ciento cincuenta mil guaraníes y en formato inglés son ciento cincuenta, y
 * adivinar cuál de las dos es un error que sólo se descubre en la conciliación.
 * Rechazar hace ruido; adivinar, no.
 */
export function parseAmountPyg(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new MoneyError(`monto con decimales: ${value}`);
    }
    return assertGs(value, "monto");
  }

  if (typeof value !== "string") {
    throw new MoneyError(`monto de tipo inesperado: ${typeof value}`);
  }

  const text = value.trim();
  //                enteros           céntimos en cero
  const match = /^(\d+)(?:[.,]0{1,2})?$/.exec(text);
  if (!match?.[1]) {
    throw new MoneyError(`monto con un formato que no puedo leer sin adivinar: "${text}"`);
  }

  return assertGs(Number(match[1]), "monto");
}

// ---------------------------------------------------------------------------
// El aviso de pago que llega al webhook
// ---------------------------------------------------------------------------

/**
 * La forma interna, única, del aviso de pago.
 *
 * Todo lo que viene de afuera —JSON con sobre o sin sobre, form-encoded, con
 * BOM, con números como strings— termina acá o en un `PagoparProtocolError`.
 * Lo que sigue (firma, idempotencia, monto, transición) no ve nunca el cable.
 */
export type PagoparWebhookEvent = {
  hashPedido: string;
  pagado: boolean;
  montoPyg: number;
  /**
   * El pedido tal cual llegó **sin `token`** — se guarda en
   * `payment_events.payload` y `payments.raw_payload`. El token autentica avisos
   * de ese `hash_pedido` (y no cubre `pagado`), así que no se guarda: quien lea
   * un backup no tiene que poder firmar un "pagado" para ese pedido.
   */
  raw: Record<string, unknown>;
  /**
   * El token si vino adentro del pedido (`token`), además o en vez del
   * querystring. Sólo lo usa el guard de la ruta: nunca se loguea ni se guarda.
   */
  bodyToken?: string;
  /** El pedido exactamente como llegó, token incluido: es lo que se devuelve. */
  received?: Record<string, unknown>;
};

/**
 * Tope del cuerpo del aviso. Un aviso de Pagopar es un pedido con un puñado de
 * campos; 64 KiB es holgadísimo y evita que una ruta pública lea cualquier
 * cosa a memoria antes de verificar la firma (que depende del cuerpo).
 */
export const WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

/**
 * Lee el cuerpo del aviso sin suponer el formato.
 *
 * Nunca usa `request.json()` directo: un BOM, un `content-type` mentiroso o un
 * form-encoded harían tirar ahí y el aviso se perdería sin explicación. Todo
 * error sale como `PagoparProtocolError` — la ruta lo contesta 400 y no toca
 * nada.
 */
export async function readWebhookBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > WEBHOOK_MAX_BODY_BYTES) {
    throw new PagoparProtocolError("el aviso es demasiado grande");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new PagoparProtocolError("no pude leer el cuerpo del aviso");
  }

  if (Buffer.byteLength(text, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    throw new PagoparProtocolError("el aviso es demasiado grande");
  }

  return decodeWebhookText(text, request.headers.get("content-type"));
}

/**
 * Texto crudo → valor JSON.
 *
 *   - se sacan el BOM y los espacios de las puntas,
 *   - si parece JSON (`{` o `[`) se parsea como JSON, diga lo que diga el
 *     `content-type`,
 *   - si no, y es `application/x-www-form-urlencoded` o tiene pinta de
 *     `clave=valor&...`, se arma un objeto con los campos. Un valor que a su vez
 *     es JSON (`resultado=[{...}]`) se parsea; y si el form trae **un solo**
 *     campo con JSON adentro, ese JSON es el cuerpo (no adivinamos el nombre
 *     del campo: no hay ninguno documentado).
 */
export function decodeWebhookText(text: string, contentType: string | null = null): unknown {
  const body = text.replace(/^﻿/, "").trim();
  if (body === "") throw new PagoparProtocolError("el aviso llegó vacío");

  if (looksLikeJson(body)) {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new PagoparProtocolError("el aviso no es JSON válido");
    }
  }

  const isForm = (contentType ?? "").toLowerCase().includes("application/x-www-form-urlencoded");
  if (!isForm && !/^[^=&\s]+=/.test(body)) {
    throw new PagoparProtocolError("el aviso no es JSON ni un formulario");
  }

  const params = new URLSearchParams(body);
  const fields: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (key in fields) {
      // Dos valores para el mismo campo: elegir uno es adivinar.
      throw new PagoparProtocolError("el formulario repite un campo");
    }
    fields[key] = maybeJson(value);
  }

  const keys = Object.keys(fields);
  if (keys.length === 0) throw new PagoparProtocolError("el formulario llegó vacío");
  if (keys.length === 1) {
    const only = fields[keys[0] as string];
    if (typeof only === "object" && only !== null) return only;
  }
  return fields;
}

function looksLikeJson(text: string): boolean {
  return text.startsWith("{") || text.startsWith("[");
}

/** Un string que es JSON (objeto o lista) se parsea; cualquier otro queda igual. */
function maybeJson(value: string): unknown {
  const text = value.replace(/^﻿/, "").trim();
  if (!looksLikeJson(text)) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

/**
 * Esquema del pedido adentro del aviso. `looseObject`: los campos que no
 * conocemos pasan (y quedan en `raw`) en vez de hacer fallar el aviso — que
 * Pagopar agregue un campo no puede dejarnos sin cobrar.
 *
 * Los mensajes de error son fijos y no repiten valores: la ruta los loguea, y
 * el cuerpo trae datos del comprador.
 */
const pedidoSchema = z.looseObject({
  hash_pedido: z
    .string({ error: "el aviso no trae `hash_pedido`" })
    .trim()
    .min(1, { error: "el aviso no trae `hash_pedido`" }),
  monto: z.unknown().refine((value) => value !== undefined, {
    error: "el aviso no trae `monto`",
  }),
  pagado: z.unknown(),
});

/**
 * Pagopar postea el pedido envuelto en `resultado`, igual que sus respuestas.
 * Se acepta también:
 *
 *   - el objeto pelado y la lista pelada,
 *   - `resultado` como objeto en vez de lista, o como string con JSON adentro,
 *   - varios elementos en `resultado` **si son el mismo aviso** (mismo hash,
 *     mismo estado, mismo monto): un repetido dentro del mismo POST.
 *
 * Varios elementos que dicen cosas distintas se rechazan: el token del aviso
 * autentica un solo `hash_pedido`, y elegir uno de varios es adivinar con
 * plata. El 400 no cambia nada y queda en el log.
 */
export function parseWebhookEvent(body: unknown): PagoparWebhookEvent {
  const nodes = webhookOrderNodes(body);
  const events = nodes.map(parseOrderNode);

  const first = events[0];
  if (!first) throw new PagoparProtocolError("el aviso no trae el pedido");

  for (const other of events.slice(1)) {
    if (
      other.hashPedido !== first.hashPedido ||
      other.pagado !== first.pagado ||
      other.montoPyg !== first.montoPyg
    ) {
      throw new PagoparProtocolError("el aviso trae más de un pedido distinto");
    }
  }

  return first;
}

function parseOrderNode(pedido: Record<string, unknown>): PagoparWebhookEvent {
  const parsed = pedidoSchema.safeParse(pedido);
  if (!parsed.success) {
    throw new PagoparProtocolError(parsed.error.issues[0]?.message ?? "aviso ilegible");
  }

  let montoPyg: number;
  try {
    montoPyg = parseAmountPyg(parsed.data.monto);
  } catch (error) {
    // El mensaje de MoneyError repite el valor: no sale de acá.
    if (error instanceof MoneyError) throw new PagoparProtocolError("`monto` ilegible");
    throw error;
  }

  const { token, ...rest } = pedido;
  const bodyToken = typeof token === "string" && token.trim() !== "" ? token.trim() : undefined;

  return {
    hashPedido: parsed.data.hash_pedido,
    pagado: parseBoolean(parsed.data.pagado),
    montoPyg,
    raw: rest,
    ...(bodyToken ? { bodyToken } : {}),
    received: pedido,
  };
}

function webhookOrderNodes(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return recordsOf(body, "el aviso llegó como una lista vacía");

  if (!isRecord(body)) {
    throw new PagoparProtocolError("el aviso no es un objeto JSON");
  }

  if ("resultado" in body) {
    let resultado = body.resultado;
    if (typeof resultado === "string") resultado = maybeJson(resultado);
    if (Array.isArray(resultado)) return recordsOf(resultado, "`resultado` no trae el pedido");
    if (isRecord(resultado)) return [resultado];
    throw new PagoparProtocolError("`resultado` no trae el pedido");
  }

  return [body];
}

function recordsOf(list: unknown[], emptyMessage: string): Record<string, unknown>[] {
  if (list.length === 0) throw new PagoparProtocolError(emptyMessage);
  if (!list.every(isRecord)) {
    throw new PagoparProtocolError("el aviso trae elementos que no son pedidos");
  }
  return list;
}

/**
 * `pagado` llega como booleano, como `"1"`/`"0"` o como `"true"`/`"false"`
 * según por dónde pase el JSON. Lo que **no** hacemos es tratar cualquier
 * string no vacío como verdadero: `"false"` es un string no vacío, y con esa
 * regla un aviso de pago fallido marcaría el pedido como cobrado.
 */
function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["1", "true", "si", "sí"].includes(text)) return true;
    if (["0", "false", "no", ""].includes(text)) return false;
  }
  if (value === undefined || value === null) return false;
  throw new PagoparProtocolError("no puedo interpretar `pagado`");
}

// ---------------------------------------------------------------------------
// Lo que le contestamos al webhook  ← el punto delicado
// ---------------------------------------------------------------------------

/**
 * Cuerpo de la respuesta al webhook.
 *
 * ⚠️ **Sin confirmar contra la doc v2 vigente.** ARCH.md §4 dice que este sobre
 * cambió entre revisiones y que no hay que confiar en ninguna forma recordada;
 * al escribir esto no había credenciales de sandbox ni acceso de red a la
 * documentación de Pagopar, así que quedó fijado lo único que sí está
 * documentado: el sobre `{respuesta, resultado}` que usa toda la API 2.0, con
 * el pedido recibido devuelto tal cual para que Pagopar pueda compararlo.
 *
 * La revisión de 2026-11 (ARCH.md §4.2) tampoco pudo leer la doc oficial
 * (los hosts de Pagopar no resolvían desde la sesión). La alternativa que hay
 * que descartar en el primer aviso real es **devolver sólo la lista
 * `resultado`** (`[ {...pedido} ]`, sin `respuesta`): es lo que hacen
 * integraciones de terceros según fuentes secundarias. Sin confirmar, no se
 * cambia: se deja escrito para que la persona que mire el primer aviso sepa
 * qué comparar (TASKS.md §21).
 *
 * Antes de cobrar de verdad: correr `tests/integration/pagopar-sandbox.test.ts`
 * con credenciales y ajustar **esta función** (y su test) si difiere. Es el
 * único lugar del repo que decide la forma de la respuesta.
 */
export function webhookResponseBody(event: PagoparWebhookEvent): PagoparEnvelope {
  // `received` y no `raw`: se le devuelve a Pagopar su propio pedido tal cual,
  // token incluido (si vino en el cuerpo), por si lo compara campo a campo.
  return { respuesta: true, resultado: [event.received ?? event.raw] };
}

/**
 * ¿Se confirmó el sobre de arriba contra la doc v2 vigente y el sandbox?
 *
 * Es una constante y no una variable de entorno a propósito: confirmarlo es un
 * hecho sobre **el código**, no sobre el servidor donde corre. Cuando alguien
 * corra el test de sandbox con credenciales y verifique la forma, cambia este
 * `false` por `true` en el mismo commit en que ajusta `webhookResponseBody()`.
 *
 * `pnpm preflight` la lee y se niega a dar el visto bueno mientras siga en
 * `false`: es lo último que separa a la tienda de poder cobrar de verdad.
 */
export const WEBHOOK_ENVELOPE_CONFIRMED = false;

/** Errores, con el mismo sobre que usa Pagopar para los suyos. */
export function webhookErrorBody(code: string): PagoparEnvelope {
  return { respuesta: false, resultado: code };
}
