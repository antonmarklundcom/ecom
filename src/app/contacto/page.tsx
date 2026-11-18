import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { t } from "@/i18n";
import { contactoPublico } from "@/lib/comercio";
import { nombreTienda } from "@/lib/marca";
import { listaConY } from "@/lib/placeholders";
import { formatPhonePY, waLink } from "@/lib/py";
import { contactoTieneDatos } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
import { TESTIDS } from "@/lib/testids";

/**
 * `/contacto` (O35, fable/plan-trafico.md §2.4): WhatsApp, e-mail, dirección,
 * horario y redes, **sólo** lo que la tienda cargó (`/admin/ajustes` →
 * Contacto, o `WHATSAPP_NUMBER` para el WhatsApp: `contactoPublico()`).
 * Nada de envíos, plazos ni devoluciones: eso vive en sus páginas y sólo si
 * el dueño lo cargó. Sin ningún dato, 404 (y no va al pie ni al sitemap).
 *
 * Es piel: una tienda puede rediseñarla, o tener la suya (`template:sync`
 * conserva un `src/app/contacto/` propio).
 */
export const dynamic = "force-dynamic";

const NOMBRE_RED = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const contacto = await contactoPublico();
  if (!contactoTieneDatos(contacto)) return {};
  const medios = [
    contacto.whatsapp ? t("contacto.whatsapp") : null,
    contacto.email ? t("contacto.email") : null,
    ...contacto.redes.map((red) => NOMBRE_RED[red.red]),
  ].filter((medio): medio is string => Boolean(medio));
  const origin = siteOrigin();
  return {
    title: t("contacto.titulo"),
    description:
      medios.length > 0
        ? t("contacto.metaDescripcion", {
            tienda: await nombreTienda(),
            medios: listaConY(medios),
          })
        : t("contacto.intro"),
    ...(origin
      ? { alternates: { canonical: new URL("/contacto", origin).toString() } }
      : {}),
  };
}

export default async function ContactoPage() {
  const contacto = await contactoPublico();
  if (!contactoTieneDatos(contacto)) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("contacto.titulo")}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t("contacto.intro")}</p>

      {contacto.whatsapp ? (
        <a
          href={waLink(contacto.whatsapp, t("contacto.whatsappMensaje"))}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={TESTIDS.contactWhatsapp}
          className="bg-primary text-primary-foreground mt-6 inline-flex rounded-lg px-4 py-3 text-sm font-medium"
        >
          {t("contacto.whatsappBoton")}
        </a>
      ) : null}

      <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-[10rem_1fr]">
        {contacto.whatsapp ? (
          <>
            <dt className="text-muted-foreground">{t("contacto.whatsapp")}</dt>
            <dd>{formatPhonePY(contacto.whatsapp)}</dd>
          </>
        ) : null}
        {contacto.email ? (
          <>
            <dt className="text-muted-foreground">{t("contacto.email")}</dt>
            <dd>
              <a href={`mailto:${contacto.email}`} className="underline">
                {contacto.email}
              </a>
            </dd>
          </>
        ) : null}
        {contacto.direccion ? (
          <>
            <dt className="text-muted-foreground">{t("contacto.direccion")}</dt>
            <dd>{contacto.direccion}</dd>
          </>
        ) : null}
        {contacto.horario ? (
          <>
            <dt className="text-muted-foreground">{t("contacto.horario")}</dt>
            <dd>{contacto.horario}</dd>
          </>
        ) : null}
        {contacto.redes.length > 0 ? (
          <>
            <dt className="text-muted-foreground">{t("contacto.redes")}</dt>
            <dd>
              <ul className="flex flex-wrap gap-3">
                {contacto.redes.map((red) => (
                  <li key={red.red}>
                    <a
                      href={red.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {NOMBRE_RED[red.red]}
                    </a>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>
    </main>
  );
}
