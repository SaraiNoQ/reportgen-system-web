"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export function AppShellWrapper({ children, initialCollapsed }: { children: ReactNode; initialCollapsed: boolean }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return <AppShell initialCollapsed={initialCollapsed}>{children}</AppShell>;
}
