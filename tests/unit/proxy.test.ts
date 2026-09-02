import { sealData } from 'iron-session';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * El único test que **ejecuta** `proxy()`.
 *
 * `csp-isr.test.ts` y `security-review.test.ts` greppean el fuente de
 * `src/proxy.ts`: sirven para que nadie borre una decisión, pero no ven lo que
 * el navegador recibe. Acá se arma un `NextRequest` de verdad y se miran las
 * cabeceras y los redirects que salen, que es la clase de bug del commit del
 * nonce contra HTML cacheado: el fuente decía lo correcto y la home igual se
 * quedaba sin JavaScript.
 */

const SESSION_SECRET = 'secreto-de-test-con-mas-de-treinta-y-dos-caracteres';

let proxy: typeof import('@/proxy').proxy;
let SESSION_COOKIE: string;

beforeAll(async () => {
  // `sessionOptions()` lee el entorno cuando se la llama, no al importar.
  process.env.SESSION_SECRET = SESSION_SECRET;
  ({ proxy } = await import('@/proxy'));
  ({ SESSION_COOKIE } = await import('@/lib/session'));
});

function pedido(pathname: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(pathname, 'https://tienda.test'), { headers });
}

async function cookieDeSesion(): Promise<string> {
  const sealed = await sealData(
    { userId: 1, email: 'due@na.test', role: 'owner' },
    { password: SESSION_SECRET, ttl: 60 * 60 * 8 },
  );
  return `${SESSION_COOKIE}=${sealed}`;
}

function csp(response: Response): string {
  return response.headers.get('Content-Security-Policy') ?? '';
}

/** La directiva sola: `style-src` también trae 'unsafe-inline' y no es la que se mira acá. */
function scriptSrc(response: Response): string {
  return csp(response)
    .split(';')
    .map((directiva) => directiva.trim())
    .find((directiva) => directiva.startsWith('script-src')) ?? '';
}

describe('proxy() — la puerta de /admin', () => {
  it('manda al login con `next` cuando no hay cookie', async () => {
    const response = await proxy(pedido('/admin/pedidos'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/admin/login');
    expect(location.searchParams.get('next')).toBe('/admin/pedidos');
  });

  it('conserva el query string en `next`', async () => {
    const response = await proxy(pedido('/admin/pedidos?estado=pagado'));

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('next')).toBe('/admin/pedidos?estado=pagado');
  });

  it('deja pasar /admin/login sin cookie', async () => {
    const response = await proxy(pedido('/admin/login'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('deja pasar /admin con una cookie firmada, y no cachea ni indexa', async () => {
    const response = await proxy(pedido('/admin/pedidos', await cookieDeSesion()));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('rebota una cookie firmada con otro secreto', async () => {
    const sellada = await sealData(
      { userId: 1, email: 'due@na.test', role: 'owner' },
      { password: 'otro-secreto-igual-de-largo-pero-ajeno-000', ttl: 60 * 60 * 8 },
    );
    const response = await proxy(pedido('/admin/pedidos', `${SESSION_COOKIE}=${sellada}`));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/admin/login');
  });
});

describe('proxy() — CSP con y sin nonce', () => {
  it('las rutas que se renderizan por request llevan nonce y strict-dynamic', async () => {
    const response = await proxy(pedido('/checkout'));

    const nonce = response.headers.get('x-nonce');
    expect(nonce).toBeTruthy();
    expect(scriptSrc(response)).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc(response)).toContain("'strict-dynamic'");
    expect(scriptSrc(response)).not.toContain("'unsafe-inline'");
  });

  it.each(['/', '/categoria/perfumes'])(
    '%s se cachea: sin nonce, con unsafe-inline y sin strict-dynamic',
    async (ruta) => {
      const response = await proxy(pedido(ruta));

      expect(response.headers.get('x-nonce')).toBeNull();
      expect(scriptSrc(response)).toContain("script-src 'self' 'unsafe-inline'");
      expect(scriptSrc(response)).not.toContain("'strict-dynamic'");
    },
  );

  it('un `x-nonce` de afuera no sobrevive en una ruta cacheada', async () => {
    const headers = new Headers({ 'x-nonce': 'inventado-por-el-cliente' });
    const response = await proxy(
      new NextRequest(new URL('/', 'https://tienda.test'), { headers }),
    );

    expect(response.headers.get('x-nonce')).toBeNull();
    expect(csp(response)).not.toContain('inventado-por-el-cliente');
  });

  it('el resto de las cabeceras de seguridad viajan en todas las rutas', async () => {
    for (const ruta of ['/', '/checkout', '/admin/login']) {
      const value = csp(await proxy(pedido(ruta)));
      expect(value).toContain("default-src 'self'");
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).toContain("object-src 'none'");
      expect(value).toContain("base-uri 'self'");
      expect(value).toContain("form-action 'self'");
    }
  });

  it('el redirect al login también sale con CSP', async () => {
    const response = await proxy(pedido('/admin/pedidos'));

    expect(csp(response)).toContain("default-src 'self'");
  });
});
