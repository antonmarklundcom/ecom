import { describe, expect, it } from "vitest";

import { preflight, type PreflightEnv, type PreflightSeverity } from "../../src/domain/preflight";

/**
 * `pnpm preflight` (TASKS.md §30).
 *
 * El control tiene que servir para dos cosas opuestas: dar el visto bueno
 * cuando todo está, y frenar el deploy cuando falta algo. Los dos lados se
 * prueban acá, uno por control.
 *
 * `WEBHOOK_ENVELOPE_CONFIRMED` sigue en `false` mientras no haya credenciales
 * de sandbox (TASKS.md §21), así que **hoy nunca sale limpio**: el test lo dice
 * explícitamente en vez de esconderlo, y el día que se confirme el sobre este
 * archivo es lo primero que se pone rojo.
 */

/** Un entorno completo y sano, salvo por lo que cada test rompa. */
function envSano(overrides: PreflightEnv = {}): PreflightEnv {
  return {
    NODE_ENV: "production",
    // Sin contraseña adentro: el escáner de secretos de
    // `security-review.test.ts` marca cualquier DSN con credenciales que no
    // apunte a localhost, y tiene razón — hasta en un fixture.
    DATABASE_URL: "mysql://tienda@db.hostinger.py:3306/tienda",
    SESSION_SECRET: "u".repeat(43),
    CRON_SECRET: "c".repeat(32),
    BANCO_NOMBRE: "Banco Itaú",
    BANCO_TITULAR: "Comercial San Roque S.A.",
    BANCO_RUC: "80012345-6",
    BANCO_CUENTA: "123456789",
    BANCO_TIPO_CUENTA: "Cuenta corriente",
    CLOUDINARY_CLOUD_NAME: "tienda-py",
    CLOUDINARY_API_KEY: "123456789012345",
    CLOUDINARY_API_SECRET: "una-clave-de-cloudinary",
    WHATSAPP_NUMBER: "+595981123456",
    NEXT_PUBLIC_SITE_URL: "https://tienda.com.py",
    PAGOPAR_PUBLIC_KEY: "publica",
    PAGOPAR_PRIVATE_KEY: "privada",
    PAGOPAR_BASE_URL: "https://api.pagopar.com",
    PAGOPAR_MODE: "",
    ...overrides,
  };
}

function severityOf(env: PreflightEnv, id: string): PreflightSeverity {
  const check = preflight(env).checks.find((item) => item.id === id);
  if (!check) throw new Error(`no existe el control "${id}"`);
  return check.severity;
}

describe("preflight", () => {
  it("con todo configurado, lo único que bloquea es el sobre del webhook", () => {
    const report = preflight(envSano());

    const bloquean = report.checks
      .filter((check) => check.severity === "bloquea")
      .map((check) => check.id);

    // Es el pendiente real de TASKS.md §21 y el único que queda. Cuando se
    // confirme contra el sandbox, esta expectativa pasa a ser `[]`.
    expect(bloquean).toEqual(["pagopar_webhook_envelope"]);
    expect(report.ok).toBe(false);
  });

  it("cada variable que falta bloquea por separado", () => {
    const casos: Array<[string, PreflightEnv]> = [
      ["banco", { BANCO_CUENTA: "" }],
      ["cron_secret", { CRON_SECRET: "" }],
      ["session_secret", { SESSION_SECRET: "" }],
      ["cloudinary", { CLOUDINARY_API_SECRET: "" }],
      ["whatsapp", { WHATSAPP_NUMBER: "" }],
      ["database_url", { DATABASE_URL: "" }],
      ["site_url", { NEXT_PUBLIC_SITE_URL: "" }],
    ];

    for (const [id, override] of casos) {
      expect(severityOf(envSano(override), id), id).toBe("bloquea");
      expect(severityOf(envSano(), id), `${id} sano`).toBe("ok");
    }
  });

  it("un secreto demasiado corto bloquea igual que uno vacío", () => {
    // El largo mínimo no es cosmético: iron-session revienta en runtime con
    // menos de 32, y la ruta del cron se niega a correr con menos de 16.
    expect(severityOf(envSano({ SESSION_SECRET: "corto" }), "session_secret")).toBe("bloquea");
    expect(severityOf(envSano({ CRON_SECRET: "quince-chars--" }), "cron_secret")).toBe("bloquea");
  });

  it("el placeholder de .env.example cuenta como no configurado", () => {
    expect(
      severityOf(
        envSano({ SESSION_SECRET: "changeme-generate-with-openssl-rand-base64-32" }),
        "session_secret",
      ),
    ).toBe("bloquea");
    expect(severityOf(envSano({ CLOUDINARY_CLOUD_NAME: "changeme" }), "cloudinary")).toBe("bloquea");
  });

  it("PAGOPAR_MODE=mock en producción bloquea", () => {
    expect(severityOf(envSano({ PAGOPAR_MODE: "mock" }), "pagopar_mode")).toBe("bloquea");
  });

  it("PAGOPAR_MODE=mock fuera de producción sólo advierte", () => {
    expect(
      severityOf(envSano({ NODE_ENV: "development", PAGOPAR_MODE: "mock" }), "pagopar_mode"),
    ).toBe("advierte");
  });

  it("sin credenciales de Pagopar advierte, no bloquea", () => {
    // La tienda cobra igual por transferencia y contra entrega: eso es el MVP.
    expect(
      severityOf(
        envSano({ PAGOPAR_PUBLIC_KEY: "", PAGOPAR_PRIVATE_KEY: "", PAGOPAR_BASE_URL: "" }),
        "pagopar_credenciales",
      ),
    ).toBe("advierte");
  });

  it("una URL de sitio sin https bloquea en producción", () => {
    // El token del pedido viaja en esa URL, y Pagopar no llama a un endpoint
    // sin certificado.
    expect(severityOf(envSano({ NEXT_PUBLIC_SITE_URL: "http://tienda.com.py" }), "site_url")).toBe(
      "bloquea",
    );
    expect(
      severityOf(
        envSano({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }),
        "site_url",
      ),
    ).toBe("ok");
  });

  it("una base local en producción advierte sin frenar el deploy", () => {
    // En Hostinger puede ser correcto: la base vive en el mismo host.
    expect(
      severityOf(
        envSano({ DATABASE_URL: "mysql://ecom@localhost:3306/ecom" }),
        "database_url",
      ),
    ).toBe("advierte");
  });

  it("ningún detalle repite el valor de un secreto", () => {
    const env = envSano({ SESSION_SECRET: "un-secreto-larguisimo-y-reconocible-1234" });
    const texto = preflight(env)
      .checks.map((check) => `${check.title} ${check.detail}`)
      .join("\n");

    for (const secreto of [
      env.SESSION_SECRET,
      env.CRON_SECRET,
      env.PAGOPAR_PRIVATE_KEY,
      env.CLOUDINARY_API_SECRET,
      env.DATABASE_URL,
    ]) {
      expect(texto).not.toContain(secreto as string);
    }
  });

  it("cuenta bien lo que bloquea y lo que advierte", () => {
    const report = preflight(envSano({ CRON_SECRET: "", PAGOPAR_PUBLIC_KEY: "" }));

    expect(report.blocking).toBe(
      report.checks.filter((check) => check.severity === "bloquea").length,
    );
    expect(report.warnings).toBe(
      report.checks.filter((check) => check.severity === "advierte").length,
    );
    expect(report.ok).toBe(false);
  });
});
