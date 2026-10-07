"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAdminAfterSetup } from "@/app/actions/admin-auth";
import { PasswordInput } from "@/components/ui/password-input";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export const SETUP_WELCOME_PATH = "/admin/bienvenida";
export const SETUP_LOGIN_PATH = "/admin/login?next=%2Fadmin%2Fbienvenida";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Chequeo = {
  id: string;
  severity: "bloquea" | "advierte" | "ok";
  title: string;
  detail: string;
};

type Respuesta = {
  ok?: boolean;
  error?: string;
  detalle?: string;
  pasos?: Record<string, string>;
  preflight?: { checks: Chequeo[]; blocking: number; warnings: number };
  loginError?: boolean;
};

/**
 * El formulario de `/setup`. Hace el mismo POST que el curl de DEPLOY.md §4:
 * el secreto en `Authorization: Bearer`, el dueño y el catálogo de ejemplo en
 * el cuerpo. Lo que muestra es lo que contesta la ruta — los pasos y el
 * reporte de preflight —, nunca lo que se tipeó.
 */
export function SetupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (respuesta) resultRef.current?.focus();
  }, [respuesta]);

  return (
    <div className="grid gap-6">
      {respuesta ? (
        <Resultado respuesta={respuesta} resultRef={resultRef} />
      ) : null}
      <form
        className="border-border grid gap-4 rounded-xl border p-4"
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const secreto = String(data.get("secreto") ?? "");
          const email = String(data.get("email") ?? "").trim();
          const password = String(data.get("password") ?? "");
          const repeatPassword = String(data.get("repeatPassword") ?? "");
          if (email && password !== repeatPassword) {
            setRespuesta({ ok: false, error: "passwords_do_not_match" });
            return;
          }
          const nombre = String(data.get("nombre") ?? "").trim();
          const cuerpo = {
            seed: data.get("seed") !== null,
            force: data.get("force") !== null,
            ...(email !== ""
              ? {
                  owner: {
                    email,
                    password,
                    passwordConfirmation: repeatPassword,
                    ...(nombre ? { name: nombre } : {}),
                  },
                }
              : {}),
          };

          startTransition(async () => {
            setRespuesta(null);
            try {
              const res = await fetch("/api/setup/init", {
                method: "POST",
                headers: {
                  authorization: `Bearer ${secreto}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify(cuerpo),
              });
              const json = (await res.json().catch(() => ({}))) as Respuesta;
              const success = res.ok && json.ok === true;
              const ownerReady =
                json.pasos?.duenio === "creado" ||
                json.pasos?.duenio === "actualizado";
              if (success && email && !ownerReady) {
                setRespuesta({ ok: false, error: "cuenta_sin_confirmar" });
                return;
              }
              setRespuesta({ ...json, ok: success });
              // La contraseña y el secreto no se quedan en pantalla.
              if (success) {
                form.reset();
                setOwnerEmail("");
                if (email && ownerReady) {
                  const credentials = new FormData();
                  credentials.set("email", email);
                  credentials.set("password", password);
                  let authenticated = false;
                  try {
                    authenticated = (await loginAdminAfterSetup(credentials))
                      .ok;
                  } catch {
                    /* Account already created; preserve success and offer login. */
                  }
                  if (authenticated) router.replace(SETUP_WELCOME_PATH);
                  else setRespuesta({ ...json, ok: true, loginError: true });
                }
              }
            } catch {
              setRespuesta({ ok: false, error: "red" });
            }
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="setup-secreto">{t("setup.secreto")}</Label>
          <Input
            id="setup-secreto"
            name="secreto"
            type="password"
            required
            autoComplete="off"
            disabled={isPending}
          />
          <p className="text-muted-foreground text-xs">
            {t("setup.secretoAyuda")}
          </p>
        </div>

        <fieldset
          disabled={isPending}
          className="border-border grid gap-3 rounded-lg border p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {t("setup.duenio")}
          </legend>
          <div className="grid gap-1.5">
            <Label htmlFor="setup-email">{t("setup.email")}</Label>
            <Input
              id="setup-email"
              name="email"
              type="email"
              autoComplete="username"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
            />
          </div>
          <PasswordField
            id="setup-password"
            name="password"
            label={t("setup.password")}
            required={ownerEmail.trim() !== ""}
          />
          <PasswordField
            id="setup-repeat-password"
            name="repeatPassword"
            label={t("setup.repeatPassword")}
            required={ownerEmail.trim() !== ""}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="setup-nombre">{t("setup.nombre")}</Label>
            <Input id="setup-nombre" name="nombre" autoComplete="off" />
          </div>
          <p className="text-muted-foreground text-xs">
            {t("setup.duenioAyuda")}
          </p>
        </fieldset>

        <div className="grid gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="seed"
              aria-describedby="setup-seed-help"
              disabled={isPending}
              className="mt-1"
            />
            {t("setup.seed")}
          </label>
          <p
            id="setup-seed-help"
            className="text-muted-foreground ml-6 text-xs"
          >
            {t("setup.seedAyuda")}
          </p>
        </div>
        <div className="grid gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="force"
              aria-describedby="setup-force-help"
              disabled={isPending}
              className="mt-1"
            />
            {t("setup.force")}
          </label>
          <p
            id="setup-force-help"
            className="text-muted-foreground ml-6 text-xs"
          >
            {t("setup.forceAyuda")}
          </p>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? t("setup.corriendo") : t("setup.correr")}
        </Button>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  name,
  label,
  required,
}: {
  id: string;
  name: string;
  label: string;
  required: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        name={name}
        autoComplete="new-password"
        required={required}
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={200}
        showLabel={t("setup.showPassword", { campo: label })}
        hideLabel={t("setup.hidePassword", { campo: label })}
      />
    </div>
  );
}

function mensajeDeError(respuesta: Respuesta): string {
  switch (respuesta.error) {
    case "passwords_do_not_match":
      return t("setup.error.passwords");
    case "password_no_coincide":
      return t("setup.error.passwords");
    case "cuenta_sin_confirmar":
      return t("setup.error.cuentaSinConfirmar");
    case "unauthorized":
      return t("setup.error.secreto");
    case "rate_limited":
      return t("setup.error.limite");
    case "https_required":
      return t("setup.error.https");
    case "ya_inicializada":
      return t("setup.error.yaInicializada");
    case "password_debil":
    case "cuerpo_invalido":
      return respuesta.detalle ?? t("setup.error.generico");
    case "not_configured":
      return t("setup.error.sinSecreto");
    default:
      return t("setup.error.generico");
  }
}

function Resultado({
  respuesta,
  resultRef,
}: {
  respuesta: Respuesta;
  resultRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      role={respuesta.ok ? "status" : "alert"}
      className={`grid gap-3 rounded-xl border p-4 text-sm outline-offset-4 ${respuesta.ok ? "border-primary bg-primary/5" : "border-destructive/40"}`}
    >
      <p
        className={
          respuesta.ok ? "font-medium" : "text-destructive font-medium"
        }
      >
        {respuesta.ok ? (
          <CheckCircle2 className="mr-2 inline size-5" aria-hidden="true" />
        ) : null}
        {respuesta.ok ? t("setup.listo") : mensajeDeError(respuesta)}
      </p>
      {respuesta.ok ? (
        <>
          <p>{t("setup.successNext")}</p>
          {respuesta.loginError ? <p>{t("setup.loginManual")}</p> : null}
          <Button asChild className="w-fit">
            <Link href={SETUP_LOGIN_PATH}>{t("setup.adminLogin")}</Link>
          </Button>
        </>
      ) : null}
      {respuesta.pasos ? (
        <ul className="text-muted-foreground grid gap-1">
          {Object.entries(respuesta.pasos).map(([paso, estado]) => (
            <li key={paso}>
              <span className="text-foreground">{paso}</span>: {estado}
            </li>
          ))}
        </ul>
      ) : null}
      {respuesta.preflight ? (
        <div className="grid gap-1">
          <p className="font-medium">{t("setup.preflight")}</p>
          <ul className="grid gap-1">
            {respuesta.preflight.checks
              .filter((chequeo) => chequeo.severity !== "ok")
              .map((chequeo) => (
                <li key={chequeo.id}>
                  <span
                    className={
                      chequeo.severity === "bloquea" ? "text-destructive" : ""
                    }
                  >
                    {chequeo.severity === "bloquea" ? "✗" : "!"} {chequeo.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {chequeo.detail}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
