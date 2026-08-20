import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerRegisterForm } from "@/components/cuenta/register-form";
import { TEXTOS } from "@/i18n";
import { currentCustomer } from "@/lib/customer-session";

export const metadata: Metadata = {
  title: TEXTOS.cuenta.registroTitulo,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  if (await currentCustomer()) redirect("/cuenta");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">{TEXTOS.cuenta.registroEncabezado}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{TEXTOS.cuenta.registroAyuda}</p>

      <div className="mt-6">
        <CustomerRegisterForm />
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        {TEXTOS.cuenta.yaTenesCuenta}{" "}
        <Link href="/cuenta/entrar" className="underline">
          {TEXTOS.cuenta.entra}
        </Link>
        .
      </p>

      <p className="text-muted-foreground border-border mt-6 border-t pt-4 text-xs">
        {TEXTOS.cuenta.noHaceFaltaCuentaComprar}
      </p>
    </main>
  );
}
