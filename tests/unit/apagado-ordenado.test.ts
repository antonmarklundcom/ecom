import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  instalarApagadoOrdenado,
  type ProcesoApagable,
} from "@/lib/apagado-ordenado";
import { readCode } from "../helpers/source";

/**
 * El apagado ordenado del servidor (src/lib/apagado-ordenado.ts): con SIGTERM,
 * Next termina los requests en curso y llama a `process.exit`; antes de salir
 * de verdad se cierra el pool de MySQL, y nada de esto espera para siempre.
 */

type ProcesoFalso = EventEmitter & ProcesoApagable & { salidas: number[] };

function procesoFalso(): ProcesoFalso {
  const emisor = new EventEmitter() as ProcesoFalso;
  emisor.salidas = [];
  emisor.exit = ((codigo?: number) => {
    emisor.salidas.push(codigo ?? 0);
  }) as ProcesoApagable["exit"];
  return emisor;
}

/** Un pool de mentira, con `end()` como el de mysql2. */
function poolFalso(demoraMs = 0) {
  const pool = {
    cerrado: false,
    end: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            pool.cerrado = true;
            resolve();
          }, demoraMs);
        })
    ),
  };
  return pool;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("instalarApagadoOrdenado", () => {
  it("antes de la señal no toca nada: process.exit sale directo", () => {
    const proceso = procesoFalso();
    const exitOriginal = proceso.exit;
    const pool = poolFalso();
    instalarApagadoOrdenado({ cerrar: () => pool.end(), proceso });
    expect(proceso.exit).toBe(exitOriginal);
    expect(pool.end).not.toHaveBeenCalled();
  });

  it("SIGTERM y después el exit de Next: cierra el pool y recién ahí sale con 143", async () => {
    const proceso = procesoFalso();
    const pool = poolFalso(50);
    instalarApagadoOrdenado({ cerrar: () => pool.end(), proceso });

    proceso.emit("SIGTERM");
    expect(pool.end).not.toHaveBeenCalled(); // los requests en curso siguen

    proceso.exit(143); // Next terminó de drenar
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(proceso.salidas).toEqual([]); // todavía cerrando

    await vi.advanceTimersByTimeAsync(50);
    expect(pool.cerrado).toBe(true);
    expect(proceso.salidas).toEqual([143]);
  });

  it("SIGINT sale con 130", async () => {
    const proceso = procesoFalso();
    const pool = poolFalso();
    instalarApagadoOrdenado({ cerrar: () => pool.end(), proceso, plazoMs: 100 });
    proceso.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(110);
    expect(proceso.salidas).toEqual([130]);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("si nadie sale (un request colgado), al vencer el plazo cierra el pool y sale igual", async () => {
    const proceso = procesoFalso();
    const pool = poolFalso();
    instalarApagadoOrdenado({ cerrar: () => pool.end(), proceso, plazoMs: 10_000 });

    proceso.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(proceso.salidas).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(proceso.salidas).toEqual([143]);
  });

  it("un pool que no contesta no frena la salida más que `cierreMs`", async () => {
    const proceso = procesoFalso();
    const cerrar = vi.fn(() => new Promise<void>(() => {}));
    instalarApagadoOrdenado({ cerrar, proceso, cierreMs: 2_000 });
    proceso.emit("SIGTERM");
    proceso.exit(143);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(proceso.salidas).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(proceso.salidas).toEqual([143]);
  });

  it("un pool que falla al cerrar no impide salir", async () => {
    const proceso = procesoFalso();
    instalarApagadoOrdenado({
      cerrar: () => Promise.reject(new Error("Pool is closed")),
      proceso,
    });
    proceso.emit("SIGTERM");
    proceso.exit(143);
    await vi.advanceTimersByTimeAsync(0);
    expect(proceso.salidas).toEqual([143]);
  });

  it("idempotente: instalarlo dos veces no duplica listeners", () => {
    const proceso = procesoFalso();
    const cerrar = vi.fn(async () => {});
    expect(instalarApagadoOrdenado({ cerrar, proceso })).toBe(true);
    expect(instalarApagadoOrdenado({ cerrar, proceso })).toBe(false);
    expect(proceso.listenerCount("SIGTERM")).toBe(1);
    expect(proceso.listenerCount("SIGINT")).toBe(1);
  });

  it("una señal repetida (shell + guard) no cierra dos veces ni sale dos veces", async () => {
    const proceso = procesoFalso();
    const pool = poolFalso();
    instalarApagadoOrdenado({ cerrar: () => pool.end(), proceso, plazoMs: 100 });
    proceso.emit("SIGTERM");
    proceso.emit("SIGTERM");
    proceso.emit("SIGINT");
    proceso.exit(143);
    proceso.exit(143);
    await vi.advanceTimersByTimeAsync(200);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(proceso.salidas).toEqual([143]);
  });
});

describe("dónde se instala", () => {
  it("sólo desde register(), en Node y con NODE_ENV=production", async () => {
    const codigo = await readCode("src/instrumentation.ts");
    expect(codigo).toMatch(
      /NEXT_RUNTIME !== "nodejs"\) return;\s*if \(process\.env\.NODE_ENV === "production"\) \{[\s\S]*instalarApagadoOrdenado\(\{ cerrar: closePool \}\)/
    );
  });

  it("el módulo de la base no instala nada solo (los scripts y los tests lo importan)", async () => {
    const codigo = await readCode("src/db/index.ts");
    expect(codigo).not.toMatch(/process\.on\(/);
  });
});
