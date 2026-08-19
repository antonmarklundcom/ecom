import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerRegisterForm } from "@/components/cuenta/register-form";
import { currentCustomer } from "@/lib/customer-session";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  if (await currentCustomer()) redirect("/cuenta");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Creá tu cuenta</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Guardamos tus datos para que la próxima compra sea de dos toques.
      </p>

      <div className="mt-6">
        <CustomerRegisterForm />
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        ¿Ya tenés cuenta?{" "}
        <Link href="/cuenta/entrar" className="underline">
          Entrá
        </Link>
        .
      </p>

      <p className="text-muted-foreground border-border mt-6 border-t pt-4 text-xs">
        No hace falta cuenta para comprar. Esto es sólo para no volver a tipear
        tu dirección.
      </p>
    </main>
  );
}
