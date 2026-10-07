"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { loginAdminAfterSetup } from "@/app/actions/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NewPasswordFields,
  passwordsMatch,
} from "@/components/ui/new-password-fields";
import { PasswordInput } from "@/components/ui/password-input";
import { t } from "@/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

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

export const SETUP_WELCOME_PATH = "/admin/bienvenida";
export const SETUP_LOGIN_PATH = "/admin/login?next=%2Fadmin%2Fbienvenida";

/** Fictional catalogue is an explicit opt-in for demos and staging only. */
export function SetupForm({
  allowDemoCatalogue = true,
}: {
  allowDemoCatalogue?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  return (
    <div className="grid gap-6">
      {respuesta ? <Resultado respuesta={respuesta} /> : null}
      {!respuesta?.ok ? (
        <form
          className="border-border grid gap-5 rounded-xl border p-4 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const secreto = String(data.get("secreto") ?? "");
            const email = String(data.get("email") ?? "").trim();
            const password = String(data.get("password") ?? "");
            const nombre = String(data.get("nombre") ?? "").trim();
            if (!email || !password) {
              setRespuesta({ ok: false, error: "cuenta_incompleta" });
              return;
            }
            if (!passwordsMatch(data)) {
              setRespuesta({ ok: false, error: "password_no_coincide" });
              return;
            }
            const cuerpo = {
              seed: allowDemoCatalogue && data.get("seed") !== null,
              force: data.get("force") !== null,
              owner: {
                email,
                password,
                passwordConfirmation: String(
                  data.get("passwordConfirmation") ?? ""
                ),
                ...(nombre ? { name: nombre } : {}),
              },
            };

            startTransition(async () => {
              setRespuesta(null);
              let result: Respuesta;
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
                result = { ...json, ok: res.ok && json?.ok === true };
              } catch {
                setRespuesta({ ok: false, error: "red" });
                return;
              }
              if (!result.ok) {
                setRespuesta(result);
                return;
              }
              const ownerReady =
                result.pasos?.duenio === "creado" ||
                result.pasos?.duenio === "actualizado";
              if (!ownerReady) {
                setRespuesta({
                  ...result,
                  ok: false,
                  error: "cuenta_sin_confirmar",
                });
                return;
              }

              // Clear the form before authenticating. Nothing is saved in browser storage.
              form.reset();
              setRespuesta({ ...result, ok: true });
              const credentials = new FormData();
              credentials.set("email", email);
              credentials.set("password", password);
              // Use normal login guards; preserve account success if login transport fails.
              let authenticated = false;
              try {
                const login = await loginAdminAfterSetup(credentials);
                authenticated = login.ok;
              } catch {
                // Account creation already succeeded; offer the usual login below.
              }
              if (authenticated) router.replace(SETUP_WELCOME_PATH);
              else setRespuesta({ ...result, ok: true, loginError: true });
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="setup-secreto">{t("setup.secreto")}</Label>
            <PasswordInput
              id="setup-secreto"
              name="secreto"
              required
              autoComplete="off"
              showLabel={t("setup.mostrarSecreto")}
              hideLabel={t("setup.ocultarSecreto")}
              aria-describedby="setup-secreto-help"
            />
            <p
              id="setup-secreto-help"
              className="text-muted-foreground text-xs"
            >
              {t("setup.secretoAyuda")}
            </p>
          </div>
          <fieldset className="border-border grid gap-4 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              {t("setup.duenio")}
            </legend>
            <div className="grid gap-1.5">
              <Label htmlFor="setup-email">{t("setup.email")}</Label>
              <Input
                id="setup-email"
                name="email"
                type="email"
                required
                maxLength={200}
                autoComplete="username"
                autoCapitalize="none"
              />
            </div>
            <NewPasswordFields
              id="setup-password"
              label={t("setup.password")}
              help={t("setup.passwordAyuda", { minimo: MIN_PASSWORD_LENGTH })}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="setup-nombre">{t("setup.nombre")}</Label>
              <Input
                id="setup-nombre"
                name="nombre"
                maxLength={160}
                autoComplete="name"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {t("setup.duenioAyuda")}
            </p>
          </fieldset>
          {allowDemoCatalogue ? (
            <div className="grid gap-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="seed"
                  className="mt-1"
                  aria-describedby="setup-demo-help"
                />
                <span>{t("setup.demoCatalogo")}</span>
              </label>
              <p id="setup-demo-help" className="text-muted-foreground text-sm">
                {t("setup.demoCatalogoAyuda")}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("setup.catalogoAyuda")}
            </p>
          )}
          <details className="border-border rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {t("setup.avanzado")}
            </summary>
            <p className="text-muted-foreground mt-3">
              {t("setup.forceAyuda")}
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input type="checkbox" name="force" className="mt-1" />
              <span>{t("setup.force")}</span>
            </label>
          </details>
          <Button type="submit" disabled={isPending}>
            {isPending ? t("setup.corriendo") : t("setup.correr")}
          </Button>
          <Link href="/admin/login" className="text-center text-sm underline">
            {t("setup.yaTengoCuenta")}
          </Link>
        </form>
      ) : null}
    </div>
  );
}

function mensajeDeError(respuesta: Respuesta): string {
  switch (respuesta.error) {
    case "unauthorized":
      return t("setup.error.secreto");
    case "rate_limited":
      return t("setup.error.limite");
    case "https_required":
      return t("setup.error.https");
    case "ya_inicializada":
      return t("setup.error.yaInicializada");
    case "password_no_coincide":
      return t("password.noCoinciden");
    case "cuenta_incompleta":
      return t("setup.error.cuentaIncompleta");
    case "cuenta_sin_confirmar":
      return t("setup.error.cuentaSinConfirmar");
    case "password_debil":
    case "cuerpo_invalido":
      return respuesta.detalle ?? t("setup.error.generico");
    case "not_configured":
      return t("setup.error.sinSecreto");
    default:
      return t("setup.error.generico");
  }
}

function Resultado({ respuesta }: { respuesta: Respuesta }) {
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    resultRef.current?.focus();
  }, [respuesta]);
  return (
    <section
      ref={resultRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-labelledby="setup-result-heading"
      className="border-border focus-visible:ring-ring grid scroll-mt-28 gap-4 rounded-xl border p-5 text-sm focus-visible:ring-2"
    >
      <h2
        id="setup-result-heading"
        className={
          respuesta.ok
            ? "text-xl font-semibold"
            : "text-destructive font-medium"
        }
      >
        {respuesta.ok ? t("setup.listo") : mensajeDeError(respuesta)}
      </h2>
      {respuesta.ok ? (
        <>
          <p>{t("setup.listoAyuda")}</p>
          {respuesta.loginError ? (
            <p>{t("setup.loginManual")}</p>
          ) : (
            <p>{t("setup.entrando")}</p>
          )}
          <Link
            href={SETUP_LOGIN_PATH}
            className="bg-primary text-primary-foreground inline-flex min-h-10 items-center justify-center rounded-md px-4 font-medium"
          >
            {t("setup.loginButton")}
          </Link>
        </>
      ) : null}
      {respuesta.pasos || respuesta.preflight ? (
        <details className="border-border rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">
            {t("setup.detalles")}
          </summary>
          <p className="text-muted-foreground mt-3">
            {t("setup.detallesAyuda")}
          </p>
          {respuesta.pasos ? (
            <ul className="mt-3 grid gap-2">
              {Object.entries(respuesta.pasos).map(([paso, estado]) => (
                <li key={paso}>
                  {paso}: {estado}
                </li>
              ))}
            </ul>
          ) : null}
          {respuesta.preflight ? (
            <ul className="mt-4 grid gap-3">
              {respuesta.preflight.checks
                .filter((check) => check.severity !== "ok")
                .map((check) => (
                  <li key={check.id}>
                    <p className="font-medium">{check.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {check.detail}
                    </p>
                  </li>
                ))}
            </ul>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
