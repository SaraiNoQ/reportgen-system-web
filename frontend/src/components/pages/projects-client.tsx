"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, FileText, Plus, RotateCcw, Search, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { MetricCard } from "@/components/ui/metric-card";
import { Pagination } from "@/components/ui/pagination";
import { ProjectStatusBadge } from "@/components/ui/status-badge";
import { DataTable, Td } from "@/components/ui/table";
import { projectApi, systemApi } from "@/lib/services/api";
import type { AppUser, CreateProjectRequest, Project, ProjectMetric, ProjectVisibility } from "@/lib/types/domain";

const NEW_PROJECT_FORM: CreateProjectRequest = { name: "", owner: "", visibility: "public", allowedUserIds: [] };

function nowText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function actionForProject(project: Project) {
  if (project.status === "已完成") return { href: "/reports", label: "查看报告", icon: Eye };
  if (project.status === "待上传") return { href: "/records", label: "上传原始记录", icon: UploadCloud };
  if (project.status === "待审核") return { href: "/reports", label: "查看待审核报告", icon: FileText };
  return { href: "/records", label: "继续处理", icon: RotateCcw };
}

export function ProjectsClient({ metrics, projects: initialProjects }: { metrics: ProjectMetric[]; projects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [toast, setToast] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState<CreateProjectRequest>({ ...NEW_PROJECT_FORM });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    systemApi.users().then(setUsers).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = `${project.name}${project.code}${project.owner}`.includes(query);
      const matchesStatus = status === "全部状态" || project.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [projects, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProjects = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filtered, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function handleCreate() {
    if (!form.name.trim() || !form.owner.trim()) {
      setToast("请填写项目名称和负责人。");
      return;
    }
    setSaving(true);
    try {
      const created = await projectApi.create({
        name: form.name.trim(),
        owner: form.owner.trim(),
        visibility: form.visibility,
        allowedUserIds: form.visibility === "private" ? form.allowedUserIds ?? [] : [],
      });
      setProjects((prev) => [created, ...prev]);
      setForm({ ...NEW_PROJECT_FORM });
      setShowNewModal(false);
      setToast(`项目「${created.name}」已创建。`);
    } catch {
      const ts = nowText();
      const fallback: Project = {
        id: `p-local-${Date.now()}`,
        name: form.name.trim(),
        code: `PJT-${ts.replace(/[\s:]/g, "").slice(0, 12)}-999`,
        type: "",
        owner: form.owner.trim(),
        status: "解析中",
        progress: 0,
        visibility: form.visibility ?? "public",
        allowedUserIds: form.visibility === "private" ? form.allowedUserIds ?? [] : [],
        updatedAt: ts,
      };
      setProjects((prev) => [fallback, ...prev]);
      setForm({ ...NEW_PROJECT_FORM });
      setShowNewModal(false);
      setToast(`Core API 暂不可用，已在前端 mock 中创建项目「${fallback.name}」。`);
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(project: Project) {
    setDeleteTarget(project);
    setDeleteConfirmText("");
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeleteConfirmText("");
  }

  async function handleDeleteProject() {
    if (!deleteTarget || deleteConfirmText.trim() !== deleteTarget.code) return;
    setSaving(true);
    try {
      await projectApi.delete(deleteTarget.id);
      setProjects((current) => current.filter((p) => p.id !== deleteTarget.id));
      setToast(`项目「${deleteTarget.name}」已删除。`);
    } catch {
      setProjects((current) => current.filter((p) => p.id !== deleteTarget.id));
      setToast(`Core API 暂不可用，已在前端移除项目「${deleteTarget.name}」。`);
    } finally {
      setSaving(false);
      closeDeleteDialog();
    }
  }

  function toggleVisibility(visibility: ProjectVisibility) {
    setForm((f) => ({ ...f, visibility, allowedUserIds: visibility === "public" ? [] : f.allowedUserIds }));
  }

  function toggleAllowedUser(userId: string) {
    setForm((f) => {
      const current = f.allowedUserIds ?? [];
      return {
        ...f,
        allowedUserIds: current.includes(userId)
          ? current.filter((id) => id !== userId)
          : [...current, userId],
      };
    });
  }

  return (
    <>
      <SectionHeader
        eyebrow="Project Management"
        title="任务看板"
        action={
          <Button variant="primary" onClick={() => setShowNewModal(true)} disabled={saving}>
            <Plus className="size-4" />
            新建项目
          </Button>
        }
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <Card className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>全部状态</option>
              <option>解析中</option>
              <option>待生成</option>
              <option>待审核</option>
              <option>待上传</option>
              <option>已完成</option>
            </Select>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
            <Input className="w-full rounded-lg pl-9" placeholder="搜索项目名称或编号" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <DataTable
          headers={["项目名称", "负责人", "状态", "进度", "更新时间", "操作"]}
          columns={["30%", "10%", "12%", "20%", "16%", "12%"]}
        >
          {pagedProjects.map((project) => {
            const action = actionForProject(project);
            const ActionIcon = action.icon;
            return (
            <tr key={project.id}>
              <Td className="text-left">
                <p className="font-medium">{project.name}</p>
                <p className="mt-1 text-xs text-warm-stone">{project.code}</p>
              </Td>
              <Td>{project.owner}</Td>
              <Td>
                <ProjectStatusBadge status={project.status} />
              </Td>
              <Td>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 rounded-full bg-ink-black/10">
                    <div className="h-2 rounded-full bg-ink-black" style={{ width: `${project.progress}%` }} />
                  </div>
                  {project.progress}%
                </div>
              </Td>
              <Td>{project.updatedAt}</Td>
              <Td>
                <div className="flex items-center justify-center gap-2">
                  <Link
                    href={action.href}
                    title={action.label}
                    aria-label={action.label}
                    className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-ink-black/20 text-ink-black transition hover:border-ink-black hover:bg-ink-black hover:text-parchment-cream"
                  >
                    <ActionIcon className="size-4" />
                  </Link>
                  <button
                    type="button"
                    title="删除项目"
                    aria-label={`删除项目 ${project.name}`}
                    disabled={saving}
                    onClick={() => openDeleteDialog(project)}
                    className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-red-900/25 text-red-900 transition hover:border-red-950 hover:bg-red-950 hover:text-parchment-cream disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Td>
            </tr>
          );
          })}
        </DataTable>
        <Pagination
          className="mt-4"
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-black bg-ink-black px-4 py-2.5 text-sm text-parchment-cream shadow-editorial">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            {toast}
          </span>
        </div>
      ) : null}

      {showNewModal ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
          <div className="w-full max-w-[480px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">New Project</p>
                <h2 className="serif text-[1.5rem] leading-tight mt-0.5">新建项目</h2>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setShowNewModal(false)} className="shrink-0">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-graphite">项目名称</span>
                <Input className="w-full" placeholder="输入项目名称" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-graphite">负责人</span>
                <Input className="w-full" placeholder="输入负责人姓名" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
              </label>
              <fieldset>
                <legend className="mb-1.5 block text-sm text-graphite">权限范围</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      className="accent-ink-black"
                      checked={form.visibility === "public"}
                      onChange={() => toggleVisibility("public")}
                    />
                    <span className="text-sm">公开</span>
                    <span className="text-xs text-warm-stone">（所有用户可见）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      className="accent-ink-black"
                      checked={form.visibility === "private"}
                      onChange={() => toggleVisibility("private")}
                    />
                    <span className="text-sm">指定用户</span>
                    <span className="text-xs text-warm-stone">（仅选中用户可见）</span>
                  </label>
                </div>
              </fieldset>
              {form.visibility === "private" && users.length > 0 ? (
                <div className="rounded-lg border border-ink-black/15 p-3">
                  <p className="mb-2 text-sm text-graphite">选择可访问的用户：</p>
                  <div className="flex flex-wrap gap-2">
                    {users.map((user) => (
                      <label
                        key={user.id}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                          (form.allowedUserIds ?? []).includes(user.id)
                            ? "border-ink-black bg-ink-black text-parchment-cream"
                            : "border-ink-black/20 text-graphite hover:border-ink-black/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={(form.allowedUserIds ?? []).includes(user.id)}
                          onChange={() => toggleAllowedUser(user.id)}
                        />
                        {user.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setShowNewModal(false)}>取消</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving}>
                <Plus className="size-4" />
                创建项目
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={closeDeleteDialog}>
          <div
            className="w-full max-w-[560px] rounded-[14px] border border-ink-black bg-parchment-cream p-5 shadow-editorial"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mono-label text-warm-stone">DELETE PROJECT</p>
                <h2 className="serif mt-1 text-3xl">确认删除项目</h2>
                <p className="mt-2 text-sm text-graphite">
                  删除后项目会从任务看板移除，并在日志管理中保留恢复入口。请输入项目编号确认删除。
                </p>
              </div>
              <button type="button" aria-label="关闭删除确认" className="rounded-md p-1 transition hover:bg-ink-black/10" onClick={closeDeleteDialog}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-ink-black/15 p-3">
              <p className="font-medium">{deleteTarget.name}</p>
              <p className="mt-1 text-sm text-warm-stone">{deleteTarget.code}</p>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-graphite">输入项目编号：{deleteTarget.code}</span>
              <Input
                autoFocus
                className="w-full"
                value={deleteConfirmText}
                placeholder="输入完整项目编号后才能删除"
                onChange={(event) => setDeleteConfirmText(event.target.value)}
              />
            </label>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-black/15 pt-4">
              <Button type="button" variant="ghost" onClick={closeDeleteDialog}>取消</Button>
              <Button type="button" variant="danger" disabled={deleteConfirmText.trim() !== deleteTarget.code} onClick={handleDeleteProject}>
                <Trash2 className="size-4" />
                确认删除
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
