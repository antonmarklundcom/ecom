import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";

import { analyticsConfig } from "@/lib/analytics";
import { USER_ROLES } from "@/lib/roles";
import { sessionOptions, type AdminSession } from "@/lib/session";

/**
 * Proxy — el ex `middleware.ts`, renombrado en Next 16 (PLAN.md 4.1 y 4.9).
 *
 * Hace dos cosas: pone las cabeceras de seguridad de todo el sitio y cuida la
 * puerta de `/admin/*`.
 *
 * Sobre la puerta: esto es UX, **no** es el control de acceso. Manda al login
 * a quien no tiene cookie para que no vea un error feo. La defensa real está
 * adentro de cada server action (`requireAdminSession()`), porque una server
 * action es un endpoint HTTP con su propio id: se la puede invocar con un
 * `fetch` directo sin navegar nunca a una URL `/admin`, y entonces esto no
 * llega a correr. Si algún día este archivo desaparece, ninguna acción del
 * panel debería volverse ejecutable por un anónimo.
 */

export const config = {
  // Se excluyen los assets estáticos: no necesitan CSP ni sesión, y correr
  // esto en cada .js del bundle es puro costo por request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // `btoa`, no `Buffer`: esto corre en el runtime edge, donde las APIs de
  // Node no existen.
  const nonce = btoa(crypto.randomUUID());

  // El nonce viaja en un header de request para que Next se lo ponga a sus
  // propios <script> al renderizar; sin eso, un CSP sin 'unsafe-inline' deja
  // la página sin hidratar.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const isAdmin = request.nextUrl.pathname.startsWith("/admin");
  const isLogin = request.nextUrl.pathname === "/admin/login";

  if (isAdmin && !isLogin) {
    const session = await getIronSession<AdminSession>(request, NextResponse.next(), sessionOptions());
    // Contra la lista del ENUM y no contra literales sueltos: un rol nuevo
    // agregado a `USER_ROLES` y olvidado acá quedaría rebotando al login para
    // siempre, con la cookie válida y sin ningún error que lo explique.
    const authenticated = Boolean(
      session.userId && session.role && USER_ROLES.includes(session.role),
    );

    if (!authenticated) {
      const login = new URL("/admin/login", request.url);
      // Sólo el path: `next` se vuelve a validar en la acción de login antes
      // de usarse como destino (ver safeNextPath).
      login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      return withSecurityHeaders(NextResponse.redirect(login), nonce);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return withSecurityHeaders(response, nonce, isAdmin);
}

/**
 * CSP + el resto de las cabeceras (PLAN.md 4.9).
 *
 * Las que no dependen del nonce viven en `next.config.ts`; el CSP tiene que
 * armarse acá porque el nonce cambia en cada request.
 */
function withSecurityHeaders(
  response: NextResponse,
  nonce: string,
  isAdmin = false,
): NextResponse {
  const dev = process.env.NODE_ENV !== "production";

  // Los medidores (src/lib/analytics.ts) son los únicos terceros que el
  // navegador puede tocar, y sólo si esta tienda los configuró: sin las
  // variables, el CSP queda tan cerrado como siempre. Los hosts de script-src
  // son para navegadores sin 'strict-dynamic'; en los modernos, la confianza
  // la da el nonce del loader.
  const { ga4Id, metaPixelId } = analyticsConfig();
  const scriptHosts = [
    ...(ga4Id ? [" https://www.googletagmanager.com"] : []),
    ...(metaPixelId ? [" https://connect.facebook.net"] : []),
  ].join("");
  const imgHosts = [
    // GA4 cae a un pixel <img> cuando sendBeacon no puede.
    ...(ga4Id ? [" https://www.googletagmanager.com https://www.google-analytics.com"] : []),
    ...(metaPixelId ? [" https://www.facebook.com"] : []),
  ].join("");
  const connectHosts = [
    ...(ga4Id
      ? [" https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com"]
      : []),
    ...(metaPixelId ? [" https://www.facebook.com https://connect.facebook.net"] : []),
  ].join("");

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' hace que los scripts que carga un script con nonce
    // hereden la confianza: es lo que necesita el chunking de Next. En dev,
    // Fast Refresh evalúa código en runtime y exige 'unsafe-eval'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}`.trim() +
      scriptHosts,
    // Tailwind y next/font inyectan <style> sin nonce. Un CSS inline no
    // ejecuta código; el riesgo real es la exfiltración por selectores, muy
    // por debajo de romper el estilo del sitio entero.
    "style-src 'self' 'unsafe-inline'",
    // Cloudinary sirve las fotos de producto; data: es para los blur
    // placeholders que guardamos en product_images.
    `img-src 'self' data: blob: https://res.cloudinary.com${imgHosts}`,
    "font-src 'self' data:",
    // El navegador sólo habla con este origen (más los medidores de arriba,
    // si están). Cloudinary se llama desde el servidor, nunca desde el
    // cliente.
    `connect-src 'self'${dev ? " ws: http://localhost:*" : ""}${connectHosts}`,
    "form-action 'self'",
    // Redundante con X-Frame-Options, pero es el que respetan los navegadores
    // modernos y además cubre los iframes anidados.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);

  // El panel nunca se cachea ni se indexa: sus páginas tienen datos de
  // clientes y montos, y un proxy intermedio no tiene por qué guardarlos.
  if (isAdmin) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}
