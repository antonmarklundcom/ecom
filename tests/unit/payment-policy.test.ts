import { describe, expect, it } from "vitest";

import { CHECKOUT } from "@/config/checkout";
import { paymentPolicy } from "@/domain/payment-policy";
import { parseStoreSettings } from "@/domain/store-settings-schema";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md D2: la política de medios de pago.
 *
 * Precedencia: selección del dueño > `STORE_PAYMENT_METHODS` >
 * `src/config/checkout.ts`. Lo que sobra de un error se cierra (nunca se abre
 * un medio que nadie eligió), pero una variable **vacía** es "no está", como
 * cualquier variable opcional del template (CLAUDE.md): pegar el bloque de
 * docs/ENV-OPCIONAL.md con el valor vacío no puede cerrar el checkout entero.
 */
describe("paymentPolicy", () => {
  it("una variable vacía o en blanco es como no tenerla: manda la config", () => {
    expect(paymentPolicy(null, "")).toEqual([...CHECKOUT.paymentMethods]);
    expect(paymentPolicy(null, "   ")).toEqual([...CHECKOUT.paymentMethods]);
    expect(paymentPolicy(null, undefined)).toEqual([
      ...CHECKOUT.paymentMethods,
    ]);
  });

  it("un valor inválido en la variable cierra, no abre", () => {
    expect(paymentPolicy(null, "transferencia,cripto")).toEqual([]);
  });

  it("la selección explícita del dueño manda, también la vacía (pausa)", () => {
    expect(paymentPolicy(["contra_entrega"], "transferencia")).toEqual([
      "contra_entrega",
    ]);
    expect(paymentPolicy([], "transferencia")).toEqual([]);
  });
});

describe("la sección checkout guardada, rota", () => {
  it("una sección checkout con forma inválida cierra los medios de pago en vez de heredar", () => {
    expect(
      parseStoreSettings({ checkout: "roto" }).checkout.metodosPago
    ).toEqual([]);
    expect(
      parseStoreSettings({ checkout: ["transferencia"] }).checkout.metodosPago
    ).toEqual([]);
  });

  it("sin sección checkout (una tienda que nunca la tocó) hereda", () => {
    expect(parseStoreSettings({}).checkout.metodosPago).toBeNull();
    expect(
      parseStoreSettings({ checkout: {} }).checkout.metodosPago
    ).toBeNull();
  });

  it("una lista con un medio desconocido cierra (como antes)", () => {
    expect(
      parseStoreSettings({ checkout: { metodosPago: ["typo"] } }).checkout
        .metodosPago
    ).toEqual([]);
  });
});
