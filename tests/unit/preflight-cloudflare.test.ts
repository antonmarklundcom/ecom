import { describe, expect, it, vi } from "vitest";

import {
  esIpDeCloudflare,
  revisarCloudflare,
  type CloudflareDeps,
} from "@/domain/preflight-cloudflare";

/**
 * `pnpm preflight` — Cloudflare delante de Hostinger tiene que ser "DNS only"
 * (DEPLOY.md § "Cloudflare: sólo DNS (nube gris)").
 *
 * Lo que este archivo fija: lo concluyente (IPs de Cloudflare) bloquea, la
 * marca en la respuesta advierte, y **lo que no se pudo ver nunca bloquea**.
 * Sin red de verdad: `fetch` y el DNS son de mentira.
 */

function respuesta(cabeceras: Record<string, string> = {}) {
  return Promise.resolve({ headers: new Headers(cabeceras) });
}

function deps(over: Partial<CloudflareDeps> = {}): CloudflareDeps {
  return {
    fetch: vi.fn(() => respuesta({ server: "LiteSpeed" })),
    resolver: vi.fn(async () => ["185.199.110.153"]),
    timeoutMs: 50,
    ...over,
  };
}

describe("esIpDeCloudflare", () => {
  it.each([
    "104.16.132.229",
    "172.67.10.1",
    "188.114.97.3",
    "162.159.0.1",
    "2606:4700:3030::6815:1001",
    "2a06:98c1:3120::3",
    "::ffff:104.21.5.5",
  ])("%s es de Cloudflare", (ip) => {
    expect(esIpDeCloudflare(ip)).toBe(true);
  });

  it.each([
    "185.199.110.153",
    "8.8.8.8",
    "104.15.255.255",
    "104.32.0.0",
    "2001:db8::1",
    "2a02:4780::1",
    "::ffff:8.8.8.8",
    "no-es-ip",
    "300.1.1.1",
  ])("%s no es de Cloudflare", (ip) => {
    expect(esIpDeCloudflare(ip)).toBe(false);
  });
});

describe("revisarCloudflare", () => {
  it("IPs de Cloudflare: bloquea (el registro está proxeado)", async () => {
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({ resolver: async () => ["104.21.5.5", "172.67.1.1"] })
    );
    expect(r.estado).toBe("proxeado");
    if (r.estado !== "proxeado") return;
    expect(r.check.severity).toBe("bloquea");
    expect(r.check.id).toBe("cloudflare_proxy");
    expect(r.check.detail).toContain("DNS only");
  });

  it("bloquea por DNS aunque el HEAD no conteste", async () => {
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({
        resolver: async () => ["2606:4700::6810:1"],
        fetch: () => Promise.reject(new Error("ECONNRESET")),
      })
    );
    expect(r.estado).toBe("proxeado");
  });

  it("cf-ray en la respuesta con IPs que no son de Cloudflare: advierte, no bloquea", async () => {
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({ fetch: () => respuesta({ "cf-ray": "8f00-GRU" }) })
    );
    expect(r.estado).toBe("sospechoso");
    if (r.estado !== "sospechoso") return;
    expect(r.check.severity).toBe("advierte");
  });

  it("server: cloudflare sin DNS: advierte", async () => {
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({
        resolver: () => Promise.reject(new Error("ENOTFOUND")),
        fetch: () => respuesta({ server: "cloudflare" }),
      })
    );
    expect(r.estado).toBe("sospechoso");
  });

  it("directo: ok", async () => {
    const d = deps();
    const r = await revisarCloudflare("https://tienda.com.py/", d);
    expect(r.estado).toBe("directo");
    if (r.estado !== "directo") return;
    expect(r.check.severity).toBe("ok");
    expect(d.fetch).toHaveBeenCalledWith(
      "https://tienda.com.py/",
      expect.objectContaining({ method: "HEAD", redirect: "manual" })
    );
    expect(d.resolver).toHaveBeenCalledWith("tienda.com.py");
  });

  it("sin red (DNS y HEAD fallan): inconcluso, nunca bloquea", async () => {
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({
        resolver: () => Promise.reject(new Error("EAI_AGAIN")),
        fetch: () => Promise.reject(new Error("fetch failed")),
      })
    );
    expect(r.estado).toBe("inconcluso");
    if (r.estado !== "inconcluso") return;
    expect(r.detalle).toContain("EAI_AGAIN");
    expect(r.detalle).toContain("fetch failed");
  });

  it("timeout: inconcluso, y no espera de más", async () => {
    const colgado = () => new Promise<never>(() => {});
    const inicio = Date.now();
    const r = await revisarCloudflare(
      "https://tienda.com.py",
      deps({ resolver: colgado, fetch: colgado, timeoutMs: 30 })
    );
    expect(r.estado).toBe("inconcluso");
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it.each([
    [undefined, "vacía"],
    ["", "vacía"],
    ["no soy url", "no es una URL"],
    ["http://localhost:3000", "local"],
    ["http://127.0.0.1:3000", "IP"],
    ["https://algo-123.hostingersite.com", "temporal de Hostinger"],
  ])("%s: no aplica, sin salir a la red", async (url, motivo) => {
    const d = deps();
    const r = await revisarCloudflare(url, d);
    expect(r.estado).toBe("no_aplica");
    if (r.estado !== "no_aplica") return;
    expect(r.detalle).toContain(motivo);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.resolver).not.toHaveBeenCalled();
  });
});
