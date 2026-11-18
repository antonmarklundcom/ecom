import { afterEach, describe, expect, it, vi } from "vitest";

import { MARCA_PLACEHOLDER, TIENDA } from "@/config/tienda";
import {
  MODO_VENTA_POR_DEFECTO,
  conModoVenta,
  esModoVenta,
  saleModeEfectivo,
  tomaPedidos,
} from "@/domain/modo-venta";
import { avisosDeCobroAplican } from "@/domain/launch-checks";
import { preflight, type PreflightEnv } from "@/domain/preflight";
import {
  DEFAULT_STORE_SETTINGS,
  SECTION_INPUT,
  parseStoreSettings,
  ventasEfectivas,
} from "@/domain/store-settings-schema";

import {
  escribirModoVentaTienda,
  leerModoVentaActual,
  parseFlags,
} from "../../scripts/nueva-tienda";

/**
 * Modo de venta (O32, fable/plan-trafico.md §2.1): la regla pura, el ajuste,
 * el preflight y `pnpm nueva-tienda --modo`. Lo que necesita la base (el
 * pedido rechazado) está en `tests/integration/modo-venta.test.ts`.
 */

describe("saleModeEfectivo: la única regla", () => {
  it("en carrito no cambia nada, tampoco el `undefined`", () => {
    for (const modo of ["stock", "enquiry", "showcase", undefined] as const)
      expect(saleModeEfectivo(modo, "carrito")).toBe(modo);
    expect(saleModeEfectivo("stock")).toBe("stock");
  });

  it("en consulta `stock` (o sin dato) es `enquiry`; `showcase` sigue igual", () => {
    expect(saleModeEfectivo("stock", "consulta")).toBe("enquiry");
    expect(saleModeEfectivo(undefined, "consulta")).toBe("enquiry");
    expect(saleModeEfectivo("enquiry", "consulta")).toBe("enquiry");
    expect(saleModeEfectivo("showcase", "consulta")).toBe("showcase");
  });

  it("conModoVenta devuelve el mismo objeto si no cambia, y nunca toca el original", () => {
    const producto = { slug: "a", saleMode: "stock" as const };
    expect(conModoVenta(producto, "carrito")).toBe(producto);
    const vista = conModoVenta(producto, "consulta");
    expect(vista).toEqual({ slug: "a", saleMode: "enquiry" });
    expect(producto.saleMode).toBe("stock");
    const muestra = { slug: "b", saleMode: "showcase" as const };
    expect(conModoVenta(muestra, "consulta")).toBe(muestra);
  });

  it("sólo carrito toma pedidos", () => {
    expect(tomaPedidos("carrito")).toBe(true);
    expect(tomaPedidos("consulta")).toBe(false);
    expect(avisosDeCobroAplican("carrito")).toBe(true);
    expect(avisosDeCobroAplican("consulta")).toBe(false);
  });

  it("esModoVenta", () => {
    expect(esModoVenta("carrito")).toBe(true);
    expect(esModoVenta("consulta")).toBe(true);
    expect(esModoVenta("tienda")).toBe(false);
    expect(esModoVenta(null)).toBe(false);
  });
});

describe("el ajuste `ventas`", () => {
  it.skipIf(TIENDA.nombre !== MARCA_PLACEHOLDER)(
    "el template sale de fábrica con carrito",
    () => {
      expect(TIENDA.modoVenta).toBe("carrito");
      expect(MODO_VENTA_POR_DEFECTO).toBe("carrito");
    }
  );

  it("sin decisión manda tienda.ts; con decisión, el panel", () => {
    expect(DEFAULT_STORE_SETTINGS.ventas.modo).toBeNull();
    expect(ventasEfectivas(DEFAULT_STORE_SETTINGS.ventas, "carrito")).toBe(
      "carrito"
    );
    expect(ventasEfectivas(DEFAULT_STORE_SETTINGS.ventas, "consulta")).toBe(
      "consulta"
    );
    expect(ventasEfectivas({ modo: "consulta" }, "carrito")).toBe("consulta");
    expect(ventasEfectivas({ modo: "carrito" }, "consulta")).toBe("carrito");
  });

  it("una fila rota o vieja se lee como 'sin decisión', nunca tira", () => {
    expect(parseStoreSettings({}).ventas.modo).toBeNull();
    expect(parseStoreSettings({ ventas: { modo: "gratis" } }).ventas.modo).toBeNull();
    expect(parseStoreSettings({ ventas: "x" }).ventas.modo).toBeNull();
    expect(parseStoreSettings({ ventas: { modo: "consulta" } }).ventas.modo).toBe(
      "consulta"
    );
  });

  it("la escritura acepta carrito, consulta o vacío, y rechaza el resto", () => {
    expect(SECTION_INPUT.ventas.parse({ modo: "consulta" })).toEqual({
      modo: "consulta",
    });
    expect(SECTION_INPUT.ventas.parse({ modo: "" })).toEqual({ modo: null });
    expect(SECTION_INPUT.ventas.parse({})).toEqual({ modo: null });
    expect(SECTION_INPUT.ventas.safeParse({ modo: "tienda" }).success).toBe(false);
    expect(
      SECTION_INPUT.ventas.safeParse({ modo: "consulta", otro: 1 }).success
    ).toBe(false);
  });
});

/** Un entorno de producción sin nada de cobro: el de una tienda de consulta. */
function envConsulta(overrides: PreflightEnv = {}): PreflightEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "mysql://tienda@db.hostinger.py:3306/tienda",
    SESSION_SECRET: "u".repeat(43),
    CRON_SECRET: "c".repeat(32),
    NEXT_PUBLIC_SITE_URL: "https://tienda.com.py",
    ...overrides,
  };
}

function check(report: ReturnType<typeof preflight>, id: string) {
  const encontrado = report.checks.find((item) => item.id === id);
  if (!encontrado) throw new Error(`no existe el control "${id}"`);
  return encontrado;
}

describe("preflight en modo consulta", () => {
  it("banco, medios de pago y Pagopar dicen 'no aplica' y no bloquean", () => {
    const report = preflight(envConsulta({ WHATSAPP_NUMBER: "+595971000111" }), undefined, {
      modoVenta: "consulta",
      pagos: { lectura: "ok", metodosPago: null, bancoEnPanel: false },
    });
    for (const id of [
      "banco",
      "medios_pago",
      "pagopar_credenciales",
      "pagopar_mode",
      "pagopar_webhook_envelope",
      "aviso_pedido_nuevo",
    ]) {
      expect(check(report, id).severity, id).toBe("ok");
      expect(check(report, id).detail, id).toMatch(/no aplica/);
    }
    expect(check(report, "modo_venta").detail).toMatch(/^consulta/);
    expect(check(report, "whatsapp").severity).toBe("ok");
  });

  it("sin WhatsApp público, bloquea", () => {
    const report = preflight(envConsulta({ WHATSAPP_NUMBER: "" }), undefined, {
      modoVenta: "consulta",
    });
    const whatsapp = check(report, "whatsapp");
    expect(whatsapp.severity).toBe("bloquea");
    expect(whatsapp.detail).toMatch(/modo consulta/);
    expect(report.ok).toBe(false);
  });

  it("el WhatsApp de /admin/ajustes → Contacto alcanza", () => {
    const report = preflight(envConsulta({ WHATSAPP_NUMBER: "" }), undefined, {
      modoVenta: "consulta",
      whatsappPublico: "+595981222333",
    });
    expect(check(report, "whatsapp").severity).toBe("ok");
  });

  it("en carrito el reporte es el de siempre: sin línea de modo, y el banco cuenta", () => {
    const report = preflight(envConsulta({ WHATSAPP_NUMBER: "" }), undefined, {
      modoVenta: "carrito",
      whatsappPublico: "+595981222333",
    });
    expect(report.checks.some((item) => item.id === "modo_venta")).toBe(false);
    expect(check(report, "banco").detail).not.toMatch(/no aplica/);
    // El WhatsApp del panel no reemplaza a WHATSAPP_NUMBER en carrito: ahí
    // también es el destino de los avisos al dueño.
    expect(check(report, "whatsapp").severity).toBe("bloquea");
  });
});

describe("pnpm nueva-tienda --modo", () => {
  const TIENDA_TS = `export type Tienda = {
  cuentasClientes: boolean;
  modoVenta?: ModoVenta;
};
export const TIENDA: Tienda = {
  nombre: "X",
  cuentasClientes: false,
  modoVenta: "carrito",
  hero: null,
};
`;

  it("la bandera se lee", () => {
    expect(parseFlags(["--modo", "consulta"]).modo).toBe("consulta");
  });

  it("reescribe el campo, y es idempotente", () => {
    const nuevo = escribirModoVentaTienda(TIENDA_TS, "consulta");
    expect(nuevo).toContain('  modoVenta: "consulta",');
    expect(leerModoVentaActual(nuevo)).toBe("consulta");
    expect(escribirModoVentaTienda(nuevo, "consulta")).toBe(nuevo);
    expect(leerModoVentaActual(escribirModoVentaTienda(nuevo, "carrito"))).toBe(
      "carrito"
    );
  });

  it("sin el campo en TIENDA lo agrega abajo de cuentasClientes", () => {
    const sinCampo = TIENDA_TS.replace('  modoVenta: "carrito",\n', "");
    expect(leerModoVentaActual(sinCampo)).toBe("carrito");
    expect(escribirModoVentaTienda(sinCampo, "carrito")).toBe(sinCampo);
    const nuevo = escribirModoVentaTienda(sinCampo, "consulta");
    expect(nuevo).toContain('  cuentasClientes: false,\n  modoVenta: "consulta",');
  });

  it("un tienda.ts de antes de O32 con consulta falla diciendo qué agregar", () => {
    const viejo = `export type Tienda = { cuentasClientes: boolean };
export const TIENDA: Tienda = {
  cuentasClientes: false,
};
`;
    expect(escribirModoVentaTienda(viejo, "carrito")).toBe(viejo);
    expect(() => escribirModoVentaTienda(viejo, "consulta")).toThrow(/modoVenta/);
  });

  it("un modo desconocido es un error", () => {
    expect(() => escribirModoVentaTienda(TIENDA_TS, "tienda")).toThrow(
      /no es un modo de venta/
    );
  });

  it("el tienda.ts del template tiene el campo que el script reescribe", async () => {
    const { readFile } = await import("node:fs/promises");
    const fuente = await readFile("src/config/tienda.ts", "utf8");
    expect(leerModoVentaActual(fuente)).toBe(TIENDA.modoVenta ?? "carrito");
  });
});

describe("las páginas de pedido en modo consulta", () => {
  afterEach(() => {
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/lib/modo-venta");
    vi.resetModules();
  });

  async function conModo(tomaPedidos: boolean) {
    const notFound = vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    vi.doMock("next/navigation", () => ({ notFound }));
    vi.doMock("@/lib/modo-venta", () => ({
      tiendaTomaPedidos: async () => tomaPedidos,
      modoVentaEfectivo: async () => (tomaPedidos ? "carrito" : "consulta"),
    }));
    return notFound;
  }

  it("/pedido/buscar es 404 en consulta y existe en carrito", async () => {
    const notFound = await conModo(false);
    const { default: Pagina } = await import("../../src/app/pedido/buscar/page");
    await expect(Pagina()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();

    vi.resetModules();
    const notFound2 = await conModo(true);
    const { default: Pagina2 } = await import("../../src/app/pedido/buscar/page");
    await expect(Pagina2()).resolves.toBeTruthy();
    expect(notFound2).not.toHaveBeenCalled();
  });

  it("/checkout es 404 en consulta, antes de leer nada", async () => {
    const notFound = await conModo(false);
    const { default: Pagina } = await import("../../src/app/checkout/page");
    await expect(Pagina()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("la acción del checkout rechaza un POST armado en consulta", async () => {
    await conModo(false);
    const { submitCheckout } = await import("../../src/app/actions/checkout");
    const resultado = await submitCheckout({ items: [{ variantId: 1, qty: 1 }] });
    expect(resultado).toMatchObject({ ok: false });
    expect(resultado.ok ? "" : resultado.error).toMatch(/no está tomando pedidos/);
  });
});
