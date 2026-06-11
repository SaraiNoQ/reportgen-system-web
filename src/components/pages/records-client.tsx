"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FilePlus2,
  FileSearch,
  FolderUp,
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

function getTone(status: RawFile["parseStatus"]) {
  if (status === "解析成功") return "success";
  if (status === "解析失败") return "danger";
  return "active";
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
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
  const [editableFields, setEditableFields] = useState(fields);
  const [notice, setNotice] = useState("已加载当前项目的上传记录，系统已根据文件名自动检测类型。");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  const [editingTypeFileId, setEditingTypeFileId] = useState<string | null>(null);
  const [parseEvents, setParseEvents] = useState(initialEvents);
  const [parseStartTime, setParseStartTime] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState(71);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryFileId, setManualEntryFileId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ name: "", value: "" });
  const [exportToast, setExportToast] = useState(false);
  const scheduledRef = useRef<Set<string>>(new Set());

  const failedFiles = useMemo(() => uploaded.filter((file) => file.parseStatus === "解析失败"), [uploaded]);
  const successCount = uploaded.filter((file) => file.parseStatus === "解析成功").length;
  const activeCount = uploaded.filter((file) => file.parseStatus === "解析中").length;
  const totalFiles = uploaded.length;
  const requiredReady = editableFields.filter((field) => requiredFields.includes(field.name) && field.value.trim()).length;
  const generateReady = failedFiles.length === 0 && activeCount === 0 && requiredReady >= 5;
  const activeField = editableFields.find((field) => field.id === activeFieldId);
  const editingFile = uploaded.find((file) => file.id === editingTypeFileId);

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
        setParseEvents((prev) => [
          ...prev,
          { time: nowTime(), label: `${file.name} · 字段提取完成`, state: "done" as const }
        ]);
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
      setParseEvents((prev) => [...prev, { time: nowTime(), label: "开始解析文件", state: "active" as const }]);
      startTimeRef.current = true;
    }
    if (activeCount === 0 && successCount > 0 && startTimeRef.current) {
      startTimeRef.current = false;
      setParseEvents((prev) => [...prev, { time: nowTime(), label: "全部文件解析流程结束", state: "done" as const }]);
      setParseProgress(100);
    }
  }, [activeCount, successCount, parseStartTime]);

  const retryFile = useCallback((fileId: string) => {
    setUploaded((current) =>
      current.map((file) => (file.id === fileId ? { ...file, parseStatus: "解析中" as const } : file))
    );
    setParseEvents((prev) => [...prev, { time: nowTime(), label: "重新发起解析请求", state: "active" as const }]);
    setNotice("失败文件已重新进入解析队列，系统将保留原失败日志用于追溯。");
  }, []);

  const retryAllFailed = useCallback(() => {
    setUploaded((current) =>
      current.map((file) => (file.parseStatus === "解析失败" ? { ...file, parseStatus: "解析中" as const } : file))
    );
    setNotice("全部失败文件已重新进入解析队列。");
  }, []);

  function openFieldEditor(field: ExtractedField) {
    setActiveFieldId(field.id);
    setDraftValue(field.value);
  }

  function saveActiveField() {
    if (!activeFieldId) return;
    setEditableFields((current) =>
      current.map((field) => (field.id === activeFieldId ? { ...field, value: draftValue, confidence: Math.max(field.confidence, 99) } : field))
    );
    setNotice("字段值已由人工修正，来源将标记为人工校核。");
    setActiveFieldId(null);
  }

  function updateFieldValue(fieldId: string, value: string) {
    setEditableFields((current) => current.map((field) => (field.id === fieldId ? { ...field, value, confidence: Math.max(field.confidence, 99) } : field)));
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
    setEditableFields((current) => [
      ...current,
      { id: `manual-${Date.now()}`, name: manualForm.name.trim(), value: manualForm.value.trim(), confidence: 100 }
    ]);
    if (manualEntryFileId) {
      setUploaded((current) =>
        current.map((file) => (file.id === manualEntryFileId ? { ...file, parseStatus: "解析成功" as const } : file))
      );
    }
    setManualEntryOpen(false);
    setManualEntryFileId(null);
    setNotice(`已手动录入字段「${manualForm.name}」，文件状态更新为解析成功。`);
  }

  function addMockFile() {
    setUploaded((current) => [
      ...current,
      {
        id: `f${current.length + 1}`,
        name: "主轴精度检测记录.pdf",
        type: "PDF",
        size: "2.48 MB",
        uploadedAt: "2024-05-20 10:45",
        parseStatus: "解析中",
        detectedType: "几何精度" as DetectedType,
        typeConfirmed: false
      }
    ]);
    setNotice("文件格式、大小、重复文件与项目权限校验通过，已进入解析队列。系统已根据文件名自动检测类型为几何精度。");
  }

  function addFolderMock() {
    setUploaded((current) => [
      ...current,
      {
        id: `f${current.length + 1}`,
        name: "电气参数记录文件夹/耐压测试报表.docx",
        type: "Word",
        size: "1.12 MB",
        uploadedAt: "2024-05-20 10:46",
        parseStatus: "解析中",
        detectedType: "电气参数" as DetectedType,
        typeConfirmed: false
      }
    ]);
    setNotice("已模拟文件夹上传：Word/Excel 将优先走结构化解析，系统已根据文件夹和文件名推断检测类型为电气参数。");
  }

  function deleteFile(fileId: string) {
    setUploaded((current) => current.filter((file) => file.id !== fileId));
    setNotice("已模拟删除未锁定文件，并写入操作日志。");
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

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_330px]">
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
              <div className="flex h-full flex-col rounded-lg border border-dashed border-ink-black p-4">
                <UploadCloud className="mb-3 size-7" />
                <h2 className="serif text-[1.75rem] leading-tight">上传检测原始记录</h2>
                <p className="mt-2 text-sm leading-6 text-graphite">
                  支持 PDF、JPG、PNG、Word、Excel，多文件上传和文件夹上传。系统根据文件名自动检测类型，识别失败时可手动调整。
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button variant="primary" onClick={addMockFile}>
                    <FilePlus2 className="size-4" />
                    选择文件
                  </Button>
                  <Button variant="secondary" onClick={addFolderMock}>
                    <FolderUp className="size-4" />
                    上传文件夹
                  </Button>
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
            <DataTable headers={["文件名", "类型", "大小", "上传时间", "检测类型", "解析状态", "操作"]}>
              {uploaded.map((file) => (
                <tr key={file.id}>
                  <Td className="max-w-[260px] font-medium">{file.name}</Td>
                  <Td>{file.type}</Td>
                  <Td>{file.size}</Td>
                  <Td>{file.uploadedAt}</Td>
                  <Td className="text-center">
                    {file.detectedType === "未识别" ? (
                      <button
                        type="button"
                        onClick={() => setEditingTypeFileId(file.id)}
                        className="rounded-md border border-dashed border-[#b97400] px-2 py-0.5 text-xs text-[#b97400] hover:bg-[#f4e3bd] transition"
                      >
                        未识别 — 点击选择
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="点击修改检测类型"
                        onClick={() => setEditingTypeFileId(file.id)}
                        className="rounded-md border px-2 py-0.5 text-xs transition hover:border-ink-black/40"
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
                    <Badge tone={getTone(file.parseStatus)}>
                      <StatusDot tone={getTone(file.parseStatus)} />
                      {file.parseStatus}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5 justify-center">
                      <button
                        type="button"
                        title="预览文件"
                        onClick={() => setNotice(`已打开 ${file.name} 的在线预览。`)}
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
                <Badge tone="active">字段提取 {parseProgress}%</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">开始</p>
                  <p className="mt-1">{parseStartTime ?? "--:--:--"}</p>
                </div>
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">预计</p>
                  <p className="mt-1">{activeCount > 0 ? `${parseProgress}%` : "已完成"}</p>
                </div>
                <div className="rounded-md border border-ink-black/12 p-2">
                  <p className="text-warm-stone">已耗时</p>
                  <p className="mt-1">{parseStartTime ? `${Math.floor((successCount + failedFiles.length) * 0.7)}s` : "--"}</p>
                </div>
              </div>
              <div className="relative mt-3 max-h-52 space-y-0 overflow-y-auto pr-1">
                <div className="absolute bottom-3 left-2 top-3 w-px bg-ink-black/18" />
                {parseEvents.map((event) => (
                  <div key={event.time} className="relative flex gap-3 pb-3 last:pb-0">
                    <span className="relative z-10 mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-parchment-cream">
                      <StatusDot tone={event.state === "done" ? "success" : event.state === "active" ? "active" : "neutral"} />
                    </span>
                    <div className="min-w-0 rounded-md border border-ink-black/10 bg-parchment-cream/45 px-2.5 py-2">
                      <p className="text-xs text-warm-stone">{event.time}</p>
                      <p className="mt-1 text-sm leading-5 text-graphite">{event.label}</p>
                    </div>
                  </div>
                ))}
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

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <Card className="relative">
            <div className="flex items-center justify-between gap-3">
              <h2 className="serif text-[1.75rem] leading-tight">字段预览</h2>
              <Button variant="ghost" onClick={() => setAllFieldsOpen(true)}>
                全部字段
              </Button>
            </div>
            <p className="mt-1 text-xs leading-5 text-warm-stone">点击字段可人工修正，保存后字段来源标记为人工校核。</p>
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
