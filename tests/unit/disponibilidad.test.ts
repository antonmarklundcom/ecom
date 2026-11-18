import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  SCHEMA_DISPONIBILIDAD,
  VIGENCIA_STOCK_EXTERNO_DIAS,
  disponibilidad,
  disponibilidadPorVariante,
  resumenDisponibilidad,
  stockExternoVigente,
} from "@/domain/disponibilidad";

/**
 * La disponibilidad que se le dice a la compradora y a Google (O35,
 * fable/plan-trafico.md §2.4): una fila de la tabla por test.
 */
const AHORA = new Date("2026-11-18T15:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * DIA);

describe("disponibilidad · las filas de §2.4", () => {
  it("stock propio disponible > 0 → en stock, en cualquier modo", () => {
    expect(disponibilidad({ saleMode: "stock", disponible: 3 })).toBe("en_stock");
    expect(disponibilidad({ saleMode: "stock", modo: "consulta", disponible: 3 })).toBe("en_stock");
    expect(disponibilidad({ saleMode: "enquiry", disponible: 1 })).toBe("en_stock");
    expect(disponibilidad({ disponible: 2 })).toBe("en_stock");
  });

  it("enquiry por columna, sin dato de proveedor → por encargo", () => {
    expect(disponibilidad({ saleMode: "enquiry", disponible: 0 })).toBe("por_encargo");
  });

  it("stock en modo consulta, sin nada disponible → por encargo", () => {
    expect(disponibilidad({ saleMode: "stock", modo: "consulta", disponible: 0 })).toBe("por_encargo");
    expect(disponibilidad({ modo: "consulta", disponible: 0 })).toBe("por_encargo");
  });

  it("enquiry con proveedor que tiene stock mirado hace menos de 7 días → en stock", () => {
    const externo = { stock: 4, miradoEl: haceDias(2) };
    expect(disponibilidad({ saleMode: "enquiry", disponible: 0, externo, ahora: AHORA })).toBe("en_stock");
    expect(
      disponibilidad({ saleMode: "stock", modo: "consulta", disponible: 0, externo, ahora: AHORA })
    ).toBe("en_stock");
  });

  it("…pero mirado hace más de 7 días, sin fecha, en 0, sin número o en el futuro → por encargo", () => {
    for (const externo of [
      { stock: 4, miradoEl: haceDias(VIGENCIA_STOCK_EXTERNO_DIAS + 0.01) },
      { stock: 4, miradoEl: null },
      { stock: 0, miradoEl: haceDias(1) },
      { stock: null, miradoEl: haceDias(1) },
      { stock: 4, miradoEl: new Date(AHORA.getTime() + DIA) },
    ]) {
      expect(disponibilidad({ saleMode: "enquiry", disponible: 0, externo, ahora: AHORA })).toBe(
        "por_encargo"
      );
    }
    // Justo en el límite de 7 días todavía vale.
    expect(stockExternoVigente({ stock: 1, miradoEl: haceDias(VIGENCIA_STOCK_EXTERNO_DIAS) }, AHORA)).toBe(
      true
    );
  });

  it("stock en modo carrito sin nada disponible → agotado (como siempre), aunque el proveedor tenga", () => {
    expect(disponibilidad({ saleMode: "stock", disponible: 0 })).toBe("agotado");
    expect(
      disponibilidad({
        saleMode: "stock",
        disponible: 0,
        externo: { stock: 9, miradoEl: haceDias(1) },
        ahora: AHORA,
      })
    ).toBe("agotado");
  });

  it("showcase → sin disponibilidad (null), en cualquier modo", () => {
    expect(disponibilidad({ saleMode: "showcase", disponible: 5 })).toBeNull();
    expect(disponibilidad({ saleMode: "showcase", modo: "consulta", disponible: 0 })).toBeNull();
  });

  it("cada palabra tiene su término de schema.org", () => {
    expect(SCHEMA_DISPONIBILIDAD).toEqual({
      en_stock: "https://schema.org/InStock",
      por_encargo: "https://schema.org/BackOrder",
      agotado: "https://schema.org/OutOfStock",
    });
  });
});

describe("disponibilidad · por variante y resumen", () => {
  it("el resumen toma la mejor palabra de las variantes", () => {
    expect(resumenDisponibilidad(["agotado", "por_encargo"])).toBe("por_encargo");
    expect(resumenDisponibilidad(["agotado", "en_stock", null])).toBe("en_stock");
    expect(resumenDisponibilidad([null])).toBeNull();
    expect(resumenDisponibilidad([])).toBeNull();
  });

  it("disponibilidadPorVariante usa el dato de proveedor de cada variante por id", () => {
    const resultado = disponibilidadPorVariante(
      {
        saleMode: "enquiry",
        variants: [
          { id: 1, sku: "A", available: 0 },
          { id: 2, sku: "B", available: 0 },
        ],
      },
      {
        modo: "carrito",
        externos: new Map([[2, { stock: 3, miradoEl: haceDias(1) }]]),
        ahora: AHORA,
      }
    );
    expect(resultado).toEqual({
      porSku: { A: "por_encargo", B: "en_stock" },
      producto: "en_stock",
    });
  });
});

describe("una sola fuente para la ficha", () => {
  it("la página decide una vez y pasa el mismo resultado a la línea visible y al JSON-LD", async () => {
    const page = await readFile("src/app/producto/[slug]/page.tsx", "utf8");
    expect(page.match(/disponibilidadDelProducto\(/g)).toHaveLength(1);
    expect(page).toContain("disponibilidad: disponibilidad.porSku");
    expect(page).toContain("disponibilidad={disponibilidad.porSku}");
    // Ni la página ni el botón recalculan: no importan la regla pura.
    const boton = await readFile("src/components/add-to-cart.tsx", "utf8");
    for (const codigo of [page, boton])
      expect(codigo).not.toMatch(
        /\bdisponibilidad\(\{|disponibilidadPorVariante|resumenDisponibilidad|stockExternoVigente/
      );
  });
});
