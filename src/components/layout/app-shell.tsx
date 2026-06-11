"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

export function AppShell({ children, initialCollapsed = false }: { children: ReactNode; initialCollapsed?: boolean }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const shellStyle = { "--sidebar-width": sidebarCollapsed ? "4rem" : "13rem" } as CSSProperties;

  function updateSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    document.cookie = `report-shell-sidebar=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <div className="min-h-screen" style={shellStyle}>
      <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={updateSidebarCollapsed} />
      <TopNav onSidebarToggle={() => updateSidebarCollapsed(!sidebarCollapsed)} />
      <main className="px-3.5 py-4 transition-[margin] duration-200 lg:ml-[var(--sidebar-width)] lg:px-4">
        <div className="mx-auto max-w-[1152px]">{children}</div>
      </main>
    </div>
  );
}
