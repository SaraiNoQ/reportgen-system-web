"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Plus, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { MetricCard } from "@/components/ui/metric-card";
import { ProjectStatusBadge } from "@/components/ui/status-badge";
import { DataTable, Td } from "@/components/ui/table";
import type { Project, ProjectMetric } from "@/lib/types/domain";

const NEW_PROJECT_FORM = { name: "", owner: "" };

export function ProjectsClient({ metrics, projects: initialProjects }: { metrics: ProjectMetric[]; projects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [toast, setToast] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState({ ...NEW_PROJECT_FORM });

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = `${project.name}${project.code}${project.owner}`.includes(query);
      const matchesStatus = status === "全部状态" || project.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [projects, query, status]);

  function handleCreate() {
    if (!form.name.trim() || !form.owner.trim()) {
      setToast("请填写项目名称和负责人。");
      return;
    }
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newProject: Project = {
      id: `p${projects.length + 1}`,
      name: form.name.trim(),
      code: `PJT-${ts.replace(/[\s:]/g, "").slice(0, 12)}-${String(projects.length + 1).padStart(3, "0")}`,
      type: "",
      owner: form.owner.trim(),
      status: "解析中",
      progress: 0,
      updatedAt: ts
    };
    setProjects((prev) => [newProject, ...prev]);
    setForm({ ...NEW_PROJECT_FORM });
    setShowNewModal(false);
    setToast(`项目「${newProject.name}」已创建，状态为解析中。`);
  }

  function handleBatchImport() {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const batch: Project[] = [
      { id: `p${projects.length + 1}`, name: "轴承座加工精度检测", code: `PJT-${ts.replace(/[\s:]/g, "").slice(0, 12)}-${String(projects.length + 1).padStart(3, "0")}`, type: "", owner: "赵工", status: "待上传", progress: 0, updatedAt: ts },
      { id: `p${projects.length + 2}`, name: "主轴箱装配精度复检", code: `PJT-${ts.replace(/[\s:]/g, "").slice(0, 12)}-${String(projects.length + 2).padStart(3, "0")}`, type: "", owner: "钱工", status: "待上传", progress: 0, updatedAt: ts },
      { id: `p${projects.length + 3}`, name: "电控柜出厂耐压测试", code: `PJT-${ts.replace(/[\s:]/g, "").slice(0, 12)}-${String(projects.length + 3).padStart(3, "0")}`, type: "", owner: "孙工", status: "待上传", progress: 0, updatedAt: ts }
    ];
    setProjects((prev) => [...batch, ...prev]);
    setToast(`已批量导入 3 个项目：轴承座加工精度检测、主轴箱装配精度复检、电控柜出厂耐压测试。`);
  }

  return (
    <>
      <SectionHeader
        eyebrow="Project Management"
        title="任务看板"
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setShowNewModal(true)}>
              <Plus className="size-4" />
              新建项目
            </Button>
            <Button onClick={handleBatchImport}>
              <Upload className="size-4" />
              批量导入
            </Button>
            <Link href="/records">
              <Button>
                继续处理
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
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
        <DataTable headers={["项目名称", "负责人", "状态", "进度", "更新时间", "操作"]}>
          {filtered.map((project) => (
            <tr key={project.id}>
              <Td>
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
                <Link href={project.status === "待上传" || project.status === "解析中" ? "/records" : project.status === "已完成" ? "/reports" : "/records"}>
                  <Button variant="ghost">{project.status === "已完成" ? "查看报告" : project.status === "待上传" ? "去上传" : project.status === "待审核" ? "去审核" : "继续处理"}</Button>
                </Link>
              </Td>
            </tr>
          ))}
        </DataTable>
        <p className="mt-5 text-sm text-graphite">共 {filtered.length} 条记录</p>
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
          <div className="w-full max-w-[420px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
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
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setShowNewModal(false)}>取消</Button>
              <Button variant="primary" onClick={handleCreate}>
                <Plus className="size-4" />
                创建项目
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
