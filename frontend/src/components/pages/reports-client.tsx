"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  FileUp,
  GripVertical,
  Lightbulb,
  Loader2,
  Maximize2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/forms";
import { genReportApi, recordApi, reportApi } from "@/lib/services/api";
import type { ExtractedField, ParseEvent, ReportSection, RunStatus, WorkflowJob, WorkflowProgress, WorkflowRunSummary } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

const AI_SUGGESTIONS = [
  {
    id: "ai1",
    title: "补充引用标准",
    text: "依据 GB/T 1958-2017 对形状和位置公差进行判定，检测结论与原始记录数据一致。",
    tone: "warning" as const
  },
  {
    id: "ai2",
    title: "术语规范化",
    text: "建议将检测结论统一为标准表述：检测结果符合 GB/T 1958-2017 要求，判定为合格。",
    tone: "warning" as const
  },
  {
    id: "ai3",
    title: "补充免责声明",
    text: "本报告仅对来样负责，检测环境：温度 20±2°C，湿度 50±10%RH。",
    tone: "neutral" as const
  }
];

const REPORT_CATEGORIES = [
  { id: "cover", name: "封面", template: "检测报告封面标准模板", code: "CAT-COVER", scope: "报告首页、委托信息、样品信息" },
  { id: "conclusion", name: "检验结论", template: "检验结论标准模板", code: "CAT-CONCLUSION", scope: "综合判定、标准引用、结论说明" },
  { id: "geometry", name: "几何精度", template: "机床几何精度检测报告模板", code: "CAT-GEOMETRY", scope: "平面度、直线度、圆度、同轴度" },
  { id: "position", name: "位置精度", template: "位置精度检测报告模板", code: "CAT-POSITION", scope: "定位精度、重复定位、平行度、垂直度" },
  { id: "electric", name: "电气参数", template: "电气参数检测报告模板", code: "CAT-ELECTRIC", scope: "电压、电流、绝缘、接地" },
  { id: "attachment", name: "附件", template: "报告附件归档模板", code: "CAT-ATTACHMENT", scope: "原始记录、照片、解析日志、签章页" },
  { id: "custom", name: "自定义章节", template: "通用人工补充章节模板", code: "CAT-CUSTOM", scope: "人工补充说明、特殊检测项" }
];
function getDefaultCategoryId(title: string) {
  if (title.includes("封面")) return "cover";
  if (title.includes("结论")) return "conclusion";
  if (title.includes("几何")) return "geometry";
  if (title.includes("位置")) return "position";
  if (title.includes("电气")) return "electric";
  if (title.includes("附件")) return "attachment";
  return "custom";
}

function categoryById(id: string) {
  return REPORT_CATEGORIES.find((category) => category.id === id) ?? REPORT_CATEGORIES[REPORT_CATEGORIES.length - 1];
}

type VersionEntry = {
  id: string;
  label: string;
};

type ReportBusyAction =
  | "add-section"
  | "save-draft"
  | "rollback"
  | "export-word-report"
  | "export-word-section"
  | "export-pdf"
  | "revision-upload"
  | "preview-report"
  | "preview-section"
  | "category"
  | "suggestion"
  | "delete-section"
  | "reorder";

type GeneratedPdfStatus = "idle" | "checking" | "converting" | "ready" | "failed";

type DropMarker = {
  targetId: string;
  position: "before" | "after";
};

function getSectionDropMarker(container: HTMLElement | null, clientY: number, draggingId?: string | null): DropMarker | null {
  const sectionItems = Array.from(container?.querySelectorAll<HTMLElement>("[data-section-item-id]") ?? []);
  const availableItems = sectionItems.filter((sectionItem) => sectionItem.dataset.sectionItemId !== draggingId);
  if (availableItems.length === 0) return null;

  for (const sectionItem of availableItems) {
    const bounds = sectionItem.getBoundingClientRect();
    const sectionId = sectionItem.dataset.sectionItemId;
    if (!sectionId) continue;
    if (clientY < bounds.top + bounds.height / 2) {
      return { targetId: sectionId, position: "before" };
    }
  }

  const lastItem = availableItems[availableItems.length - 1];
  const lastItemId = lastItem?.dataset.sectionItemId;
  return lastItemId ? { targetId: lastItemId, position: "after" } : null;
}

function setFloatingDragImage(dataTransfer: DataTransfer, source: HTMLElement, clientX: number, clientY: number) {
  const bounds = source.getBoundingClientRect();
  const preview = source.cloneNode(true) as HTMLElement;
  preview.setAttribute("aria-hidden", "true");
  preview.style.position = "fixed";
  preview.style.top = "-1000px";
  preview.style.left = "-1000px";
  preview.style.width = `${bounds.width}px`;
  preview.style.pointerEvents = "none";
  preview.style.opacity = "0.96";
  preview.style.transform = "rotate(-0.6deg) scale(1.02)";
  preview.style.boxShadow = "0 18px 40px rgba(18, 16, 14, 0.24)";
  preview.style.background = "rgb(250, 246, 239)";
  preview.style.zIndex = "9999";
  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, clientX - bounds.left, clientY - bounds.top);
  window.setTimeout(() => preview.remove(), 0);
}

function workflowTone(status?: WorkflowJob["status"]) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "running" || status === "queued") return "warning";
  return "neutral";
}

function workflowLabel(status?: WorkflowJob["status"]) {
  if (status === "queued") return "排队中";
  if (status === "running") return "生成中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  return "未开始";
}

function runStatusTone(status?: string) {
  if (status === "已完成" || status === "generated") return "success";
  if (status === "failed" || status === "错误") return "danger";
  if (status === "待审核" || status === "running") return "warning";
  return "neutral";
}

function getWorkflowRuns(job: WorkflowJob | null): WorkflowRunSummary[] {
  return job?.result?.runs ?? [];
}

function firstRunId(job: WorkflowJob | null) {
  const runFromResult = getWorkflowRuns(job)[0]?.run_id;
  if (runFromResult) return runFromResult;
  return Object.keys(job?.runPaths ?? {})[0] ?? "";
}

function getFinalReportPath(runStatus: RunStatus | null) {
  const value = runStatus?.outputs.finalReport ?? runStatus?.outputs.final_report;
  return typeof value === "string" ? value : "";
}

function formatWorkflowEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function buildGenerateJob(runId: string, status: WorkflowJob["status"], message: string, events: Array<{ at: string; message: string }>): WorkflowJob {
  return {
    jobId: `generate-${runId}`,
    status,
    message,
    runPaths: { [runId]: "" },
    result: {
      status: status === "failed" ? "error" : status === "succeeded" ? "ok" : "running",
      message,
      runs: [{ run_id: runId, status: status === "succeeded" ? "generated" : status, message }],
      generated_count: status === "succeeded" ? 1 : 0,
      failed_count: status === "failed" ? 1 : 0,
      review_required_count: 0,
    },
    error: status === "failed" ? message : null,
    progressEvents: events,
  };
}

export function ReportsClient({ sections: initialSections }: { sections: ReportSection[] }) {
  const { currentProject } = useAppContext();
  const currentProjectName = currentProject?.name ?? "当前项目";
  const [sections, setSections] = useState(initialSections);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [content, setContent] = useState(Object.fromEntries(sections.map((s) => [s.id, s.content])));
  const [message, setMessage] = useState("当前项目已匹配默认模板，可直接生成 Word，并在此处查看 PDF 预览。");
  const [optimizeCount, setOptimizeCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [generatedDialogOpen, setGeneratedDialogOpen] = useState(false);
  const [workflowLogOpen, setWorkflowLogOpen] = useState(false);
  const [previewScope, setPreviewScope] = useState<"report" | "section">("section");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [toast, setToast] = useState("");
  const [rollbackTarget, setRollbackTarget] = useState<VersionEntry | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([
    { id: "draft-1", label: "V1.1 张工 保存草稿" },
    { id: "initial-1", label: "V1.0 系统 生成初稿" }
  ]);
  const [aiIndex, setAiIndex] = useState(0);
  const [sectionCategories, setSectionCategories] = useState<Record<string, string>>(
    Object.fromEntries(initialSections.map((section) => [section.id, getDefaultCategoryId(section.title)]))
  );
  const [pdfStatus, setPdfStatus] = useState<GeneratedPdfStatus>("idle");
  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfFilePath, setPdfFilePath] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [uploadedRevisions, setUploadedRevisions] = useState<Record<string, string>>({});
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [sectionDropMarker, setSectionDropMarker] = useState<DropMarker | null>(null);
  const [busyAction, setBusyAction] = useState<ReportBusyAction | null>(null);
  const [workflowJob, setWorkflowJob] = useState<WorkflowJob | null>(null);
  const [activeRunId, setActiveRunId] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [runFields, setRunFields] = useState<ExtractedField[]>([]);
  const [workflowError, setWorkflowError] = useState("");
  const [handledJobId, setHandledJobId] = useState("");
  const sectionListRef = useRef<HTMLDivElement | null>(null);
  const revisionInputRef = useRef<HTMLInputElement>(null);
  const generationLockRef = useRef(false);
  const pdfBlobUrlRef = useRef("");
  const pdfSourcePathRef = useRef("");
  const pdfPreparingPathRef = useRef("");
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const activeCategory = categoryById(active ? sectionCategories[active.id] ?? getDefaultCategoryId(active.title) : "custom");
  const filteredCategories = REPORT_CATEGORIES.filter((category) => {
    const keyword = categorySearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${category.name} ${category.template} ${category.code} ${category.scope}`.toLowerCase().includes(keyword);
  });
  const activeDocName = `${active?.title ?? "检测报告"}_${activeCategory.name}.docx`;
  const interfaceBusy = generating || busyAction !== null;
  const finalReportPath = getFinalReportPath(runStatus);
  const reportBodyVisible = pdfStatus === "ready" && Boolean(pdfBlobUrl);
  const workflowLogEvents = useMemo(() => workflowJob?.progressEvents ?? [], [workflowJob?.progressEvents]);
  const workflowDisplayStatus: WorkflowJob["status"] | undefined = finalReportPath
    ? "succeeded"
    : workflowJob?.status;
  const reportWorkflowEvents = useMemo((): ParseEvent[] => {
    return workflowLogEvents.map((event, index) => ({
      time: formatWorkflowEventTime(event.at),
      label: event.message,
      state:
        workflowDisplayStatus === "failed" && index === workflowLogEvents.length - 1
          ? "active"
          : workflowDisplayStatus === "running" && index === workflowLogEvents.length - 1
            ? "active"
            : "done"
    }));
  }, [workflowDisplayStatus, workflowLogEvents]);
  const reportWorkflowStages = useMemo((): WorkflowProgress[] => {
    const text = workflowLogEvents.map((event) => event.message.toLowerCase()).join("\n");
    const isDone = workflowDisplayStatus === "succeeded";
    const isFailed = workflowDisplayStatus === "failed";
    const hasExtract = text.includes("extract") || text.includes("field") || runFields.length > 0;
    const hasGenerate = text.includes("generate") || text.includes("final") || Boolean(finalReportPath);
    const stageState = (done: boolean, active: boolean): WorkflowProgress["status"] => {
      if (isFailed && active) return "failed";
      if (done || isDone) return "done";
      if (active) return "active";
      return "pending";
    };
    const workflowStarted = Boolean(workflowJob);
    return [
      { stage: "validate", label: "配置验证", meta: workflowStarted ? "已通过" : "等待中", status: workflowStarted ? "done" : "pending" },
      { stage: "prepare", label: "工作区准备", meta: workflowStarted ? "已就绪" : "等待中", status: workflowStarted ? "done" : "pending" },
      { stage: "extract", label: "字段载入", meta: runFields.length ? `${runFields.length} 个字段` : hasExtract ? "载入中" : "等待中", status: stageState(runFields.length > 0 || hasExtract, workflowStarted && !hasGenerate) },
      { stage: "generate", label: "报告生成", meta: finalReportPath ? "已生成 Word" : hasGenerate ? "生成中" : "等待中", status: stageState(Boolean(finalReportPath), workflowStarted && hasGenerate) }
    ];
  }, [finalReportPath, runFields.length, workflowDisplayStatus, workflowJob, workflowLogEvents]);
  const activeReportProgress = finalReportPath ? 100 : workflowDisplayStatus === "failed" ? 100 : workflowDisplayStatus === "running" ? 62 : workflowDisplayStatus === "queued" ? 18 : 0;
  const workflowSummary =
    pdfStatus === "checking" || pdfStatus === "converting"
      ? "最终 Word 已生成，正在准备 PDF 预览..."
      : pdfStatus === "failed"
        ? `最终 Word 已生成，但 PDF 生成失败：${pdfError || "请稍后重试。"}`
        : pdfStatus === "ready"
          ? "最终 Word 和 PDF 预览均已生成。"
          : workflowError || workflowJob?.message || reportWorkflowEvents.at(-1)?.label || "暂无工作流日志。点击生成报告后会显示实时进度。";

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const replacePdfBlob = useCallback((blob: Blob, fileName: string, filePath?: string | null) => {
    if (pdfBlobUrlRef.current) {
      window.URL.revokeObjectURL(pdfBlobUrlRef.current);
    }
    const nextUrl = window.URL.createObjectURL(blob);
    pdfBlobUrlRef.current = nextUrl;
    setPdfBlobUrl(nextUrl);
    setPdfFileName(fileName);
    if (filePath) setPdfFilePath(filePath);
  }, []);

  const clearPdfPreviewState = useCallback(() => {
    if (pdfBlobUrlRef.current) {
      window.URL.revokeObjectURL(pdfBlobUrlRef.current);
    }
    pdfBlobUrlRef.current = "";
    pdfSourcePathRef.current = "";
    pdfPreparingPathRef.current = "";
    setPdfBlobUrl("");
    setPdfFileName("");
    setPdfFilePath("");
    setPdfError("");
    setPdfStatus("idle");
  }, []);

  const prepareGeneratedPdf = useCallback(async (filePath: string, options: { silent?: boolean } = {}) => {
    if (!filePath) return false;
    if (pdfSourcePathRef.current === filePath && pdfBlobUrlRef.current && pdfStatus === "ready") {
      return true;
    }
    if (pdfPreparingPathRef.current === filePath) {
      return false;
    }
    pdfPreparingPathRef.current = filePath;
    if (pdfSourcePathRef.current && pdfSourcePathRef.current !== filePath && pdfBlobUrlRef.current) {
      window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = "";
      setPdfBlobUrl("");
    }
    pdfSourcePathRef.current = filePath;
    setPdfError("");
    setPdfStatus("checking");
    try {
      const status = await reportApi.generatedExportStatus(currentProjectName, "pdf", filePath);
      setPdfFileName(status.fileName);
      setPdfFilePath(status.filePath ?? "");
      setPdfStatus(status.exists ? "checking" : "converting");
      if (!status.exists && !options.silent) {
        showToast("正在将最终 Word 转换为 PDF 预览...");
      }
      const response = await reportApi.fetchGeneratedReportBlob(currentProjectName, "pdf", filePath);
      const finalStatus = status.exists
        ? status
        : await reportApi.generatedExportStatus(currentProjectName, "pdf", filePath);
      replacePdfBlob(response.blob, response.fileName, finalStatus.filePath);
      setPdfStatus("ready");
      if (!options.silent) showToast("PDF 预览已生成。");
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "PDF 转换接口暂不可用。";
      setPdfError(detail);
      setPdfStatus("failed");
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      }
      pdfBlobUrlRef.current = "";
      setPdfBlobUrl("");
      if (!options.silent) showToast(`PDF 生成失败：${detail}`);
      return false;
    } finally {
      if (pdfPreparingPathRef.current === filePath) {
        pdfPreparingPathRef.current = "";
      }
    }
  }, [currentProjectName, pdfStatus, replacePdfBlob, showToast]);

  async function loadRunDetails(runId: string) {
    const [statusResult, fieldsResult] = await Promise.allSettled([
      genReportApi.getRunStatus(runId),
      genReportApi.getRunFields(runId)
    ]);

    if (statusResult.status === "fulfilled") {
      setRunStatus((current) => {
        const currentFinalPath = current?.runId === runId ? getFinalReportPath(current) : "";
        const nextFinalPath = getFinalReportPath(statusResult.value);
        if (!nextFinalPath && currentFinalPath) {
          return {
            ...statusResult.value,
            outputs: {
              ...statusResult.value.outputs,
              finalReport: currentFinalPath,
              final_report: currentFinalPath
            }
          };
        }
        return statusResult.value;
      });
    }
    if (fieldsResult.status === "fulfilled") {
      setRunFields(fieldsResult.value.fields);
    }
    if (statusResult.status === "rejected") {
      setWorkflowError(statusResult.reason instanceof Error ? statusResult.reason.message : "读取报告产物状态失败");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryRunId = new URLSearchParams(window.location.search).get("runId") ?? "";
    if (queryRunId) {
      setActiveRunId((current) => current || queryRunId);
      setMessage("已加载原始记录页审核通过的字段结果，可点击生成报告生成最终 Word。");
      return;
    }
    if (!currentProject?.id) return;
    let cancelled = false;
    void recordApi.files(currentProject.id).then((files) => {
      if (cancelled) return;
      const approvedFile = [...files].reverse().find((file) =>
        file.parseStatus === "解析成功" &&
        Boolean(file.fieldsApproved) &&
        Boolean(file.parseRunId) &&
        Boolean(file.parseRunPath)
      );
      if (!approvedFile?.parseRunId) return;
      setActiveRunId((current) => current || (approvedFile.parseRunId ?? ""));
      setMessage("已加载原始记录页审核通过的字段结果，可点击生成报告生成最终 Word。");
    }).catch((error) => {
      if (!cancelled) {
        setWorkflowError(error instanceof Error ? error.message : "读取已审核字段状态失败");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id]);

  useEffect(() => {
    if (!workflowJob || workflowJob.status === "succeeded" || workflowJob.status === "failed") return;
    if (workflowJob.jobId.startsWith("generate-")) return;
    const jobId = workflowJob.jobId;
    const timer = window.setInterval(async () => {
      try {
        const next = await genReportApi.getJob(jobId);
        setWorkflowJob(next);
        const nextRunId = firstRunId(next);
        if (nextRunId) {
          setActiveRunId((current) => current || nextRunId);
        }
      } catch (error) {
        setWorkflowError(error instanceof Error ? error.message : "报告生成任务状态查询失败");
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [workflowJob]);

  useEffect(() => {
    if (!activeRunId) return;
    void loadRunDetails(activeRunId);
  }, [activeRunId]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!finalReportPath) {
      clearPdfPreviewState();
      return;
    }
    void prepareGeneratedPdf(finalReportPath, { silent: true });
  }, [clearPdfPreviewState, finalReportPath, prepareGeneratedPdf]);

  useEffect(() => {
    if (!workflowJob || workflowJob.status === "queued" || workflowJob.status === "running") return;
    if (handledJobId === workflowJob.jobId) return;
    setHandledJobId(workflowJob.jobId);
    setGenerating(false);
    generationLockRef.current = false;

    const runId = firstRunId(workflowJob);
    if (runId) {
      setActiveRunId(runId);
      void loadRunDetails(runId);
    }

    if (workflowJob.status === "succeeded") {
      const versionLabel = `V${versions.length + 1}.0 gen-report 生成报告`;
      setVersions((prev) => [
        { id: `workflow-${workflowJob.jobId}-${Date.now()}`, label: versionLabel },
        ...prev
      ]);
      setMessage("gen-report 工作流已完成，最终 Word 已生成；可在交付文件区导出最终报告或查看页面预览。");
      setGeneratedDialogOpen(true);
      showToast("报告生成工作流已完成。");
      return;
    }

    const failure = workflowJob.error || workflowJob.message || "报告生成工作流失败。";
    setWorkflowError(failure);
    setMessage(failure);
    showToast("报告生成失败，请查看工作流状态。");
  }, [handledJobId, showToast, versions.length, workflowJob]);

  async function handleGenerate() {
    if (generationLockRef.current) return;
    if (!currentProject?.id) {
      showToast("请先选择项目后再生成报告。");
      return;
    }
    if (finalReportPath) {
      if (pdfStatus !== "ready") {
        await prepareGeneratedPdf(finalReportPath);
      }
      setGeneratedDialogOpen(true);
      showToast("最终报告已生成，可直接导出。");
      return;
    }
    if (!activeRunId) {
      showToast("请先在原始记录页完成字段提取和审核，再进入报告生成。");
      return;
    }
    generationLockRef.current = true;
    setGenerating(true);
    setWorkflowError("");
    setHandledJobId("");
    clearPdfPreviewState();
    setRunStatus(null);
    setMessage("正在基于已审核字段生成最终报告，请等待后端写出 Word 文件...");
    const startedAt = new Date().toISOString();
    const startedEvents = [{ at: startedAt, message: `Run ${activeRunId}: generate started` }];
    setWorkflowJob(buildGenerateJob(activeRunId, "running", "Final report generation started.", startedEvents));
    try {
      const response = await genReportApi.generateRun(activeRunId);
      const completedAt = new Date().toISOString();
      const isGenerated = response.status === "generated" || response.status === "ok";
      const finalPath = response.final_report ?? response.finalReport ?? "";
      setWorkflowJob(buildGenerateJob(
        activeRunId,
        isGenerated ? "succeeded" : "failed",
        response.message || (isGenerated ? "Report generated successfully." : "Report generation failed."),
        [...startedEvents, { at: completedAt, message: `Run ${activeRunId}: generate ${isGenerated ? "completed" : "failed"}` }],
      ));
      if (finalPath) {
        setRunStatus({
          runId: activeRunId,
          status: response.status,
          businessStatus: "已完成",
          stage: "generate",
          message: response.message,
          artifacts: [],
          staleArtifacts: [],
          issues: [],
          outputs: { finalReport: finalPath, final_report: finalPath },
        });
        void prepareGeneratedPdf(finalPath);
      }
      void loadRunDetails(activeRunId);
      showToast(isGenerated ? "最终报告已生成。" : "最终报告生成失败，请查看日志。");
    } catch (error) {
      const failure = error instanceof Error ? error.message : "报告生成接口暂不可用，请确认 Core API 服务状态。";
      setWorkflowError(failure);
      setMessage(failure);
      setWorkflowJob(buildGenerateJob(activeRunId, "failed", failure, [
        ...startedEvents,
        { at: new Date().toISOString(), message: failure },
      ]));
      showToast("报告生成启动失败。");
    } finally {
      setGenerating(false);
      generationLockRef.current = false;
    }
  }

  async function applySuggestion(text: string) {
    if (!active || busyAction) return;
    setBusyAction("suggestion");
    setContent((current) => ({
      ...current,
      [active.id]: `${current[active.id]}\n${text}`
    }));
    setOptimizeCount((c) => Math.max(0, c - 1));
    setMessage("已记录智能建议。重新生成后会体现在 Word 与 PDF 预览中。");
    if (optimizeCount <= 1) setMessage("所有建议已处理，可重新生成报告并核对 PDF。");
    try {
      await reportApi.updateSection(active.id, { content: `${content[active.id]}\n${text}` });
    } catch {
      showToast("建议同步接口暂不可用，已先加入当前页面。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddSection() {
    if (!newSectionTitle.trim() || busyAction) return;
    setBusyAction("add-section");
    const title = newSectionTitle.trim();
    let created: ReportSection = { id: `s${sections.length + 1}`, title, content: "", status: "待完善" as const };
    try {
      created = await reportApi.addSection(title);
    } catch {
      showToast("新增章节接口暂不可用，已先在当前页面创建。");
    }
    const id = created.id;
    setSections((prev) => [...prev, created]);
    setContent((prev) => ({ ...prev, [id]: "" }));
    setSectionCategories((prev) => ({ ...prev, [id]: getDefaultCategoryId(title) }));
    setActiveId(id);
    setNewSectionTitle("");
    setAddSectionOpen(false);
    showToast(`已添加章节「${title}」。`);
    setBusyAction(null);
  }

  async function deleteSection(sectionId: string) {
    if (busyAction) return;
    if (sections.length <= 1) {
      showToast("至少需要保留一个报告章节。");
      return;
    }
    setBusyAction("delete-section");
    const removed = sections.find((section) => section.id === sectionId);
    const removedIndex = sections.findIndex((section) => section.id === sectionId);
    const nextSections = sections.filter((section) => section.id !== sectionId);
    setSections(nextSections);
    setContent((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    setSectionCategories((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    setUploadedRevisions((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    if (activeId === sectionId) {
      setActiveId(nextSections[Math.min(removedIndex, nextSections.length - 1)]?.id ?? "");
    }
    showToast(`已删除章节「${removed?.title ?? "未命名章节"}」。`);
    try {
      await reportApi.deleteSection(sectionId);
    } catch {
      showToast("删除章节接口暂不可用，已先从当前页面移除。");
    } finally {
      setBusyAction(null);
    }
  }

  function moveSection(sourceId: string, targetId: string, position: "before" | "after" = "before") {
    if (sourceId === targetId || busyAction) return;
    let nextOrder: string[] | null = null;
    setSections((current) => {
      const sourceIndex = current.findIndex((section) => section.id === sourceId);
      const targetIndex = current.findIndex((section) => section.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const targetAfterRemoval = next.findIndex((section) => section.id === targetId);
      next.splice(position === "after" ? targetAfterRemoval + 1 : targetAfterRemoval, 0, moved);
      nextOrder = next.map((section) => section.id);
      return next;
    });
    if (nextOrder) {
      setBusyAction("reorder");
      void reportApi
        .reorderSections(nextOrder)
        .catch(() => showToast("目录排序接口暂不可用，已先在当前页面调整。"))
        .finally(() => setBusyAction(null));
    }
  }

  async function handleSaveDraft() {
    if (busyAction) return;
    setBusyAction("save-draft");
    let v = `V${(versions.length + 1) / 10 + 1}.${versions.length % 10} 张工 保存草稿`;
    try {
      const response = await reportApi.saveDraft();
      v = response.version;
    } catch {
      showToast("保存接口暂不可用，已先记录本地版本。");
    }
    setVersions((prev) => [{ id: `draft-${Date.now()}`, label: v }, ...prev]);
    showToast("草稿已保存。");
    setBusyAction(null);
  }

  async function handleRollbackConfirm() {
    if (!rollbackTarget || busyAction) return;
    setBusyAction("rollback");
    let v = `V${versions.length + 1}.0 张工 回退至 ${rollbackTarget.label}`;
    try {
      const response = await reportApi.rollback(rollbackTarget.id, rollbackTarget.label);
      v = response.version;
      setSections(response.sections);
      setContent(Object.fromEntries(response.sections.map((section) => [section.id, section.content])));
    } catch {
      showToast("版本回退接口暂不可用，已先记录本地版本。");
    }
    setVersions((prev) => [{ id: `rollback-${Date.now()}`, label: v }, ...prev]);
    showToast(`已回退至「${rollbackTarget.label}」。当前未保存的修改已丢弃。`);
    setRollbackTarget(null);
    setBusyAction(null);
  }

  async function handleExportWord(scope = "整份报告") {
    if (busyAction) return;
    if (scope === "整份报告" && activeRunId && finalReportPath) {
      setBusyAction("export-word-report");
      showToast("正在通过后端导出最终 Word...");
      try {
        await reportApi.generatedExportStatus(currentProjectName, "word", finalReportPath);
        const response = await reportApi.downloadGeneratedReport(currentProjectName, "word", finalReportPath);
        showToast(`Word 已开始下载：${response.fileName}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "导出接口暂不可用。";
        showToast(`Word 导出失败：${detail}`);
      } finally {
        setBusyAction(null);
      }
      return;
    }
    setBusyAction(scope === "整份报告" ? "export-word-report" : "export-word-section");
    showToast(`${scope} Word 正在准备下载...`);
    try {
      const response = await reportApi.export(scope, "word");
      showToast(`${scope} Word 已生成：${response.fileName}`);
    } catch {
      showToast(`${scope} Word 已生成：${activeDocName}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExportPdf() {
    if (busyAction) return;
    if (!finalReportPath) {
      showToast("请先生成最终 Word 报告后再导出 PDF。");
      return;
    }
    if (pdfStatus !== "ready") {
      const ready = await prepareGeneratedPdf(finalReportPath);
      if (!ready) return;
    }
    setBusyAction("export-pdf");
    showToast("正在检查 PDF 导出状态...");
    try {
      const status = await reportApi.generatedExportStatus(currentProjectName, "pdf", finalReportPath);
      if (!status.exists) {
        showToast("未找到已生成 PDF，正在由后端转换...");
      }
      const response = await reportApi.downloadGeneratedReport(currentProjectName, "pdf", finalReportPath);
      showToast(`PDF 已开始下载：${response.fileName}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "PDF 转换接口暂不可用。";
      showToast(`PDF 导出失败：${detail}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function selectSectionCategory(categoryId: string) {
    if (!active || busyAction) return;
    setBusyAction("category");
    const nextCategory = categoryById(categoryId);
    setSectionCategories((current) => ({ ...current, [active.id]: categoryId }));
    setCategoryPickerOpen(false);
    setCategorySearch("");
    showToast(`已将「${active.title}」关联到「${nextCategory.name}」类别。`);
    try {
      await reportApi.updateSection(active.id, { categoryId });
    } catch {
      showToast("章节类别接口暂不可用，已先保存在当前页面。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevisionUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !active || busyAction) return;
    setBusyAction("revision-upload");
    setUploadedRevisions((current) => ({ ...current, [active.id]: file.name }));
    setVersions((prev) => [{ id: `revision-${Date.now()}`, label: `V${prev.length + 1}.0 张工 上传更正版 Word` }, ...prev]);
    showToast(`已上传 ${file.name}，系统将重新转换 PDF 预览。`);
    try {
      const response = await reportApi.uploadRevision(active.id, file.name);
      setVersions((prev) => [{ id: `revision-api-${Date.now()}`, label: response.version }, ...prev]);
    } catch {
      showToast("更正版上传接口暂不可用，已先载入当前页面预览。");
    } finally {
      setBusyAction(null);
    }
  }

  async function openPdfPreview(scope: "report" | "section") {
    if (busyAction || scope !== "report") return;
    if (!pdfBlobUrl) {
      if (finalReportPath) {
        await prepareGeneratedPdf(finalReportPath);
      }
      if (!pdfBlobUrlRef.current) {
        showToast("PDF 还未生成，请稍后再预览。");
        return;
      }
    }
    setPreviewScope("report");
    setPdfPreviewOpen(true);
  }

  return (
    <>
      <SectionHeader
        eyebrow="Report Generation"
        title="报告生成与预览"
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={handleGenerate} disabled={Boolean(busyAction) || !currentProject?.id || !activeRunId} loading={generating} loadingText="生成中">
              <Sparkles className="size-4" />
              生成报告
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="serif text-[1.75rem] leading-tight">报告生成进度</h2>
            <p className="mt-1 text-sm text-warm-stone">实时展示 gen-report 工作流日志和当前生成阶段。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={workflowTone(workflowDisplayStatus)}>
              {workflowLabel(workflowDisplayStatus)}
            </Badge>
            {activeRunId ? <Badge tone="neutral">Run {activeRunId}</Badge> : null}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {reportWorkflowStages.map((stage, index) => (
            <div
              key={stage.stage}
              className={cn(
                "rounded-lg border p-2 text-center",
                stage.status === "active" ? "border-ink-black bg-mint-wash/45" :
                stage.status === "done" ? "border-ink-black/20 bg-parchment-cream/60" :
                stage.status === "failed" ? "border-[#8b3228]/30 bg-[#f6d8d2]/35" :
                "border-ink-black/10 bg-parchment-cream/35"
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                {stage.status === "active" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : stage.status === "done" ? (
                  <CheckCircle2 className="size-3.5" />
                ) : stage.status === "failed" ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <span className="grid size-3.5 place-items-center rounded-full border border-ink-black/20 text-[9px]">
                    {index + 1}
                  </span>
                )}
                <span className="text-xs font-medium">{stage.label}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-warm-stone">{stage.meta}</p>
            </div>
          ))}
        </div>

        <div className={cn("mt-3 rounded-md border p-2.5", workflowDisplayStatus === "succeeded" ? "border-ink-black/30 bg-mint-wash/55" : workflowDisplayStatus === "failed" ? "border-[#8b3228]/30 bg-[#f6d8d2]/55" : "border-ink-black/30 bg-parchment-cream/55")}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {workflowDisplayStatus === "running" || workflowDisplayStatus === "queued" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : workflowDisplayStatus === "succeeded" ? (
                <CheckCircle2 className="size-3.5" />
              ) : workflowDisplayStatus === "failed" ? (
                <AlertTriangle className="size-3.5" />
              ) : null}
              报告生成工作流
            </span>
            <button
              type="button"
              aria-label="全屏查看工作流日志"
              onClick={() => setWorkflowLogOpen(true)}
              className="focus-ring rounded-md border border-ink-black/15 bg-parchment-cream/80 p-1.5 text-warm-stone transition hover:border-ink-black hover:text-ink-black"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-graphite">
            {workflowSummary}
          </p>
          <div className="mt-2 h-1 rounded-full bg-ink-black/10">
            <div
              className={cn("h-1 rounded-full transition-all", workflowDisplayStatus === "failed" ? "bg-[#8b3228]" : "bg-ink-black")}
              style={{ width: `${activeReportProgress}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid min-h-[230px] gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
          <div className="rounded-md border border-ink-black bg-ink-black px-2 py-2 text-parchment-cream">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">1. {currentProjectName}</span>
              <StatusDot tone={workflowDisplayStatus === "failed" ? "danger" : workflowDisplayStatus === "succeeded" ? "success" : workflowDisplayStatus ? "active" : "neutral"} />
            </span>
            <span className="mt-1 block text-[11px] text-parchment-cream/70">
              {runStatus?.businessStatus ?? workflowLabel(workflowDisplayStatus)}
            </span>
          </div>

          <div className="min-w-0 rounded-lg border border-ink-black/12 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-warm-stone">当前任务 1/1</p>
                <p className="mt-1 truncate text-sm font-medium">{currentProjectName}</p>
              </div>
              <Badge tone={workflowTone(workflowDisplayStatus)}>{workflowLabel(workflowDisplayStatus)}</Badge>
            </div>
            <div className="relative max-h-44 overflow-y-auto pr-1">
              {reportWorkflowEvents.map((event, index) => (
                <div key={`${event.time}-${event.label}-${index}`} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
                  {index < reportWorkflowEvents.length - 1 ? (
                    <span className="absolute bottom-0 left-[7.5px] top-6 w-px bg-ink-black/18" />
                  ) : null}
                  <span className="relative z-10 mt-1 grid size-4 place-items-center rounded-full bg-parchment-cream">
                    <StatusDot tone={event.state === "done" ? "success" : event.state === "active" ? "active" : "neutral"} />
                  </span>
                  <div className="min-w-0 rounded-md border border-ink-black/10 bg-parchment-cream/45 px-2.5 py-2">
                    <p className="text-xs text-warm-stone">{event.time}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-graphite">{event.label}</p>
                  </div>
                </div>
              ))}
              {reportWorkflowEvents.length === 0 ? (
                <p className="rounded-md border border-ink-black/10 p-3 text-sm text-warm-stone">暂无生成任务。点击右上角生成报告后查看进展。</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {reportBodyVisible ? (
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <Card className="sticky top-24 max-h-[calc(100vh-7rem)] self-start overflow-y-auto p-4">
          <div
            onDragOver={(event) => {
              if (!draggingSectionId || interfaceBusy) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setSectionDropMarker(getSectionDropMarker(sectionListRef.current, event.clientY, draggingSectionId));
            }}
            onDrop={(event) => {
              if (!draggingSectionId || interfaceBusy) return;
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("text/plain") || draggingSectionId;
              const marker = sectionDropMarker ?? getSectionDropMarker(sectionListRef.current, event.clientY, sourceId);
              if (sourceId && marker) {
                moveSection(sourceId, marker.targetId, marker.position);
              }
              setDraggingSectionId(null);
              setSectionDropMarker(null);
            }}
          >
            <h2 className="serif mb-4 text-3xl">报告目录</h2>
            <div ref={sectionListRef} className="space-y-2">
              {sections.map((section) => {
                const showBefore = sectionDropMarker?.targetId === section.id && sectionDropMarker.position === "before";
                const showAfter = sectionDropMarker?.targetId === section.id && sectionDropMarker.position === "after";
                const isDragging = draggingSectionId === section.id;
                const isActive = activeId === section.id;
                return (
                  <div
                    key={section.id}
                    className={cn(
                      "space-y-2 transition-all duration-200",
                      isDragging && "h-0 overflow-hidden opacity-0"
                    )}
                  >
                    {showBefore ? (
                      <div className="h-2 rounded-full border border-dashed border-ink-black/40 bg-mint-wash/55 transition-all" />
                    ) : null}
                    <div
                      draggable
                      data-section-item-id={section.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => !interfaceBusy && setActiveId(section.id)}
                      onKeyDown={(event) => {
                        if (!interfaceBusy && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setActiveId(section.id);
                        }
                      }}
                      onDragStart={(event) => {
                        const target = event.target;
                        if (interfaceBusy) {
                          event.preventDefault();
                          return;
                        }
                        if (!(target instanceof Element) || target.closest("button,a,input,textarea")) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", section.id);
                        setFloatingDragImage(event.dataTransfer, event.currentTarget, event.clientX, event.clientY);
                        setDraggingSectionId(section.id);
                        setSectionDropMarker(getSectionDropMarker(sectionListRef.current, event.clientY, section.id));
                      }}
                      onDragEnd={() => {
                        setDraggingSectionId(null);
                        setSectionDropMarker(null);
                      }}
                      className={cn(
                        "group relative grid w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition duration-200",
                        isActive
                          ? "border-ink-black bg-ink-black text-parchment-cream"
                          : "border-ink-black/15 hover:border-ink-black/45 hover:bg-white/35",
                        isDragging && "scale-[0.98] border-ink-black bg-mint-wash/35 shadow-editorial"
                      )}
                    >
                      <div className="flex cursor-grab items-center justify-center pt-0.5 text-current/55 active:cursor-grabbing">
                        <GripVertical className="size-4" />
                      </div>
                      <div className="min-w-0 pr-6">
                        <span className="block truncate">{section.title}</span>
                        <span className="mt-1 block text-xs opacity-70">{section.status}</span>
                        {uploadedRevisions[section.id] ? <span className="mt-1 block truncate text-xs opacity-70">已上传更正版</span> : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`删除章节 ${section.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteSection(section.id);
                        }}
                        className={cn(
                          "focus-ring absolute right-2 top-2 rounded-md p-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100",
                          isActive ? "text-parchment-cream/75 hover:bg-parchment-cream/15 hover:text-parchment-cream" : "text-warm-stone hover:bg-peach-wash/45 hover:text-ink-black",
                          (sections.length <= 1 || interfaceBusy) && "pointer-events-none opacity-30"
                        )}
                        disabled={sections.length <= 1 || interfaceBusy}
                      >
                        {busyAction === "delete-section" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
                    {showAfter ? (
                      <div className="h-2 rounded-full border border-dashed border-ink-black/40 bg-mint-wash/55 transition-all" />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Button className="mt-4 w-full" onClick={() => setAddSectionOpen(true)} disabled={interfaceBusy}>
              <Plus className="size-4" />添加章节
            </Button>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !interfaceBusy && setCategoryPickerOpen(true)}
                  onKeyDown={(e) => { if (!interfaceBusy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setCategoryPickerOpen(true); } }}
                  className={cn("focus-ring serif rounded-md border border-transparent px-1 text-left text-3xl leading-tight transition hover:border-ink-black/25 hover:bg-white/35", interfaceBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer")}
                  title="点击选择当前章节类别"
                >
                  {active?.title}
                </div>
                <button
                  type="button"
                  disabled={interfaceBusy}
                  onClick={() => setCategoryPickerOpen(true)}
                  className="focus-ring inline-flex max-w-full items-center gap-2 rounded-md border border-ink-black/30 bg-lavender-mist/70 px-2.5 py-1 text-xs text-graphite transition hover:border-ink-black hover:bg-lavender-mist"
                >
                  章节类别
                  <span className="truncate text-ink-black">{activeCategory.name}</span>
                  <span className="hidden text-warm-stone lg:inline">/ {activeCategory.template}</span>
                </button>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-warm-stone">
                每个目录章节独立绑定系统类别和标准模板；点击章节标题可在人工纠错时重新选择类别。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleExportWord(active?.title ?? "当前章节")} loading={busyAction === "export-word-section"} loadingText="导出中" disabled={interfaceBusy && busyAction !== "export-word-section"}><Download className="size-4" />下载章节 Word</Button>
              <Button onClick={() => revisionInputRef.current?.click()} loading={busyAction === "revision-upload"} loadingText="上传中" disabled={interfaceBusy && busyAction !== "revision-upload"}><Upload className="size-4" />上传更正版</Button>
              <Button onClick={() => void handleSaveDraft()} loading={busyAction === "save-draft"} loadingText="保存中" disabled={interfaceBusy && busyAction !== "save-draft"}><Save className="size-4" />保存记录</Button>
              <Button onClick={() => void openPdfPreview("report")} disabled={(interfaceBusy && busyAction !== "preview-report") || !pdfBlobUrl}><Eye className="size-4" />全屏预览</Button>
            </div>
          </div>
          <input
            ref={revisionInputRef}
            className="hidden"
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              void handleRevisionUpload(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <GeneratedPdfPreview
            pdfUrl={pdfBlobUrl}
            fileName={pdfFileName || `${currentProjectName}_检测报告.pdf`}
            full={false}
          />
        </Card>

        <aside className="space-y-4">
          <Card lavender>
            <div className="mb-5 flex items-center gap-3">
              <Lightbulb className="size-5" />
              <h2 className="serif text-3xl">智能助手</h2>
            </div>
            <div className="rounded-xl border border-ink-black/15 bg-parchment-cream/55 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={AI_SUGGESTIONS[aiIndex].tone}>建议优化</Badge>
                <span className="text-xs text-warm-stone">{aiIndex + 1}/{AI_SUGGESTIONS.length}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-graphite">{AI_SUGGESTIONS[aiIndex].text}</p>
              <div className="mt-5 flex gap-2">
                <Button className="flex-1" variant="primary" onClick={() => void applySuggestion(AI_SUGGESTIONS[aiIndex].text)} loading={busyAction === "suggestion"} loadingText="同步中" disabled={interfaceBusy && busyAction !== "suggestion"}>
                  <Check className="size-4" />
                  纳入生成规则
                </Button>
                <Button variant="ghost" onClick={() => setAiIndex((i) => (i + 1) % AI_SUGGESTIONS.length)} title="下一条建议" disabled={interfaceBusy}>
                  跳过
                </Button>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="serif text-3xl">交付文件</h2>
            <div className="mt-4 space-y-3 text-sm">
              <DeliveryRow
                icon={<FileText className="size-4" />}
                label="整份 Word"
                value={finalReportPath ? "已生成" : workflowJob?.status === "running" ? "生成中" : "待生成"}
                onClick={() => void handleExportWord()}
                loading={busyAction === "export-word-report"}
                disabled={(interfaceBusy && busyAction !== "export-word-report") || !finalReportPath}
              />
              <DeliveryRow icon={<FileDown className="size-4" />} label="整份 PDF" value="已生成" onClick={() => void handleExportPdf()} loading={busyAction === "export-pdf"} disabled={(interfaceBusy && busyAction !== "export-pdf") || !finalReportPath || !pdfBlobUrl} />
              <DeliveryRow icon={<FileUp className="size-4" />} label="章节更正版" value={active && uploadedRevisions[active.id] ? "已上传" : "未上传"} onClick={() => revisionInputRef.current?.click()} loading={busyAction === "revision-upload"} disabled={interfaceBusy && busyAction !== "revision-upload"} />
            </div>
            {finalReportPath ? (
              <p className="mt-3 break-all rounded-lg border border-ink-black/10 bg-white/25 px-3 py-2 text-xs leading-5 text-warm-stone">
                {finalReportPath}
              </p>
            ) : null}
            {pdfFilePath ? (
              <p className="mt-2 break-all rounded-lg border border-ink-black/10 bg-mint-wash/25 px-3 py-2 text-xs leading-5 text-warm-stone">
                {pdfFilePath}
              </p>
            ) : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="serif text-3xl">字段输入</h2>
              <Badge tone={runStatusTone(runStatus?.businessStatus ?? runStatus?.status)}>{runStatus?.businessStatus ?? "未生成"}</Badge>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {runFields.slice(0, 8).map((field) => (
                <div key={field.id} className="rounded-lg border border-ink-black/15 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 text-warm-stone">
                    <span className="min-w-0 truncate">{field.section ?? "main"}</span>
                    <span>{field.confidence}%</span>
                  </div>
                  <div className="mt-1 truncate font-medium text-ink-black">{field.name}</div>
                  <div className="mt-1 truncate text-graphite">{field.value || "空值"}</div>
                </div>
              ))}
              {!runFields.length ? (
                <div className="rounded-lg border border-dashed border-ink-black/20 px-3 py-6 text-center text-sm text-warm-stone">
                  生成完成后显示本次 run 使用的字段。
                </div>
              ) : null}
            </div>
          </Card>
          <Card>
            <h2 className="serif text-3xl">版本历史</h2>
            <div className="mt-5 max-h-48 space-y-3 overflow-y-auto text-sm">
              {versions.map((item, index) => (
                <div key={`${item.id}-${index}`} className="flex items-center gap-2 rounded-lg border border-ink-black/15 px-3 py-2">
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <button
                    type="button"
                    disabled={interfaceBusy}
                    onClick={() => setRollbackTarget(item)}
                    className="focus-ring shrink-0 rounded-md p-1 text-warm-stone transition hover:bg-lavender-mist/60 hover:text-ink-black"
                    title="回退至此版本"
                  >
                    <Undo2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Card className={message ? "" : "opacity-70"}>
            <FileText className="mb-4 size-5" />
            <p className="text-sm leading-6 text-graphite">{message}</p>
          </Card>
        </aside>
      </div>
      ) : null}

      {workflowLogOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setWorkflowLogOpen(false)}>
          <div className="flex h-[82vh] w-full max-w-[980px] flex-col rounded-xl border border-ink-black bg-parchment-cream shadow-editorial" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-ink-black/15 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Workflow Log</p>
                <h2 className="serif mt-1 text-[1.8rem] leading-tight">报告生成日志</h2>
                <p className="mt-1 text-sm text-graphite">{activeRunId ? `Run ${activeRunId}` : "暂无 run"}</p>
              </div>
              <button type="button" aria-label="关闭日志" onClick={() => setWorkflowLogOpen(false)} className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {workflowLogEvents.length ? (
                <div className="space-y-2 text-sm leading-6 text-graphite">
                  {workflowLogEvents.map((event, index) => (
                    <div key={`${event.at}-${index}`} className="grid gap-2 rounded-lg border border-ink-black/10 bg-white/25 px-3 py-2 md:grid-cols-[92px_minmax(0,1fr)]">
                      <span className="text-warm-stone">{new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                      <span className="min-w-0 whitespace-pre-wrap break-words">{event.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-items-center rounded-lg border border-dashed border-ink-black/20 text-sm text-warm-stone">
                  暂无工作流日志。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pdfPreviewOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !busyAction && setPdfPreviewOpen(false)}>
          <div className="flex h-full w-full max-w-[940px] flex-col rounded-xl border border-ink-black bg-parchment-cream shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-black/15 px-5 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">PDF Preview</p>
                <h2 className="serif text-[1.4rem] leading-tight">
                  {previewScope === "report" ? `${currentProjectName}检测报告.pdf` : `${active?.title ?? "当前章节"}预览.pdf`}
                </h2>
              </div>
              <button type="button" aria-label="关闭预览" disabled={Boolean(busyAction)} onClick={() => setPdfPreviewOpen(false)} className="disabled:cursor-not-allowed disabled:opacity-45">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <GeneratedPdfPreview
                pdfUrl={pdfBlobUrl}
                fileName={pdfFileName || `${currentProjectName}_检测报告.pdf`}
                full
              />
            </div>
          </div>
        </div>
      ) : null}

      {generatedDialogOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !busyAction && setGeneratedDialogOpen(false)}>
          <div className="w-full max-w-[560px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Report Ready</p>
                <h2 className="serif mt-1 text-[1.8rem] leading-tight">报告已生成</h2>
                <p className="mt-2 text-sm leading-6 text-graphite">
                  gen-report 工作流已生成最终 Word 报告。请先查看页面预览和字段摘要，确认无误后导出最终 Word；章节级错误可回到目录中下载对应章节 Word 修改后上传。
                </p>
                {finalReportPath ? <p className="mt-2 break-all text-xs leading-5 text-warm-stone">{finalReportPath}</p> : null}
                {pdfStatus === "converting" || pdfStatus === "checking" ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-xs text-warm-stone">
                    <Loader2 className="size-3.5 animate-spin" />
                    正在准备最终 PDF 预览...
                  </p>
                ) : null}
                {pdfStatus === "failed" && pdfError ? (
                  <p className="mt-2 rounded-md border border-[#8b3228]/25 bg-[#f6d8d2]/45 px-3 py-2 text-xs leading-5 text-[#8b3228]">
                    PDF 生成失败：{pdfError}
                  </p>
                ) : null}
              </div>
              <button type="button" aria-label="关闭生成结果" disabled={Boolean(busyAction)} onClick={() => setGeneratedDialogOpen(false)} className="disabled:cursor-not-allowed disabled:opacity-45">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Button
                className="w-full"
                onClick={() => {
                  setGeneratedDialogOpen(false);
                  void openPdfPreview("report");
                }}
                loading={busyAction === "preview-report"}
                loadingText="准备中"
                disabled={(interfaceBusy && busyAction !== "preview-report") || !pdfBlobUrl}
              >
                <Eye className="size-4" />全屏预览
              </Button>
              <Button className="w-full" onClick={() => void handleExportPdf()} loading={busyAction === "export-pdf" || pdfStatus === "checking" || pdfStatus === "converting"} loadingText={pdfStatus === "checking" || pdfStatus === "converting" ? "转换中" : "导出中"} disabled={(interfaceBusy && busyAction !== "export-pdf") || !finalReportPath}><FileDown className="size-4" />导出 PDF</Button>
              <Button className="w-full" variant="primary" onClick={() => void handleExportWord()} loading={busyAction === "export-word-report"} loadingText="导出中" disabled={(interfaceBusy && busyAction !== "export-word-report") || !finalReportPath}><Download className="size-4" />导出 Word</Button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryPickerOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !busyAction && setCategoryPickerOpen(false)}>
          <div className="w-full max-w-[620px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Section Category</p>
                <h2 className="serif mt-0.5 text-[1.6rem] leading-tight">选择章节类别</h2>
                <p className="mt-1.5 text-sm leading-6 text-graphite">当前章节：{active?.title}。类别决定本章节使用的标准模板和字段规则。</p>
              </div>
              <button type="button" aria-label="关闭章节类别选择" disabled={Boolean(busyAction)} onClick={() => setCategoryPickerOpen(false)} className="disabled:cursor-not-allowed disabled:opacity-45">
                <X className="size-5" />
              </button>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-lg border border-ink-black/20 bg-white/35 px-3 py-2">
              <Search className="size-4 text-warm-stone" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-warm-stone"
                value={categorySearch}
                disabled={Boolean(busyAction)}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="搜索类别、模板、编码或适用范围"
                autoFocus
              />
            </label>
            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {filteredCategories.map((category) => {
                const checked = activeCategory.id === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => void selectSectionCategory(category.id)}
                    className={`focus-ring flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${checked ? "border-ink-black bg-ink-black text-parchment-cream" : "border-ink-black/15 hover:border-ink-black/45"}`}
                  >
                    <span>
                      <span className="block text-sm font-medium">{category.name}</span>
                      <span className="mt-1 block text-xs opacity-70">{category.template}</span>
                      <span className="mt-1 block text-xs opacity-70">{category.scope}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span>{category.code}</span>
                      <span className={`grid size-5 place-items-center rounded-full border ${checked ? "border-parchment-cream" : "border-ink-black/25"}`}>
                        {busyAction === "category" && checked ? <Loader2 className="size-3.5 animate-spin" /> : checked ? <Check className="size-3.5" /> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredCategories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink-black/25 px-4 py-8 text-center text-sm text-warm-stone">
                  没有匹配的类别，请调整关键词。
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {addSectionOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !busyAction && setAddSectionOpen(false)}>
          <div className="w-full max-w-[380px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Add Section</p>
              <h2 className="serif mt-0.5 text-[1.5rem] leading-tight">添加章节</h2>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm text-graphite">章节标题</span>
              <Input className="w-full" placeholder="输入章节标题" value={newSectionTitle} disabled={Boolean(busyAction)} onChange={(e) => setNewSectionTitle(e.target.value)} />
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setAddSectionOpen(false)} disabled={Boolean(busyAction)}>取消</Button>
              <Button variant="primary" onClick={() => void handleAddSection()} loading={busyAction === "add-section"} loadingText="添加中" disabled={!newSectionTitle.trim()}>
                <Plus className="size-4" />
                添加
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {rollbackTarget ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !busyAction && setRollbackTarget(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Version Rollback</p>
              <h2 className="serif mt-0.5 text-[1.5rem] leading-tight">版本回退</h2>
              <p className="mt-3 text-sm leading-6 text-graphite">
                将回退至版本「<span className="font-medium text-ink-black">{rollbackTarget.label}</span>」。回退后将<span className="font-medium text-peach-wash">不会保存当前未提交的修改</span>，请谨慎使用。
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setRollbackTarget(null)} disabled={Boolean(busyAction)}>取消</Button>
              <Button variant="primary" onClick={() => void handleRollbackConfirm()} loading={busyAction === "rollback"} loadingText="回退中">
                <Undo2 className="size-4" />
                确认回退
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-black bg-ink-black px-4 py-2.5 text-sm text-parchment-cream shadow-editorial">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function GeneratedPdfPreview({
  pdfUrl,
  fileName,
  full = false
}: {
  pdfUrl: string;
  fileName: string;
  full?: boolean;
}) {
  return (
    <div className="relative rounded-lg border border-ink-black/15 bg-white/45">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-black/15 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-graphite">
          <FileText className="size-4 shrink-0" />
          <span className="truncate">PDF 预览：{fileName}</span>
        </div>
      </div>
      <div className={cn(full ? "h-[calc(100vh-9rem)]" : "h-[66vh] min-h-[560px]", "overflow-hidden bg-white")}>
        {pdfUrl ? (
          <iframe
            title={fileName}
            src={pdfUrl}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-warm-stone">
            PDF 尚未生成。
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryRow({
  icon,
  label,
  value,
  onClick,
  loading = false,
  disabled = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg border border-ink-black/15 px-3 py-2 text-left transition hover:border-ink-black/45 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="flex items-center gap-2">
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        <span>{label}</span>
      </span>
      <span className="text-xs text-warm-stone">{loading ? "处理中" : value}</span>
    </button>
  );
}
