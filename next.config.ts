import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad que no dependen del request (PLAN.md 4.9).
 *
 * El `Content-Security-Policy` **no** está acá: lleva un nonce distinto por
 * request y se arma en `src/proxy.ts` (el ex `middleware.ts` de Next 16).
 */
const SECURITY_HEADERS = [
  // Un año, subdominios incluidos. Hostinger sirve el certificado; sin HSTS,
  // el primer request por http:// sigue siendo interceptable.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Duplica `frame-ancestors 'none'` del CSP para los navegadores viejos que
  // todavía se ven en PY.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El link del pedido lleva el token en la URL: que no se filtre por Referer
  // hacia afuera es parte del modelo de acceso del comprador (ARCH.md §1).
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/**
 * Qué build es éste (plan-operacion §5.4 B).
 *
 * Se resuelve **en build** y queda incrustado: en runtime, el slot de Hostinger
 * no tiene el `.git` a mano ni conviene invocar git en cada request.
 *
 * Tres fuentes, en orden: git (un checkout normal), `SOURCE_COMMIT` (lo que
 * ponen algunas plataformas de deploy), y `"desconocido"` — que es honesto y
 * mejor que un valor inventado que después nadie sabe interpretar.
 */
function buildSha(): string {
  const delEntorno = process.env.SOURCE_COMMIT?.trim();
  if (delEntorno) return delEntorno.slice(0, 12);

  try {
    // `execSync` sólo corre en build. Si no hay git —un tarball subido a
    // mano—, se cae al fallback en vez de romper el build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "desconocido";
  }
}

const nextConfig: NextConfig = {
  agentRules: false,
  env: {
    BUILD_SHA: buildSha(),
    BUILD_AT: new Date().toISOString(),
  },
  // mysql2 usa APIs de Node que el bundler no debe tocar.
  serverExternalPackages: ["mysql2"],
  // `X-Powered-By: Next.js` regala la versión exacta del framework.
  poweredByHeader: false,
  images: {
    // Cloudinary ya optimiza con f_auto,q_auto; ver ARCH.md §6.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
