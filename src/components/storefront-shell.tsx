"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Keep server-rendered storefront slots outside the admin workspace, including login. */
export function StorefrontShell({
  children,
  storefrontBefore,
  storefrontAfter,
}: {
  children: ReactNode;
  storefrontBefore: ReactNode;
  storefrontAfter: ReactNode;
}) {
  const pathname = usePathname();
  const admin = pathname === "/admin" || pathname?.startsWith("/admin/");
  return (
    <>
      {!admin ? storefrontBefore : null}
      <div className="flex-1">{children}</div>
      {!admin ? storefrontAfter : null}
    </>
  );
}
