import type { PreflightCheck } from "./preflight";

/**
 * `pnpm preflight` — ¿hay un Cloudflare **proxeado** (nube naranja) delante de
 * la tienda?
 *
 * La regla está en DEPLOY.md § "Cloudflare: sólo DNS (nube gris)": si el
 * dominio está en Cloudflare, los registros que apuntan a Hostinger van en
 * "DNS only". Proxeado, Cloudflare se mete en el medio del aviso de pago de
 * Pagopar, de la IP con que se limitan los intentos de login y de la caché
 * del HTML, y Hostinger ya tiene su propia CDN adelante.
 *
 * Es el único control de preflight que **sale a la red**, y por eso vive
 * aparte de `preflight()` (que no toca ni la base ni la red) y lo corre
 * `scripts/preflight.ts` después del reporte principal. Dos señales, las dos
 * inyectables para los tests:
 *
 *  - **DNS**: si las IPs del dominio caen en los rangos publicados de
 *    Cloudflare, el tráfico pasa por Cloudflare sí o sí. Es concluyente:
 *    `bloquea`.
 *  - **Respuesta**: un `HEAD` al sitio con `cf-ray` o `server: cloudflare`.
 *    Es una señal fuerte, pero no se puede descartar que algo del lado del
 *    hosting la agregue: `advierte`.
 *
 * Lo que no se pudo averiguar (sin red, timeout, DNS que no contesta) es
 * **inconcluso** y nunca bloquea: un preflight corrido sin internet no puede
 * frenar un deploy por algo que no vio.
 */

/**
 * Rangos de Cloudflare, tal como los publica en https://www.cloudflare.com/ips/
 * (ips-v4 e ips-v6). Copiados a mano el 2026-11-04 y **no** se bajan en
 * runtime: el preflight no depende de que esa página conteste. Cloudflare
 * cambia esta lista muy de vez en cuando; si agrega un rango, sumarlo acá.
 */
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** Lo que se inyecta. `scripts/preflight.ts` pasa `fetch` y el DNS de Node. */
export type CloudflareDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "headers">>;
  /**
   * Las direcciones A y AAAA del host **según el DNS** (`dns.promises.resolve4`
   * y `resolve6`), no `lookup`: en el servidor, `/etc/hosts` puede apuntar el
   * propio dominio a una IP local y esconder lo que ve el resto del mundo.
   */
  resolver: (host: string) => Promise<string[]>;
  timeoutMs?: number;
};

/** Más que esto y el control se da por inconcluso. */
export const CLOUDFLARE_TIMEOUT_MS = 4_000;

const ID = "cloudflare_proxy";
const TITULO = "Cloudflare sólo DNS (nube gris)";
const DOC = "DEPLOY.md § \"Cloudflare: sólo DNS (nube gris)\"";

function ipv4ANumero(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let n = 0;
  for (const parte of partes) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const octeto = Number(parte);
    if (octeto > 255) return null;
    n = n * 256 + octeto;
  }
  return n;
}

/** Una IPv6 en 8 grupos de 16 bits, o `null`. Acepta `::` y un IPv4 al final. */
function ipv6AGrupos(ip: string): number[] | null {
  let texto = ip.toLowerCase().split("%")[0] ?? "";
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(texto);
  if (v4) {
    const n = ipv4ANumero(v4[1] ?? "");
    if (n === null) return null;
    texto =
      texto.slice(0, -(v4[1] ?? "").length) +
      `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const mitades = texto.split("::");
  if (mitades.length > 2) return null;
  const leer = (s: string) => (s === "" ? [] : s.split(":"));
  const izquierda = leer(mitades[0] ?? "");
  const derecha = mitades.length === 2 ? leer(mitades[1] ?? "") : [];
  const faltan = 8 - izquierda.length - derecha.length;
  if (mitades.length === 1 && faltan !== 0) return null;
  if (faltan < 0) return null;
  const grupos = [...izquierda, ...Array<string>(faltan).fill("0"), ...derecha];
  const numeros = grupos.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return numeros.some(Number.isNaN) ? null : numeros;
}

function enRangoV4(ip: number, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const red = ipv4ANumero(base ?? "");
  const prefijo = Number(bits);
  if (red === null) return false;
  const mascara = prefijo === 0 ? 0 : (0xffffffff << (32 - prefijo)) >>> 0;
  return ((ip & mascara) >>> 0) === ((red & mascara) >>> 0);
}

function enRangoV6(ip: number[], cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const red = ipv6AGrupos(base ?? "");
  let restantes = Number(bits);
  if (!red) return false;
  for (let i = 0; i < 8 && restantes > 0; i++) {
    const tomar = Math.min(16, restantes);
    const mascara = (0xffff << (16 - tomar)) & 0xffff;
    if (((ip[i] ?? 0) & mascara) !== ((red[i] ?? 0) & mascara)) return false;
    restantes -= tomar;
  }
  return true;
}

/** ¿Esta IP (v4 o v6, incluida `::ffff:a.b.c.d`) es de Cloudflare? */
export function esIpDeCloudflare(ip: string): boolean {
  const v4 = ipv4ANumero(ip);
  if (v4 !== null) return CLOUDFLARE_IPV4.some((cidr) => enRangoV4(v4, cidr));
  const v6 = ipv6AGrupos(ip);
  if (!v6) return false;
  // IPv4 mapeada en IPv6.
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
    const n = ((v6[6] ?? 0) * 65536 + (v6[7] ?? 0)) >>> 0;
    return CLOUDFLARE_IPV4.some((cidr) => enRangoV4(n, cidr));
  }
  return CLOUDFLARE_IPV6.some((cidr) => enRangoV6(v6, cidr));
}

/**
 * Hosts donde el control no aplica: locales, IPs literales y la URL temporal
 * de Hostinger (`*.hostingersite.com`), cuyo DNS no maneja la tienda.
 */
function noAplica(host: string): string | null {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "es una dirección local";
  }
  if (ipv4ANumero(host) !== null || host.includes(":")) {
    return "es una IP, no un dominio";
  }
  if (host === "hostingersite.com" || host.endsWith(".hostingersite.com")) {
    return "es la URL temporal de Hostinger, cuyo DNS no maneja la tienda";
  }
  return null;
}

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let tope: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promesa,
    new Promise<never>((_, reject) => {
      tope = setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms);
    }),
  ]).finally(() => {
    if (tope) clearTimeout(tope);
  });
}

function motivo(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ResultadoCloudflare =
  | { estado: "no_aplica"; detalle: string }
  | { estado: "inconcluso"; detalle: string }
  | { estado: "directo"; check: PreflightCheck }
  | { estado: "proxeado"; check: PreflightCheck }
  | { estado: "sospechoso"; check: PreflightCheck };

/**
 * El control. Nunca tira: cualquier falla de red es `inconcluso`.
 *
 * `no_aplica` e `inconcluso` no son un `PreflightCheck` a propósito: no hay
 * nada verificado que mostrar con ✓ ni nada que bloquear.
 */
export async function revisarCloudflare(
  siteUrl: string | undefined,
  deps: CloudflareDeps
): Promise<ResultadoCloudflare> {
  const crudo = (siteUrl ?? "").trim();
  if (!crudo) {
    return { estado: "no_aplica", detalle: "NEXT_PUBLIC_SITE_URL vacía (la bloquea otro control)" };
  }
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    return { estado: "no_aplica", detalle: "NEXT_PUBLIC_SITE_URL no es una URL" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const razon = noAplica(host);
  if (razon) return { estado: "no_aplica", detalle: `${host} ${razon}` };

  const timeoutMs = deps.timeoutMs ?? CLOUDFLARE_TIMEOUT_MS;

  const [dns, respuesta] = await Promise.allSettled([
    conTimeout(deps.resolver(host), timeoutMs),
    conTimeout(
      deps.fetch(url.origin + "/", {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs + 500
    ),
  ]);

  const direcciones = dns.status === "fulfilled" ? dns.value : [];
  const deCloudflare = direcciones.filter(esIpDeCloudflare);

  if (deCloudflare.length > 0) {
    return {
      estado: "proxeado",
      check: {
        id: ID,
        severity: "bloquea",
        title: TITULO,
        detail:
          `${host} resuelve a IPs de Cloudflare (${deCloudflare.join(", ")}): el registro está ` +
          "proxeado (nube naranja). Pasalo a \"DNS only\" en Cloudflare → DNS, apuntando a " +
          `la IP o el CNAME que da el hPanel. Ver ${DOC}`,
      },
    };
  }

  const cabeceras = respuesta.status === "fulfilled" ? respuesta.value.headers : null;
  const cfRay = cabeceras?.get("cf-ray");
  const server = cabeceras?.get("server") ?? "";
  if (cfRay || /cloudflare/i.test(server)) {
    const senal = cfRay ? "cf-ray" : `server: ${server}`;
    return {
      estado: "sospechoso",
      check: {
        id: ID,
        severity: "advierte",
        title: TITULO,
        detail:
          `la respuesta de ${url.origin} trae ${senal}, la marca de Cloudflare` +
          (direcciones.length > 0
            ? ", aunque las IPs no son de sus rangos conocidos"
            : " (el DNS no contestó)") +
          `. Si el dominio está en Cloudflare, revisá que esté en "DNS only". Ver ${DOC}`,
      },
    };
  }

  const dnsOk = direcciones.length > 0;
  const headOk = cabeceras !== null;
  if (!dnsOk && !headOk) {
    const fallas = [
      dns.status === "rejected" ? `DNS: ${motivo(dns.reason)}` : "DNS: sin direcciones",
      respuesta.status === "rejected" ? `HEAD: ${motivo(respuesta.reason)}` : null,
    ].filter(Boolean);
    return { estado: "inconcluso", detalle: fallas.join("; ") };
  }

  const visto = [
    dnsOk ? `resuelve a ${direcciones.join(", ")}` : "el DNS no contestó",
    headOk ? "la respuesta no trae cf-ray" : "el sitio no contestó el HEAD",
  ];
  return {
    estado: "directo",
    check: {
      id: ID,
      severity: "ok",
      title: TITULO,
      detail: `${host} no pasa por el proxy de Cloudflare (${visto.join("; ")})`,
    },
  };
}
