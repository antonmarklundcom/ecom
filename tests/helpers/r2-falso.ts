/**
 * Un R2 de mentira para los tests: un `fetch` que entiende lo poco de la API
 * S3 que usa `src/lib/r2.ts` (PUT con `If-None-Match`, GET, HEAD, DELETE,
 * ListObjectsV2) y, aparte, el dominio público del bucket. Nada sale a la red.
 *
 * `publicoSirvePrivados` simula el error de configuración que `pnpm preflight`
 * tiene que detectar: un dominio público sin la regla que bloquea
 * `/comprobantes/*` y `/backups/*`.
 */

export const CUENTA_FALSA = "0123456789abcdef0123456789abcdef";
export const BUCKET_FALSO = "tienda-test";
export const BASE_PUBLICA_FALSA = "https://img.tienda.test";
export const ENDPOINT_FALSO = `https://${CUENTA_FALSA}.r2.cloudflarestorage.com/${BUCKET_FALSO}`;

export type R2Falso = {
  objetos: Map<string, { bytes: Uint8Array; contentType: string | null; cacheControl: string | null; fecha: Date }>;
  pedidos: Array<{ method: string; url: string; headers: Headers }>;
  fetch: typeof fetch;
  /** Falla el próximo PUT cuya clave contenga esto. */
  fallarPut: string | null;
};

export function crearR2Falso(opciones: { publicoSirvePrivados?: boolean } = {}): R2Falso {
  const objetos: R2Falso["objetos"] = new Map();
  const pedidos: R2Falso["pedidos"] = [];
  const estado: R2Falso = {
    objetos,
    pedidos,
    fallarPut: null,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = new URL(request.url);
      pedidos.push({ method: request.method, url: request.url, headers: request.headers });

      if (url.origin === BASE_PUBLICA_FALSA) {
        const key = decodeURIComponent(url.pathname.slice(1));
        const privado = key.startsWith("comprobantes/") || key.startsWith("backups/");
        if (privado && !opciones.publicoSirvePrivados) return new Response("Forbidden", { status: 403 });
        const objeto = objetos.get(key);
        return objeto ? new Response(objeto.bytes as BodyInit, { status: 200 }) : new Response("", { status: 404 });
      }

      if (!request.url.startsWith(ENDPOINT_FALSO)) return new Response("host desconocido", { status: 599 });
      if (!request.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256") && !url.searchParams.has("X-Amz-Signature")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }

      const key = decodeURIComponent(url.pathname.slice(`/${BUCKET_FALSO}/`.length));
      if (request.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const contenidos = [...objetos.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([k, o]) =>
              `<Contents><Key>${k}</Key><Size>${o.bytes.byteLength}</Size><LastModified>${o.fecha.toISOString()}</LastModified></Contents>`
          )
          .join("");
        return new Response(
          `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contenidos}</ListBucketResult>`,
          { status: 200 }
        );
      }
      if (request.method === "PUT") {
        if (estado.fallarPut && key.includes(estado.fallarPut)) {
          estado.fallarPut = null;
          return new Response("<Error><Code>InternalError</Code></Error>", { status: 400 });
        }
        if (request.headers.get("if-none-match") === "*" && objetos.has(key)) {
          return new Response("<Error><Code>PreconditionFailed</Code></Error>", { status: 412 });
        }
        objetos.set(key, {
          bytes: new Uint8Array(await request.arrayBuffer()),
          contentType: request.headers.get("content-type"),
          cacheControl: request.headers.get("cache-control"),
          fecha: new Date(),
        });
        return new Response("", { status: 200 });
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const objeto = objetos.get(key);
        if (!objeto) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
        return new Response(request.method === "HEAD" ? null : (objeto.bytes as BodyInit), {
          status: 200,
          headers: { "content-length": String(objeto.bytes.byteLength) },
        });
      }
      if (request.method === "DELETE") {
        objetos.delete(key);
        return new Response(null, { status: 204 });
      }
      return new Response("", { status: 405 });
    }) as typeof fetch,
  };
  return estado;
}

/** La config de R2 de los tests, lista para `crearClienteR2`. */
export const CONFIG_FALSA = {
  accountId: CUENTA_FALSA,
  accessKeyId: "AKIATESTTEST0000",
  secretAccessKey: "secreto-de-r2-SUPERSECRETO-4321",
  bucket: BUCKET_FALSO,
  publicUrl: BASE_PUBLICA_FALSA,
} as const;

/** Las variables de entorno equivalentes, para `vi.stubEnv`. */
export const ENV_R2_FALSO: Record<string, string> = {
  R2_ACCOUNT_ID: CONFIG_FALSA.accountId,
  R2_ACCESS_KEY_ID: CONFIG_FALSA.accessKeyId,
  R2_SECRET_ACCESS_KEY: CONFIG_FALSA.secretAccessKey,
  R2_BUCKET: CONFIG_FALSA.bucket,
  R2_PUBLIC_URL: CONFIG_FALSA.publicUrl,
};
