import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerLoginForm } from "@/components/cuenta/login-form";
import { currentCustomer } from "@/lib/customer-session";

export const metadata: Metadata = {
  title: "Entrar a tu cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EntrarPage() {
  if (await currentCustomer()) redirect("/cuenta");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Entrá a tu cuenta</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Para ver tus pedidos y no volver a tipear tus datos.
      </p>

      <div className="mt-6">
        <CustomerLoginForm />
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/cuenta/registro" className="underline">
          Creá una
        </Link>
        .
      </p>

      {/* Lo más importante de esta pantalla: que se pueda ignorar. */}
      <p className="text-muted-foreground border-border mt-6 border-t pt-4 text-xs">
        No hace falta cuenta para comprar. Podés hacer tu pedido como invitada y
        seguirlo con el link que te mandamos por WhatsApp.
      </p>
    </main>
  );
}
