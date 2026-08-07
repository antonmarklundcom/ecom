"use client";

import { useTransition } from "react";

import { logoutAdmin } from "@/app/actions/admin-auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => logoutAdmin())}
    >
      {isPending ? "Saliendo…" : "Salir"}
    </Button>
  );
}
