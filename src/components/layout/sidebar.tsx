"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  FileText,
  Gauge,
  ListChecks,
  ScrollText,
  Settings,
  UploadCloud,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/records", label: "原始记录上传", icon: UploadCloud },
  { href: "/reports", label: "报告生成", icon: FileText },
  { href: "/rules", label: "规则配置", icon: ListChecks }
];

const managementNav = [
  { href: "/projects", label: "项目管理", icon: Gauge },
  { href: "/system/users", label: "用户管理", icon: Users },
  { href: "/system/logs", label: "日志管理", icon: ScrollText }
];

export function Sidebar({
  collapsed,
  onCollapsedChange
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const [managementOpen, setManagementOpen] = useState(pathname.startsWith("/projects") || pathname.startsWith("/system"));

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar-width)] border-r border-ink-black bg-charcoal text-parchment-cream transition-[width] duration-200 lg:flex lg:flex-col"
    >
      <div className={cn("border-b border-parchment-cream/15", collapsed ? "px-2 py-3" : "px-3.5 py-4")}>
        <Link href="/records" className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-parchment-cream/50">
            <Settings className="size-4" />
          </div>
          <div className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-36 opacity-100")}>
            <p className="serif text-lg leading-tight">智能检测报告</p>
            <p className="text-xs uppercase tracking-[0.1em] text-parchment-cream/70">Generation</p>
          </div>
        </Link>
      </div>
      <nav className={cn("flex-1 space-y-1.5 py-3", collapsed ? "px-2" : "px-3")}>
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "flex items-center rounded-lg border text-sm transition",
                collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-1.5",
                active
                  ? "border-parchment-cream bg-parchment-cream text-ink-black"
                  : "border-transparent text-parchment-cream/72 hover:border-parchment-cream/25 hover:text-parchment-cream"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-28 opacity-100")}>
                {item.label}
              </span>
            </Link>
          );
        })}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => (collapsed ? onCollapsedChange(false) : setManagementOpen((open) => !open))}
            className={cn(
              "flex w-full items-center rounded-lg border border-parchment-cream/15 text-sm text-parchment-cream/80 transition hover:border-parchment-cream/30 hover:text-parchment-cream",
              collapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-1.5"
            )}
            title="管理"
          >
            <span className={cn("flex items-center gap-2", collapsed && "gap-0")}>
              <Settings className="size-4 shrink-0" />
              <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-16 opacity-100")}>
                管理
              </span>
            </span>
            {!collapsed ? <ChevronDown className={cn("size-4 transition", managementOpen ? "rotate-180" : "")} /> : null}
          </button>
          {collapsed ? (
            <div className="mt-1.5 space-y-1 border-t border-parchment-cream/10 pt-1.5">
              {managementNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    title={item.label}
                    className={cn(
                      "flex items-center justify-center rounded-lg border px-2 py-2 text-sm transition",
                      active
                        ? "border-parchment-cream bg-parchment-cream text-ink-black"
                        : "border-transparent text-parchment-cream/64 hover:border-parchment-cream/25 hover:text-parchment-cream"
                    )}
                  >
                    <Icon className="size-4" />
                  </Link>
                );
              })}
            </div>
          ) : managementOpen ? (
            <div className="mt-1.5 space-y-1 pl-2">
              {managementNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    title={item.label}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition",
                      active
                        ? "border-parchment-cream bg-parchment-cream text-ink-black"
                        : "border-transparent text-parchment-cream/64 hover:border-parchment-cream/25 hover:text-parchment-cream"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>
      <div className={cn("space-y-2 border-t border-parchment-cream/15 py-3 text-xs text-parchment-cream/60", collapsed ? "px-2 text-center" : "px-3")}>
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className={cn(
            "flex w-full items-center rounded-lg border border-parchment-cream/15 text-sm text-parchment-cream/80 transition hover:border-parchment-cream/30 hover:text-parchment-cream",
            collapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-1.5"
          )}
          aria-label={collapsed ? "展开导航栏" : "收起导航栏"}
          title={collapsed ? "展开导航栏" : "收起导航栏"}
        >
          <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100")}>
            收起导航
          </span>
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
        <div className="overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200">
          {collapsed ? "v0.1" : "v0.1 mock adapter"}
        </div>
      </div>
    </aside>
  );
}
