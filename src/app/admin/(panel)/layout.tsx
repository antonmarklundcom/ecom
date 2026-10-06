import { redirect } from "next/navigation";
import type React from "react";

import { AdminWorkspace } from "@/components/admin/sidebar";
import { adminMenuFor } from "@/components/admin/menu";
import { countPendingReviews } from "@/domain/reviews";
import { can } from "@/lib/permissions";
import { UnauthorizedError, type AdminActor } from "@/lib/session";
import { requireAdminSession } from "@/lib/admin-guard";
import { cargarIntegraciones } from "@/lib/integraciones-store";

/**
 * Puerta del panel. Todo lo que cuelga de este layout exige sesión de admin.
 *
 * Es la segunda de tres capas: middleware (redirige), este layout (no
 * renderiza), y `requireAdminSession()` adentro de cada server action (la que
 * de verdad frena una escritura). Las dos primeras son comodidad; si sólo
 * quedara la tercera, el panel seguiría siendo seguro.
 */
export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await cargarIntegraciones();
  let actor: AdminActor;
  try {
    actor = await requireAdminSession();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    throw error;
  }

  // Un COUNT sobre una tabla chica: el número en el menú es lo que hace que
  // alguien entre a moderar. Si la
  // consulta falla, el menú sale sin número y el panel sigue andando.
  const resenasPendientes = can(actor.role, "resenas")
    ? await countPendingReviews().catch(() => 0)
    : 0;

  return (
    <AdminWorkspace
      userId={actor.userId}
      items={adminMenuFor(actor.role, resenasPendientes)}
    >
      {children}
    </AdminWorkspace>
  );
}
