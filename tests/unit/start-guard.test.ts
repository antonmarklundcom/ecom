import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VARIABLE_FICHA,
  arrancar,
  borrarPidfileSiEsNuestro,
  cerrarInstanciaAnterior,
  codigoDeSalida,
  escribirPidfile,
  esNuestroServidor,
  leerPidfile,
  reenviarSenales,
  rutaPidfile,
} from "../../scripts/start-guard.mjs";

/**
 * El guard de `pnpm start` (DEPLOY.md § "Procesos que se apilan").
 *
 * La regla que más importa: **nunca se mata un pid que no se pudo verificar**.
 * Un pidfile viejo puede apuntar a un pid reciclado que hoy es otra tienda de
 * la misma cuenta de Hostinger.
 */

const FICHA = "a".repeat(32);

type Registro = Parameters<typeof cerrarInstanciaAnterior>[0];

function registro(servidorPid: number, ficha = FICHA): NonNullable<Registro> {
  return {
    v: 1,
    ficha,
    servidorPid,
    guardPid: 999_998,
    appDir: "/app",
    desde: "2026-11-04T00:00:00.000Z",
  };
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/**
 * Un mundo de procesos de mentira: `vivos` es lo que responde a `kill(pid, 0)`,
 * `environ` lo que devuelve `/proc/<pid>/environ`, y `obedece` si el proceso
 * se muere con SIGTERM.
 */
function mundo(opciones: {
  vivos: number[];
  environ?: Record<number, string>;
  hayProc?: boolean;
  obedeceTerm?: boolean;
  pidPropio?: number;
}) {
  const vivos = new Set(opciones.vivos);
  const senales: Array<[number, string | number]> = [];
  let reloj = 0;
  const deps = {
    kill: (pid: number, senal: string | number) => {
      if (senal !== 0) senales.push([pid, senal]);
      if (!vivos.has(pid)) throw errno("ESRCH");
      if (senal === "SIGKILL") vivos.delete(pid);
      if (senal === "SIGTERM" && opciones.obedeceTerm !== false) vivos.delete(pid);
      return true;
    },
    hayProc: () => opciones.hayProc ?? true,
    leerEnviron: (pid: number) => {
      const env = opciones.environ?.[pid];
      if (env === undefined) throw errno("ENOENT");
      return env;
    },
    esperar: async (ms: number) => {
      reloj += ms;
    },
    ahora: () => reloj,
    pidPropio: opciones.pidPropio ?? 1234,
  };
  return { deps, senales };
}

const conFicha = (ficha = FICHA) => `PATH=/usr/bin\0${VARIABLE_FICHA}=${ficha}\0HOME=/home/u\0`;

describe("rutaPidfile", () => {
  it("es estable por app y distinta entre apps", () => {
    const a = rutaPidfile({ appDir: "/home/u/tienda-a", env: {}, tmpdir: "/tmp" });
    expect(a).toBe(rutaPidfile({ appDir: "/home/u/tienda-a", env: {}, tmpdir: "/tmp" }));
    expect(a).not.toBe(rutaPidfile({ appDir: "/home/u/tienda-b", env: {}, tmpdir: "/tmp" }));
    // `path.join("/tmp")` es "/tmp" en Linux y "\tmp" en Windows: la misma
    // regla en las dos plataformas, sin aflojarla en Linux.
    expect(path.dirname(a)).toBe(path.join("/tmp"));
  });

  it("START_PIDFILE manda; vacía es como no tenerla", () => {
    expect(rutaPidfile({ appDir: "/a", env: { START_PIDFILE: "/home/u/x.pid" }, tmpdir: "/tmp" })).toBe(
      path.resolve("/home/u/x.pid")
    );
    const porDefecto = rutaPidfile({ appDir: "/a", env: { START_PIDFILE: "  " }, tmpdir: "/tmp" });
    expect(path.dirname(porDefecto)).toBe(path.join("/tmp"));
    expect(path.basename(porDefecto)).toMatch(/^ecom-start-[0-9a-f]{16}\.pid$/);
  });
});

describe("pidfile", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "start-guard-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("ida y vuelta", () => {
    const ruta = path.join(dir, "x.pid");
    escribirPidfile(ruta, registro(4321));
    expect(leerPidfile(ruta)).toEqual(registro(4321));
  });

  it("uno roto o ausente se trata como si no hubiera", () => {
    const ruta = path.join(dir, "x.pid");
    expect(leerPidfile(ruta)).toBeNull();
    fs.writeFileSync(ruta, "12345\n");
    expect(leerPidfile(ruta)).toBeNull();
    fs.writeFileSync(ruta, JSON.stringify({ ...registro(1), servidorPid: 1 }));
    expect(leerPidfile(ruta)).toBeNull();
    fs.writeFileSync(ruta, JSON.stringify({ ...registro(50), ficha: "corta" }));
    expect(leerPidfile(ruta)).toBeNull();
  });

  it("sólo se borra si sigue siendo el nuestro", () => {
    const ruta = path.join(dir, "x.pid");
    escribirPidfile(ruta, registro(4321, "b".repeat(32)));
    expect(borrarPidfileSiEsNuestro(ruta, FICHA)).toBe(false);
    expect(fs.existsSync(ruta)).toBe(true);
    expect(borrarPidfileSiEsNuestro(ruta, "b".repeat(32))).toBe(true);
    expect(fs.existsSync(ruta)).toBe(false);
  });
});

describe("esNuestroServidor", () => {
  it("sí con la ficha en el entorno inicial", () => {
    const { deps } = mundo({ vivos: [50], environ: { 50: conFicha() } });
    expect(esNuestroServidor(50, FICHA, deps)).toBe("si");
  });

  it("no con otra ficha (un pid reciclado)", () => {
    const { deps } = mundo({ vivos: [50], environ: { 50: conFicha("c".repeat(32)) } });
    expect(esNuestroServidor(50, FICHA, deps)).toBe("no");
  });

  it("no se deja engañar por un prefijo", () => {
    const { deps } = mundo({ vivos: [50], environ: { 50: `${VARIABLE_FICHA}=${FICHA}extra\0` } });
    expect(esNuestroServidor(50, FICHA, deps)).toBe("no");
  });

  it("sin /proc no se puede verificar", () => {
    const { deps } = mundo({ vivos: [50], hayProc: false, environ: { 50: conFicha() } });
    expect(esNuestroServidor(50, FICHA, deps)).toBe("no_verificable");
  });

  it("environ ilegible (otro usuario) no se puede verificar", () => {
    const { deps } = mundo({ vivos: [50] });
    deps.leerEnviron = () => {
      throw errno("EACCES");
    };
    expect(esNuestroServidor(50, FICHA, deps)).toBe("no_verificable");
  });
});

describe("cerrarInstanciaAnterior", () => {
  it("sin pidfile no hace nada", async () => {
    const { deps, senales } = mundo({ vivos: [] });
    expect(await cerrarInstanciaAnterior(null, deps)).toBe("sin_registro");
    expect(senales).toEqual([]);
  });

  it("pid muerto (pidfile viejo): nada que matar", async () => {
    const { deps, senales } = mundo({ vivos: [] });
    expect(await cerrarInstanciaAnterior(registro(50), deps)).toBe("muerta");
    expect(senales).toEqual([]);
  });

  it("pid reciclado por otro programa: NO se mata", async () => {
    const { deps, senales } = mundo({ vivos: [50], environ: { 50: "PATH=/usr/bin\0" } });
    expect(await cerrarInstanciaAnterior(registro(50), deps)).toBe("ajena");
    expect(senales).toEqual([]);
  });

  it("el pid es el propio: NO se mata", async () => {
    const { deps, senales } = mundo({ vivos: [1234], environ: { 1234: conFicha() }, pidPropio: 1234 });
    expect(await cerrarInstanciaAnterior(registro(1234), deps)).toBe("propia");
    expect(senales).toEqual([]);
  });

  it("sin /proc: NO se mata (no se puede verificar)", async () => {
    const { deps, senales } = mundo({ vivos: [50], hayProc: false });
    expect(await cerrarInstanciaAnterior(registro(50), deps)).toBe("no_verificable");
    expect(senales).toEqual([]);
  });

  it("la nuestra, viva: SIGTERM y se va", async () => {
    const { deps, senales } = mundo({ vivos: [50], environ: { 50: conFicha() } });
    expect(await cerrarInstanciaAnterior(registro(50), deps)).toBe("terminada");
    expect(senales).toEqual([[50, "SIGTERM"]]);
  });

  it("la nuestra, colgada: SIGTERM, espera acotada y SIGKILL", async () => {
    const { deps, senales } = mundo({ vivos: [50], environ: { 50: conFicha() }, obedeceTerm: false });
    const resultado = await cerrarInstanciaAnterior(registro(50), deps, { esperaTermMs: 1_000, esperaKillMs: 500 });
    expect(resultado).toBe("forzada");
    expect(senales).toEqual([
      [50, "SIGTERM"],
      [50, "SIGKILL"],
    ]);
    // La espera fue acotada: 1 s de reloj de mentira, no 15.
    expect(deps.ahora()).toBeLessThanOrEqual(1_000 + 200);
  });

  it("si en la espera el pid se recicló, no se le manda SIGKILL al nuevo", async () => {
    const { deps, senales } = mundo({ vivos: [50], environ: { 50: conFicha() }, obedeceTerm: false });
    const leer = deps.leerEnviron;
    let lecturas = 0;
    deps.leerEnviron = (pid: number) => (++lecturas === 1 ? leer(pid) : "PATH=/usr/bin\0");
    await cerrarInstanciaAnterior(registro(50), deps, { esperaTermMs: 400 });
    expect(senales).toEqual([[50, "SIGTERM"]]);
  });
});

describe("codigoDeSalida", () => {
  it("el del hijo, o 128 + señal", () => {
    expect(codigoDeSalida(0, null)).toBe(0);
    expect(codigoDeSalida(143, null)).toBe(143);
    expect(codigoDeSalida(null, "SIGTERM")).toBe(143);
    expect(codigoDeSalida(null, "SIGKILL")).toBe(137);
    expect(codigoDeSalida(null, null)).toBe(1);
  });
});

/** Un hijo de verdad que anuncia las señales que recibe. */
const HIJO = `
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(s, () => { process.stdout.write('recibi:' + s + '\\n'); if (!process.env.TERCO) process.exit(7); });
  }
  process.stdout.write('listo\\n');
  setInterval(() => {}, 1000);
`;

function lanzarHijo(env: Record<string, string> = {}): Promise<{ hijo: ChildProcess; salida: () => string }> {
  const hijo = spawn(process.execPath, ["-e", HIJO], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  let texto = "";
  hijo.stdout!.on("data", (b: Buffer) => (texto += b.toString()));
  return new Promise((resolve) => {
    hijo.stdout!.once("data", () => resolve({ hijo, salida: () => texto }));
  });
}

function salidaDe(hijo: ChildProcess): Promise<{ code: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    if (hijo.exitCode !== null || hijo.signalCode !== null) {
      resolve({ code: hijo.exitCode, signal: hijo.signalCode });
      return;
    }
    hijo.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

// Windows no entrega señales POSIX a los handlers de un proceso: `kill()` lo
// termina sin que corra `process.on("SIGTERM")`. El guard es para Hostinger
// (Linux); en Windows estas cuatro no prueban nada y se saltean.
describe.skipIf(process.platform === "win32")("reenviarSenales (con un hijo de verdad)", () => {
  it("SIGTERM llega tal cual", async () => {
    const proceso = new EventEmitter();
    const { hijo, salida } = await lanzarHijo();
    const soltar = reenviarSenales({ proceso, hijo });
    proceso.emit("SIGTERM");
    expect(await salidaDe(hijo)).toEqual({ code: 7, signal: null });
    expect(salida()).toContain("recibi:SIGTERM");
    soltar();
    expect(proceso.listenerCount("SIGTERM")).toBe(0);
  });

  it("SIGINT llega tal cual", async () => {
    const proceso = new EventEmitter();
    const { hijo, salida } = await lanzarHijo();
    const soltar = reenviarSenales({ proceso, hijo });
    proceso.emit("SIGINT");
    await salidaDe(hijo);
    expect(salida()).toContain("recibi:SIGINT");
    soltar();
  });

  it("SIGHUP se reenvía como SIGTERM (next start no escucha SIGHUP)", async () => {
    const proceso = new EventEmitter();
    const { hijo, salida } = await lanzarHijo();
    const soltar = reenviarSenales({ proceso, hijo });
    proceso.emit("SIGHUP");
    await salidaDe(hijo);
    expect(salida()).toContain("recibi:SIGTERM");
    expect(salida()).not.toContain("recibi:SIGHUP");
    soltar();
  });

  it("un hijo que no sale después de la señal se lleva un SIGKILL al vencer el plazo", async () => {
    const proceso = new EventEmitter();
    const { hijo } = await lanzarHijo({ TERCO: "1" });
    const soltar = reenviarSenales({ proceso, hijo, plazoHijoMs: 150 });
    proceso.emit("SIGTERM");
    expect(await salidaDe(hijo)).toEqual({ code: null, signal: "SIGKILL" });
    soltar();
  });
});

describe.skipIf(process.platform !== "linux" || !fs.existsSync("/proc/self/environ"))(
  "arrancar (procesos de verdad, Linux)",
  () => {
    let dir: string;
    const hijos: ChildProcess[] = [];
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "start-guard-"));
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      for (const hijo of hijos) hijo.kill("SIGKILL");
      fs.rmSync(dir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    async function una(ruta: string) {
      const proceso = new EventEmitter() as unknown as NodeJS.Process;
      const salir = vi.fn();
      const ficha = randomBytes(16).toString("hex");
      const r = await arrancar({
        comando: process.execPath,
        args: ["-e", HIJO],
        appDir: dir,
        rutaPidfile: ruta,
        ficha,
        proceso,
        salir,
        stdio: ["ignore", "pipe", "inherit"],
        plazos: { esperaTermMs: 3_000, esperaKillMs: 1_000 },
      });
      hijos.push(r.hijo);
      await new Promise((resolve) => r.hijo.stdout!.once("data", resolve));
      return { ...r, proceso, salir, ficha };
    }

    it("la segunda instancia cierra a la primera y el pidfile queda de la segunda", async () => {
      const ruta = path.join(dir, "app.pid");
      const primera = await una(ruta);
      expect(leerPidfile(ruta)?.servidorPid).toBe(primera.hijo.pid);

      const segunda = await una(ruta);
      expect(segunda.anterior).toBe("terminada");
      expect(await primera.terminado).toBe(7);
      // La primera no borró el pidfile: ya no era suyo.
      expect(leerPidfile(ruta)?.ficha).toBe(segunda.ficha);

      segunda.proceso.emit("SIGTERM");
      expect(await segunda.terminado).toBe(7);
      expect(segunda.salir).toHaveBeenCalledWith(7);
      expect(fs.existsSync(ruta)).toBe(false);
    });

    it("un pidfile que apunta a un proceso ajeno vivo no lo toca", async () => {
      const ruta = path.join(dir, "app.pid");
      const { hijo: ajeno } = await lanzarHijo();
      hijos.push(ajeno);
      escribirPidfile(ruta, registro(ajeno.pid!));
      const r = await una(ruta);
      expect(r.anterior).toBe("ajena");
      expect(ajeno.exitCode).toBeNull();
      expect(ajeno.signalCode).toBeNull();
      r.proceso.emit("SIGTERM");
      await r.terminado;
    });
  }
);

describe("el arranque de producción", () => {
  it("`pnpm start` es `next start`; el guard es opcional (`start:guard`), en Node pelado", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    // Opcional hasta que O27 lo mida en Hostinger (fable/plan-2026-11.md §5.1, F2).
    expect(pkg.scripts.start).toBe("next start");
    expect(pkg.scripts["start:guard"]).toBe("node scripts/start.mjs");
    for (const archivo of ["scripts/start.mjs", "scripts/start-guard.mjs"]) {
      const codigo = fs.readFileSync(archivo, "utf8");
      expect(codigo).not.toMatch(/from ['"](tsx|@\/|\.\.\/src)/);
    }
  });
});
