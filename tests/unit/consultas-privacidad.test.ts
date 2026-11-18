import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";

import { enquiryDaily, searchDaily } from "@/db/schema";
import { normalizarTermino, parsearConsulta } from "@/domain/consultas";

/**
 * La privacidad de los conteos de O33 es un test, no un comentario
 * (`fable/plan-trafico.md` §2.2): ninguna columna de `enquiry_daily` ni de
 * `search_daily` puede guardar una IP, un user agent, una cookie, una sesión,
 * un teléfono, un e-mail ni texto libre que no sea el término normalizado.
 *
 * Si este test falla porque alguien sumó una columna, la pregunta no es "cómo
 * lo arreglo", es "¿de verdad hace falta guardar eso de cada persona?".
 */

const PERMITIDAS = {
  enquiry_daily: ["id", "day", "product_id", "variant_id", "origin", "count"],
  search_daily: ["id", "day", "term", "zero_results", "count"],
};

const PROHIBIDO =
  /ip|agent|ua$|cookie|session|sesion|phone|telefono|tel$|mail|correo|message|mensaje|texto|text|nombre|name|referer|referrer|url|user|customer|cliente/i;

describe("O33 · las tablas de conteo no pueden guardar datos de nadie", () => {
  for (const tabla of [enquiryDaily, searchDaily]) {
    const config = getTableConfig(tabla);
    it(`${config.name} tiene exactamente las columnas permitidas`, () => {
      expect(config.columns.map((c) => c.name).sort()).toEqual(
        [...PERMITIDAS[config.name as keyof typeof PERMITIDAS]].sort()
      );
      expect(config.foreignKeys).toHaveLength(0);
    });

    it(`${config.name}: ningún nombre de columna es de un dato personal`, () => {
      for (const columna of config.columns)
        expect(columna.name, columna.name).not.toMatch(PROHIBIDO);
    });

    it(`${config.name}: sólo números, fechas, booleanos y enums, salvo el término`, () => {
      for (const columna of config.columns) {
        if (config.name === "search_daily" && columna.name === "term") {
          expect(columna.getSQLType()).toBe("varchar(80)");
          continue;
        }
        expect(columna.getSQLType(), columna.name).toMatch(
          /^(int|int unsigned|date|boolean|enum\(.*\))$/
        );
      }
    });
  }

  it("un teléfono, un documento o un e-mail no llegan nunca a `term`", () => {
    for (const dato of [
      "0981123456",
      "0981 123 456",
      "+595 (981) 123-456",
      "ci 4.123.456",
      "1234567",
      "4111 1111 1111 1111",
      "ana@example.com",
      "escribime a ana @ gmail",
    ])
      expect(normalizarTermino(dato), dato).toBeNull();
    // Números cortos sí: un talle, un modelo, un año.
    expect(normalizarTermino("anillo 18k")).toBe("anillo 18k");
    expect(normalizarTermino("Mesa 120 x 80")).toBe("mesa 120 x 80");
    expect(normalizarTermino("modelo 2026")).toBe("modelo 2026");
  });

  it("el beacon no puede colar texto libre: sólo origen y dos números", () => {
    expect(parsearConsulta({ o: "producto", p: 1, v: 2, m: "hola" })).toEqual({
      origin: "producto",
      productId: 1,
      variantId: 2,
    });
    expect(parsearConsulta({ o: "producto", p: "0981123456" })).toBeNull();
    expect(parsearConsulta({ o: "whatsapp de ana", p: 1 })).toBeNull();
  });
});
