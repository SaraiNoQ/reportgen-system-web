"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Building2, Check, ChevronDown, LogOut, PanelLeftClose, Search } from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/forms";
import { ProjectStatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export function TopNav({
  onSidebarToggle
}: {
  onSidebarToggle: () => void;
}) {
  const { currentProject, projects, switchProject, unreadCount, user, logout } = useAppContext();
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const projectRef = useRef<HTMLDivElement>(null);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.name}${project.code}${project.type}${project.owner}`.toLowerCase().includes(query)
    );
  }, [projectQuery, projects]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!projectRef.current?.contains(event.target as Node)) setProjectOpen(false);
    }

    if (!projectOpen) return undefined;
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [projectOpen]);

  function handleSwitchProject(projectId: string) {
    switchProject(projectId);
    setProjectOpen(false);
    setProjectQuery("");
  }

  return (
    <header
      className="sticky top-0 z-10 border-b border-ink-black/15 bg-parchment-cream/90 px-3.5 py-2 backdrop-blur transition-[margin] duration-200 lg:ml-[var(--sidebar-width)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button className="lg:hidden" variant="ghost" onClick={onSidebarToggle} aria-label="切换导航栏">
            <PanelLeftClose className="size-4" />
          </Button>
          <div ref={projectRef} className="relative hidden lg:block">
            <Button
              className="max-w-[270px] justify-between"
              variant="secondary"
              aria-haspopup="listbox"
              aria-expanded={projectOpen}
              onClick={() => setProjectOpen((open) => !open)}
            >
              <Building2 className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{currentProject?.name ?? "选择项目"}</span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", projectOpen && "rotate-180")} />
            </Button>

            {projectOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[390px] rounded-lg border border-ink-black bg-parchment-cream p-2 shadow-editorial">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
                  <Input
                    className="h-9 w-full pl-9"
                    placeholder="搜索项目名称、编号、类型"
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                  />
                </div>
                <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                  {filteredProjects.map((project) => {
                    const active = project.id === currentProject?.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => handleSwitchProject(project.id)}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto] gap-3 rounded-md border px-3 py-2 text-left transition",
                          active
                            ? "border-ink-black bg-ink-black text-parchment-cream"
                            : "border-ink-black/12 hover:border-ink-black/35 hover:bg-lavender-mist/55"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{project.name}</span>
                          <span className={cn("mt-1 block truncate text-xs", active ? "text-parchment-cream/70" : "text-warm-stone")}>
                            {project.code} · {project.type} · {project.owner}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <ProjectStatusBadge status={project.status} />
                          {active ? <Check className="size-4" /> : null}
                        </span>
                      </button>
                    );
                  })}
                  {!filteredProjects.length ? (
                    <div className="rounded-md border border-ink-black/15 px-3 py-6 text-center text-sm text-warm-stone">
                      未找到匹配项目
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
            <Input className="w-full rounded-lg pl-9" placeholder="搜索项目、报告、字段规则" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/account?tab=messages">
            <Button variant="ghost" aria-label="消息">
              <Bell className="size-4" />
              消息 <span className="rounded-md bg-ink-black px-1.5 py-0.5 text-xs text-parchment-cream">{unreadCount}</span>
            </Button>
          </Link>
          <Link href="/account?tab=profile">
            <Button variant="secondary">{user?.name ?? "用户"}</Button>
          </Link>
          <Button variant="ghost" aria-label="退出登录" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
