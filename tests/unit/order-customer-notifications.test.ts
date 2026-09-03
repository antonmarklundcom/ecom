import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TIENDA } from "@/config/tienda";
import {
  customerNoticeBody,
  resolveCustomerNotifier,
  type CustomerNoticeOrder,
} from "@/domain/order-customer-notifications";

/**
 * Los tres avisos a la compradora (fase O3): confirmado, pagado, enviado.
 *
 * Mismo criterio que `order-notifications.test.ts` para el aviso al comercio:
 * el texto se testea sin red, y el interruptor (`resolveCustomerNotifier`) se
 * testea por separado de a una variable por vez.
 */

const order: CustomerNoticeOrder = {
  orderId: 12,
  orderNumber: "PY-000042",
  customerName: "Rosa Giménez",
  accessToken: "a".repeat(64),
  totalPyg: 1_250_000,
  shippingMethodName: "Moto Asunción",
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tienda.com.py");
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("customerNoticeBody · confirmado", () => {
  it("lleva número, total, el nombre de la tienda y el link al pedido", () => {
    const body = customerNoticeBody("confirmado", order);

    expect(body).toContain("PY-000042");
    expect(body).toContain("₲ 1.250.000");
    expect(body).toContain(TIENDA.nombre);
    expect(body).toContain("Rosa");
    expect(body).toContain(`https://tienda.com.py/pedido/PY-000042?t=${order.accessToken}`);
  });

  it("con método de envío, lo menciona", () => {
    expect(customerNoticeBody("confirmado", order)).toContain("Moto Asunción");
  });

  it("sin método de envío (pedido viejo), no inventa la línea", () => {
    const body = customerNoticeBody("confirmado", { ...order, shippingMethodName: null });
    expect(body).not.toContain("Entrega:");
  });

  it("no lleva el teléfono de nadie", () => {
    expect(customerNoticeBody("confirmado", order)).not.toMatch(/\+595/);
  });
});

describe("customerNoticeBody · pagado", () => {
  it("lleva número, total y el link, sin el detalle de lo comprado", () => {
    const body = customerNoticeBody("pagado", order);

    expect(body).toContain("PY-000042");
    expect(body).toContain("₲ 1.250.000");
    expect(body).toContain(`https://tienda.com.py/pedido/PY-000042?t=${order.accessToken}`);
  });
});

describe("customerNoticeBody · enviado", () => {
  it("lleva el método de envío cuando existe", () => {
    expect(customerNoticeBody("enviado", order)).toContain("Moto Asunción");
  });

  it("sin método de envío, no inventa la línea", () => {
    const body = customerNoticeBody("enviado", { ...order, shippingMethodName: null });
    expect(body).not.toContain("Entrega:");
  });

  it("con nota del admin (número de seguimiento), la incluye", () => {
    const body = customerNoticeBody("enviado", order, { note: "Seguimiento: ABC123" });
    expect(body).toContain("Seguimiento: ABC123");
  });

  it("sin nota, no deja una línea vacía", () => {
    const body = customerNoticeBody("enviado", order, { note: "" });
    expect(body).not.toContain("Nota:");
  });
});

describe("resolveCustomerNotifier — sin plantilla, apagado en cualquier canal", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_CLOUD_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_NAME", "");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_CLIENTE_CONFIRMADO", "");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_CLIENTE_PAGADO", "");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_CLIENTE_ENVIADO", "");
  });

  it("sin la plantilla de ese aviso, ni siquiera el sender de consola de dev manda algo", () => {
    // A diferencia del aviso al comercio, acá no hay sender de respaldo: cuál
    // de los tres avisos manda cada tienda es una decisión suya.
    expect(resolveCustomerNotifier("confirmado")).toBeNull();
  });

  it("cada plantilla enciende sólo su propio aviso", () => {
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_CLIENTE_PAGADO", "cliente_pagado");

    expect(resolveCustomerNotifier("confirmado")).toBeNull();
    expect(resolveCustomerNotifier("enviado")).toBeNull();
    expect(resolveCustomerNotifier("pagado")?.sender.channel).toBe("consola");
  });

  it("en producción, sin la plantilla, sigue apagado aunque exista Cloud", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_CLOUD_ACCESS_TOKEN", "token");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_NAME", "login_otp");

    expect(resolveCustomerNotifier("pagado")).toBeNull();
  });

  it("con Cloud completo y la plantilla de este aviso, manda por WhatsApp con esa plantilla", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_CLOUD_ACCESS_TOKEN", "token");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_NAME", "login_otp");
    vi.stubEnv("WHATSAPP_CLOUD_TEMPLATE_CLIENTE_ENVIADO", "cliente_enviado");

    const notifier = resolveCustomerNotifier("enviado");

    expect(notifier?.sender.channel).toBe("whatsapp");
    expect(notifier?.templateName).toBe("cliente_enviado");
  });
});
