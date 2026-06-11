"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
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
  RefreshCcw,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, Td } from "@/components/ui/table";
import type { DetectedType, ExtractedField, ParseEvent, RawFile } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

const templateRules = ["字段定义 34 项", "字段映射 18 条", "校验规则 12 条", "提示词版本 prompt-geo-v2.1"];
const requiredFields = ["检验项目", "测量位置", "实测值", "标准值", "单位", "判定结果"];

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

function createFieldSet(fileId: string, sourceFields: ExtractedField[], fileIndex = 0) {
  return sourceFields.map((field) => ({
    ...field,
    id: `${fileId}-${field.id}`,
    value: fileIndex === 0 ? field.value : field.name === "测量位置" ? "待人工确认" : field.value,
    confidence: fileIndex === 0 ? field.confidence : Math.max(72, field.confidence - 12)
  }));
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

function createParseEvents(file: RawFile): ParseEvent[] {
  if (file.parseStatus === "解析成功") {
    return [
      { time: file.uploadedAt.slice(-5) + ":15", label: "开始解析文件", state: "done" },
      { time: file.uploadedAt.slice(-5) + ":20", label: "OCR/结构化解析完成", state: "done" },
      { time: file.uploadedAt.slice(-5) + ":30", label: "字段提取完成", state: "done" },
      { time: file.uploadedAt.slice(-5) + ":45", label: "结构化结果已写入字段库", state: "done" }
    ];
  }

  if (file.parseStatus === "解析失败") {
    return [
      { time: file.uploadedAt.slice(-5) + ":15", label: "开始解析文件", state: "done" },
      { time: file.uploadedAt.slice(-5) + ":22", label: "表格边界识别失败，等待人工处理", state: "pending" }
    ];
  }

  return [
    { time: nowTime(), label: "上传完成，等待解析调度", state: "done" },
    { time: nowTime(), label: "OCR/结构化解析中", state: "active" }
  ];
}

export function RecordsClient({
  files,
  events: initialEvents,
  fields
}: {
  files: RawFile[];
  events: ParseEvent[];
  fields: ExtractedField[];
}) {
  const [uploaded, setUploaded] = useState(files);
  const [fieldSets, setFieldSets] = useState<Record<string, ExtractedField[]>>(() =>
    Object.fromEntries(files.map((file, index) => [file.id, createFieldSet(file.id, fields, index)]))
  );
  const [activePreviewFileId, setActivePreviewFileId] = useState(files[0]?.id ?? "");
  const [notice, setNotice] = useState("已加载当前项目的上传记录，系统已根据文件名自动检测类型。");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  const [editingTypeFileId, setEditingTypeFileId] = useState<string | null>(null);
  const [parseEventSets, setParseEventSets] = useState<Record<string, ParseEvent[]>>(() =>
    Object.fromEntries(files.map((file, index) => [file.id, index === 0 && file.parseStatus !== "解析成功" ? initialEvents : createParseEvents(file)]))
  );
  const [activeParseFileId, setActiveParseFileId] = useState(files[0]?.id ?? "");
  const [parseStartTime, setParseStartTime] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState(71);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryFileId, setManualEntryFileId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ name: "", value: "" });
  const [exportToast, setExportToast] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [draggingQueueId, setDraggingQueueId] = useState<string | null>(null);
  const [queueDropMarker, setQueueDropMarker] = useState<DropMarker | null>(null);
  const [previewAssets, setPreviewAssets] = useState<Record<string, PreviewAsset>>({});
  const [previewingAsset, setPreviewingAsset] = useState<PreviewAsset | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledRef = useRef<Set<string>>(new Set());
  const previewAssetsRef = useRef(previewAssets);
  const uploadQueueRef = useRef(uploadQueue);

  const failedFiles = useMemo(() => uploaded.filter((file) => file.parseStatus === "解析失败"), [uploaded]);
  const successCount = uploaded.filter((file) => file.parseStatus === "解析成功").length;
  const activeCount = uploaded.filter((file) => file.parseStatus === "解析中").length;
  const totalFiles = uploaded.length;
  const previewFileIndex = Math.max(0, uploaded.findIndex((file) => file.id === activePreviewFileId));
  const previewFile = uploaded[previewFileIndex];
  const editableFields = fieldSets[activePreviewFileId] ?? [];
  const requiredReady = editableFields.filter((field) => requiredFields.includes(field.name) && field.value.trim()).length;
  const generateReady = failedFiles.length === 0 && activeCount === 0 && requiredReady >= 5;
  const activeField = editableFields.find((field) => field.id === activeFieldId);
  const editingFile = uploaded.find((file) => file.id === editingTypeFileId);
  const activeParseFile = uploaded.find((file) => file.id === activeParseFileId) ?? uploaded[0];
  const activeParseEvents = activeParseFile ? parseEventSets[activeParseFile.id] ?? [] : [];
  const activeParseIndex = activeParseFile ? Math.max(0, uploaded.findIndex((file) => file.id === activeParseFile.id)) : -1;
  const activeParseProgress = activeParseFile?.parseStatus === "解析成功" ? 100 : activeParseFile?.parseStatus === "解析失败" ? 38 : parseProgress;

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
    previewAssetsRef.current = previewAssets;
  }, [previewAssets]);

  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    return () => {
      Object.values(previewAssetsRef.current).forEach((asset) => {
        if (asset.url) URL.revokeObjectURL(asset.url);
      });
      uploadQueueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  // Auto-parse simulation: files in "解析中" transition to "解析成功" after delay
  useEffect(() => {
    const pending = uploaded.filter((f) => f.parseStatus === "解析中" && !scheduledRef.current.has(f.id));
    if (pending.length === 0) return;

    pending.forEach((file) => scheduledRef.current.add(file.id));

    const timers = pending.map((file, i) =>
      setTimeout(() => {
        setUploaded((current) =>
          current.map((f) => {
            if (f.id !== file.id) return f;
            return { ...f, parseStatus: "解析成功" as const };
          })
        );
        setParseEventSets((current) => ({
          ...current,
          [file.id]: [
            ...(current[file.id] ?? []),
            { time: nowTime(), label: "字段提取完成", state: "done" as const },
            { time: nowTime(), label: "结构化结果已写入字段库", state: "done" as const }
          ]
        }));
        setParseProgress((p) => Math.min(100, p + Math.floor(20 / pending.length)));
        setNotice(`${file.name} 解析成功，已提取关键字段。`);
        scheduledRef.current.delete(file.id);
      }, 2500 + i * 800)
    );

    return () => timers.forEach(clearTimeout);
  }, [uploaded]);

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

  const retryFile = useCallback((fileId: string) => {
    setUploaded((current) =>
      current.map((file) => (file.id === fileId ? { ...file, parseStatus: "解析中" as const } : file))
    );
    setParseEventSets((current) => ({
      ...current,
      [fileId]: [
        ...(current[fileId] ?? []),
        { time: nowTime(), label: "重新发起解析请求", state: "active" as const }
      ]
    }));
    setActiveParseFileId(fileId);
    setNotice("失败文件已重新进入解析队列，系统将保留原失败日志用于追溯。");
  }, []);

  const retryAllFailed = useCallback(() => {
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
  }, [failedFiles]);

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

  function saveActiveField() {
    if (!activeFieldId) return;
    setFieldSets((current) => ({
      ...current,
      [activePreviewFileId]: (current[activePreviewFileId] ?? []).map((field) =>
        field.id === activeFieldId ? { ...field, value: draftValue, confidence: Math.max(field.confidence, 99) } : field
      )
    }));
    setNotice("字段值已由人工修正，来源将标记为人工校核。");
    setActiveFieldId(null);
  }

  function updateFieldValue(fieldId: string, value: string) {
    setFieldSets((current) => ({
      ...current,
      [activePreviewFileId]: (current[activePreviewFileId] ?? []).map((field) =>
        field.id === fieldId ? { ...field, value, confidence: Math.max(field.confidence, 99) } : field
      )
    }));
  }

  function updateFileType(fileId: string, detectedType: DetectedType) {
    setUploaded((current) =>
      current.map((file) => (file.id === fileId ? { ...file, detectedType, typeConfirmed: true } : file))
    );
    setEditingTypeFileId(null);
    setNotice("检测类型已人工调整为 " + detectedType + "，来源标记为人工确认。");
  }

  function openManualEntry(fileId: string) {
    setManualEntryFileId(fileId);
    setManualForm({ name: "", value: "" });
    setManualEntryOpen(true);
  }

  function submitManualEntry() {
    if (!manualForm.name.trim() || !manualForm.value.trim()) return;
    const targetFileId = manualEntryFileId ?? activePreviewFileId;
    setFieldSets((current) => ({
      ...current,
      [targetFileId]: [
        ...(current[targetFileId] ?? []),
        { id: `${targetFileId}-manual-${Date.now()}`, name: manualForm.name.trim(), value: manualForm.value.trim(), confidence: 100 }
      ]
    }));
    if (manualEntryFileId) {
      setUploaded((current) =>
        current.map((file) => (file.id === manualEntryFileId ? { ...file, parseStatus: "解析成功" as const } : file))
      );
      setActivePreviewFileId(manualEntryFileId);
    }
    setManualEntryOpen(false);
    setManualEntryFileId(null);
    setNotice(`已手动录入字段「${manualForm.name}」，文件状态更新为解析成功。`);
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

  function commitUploads(items: UploadQueueItem[]) {
    const now = new Date();
    const uploadTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${nowTime().slice(0, 5)}`;
    const newFiles: RawFile[] = items.map((item) => ({
      id: createId("f"),
      name: item.name,
      type: item.type,
      size: item.size,
      uploadedAt: uploadTime,
      parseStatus: "解析中",
      detectedType: item.detectedType,
      typeConfirmed: false
    }));

    setUploaded((current) => [...current, ...newFiles]);
    setFieldSets((current) => {
      const next = { ...current };
      newFiles.forEach((file, index) => {
        next[file.id] = createFieldSet(file.id, fields, uploaded.length + index);
      });
      return next;
    });
    setParseEventSets((current) => {
      const next = { ...current };
      newFiles.forEach((file) => {
        next[file.id] = createParseEvents(file);
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

  function handleSelectedFiles(fileList: FileList | File[]) {
    const selectedFiles = Array.from(fileList);
    if (selectedFiles.length === 0) return;
    const queueItems = createQueueItems(selectedFiles);
    if (uploadModalOpen) {
      setUploadQueue((current) => [...current, ...queueItems]);
      setNotice(`已追加 ${queueItems.length} 个文件到批量上传队列，请确认顺序后开始解析。`);
      return;
    }
    if (queueItems.length === 1) {
      commitUploads(queueItems);
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

  function confirmBatchUpload() {
    const readyItems = uploadQueue.map((item) => ({ ...item, progress: 100 }));
    commitUploads(readyItems);
    setUploadQueue([]);
    setUploadModalOpen(false);
  }

  function deleteFile(fileId: string) {
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
  }

  function cancelBatchUpload() {
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
    setNotice(`${file.name} 已打开预览。`);
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

  return (
    <>
      <SectionHeader
        eyebrow="RR 原始记录上传与解析"
        title="原始记录上传"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => { setExportToast(true); setTimeout(() => setExportToast(false), 2500); setNotice("已导出解析结果：Excel / JSON / 内部数据包。"); }}>
              <Download className="size-4" />
              导出结果
            </Button>
            <Link href="/reports">
              <Button variant="primary" disabled={!generateReady}>
                生成报告
                <ArrowRight className="size-4" />
              </Button>
            </Link>
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
                  handleSelectedFiles(event.dataTransfer.files);
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
                    if (event.target.files) handleSelectedFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
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
                <p className="mt-2 font-medium">智能制造产线项目</p>
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
              {uploaded.map((file) => (
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
                        onClick={() => openUploadedPreview(file)}
                        className="rounded-md p-1.5 text-warm-stone hover:bg-ink-black/10 hover:text-ink-black transition"
                      >
                        <FileSearch className="size-4" />
                      </button>
                      {file.parseStatus === "解析失败" ? (
                        <button
                          type="button"
                          title="重试解析"
                          onClick={() => retryFile(file.id)}
                          className="rounded-md p-1.5 text-warm-stone hover:bg-ink-black/10 hover:text-ink-black transition"
                        >
                          <RefreshCcw className="size-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="删除文件"
                        onClick={() => deleteFile(file.id)}
                        className="rounded-md p-1.5 text-warm-stone hover:bg-ink-black/10 hover:text-ink-black transition"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="serif text-[1.75rem] leading-tight">解析进度</h2>
                <Badge tone="active">字段提取 {activeParseProgress}%</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">开始</p>
                  <p className="mt-1">{parseStartTime ?? "--:--:--"}</p>
                </div>
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">预计</p>
                  <p className="mt-1">{activeParseFile?.parseStatus === "解析中" ? `${activeParseProgress}%` : activeParseFile ? activeParseFile.parseStatus : "--"}</p>
                </div>
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">已耗时</p>
                  <p className="mt-1">{parseStartTime ? `${Math.floor((successCount + failedFiles.length) * 0.7)}s` : "--"}</p>
                </div>
              </div>
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
                  <div className="relative max-h-44 space-y-0 overflow-y-auto pr-1">
                    <div className="absolute bottom-3 left-2 top-3 w-px bg-ink-black/18" />
                    {activeParseEvents.map((event, index) => (
                      <div key={`${event.time}-${event.label}-${index}`} className="relative flex gap-3 pb-3 last:pb-0">
                        <span className="relative z-10 mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-parchment-cream">
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

            <Card>
              <h2 className="serif text-[1.75rem] leading-tight">模板加载内容</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {templateRules.map((rule) => (
                  <Badge key={rule} tone="neutral">{rule}</Badge>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-warm-stone">模板内容已用于字段映射、规则校验和大模型提示词装配。</p>
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
                    <Button variant="danger" onClick={retryAllFailed}>
                      <RefreshCcw className="size-4" />
                      重试解析
                    </Button>
                    <Button variant="secondary" onClick={() => openManualEntry(failedFiles[0].id)}>
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

          <Card lavender>
            <p className="text-sm leading-6 text-graphite">{notice}</p>
          </Card>
        </div>

        <aside className="min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:self-start">
          <Card className="relative">
            <div className="flex items-center justify-between gap-3">
              <h2 className="serif text-[1.75rem] leading-tight">字段预览</h2>
              <Button variant="ghost" onClick={() => setAllFieldsOpen(true)}>
                全部字段
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
            <p className="mt-2 text-xs leading-5 text-warm-stone">点击字段可人工修正，保存后字段来源标记为人工校核。</p>
            <div className="mt-3 space-y-2.5">
              {editableFields.map((field) => (
                <button
                  type="button"
                  key={field.id}
                  onClick={() => openFieldEditor(field)}
                  className="w-full rounded-lg border border-ink-black/12 p-2.5 text-left transition hover:border-ink-black hover:bg-parchment-cream/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-warm-stone">{field.name}</p>
                      <p className="mt-1 text-sm font-medium">{field.value}</p>
                    </div>
                    <span className={cn("text-xs", field.confidence >= 90 ? "text-ink-black" : "text-[#8b3228]")}>{field.confidence}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-ink-black/10">
                    <div className="h-1.5 rounded-full bg-ink-black" style={{ width: `${field.confidence}%` }} />
                  </div>
                </button>
              ))}
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
                  <Button variant="ghost" onClick={() => setActiveFieldId(null)}>取消</Button>
                  <Button variant="primary" onClick={saveActiveField}>
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
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Upload Queue</p>
                <h2 className="serif text-[1.8rem] leading-tight">批量上传顺序确认</h2>
                <p className="mt-1 text-sm text-graphite">拖动文件调整顺序，该顺序将用于后续报告章节和附件排序。</p>
              </div>
              <button type="button" aria-label="关闭批量上传" onClick={cancelBatchUpload} className="shrink-0">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              <div className="space-y-2">
                {uploadQueue.map((item, index) => {
                  const showBefore = queueDropMarker?.targetId === item.id && queueDropMarker.position === "before";
                  const showAfter = queueDropMarker?.targetId === item.id && queueDropMarker.position === "after";
                  const isDragging = draggingQueueId === item.id;
                  return (
                    <div key={item.id} className="space-y-2">
                      {showBefore ? (
                        <div className="h-2 rounded-full border border-dashed border-ink-black/40 bg-mint-wash/55 transition-all" />
                      ) : null}
                      <div
                        draggable
                        onDragStart={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest("input,button,a")) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                          setDraggingQueueId(item.id);
                          setQueueDropMarker(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (!draggingQueueId || draggingQueueId === item.id) return;
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const position = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
                          setQueueDropMarker({ targetId: item.id, position });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggingQueueId) {
                            moveQueueItem(draggingQueueId, item.id, queueDropMarker?.position ?? "before");
                          }
                          setDraggingQueueId(null);
                          setQueueDropMarker(null);
                        }}
                        onDragEnd={() => {
                          setDraggingQueueId(null);
                          setQueueDropMarker(null);
                        }}
                        className={cn(
                          "grid gap-2 rounded-lg border border-ink-black/12 bg-parchment-cream/55 p-2.5 transition md:grid-cols-[28px_32px_minmax(0,1fr)_80px_120px_96px]",
                          isDragging && "border-ink-black bg-mint-wash/35 opacity-45 shadow-editorial"
                        )}
                      >
                        <div className="flex cursor-grab items-center justify-center text-warm-stone active:cursor-grabbing">
                          <GripVertical className="size-4" />
                        </div>
                        <div className="flex items-center justify-center text-sm font-medium text-graphite">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <Input
                            value={item.name}
                            onChange={(event) => updateQueueName(item.id, event.target.value)}
                            className="w-full"
                            aria-label={`${item.originalName} 文件名`}
                          />
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
                            onClick={() => openQueuePreview(item)}
                            className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="删除文件"
                            onClick={() => deleteQueueItem(item.id)}
                            className="rounded-md p-1.5 text-warm-stone transition hover:bg-ink-black/10 hover:text-ink-black"
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
              <p className="text-xs leading-5 text-warm-stone">共 {uploadQueue.length} 个文件。删除后不会进入解析队列，改名仅影响当前项目内记录名称。</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  <FilePlus2 className="size-4" />
                  继续添加
                </Button>
                <Button
                  variant="ghost"
                  onClick={cancelBatchUpload}
                >
                  取消
                </Button>
                <Button variant="primary" onClick={confirmBatchUpload} disabled={uploadQueue.length === 0}>
                  开始解析
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {allFieldsOpen ? (
        <div className="fixed inset-0 z-30 bg-ink-black/35 p-4 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-[520px] flex-col rounded-xl border border-ink-black bg-parchment-cream p-4 shadow-editorial">
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Manual Field Review</p>
                <h2 className="serif text-[1.8rem] leading-tight">全部字段人工预览</h2>
              </div>
              <button type="button" aria-label="关闭全部字段" onClick={() => setAllFieldsOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
              {editableFields.map((field) => (
                <label key={field.id} className="block rounded-lg border border-ink-black/12 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{field.name}</span>
                    <Badge tone={field.confidence >= 95 ? "success" : "warning"}>{field.confidence}%</Badge>
                  </div>
                  <Input value={field.value} onChange={(event) => updateFieldValue(field.id, event.target.value)} className="w-full" />
                  <p className="mt-2 text-xs text-warm-stone">来源：原始记录 / 第 1 页 / 表格字段候选</p>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-ink-black/15 pt-3">
              <Button variant="ghost" onClick={() => setAllFieldsOpen(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setAllFieldsOpen(false);
                  setNotice("全部字段已完成一次人工预览，修改内容保存在前端 mock 状态中。");
                }}
              >
                保存字段
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingTypeFileId && editingFile ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setEditingTypeFileId(null)}>
          <div
            className="w-full max-w-[380px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Detected Type</p>
                <h2 className="serif text-[1.5rem] leading-tight mt-0.5">选择检测类型</h2>
                <p className="mt-1 text-sm text-graphite truncate max-w-[280px]">{editingFile.name}</p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setEditingTypeFileId(null)} className="shrink-0">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {(["几何精度", "位置精度", "电气参数", "力学性能", "综合检测"] as DetectedType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateFileType(editingFile.id, type)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition ${
                    editingFile.detectedType === type
                      ? "border-ink-black bg-ink-black text-parchment-cream"
                      : "border-ink-black/20 hover:border-ink-black/50 hover:bg-parchment-cream/70"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {manualEntryOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setManualEntryOpen(false)}>
          <div className="w-full max-w-[420px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Manual Entry</p>
                <h2 className="serif text-[1.5rem] leading-tight mt-0.5">手动录入关键数据</h2>
                <p className="mt-1 text-sm text-graphite">录入数据将标记来源为人工录入，文件状态更新为解析成功。</p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setManualEntryOpen(false)} className="shrink-0">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-graphite">字段名称</span>
                <Select className="w-full" value={manualForm.name} onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}>
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
                <Input className="w-full" placeholder="输入字段值" value={manualForm.value} onChange={(e) => setManualForm((f) => ({ ...f, value: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setManualEntryOpen(false)}>取消</Button>
              <Button variant="primary" onClick={submitManualEntry}>
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
                      <p className="mt-4 rounded-md border border-ink-black/12 p-3 text-sm text-warm-stone">该记录来自 mock 数据，未绑定本地原始文件。</p>
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
                    <p className="mt-2 text-sm leading-6 text-warm-stone">该记录来自 mock 数据，未绑定可读取的本地上传文件。</p>
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
