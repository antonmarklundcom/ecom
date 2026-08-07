import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";

import { LogoutButton } from "@/components/admin/logout-button";
import { UnauthorizedError, getSession, requireAdmin } from "@/lib/session";

/**
 * Puerta del panel. Todo lo que cuelga de este layout exige sesión de admin.
 *
 * Es la segunda de tres capas: middleware (redirige), este layout (no
 * renderiza), y `requireAdminSession()` adentro de cada server action (la que
 * de verdad frena una escritura). Las dos primeras son comodidad; si sólo
 * quedara la tercera, el panel seguiría siendo seguro.
 */
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  try {
    requireAdmin(await getSession());
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    throw error;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-border bg-background sticky top-0 z-10 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/admin" className="font-semibold tracking-tight">
            Panel
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            <NavLink href="/admin">Resumen</NavLink>
            <NavLink href="/admin/pedidos">Pedidos</NavLink>
            <NavLink href="/admin/productos">Productos</NavLink>
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hover:bg-muted shrink-0 rounded-lg px-3 py-1.5 whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
