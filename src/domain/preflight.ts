import { MARCA_PLACEHOLDER, TIENDA } from "@/config/tienda";

import { WEBHOOK_ENVELOPE_CONFIRMED } from "./pagopar/protocol";
import { PAGOPAR_MOCK_MODE } from "./pagopar/mode";

/**
 * `pnpm preflight` — qué falta para cobrar plata de verdad.
 *
 * La pregunta que contesta no es "¿compila?" sino "**si mañana un desconocido
 * compra en este sitio, se pierde algo?**". Cada control de acá salió de un
 * pendiente real de TASKS.md o de un candado que existe en el código y que hay
 * que verificar que esté puesto en el servidor donde va a correr.
 *
 * Tres severidades:
 *
 *  - `bloquea`  — con esto así, cobrar es inseguro o se pierde plata. Salida 1.
 *  - `advierte` — funciona, pero degradado y conviene saberlo. Salida 0.
 *  - `ok`       — verificado.
 *
 * No se conecta a la base ni a la red: lee el entorno y constantes del código,
 * así que se puede correr en el servidor de producción sin efectos. Y nunca
 * imprime el **valor** de un secreto: sólo si está, y si tiene largo suficiente.
 */

export type PreflightSeverity = "bloquea" | "advierte" | "ok";

export type PreflightCheck = {
  /** Id estable, para grepear en el log del deploy. */
  id: string;
  severity: PreflightSeverity;
  title: string;
  /** Qué se encontró, y qué hacer si no está bien. Sin valores de secretos. */
  detail: string;
};

export type PreflightReport = {
  checks: PreflightCheck[];
  /** `false` si hay al menos un `bloquea`. */
  ok: boolean;
  blocking: number;
  warnings: number;
};

/** El entorno que se inspecciona. Inyectable para poder testearlo. */
export type PreflightEnv = Record<string, string | undefined>;

function value(env: PreflightEnv, name: string): string {
  return (env[name] ?? "").trim();
}

function isProduction(env: PreflightEnv): boolean {
  return value(env, "NODE_ENV") === "production";
}

/** Los cinco datos bancarios sin los cuales la página SPI/QR no muestra nada. */
const BANCO_VARS = [
  "BANCO_NOMBRE",
  "BANCO_TITULAR",
  "BANCO_RUC",
  "BANCO_CUENTA",
  "BANCO_TIPO_CUENTA",
] as const;

export function preflight(env: PreflightEnv = process.env): PreflightReport {
  const checks: PreflightCheck[] = [
    checkMarca(),
    checkWebhookEnvelope(env),
    checkPagoparMode(env),
    checkBancoVars(env),
    checkCronSecret(env),
    checkSetupSecret(env),
    checkSessionSecret(env),
    checkCustomerSessionSecret(env),
    checkPagoparCredentials(env),
    checkCloudinary(env),
    checkWhatsApp(env),
    checkAvisoPedidoNuevo(env),
    checkDatabaseUrl(env),
    checkSiteUrl(env),
  ];

  const blocking = checks.filter((check) => check.severity === "bloquea").length;
  const warnings = checks.filter((check) => check.severity === "advierte").length;

  return { checks, ok: blocking === 0, blocking, warnings };
}

/**
 * La marca sigue siendo la del template.
 *
 * Ningún otro control mira `tienda.ts`, y éste existe porque el olvido es el
 * más visible de todos: "TiendaPY" queda en el header, en el `<title>`, en el
 * pie y en la imagen de Open Graph que se dibuja para **cada** link compartido
 * por WhatsApp. La tienda cobra igual — por eso no lo frena ningún candado del
 * código — pero cobrar con la marca del template es el papelón del primer
 * deploy, y es exactamente el paso 2 de NEW-STORE.md.
 */
function checkMarca(): PreflightCheck {
  const nombre = TIENDA.nombre.trim();

  if (nombre.toLowerCase() !== MARCA_PLACEHOLDER.toLowerCase()) {
    return {
      id: "marca",
      severity: "ok",
      title: "Marca de la tienda",
      detail: `"${nombre}"`,
    };
  }

  return {
    id: "marca",
    severity: "bloquea",
    title: "Marca de la tienda",
    detail:
      `src/config/tienda.ts sigue con el nombre del template ("${MARCA_PLACEHOLDER}"): header, ` +
      "títulos del navegador y la imagen de Open Graph de cada link compartido van a decir eso. " +
      "Editá TIENDA (NEW-STORE.md §2) — y de paso el favicon, que ningún control verifica",
  };
}

/**
 * El sobre de la respuesta del webhook, sin confirmar (TASKS.md §21).
 *
 * Es un hecho sobre el código, no sobre el entorno. Si Pagopar espera otra
 * forma, reintenta el aviso una y otra vez y termina marcando el pago como no
 * notificado, con la plata cobrada y el pedido sin marcar.
 *
 * Bloquea sólo si la tienda cargó credenciales de Pagopar: sin ellas el
 * checkout no ofrece tarjeta y el webhook no existe para esta tienda —
 * frenarle el deploy a una tienda de transferencia y contra entrega por un
 * protocolo que no usa sería un falso positivo permanente. Queda en
 * `advierte` para que el día que carguen las credenciales ya sepan qué falta.
 */
function checkWebhookEnvelope(env: PreflightEnv): PreflightCheck {
  if (WEBHOOK_ENVELOPE_CONFIRMED) {
    return {
      id: "pagopar_webhook_envelope",
      severity: "ok",
      title: "Sobre de la respuesta del webhook de Pagopar",
      detail: "confirmado contra la doc v2 vigente",
    };
  }

  const sinCredenciales = ["PAGOPAR_PUBLIC_KEY", "PAGOPAR_PRIVATE_KEY", "PAGOPAR_BASE_URL"].every(
    (name) => value(env, name) === "",
  );

  if (sinCredenciales) {
    return {
      id: "pagopar_webhook_envelope",
      severity: "advierte",
      title: "Sobre de la respuesta del webhook de Pagopar",
      detail:
        "sin confirmar contra la doc v2 vigente — irrelevante mientras esta tienda no cargue " +
        "credenciales de Pagopar (sin ellas no hay tarjeta ni webhook). Al cargarlas, esto pasa " +
        "a bloquear hasta confirmarlo contra el sandbox",
    };
  }

  return {
    id: "pagopar_webhook_envelope",
    severity: "bloquea",
    title: "Sobre de la respuesta del webhook de Pagopar",
    detail:
      "sin confirmar contra la doc v2 vigente ni contra el sandbox. ARCH.md §4 avisa que " +
      "cambió entre revisiones. Corré tests/integration/pagopar-sandbox.test.ts con " +
      "credenciales, ajustá webhookResponseBody() si difiere y poné " +
      "WEBHOOK_ENVELOPE_CONFIRMED en true",
  };
}

/**
 * `PAGOPAR_MODE` en un entorno de producción.
 *
 * El candado de `mode.ts` ya hace que el simulador no se encienda con
 * `NODE_ENV=production`, así que esto no es la defensa: es el aviso de que
 * alguien copió el `.env` de desarrollo al servidor. Si mañana ese candado se
 * toca, la variable ya estaba puesta y esperando.
 */
function checkPagoparMode(env: PreflightEnv): PreflightCheck {
  const mode = value(env, "PAGOPAR_MODE").toLowerCase();

  if (mode === "" || mode === "real") {
    return {
      id: "pagopar_mode",
      severity: "ok",
      title: "Modo de la pasarela",
      detail: mode === "" ? "sin definir (real)" : "real",
    };
  }

  if (mode !== PAGOPAR_MOCK_MODE) {
    return {
      id: "pagopar_mode",
      severity: "advierte",
      title: "Modo de la pasarela",
      detail: `PAGOPAR_MODE="${mode}" no es un valor conocido; se va a tratar como "real"`,
    };
  }

  if (isProduction(env)) {
    return {
      id: "pagopar_mode",
      severity: "bloquea",
      title: "Modo de la pasarela",
      detail:
        'PAGOPAR_MODE="mock" con NODE_ENV=production. El candado de mode.ts lo apaga igual, ' +
        "pero que la variable esté puesta en el servidor real significa que se copió el .env " +
        "de desarrollo: sacala antes de que alguien toque el candado",
    };
  }

  return {
    id: "pagopar_mode",
    severity: "advierte",
    title: "Modo de la pasarela",
    detail: "simulador encendido (PAGOPAR_MODE=mock): no entra plata de verdad",
  };
}

/**
 * Los cinco `BANCO_*` del entorno.
 *
 * **Advierte y ya no bloquea** (PLAN.md FASE 2, PR T). Desde que los datos
 * bancarios se editan desde `/admin/banco`, el entorno pasó a ser el fallback
 * y no la única fuente: una tienda perfectamente configurada puede tener las
 * cinco variables vacías y la tabla cargada, y frenarle el deploy por eso
 * sería un falso positivo permanente.
 *
 * Este script **no toca la base a propósito** —se corre en el servidor de
 * producción y no puede tener efectos ni depender de que la base esté arriba—
 * así que desde acá no hay forma de saber si la tabla está cargada. Lo que
 * queda es decir la verdad completa: faltan en el entorno, y hay otro lugar
 * donde pueden estar. El aviso que sí sabe es el del panel, que lee la base y
 * aparece en `/admin` cuando no hay datos en **ninguna** de las dos fuentes.
 */
function checkBancoVars(env: PreflightEnv): PreflightCheck {
  const missing = BANCO_VARS.filter((name) => value(env, name) === "");

  if (missing.length === 0) {
    return {
      id: "banco",
      severity: "ok",
      title: "Datos bancarios (SPI/QR)",
      detail: "los cinco configurados en el entorno",
    };
  }

  return {
    id: "banco",
    severity: "advierte",
    title: "Datos bancarios (SPI/QR)",
    detail:
      `faltan ${missing.join(", ")} en el entorno. Desde la FASE 2 esto es configurable desde ` +
      "/admin/banco y lo que se cargue ahí manda sobre el entorno, así que puede estar bien. " +
      "Si tampoco están cargados en el panel, la página del pedido muestra un aviso en vez de " +
      "la cuenta y la transferencia —el método principal del MVP— no se puede completar: " +
      "el resumen de /admin lo dice con la base a la vista",
  };
}

/**
 * `CRON_SECRET`, con el mismo mínimo que exige la ruta.
 *
 * Sin él la ruta responde 503 y nadie vence los pedidos: las reservas se
 * sueltan solas (la disponibilidad se calcula en vivo), pero los pedidos
 * muertos quedan para siempre en `pendiente_pago` y el panel miente.
 */
function checkCronSecret(env: PreflightEnv): PreflightCheck {
  const secret = value(env, "CRON_SECRET");

  if (secret === "") {
    return {
      id: "cron_secret",
      severity: "bloquea",
      title: "Secreto del cron",
      detail: "CRON_SECRET vacío: la ruta responde 503 y no se vence ningún pedido",
    };
  }
  if (secret.length < 16) {
    return {
      id: "cron_secret",
      severity: "bloquea",
      title: "Secreto del cron",
      detail: `CRON_SECRET tiene ${secret.length} caracteres; la ruta exige 16 o más`,
    };
  }

  return { id: "cron_secret", severity: "ok", title: "Secreto del cron", detail: "configurado" };
}

/**
 * `SETUP_SECRET` sobreviviendo al setup.
 *
 * `POST /api/setup/init` existe para inicializar la tienda una vez y después
 * desaparecer: sacada la variable del hPanel, la ruta vuelve a 503. Dejarla
 * puesta es dejar viva una ruta que corre migraciones, siembra el catálogo y
 * puede cambiarle la contraseña al dueño — todo detrás de un solo secreto que
 * ya circuló por un curl, por el historial de la terminal y por el panel.
 *
 * Advierte y no bloquea: la ruta igual pide `force` para volver a tocar datos,
 * y frenar un deploy por esto sería frenar justo el deploy en el que se está
 * usando. Lo que no puede pasar es que nadie lo mire.
 */
function checkSetupSecret(env: PreflightEnv): PreflightCheck {
  const secret = value(env, "SETUP_SECRET");

  if (secret === "") {
    return {
      id: "setup_secret",
      severity: "ok",
      title: "Secreto del setup",
      detail: "SETUP_SECRET no está: /api/setup/init responde 503, que es como tiene que quedar",
    };
  }

  if (isProduction(env)) {
    return {
      id: "setup_secret",
      severity: "advierte",
      title: "Secreto del setup",
      detail:
        "SETUP_SECRET sigue configurado con NODE_ENV=production: /api/setup/init está viva y " +
        "corre migraciones, siembra y puede cambiar la contraseña del dueño. Terminado el " +
        "setup, sacala del hPanel y apretá Redeploy (DEPLOY.md §4)",
    };
  }

  return {
    id: "setup_secret",
    severity: "ok",
    title: "Secreto del setup",
    detail: "configurado fuera de producción",
  };
}

/** iron-session revienta en runtime, no en build, si tiene menos de 32. */
function checkSessionSecret(env: PreflightEnv): PreflightCheck {
  const secret = value(env, "SESSION_SECRET");

  if (secret === "") {
    return {
      id: "session_secret",
      severity: "bloquea",
      title: "Secreto de sesión",
      detail: "SESSION_SECRET vacío: el panel no se puede usar",
    };
  }
  if (secret.length < 32) {
    return {
      id: "session_secret",
      severity: "bloquea",
      title: "Secreto de sesión",
      detail: `SESSION_SECRET tiene ${secret.length} caracteres; iron-session exige 32 o más`,
    };
  }
  if (/changeme|generate/i.test(secret)) {
    return {
      id: "session_secret",
      severity: "bloquea",
      title: "Secreto de sesión",
      detail: "SESSION_SECRET sigue siendo el placeholder de .env.example",
    };
  }

  return { id: "session_secret", severity: "ok", title: "Secreto de sesión", detail: "configurado" };
}

/**
 * El secreto de la sesión de cliente (FASE 2, PR E).
 *
 * Sólo aplica si esta tienda prendió `cuentasClientes`. Con el flag apagado
 * —el default— nadie lee esta variable y no tenerla es lo correcto.
 *
 * Con el flag prendido, en cambio, **bloquea**: sin el secreto las rutas de
 * `/cuenta` tiran en runtime, y este script existe justamente para que eso se
 * descubra antes del deploy y no con una compradora en la pantalla.
 *
 * El caso que más se chequea es el que más va a pasar: copiar el valor de
 * `SESSION_SECRET`. Compartir el secreto entre las dos poblaciones —empleados
 * del panel y compradoras— es lo que hace posible que una cookie de una sirva
 * del otro lado.
 */
function checkCustomerSessionSecret(env: PreflightEnv): PreflightCheck {
  const title = "Secreto de sesión de cliente";

  if (!TIENDA.cuentasClientes) {
    return {
      id: "customer_session_secret",
      severity: "ok",
      title,
      detail: "esta tienda no tiene cuentas de cliente: no hace falta",
    };
  }

  const secret = value(env, "CUSTOMER_SESSION_SECRET");

  if (secret === "") {
    return {
      id: "customer_session_secret",
      severity: "bloquea",
      title,
      detail:
        "cuentasClientes está prendido y CUSTOMER_SESSION_SECRET está vacío: /cuenta revienta en runtime",
    };
  }
  if (secret.length < 32) {
    return {
      id: "customer_session_secret",
      severity: "bloquea",
      title,
      detail: `CUSTOMER_SESSION_SECRET tiene ${secret.length} caracteres; iron-session exige 32 o más`,
    };
  }
  if (secret === value(env, "SESSION_SECRET")) {
    return {
      id: "customer_session_secret",
      severity: "bloquea",
      title,
      detail:
        "CUSTOMER_SESSION_SECRET es una copia de SESSION_SECRET: las sesiones del panel y las de " +
        "las compradoras tienen que ser criptográficamente independientes. Generá uno nuevo con " +
        "openssl rand -base64 32",
    };
  }
  if (/changeme|generate/i.test(secret)) {
    return {
      id: "customer_session_secret",
      severity: "bloquea",
      title,
      detail: "CUSTOMER_SESSION_SECRET sigue siendo un placeholder",
    };
  }

  return { id: "customer_session_secret", severity: "ok", title, detail: "configurado" };
}

/**
 * Credenciales de Pagopar.
 *
 * Advierte y no bloquea: la tienda cobra igual por transferencia y contra
 * entrega, que es el MVP. Sin las tres, el checkout simplemente no ofrece
 * tarjeta.
 */
function checkPagoparCredentials(env: PreflightEnv): PreflightCheck {
  const missing = ["PAGOPAR_PUBLIC_KEY", "PAGOPAR_PRIVATE_KEY", "PAGOPAR_BASE_URL"].filter(
    (name) => value(env, name) === "",
  );

  if (missing.length === 0) {
    return {
      id: "pagopar_credenciales",
      severity: "ok",
      title: "Credenciales de Pagopar",
      detail: "las tres configuradas",
    };
  }

  return {
    id: "pagopar_credenciales",
    severity: "advierte",
    title: "Credenciales de Pagopar",
    detail: `faltan ${missing.join(", ")}: el checkout no va a ofrecer tarjeta`,
  };
}

/** Sin Cloudinary no hay comprobantes: el comprador no puede probar que pagó. */
function checkCloudinary(env: PreflightEnv): PreflightCheck {
  const missing = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter(
    (name) => {
      const current = value(env, name);
      return current === "" || /changeme/i.test(current);
    },
  );

  if (missing.length === 0) {
    return {
      id: "cloudinary",
      severity: "ok",
      title: "Cloudinary",
      detail: "configurado",
    };
  }

  return {
    id: "cloudinary",
    severity: "bloquea",
    title: "Cloudinary",
    detail:
      `faltan ${missing.join(", ")}. Sin esto el comprador no puede subir el comprobante, ` +
      "que es el único paso que convierte una transferencia en un pedido verificable",
  };
}

/** El aviso al dueño llega por WhatsApp; sin número, no llega. */
function checkWhatsApp(env: PreflightEnv): PreflightCheck {
  const phone = value(env, "WHATSAPP_NUMBER");

  if (phone === "") {
    return {
      id: "whatsapp",
      severity: "bloquea",
      title: "WhatsApp del comercio",
      detail: "WHATSAPP_NUMBER vacío: el comprador no tiene botón para avisar del pedido",
    };
  }
  if (!/^\+595\d{9}$/.test(phone)) {
    return {
      id: "whatsapp",
      severity: "advierte",
      title: "WhatsApp del comercio",
      detail: "WHATSAPP_NUMBER no tiene la forma +5959XXXXXXXX; wa.me puede rechazarlo",
    };
  }

  return { id: "whatsapp", severity: "ok", title: "WhatsApp del comercio", detail: "configurado" };
}

/**
 * El aviso de pedido nuevo al comercio (fable/plan.md §5.2).
 *
 * Advierte, no bloquea: una tienda puede vender igual mirando el panel. Pero
 * mirarlo es una disciplina, y un pedido por transferencia que nadie ve en 24
 * horas es una venta perdida, así que conviene que salga escrito en el deploy.
 */
function checkAvisoPedidoNuevo(env: PreflightEnv): PreflightCheck {
  const template = value(env, "WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO");
  const cloudListo =
    value(env, "WHATSAPP_CLOUD_PHONE_NUMBER_ID") !== "" &&
    value(env, "WHATSAPP_CLOUD_ACCESS_TOKEN") !== "";
  const destino = value(env, "WHATSAPP_NUMBER");

  const faltan = [
    ...(cloudListo ? [] : ["las credenciales de WhatsApp Cloud"]),
    ...(template === "" ? ["WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO"] : []),
    ...(destino === "" ? ["WHATSAPP_NUMBER"] : []),
  ];

  if (faltan.length > 0) {
    return {
      id: "aviso_pedido_nuevo",
      severity: "advierte",
      title: "Aviso de pedido nuevo",
      detail:
        `el comercio no recibe aviso de pedidos nuevos: falta ${faltan.join(", ")}. ` +
        "Se entera sólo si mira el panel o si la compradora toca el botón de WhatsApp",
    };
  }

  return {
    id: "aviso_pedido_nuevo",
    severity: "ok",
    title: "Aviso de pedido nuevo",
    detail: "configurado",
  };
}

/** Una base local en el servidor real es una tienda sin datos. */
function checkDatabaseUrl(env: PreflightEnv): PreflightCheck {
  const url = value(env, "DATABASE_URL");

  if (url === "") {
    return {
      id: "database_url",
      severity: "bloquea",
      title: "Base de datos",
      detail: "DATABASE_URL vacía",
    };
  }

  if (isProduction(env) && /@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    return {
      id: "database_url",
      severity: "advierte",
      title: "Base de datos",
      detail:
        "DATABASE_URL apunta a localhost con NODE_ENV=production. En Hostinger puede ser " +
        "correcto (la base vive en el mismo host); verificá que no sea el .env de desarrollo",
    };
  }

  return { id: "database_url", severity: "ok", title: "Base de datos", detail: "configurada" };
}

/** Los links de WhatsApp que se le mandan al comprador salen de acá. */
function checkSiteUrl(env: PreflightEnv): PreflightCheck {
  const url = value(env, "NEXT_PUBLIC_SITE_URL");

  if (url === "") {
    return {
      id: "site_url",
      severity: "bloquea",
      title: "URL del sitio",
      detail: "NEXT_PUBLIC_SITE_URL vacía: los links del pedido salen rotos",
    };
  }

  if (isProduction(env) && !url.startsWith("https://")) {
    return {
      id: "site_url",
      severity: "bloquea",
      title: "URL del sitio",
      detail:
        `NEXT_PUBLIC_SITE_URL no es https en producción. El token del pedido viaja en esa ` +
        "URL y Pagopar no llama a un endpoint sin certificado",
    };
  }

  return { id: "site_url", severity: "ok", title: "URL del sitio", detail: url };
}
