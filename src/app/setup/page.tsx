import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SetupForm } from "@/components/setup-form";
import { t } from "@/i18n";

export const metadata: Metadata = {
  title: t("setup.meta"),
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * `/setup` — la inicialización de una tienda recién deployada, **desde el
 * navegador** (DEPLOY.md §4). Antes era un `curl` a `/api/setup/init`, y es
 * exactamente eso: el formulario llama a esa misma ruta con el mismo secreto,
 * así que el candado (tiempo constante, rate limit, https, 409 si ya estaba
 * inicializada) es uno solo y no hay una segunda puerta que mantener.
 *
 * Sin `SETUP_SECRET` configurado la página **no existe** (404), igual que la
 * ruta responde 503: terminado el setup se saca la variable del hPanel y esto
 * desaparece. El secreto no viaja en la URL ni queda en la página: lo tipea
 * quien deploya y sale en un header, como en el curl.
 */
export default function SetupPage() {
  const secreto = process.env.SETUP_SECRET ?? "";
  if (secreto.length < 16) notFound();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("setup.titulo")}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t("setup.bajada")}</p>
      <section
        className="border-border mt-6 grid gap-3 rounded-xl border p-4 text-sm"
        aria-label={t("setup.launchTitle")}
      >
        <h2 className="font-semibold">{t("setup.launchTitle")}</h2>
        <p>{t("setup.launchRequired")}</p>
        <h3 className="font-semibold">{t("setup.optionalTitle")}</h3>
        <p className="text-muted-foreground">{t("setup.optionalHelp")}</p>
      </section>
      <div className="mt-6">
        <SetupForm />
      </div>
      <section className="mt-6 grid gap-3 text-sm">
        <h2 className="font-semibold">{t("setup.nextTitle")}</h2>
        <ol className="text-muted-foreground list-decimal space-y-2 pl-5">
          <li>{t("setup.nextCatalog")}</li>
          <li>{t("setup.nextPayments")}</li>
          <li>{t("setup.nextLaunch")}</li>
          <li>{t("setup.despues")}</li>
        </ol>
      </section>
    </main>
  );
}
