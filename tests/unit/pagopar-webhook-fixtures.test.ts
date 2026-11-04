import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeWebhookText,
  PagoparProtocolError,
  parseWebhookEvent,
  readWebhookBody,
  WEBHOOK_MAX_BODY_BYTES,
  webhookResponseBody,
  type PagoparWebhookEvent,
} from "../../src/domain/pagopar/protocol";
import { webhookGuardToken } from "../../src/domain/pagopar/hash";
import type { WebhookOutcome } from "../../src/domain/pagopar/webhook";
import { resetRateLimits } from "../../src/lib/rate-limit";
import {
  FIXTURE_HASH,
  fixtureRequest,
  loadPagoparFixtures,
} from "../helpers/pagopar-fixtures";

/**
 * El aviso de Pagopar, de punta a punta sin base: cable → forma interna →
 * firma → llamada al dominio → código HTTP.
 *
 * `processPagoparWebhook` se reemplaza por un doble: acá se prueba qué le
 * llega y qué se contesta según lo que devuelva. Lo que hace con la base
 * (idempotencia, monto, transición) lo prueban los tests de integración,
 * incluidos los mismos archivos de `tests/fixtures/pagopar/`.
 */

const PRIVATE_KEY = "clave-privada-de-mentira-solo-para-tests";

const dominio = vi.hoisted(() => ({
  process: vi.fn<(event: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/integraciones-store", () => ({ cargarIntegraciones: async () => {} }));

vi.mock("@/domain/pagopar/webhook", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/domain/pagopar/webhook")>();
  return { ...real, processPagoparWebhook: dominio.process };
});

const FIXTURES = loadPagoparFixtures();

function aplicado(): WebhookOutcome {
  return { kind: "aplicado", orderId: 1, orderNumber: "PY-000123", changed: true };
}

async function route() {
  return import("../../src/app/api/webhooks/pagopar/route");
}

function logueado(): string {
  return [console.info, console.warn, console.error]
    .flatMap((fn) => vi.mocked(fn).mock.calls)
    .map((args) => args.map(String).join(" "))
    .join("\n");
}

beforeEach(() => {
  resetRateLimits();
  vi.stubEnv("PAGOPAR_PRIVATE_KEY", PRIVATE_KEY);
  vi.stubEnv("PAGOPAR_MODE", "");
  dominio.process.mockReset();
  dominio.process.mockResolvedValue(aplicado());
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Parseo de cada aviso grabado
// ---------------------------------------------------------------------------

describe("avisos grabados: parseo", () => {
  it("hay avisos para cada caso que pide la fase", () => {
    const nombres = FIXTURES.map((fixture) => fixture.nombre);
    for (const esperado of [
      "pagado",
      "pendiente",
      "reversado",
      "varios-items-distintos",
      "duplicado",
      "firma-invalida",
      "hash-equivocado",
      "pedido-desconocido",
      "monto-distinto",
      "malformado-json-roto",
    ]) {
      expect(nombres).toContain(esperado);
    }
  });

  it("ningún archivo trae un token de verdad", () => {
    for (const fixture of FIXTURES) {
      const texto = JSON.stringify(fixture);
      // Un sha1 en hex son 40 caracteres: no puede haber ninguno.
      expect(texto, fixture.nombre).not.toMatch(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/);
    }
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.nombre} (${fixture.origen})`, async () => {
      const leer = async () =>
        parseWebhookEvent(await readWebhookBody(fixtureRequest(fixture, PRIVATE_KEY)));

      if (fixture.esperado.parseo === "error") {
        await expect(leer()).rejects.toBeInstanceOf(PagoparProtocolError);
        return;
      }

      const event = await leer();
      expect({
        hashPedido: event.hashPedido,
        pagado: event.pagado,
        montoPyg: event.montoPyg,
      }).toEqual(fixture.esperado.parseo);
      // El token nunca queda en lo que se guarda.
      expect(event.raw).not.toHaveProperty("token");
    });
  }
});

// ---------------------------------------------------------------------------
// 2. La ruta con cada aviso: hasta dónde llega
// ---------------------------------------------------------------------------

describe("avisos grabados: la ruta", () => {
  for (const fixture of FIXTURES) {
    const { status } = fixture.esperado.ruta;
    const llegaAlDominio = status !== 400 && status !== 401;

    it(`${fixture.nombre} → ${llegaAlDominio ? "llega al dominio" : status}`, async () => {
      const { POST } = await route();
      const response = await POST(fixtureRequest(fixture, PRIVATE_KEY));

      if (!llegaAlDominio) {
        expect(response.status).toBe(status);
        // Nunca un 500, nunca un cambio: el dominio ni se entera.
        expect(dominio.process).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({ respuesta: false });
        return;
      }

      expect(response.status).toBe(200);
      expect(dominio.process).toHaveBeenCalledTimes(1);
      const event = dominio.process.mock.calls[0]?.[0] as PagoparWebhookEvent;
      expect(event).toMatchObject(fixture.esperado.parseo as object);
      expect(event.raw).not.toHaveProperty("token");
    });
  }

  it("ningún aviso grabado hace loguear el token, la clave ni el hash", async () => {
    const { POST } = await route();
    for (const fixture of FIXTURES) await POST(fixtureRequest(fixture, PRIVATE_KEY));

    const texto = logueado();
    expect(texto).not.toContain(PRIVATE_KEY);
    expect(texto).not.toContain(webhookGuardToken(PRIVATE_KEY, FIXTURE_HASH));
    expect(texto).not.toContain(FIXTURE_HASH);
  });
});

// ---------------------------------------------------------------------------
// 3. La firma: dónde puede venir el token
// ---------------------------------------------------------------------------

describe("la firma del aviso", () => {
  const pedido = { hash_pedido: FIXTURE_HASH, pagado: true, monto: "150000" };
  const valido = () => webhookGuardToken(PRIVATE_KEY, FIXTURE_HASH);

  function post(body: unknown, query?: string): Request {
    const url = new URL("http://localhost/api/webhooks/pagopar");
    if (query !== undefined) url.searchParams.set("token", query);
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("basta con que coincida uno de los dos lugares", async () => {
    const { POST } = await route();
    const response = await POST(
      post({ resultado: [{ ...pedido, token: valido() }] }, "token-de-otro-lado")
    );
    expect(response.status).toBe(200);
  });

  it("dos tokens equivocados no suman uno bueno", async () => {
    const { POST } = await route();
    const response = await POST(
      post({ resultado: [{ ...pedido, token: "malo-1" }] }, "malo-2")
    );
    expect(response.status).toBe(401);
    expect(dominio.process).not.toHaveBeenCalled();
  });

  it("un token en el cuerpo que no es string no rompe nada: se ignora", async () => {
    const { POST } = await route();
    const conQuery = await POST(post({ resultado: [{ ...pedido, token: 12345 }] }, valido()));
    const sinQuery = await POST(post({ resultado: [{ ...pedido, token: 12345 }] }));
    expect(conQuery.status).toBe(200);
    expect(sinQuery.status).toBe(401);
  });

  it("el token del cuerpo no se guarda pero sí se devuelve en el eco", async () => {
    const { POST } = await route();
    const response = await POST(post({ resultado: [{ ...pedido, token: valido() }] }));

    const event = dominio.process.mock.calls[0]?.[0] as PagoparWebhookEvent;
    expect(event.raw).toEqual(pedido);
    expect(await response.json()).toEqual({
      respuesta: true,
      resultado: [{ ...pedido, token: valido() }],
    });
  });

  it("sin clave privada, 503 y el dominio ni se entera", async () => {
    vi.stubEnv("PAGOPAR_PRIVATE_KEY", "");
    const { POST } = await route();
    const response = await POST(post({ resultado: [pedido] }, valido()));
    expect(response.status).toBe(503);
    expect(dominio.process).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Lo que devuelve el dominio → código HTTP
// ---------------------------------------------------------------------------

describe("resultado del dominio → respuesta", () => {
  const pedido = { hash_pedido: FIXTURE_HASH, pagado: true, monto: "150000" };

  function firmado(): Request {
    const url = new URL("http://localhost/api/webhooks/pagopar");
    url.searchParams.set("token", webhookGuardToken(PRIVATE_KEY, FIXTURE_HASH));
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ respuesta: true, resultado: [pedido] }),
    });
  }

  const casos: Array<[string, WebhookOutcome]> = [
    ["aplicado", aplicado()],
    ["repetido", { kind: "repetido" }],
    ["no_pagado", { kind: "no_pagado", orderId: 1, orderNumber: "PY-000123", status: "pendiente_pago" }],
    ["estado_final", { kind: "estado_final", orderId: 1, orderNumber: "PY-000123", status: "enviado" }],
    ["sin_stock", { kind: "sin_stock", orderId: 1, orderNumber: "PY-000123", status: "vencido" }],
  ];

  for (const [nombre, outcome] of casos) {
    it(`${nombre} → 200 con el eco del pedido`, async () => {
      dominio.process.mockResolvedValue(outcome);
      const { POST } = await route();
      const response = await POST(firmado());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ respuesta: true, resultado: [pedido] });
    });
  }

  it("'no pagado' sobre un pedido ya cobrado deja un log.error (¿reversión?)", async () => {
    dominio.process.mockResolvedValue({
      kind: "no_pagado",
      orderId: 1,
      orderNumber: "PY-000777",
      status: "pagado",
    });
    const { POST } = await route();
    const response = await POST(firmado());

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("PY-000777"));
  });

  it("'no pagado' sobre un pedido pendiente es sólo informativo", async () => {
    dominio.process.mockResolvedValue({
      kind: "no_pagado",
      orderId: 1,
      orderNumber: "PY-000778",
      status: "pendiente_pago",
    });
    const { POST } = await route();
    await POST(firmado());
    expect(console.error).not.toHaveBeenCalled();
  });

  it("pedido desconocido → 404, monto distinto → 409, falla nuestra → 500", async () => {
    const { UnknownPagoparOrderError, PagoparAmountMismatchError } = await import(
      "../../src/domain/pagopar/webhook"
    );
    const { POST } = await route();

    dominio.process.mockRejectedValueOnce(new UnknownPagoparOrderError());
    expect((await POST(firmado())).status).toBe(404);

    dominio.process.mockRejectedValueOnce(
      new PagoparAmountMismatchError("PY-000123", 150_000, 1_000)
    );
    expect((await POST(firmado())).status).toBe(409);

    dominio.process.mockRejectedValueOnce(new Error("la base dijo que no"));
    expect((await POST(firmado())).status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 5. La lectura del cuerpo, caso por caso
// ---------------------------------------------------------------------------

describe("decodeWebhookText", () => {
  it("saca el BOM y los espacios", () => {
    expect(decodeWebhookText('﻿ \n {"a":1} \n')).toEqual({ a: 1 });
  });

  it("parsea JSON aunque el content-type diga otra cosa", () => {
    expect(decodeWebhookText('[{"a":1}]', "application/x-www-form-urlencoded")).toEqual([
      { a: 1 },
    ]);
  });

  it("arma un objeto con un form-encoded y parsea los valores que son JSON", () => {
    const body = new URLSearchParams({ resultado: '[{"a":1}]', respuesta: "true" }).toString();
    expect(decodeWebhookText(body, "application/x-www-form-urlencoded")).toEqual({
      resultado: [{ a: 1 }],
      respuesta: "true",
    });
  });

  it("un form con un solo campo JSON es ese JSON", () => {
    const body = new URLSearchParams({ x: '{"resultado":[]}' }).toString();
    expect(decodeWebhookText(body)).toEqual({ resultado: [] });
  });

  it("un form con un solo campo que no es JSON queda como objeto", () => {
    expect(decodeWebhookText("hash_pedido=abc")).toEqual({ hash_pedido: "abc" });
  });

  it("un campo repetido es ambiguo y se rechaza", () => {
    expect(() => decodeWebhookText("monto=1&monto=2")).toThrow(PagoparProtocolError);
  });

  it("vacío, JSON roto o texto suelto se rechazan", () => {
    for (const body of ["", "   ", "﻿", "{ roto", "[1,", "pago ok"]) {
      expect(() => decodeWebhookText(body, "text/plain"), JSON.stringify(body)).toThrow(
        PagoparProtocolError
      );
    }
  });
});

describe("readWebhookBody", () => {
  it("rechaza por content-length sin leer el cuerpo", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-length": String(WEBHOOK_MAX_BODY_BYTES + 1) },
      body: "{}",
    });
    await expect(readWebhookBody(request)).rejects.toBeInstanceOf(PagoparProtocolError);
  });

  it("rechaza un cuerpo más grande que el tope aunque no lo declare", async () => {
    const enorme = JSON.stringify({ relleno: "x".repeat(WEBHOOK_MAX_BODY_BYTES) });
    const request = new Request("http://localhost/x", { method: "POST", body: enorme });
    await expect(readWebhookBody(request)).rejects.toBeInstanceOf(PagoparProtocolError);
  });

  it("un aviso grande pero razonable pasa", async () => {
    const body = JSON.stringify({ resultado: [{ hash_pedido: "h", monto: "1", nota: "x".repeat(10_000) }] });
    const request = new Request("http://localhost/x", { method: "POST", body });
    await expect(readWebhookBody(request)).resolves.toMatchObject({ resultado: [{ hash_pedido: "h" }] });
  });
});

describe("parseWebhookEvent: varios elementos", () => {
  const uno = { hash_pedido: FIXTURE_HASH, pagado: true, monto: "150000" };

  it("el mismo aviso repetido adentro del POST se toma una vez", () => {
    expect(parseWebhookEvent({ resultado: [uno, { ...uno, monto: "150000.00" }] }).montoPyg).toBe(
      150_000
    );
  });

  it("mismo hash pero distinto estado o monto: ambiguo", () => {
    expect(() => parseWebhookEvent({ resultado: [uno, { ...uno, pagado: false }] })).toThrow(
      PagoparProtocolError
    );
    expect(() => parseWebhookEvent({ resultado: [uno, { ...uno, monto: "1" }] })).toThrow(
      PagoparProtocolError
    );
  });

  it("un elemento que no es un pedido hace fallar el aviso entero", () => {
    expect(() => parseWebhookEvent({ resultado: [uno, "basura"] })).toThrow(PagoparProtocolError);
  });

  it("los errores no repiten valores del cuerpo", () => {
    for (const body of [
      { resultado: [{ ...uno, monto: "150.000" }] },
      { resultado: [{ ...uno, pagado: "quizas" }] },
      { resultado: [{ pagado: true, monto: "1" }] },
    ]) {
      try {
        parseWebhookEvent(body);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(PagoparProtocolError);
        expect((error as Error).message).not.toContain("150.000");
        expect((error as Error).message).not.toContain("quizas");
      }
    }
  });
});

describe("webhookResponseBody", () => {
  it("un evento armado a mano (sin `received`) devuelve `raw`", () => {
    const event: PagoparWebhookEvent = {
      hashPedido: FIXTURE_HASH,
      pagado: true,
      montoPyg: 1,
      raw: { hash_pedido: FIXTURE_HASH },
    };
    expect(webhookResponseBody(event)).toEqual({
      respuesta: true,
      resultado: [{ hash_pedido: FIXTURE_HASH }],
    });
  });
});
