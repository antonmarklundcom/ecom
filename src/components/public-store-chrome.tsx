"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
/** Keep storefront controls out of the admin/setup component tree. */
export function PublicStoreChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path === "/admin" || path?.startsWith("/admin/") || path === "/setup"
    ? null
    : children;
}
