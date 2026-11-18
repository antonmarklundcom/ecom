import { describe, expect, it, vi } from "vitest";

import {
  MAX_TERMINOS_POR_DIA,
  diaPY,
  diaPYMenos,
  esPrefetch,
  esRobot,
  normalizarTermino,
  parsearConsulta,
  primerDiaConservado,
} from "@/domain/consultas";
import { atributosConsulta, cuerpoDesdeLink } from "@/lib/consulta-click";
import { leadPayloads, sendLeadEvent } from "@/lib/funnel";

describe("O33 · normalizarTermino", () => {
  it("minúsculas, espacios colapsados, recortado", () => {
    expect(normalizarTermino("  Anillo   de ORO \n")).toBe("anillo de oro");
    expect(normalizarTermino("a")).toBeNull();
    expect(normalizarTermino("")).toBeNull();
    expect(normalizarTermino(undefined)).toBeNull();
    expect(normalizarTermino("x".repeat(200))).toHaveLength(80);
  });
  it("siete dígitos seguidos o una arroba: no se guarda", () => {
    expect(normalizarTermino("123456")).toBe("123456");
    expect(normalizarTermino("1234567")).toBeNull();
    expect(normalizarTermino("0981-123-456")).toBeNull();
    expect(normalizarTermino("a@b")).toBeNull();
  });
});

describe("O33 · parsearConsulta", () => {
  it("acepta sólo los orígenes de la lista fija", () => {
    for (const o of ["producto", "tarjeta", "flotante", "guia", "contacto"])
      expect(parsearConsulta({ o, p: 3 })?.origin).toBe(o);
    expect(parsearConsulta({ o: "otro", p: 3 })).toBeNull();
    expect(parsearConsulta(null)).toBeNull();
    expect(parsearConsulta([])).toBeNull();
    expect(parsearConsulta("producto")).toBeNull();
  });
  it("producto y tarjeta exigen producto; la variante exige producto", () => {
    expect(parsearConsulta({ o: "producto" })).toBeNull();
    expect(parsearConsulta({ o: "tarjeta" })).toBeNull();
    expect(parsearConsulta({ o: "flotante" })).toEqual({
      origin: "flotante",
      productId: 0,
      variantId: 0,
    });
    expect(parsearConsulta({ o: "guia", v: 4 })).toBeNull();
  });
  it("ids enteros positivos y nada más", () => {
    expect(parsearConsulta({ o: "producto", p: -1 })).toBeNull();
    expect(parsearConsulta({ o: "producto", p: 1.5 })).toBeNull();
    expect(parsearConsulta({ o: "producto", p: 2 ** 40 })).toBeNull();
    expect(parsearConsulta({ o: "producto", p: 1, v: "2" })).toBeNull();
  });
});

describe("O33 · robots y prefetch", () => {
  it("un user agent de robot, o ninguno, no cuenta", () => {
    expect(esRobot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(esRobot("facebookexternalhit/1.1")).toBe(true);
    expect(esRobot("curl/8.0")).toBe(true);
    expect(esRobot(null)).toBe(true);
    expect(
      esRobot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36")
    ).toBe(false);
  });
  it("un prefetch no es una búsqueda", () => {
    expect(esPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(esPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(esPrefetch(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(esPrefetch(new Headers())).toBe(false);
  });
  it("el tope de términos nuevos por día es 500", () => {
    expect(MAX_TERMINOS_POR_DIA).toBe(500);
  });
});

describe("O33 · días paraguayos", () => {
  it("el día es el de Asunción, no el de UTC", () => {
    // 01:30 UTC del 13 = 22:30 del 12 en Asunción.
    expect(diaPY(new Date("2026-08-13T01:30:00Z"))).toBe("2026-08-12");
    expect(diaPYMenos(new Date("2026-08-13T01:30:00Z"), 6)).toBe("2026-08-06");
    expect(diaPYMenos(new Date("2026-03-01T15:00:00Z"), 1)).toBe("2026-02-28");
  });
  it("se conservan 13 meses", () => {
    expect(primerDiaConservado(new Date("2026-11-18T15:00:00Z"))).toBe("2025-10-18");
    expect(primerDiaConservado(new Date("2026-01-05T15:00:00Z"))).toBe("2024-12-05");
  });
});

describe("O33 · el link y el beacon", () => {
  it("atributosConsulta arma los data-* y omite lo que no hay", () => {
    expect(atributosConsulta("flotante")).toEqual({ "data-consulta": "flotante" });
    expect(atributosConsulta("producto", { productId: 7, variantId: 9, sku: "A-1" })).toEqual({
      "data-consulta": "producto",
      "data-consulta-producto": "7",
      "data-consulta-variante": "9",
      "data-consulta-sku": "A-1",
    });
  });
  it("cuerpoDesdeLink lee sólo origen y números (el SKU no viaja al servidor)", () => {
    const atributos: Record<string, string> = {
      "data-consulta": "producto",
      "data-consulta-producto": "7",
      "data-consulta-variante": "x",
      "data-consulta-sku": "A-1",
    };
    const link = { getAttribute: (name: string) => atributos[name] ?? null } as unknown as Element;
    expect(cuerpoDesdeLink(link)).toEqual({ o: "producto", p: 7 });
  });
});

describe("O33 · generate_lead / Contact", () => {
  it("sin GA4 ni pixel no manda nada", () => {
    expect(sendLeadEvent("producto", "A-1", {})).toBe(false);
  });
  it("con los dos cargados, manda generate_lead y Contact", () => {
    const gtag = vi.fn();
    const fbq = vi.fn();
    expect(sendLeadEvent("producto", "A-1", { gtag, fbq })).toBe(true);
    const { ga4, meta } = leadPayloads("producto", "A-1");
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", ga4);
    expect(fbq).toHaveBeenCalledWith("track", "Contact", meta);
    expect(meta.content_ids).toEqual(["A-1"]);
    expect(leadPayloads("flotante", null).ga4).toEqual({ lead_source: "whatsapp_flotante" });
  });
});
