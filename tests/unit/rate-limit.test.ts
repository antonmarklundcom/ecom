import { beforeEach, describe, expect, it } from "vitest";

import { clientIp, rateLimit, resetRateLimits } from "@/lib/rate-limit";

const OPTIONS = { limit: 5, windowMs: 15 * 60 * 1000 };

describe("rateLimit", () => {
  beforeEach(resetRateLimits);

  it("deja pasar hasta el límite y después corta", () => {
    const now = Date.now();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(rateLimit("ip:1.2.3.4", OPTIONS, now).ok, `intento ${attempt}`).toBe(true);
    }
    const blocked = rateLimit("ip:1.2.3.4", OPTIONS, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("cuenta por clave: una IP no bloquea a otra", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) rateLimit("ip:1.1.1.1", OPTIONS, now);

    expect(rateLimit("ip:1.1.1.1", OPTIONS, now).ok).toBe(false);
    expect(rateLimit("ip:2.2.2.2", OPTIONS, now).ok).toBe(true);
  });

  it("la ventana es deslizante: se libera de a un intento", () => {
    const start = Date.now();
    for (let i = 0; i < 5; i += 1) rateLimit("ip:9.9.9.9", OPTIONS, start + i * 1000);

    expect(rateLimit("ip:9.9.9.9", OPTIONS, start + 5000).ok).toBe(false);
    // Justo después de que vence el primer intento, entra uno más.
    expect(rateLimit("ip:9.9.9.9", OPTIONS, start + OPTIONS.windowMs + 1).ok).toBe(true);
    // Pero no dos.
    expect(rateLimit("ip:9.9.9.9", OPTIONS, start + OPTIONS.windowMs + 2).ok).toBe(false);
  });

  it("informa cuánto falta para reintentar", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) rateLimit("ip:8.8.8.8", OPTIONS, now);

    const blocked = rateLimit("ip:8.8.8.8", OPTIONS, now + 60_000);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(13 * 60);
  });
});

describe("clientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(headers)).toBe("200.1.2.3");
  });

  it("cae a x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "190.0.0.9" }))).toBe("190.0.0.9");
  });

  it("sin headers devuelve un valor estable", () => {
    expect(clientIp(new Headers())).toBe("desconocida");
  });
});
