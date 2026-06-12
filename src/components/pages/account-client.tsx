"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Clock3,
  FileText,
  Loader2,
  LogOut,
  MailOpen,
  Search,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { ProjectStatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { SystemMessage } from "@/lib/types/domain";

const messageTypes = ["全部类型", "成功", "提醒", "警告", "失败"] as const;
const messageStates = ["全部消息", "未读", "已读"] as const;

function typeClass(type: SystemMessage["type"]) {
  if (type === "成功") return "border-emerald-700/30 bg-emerald-50 text-emerald-800";
  if (type === "警告") return "border-amber-700/30 bg-amber-50 text-amber-800";
  if (type === "失败") return "border-red-700/30 bg-red-50 text-red-800";
  return "border-ink-black/20 bg-lavender-mist text-graphite";
}

export function AccountClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentProject,
    messages,
    markAllMessagesRead,
    markMessageRead,
    projects,
    session,
    switchProject,
    unreadCount,
    user,
    logout
  } = useAppContext();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof messageTypes)[number]>("全部类型");
  const [state, setState] = useState<(typeof messageStates)[number]>("全部消息");
  const [markingAll, setMarkingAll] = useState(false);
  const [markingMessageId, setMarkingMessageId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeTab = searchParams.get("tab") === "profile" ? "profile" : "messages";

  const filteredMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((message) => {
      const matchesQuery = !q || `${message.title}${message.content}${message.module}`.toLowerCase().includes(q);
      const matchesType = type === "全部类型" || message.type === type;
      const matchesState = state === "全部消息" || (state === "未读" ? !message.read : message.read);
      return matchesQuery && matchesType && matchesState;
    });
  }, [messages, query, state, type]);

  function openTab(tab: "messages" | "profile") {
    router.replace(`/account?tab=${tab}`);
  }

  async function handleMarkAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllMessagesRead();
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleMarkMessageRead(messageId: string) {
    if (markingMessageId) return;
    setMarkingMessageId(messageId);
    try {
      await markMessageRead(messageId);
    } finally {
      setMarkingMessageId(null);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono-label text-warm-stone">Account Center</p>
          <h1 className="serif mt-1 text-5xl leading-tight">消息与用户信息</h1>
        </div>
        <div className="flex rounded-lg border border-ink-black/20 bg-parchment-cream p-1">
          <button
            type="button"
            onClick={() => openTab("messages")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              activeTab === "messages" ? "bg-ink-black text-parchment-cream" : "text-graphite hover:bg-lavender-mist"
            )}
          >
            消息中心
          </button>
          <button
            type="button"
            onClick={() => openTab("profile")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              activeTab === "profile" ? "bg-ink-black text-parchment-cream" : "text-graphite hover:bg-lavender-mist"
            )}
          >
            用户信息
          </button>
        </div>
      </div>

      {activeTab === "messages" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-black/10 pb-3">
              <div>
                <h2 className="serif text-3xl leading-tight">消息中心</h2>
                <p className="mt-1 text-sm text-warm-stone">查看系统通知、解析状态和报告生成结果。</p>
              </div>
              <Button variant="secondary" disabled={!unreadCount || Boolean(markingMessageId)} onClick={handleMarkAllRead} loading={markingAll} loadingText="同步中">
                <CheckCheck className="size-4" />
                全部已读
              </Button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_160px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
                <Input className="w-full pl-9" placeholder="搜索消息标题、模块或内容" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                {messageTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
              <Select value={state} onChange={(event) => setState(event.target.value as typeof state)}>
                {messageStates.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </div>

            <div className="mt-4 space-y-2">
              {filteredMessages.map((message) => {
                const project = projects.find((item) => item.id === message.projectId);
                return (
                  <button
                    key={message.id}
                    type="button"
                    disabled={markingAll || Boolean(markingMessageId)}
                    onClick={() => void handleMarkMessageRead(message.id)}
                    className={cn(
                      "grid w-full gap-3 rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 md:grid-cols-[1fr_auto]",
                      message.read
                        ? "border-ink-black/12 bg-transparent hover:border-ink-black/30"
                        : "border-ink-black/35 bg-parchment-cream shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:bg-lavender-mist/35"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium">{message.title}</span>
                        {!message.read ? <span className="size-2 rounded-full bg-ink-black" /> : null}
                      </span>
                      <span className="mt-1 block text-sm text-graphite">{message.content}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-warm-stone">
                        <span>{message.module}</span>
                        {project ? <span>{project.name}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />
                          {message.time}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 md:justify-end">
                      <span className={cn("rounded-md border px-2 py-1 text-xs", typeClass(message.type))}>{message.type}</span>
                      {markingMessageId === message.id ? <Loader2 className="size-4 animate-spin text-ink-black" /> : message.read ? <MailOpen className="size-4 text-warm-stone" /> : <Bell className="size-4 text-ink-black" />}
                    </span>
                  </button>
                );
              })}
              {!filteredMessages.length ? (
                <div className="rounded-lg border border-ink-black/15 px-4 py-10 text-center text-sm text-warm-stone">
                  暂无匹配消息
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="h-fit p-4">
            <h2 className="serif text-3xl leading-tight">消息概览</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-ink-black/15 p-3">
                <p className="text-sm text-warm-stone">未读消息</p>
                <p className="serif mt-2 text-4xl">{unreadCount}</p>
              </div>
              <div className="rounded-lg border border-ink-black/15 p-3">
                <p className="text-sm text-warm-stone">全部消息</p>
                <p className="serif mt-2 text-4xl">{messages.length}</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-ink-black/15 p-3">
              <p className="text-sm text-warm-stone">当前项目</p>
              <p className="mt-2 font-medium">{currentProject?.name ?? "未选择项目"}</p>
              {currentProject ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <ProjectStatusBadge status={currentProject.status} />
                  <Link className="text-sm underline underline-offset-4" href="/records">进入上传</Link>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-lg border border-ink-black bg-ink-black text-parchment-cream">
                <UserRound className="size-5" />
              </div>
              <div>
                <h2 className="serif text-3xl leading-tight">{user?.name ?? "未登录"}</h2>
                <p className="text-sm text-warm-stone">{user?.role ?? "未识别角色"}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-ink-black/10 pb-2">
                <span className="text-warm-stone">所属部门</span>
                <span>{user?.department ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-ink-black/10 pb-2">
                <span className="text-warm-stone">账号状态</span>
                <Badge>{user?.status ?? "-"}</Badge>
              </div>
              <div className="flex items-center justify-between border-b border-ink-black/10 pb-2">
                <span className="text-warm-stone">最近登录</span>
                <span>{user?.lastLogin ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-warm-stone">会话有效期</span>
                <span>{session ? new Date(session.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</span>
              </div>
            </div>
            <Button className="mt-5 w-full" variant="primary" onClick={handleLogout} loading={loggingOut} loadingText="退出中">
              <LogOut className="size-4" />
              退出登录
            </Button>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mono-label text-warm-stone">Project Access</p>
                <h2 className="serif mt-1 text-3xl leading-tight">当前项目与权限</h2>
              </div>
              <ShieldCheck className="size-6 text-graphite" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {projects.map((project) => {
                const active = project.id === currentProject?.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => switchProject(project.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      active ? "border-ink-black bg-ink-black text-parchment-cream" : "border-ink-black/15 hover:border-ink-black/40 hover:bg-lavender-mist/40"
                    )}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{project.name}</span>
                        <span className={cn("mt-1 block text-xs", active ? "text-parchment-cream/70" : "text-warm-stone")}>
                          {project.code}
                        </span>
                      </span>
                      {active ? <CheckCheck className="size-4" /> : null}
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-3">
                      <ProjectStatusBadge status={project.status} />
                      <span className={cn("text-xs", active ? "text-parchment-cream/70" : "text-warm-stone")}>{project.progress}%</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 rounded-lg border border-ink-black/15 p-4">
              <div className="flex items-center gap-2">
                <FileText className="size-4" />
                <p className="font-medium">鉴权联动说明</p>
              </div>
              <p className="mt-2 text-sm text-graphite">
                当前前端会优先调用 Core API 的登录、退出、消息和项目接口；后端不可用时自动降级到 mock adapter。登录态、用户信息和当前项目会保存在本地会话中，退出时统一清理。
              </p>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
