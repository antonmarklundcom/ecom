import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { OrderStatus } from "../../src/db/schema";
import { webhookGuardToken } from "../../src/domain/pagopar/hash";

/**
 * Los avisos grabados de `tests/fixtures/pagopar/` (ver el README de esa
 * carpeta) y cómo convertirlos en el `Request` que postearía Pagopar.
 *
 * El token nunca está en el archivo: se calcula acá con la clave de mentira
 * que pase cada test.
 */

export const FIXTURES_DIR = path.join(import.meta.dirname, "..", "fixtures", "pagopar");

/** El `hash_pedido` de todos los archivos. */
export const FIXTURE_HASH = "b92a3c6e319f08e49500328cbd342db19cf1cf07eab118414716a5f66d20cee3";

/** El total que tienen que tener los pedidos sembrados para estos avisos. */
export const FIXTURE_TOTAL_PYG = 150_000;

export type PagoparFixture = {
  nombre: string;
  descripcion: string;
  origen: "repo" | "hipotesis" | "sintetico" | "real";
  contentType: string;
  token: "query" | "cuerpo" | "ambos" | "ninguno";
  firma: "valida" | "clave_equivocada" | "alterada" | "otro_hash";
  estadoInicial: OrderStatus;
  sembrar: boolean;
  entregas: number;
  cuerpo?: unknown;
  cuerpoCrudo?: string;
  esperado: {
    parseo: { hashPedido: string; pagado: boolean; montoPyg: number } | "error";
    ruta: { status: number; pedido: OrderStatus | null; eventos: number; logError?: boolean };
  };
};

export function loadPagoparFixtures(): PagoparFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      nombre: file.replace(/\.json$/, ""),
      ...(JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8")) as Omit<
        PagoparFixture,
        "nombre"
      >),
    }));
}

/** El token que corresponde según `firma`, con la clave de mentira del test. */
export function fixtureToken(fixture: PagoparFixture, privateKey: string): string {
  switch (fixture.firma) {
    case "valida":
      return webhookGuardToken(privateKey, FIXTURE_HASH);
    case "clave_equivocada":
      return webhookGuardToken(`${privateKey}-otra`, FIXTURE_HASH);
    case "otro_hash":
      return webhookGuardToken(privateKey, `${FIXTURE_HASH}ff`);
    case "alterada": {
      const valido = webhookGuardToken(privateKey, FIXTURE_HASH);
      return `${valido.slice(0, -1)}${valido.endsWith("a") ? "b" : "a"}`;
    }
  }
}

/** El texto del cuerpo, con `{{TOKEN}}` reemplazado (o vacío si no va en el cuerpo). */
export function fixtureBody(fixture: PagoparFixture, privateKey: string): string {
  const raw =
    fixture.cuerpoCrudo !== undefined ? fixture.cuerpoCrudo : JSON.stringify(fixture.cuerpo);
  const enCuerpo = fixture.token === "cuerpo" || fixture.token === "ambos";
  return raw.replaceAll("{{TOKEN}}", enCuerpo ? fixtureToken(fixture, privateKey) : "");
}

export function fixtureRequest(fixture: PagoparFixture, privateKey: string): Request {
  const url = new URL("http://localhost/api/webhooks/pagopar");
  if (fixture.token === "query" || fixture.token === "ambos") {
    url.searchParams.set("token", fixtureToken(fixture, privateKey));
  }
  return new Request(url, {
    method: "POST",
    headers: { "content-type": fixture.contentType, "x-forwarded-for": "127.0.0.1" },
    body: fixtureBody(fixture, privateKey),
  });
}
