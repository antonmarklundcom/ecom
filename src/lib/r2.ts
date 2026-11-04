import { randomBytes } from "node:crypto";

import { AwsClient } from "aws4fetch";

import { normalizarBasePublica } from "./imagenes-r2";
import { safeError } from "./safe-error";
import { integracion } from "./integraciones";

/**
 * El cliente de Cloudflare R2, por su **API compatible con S3** sobre HTTPS
 * (firma SigV4 con `aws4fetch`). Es lo único de la tienda que habla con el
 * bucket: fotos públicas (`p1/`), comprobantes privados (`comprobantes/`) y
 * copias de seguridad privadas (`backups/`).
 *
 * Las credenciales salen **sólo** de `src/lib/integraciones.ts` (panel >
 * entorno > apagado). Importar este archivo nunca falla: sin credenciales,
 * falla el uso (`clienteR2()` tira `R2NoConfiguradoError` con un mensaje que
 * dice dónde cargarlas), que es lo único que de verdad las necesita.
 *
 * Ningún mensaje de error lleva el secret ni la firma: sólo el método, la
 * clave del objeto, el status y el `<Code>` que devuelve R2.
 *
 * ### Público y privado en el mismo bucket
 *
 * Un bucket con dominio público sirve **cualquier** clave. Por eso:
 *
 * 1. Las claves privadas llevan un componente aleatorio de 128 bits
 *    (`clavePrivada()`): no se adivinan.
 * 2. El dominio público tiene que bloquear `/comprobantes/*` y `/backups/*`
 *    (regla WAF de Cloudflare, DEPLOY.md). `pnpm preflight` lo verifica
 *    escribiendo un canario privado y pidiéndolo por la URL pública.
 */

export const PREFIJO_PUBLICO = "p1/";
export const PREFIJO_COMPROBANTES = "comprobantes/";
export const PREFIJO_BACKUPS = "backups/";
/** Los prefijos que el dominio público **no** puede servir. */
export const PREFIJOS_PRIVADOS = [PREFIJO_COMPROBANTES, PREFIJO_BACKUPS] as const;

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** La base pública ya normalizada, o `null` (las fotos no se ven). */
  publicUrl: string | null;
};

export class R2NoConfiguradoError extends Error {
  constructor(readonly faltan: readonly string[]) {
    super(
      `Falta configurar R2 (${faltan.join(" / ")}). ` +
        "Cargalo en /admin/integraciones, o en el entorno — ver docs/ENV-OPCIONAL.md."
    );
    this.name = "R2NoConfiguradoError";
  }
}

export class R2Error extends Error {
  constructor(
    readonly operacion: string,
    readonly status: number | null,
    readonly codigo: string | null
  ) {
    super(
      `R2 ${operacion}: ${status === null ? "sin respuesta" : `HTTP ${status}`}${codigo ? ` (${codigo})` : ""}`
    );
    this.name = "R2Error";
  }
}

const ACCOUNT_RE = /^[a-f0-9]{32}$/;
const BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * La config efectiva y qué falta. Pura sobre lo que devuelve `integracion()`.
 * Un Account ID o un bucket con forma imposible cuentan como faltantes: armar
 * un endpoint con eso sería mandar la firma a un host que no es R2.
 */
export function leerConfigR2(): { config: R2Config | null; faltan: string[] } {
  const { valores } = integracion("r2");
  const faltan: string[] = [];
  if (!valores.accountId || !ACCOUNT_RE.test(valores.accountId)) faltan.push("R2_ACCOUNT_ID");
  if (!valores.accessKeyId) faltan.push("R2_ACCESS_KEY_ID");
  if (!valores.secretAccessKey) faltan.push("R2_SECRET_ACCESS_KEY");
  if (!valores.bucket || !BUCKET_RE.test(valores.bucket)) faltan.push("R2_BUCKET");
  const publicUrl = normalizarBasePublica(valores.publicUrl);
  if (!publicUrl) faltan.push("R2_PUBLIC_URL");
  if (faltan.length > 0 && faltan.some((f) => f !== "R2_PUBLIC_URL")) {
    return { config: null, faltan };
  }
  return {
    config: {
      accountId: valores.accountId!,
      accessKeyId: valores.accessKeyId!,
      secretAccessKey: valores.secretAccessKey!,
      bucket: valores.bucket!,
      publicUrl,
    },
    faltan,
  };
}

/**
 * ¿Está R2 entero? Las cinco cosas: sin la base pública se podría subir, pero
 * las fotos no se verían en ningún lado, y eso es peor que no dejar subir.
 * Sin llamar a nada que tire: es una pregunta, no un uso.
 */
export function r2Configurado(): boolean {
  return leerConfigR2().faltan.length === 0;
}

type Fetch = typeof fetch;

export type ObjetoListado = { key: string; size: number; lastModified: Date | null };

export type ClienteR2 = {
  readonly bucket: string;
  readonly publicUrl: string | null;
  /**
   * Escribe un objeto. `soloSiNoExiste` manda `If-None-Match: *`: R2 contesta
   * 412 si la clave ya existe, y eso cuenta como éxito (`yaExistia`) porque
   * las claves llevan el hash del contenido — lo que está es lo mismo.
   */
  put(
    key: string,
    body: Uint8Array,
    opciones: { contentType: string; cacheControl?: string; soloSiNoExiste?: boolean }
  ): Promise<{ yaExistia: boolean }>;
  /** Los bytes del objeto, o `null` si no existe. */
  get(key: string, opciones?: { maxBytes?: number }): Promise<Uint8Array | null>;
  /** ¿Existe? (HEAD). */
  head(key: string): Promise<{ existe: boolean; bytes: number | null }>;
  delete(key: string): Promise<void>;
  /** Una página de ListObjectsV2. */
  list(
    prefix: string,
    continuationToken?: string
  ): Promise<{ objetos: ObjetoListado[]; siguiente: string | null }>;
  /** Todas las páginas. Para la retención de backups: decenas de objetos, no miles. */
  listarTodo(prefix: string): Promise<ObjetoListado[]>;
  /** URL GET prefirmada (SigV4 en la query) que vence en `segundos`. */
  urlFirmada(key: string, segundos: number): Promise<string>;
};

const TIMEOUT_MS = 30_000;
const REINTENTOS = 2;

function reintentable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Cada segmento de la clave, codificado: nuestras claves son ASCII simple, pero por las dudas. */
function rutaDe(key: string): string {
  if (key === "" || key.startsWith("/") || key.includes("..") || key.length > 1024) {
    throw new Error("Clave de objeto inválida");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Lo que se dice de una clave en un error: el prefijo y el nombre final, sin
 * el componente aleatorio de una clave privada (que es lo que la protege).
 */
function etiqueta(key: string): string {
  const partes = key.split("/");
  return partes.length <= 2 ? key : `${partes[0]}/…/${partes.at(-1)}`;
}

function codigoDelXml(cuerpo: string): string | null {
  const match = /<Code>([^<]{1,80})<\/Code>/.exec(cuerpo);
  return match ? match[1]! : null;
}

function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parseo mínimo de ListObjectsV2: sólo lo que usamos. */
export function parsearListado(xml: string): { objetos: ObjetoListado[]; siguiente: string | null } {
  const objetos: ObjetoListado[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const bloque = match[1]!;
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(bloque)?.[1];
    if (key === undefined) continue;
    const size = Number(/<Size>(\d+)<\/Size>/.exec(bloque)?.[1] ?? "0");
    const fecha = /<LastModified>([^<]+)<\/LastModified>/.exec(bloque)?.[1];
    const lastModified = fecha ? new Date(fecha) : null;
    objetos.push({
      key: desescaparXml(key),
      size,
      lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null,
    });
  }
  const truncado = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objetos, siguiente: truncado && token ? desescaparXml(token) : null };
}

/**
 * Un cliente para una config dada. `fetchImpl` y `datetime` existen para los
 * tests: firmar es determinístico con la fecha fija, y nada sale a la red.
 */
export function crearClienteR2(
  config: R2Config,
  opciones: { fetchImpl?: Fetch; datetime?: string; timeoutMs?: number } = {}
): ClienteR2 {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    retries: 0,
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const awsExtra = opciones.datetime ? { datetime: opciones.datetime } : {};

  async function pedir(
    operacion: string,
    url: string,
    init: RequestInit,
    aceptar: (status: number) => boolean
  ): Promise<Response> {
    for (let intento = 0; ; intento++) {
      let status: number | null = null;
      try {
        const firmado = await aws.sign(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          aws: awsExtra,
        });
        const respuesta = await fetchImpl(firmado, { redirect: "error" });
        status = respuesta.status;
        if (aceptar(respuesta.status)) return respuesta;
        const cuerpo = await respuesta.text().catch(() => "");
        if (!reintentable(respuesta.status) || intento >= REINTENTOS) {
          throw new R2Error(operacion, respuesta.status, codigoDelXml(cuerpo));
        }
      } catch (error) {
        if (error instanceof R2Error) throw error;
        if (intento >= REINTENTOS) throw new R2Error(operacion, status, "RED");
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** intento));
    }
  }

  const cliente: ClienteR2 = {
    bucket: config.bucket,
    publicUrl: config.publicUrl,

    async put(key, body, { contentType, cacheControl, soloSiNoExiste }) {
      // Sin `Content-Length` a mano: fetch lo pone solo con un body de bytes.
      const headers: Record<string, string> = { "Content-Type": contentType };
      if (cacheControl) headers["Cache-Control"] = cacheControl;
      if (soloSiNoExiste) headers["If-None-Match"] = "*";
      const respuesta = await pedir(
        `PUT ${etiqueta(key)}`,
        `${endpoint}/${rutaDe(key)}`,
        { method: "PUT", body: body as BodyInit, headers },
        (status) => (status >= 200 && status < 300) || (soloSiNoExiste === true && status === 412)
      );
      await respuesta.body?.cancel().catch(() => {});
      return { yaExistia: respuesta.status === 412 };
    },

    async get(key, { maxBytes } = {}) {
      const respuesta = await pedir(
        `GET ${etiqueta(key)}`,
        `${endpoint}/${rutaDe(key)}`,
        { method: "GET" },
        (status) => (status >= 200 && status < 300) || status === 404
      );
      if (respuesta.status === 404) {
        await respuesta.body?.cancel().catch(() => {});
        return null;
      }
      const bytes = new Uint8Array(await respuesta.arrayBuffer());
      if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
        throw new R2Error(`GET ${etiqueta(key)}`, respuesta.status, "DEMASIADO_GRANDE");
      }
      return bytes;
    },

    async head(key) {
      const respuesta = await pedir(
        `HEAD ${etiqueta(key)}`,
        `${endpoint}/${rutaDe(key)}`,
        { method: "HEAD" },
        (status) => (status >= 200 && status < 300) || status === 404
      );
      await respuesta.body?.cancel().catch(() => {});
      if (respuesta.status === 404) return { existe: false, bytes: null };
      const largo = Number(respuesta.headers.get("content-length"));
      return { existe: true, bytes: Number.isFinite(largo) ? largo : null };
    },

    async delete(key) {
      const respuesta = await pedir(
        `DELETE ${etiqueta(key)}`,
        `${endpoint}/${rutaDe(key)}`,
        { method: "DELETE" },
        (status) => (status >= 200 && status < 300) || status === 404
      );
      await respuesta.body?.cancel().catch(() => {});
    },

    async list(prefix, continuationToken) {
      const url = new URL(endpoint);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("max-keys", "1000");
      if (continuationToken) url.searchParams.set("continuation-token", continuationToken);
      const respuesta = await pedir(
        `LIST ${prefix}`,
        url.toString(),
        { method: "GET" },
        (status) => status >= 200 && status < 300
      );
      return parsearListado(await respuesta.text());
    },

    async listarTodo(prefix) {
      const todos: ObjetoListado[] = [];
      let token: string | undefined;
      for (let pagina = 0; pagina < 100; pagina++) {
        const { objetos, siguiente } = await cliente.list(prefix, token);
        todos.push(...objetos);
        if (!siguiente) return todos;
        token = siguiente;
      }
      throw new R2Error(`LIST ${prefix}`, null, "DEMASIADAS_PAGINAS");
    },

    async urlFirmada(key, segundos) {
      if (!Number.isInteger(segundos) || segundos < 1 || segundos > 3600) {
        throw new Error("La URL firmada tiene que vencer entre 1 segundo y 1 hora");
      }
      const url = new URL(`${endpoint}/${rutaDe(key)}`);
      url.searchParams.set("X-Amz-Expires", String(segundos));
      const firmado = await aws.sign(url.toString(), {
        method: "GET",
        aws: { ...awsExtra, signQuery: true },
      });
      return firmado.url;
    },
  };
  return cliente;
}

/** El cliente con la config efectiva. Tira `R2NoConfiguradoError` si falta algo. */
export function clienteR2(opciones: { fetchImpl?: Fetch } = {}): ClienteR2 {
  const { config, faltan } = leerConfigR2();
  if (!config || faltan.length > 0) throw new R2NoConfiguradoError(faltan);
  return crearClienteR2(config, opciones);
}

/**
 * Una clave privada: `<prefijo><aleatorio de 32 hex>/<nombre>`. El aleatorio
 * va **antes** del nombre legible para que nadie arme la clave del
 * comprobante de `PY-000123` sabiendo el número de pedido.
 */
export function clavePrivada(prefijo: (typeof PREFIJOS_PRIVADOS)[number], nombre: string): string {
  const limpio = nombre.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "archivo";
  return `${prefijo}${randomBytes(16).toString("hex")}/${limpio}`;
}

/**
 * Lo que se guarda en la base para un archivo privado (comprobante): la clave
 * con el prefijo `r2:`, para distinguirla de un id viejo que no es de R2.
 */
export function refPrivada(key: string): string {
  return `r2:${key}`;
}

/** `r2:comprobantes/…` → la clave; cualquier otra cosa → `null` (legacy). */
export function claveDeRefPrivada(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith("r2:")) return null;
  const key = ref.slice(3);
  return PREFIJOS_PRIVADOS.some((prefijo) => key.startsWith(prefijo)) &&
    /^[A-Za-z0-9._/-]{1,250}$/.test(key) &&
    !key.includes("..")
    ? key
    : null;
}

/**
 * El texto de un error para el log o el panel: el de un `R2Error` /
 * `R2NoConfiguradoError` es seguro por construcción (método, clave, status,
 * código; nunca la firma ni el secret) y dice qué pasó; cualquier otro pasa
 * por `safeError`, que no muestra el mensaje.
 */
export function mensajeR2(error: unknown): string {
  if (error instanceof R2Error || error instanceof R2NoConfiguradoError) return error.message;
  return safeError(error).message;
}
