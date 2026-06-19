"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  FileSearch,
  GripVertical,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, Td } from "@/components/ui/table";
import { recordApi, genReportApi } from "@/lib/services/api";
import type { DetectedType, ExtractedField, ParseEvent, RawFile, WorkflowJob, WorkflowProgress } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

const requiredFields = ["检验项目", "测量位置", "实测值", "标准值", "单位", "判定结果"];
const RECORD_WORKFLOW_STORAGE_PREFIX = "report-generator.records.workflow.";
const REQUIRED_FIELD_MATCHERS: Array<{ label: string; aliases: string[] }> = [
  {
    label: "检验项目",
    aliases: ["检验项目", "inspection_item", "inspection_type", "basic_inspection_type", "summary_test_item"]
  },
  {
    label: "测量位置",
    aliases: ["测量位置", "measure_position", "inspection_location", "position_axis", "position_target"]
  },
  {
    label: "实测值",
    aliases: ["实测值", "actual_value", "position_measured", "position_error", "position_mean_error"]
  },
  {
    label: "标准值",
    aliases: ["标准值", "standard_value", "position_tolerance", "inspection_basis_text", "summary_requirement"]
  },
  {
    label: "单位",
    aliases: ["单位", "unit", "position_stroke_mm", "position_tolerance_um"]
  },
  {
    label: "判定结果",
    aliases: ["判定结果", "judgement", "judgment", "inspection_conclusion", "position_conclusion", "summary_conclusion"]
  }
];
const FIELD_PREVIEW_LIMIT = 6;
const EMPTY_EXTRACTED_FIELDS: ExtractedField[] = [];
const EMPTY_PARSE_EVENTS: ParseEvent[] = [];
const DETECTED_TYPE_OPTIONS: Array<{
  id: DetectedType;
  title: string;
  template: string;
  code: string;
  scope: string;
}> = [
  { id: "几何精度", title: "几何精度", template: "机床几何精度检测记录模板", code: "TYPE-GEOMETRY", scope: "平面度、直线度、圆度、同轴度" },
  { id: "位置精度", title: "位置精度", template: "位置精度检测记录模板", code: "TYPE-POSITION", scope: "定位精度、重复定位、平行度、垂直度" },
  { id: "电气参数", title: "电气参数", template: "电气参数检测记录模板", code: "TYPE-ELECTRIC", scope: "电压、电流、绝缘、接地" },
  { id: "力学性能", title: "力学性能", template: "力学性能检测记录模板", code: "TYPE-MECHANIC", scope: "载荷、刚度、振动、冲击" },
  { id: "综合检测", title: "综合检测", template: "综合检测记录模板", code: "TYPE-COMPOSITE", scope: "多类型混合记录、整机综合判定" }
];

type UploadQueueItem = {
  id: string;
  name: string;
  originalName: string;
  type: string;
  size: string;
  progress: number;
  detectedType: DetectedType;
  file: File;
  previewUrl: string;
  mimeType: string;
};

type PreviewAsset = {
  name: string;
  originalName: string;
  type: string;
  size: string;
  url?: string;
  mimeType?: string;
};

type DropMarker = {
  targetId: string;
  position: "before" | "after";
};

type StoredRecordWorkflow = {
  projectId: string;
  jobId: string | null;
  status: WorkflowJob["status"] | null;
  activeRunId: string | null;
  fieldsApproved?: boolean;
  events: ParseEvent[];
  activeParseFileId: string;
  parseStartTime: string | null;
  parseProgress: number;
  updatedAt: string;
};

function workflowStorageKey(projectId: string) {
  return `${RECORD_WORKFLOW_STORAGE_PREFIX}${projectId}`;
}

function readStoredWorkflow(projectId: string): StoredRecordWorkflow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(workflowStorageKey(projectId));
    return raw ? JSON.parse(raw) as StoredRecordWorkflow : null;
  } catch {
    return null;
  }
}

function writeStoredWorkflow(projectId: string, snapshot: StoredRecordWorkflow) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workflowStorageKey(projectId), JSON.stringify(snapshot));
}

function clearStoredWorkflow(projectId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(workflowStorageKey(projectId));
}

function isExtractionCompleteJob(job: WorkflowJob) {
  const messages = [
    job.message,
    job.error,
    ...(job.progressEvents ?? []).map((event) => event.message)
  ].filter(Boolean).join("\n").toLowerCase();
  return (
    messages.includes("extract completed") ||
    messages.includes("extraction completed") ||
    messages.includes("need human handling") ||
    messages.includes("review_required")
  );
}

function isHumanReviewMessage(label: string) {
  const normalized = label.toLowerCase();
  return normalized.includes("need human handling") || normalized.includes("review_required");
}

function getCompletedExtractionRunFile(files: RawFile[]) {
  return files.find((file) =>
    file.parseStatus === "解析成功" &&
    Boolean(file.parseRunId) &&
    Boolean(file.parseRunPath)
  );
}

function buildCompletedWorkflowEvents(events: ParseEvent[]) {
  const completedEvents = events
    .filter((event) => !isHumanReviewMessage(event.label))
    .map((event) => ({ ...event, state: event.state === "active" ? "done" as const : event.state }));

  return mergeParseEvents(completedEvents, [
    { time: nowTime(), label: "字段提取完成", state: "done" },
    { time: nowTime(), label: "结构化结果已写入字段库", state: "done" }
  ]);
}

function mergeParseEvents(existing: ParseEvent[], incoming: ParseEvent[]) {
  const seen = new Set(existing.map((event) => `${event.time}-${event.label}`));
  const merged = [...existing];
  for (const event of incoming) {
    const key = `${event.time}-${event.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}

function getQueueDropMarker(container: HTMLElement | null, clientY: number, draggingId?: string | null): DropMarker | null {
  const queueItems = Array.from(container?.querySelectorAll<HTMLElement>("[data-queue-item-id]") ?? []);
  const availableItems = queueItems.filter((queueItem) => queueItem.dataset.queueItemId !== draggingId);
  if (availableItems.length === 0) return null;

  for (const queueItem of availableItems) {
    const bounds = queueItem.getBoundingClientRect();
    const itemId = queueItem.dataset.queueItemId;
    if (!itemId) continue;
    if (clientY < bounds.top + bounds.height / 2) {
      return { targetId: itemId, position: "before" };
    }
  }

  const lastItem = availableItems[availableItems.length - 1];
  const lastItemId = lastItem?.dataset.queueItemId;
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

function normalizeFieldToken(value: string) {
  return value.replace(/[{}]/g, "").trim().toLowerCase();
}

function fieldMatchesAliases(field: ExtractedField, aliases: string[]) {
  const name = normalizeFieldToken(field.name);
  const id = normalizeFieldToken(field.id);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeFieldToken(alias);
    return name === normalizedAlias || id === normalizedAlias || name.includes(normalizedAlias) || id.includes(normalizedAlias);
  });
}

function countRequiredReady(fields: ExtractedField[]) {
  const filledFields = fields.filter((field) => field.value.trim());
  const matchedCount = REQUIRED_FIELD_MATCHERS.filter(({ aliases }) =>
    filledFields.some((field) => fieldMatchesAliases(field, aliases))
  ).length;
  if (matchedCount > 0) return matchedCount;
  return Math.min(requiredFields.length, filledFields.length);
}

function getTone(status: RawFile["parseStatus"]) {
  if (status === "解析成功") return "success";
  if (status === "解析失败") return "danger";
  return "active";
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function parseClockSeconds(time: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const [, hour, minute, second = "0"] = match;
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second);
}

function getEventsStartTime(events: ParseEvent[]) {
  return events[0]?.time ?? null;
}

function formatElapsedSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function getEventsElapsed(events: ParseEvent[]) {
  if (events.length < 2) return null;
  const start = parseClockSeconds(events[0].time);
  const end = parseClockSeconds(events[events.length - 1].time);
  if (start === null || end === null) return null;
  const elapsed = end >= start ? end - start : end + 24 * 3600 - start;
  return formatElapsedSeconds(elapsed);
}

function createId(prefix = "f") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getFileType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (["jpg", "jpeg"].includes(ext)) return "JPG";
  if (ext === "png") return "PNG";
  if (["doc", "docx"].includes(ext)) return "Word";
  if (["xls", "xlsx"].includes(ext)) return "Excel";
  return "文件";
}

function inferDetectedType(name: string): DetectedType {
  if (/电气|耐压|电流|电压/.test(name)) return "电气参数";
  if (/位置|坐标|定位|重复/.test(name)) return "位置精度";
  if (/力|载荷|刚度/.test(name)) return "力学性能";
  if (/综合|验收/.test(name)) return "综合检测";
  if (/照片|图片|image|jpg|png/i.test(name)) return "未识别";
  return "几何精度";
}

function isImagePreview(asset?: PreviewAsset | null) {
  return Boolean(asset?.mimeType?.startsWith("image/") || ["JPG", "PNG"].includes(asset?.type ?? ""));
}

function isPdfPreview(asset?: PreviewAsset | null) {
  return Boolean(asset?.mimeType === "application/pdf" || asset?.type === "PDF");
}

function isWordPreview(asset?: PreviewAsset | null) {
  return Boolean(
    asset?.type === "Word" ||
      asset?.mimeType === "application/msword" ||
      asset?.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function RecordsClient({
  files,
  fieldsByFile
}: {
  files: RawFile[];
  fieldsByFile: Record<string, ExtractedField[]>;
}) {
  const { currentProject } = useAppContext();
  const [uploaded, setUploaded] = useState(files);
  const [fieldSets, setFieldSets] = useState<Record<string, ExtractedField[]>>(() =>
    Object.fromEntries(
      files.map((file) => {
        const fileFields = fieldsByFile[file.id];
        return [file.id, fileFields?.length ? fileFields : EMPTY_EXTRACTED_FIELDS];
      })
    )
  );
  const [activePreviewFileId, setActivePreviewFileId] = useState(files[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  const [allFieldsSection, setAllFieldsSection] = useState<string>("main");
  const [editingTypeFileId, setEditingTypeFileId] = useState<string | null>(null);
  const [typeSearch, setTypeSearch] = useState("");
  const [parseEventSets, setParseEventSets] = useState<Record<string, ParseEvent[]>>(() =>
    Object.fromEntries(files.map((file) => [file.id, EMPTY_PARSE_EVENTS]))
  );
  const [activeParseFileId, setActiveParseFileId] = useState(files[0]?.id ?? "");
  const [parseStartTime, setParseStartTime] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState(71);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryFileId, setManualEntryFileId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ name: "", value: "" });
  const [exportToast, setExportToast] = useState(false);
  const [exportingResults, setExportingResults] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [directUploading, setDirectUploading] = useState(false);
  const [uploadingQueue, setUploadingQueue] = useState(false);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [draggingQueueId, setDraggingQueueId] = useState<string | null>(null);
  const [queueDropMarker, setQueueDropMarker] = useState<DropMarker | null>(null);
  const [previewAssets, setPreviewAssets] = useState<Record<string, PreviewAsset>>({});
  const [previewingAsset, setPreviewingAsset] = useState<PreviewAsset | null>(null);
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const [retryingFileIds, setRetryingFileIds] = useState<Set<string>>(() => new Set());
  const [retryingAllFailed, setRetryingAllFailed] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [savingAllFields, setSavingAllFields] = useState(false);
  const [approvingFields, setApprovingFields] = useState(false);
  const [fieldsApproved, setFieldsApproved] = useState(false);
  const [updatingTypeFileId, setUpdatingTypeFileId] = useState<string | null>(null);
  const [savingManualEntry, setSavingManualEntry] = useState(false);
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(() => new Set());
  const [workflowJobId, setWorkflowJobId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowJob["status"] | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<ParseEvent[]>([]);
  const [workflowPollingRef] = useState<{ current: ReturnType<typeof setTimeout> | null }>({ current: null });
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const seenProgressMessagesRef = useRef<Set<string>>(new Set());
  const activeWorkflowJobRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadQueueListRef = useRef<HTMLDivElement | null>(null);
  const syncedParseEventsRef = useRef<Set<string>>(new Set());
  const uploadedRef = useRef(uploaded);
  const previewAssetsRef = useRef(previewAssets);
  const uploadQueueRef = useRef(uploadQueue);

  const failedFiles = useMemo(() => uploaded.filter((file) => file.parseStatus === "解析失败"), [uploaded]);
  const successCount = uploaded.filter((file) => file.parseStatus === "解析成功").length;
  const activeCount = uploaded.filter((file) => file.parseStatus === "解析中").length;
  const workflowInFlight = workflowStatus === "queued" || workflowStatus === "running";
  const totalFiles = uploaded.length;
  const previewFileIndex = Math.max(0, uploaded.findIndex((file) => file.id === activePreviewFileId));
  const previewFile = uploaded[previewFileIndex];
  const previewFileIsExtracting = previewFile?.parseStatus === "解析中";
  const previewFileCanShowFields = previewFile?.parseStatus === "解析成功";
  const editableFields = previewFileCanShowFields ? fieldSets[activePreviewFileId] ?? EMPTY_EXTRACTED_FIELDS : EMPTY_EXTRACTED_FIELDS;
  const sectionGroupedFields = useMemo(() => {
    const fields = editableFields;
    if (fields.length === 0) return [];
    const groups: { section: string; label: string; fields: ExtractedField[] }[] = [];
    const seen = new Set<string>();
    for (const f of fields) {
      const section = f.section || "main";
      if (!seen.has(section)) {
        seen.add(section);
        let label = section;
        if (section === "main") label = "基本信息";
        else if (section === "geometry_precision") label = "几何精度检测";
        else if (section === "position_precision") label = "位置精度检测";
        groups.push({ section, label, fields: [] });
      }
      groups.find((g) => g.section === section)?.fields.push(f);
    }
    return groups;
  }, [editableFields]);
  const previewFieldGroups = useMemo(() => {
    let slots = FIELD_PREVIEW_LIMIT;
    return sectionGroupedFields
      .map((group) => {
        const fields = group.fields.slice(0, Math.max(0, slots));
        slots -= fields.length;
        return { ...group, fields };
      })
      .filter((group) => group.fields.length > 0);
  }, [sectionGroupedFields]);
  const selectedAllFieldsSection = sectionGroupedFields.some((group) => group.section === allFieldsSection)
    ? allFieldsSection
    : sectionGroupedFields[0]?.section ?? "main";
  const allFieldsSectionFields = sectionGroupedFields.find((group) => group.section === selectedAllFieldsSection)?.fields ?? [];
  const hiddenPreviewFieldCount = Math.max(0, editableFields.length - FIELD_PREVIEW_LIMIT);
  const successfulFields = uploaded.flatMap((file) => (file.parseStatus === "解析成功" ? fieldSets[file.id] ?? [] : []));
  const requiredReady = countRequiredReady(successfulFields);
  const devMockApproved = Boolean(activeRunId?.startsWith("dev-mock-run-") && fieldsApproved);
  const readyReportFile = uploaded.find((file) =>
    file.parseStatus === "解析成功" &&
    Boolean(file.fieldsApproved) &&
    Boolean(file.parseRunId) &&
    Boolean(file.parseRunPath)
  );
  const activeReportRunId = readyReportFile?.parseRunId ?? (devMockApproved ? activeRunId : null);
  const previewFieldsApproved = Boolean(previewFile?.fieldsApproved) || devMockApproved;
  const previewRunReady = Boolean(previewFile?.parseRunId && previewFile?.parseRunPath) || Boolean(activeRunId?.startsWith("dev-mock-run-"));
  const generateReady = totalFiles > 0 && failedFiles.length === 0 && activeCount === 0 && successfulFields.length > 0 && Boolean(activeReportRunId);
  const reportHref = activeReportRunId ? `/reports?runId=${encodeURIComponent(activeReportRunId)}` : "/reports";
  const activeField = editableFields.find((field) => field.id === activeFieldId);
  const editingFile = uploaded.find((file) => file.id === editingTypeFileId);
  const filteredTypeOptions = useMemo(() => {
    const keyword = typeSearch.trim().toLowerCase();
    if (!keyword) return DETECTED_TYPE_OPTIONS;
    return DETECTED_TYPE_OPTIONS.filter((option) =>
      `${option.title} ${option.template} ${option.code} ${option.scope}`.toLowerCase().includes(keyword)
    );
  }, [typeSearch]);
  const activeParseFile = uploaded.find((file) => file.id === activeParseFileId) ?? uploaded[0];
  const activeParseEvents = activeParseFile ? parseEventSets[activeParseFile.id] ?? [] : [];
  const activeParseIndex = activeParseFile ? Math.max(0, uploaded.findIndex((file) => file.id === activeParseFile.id)) : -1;
  const activeParseProgress = activeParseFile?.parseStatus === "解析成功" ? 100 : activeParseFile?.parseStatus === "解析失败" ? 38 : parseProgress;
  const activeParseStartTime = getEventsStartTime(activeParseEvents) ?? parseStartTime;
  const activeParseElapsed = getEventsElapsed(activeParseEvents);
  const queueReady = uploadQueue.length > 0 && uploadQueue.every((item) => item.progress >= 100);

  async function refreshProjectRecords(projectId = currentProject?.id) {
    if (!projectId) return;
    const [projectFiles, projectFieldSets] = await Promise.all([
      recordApi.files(projectId),
      recordApi.fieldsByFile(projectId)
    ]);
    const eventEntries = await Promise.all(
      projectFiles.map(async (file) => {
        try {
          return [file.id, await recordApi.fileParseEvents(file.id)] as const;
        } catch {
          return [file.id, parseEventSets[file.id] ?? EMPTY_PARSE_EVENTS] as const;
        }
      })
    );
    setUploaded(projectFiles);
    setFieldSets(projectFieldSets);
    setParseEventSets(Object.fromEntries(eventEntries));
    eventEntries.forEach(([fileId]) => syncedParseEventsRef.current.add(fileId));
    const preferredFile = projectFiles.find((file) => file.id === activePreviewFileId) ?? projectFiles[0];
    setActivePreviewFileId(preferredFile?.id ?? "");
    setActiveParseFileId((current) => projectFiles.some((file) => file.id === current) ? current : preferredFile?.id ?? "");
    setActiveRunId(preferredFile?.parseRunId ?? projectFiles.find((file) => file.parseRunId)?.parseRunId ?? null);
    setFieldsApproved(Boolean(preferredFile?.fieldsApproved));
    const completedRunFile = getCompletedExtractionRunFile(projectFiles);
    const hasRunningFile = projectFiles.some((file) => file.parseStatus === "解析中");
    if (completedRunFile && !hasRunningFile) {
      const completedFileEvents = eventEntries.find(([fileId]) => fileId === completedRunFile.id)?.[1] ?? [];
      setWorkflowJobId((current) => current ?? completedRunFile.parseJobId ?? `persisted-${completedRunFile.parseRunId}`);
      setWorkflowStatus("succeeded");
      setWorkflowEvents(buildCompletedWorkflowEvents(completedFileEvents));
      activeWorkflowJobRef.current = null;
    }
  }

  const steps = useMemo(() => {
    if (totalFiles === 0) return [
      { label: "上传文件", meta: "等待文件入队", state: "todo" as const },
      { label: "文档解析", meta: "表格/文本结构识别", state: "todo" as const },
      { label: "大模型提取", meta: "字段归一化", state: "todo" as const },
      { label: "结构化存储", meta: "待写入字段库", state: "todo" as const }
    ];
    const hasPending = activeCount > 0;
    const hasFailures = failedFiles.length > 0;
    const allDone = !hasPending && successCount > 0;
    return [
      { label: "上传文件", meta: `${totalFiles} 个文件已入队`, state: "done" as const },
      { label: "文档解析", meta: hasPending ? "解析中..." : hasFailures ? "部分失败" : "已完成", state: hasPending ? "active" as const : allDone ? "done" as const : "todo" as const },
      { label: "大模型提取", meta: hasPending ? "字段归一化中" : allDone ? "提取完成" : "等待中", state: hasPending ? "active" as const : allDone ? "done" as const : "todo" as const },
      { label: "结构化存储", meta: allDone && !hasFailures ? "已写入字段库" : "待写入", state: allDone && !hasFailures ? "done" as const : "todo" as const }
    ];
  }, [totalFiles, activeCount, successCount, failedFiles.length]);

  const fieldCount = useMemo(() => {
    let count = 0;
    for (const fileId of Object.keys(fieldSets)) {
      count += (fieldSets[fileId] ?? []).length;
    }
    return count;
  }, [fieldSets]);

  const workflowStages = useMemo((): WorkflowProgress[] => {
    const events = workflowEvents.map((e) => e.label);
    const statusLabel = workflowStatus ?? "idle";

    const stageState = (prefix: string): "pending" | "active" | "done" | "failed" => {
      if (statusLabel === "failed") return "done";
      if (statusLabel === "succeeded") return "done";
      if (statusLabel === "running" || statusLabel === "queued") {
        const started = events.some(
          (e) => e.toLowerCase().includes(prefix) || e.toLowerCase().includes(prefix === "extract" ? "main agent" : prefix)
        );
        const completed = events.some(
          (e) =>
            e.toLowerCase().includes(`${prefix} completed`) ||
            e.toLowerCase().includes(`${prefix} succeeded`) ||
            (prefix === "generate" && e.toLowerCase().includes("generated"))
        );
        if (completed) return "done";
        if (started) return "active";
        if (prefix === "validate" || prefix === "prepare") return "done";
        return "pending";
      }
      return "pending";
    };

    return [
      { stage: "validate", status: stageState("validate"), label: "配置验证", meta: stageState("validate") === "done" ? "已通过" : "等待中" },
      { stage: "prepare", status: stageState("prepare"), label: "工作区准备", meta: stageState("prepare") === "done" ? "已就绪" : "等待中" },
      { stage: "extract", status: stageState("extract"), label: "字段提取", meta: statusLabel === "running" ? "提取中…" : statusLabel === "succeeded" ? `${fieldCount} 个字段` : "等待中" },
      { stage: "generate", status: statusLabel === "succeeded" ? "done" : "pending", label: "结构化存储", meta: statusLabel === "succeeded" ? "已写入字段库" : "等待中" },
    ];
  }, [workflowEvents, workflowStatus, fieldCount]);

  useEffect(() => {
    if (uploaded.length === 0) {
      setActivePreviewFileId("");
      setActiveParseFileId("");
      return;
    }
    if (!uploaded.some((file) => file.id === activePreviewFileId)) {
      setActivePreviewFileId(uploaded[0].id);
    }
    if (!uploaded.some((file) => file.id === activeParseFileId)) {
      setActiveParseFileId(uploaded[0].id);
    }
  }, [activeParseFileId, activePreviewFileId, uploaded]);

  useEffect(() => {
    setActiveFieldId(null);
  }, [activePreviewFileId]);

  useEffect(() => {
    if (!uploadModalOpen || uploadQueue.length === 0) return;
    const timer = window.setInterval(() => {
      setUploadQueue((current) =>
        current.map((item) => ({
          ...item,
          progress: Math.min(100, item.progress + 11 + Math.floor(Math.random() * 13))
        }))
      );
    }, 450);

    return () => window.clearInterval(timer);
  }, [uploadModalOpen, uploadQueue.length]);

  useEffect(() => {
    uploadedRef.current = uploaded;
  }, [uploaded]);

  useEffect(() => {
    previewAssetsRef.current = previewAssets;
  }, [previewAssets]);

  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    const projectId = currentProject?.id;
    if (!projectId || !workflowJobId) return;
    writeStoredWorkflow(projectId, {
      projectId,
      jobId: workflowJobId,
      status: workflowStatus,
      activeRunId,
      fieldsApproved,
      events: workflowEvents,
      activeParseFileId,
      parseStartTime,
      parseProgress,
      updatedAt: new Date().toISOString()
    });
  }, [activeParseFileId, activeRunId, currentProject?.id, fieldsApproved, parseProgress, parseStartTime, workflowEvents, workflowJobId, workflowStatus]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const projectId = currentProject?.id;
    if (!projectId) {
      setUploaded([]);
      setFieldSets({});
      setParseEventSets({});
      setActivePreviewFileId("");
      setActiveParseFileId("");
      setWorkflowJobId(null);
      setWorkflowStatus(null);
      setWorkflowEvents([]);
      setActiveRunId(null);
      setFieldsApproved(false);
      activeWorkflowJobRef.current = null;
      syncedParseEventsRef.current.clear();
      return;
    }

    let cancelled = false;
    const storedWorkflow = readStoredWorkflow(projectId);
    syncedParseEventsRef.current.clear();
    setUploaded([]);
    setFieldSets({});
    setParseEventSets({});
    setActivePreviewFileId("");
    setActiveParseFileId("");
    setWorkflowJobId(storedWorkflow?.jobId ?? null);
    setWorkflowStatus(storedWorkflow?.status ?? null);
    setWorkflowEvents(storedWorkflow?.events ?? []);
    setActiveRunId(null);
    setFieldsApproved(false);
    setParseStartTime(storedWorkflow?.parseStartTime ?? null);
    setParseProgress(storedWorkflow?.parseProgress ?? 71);
    activeWorkflowJobRef.current = storedWorkflow?.jobId ?? null;
    if (workflowPollingRef.current) {
      clearTimeout(workflowPollingRef.current);
      workflowPollingRef.current = null;
    }

    void Promise.all([
      recordApi.files(projectId),
      recordApi.fieldsByFile(projectId)
    ]).then(async ([projectFiles, projectFieldSets]) => {
      if (cancelled) return;
      const eventEntries = await Promise.all(
        projectFiles.map(async (file) => {
          try {
            const events = await recordApi.fileParseEvents(file.id);
            return [file.id, events] as const;
          } catch {
            return [file.id, EMPTY_PARSE_EVENTS] as const;
          }
        })
      );
      if (cancelled) return;
      setUploaded(projectFiles);
      setFieldSets(projectFieldSets);
      setParseEventSets(() => {
        const next = Object.fromEntries(eventEntries);
        if (storedWorkflow?.activeParseFileId && storedWorkflow.events.length > 0) {
          next[storedWorkflow.activeParseFileId] = mergeParseEvents(
            next[storedWorkflow.activeParseFileId] ?? [],
            storedWorkflow.events
          );
        }
        return next;
      });
      eventEntries.forEach(([fileId]) => syncedParseEventsRef.current.add(fileId));
      const firstId = storedWorkflow?.activeParseFileId && projectFiles.some((file) => file.id === storedWorkflow.activeParseFileId)
        ? storedWorkflow.activeParseFileId
        : projectFiles[0]?.id ?? "";
      const firstFile = projectFiles.find((file) => file.id === firstId) ?? projectFiles[0];
      const firstRunFile = firstFile?.parseRunId ? firstFile : projectFiles.find((file) => file.parseRunId);
      setActivePreviewFileId(firstId);
      setActiveParseFileId(firstId);
      setActiveRunId(firstRunFile?.parseRunId ?? null);
      setFieldsApproved(Boolean(firstFile?.fieldsApproved));
      const completedRunFile = getCompletedExtractionRunFile(projectFiles);
      const hasRunningFile = projectFiles.some((file) => file.parseStatus === "解析中");
      if (completedRunFile && !hasRunningFile) {
        const completedFileEvents = eventEntries.find(([fileId]) => fileId === completedRunFile.id)?.[1] ?? [];
        setWorkflowJobId(storedWorkflow?.jobId ?? completedRunFile.parseJobId ?? `persisted-${completedRunFile.parseRunId}`);
        setWorkflowStatus("succeeded");
        setWorkflowEvents(buildCompletedWorkflowEvents(completedFileEvents));
        activeWorkflowJobRef.current = null;
      } else if (storedWorkflow?.jobId && (storedWorkflow.status === "queued" || storedWorkflow.status === "running")) {
        pollWorkflowJob(storedWorkflow.jobId);
      }
    }).catch(() => {
      if (cancelled) return;
      setNotice("读取当前项目原始记录失败，请确认 Core API 可用。");
    });

    return () => {
      cancelled = true;
    };
  // pollWorkflowJob is intentionally excluded: this effect restores one project snapshot
  // on project change; adding the function would reload files on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, workflowPollingRef]);

  useEffect(() => {
    const fileIds = uploaded.map((file) => file.id).filter((fileId) => !syncedParseEventsRef.current.has(fileId));
    if (fileIds.length === 0) return;

    let cancelled = false;

    void Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const events = await recordApi.fileParseEvents(fileId);
          return events.length > 0 ? { fileId, events } : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const syncedEvents = results.filter((result): result is { fileId: string; events: ParseEvent[] } => Boolean(result));
      if (syncedEvents.length === 0) return;
      setParseEventSets((current) => {
        const next = { ...current };
        syncedEvents.forEach(({ fileId, events }) => {
          syncedParseEventsRef.current.add(fileId);
          next[fileId] = events;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [uploaded]);

  useEffect(() => {
    if (!previewFile) return;
    if (previewFile.parseRunId) setActiveRunId(previewFile.parseRunId);
    setFieldsApproved(Boolean(previewFile.fieldsApproved) || devMockApproved);
  }, [devMockApproved, previewFile]);

  useEffect(() => {
    return () => {
      if (workflowPollingRef.current) {
        clearTimeout(workflowPollingRef.current);
        workflowPollingRef.current = null;
      }
      activeWorkflowJobRef.current = null;
      Object.values(previewAssetsRef.current).forEach((asset) => {
        if (asset.url) URL.revokeObjectURL(asset.url);
      });
      uploadQueueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [workflowPollingRef]);

  // Start parse timer when first "解析中" file appears
  const startTimeRef = useRef(false);
  useEffect(() => {
    if (activeCount > 0 && !parseStartTime) {
      setParseStartTime(nowTime());
      startTimeRef.current = true;
    }
    if (activeCount === 0 && successCount > 0 && startTimeRef.current) {
      startTimeRef.current = false;
      setParseProgress(100);
    }
  }, [activeCount, successCount, parseStartTime]);

  async function retryAllFailed() {
    if (retryingAllFailed || failedFiles.length === 0) return;
    setRetryingAllFailed(true);
    setUploaded((current) =>
      current.map((file) => (file.parseStatus === "解析失败" ? { ...file, parseStatus: "解析中" as const } : file))
    );
    setParseEventSets((current) => {
      const next = { ...current };
      failedFiles.forEach((file) => {
        next[file.id] = [...(next[file.id] ?? []), { time: nowTime(), label: "重新进入解析队列", state: "active" }];
      });
      return next;
    });
    setNotice("全部失败文件已重新进入解析队列。");
    try {
      await Promise.all(failedFiles.map((file) => recordApi.updateFileStatus(file.id, "解析中")));
      startGenReportWorkflow({ force: true, focusFileId: failedFiles[0]?.id, reason: "全部失败文件重新进入解析队列" });
    } catch {
      setNotice("批量重试接口暂不可用，已先在当前页面重新入队。");
    } finally {
      setRetryingAllFailed(false);
    }
  }

  async function reparseFile(fileId: string) {
    if (retryingFileIds.has(fileId)) return;
    const file = uploadedRef.current.find((item) => item.id === fileId);
    if (!file) return;
    setRetryingFileIds((current) => new Set(current).add(fileId));
    setUploaded((current) =>
      current.map((item) => (item.id === fileId ? { ...item, parseStatus: "解析中" as const } : item))
    );
    setFieldSets((current) => ({ ...current, [fileId]: [] }));
    const event: ParseEvent = {
      time: nowTime(),
      label: "已停止上一次前端进度监听，重新发起解析",
      state: "active"
    };
    setParseEventSets((current) => ({
      ...current,
      [fileId]: mergeParseEvents(current[fileId] ?? [], [event])
    }));
    setActiveParseFileId(fileId);
    setActivePreviewFileId(fileId);
    setParseStartTime(nowTime());
    setParseProgress(71);
    setNotice(`${file.name} 已重新进入解析队列。`);
    try {
      await recordApi.updateFileStatus(fileId, "解析中");
      startGenReportWorkflow({ force: true, focusFileId: fileId, reason: `${file.name} 重新解析` });
    } catch {
      setNotice("重新解析接口暂不可用，已先在当前页面重新入队。");
    } finally {
      setRetryingFileIds((current) => {
        const next = new Set(current);
        next.delete(fileId);
        return next;
      });
    }
  }

  function openFieldEditor(field: ExtractedField) {
    setActiveFieldId(field.id);
    setDraftValue(field.value);
  }

  function switchPreviewFile(direction: -1 | 1) {
    setActivePreviewFileId((currentId) => {
      if (uploaded.length === 0) return "";
      const currentIndex = uploaded.findIndex((file) => file.id === currentId);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = Math.min(uploaded.length - 1, Math.max(0, safeIndex + direction));
      return uploaded[nextIndex]?.id ?? currentId;
    });
  }

  async function saveActiveField() {
    if (!activeFieldId || savingField) return;
    setSavingField(true);
    setFieldSets((current) => ({
      ...current,
      [activePreviewFileId]: (current[activePreviewFileId] ?? []).map((field) =>
        field.id === activeFieldId ? { ...field, value: draftValue, confidence: Math.max(field.confidence, 99) } : field
      )
    }));
    setFieldsApproved(false);
    setNotice("字段值已由人工修正，来源将标记为人工校核。");
    try {
      const targetRunId = previewFile?.parseRunId ?? activeRunId;
      if (targetRunId && !targetRunId.startsWith("dev-mock-run-")) {
        const field = (fieldSets[activePreviewFileId] ?? []).find((f) => f.id === activeFieldId);
        await genReportApi.setRunField(targetRunId, field?.section ?? "main", activeField?.name ?? "", draftValue);
      } else {
        await recordApi.updateField(activePreviewFileId, activeFieldId, draftValue);
      }
      await refreshProjectRecords();
    } catch {
      setNotice("字段保存接口暂不可用，已先保存在当前页面。");
    } finally {
      setSavingField(false);
      setActiveFieldId(null);
    }
  }

  async function saveAllFields() {
    if (savingAllFields || !previewFile) return;
    const fields = fieldSets[activePreviewFileId] ?? [];
    if (fields.length === 0) {
      setAllFieldsOpen(false);
      return;
    }
    setSavingAllFields(true);
    setFieldsApproved(false);
    try {
      const targetRunId = previewFile.parseRunId ?? activeRunId;
      if (targetRunId && !targetRunId.startsWith("dev-mock-run-")) {
        let failedCount = 0;
        for (const field of fields) {
          const result = await genReportApi.setRunField(targetRunId, field.section ?? "main", field.name, field.value);
          if (result.status !== "ok") failedCount += 1;
        }
        if (failedCount > 0) {
          setNotice(`有 ${failedCount} 个字段未保存成功，请检查 section 或字段名。`);
          return;
        }
      } else {
        await Promise.all(fields.map((field) => recordApi.updateField(activePreviewFileId, field.id, field.value)));
      }
      await refreshProjectRecords();
      setAllFieldsOpen(false);
      setNotice("字段修改已保存，审核状态已重置，请重新审核后生成报告。");
    } catch {
      setNotice("字段保存接口暂不可用，请稍后重试。");
    } finally {
      setSavingAllFields(false);
    }
  }

  function updateFieldValue(fieldId: string, value: string) {
    setFieldSets((current) => ({
      ...current,
      [activePreviewFileId]: (current[activePreviewFileId] ?? []).map((field) =>
        field.id === fieldId ? { ...field, value, confidence: Math.max(field.confidence, 99) } : field
      )
    }));
    setFieldsApproved(false);
  }

  async function updateFileType(fileId: string, detectedType: DetectedType) {
    if (updatingTypeFileId) return;
    setUpdatingTypeFileId(fileId);
    setUploaded((current) =>
      current.map((file) => (file.id === fileId ? { ...file, detectedType, typeConfirmed: true } : file))
    );
    setNotice("检测类型已人工调整为 " + detectedType + "，来源标记为人工确认。");
    try {
      await recordApi.updateFileType(fileId, detectedType);
    } catch {
      setNotice("检测类型接口暂不可用，已先保存在当前页面。");
    } finally {
      setUpdatingTypeFileId(null);
      setEditingTypeFileId(null);
      setTypeSearch("");
    }
  }

  function openManualEntry(fileId: string) {
    setManualEntryFileId(fileId);
    setManualForm({ name: "", value: "" });
    setManualEntryOpen(true);
  }

  async function submitManualEntry() {
    if (!manualForm.name.trim() || !manualForm.value.trim() || savingManualEntry) return;
    setSavingManualEntry(true);
    const targetFileId = manualEntryFileId ?? activePreviewFileId;
    setFieldSets((current) => ({
      ...current,
      [targetFileId]: [
        ...(current[targetFileId] ?? []),
        { id: `${targetFileId}-manual-${Date.now()}`, name: manualForm.name.trim(), value: manualForm.value.trim(), confidence: 100 }
      ]
    }));
    setFieldsApproved(false);
    if (manualEntryFileId) {
      setUploaded((current) =>
        current.map((file) => (file.id === manualEntryFileId ? { ...file, parseStatus: "解析成功" as const } : file))
      );
      setActivePreviewFileId(manualEntryFileId);
    }
    setNotice(`已手动录入字段「${manualForm.name}」，文件状态更新为解析成功。`);
    try {
      await recordApi.addManualField(targetFileId, manualForm.name.trim(), manualForm.value.trim());
      await refreshProjectRecords();
    } catch {
      setNotice("手动录入接口暂不可用，已先保存在当前页面。");
    } finally {
      setSavingManualEntry(false);
      setManualEntryOpen(false);
      setManualEntryFileId(null);
    }
  }

  function createQueueItems(selectedFiles: File[]) {
    return selectedFiles.map((file) => ({
      id: createId("upload"),
      name: file.webkitRelativePath || file.name,
      originalName: file.webkitRelativePath || file.name,
      type: getFileType(file.name),
      size: formatFileSize(file.size),
      progress: selectedFiles.length === 1 ? 100 : 12,
      detectedType: inferDetectedType(file.webkitRelativePath || file.name),
      file,
      previewUrl: URL.createObjectURL(file),
      mimeType: file.type
    }));
  }

  async function commitUploads(items: UploadQueueItem[]) {
    if (!currentProject?.id) {
      setNotice("请先选择项目，再上传原始记录。");
      return;
    }
    const now = new Date();
    const uploadTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${nowTime().slice(0, 5)}`;
    let newFiles: RawFile[] = items.map((item) => ({
      id: createId("f"),
      projectId: currentProject.id,
      name: item.name,
      type: item.type,
      size: item.size,
      uploadedAt: uploadTime,
      parseStatus: "解析中",
      detectedType: item.detectedType,
      typeConfirmed: false
    }));
    let apiFields: Record<string, ExtractedField[]> | null = null;
    let apiEvents: Record<string, ParseEvent[]> | null = null;

    try {
      // Send actual file content via multipart when available.
      const actualFiles = items.map((item) => item.file).filter(Boolean);
      if (actualFiles.length > 0) {
        const response = await recordApi.uploadFilesWithContent(currentProject.id, actualFiles);
        newFiles = response.files;
        apiFields = response.fields;
        apiEvents = response.parseEvents;
      } else {
        // Fallback: JSON-only upload (no actual file content).
        const response = await recordApi.uploadFiles(
          currentProject.id,
          items.map((item) => ({
            name: item.name,
            type: item.type,
            size: item.size,
            detectedType: item.detectedType
          }))
        );
        newFiles = response.files;
        apiFields = response.fields;
        apiEvents = response.parseEvents;
      }
    } catch {
      setNotice("后端上传接口暂不可用，文件未写入数据库。请稍后重试。");
      return;
    }

    setUploaded((current) => [...current, ...newFiles]);
    setFieldSets((current) => {
      const next = { ...current };
      newFiles.forEach((file) => {
        const uploadedFields = apiFields?.[file.id] ?? EMPTY_EXTRACTED_FIELDS;
        next[file.id] = file.parseStatus === "解析成功" ? uploadedFields : [];
      });
      return next;
    });
    setParseEventSets((current) => {
      const next = { ...current };
      newFiles.forEach((file) => {
        next[file.id] = apiEvents?.[file.id] ?? EMPTY_PARSE_EVENTS;
      });
      return next;
    });
    const firstId = newFiles[0]?.id;
    setPreviewAssets((current) => {
      const next = { ...current };
      newFiles.forEach((file, index) => {
        const item = items[index];
        if (!item) return;
        next[file.id] = {
          name: item.name,
          originalName: item.originalName,
          type: item.type,
          size: item.size,
          url: item.previewUrl,
          mimeType: item.mimeType
        };
      });
      return next;
    });
    if (firstId) {
      setActivePreviewFileId(firstId);
      setActiveParseFileId(firstId);
    }
    setParseStartTime(nowTime());
    setParseProgress((progress) => Math.max(progress, 76));
    setNotice(
      newFiles.length === 1
        ? `${newFiles[0].name} 上传完毕，已进入解析队列。`
        : `${newFiles.length} 个文件已按当前顺序进入解析队列，后续报告将按该顺序组织附件与章节。`
    );
  }

  async function handleSelectedFiles(fileList: FileList | File[]) {
    if (directUploading || uploadingQueue) return;
    const selectedFiles = Array.from(fileList);
    if (selectedFiles.length === 0) return;
    const queueItems = createQueueItems(selectedFiles);
    if (uploadModalOpen) {
      setUploadQueue((current) => [...current, ...queueItems]);
      setNotice(`已追加 ${queueItems.length} 个文件到批量上传队列，请确认顺序后开始解析。`);
      return;
    }
    if (queueItems.length === 1) {
      setDirectUploading(true);
      try {
        await commitUploads(queueItems);
        startGenReportWorkflow();
      } finally {
        setDirectUploading(false);
      }
      setNotice(`${queueItems[0].name} 上传进度 100%，文件校验通过并已进入解析队列。`);
      return;
    }
    setUploadQueue(queueItems);
    setUploadModalOpen(true);
    setNotice(`已选择 ${queueItems.length} 个文件，请确认顺序后开始解析。`);
  }

  function updateQueueName(itemId: string, name: string) {
    setUploadQueue((current) => current.map((item) => (item.id === itemId ? { ...item, name } : item)));
  }

  function deleteQueueItem(itemId: string) {
    setUploadQueue((current) => {
      const removed = current.find((item) => item.id === itemId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== itemId);
    });
  }

  function moveQueueItem(sourceId: string, targetId: string, position: "before" | "after" = "before") {
    if (sourceId === targetId) return;
    setUploadQueue((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const targetAfterRemoval = next.findIndex((item) => item.id === targetId);
      next.splice(position === "after" ? targetAfterRemoval + 1 : targetAfterRemoval, 0, moved);
      return next;
    });
  }

  async function confirmBatchUpload() {
    if (!queueReady || uploadingQueue) return;
    setUploadingQueue(true);
    const readyItems = uploadQueue.map((item) => ({ ...item, progress: 100 }));
    try {
      await commitUploads(readyItems);
      setUploadQueue([]);
      setUploadModalOpen(false);
      // Trigger gen-report workflow after files are committed.
      startGenReportWorkflow();
    } finally {
      setUploadingQueue(false);
    }
  }

  async function deleteFile(fileId: string) {
    if (deletingFileIds.has(fileId)) return;
    setDeletingFileIds((current) => new Set(current).add(fileId));
    try {
      await recordApi.deleteFile(fileId);
    } catch {
      setNotice("删除接口暂不可用，已先从当前页面移除。");
    }
    setUploaded((current) => current.filter((file) => file.id !== fileId));
    setFieldSets((current) => {
      const next = { ...current };
      delete next[fileId];
      return next;
    });
    setParseEventSets((current) => {
      const next = { ...current };
      delete next[fileId];
      return next;
    });
    setPreviewAssets((current) => {
      const next = { ...current };
      if (next[fileId]?.url) URL.revokeObjectURL(next[fileId].url);
      delete next[fileId];
      return next;
    });
    setNotice("已模拟删除未锁定文件，并写入操作日志。");
    setDeletingFileIds((current) => {
      const next = new Set(current);
      next.delete(fileId);
      return next;
    });
  }

  function cancelBatchUpload() {
    if (uploadingQueue) return;
    uploadQueue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setUploadModalOpen(false);
    setUploadQueue([]);
    setDraggingQueueId(null);
    setQueueDropMarker(null);
  }

  function openUploadedPreview(file: RawFile) {
    const asset = previewAssets[file.id] ?? {
      name: file.name,
      originalName: file.name,
      type: file.type,
      size: file.size
    };
    setPreviewingAsset(asset);
    setPreviewingFileId(file.id);
    setNotice(`${file.name} 已打开预览。`);
    void recordApi
      .previewFile(file.id)
      .then((response) => setNotice(response.message))
      .catch(() => undefined)
      .finally(() => setPreviewingFileId(null));
  }

  function openQueuePreview(item: UploadQueueItem) {
    setPreviewingAsset({
      name: item.name,
      originalName: item.originalName,
      type: item.type,
      size: item.size,
      url: item.previewUrl,
      mimeType: item.mimeType
    });
    setNotice(`${item.name} 已打开上传前预览。`);
  }

  async function handleExportResults() {
    if (exportingResults) return;
    if (!currentProject?.id) {
      setNotice("请先选择项目，再导出原始记录。");
      return;
    }
    setExportingResults(true);
    setExportToast(false);
    setNotice("正在准备解析结果导出文件...");
    try {
      const response = await recordApi.exportResults(currentProject.id);
      setNotice(`已导出解析结果：${response.fileName}。`);
      setExportToast(true);
      setTimeout(() => setExportToast(false), 2500);
    } catch {
      setNotice("解析结果导出接口暂不可用，请确认 Core API 服务状态。");
    } finally {
      setExportingResults(false);
    }
  }

  function stopWorkflowPolling() {
    if (workflowPollingRef.current) {
      clearTimeout(workflowPollingRef.current);
      workflowPollingRef.current = null;
    }
    activeWorkflowJobRef.current = null;
  }

  function startGenReportWorkflow(options: { force?: boolean; focusFileId?: string; reason?: string } = {}) {
    if (workflowInFlight && !options.force) return;
    if (!currentProject?.id) {
      setNotice("请先在侧边栏选择一个项目后再上传文件并生成报告。");
      return;
    }
    const projectId = currentProject.id;

    if (options.force) stopWorkflowPolling();
    if (options.force) clearStoredWorkflow(projectId);
    setWorkflowStatus("queued");
    setWorkflowJobId(null);
    setActiveRunId(null);
    setFieldsApproved(false);
    setWorkflowEvents(options.reason ? [{ time: nowTime(), label: options.reason, state: "active" }] : []);
    seenProgressMessagesRef.current.clear();
    if (options.focusFileId) {
      setActiveParseFileId(options.focusFileId);
      setActivePreviewFileId(options.focusFileId);
    }

    genReportApi.extractProjectFields(projectId).then((job) => {
      activeWorkflowJobRef.current = job.jobId;
      setWorkflowJobId(job.jobId);
      setWorkflowStatus(job.status);
      pollWorkflowJob(job.jobId);
    }).catch((err: unknown) => {
      setWorkflowStatus("failed");
      const msg = err instanceof Error ? err.message : String(err);
      setNotice(msg);
    });
  }

  function finishRecordExtraction(job: WorkflowJob, message = "字段提取完成，结构化结果已写入字段库。") {
    setWorkflowStatus("succeeded");
    setNotice(message);
    const doneEvents: ParseEvent[] = [
      { time: nowTime(), label: "字段提取完成", state: "done" },
      { time: nowTime(), label: "结构化结果已写入字段库", state: "done" }
    ];
    setWorkflowEvents((prev) =>
      mergeParseEvents(
        prev.map((event) => ({ ...event, state: event.state === "active" ? "done" as const : event.state })),
        doneEvents
      )
    );
    const pendingFileIds = new Set(
      uploadedRef.current.filter((file) => file.parseStatus === "解析中").map((file) => file.id)
    );
    setUploaded((current) =>
      current.map((file) => (file.parseStatus === "解析中" ? { ...file, parseStatus: "解析成功" as const } : file))
    );
    setParseEventSets((current) => {
      if (pendingFileIds.size === 0) return current;
      const next = { ...current };
      pendingFileIds.forEach((fileId) => {
        next[fileId] = mergeParseEvents(
          (next[fileId] ?? []).map((event) => ({ ...event, state: event.state === "active" ? "done" as const : event.state })),
          doneEvents
        );
      });
      return next;
    });
    setParseProgress(100);
    workflowPollingRef.current = null;

    const runIds = Object.keys(job.runPaths);
    if (runIds.length > 0) {
      setActiveRunId(runIds[0]);
    }
    if (currentProject?.id) {
      void refreshProjectRecords(currentProject.id).catch(() => undefined);
    }
  }

  function pollWorkflowJob(jobId: string) {
    void genReportApi.getJob(jobId).then((job) => {
      if (activeWorkflowJobRef.current && activeWorkflowJobRef.current !== jobId) return;
      setWorkflowStatus(job.status);

      // Convert unseen progress events into timeline entries.
      const newEvents: ParseEvent[] = [];
      for (const evt of job.progressEvents) {
        const key = `${evt.at}-${evt.message}`;
        if (seenProgressMessagesRef.current.has(key)) continue;
        seenProgressMessagesRef.current.add(key);
        const time = new Date(evt.at).toLocaleTimeString("zh-CN", { hour12: false });
        newEvents.push({ time, label: evt.message, state: "done" });
      }
      // Mark the last one as active if workflow is still running.
      if (newEvents.length > 0 && (job.status === "running" || job.status === "queued")) {
        newEvents[newEvents.length - 1] = { ...newEvents[newEvents.length - 1], state: "active" };
      }
      if (newEvents.length > 0) {
        setWorkflowEvents((prev) => mergeParseEvents(prev, newEvents));
        setNotice(newEvents[newEvents.length - 1].label);
      }

      // Push workflow events into the active file's parse timeline.
      if (newEvents.length > 0 && activeParseFile) {
        setParseEventSets((current) => ({
          ...current,
          [activeParseFile.id]: mergeParseEvents(current[activeParseFile.id] ?? [], newEvents),
        }));
      }

      if (job.status === "running" || job.status === "queued") {
        // Capture first available run_id from runPaths for field editing.
        if (!activeRunId) {
          const runIds = Object.keys(job.runPaths);
          if (runIds.length > 0) {
            const runId = runIds[0];
            setActiveRunId(runId);
          }
        }
        workflowPollingRef.current = setTimeout(() => pollWorkflowJob(jobId), 2000);
      } else if (job.status === "succeeded") {
        finishRecordExtraction(job);
      } else if (job.status === "failed") {
        if (isExtractionCompleteJob(job)) {
          finishRecordExtraction(job, "字段提取已完成，后续人工审核不影响原始记录解析结果。");
          return;
        }
        setNotice(`工作流失败：${job.error ?? job.message}`);
        const failedEvent: ParseEvent = { time: nowTime(), label: job.error ?? job.message, state: "active" };
        setWorkflowEvents((prev) => mergeParseEvents(prev, [failedEvent]));
        const pendingFileIds = new Set(
          uploadedRef.current.filter((file) => file.parseStatus === "解析中").map((file) => file.id)
        );
        if (pendingFileIds.size > 0) {
          setUploaded((current) =>
            current.map((file) => (pendingFileIds.has(file.id) ? { ...file, parseStatus: "解析失败" as const } : file))
          );
          setParseEventSets((current) => {
            const next = { ...current };
            pendingFileIds.forEach((fileId) => {
              next[fileId] = mergeParseEvents(next[fileId] ?? [], [failedEvent]);
            });
            return next;
          });
        }
        workflowPollingRef.current = null;
      }
    }).catch(() => {
      if (activeWorkflowJobRef.current && activeWorkflowJobRef.current !== jobId) return;
      setWorkflowStatus("failed");
      const event: ParseEvent = {
        time: nowTime(),
        label: "查询进度失败，可能是后端服务重启导致任务句柄丢失。请点击重新解析。",
        state: "active"
      };
      setWorkflowEvents((prev) => mergeParseEvents(prev, [event]));
      setNotice(event.label);
    });
  }

  // DEV ONLY: front-end workflow shortcut for local UI testing.
  // This deliberately does not call Core API or write database records.
  // TODO: remove this helper and its button before production release.
  function seedDevelopmentMockWorkflow() {
    const projectId = currentProject?.id ?? "dev-project";
    const mockFile: RawFile = {
      id: createId("dev-file"),
      projectId,
      name: "开发调试原始记录.docx",
      type: "Word",
      size: "128 KB",
      uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      parseStatus: "解析成功",
      detectedType: "几何精度",
      typeConfirmed: true,
    };
    const targetFiles = uploaded.length > 0
      ? uploaded.map((file) => ({ ...file, parseStatus: "解析成功" as const }))
      : [mockFile];
    const targetFileIds = targetFiles.map((file) => file.id);
    const mockFields: ExtractedField[] = [
      { id: "dev-main-inspection-item", name: "{{inspection_item}}", value: "平面度", confidence: 98, section: "main" },
      { id: "dev-main-measure-position", name: "{{measure_position}}", value: "左侧工作面", confidence: 96, section: "main" },
      { id: "dev-main-actual-value", name: "{{actual_value}}", value: "0.012 mm", confidence: 98, section: "main" },
      { id: "dev-main-standard-value", name: "{{standard_value}}", value: "0.020 mm", confidence: 97, section: "main" },
      { id: "dev-main-unit", name: "{{unit}}", value: "mm", confidence: 100, section: "main" },
      { id: "dev-main-judgement", name: "{{judgement}}", value: "合格", confidence: 99, section: "main" },
      { id: "dev-geo-attachment", name: "{{geometry_attachment_no}}", value: "2", confidence: 95, section: "geometry_precision" },
      { id: "dev-geo-item", name: "{{geometry_item_no}}", value: "G1", confidence: 93, section: "geometry_precision" },
      { id: "dev-geo-note", name: "{{geometry_note_text}}", value: "检测曲线见图1。", confidence: 91, section: "geometry_precision" },
      { id: "dev-pos-axis", name: "{{position_axis}}", value: "X轴", confidence: 95, section: "position_precision" },
      { id: "dev-pos-target", name: "{{position_target}}", value: "300.000", confidence: 96, section: "position_precision" },
      { id: "dev-pos-conclusion", name: "{{position_conclusion}}", value: "符合", confidence: 97, section: "position_precision" },
    ];
    const mockEvents: ParseEvent[] = [
      { time: nowTime(), label: "开发 Mock：上传完成", state: "done" },
      { time: nowTime(), label: "开发 Mock：字段提取完成", state: "done" },
      { time: nowTime(), label: "开发 Mock：结构化结果已写入前端临时状态", state: "done" },
    ];

    setWorkflowJobId("dev-mock-job");
    setActiveRunId(`dev-mock-run-${projectId}`);
    setFieldsApproved(false);
    setWorkflowStatus("succeeded");
    setWorkflowEvents([
      { time: nowTime(), label: "开发 Mock：Validate completed", state: "done" },
      { time: nowTime(), label: "开发 Mock：Prepare completed", state: "done" },
      { time: nowTime(), label: "开发 Mock：Extract completed", state: "done" },
      { time: nowTime(), label: "开发 Mock：Extracted: 3 section(s), 0 issue(s)", state: "done" },
    ]);
    setUploaded(targetFiles);
    setFieldSets(Object.fromEntries(targetFileIds.map((fileId) => [fileId, mockFields])));
    setParseEventSets(Object.fromEntries(targetFileIds.map((fileId) => [fileId, mockEvents])));
    setActivePreviewFileId(targetFileIds[0] ?? "");
    setActiveParseFileId(targetFileIds[0] ?? "");
    setParseProgress(100);
    setNotice("开发 Mock 已注入：仅用于前端流程联调，未写入数据库，发布前需删除。");
  }

  async function approveExtractedFields() {
    if (approvingFields || previewFieldsApproved) return;
    const targetRunId = previewFile?.parseRunId ?? activeRunId;
    if (!targetRunId || targetRunId.startsWith("dev-mock-run-")) {
      setFieldsApproved(true);
      setNotice("字段人工审核已通过，可点击查看报告进入报告生成页面。");
      return;
    }
    if (!previewFile?.parseRunPath) {
      setNotice("该文件缺少历史工作区信息，请重新解析后再审核。");
      return;
    }
    setApprovingFields(true);
    try {
      await genReportApi.approveRun(targetRunId);
      await refreshProjectRecords();
      setNotice("字段人工审核已通过，可点击查看报告进入报告生成页面。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "字段审核通过接口调用失败，请稍后重试。");
    } finally {
      setApprovingFields(false);
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow="RR 原始记录上传与解析"
        title="原始记录上传"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={handleExportResults} loading={exportingResults} loadingText="导出中">
              <Download className="size-4" />
              导出结果
            </Button>
            <Button variant="ghost" onClick={seedDevelopmentMockWorkflow} title="开发调试入口：仅写入前端临时状态，发布前删除">
              <Eye className="size-4" />
              开发 Mock
            </Button>
            {generateReady ? (
              <Link href={reportHref}>
                <Button variant="primary">
                  查看报告
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="primary" disabled loading={activeCount > 0} loadingText="解析中">
                {successfulFields.length > 0 && !activeReportRunId ? "审核通过后查看报告" : "生成报告"}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3.5 min-[1180px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-3.5">
          <Card>
            <div className="grid gap-2.5 lg:grid-cols-4">
              {steps.map((step, index) => (
                <div
                  key={step.label}
                  className={cn(
                    "rounded-lg border p-2.5",
                    step.state === "active" ? "border-ink-black bg-mint-wash/45" : "border-ink-black/14"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid size-6 place-items-center rounded-md border border-ink-black text-xs">{index + 1}</span>
                    {step.state === "done" ? <CheckCircle2 className="size-4" /> : <StatusDot tone={step.state === "active" ? "active" : "neutral"} />}
                  </div>
                  <p className="mt-2 text-sm font-medium">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-warm-stone">{step.meta}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="min-h-[286px]">
            <div className="grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div
                className={cn(
                  "flex h-full flex-col rounded-lg border border-dashed p-4 transition",
                  dragOverUpload ? "border-ink-black bg-mint-wash/45 shadow-editorial" : "border-ink-black"
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverUpload(true);
                }}
                onDragLeave={() => setDragOverUpload(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverUpload(false);
                  void handleSelectedFiles(event.dataTransfer.files);
                }}
              >
                <UploadCloud className="mb-3 size-7" />
                <h2 className="serif text-[1.75rem] leading-tight">上传检测原始记录</h2>
                <p className="mt-2 text-sm leading-6 text-graphite">
                  支持拖拽 PDF、JPG、PNG、Word、Excel 到此区域；点击上传文件可一次选择多个文件，批量上传前可调整报告生成顺序。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => {
                    if (event.target.files) void handleSelectedFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()} loading={directUploading} loadingText="上传中" disabled={uploadingQueue}>
                    <FilePlus2 className="size-4" />
                    上传文件
                  </Button>
                  <span className="inline-flex items-center text-xs leading-5 text-warm-stone">
                    单文件直接入队，多文件进入排序确认。
                  </span>
                </div>
              </div>

              <div className="flex h-full flex-col rounded-lg border border-ink-black/14 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">当前项目</p>
                <p className="mt-2 font-medium">{currentProject?.name ?? "未选择项目"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-lg font-medium">{uploaded.length}</p>
                    <p className="text-warm-stone">文件</p>
                  </div>
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-lg font-medium">{successCount}</p>
                    <p className="text-warm-stone">成功</p>
                  </div>
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-lg font-medium">{activeCount}</p>
                    <p className="text-warm-stone">解析中</p>
                  </div>
                </div>
                <div className="mt-auto rounded-md border border-ink-black/12 bg-parchment-cream/60 p-2 text-xs leading-5 text-graphite">
                  系统根据文件名自动检测类型，识别失败时可手动调整。
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="serif text-[1.75rem] leading-tight">已上传文件</h2>
                <p className="mt-1 text-sm text-warm-stone">展示文件类型、检测类型、上传时间、解析状态和可执行操作。</p>
              </div>
              <Badge tone="neutral">必要字段 {requiredReady}/{requiredFields.length}</Badge>
            </div>
            <DataTable
              className="fit-table"
              columns={["22%", "9%", "10%", "16%", "18%", "14%", "11%"]}
              headers={["文件名", "类型", "大小", "上传时间", "检测类型", "解析状态", "操作"]}
            >
              {uploaded.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="py-10 text-center">
                    <div className="mx-auto max-w-md">
                      <p className="text-base font-medium text-ink-black">当前项目暂无已上传文件</p>
                      <p className="mt-2 text-sm leading-6 text-warm-stone">
                        请先在上方上传检测原始记录，上传成功后文件会保存在后端数据表中，再次进入项目仍可查看。
                      </p>
                    </div>
                  </Td>
                </tr>
              ) : uploaded.map((file) => (
                <tr key={file.id}>
                  <Td className="break-words text-center font-medium leading-5">{file.name}</Td>
                  <Td className="text-center">{file.type}</Td>
                  <Td className="text-center">{file.size}</Td>
                  <Td className="text-center">{file.uploadedAt}</Td>
                  <Td className="text-center">
                    {file.detectedType === "未识别" ? (
                      <button
                        type="button"
                        onClick={() => setEditingTypeFileId(file.id)}
                        className="max-w-full rounded-md border border-dashed border-[#b97400] px-1.5 py-0.5 text-xs leading-5 text-[#b97400] transition hover:bg-[#f4e3bd]"
                      >
                        未识别 / 点击选择
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="点击修改检测类型"
                        onClick={() => setEditingTypeFileId(file.id)}
                        className="max-w-full rounded-md border px-1.5 py-0.5 text-xs leading-5 transition hover:border-ink-black/40"
                        style={{
                          borderColor: "var(--color-ink-black)",
                          backgroundColor: file.typeConfirmed ? "var(--color-mint-wash)" : "transparent",
                          opacity: file.typeConfirmed ? 1 : 0.7
                        }}
                      >
                        {file.detectedType}
                        {file.typeConfirmed ? " ✓" : " (自动)"}
                      </button>
                    )}
                  </Td>
                  <Td>
                    <Badge className="mx-auto" tone={getTone(file.parseStatus)}>
                      <StatusDot tone={getTone(file.parseStatus)} />
                      {file.parseStatus}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5 justify-center">
                      <button
                        type="button"
                        title="预览文件"
                        disabled={previewingFileId === file.id}
                        onClick={() => openUploadedPreview(file)}
                        className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {previewingFileId === file.id ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
                      </button>
                      <button
                        type="button"
                        title={file.parseStatus === "解析失败" ? "重试解析" : "重新解析"}
                        disabled={retryingFileIds.has(file.id) || retryingAllFailed}
                        onClick={() => void reparseFile(file.id)}
                        className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {retryingFileIds.has(file.id) ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                      </button>
                      <button
                        type="button"
                        title="删除文件"
                        disabled={deletingFileIds.has(file.id)}
                        onClick={() => void deleteFile(file.id)}
                        className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {deletingFileIds.has(file.id) ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <div className="grid gap-3.5">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="serif text-[1.75rem] leading-tight">解析进度</h2>
                <Badge tone={workflowJobId ? "active" : "neutral"}>
                  {workflowJobId
                    ? workflowStatus === "succeeded"
                      ? `提取完成 · ${fieldCount} 字段`
                      : workflowStatus === "failed"
                      ? "工作流失败"
                      : `工作流 ${workflowStatus === "queued" ? "排队中" : "进行中"}`
                    : `字段提取 ${activeParseProgress}%`}
                </Badge>
              </div>
              {workflowJobId ? (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {workflowStages.map((stage) => (
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
                            {workflowStages.indexOf(stage) + 1}
                          </span>
                        )}
                        <span className="text-xs font-medium">{stage.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-warm-stone">{stage.meta}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-warm-stone">开始</p>
                    <p className="mt-1">{activeParseStartTime ?? "--:--:--"}</p>
                  </div>
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-warm-stone">预计</p>
                    <p className="mt-1">{activeParseFile?.parseStatus === "解析中" ? `${activeParseProgress}%` : activeParseFile ? activeParseFile.parseStatus : "--"}</p>
                  </div>
                  <div className="rounded-md border border-ink-black/12 p-2">
                    <p className="text-warm-stone">已耗时</p>
                    <p className="mt-1">{activeParseElapsed ?? (activeParseStartTime ? "计算中" : "--")}</p>
                  </div>
                </div>
              )}

              {workflowJobId ? (
                <div className={cn("mt-3 rounded-md border p-2.5", workflowStatus === "succeeded" ? "border-ink-black/30 bg-mint-wash/55" : workflowStatus === "failed" ? "border-[#8b3228]/30 bg-[#f6d8d2]/55" : "border-ink-black/30 bg-parchment-cream/55")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {(workflowStatus === "running" || workflowStatus === "queued") ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : workflowStatus === "succeeded" ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : workflowStatus === "failed" ? (
                        <AlertTriangle className="size-3.5" />
                      ) : null}
                      字段提取工作流
                    </span>
                    <Badge tone={workflowStatus === "succeeded" ? "success" : workflowStatus === "failed" ? "danger" : "active"}>
                      {workflowStatus === "succeeded" ? "已完成" : workflowStatus === "failed" ? "失败" : "进行中"}
                    </Badge>
                  </div>
                  {workflowEvents.length > 0 ? (
                    <p className="mt-1.5 truncate text-xs text-graphite">{workflowEvents[workflowEvents.length - 1].label}</p>
                  ) : null}
                  <div className="mt-2 h-1 rounded-full bg-ink-black/10">
                    <div
                      className={cn("h-1 rounded-full transition-all", workflowStatus === "failed" ? "bg-[#8b3228]" : "bg-ink-black")}
                      style={{ width: `${workflowStatus === "succeeded" ? 100 : workflowStatus === "failed" ? 100 : 30}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid min-h-[230px] gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
                <div className="max-h-60 overflow-y-auto pr-1">
                  <div className="space-y-1.5">
                    {uploaded.map((file, index) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => setActiveParseFileId(file.id)}
                        className={cn(
                          "w-full rounded-md border px-2 py-2 text-left transition",
                          activeParseFile?.id === file.id
                            ? "border-ink-black bg-ink-black text-parchment-cream"
                            : "border-ink-black/12 bg-parchment-cream/45 hover:border-ink-black/40"
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{index + 1}. {file.name}</span>
                          <StatusDot tone={getTone(file.parseStatus)} />
                        </span>
                        <span className={cn("mt-1 block text-[11px]", activeParseFile?.id === file.id ? "text-parchment-cream/70" : "text-warm-stone")}>
                          {file.parseStatus} · {file.detectedType}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-lg border border-ink-black/12 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-warm-stone">当前任务 {activeParseIndex + 1 > 0 ? activeParseIndex + 1 : 0}/{uploaded.length}</p>
                      <p className="mt-1 truncate text-sm font-medium">{activeParseFile?.name ?? "暂无解析任务"}</p>
                    </div>
                    {activeParseFile ? <Badge tone={getTone(activeParseFile.parseStatus)}>{activeParseFile.parseStatus}</Badge> : null}
                  </div>
                  <div className="relative max-h-44 overflow-y-auto pr-1">
                    {activeParseEvents.map((event, index) => (
                      <div key={`${event.time}-${event.label}-${index}`} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
                        {index < activeParseEvents.length - 1 ? (
                          <span className="absolute bottom-0 left-[7.5px] top-6 w-px bg-ink-black/18" />
                        ) : null}
                        <span className="relative z-10 mt-1 grid size-4 place-items-center rounded-full bg-parchment-cream">
                          <StatusDot tone={event.state === "done" ? "success" : event.state === "active" ? "active" : "neutral"} />
                        </span>
                        <div className="min-w-0 rounded-md border border-ink-black/10 bg-parchment-cream/45 px-2.5 py-2">
                          <p className="text-xs text-warm-stone">{event.time}</p>
                          <p className="mt-1 text-sm leading-5 text-graphite">{event.label}</p>
                        </div>
                      </div>
                    ))}
                    {activeParseEvents.length === 0 ? (
                      <p className="rounded-md border border-ink-black/10 p-3 text-sm text-warm-stone">请选择左侧任务查看解析进展。</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {failedFiles.length > 0 ? (
            <Card className="border-ink-black bg-[#f6d8d2]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <h2 className="font-medium">解析失败处理</h2>
                  <p className="mt-1 text-sm leading-6 text-graphite">
                    {failedFiles[0].name}：图片模糊，表格边界无法识别。建议重新上传清晰文件、手动录入关键数据或联系管理员。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="danger" onClick={() => void retryAllFailed()} loading={retryingAllFailed} loadingText="重试中">
                      <RefreshCcw className="size-4" />
                      重试解析
                    </Button>
                    <Button variant="secondary" onClick={() => openManualEntry(failedFiles[0].id)} disabled={retryingAllFailed}>
                      手动录入
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border-ink-black bg-mint-wash/55">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4" />
                <p className="text-sm leading-6 text-graphite">必要字段已基本满足报告生成条件，可继续核对字段后生成报告。</p>
              </div>
            </Card>
          )}

        </div>

        <aside className="min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:self-start">
          <Card className="relative">
            <div className="flex items-center justify-between gap-3">
              <h2 className="serif text-[1.75rem] leading-tight">字段预览</h2>
              <Button
                variant="ghost"
                onClick={() => setAllFieldsOpen(true)}
                disabled={previewFileIsExtracting || editableFields.length === 0}
              >
                全部字段
                {editableFields.length > 0 ? (
                  <span className="ml-1 grid size-5 place-items-center rounded-full bg-ink-black text-[11px] text-parchment-cream">
                    {editableFields.length}
                  </span>
                ) : null}
              </Button>
            </div>
            <div className="mt-2 rounded-lg border border-ink-black/12 bg-parchment-cream/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="切换到上一个解析文件"
                  disabled={uploaded.length <= 1}
                  onClick={() => switchPreviewFile(-1)}
                  className="focus-ring grid size-7 shrink-0 place-items-center rounded-md border border-ink-black/15 text-graphite transition hover:border-ink-black disabled:opacity-35"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="min-w-0 text-center">
                  <p className="truncate text-sm font-medium">{previewFile?.name ?? "暂无解析文件"}</p>
                  <p className="mt-0.5 text-xs text-warm-stone">
                    当前文件 {uploaded.length > 0 ? previewFileIndex + 1 : 0}/{uploaded.length}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="切换到下一个解析文件"
                  disabled={uploaded.length <= 1}
                  onClick={() => switchPreviewFile(1)}
                  className="focus-ring grid size-7 shrink-0 place-items-center rounded-md border border-ink-black/15 text-graphite transition hover:border-ink-black disabled:opacity-35"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-warm-stone">
              {previewFileIsExtracting
                ? "字段正在从原始记录中提取，完成后将自动展示。"
                : activeRunId
                ? "点击字段可人工修正，保存后同步至报告工作区。"
                : "点击字段可人工修正，保存后字段来源标记为人工校核。"}
            </p>
            {previewFile?.parseStatus === "解析成功" && !previewRunReady ? (
              <p className="mt-2 rounded-md border border-[#b88200]/35 bg-[#fff7dd] p-2 text-xs leading-5 text-[#7a5700]">
                该文件缺少历史 run 或工作区信息，请重新解析后再审核。
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {previewFileIsExtracting ? (
                <div className="rounded-lg border border-ink-black/12 bg-parchment-cream/55 p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <div>
                      <p className="text-sm font-medium">正在提取字段</p>
                      <p className="mt-0.5 text-xs text-warm-stone">系统正在执行结构化解析，字段结果暂不展示。</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="animate-pulse rounded-lg border border-ink-black/10 bg-parchment-cream/70 p-2"
                        style={{ animationDelay: `${item * 120}ms` }}
                      >
                        <div className="h-2 w-24 rounded-full bg-ink-black/12" />
                        <div className="mt-2 h-3 rounded-full bg-ink-black/18" />
                        <div className="mt-2 h-1 rounded-full bg-ink-black/10" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : previewFieldGroups.length > 0 ? (
                <>
                {previewFieldGroups.map((group) => (
                  <div key={group.section}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-[0.08em] text-graphite">{group.label}</span>
                      <span className="text-[11px] text-warm-stone">
                        {group.fields.length}/{sectionGroupedFields.find((item) => item.section === group.section)?.fields.length ?? group.fields.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.fields.map((field) => (
                        <button
                          type="button"
                          key={field.id}
                          onClick={() => openFieldEditor(field)}
                          className="w-full rounded-lg border border-ink-black/12 p-2 text-left transition hover:border-ink-black hover:bg-parchment-cream/70"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs text-warm-stone">{field.name}</p>
                              <p className="mt-0.5 truncate text-sm font-medium">{field.value || "—"}</p>
                            </div>
                            <span className={cn("shrink-0 text-xs", field.confidence >= 90 ? "text-ink-black" : "text-[#8b3228]")}>
                              {field.confidence}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-ink-black/10">
                            <div className="h-1 rounded-full bg-ink-black" style={{ width: `${field.confidence}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {hiddenPreviewFieldCount > 0 ? (
                  <div className="grid gap-2 rounded-lg border border-dashed border-ink-black/25 bg-parchment-cream/55 p-2.5">
                    <div className="grid gap-2">
                      <p className="px-1 text-xs leading-5 text-graphite">
                        还有 {hiddenPreviewFieldCount} 个字段未在预览中展示。
                      </p>
                      <Button className="w-full" variant="ghost" onClick={() => setAllFieldsOpen(true)}>
                        <Eye className="size-4" />
                        查看全部字段
                      </Button>
                    </div>
                    <div className="border-t border-dashed border-ink-black/25 pt-2">
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() => void approveExtractedFields()}
                      disabled={editableFields.length === 0 || previewFieldsApproved || !previewRunReady}
                      loading={approvingFields}
                      loadingText="审核中"
                    >
                      {previewFieldsApproved ? <CheckCircle2 className="size-4" /> : <Check className="size-4" />}
                      {previewFieldsApproved ? "已审核通过" : "审核通过"}
                    </Button>
                    </div>
                  </div>
                ) : null}
                {hiddenPreviewFieldCount === 0 && editableFields.length > 0 ? (
                  <div className="border-t border-dashed border-ink-black/25 pt-2">
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() => void approveExtractedFields()}
                      disabled={previewFieldsApproved || !previewRunReady}
                      loading={approvingFields}
                      loadingText="审核中"
                    >
                      {previewFieldsApproved ? <CheckCircle2 className="size-4" /> : <Check className="size-4" />}
                      {previewFieldsApproved ? "已审核通过" : "审核通过"}
                    </Button>
                  </div>
                ) : null}
                </>
              ) : (
                <p className="rounded-md border border-ink-black/10 p-3 text-sm text-warm-stone">
                  {previewFile?.parseStatus === "解析成功"
                    ? "字段提取完成，但暂无可预览字段。"
                    : "暂无提取字段，请先上传文件并开始解析。"}
                </p>
              )}
            </div>
            {activeField ? (
              <div className="absolute left-3 right-3 top-20 z-10 rounded-lg border border-ink-black bg-parchment-cream p-3 shadow-editorial">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-warm-stone">人工修改字段</p>
                    <h3 className="font-medium">{activeField.name}</h3>
                  </div>
                  <button type="button" aria-label="关闭字段编辑" onClick={() => setActiveFieldId(null)}>
                    <X className="size-4" />
                  </button>
                </div>
                <Input className="mt-3 w-full" value={draftValue} onChange={(event) => setDraftValue(event.target.value)} />
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setActiveFieldId(null)} disabled={savingField}>取消</Button>
                  <Button variant="primary" onClick={() => void saveActiveField()} loading={savingField} loadingText="保存中">
                    <Edit3 className="size-4" />
                    保存
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </aside>
      </div>

      {uploadModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={cancelBatchUpload}>
          <div
            className="flex max-h-[82vh] w-full max-w-[760px] flex-col rounded-xl border border-ink-black bg-parchment-cream p-4 shadow-editorial"
            onClick={(event) => event.stopPropagation()}
            onDragOver={(event) => {
              if (!draggingQueueId || uploadingQueue) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setQueueDropMarker(getQueueDropMarker(uploadQueueListRef.current, event.clientY, draggingQueueId));
            }}
            onDrop={(event) => {
              if (!draggingQueueId || uploadingQueue) return;
              event.preventDefault();
              const marker = queueDropMarker ?? getQueueDropMarker(uploadQueueListRef.current, event.clientY, draggingQueueId);
              if (marker) {
                moveQueueItem(draggingQueueId, marker.targetId, marker.position);
              }
              setDraggingQueueId(null);
              setQueueDropMarker(null);
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Upload Queue</p>
                <h2 className="serif text-[1.8rem] leading-tight">批量上传顺序确认</h2>
                <p className="mt-1 text-sm text-graphite">拖动文件调整顺序，该顺序将用于后续报告章节和附件排序。</p>
              </div>
              <button type="button" aria-label="关闭批量上传" disabled={uploadingQueue} onClick={cancelBatchUpload} className="shrink-0 disabled:cursor-not-allowed disabled:opacity-45">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              <div ref={uploadQueueListRef} className="space-y-2">
                {uploadQueue.map((item, index) => {
                  const showBefore = queueDropMarker?.targetId === item.id && queueDropMarker.position === "before";
                  const showAfter = queueDropMarker?.targetId === item.id && queueDropMarker.position === "after";
                  const isDragging = draggingQueueId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "space-y-2 transition-all duration-200",
                        isDragging && "h-0 overflow-hidden opacity-0"
                      )}
                    >
                      {showBefore ? (
                        <div className="h-2 rounded-full border border-dashed border-ink-black/40 bg-mint-wash/55 transition-all" />
                      ) : null}
                      <div
                        data-queue-item-id={item.id}
                        onDragStart={(event) => {
                          const target = event.target;
                          if (uploadingQueue) {
                            event.preventDefault();
                            return;
                          }
                          if (!(target instanceof Element) || !target.closest('[data-queue-drag-handle="true"]')) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                          setFloatingDragImage(event.dataTransfer, event.currentTarget, event.clientX, event.clientY);
                          setDraggingQueueId(item.id);
                          setQueueDropMarker(getQueueDropMarker(uploadQueueListRef.current, event.clientY, item.id));
                        }}
                        onDragEnd={() => {
                          setDraggingQueueId(null);
                          setQueueDropMarker(null);
                        }}
                        className={cn(
                          "grid gap-2 rounded-lg border border-ink-black/12 bg-parchment-cream/55 p-2.5 transition duration-200 md:grid-cols-[28px_32px_minmax(0,1fr)_80px_120px_96px]",
                          isDragging && "scale-[0.98] border-ink-black bg-mint-wash/35 shadow-editorial"
                        )}
                      >
                        <div
                          draggable
                          data-queue-drag-handle="true"
                          title="拖动调整顺序"
                          className={cn("flex items-center justify-center text-warm-stone", uploadingQueue ? "cursor-not-allowed opacity-45" : "cursor-grab active:cursor-grabbing")}
                        >
                          <GripVertical className="size-4" />
                        </div>
                        <div className="flex items-center justify-center text-sm font-medium text-graphite">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="relative">
                            <Input
                              value={item.name}
                              disabled={uploadingQueue}
                              onChange={(event) => updateQueueName(item.id, event.target.value)}
                              className="w-full pr-8"
                              aria-label={`${item.originalName} 文件名`}
                            />
                            {item.name ? (
                              <button
                                type="button"
                                aria-label="清空文件名"
                                title="清空文件名"
                                disabled={uploadingQueue}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => {
                                  updateQueueName(item.id, "");
                                  event.currentTarget.parentElement?.querySelector("input")?.focus();
                                }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <X className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-warm-stone">原始名称：{item.originalName}</p>
                        </div>
                        <div className="flex items-center justify-center text-sm">{item.type}</div>
                        <div className="flex flex-col justify-center">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-warm-stone">{item.size}</span>
                            <span>{item.progress}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-ink-black/10">
                            <div className="h-1.5 rounded-full bg-ink-black transition-all" style={{ width: `${item.progress}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="预览文件"
                            disabled={uploadingQueue}
                            onClick={() => openQueuePreview(item)}
                            className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="删除文件"
                            disabled={uploadingQueue}
                            onClick={() => deleteQueueItem(item.id)}
                            className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      {showAfter ? (
                        <div className="h-2 rounded-full border border-dashed border-ink-black/40 bg-mint-wash/55 transition-all" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ink-black/15 pt-3">
              <p className="text-xs leading-5 text-warm-stone">
                共 {uploadQueue.length} 个文件。{queueReady ? "上传校验完成，可以开始解析。" : "等待文件上传进度达到 100% 后才能开始解析。"}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadingQueue}>
                  <FilePlus2 className="size-4" />
                  继续添加
                </Button>
                <Button
                  variant="ghost"
                  onClick={cancelBatchUpload}
                  disabled={uploadingQueue}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void confirmBatchUpload()}
                  disabled={!queueReady}
                  loading={uploadingQueue}
                  loadingText="提交中"
                >
                  开始解析
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-[min(92vw,560px)] -translate-x-1/2 rounded-lg border border-ink-black bg-parchment-cream px-4 py-3 text-sm font-medium text-ink-black shadow-editorial">
          {notice}
        </div>
      ) : null}

      {allFieldsOpen ? (
        <div className="fixed inset-0 z-30 bg-ink-black/35 p-4 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-[520px] flex-col rounded-xl border border-ink-black bg-parchment-cream p-4 shadow-editorial">
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Manual Field Review</p>
                <h2 className="serif text-[1.8rem] leading-tight">全部字段人工预览</h2>
                <p className="mt-1 text-sm leading-5 text-graphite">
                  当前文件共 {editableFields.length} 个字段，按 section 分组展示。
                </p>
              </div>
              <button type="button" aria-label="关闭全部字段" onClick={() => setAllFieldsOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            {sectionGroupedFields.length > 0 ? (
              <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-ink-black/10 px-4 py-2">
                {sectionGroupedFields.map((group) => (
                  <button
                    key={group.section}
                    type="button"
                    onClick={() => setAllFieldsSection(group.section)}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition",
                      selectedAllFieldsSection === group.section
                        ? "bg-ink-black text-parchment-cream"
                        : "text-graphite hover:bg-ink-black/10"
                    )}
                  >
                    {group.label}
                    <span className={cn(
                      "ml-1",
                      selectedAllFieldsSection === group.section ? "text-parchment-cream/75" : "text-warm-stone"
                    )}>
                      {group.fields.length}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
              {allFieldsSectionFields.length > 0 ? (
                allFieldsSectionFields.map((field) => (
                  <label key={field.id} className="block rounded-lg border border-ink-black/12 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{field.name}</span>
                      <Badge tone={field.confidence >= 95 ? "success" : "warning"}>{field.confidence}%</Badge>
                    </div>
                    <Input value={field.value} onChange={(event) => updateFieldValue(field.id, event.target.value)} className="w-full" />
                    <p className="mt-2 text-xs text-warm-stone">
                      section：{selectedAllFieldsSection} / 来源：原始记录字段候选
                    </p>
                  </label>
                ))
              ) : (
                <p className="rounded-lg border border-ink-black/12 p-4 text-center text-sm text-warm-stone">
                  该 section 暂无字段。
                </p>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-ink-black/15 pt-3">
              <Button variant="ghost" onClick={() => setAllFieldsOpen(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => void saveAllFields()}
                loading={savingAllFields}
                loadingText="保存中"
              >
                保存字段
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingTypeFileId && editingFile ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm"
          onClick={() => {
            if (updatingTypeFileId) return;
            setEditingTypeFileId(null);
            setTypeSearch("");
          }}
        >
          <div
            className="w-full max-w-[620px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Detected Type</p>
                <h2 className="serif mt-0.5 text-[1.6rem] leading-tight">检测类型</h2>
                <p className="mt-1.5 text-sm leading-6 text-graphite">
                  当前文件：{editingFile.name}。类型决定后续字段抽取、规则校验和报告章节归类。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭检测类型选择"
                onClick={() => {
                  if (updatingTypeFileId) return;
                  setEditingTypeFileId(null);
                  setTypeSearch("");
                }}
                disabled={Boolean(updatingTypeFileId)}
                className="shrink-0 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X className="size-5" />
              </button>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-lg border border-ink-black/20 bg-white/35 px-3 py-2">
              <Search className="size-4 text-warm-stone" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-warm-stone"
                value={typeSearch}
                onChange={(event) => setTypeSearch(event.target.value)}
                placeholder="搜索类型、模板、编码或适用范围"
                autoFocus
              />
            </label>
            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {filteredTypeOptions.map((option) => {
                const checked = editingFile.detectedType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={Boolean(updatingTypeFileId)}
                    onClick={() => void updateFileType(editingFile.id, option.id)}
                    className={cn(
                      "focus-ring flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition",
                      updatingTypeFileId && "cursor-not-allowed opacity-70",
                      checked
                        ? "border-ink-black bg-ink-black text-parchment-cream"
                        : "border-ink-black/15 hover:border-ink-black/45"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.title}</span>
                      <span className="mt-1 block text-xs opacity-70">{option.template}</span>
                      <span className="mt-1 block text-xs opacity-70">{option.scope}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs">
                      <span>{option.code}</span>
                      <span className={cn("grid size-5 place-items-center rounded-full border", checked ? "border-parchment-cream" : "border-ink-black/25")}>
                        {updatingTypeFileId === editingFile.id && checked ? <Loader2 className="size-3.5 animate-spin" /> : checked ? <CheckCircle2 className="size-3.5" /> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredTypeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink-black/25 px-4 py-8 text-center text-sm text-warm-stone">
                  没有匹配的检测类型，请调整关键词。
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {manualEntryOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => !savingManualEntry && setManualEntryOpen(false)}>
          <div className="w-full max-w-[420px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Manual Entry</p>
                <h2 className="serif text-[1.5rem] leading-tight mt-0.5">手动录入关键数据</h2>
                <p className="mt-1 text-sm text-graphite">录入数据将标记来源为人工录入，文件状态更新为解析成功。</p>
              </div>
              <button type="button" aria-label="关闭" disabled={savingManualEntry} onClick={() => setManualEntryOpen(false)} className="shrink-0 disabled:cursor-not-allowed disabled:opacity-45">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-graphite">字段名称</span>
                <Select className="w-full" value={manualForm.name} disabled={savingManualEntry} onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}>
                  <option value="">选择字段名称</option>
                  <option>检验项目</option>
                  <option>测量位置</option>
                  <option>实测值</option>
                  <option>标准值</option>
                  <option>单位</option>
                  <option>判定结果</option>
                  <option>备注</option>
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-graphite">字段值</span>
                <Input className="w-full" placeholder="输入字段值" value={manualForm.value} disabled={savingManualEntry} onChange={(e) => setManualForm((f) => ({ ...f, value: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setManualEntryOpen(false)} disabled={savingManualEntry}>取消</Button>
              <Button
                variant="primary"
                onClick={() => void submitManualEntry()}
                disabled={!manualForm.name.trim() || !manualForm.value.trim()}
                loading={savingManualEntry}
                loadingText="录入中"
              >
                <Edit3 className="size-4" />
                确认录入
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {previewingAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/45 p-4 backdrop-blur-sm" onClick={() => setPreviewingAsset(null)}>
          <div
            className="flex h-[82vh] w-full max-w-[880px] flex-col rounded-xl border border-ink-black bg-parchment-cream p-4 shadow-editorial"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">File Preview</p>
                <h2 className="mt-0.5 truncate serif text-[1.6rem] leading-tight">{previewingAsset.name}</h2>
                <p className="mt-1 text-sm text-graphite">
                  {previewingAsset.type} · {previewingAsset.size} · 原始名称：{previewingAsset.originalName}
                </p>
              </div>
              <button type="button" aria-label="关闭预览" onClick={() => setPreviewingAsset(null)} className="shrink-0">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 rounded-lg border border-ink-black/12 bg-[#fbfaf8]">
              {previewingAsset.url && isImagePreview(previewingAsset) ? (
                <div className="flex h-full items-center justify-center overflow-auto p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewingAsset.url} alt={previewingAsset.name} className="max-h-full max-w-full rounded-md object-contain" />
                </div>
              ) : null}

              {previewingAsset.url && isPdfPreview(previewingAsset) ? (
                <iframe title={previewingAsset.name} src={previewingAsset.url} className="h-full w-full rounded-lg" />
              ) : null}

              {isWordPreview(previewingAsset) ? (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div className="max-w-[420px]">
                    <FileSearch className="mx-auto size-9 text-graphite" />
                    <h3 className="mt-4 text-base font-medium">Word 文件预览</h3>
                    <p className="mt-2 text-sm leading-6 text-warm-stone">
                      浏览器无法直接内嵌渲染本地 doc/docx 内容。当前已完成文件识别，可通过下方入口打开原文件检查内容。
                    </p>
                    {previewingAsset.url ? (
                      <a
                        href={previewingAsset.url}
                        download={previewingAsset.name}
                        className="focus-ring mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-black bg-ink-black px-3 py-1.5 text-sm font-medium text-parchment-cream transition hover:bg-charcoal"
                      >
                        <Download className="size-4" />
                        打开原文件
                      </a>
                    ) : (
                      <p className="mt-4 rounded-md border border-ink-black/12 p-3 text-sm text-warm-stone">该记录未绑定可读取的本地原始文件。</p>
                    )}
                  </div>
                </div>
              ) : null}

              {!isImagePreview(previewingAsset) && !isPdfPreview(previewingAsset) && !isWordPreview(previewingAsset) ? (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div className="max-w-[420px]">
                    <AlertTriangle className="mx-auto size-8" />
                    <h3 className="mt-4 text-base font-medium">暂不支持该格式预览</h3>
                    <p className="mt-2 text-sm leading-6 text-warm-stone">当前前端预览仅支持 Word、PDF 和图片文件。</p>
                  </div>
                </div>
              ) : null}

              {!previewingAsset.url && (isImagePreview(previewingAsset) || isPdfPreview(previewingAsset)) ? (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div className="max-w-[420px]">
                    <FileSearch className="mx-auto size-8 text-graphite" />
                    <h3 className="mt-4 text-base font-medium">暂无原文件预览</h3>
                    <p className="mt-2 text-sm leading-6 text-warm-stone">该记录未绑定可读取的本地上传文件。</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {exportToast ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-black bg-ink-black px-4 py-2.5 text-sm text-parchment-cream shadow-editorial">
          <span className="flex items-center gap-2">
            <Download className="size-4" />
            解析结果已导出，包含 {editableFields.length} 个字段。
          </span>
        </div>
      ) : null}
    </>
  );
}
