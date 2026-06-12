"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, Td } from "@/components/ui/table";
import { systemApi } from "@/lib/services/api";
import type { OperationLog, Project } from "@/lib/types/domain";

type LogModule = "全部模块" | "项目管理" | "原始记录上传" | "规则配置" | "报告生成";
type LogResultFilter = OperationLog["result"] | "全部结果";
type DeletedProjectRecord = {
  project: Project;
  deletedAt: string;
  actor: string;
};
type ProjectDeletionLog = OperationLog & {
  deletedProject?: Project;
};

const DELETED_PROJECTS_KEY = "report-generator.deleted-projects";

function mapDeletedProjectLog(record: DeletedProjectRecord): ProjectDeletionLog {
  return {
    id: `deleted-project-${record.project.id}`,
    module: "项目管理",
    actor: record.actor,
    action: `删除项目：${record.project.name}`,
    result: "警告",
    time: record.deletedAt,
    deletedProject: record.project,
  };
}

function isProjectDeletionLog(log: OperationLog | ProjectDeletionLog): log is ProjectDeletionLog {
  return "deletedProject" in log && Boolean(log.deletedProject);
}

export function SystemLogsClient({ logs: initialLogs }: { logs: OperationLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [deletedProjectLogs, setDeletedProjectLogs] = useState<ProjectDeletionLog[]>([]);
  const [keyword, setKeyword] = useState("");
  const [module, setModule] = useState<LogModule>("全部模块");
  const [result, setResult] = useState<LogResultFilter>("全部结果");
  const [notice, setNotice] = useState("日志列表已从 Core API 加载。");
  const [filtering, setFiltering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params = { q: keyword.trim(), module, result };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DELETED_PROJECTS_KEY);
      const records = raw ? (JSON.parse(raw) as DeletedProjectRecord[]) : [];
      setDeletedProjectLogs(records.map(mapDeletedProjectLog));
    } catch {
      window.localStorage.removeItem(DELETED_PROJECTS_KEY);
    }
  }, []);

  const visibleLogs = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return [...deletedProjectLogs, ...logs].filter((log) => {
      const matchesKeyword = !q || `${log.module} ${log.actor} ${log.action}`.toLowerCase().includes(q);
      const matchesModule = module === "全部模块" || log.module === module;
      const matchesResult = result === "全部结果" || log.result === result;
      return matchesKeyword && matchesModule && matchesResult;
    });
  }, [deletedProjectLogs, keyword, logs, module, result]);

  const totalPages = Math.max(1, Math.ceil(visibleLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedLogs = useMemo(
    () => visibleLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, visibleLogs]
  );

  useEffect(() => {
    setPage(1);
  }, [keyword, module, result]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function handleFilter() {
    if (filtering) return;
    setFiltering(true);
    try {
      const filtered = await systemApi.logs(params);
      setLogs(filtered);
      setNotice(`已筛选出 ${filtered.length + deletedProjectLogs.length} 条日志。`);
    } catch {
      setNotice(`Core API 日志筛选接口暂不可用，已使用前端条件筛选出 ${visibleLogs.length} 条日志。`);
    } finally {
      setFiltering(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await systemApi.exportLogs(params);
      setNotice(`导出完成：${response.fileName}，当前筛选条件共 ${visibleLogs.length} 条。`);
    } catch {
      setNotice("日志导出接口暂不可用，请确认 Core API 服务状态。");
    } finally {
      setExporting(false);
    }
  }

  async function handleDetail(logId: string) {
    if (detailLoadingId) return;
    setDetailLoadingId(logId);
    try {
      const response = await systemApi.logDetail(logId);
      setNotice(response.detail);
    } catch {
      setNotice("日志详情接口暂不可用，请确认 Core API 服务状态。");
    } finally {
      setDetailLoadingId(null);
    }
  }

  function handleRestoreProject(log: ProjectDeletionLog) {
    if (!log.deletedProject) return;

    try {
      const raw = window.localStorage.getItem(DELETED_PROJECTS_KEY);
      const records = raw ? (JSON.parse(raw) as DeletedProjectRecord[]) : [];
      const nextRecords = records.filter((record) => record.project.id !== log.deletedProject?.id);
      window.localStorage.setItem(DELETED_PROJECTS_KEY, JSON.stringify(nextRecords));
      setDeletedProjectLogs(nextRecords.map(mapDeletedProjectLog));
      setNotice(`已恢复项目「${log.deletedProject.name}」，返回项目管理页面后可重新看到该项目。`);
    } catch {
      setNotice("恢复失败：本地恢复记录不可用。");
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow="Traceability"
        title="日志管理"
        action={<Button onClick={handleExport} loading={exporting} loadingText="导出中"><Download className="size-4" />导出日志</Button>}
      />
      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
            <Input
              className="w-full rounded-lg pl-9"
              placeholder="搜索操作人、模块、动作"
              value={keyword}
              disabled={filtering || exporting}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <Select value={module} disabled={filtering || exporting} onChange={(event) => setModule(event.target.value as LogModule)}>
            <option>全部模块</option>
            <option>项目管理</option>
            <option>原始记录上传</option>
            <option>规则配置</option>
            <option>报告生成</option>
          </Select>
          <Select value={result} disabled={filtering || exporting} onChange={(event) => setResult(event.target.value as LogResultFilter)}>
            <option>全部结果</option>
            <option>成功</option>
            <option>失败</option>
            <option>警告</option>
          </Select>
          <Button variant="primary" onClick={handleFilter} loading={filtering} loadingText="筛选中">筛选</Button>
        </div>
        <DataTable headers={["模块", "操作人", "动作", "结果", "时间", "详情"]}>
          {pagedLogs.map((log) => (
            <tr key={log.id}>
              <Td>{log.module}</Td>
              <Td>{log.actor}</Td>
              <Td>{log.action}</Td>
              <Td><Badge tone={log.result === "成功" ? "success" : log.result === "失败" ? "danger" : "warning"}>{log.result}</Badge></Td>
              <Td>{log.time}</Td>
              <Td>
                {isProjectDeletionLog(log) ? (
                  <div className="flex items-center gap-3">
                    <button
                      className="inline-flex items-center gap-1 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={Boolean(detailLoadingId)}
                      onClick={() => handleDetail(log.id)}
                    >
                      {detailLoadingId === log.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      {detailLoadingId === log.id ? "加载中" : "查看详情"}
                    </button>
                    <button className="inline-flex items-center gap-1 underline underline-offset-4" onClick={() => handleRestoreProject(log)}>
                      <RotateCcw className="size-3.5" />
                      恢复
                    </button>
                  </div>
                ) : (
                  <button
                    className="inline-flex items-center gap-1 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={Boolean(detailLoadingId)}
                    onClick={() => handleDetail(log.id)}
                  >
                    {detailLoadingId === log.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {detailLoadingId === log.id ? "加载中" : "查看详情"}
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
        <Pagination
          className="mt-4"
          page={currentPage}
          pageSize={pageSize}
          total={visibleLogs.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        <p className="mt-4 text-sm text-warm-stone">{notice}</p>
      </Card>
    </>
  );
}
