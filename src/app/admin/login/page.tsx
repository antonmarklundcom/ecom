import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

// La sesión se lee en cada visita: cachear esta página serviría el estado de
// login de otro.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const rawNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = safeNextPath(rawNext);

  // Ya está adentro: no tiene sentido pedirle la contraseña de nuevo.
  const session = await getSession();
  if (session.userId && (session.role === "owner" || session.role === "staff")) {
    redirect(next);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Panel del comercio</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Entrá con tu cuenta para ver los pedidos.
      </p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
