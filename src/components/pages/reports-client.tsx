"use client";

import { useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  Plus,
  Save,
  Sparkles,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/forms";
import type { ReportSection } from "@/lib/types/domain";

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
    text: '建议将"大概合格"改为"检测结果符合 GB/T 1958-2017 要求，判定为合格"。',
    tone: "warning" as const
  },
  {
    id: "ai3",
    title: "补充免责声明",
    text: "本报告仅对来样负责，检测结果不作为产品质量证明。检测环境：温度 20±2°C，湿度 50±10%RH。",
    tone: "neutral" as const
  }
];

export function ReportsClient({ sections: initialSections }: { sections: ReportSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [content, setContent] = useState(Object.fromEntries(sections.map((s) => [s.id, s.content])));
  const [message, setMessage] = useState("存在 2 处建议优化内容，处理后可提交审核。");
  const [optimizeCount, setOptimizeCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [toast, setToast] = useState("");
  const [versions, setVersions] = useState(["V1.1 张工 保存草稿", "V1.0 系统 生成初稿"]);
  const [aiIndex, setAiIndex] = useState(0);
  const [formatBold, setFormatBold] = useState(false);

  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  function handleGenerate() {
    setGenerating(true);
    setMessage("正在根据项目解析数据和规则模板生成报告初稿...");
    setTimeout(() => {
      const newSections: ReportSection[] = [
        { id: "s1", title: "封面", status: "已校验" as const, content: "委托单位：某智能制造有限公司\n样品名称：智能制造产线\n型号规格：IML-2405\n检测日期：2024-05-20\n报告日期：2024-05-21" },
        { id: "s2", title: "检验结论", status: "待完善" as const, content: "经检测，样品几何精度、位置精度和电气参数符合当前模板判定要求。\n\n检验项目：平面度\n实测值：0.012 mm\n标准值：0.020 mm\n判定结果：合格\n\n建议补充引用标准编号和检测环境信息。" },
        { id: "s3", title: "几何精度检测", status: "已生成" as const, content: "一、平面度检测\n测量位置：左侧工作面\n实测值：0.012 mm\n标准值：0.020 mm\n判定结果：合格\n\n二、直线度检测\n测量位置：导轨基准面\n实测值：0.008 mm\n标准值：0.015 mm\n判定结果：合格" },
        { id: "s4", title: "位置精度检测", status: "已生成" as const, content: "一、平行度检测\n测量位置：工作台面\n实测值：0.025 mm\n标准值：0.030 mm\n判定结果：合格\n\n二、垂直度检测\n测量位置：主轴轴线\n实测值：0.015 mm\n标准值：0.020 mm\n判定结果：合格" },
        { id: "s5", title: "附件", status: "已生成" as const, content: "原始记录文件：平面度检测记录.xlsx、主轴精度检测记录.pdf\n解析日志与规则版本记录：v2.1.0\n检测设备：三坐标测量机 MC-500\n检测环境：温度 20±2°C，湿度 50±10%RH" }
      ];
      setSections(newSections);
      setContent(Object.fromEntries(newSections.map((s) => [s.id, s.content])));
      setActiveId(newSections[0].id);
      setVersions((prev) => ["V1.0 系统 生成初稿", ...prev]);
      setGenerating(false);
      setMessage("报告初稿已生成，请逐章节编辑确认后提交审核。");
      showToast("报告初稿生成完成，共 5 个章节。");
    }, 2000);
  }

  function applySuggestion(text: string) {
    if (!active) return;
    setContent((current) => ({
      ...current,
      [active.id]: `${current[active.id]}\n${text}`
    }));
    setOptimizeCount((c) => Math.max(0, c - 1));
    setMessage("已将智能建议应用到当前章节。");
    if (optimizeCount <= 1) setMessage("所有建议已处理，可提交审核。");
  }

  function handleAddSection() {
    if (!newSectionTitle.trim()) return;
    const id = `s${sections.length + 1}`;
    setSections((prev) => [...prev, { id, title: newSectionTitle.trim(), content: "", status: "待完善" as const }]);
    setContent((prev) => ({ ...prev, [id]: "" }));
    setActiveId(id);
    setNewSectionTitle("");
    setAddSectionOpen(false);
    showToast(`已添加章节「${newSectionTitle.trim()}」。`);
  }

  function handleSaveDraft() {
    const v = `V${(versions.length + 1) / 10 + 1}.${versions.length % 10} 张工 保存草稿`;
    setVersions((prev) => [v, ...prev]);
    showToast("草稿已保存。");
  }

  function handleExportWord() {
    showToast("检测报告正在导出为 .docx 文件...");
    setTimeout(() => showToast("导出完成：智能制造产线项目_检测报告.docx"), 1500);
  }

  return (
    <>
      <SectionHeader
        eyebrow="Report Generation"
        title="报告生成与编辑"
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setPreviewOpen(true)}><Eye className="size-4" />预览</Button>
            <Button onClick={handleExportWord}><Download className="size-4" />导出 Word</Button>
            <Button variant="primary" onClick={handleGenerate} disabled={generating}>
              <Sparkles className="size-4" />
              {generating ? "生成中..." : "生成报告"}
            </Button>
          </div>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-2 block text-sm text-graphite">报告模板</span>
            <Select className="w-full"><option>机床几何精度检测报告模板</option><option>综合性能检测报告模板</option></Select>
          </label>
          <label>
            <span className="mb-2 block text-sm text-graphite">检测项</span>
            <Select className="w-full" defaultValue="几何精度、位置精度、电气参数">
              <option>几何精度、位置精度、电气参数</option>
              <option>仅几何精度</option>
              <option>仅电气参数</option>
            </Select>
          </label>
          <Button className="self-end" variant="primary" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {generating ? "生成中..." : "生成报告"}
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[220px_1fr_300px]">
        <Card className="p-4">
          <h2 className="serif mb-4 text-3xl">报告目录</h2>
          <div className="space-y-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveId(section.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${activeId === section.id ? "border-ink-black bg-ink-black text-parchment-cream" : "border-ink-black/15"}`}
              >
                <span className="block">{section.title}</span>
                <span className="mt-1 block text-xs opacity-70">{section.status}</span>
              </button>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={() => setAddSectionOpen(true)}>
            <Plus className="size-4" />添加章节
          </Button>
        </Card>
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="serif text-3xl">{active?.title}</h2>
            <div className="flex gap-2">
              {["B", "I", "U"].map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => {
                    if (tool === "B") setFormatBold(!formatBold);
                    showToast(`格式「${tool}」已应用。`);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${formatBold && tool === "B" ? "border-ink-black bg-ink-black text-parchment-cream" : "border-ink-black/20 hover:border-ink-black/50"}`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>
          {active ? (
            <Textarea
              className="min-h-[300px] w-full rounded-lg text-base leading-7"
              value={content[active.id] ?? ""}
              onChange={(event) => setContent((current) => ({ ...current, [active.id]: event.target.value }))}
            />
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-warm-stone">停止输入 5 秒后自动保存。当前为 mock 状态。</p>
            <Button onClick={handleSaveDraft}><Save className="size-4" />保存草稿</Button>
          </div>
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
                <Button className="flex-1" variant="primary" onClick={() => applySuggestion(AI_SUGGESTIONS[aiIndex].text)}>
                  <Check className="size-4" />
                  应用到正文
                </Button>
                <Button variant="ghost" onClick={() => setAiIndex((i) => (i + 1) % AI_SUGGESTIONS.length)} title="下一条建议">
                  跳过
                </Button>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="serif text-3xl">版本历史</h2>
            <div className="mt-5 space-y-3 text-sm">
              {versions.map((item) => (
                <div key={item} className="rounded-lg border border-ink-black/15 px-3 py-2">{item}</div>
              ))}
            </div>
          </Card>
          <Card className={message ? "" : "opacity-70"}>
            <FileText className="mb-4 size-5" />
            <p className="text-sm leading-6 text-graphite">{message}</p>
          </Card>
        </aside>
      </div>

      {/* Preview Modal */}
      {previewOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <div className="flex h-full w-full max-w-[720px] flex-col rounded-xl border border-ink-black bg-parchment-cream shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-black/15 px-5 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Preview</p>
                <h2 className="serif text-[1.4rem] leading-tight">报告预览 — 智能制造产线项目</h2>
              </div>
              <button type="button" aria-label="关闭预览" onClick={() => setPreviewOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {sections.map((section) => (
                <div key={section.id} className="mb-6">
                  <h3 className="serif mb-3 text-2xl border-b border-ink-black/15 pb-2">{section.title}</h3>
                  <div className="whitespace-pre-wrap text-sm leading-7 text-graphite">{content[section.id] || section.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Add Section Modal */}
      {addSectionOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setAddSectionOpen(false)}>
          <div className="w-full max-w-[380px] rounded-xl border border-ink-black bg-parchment-cream p-5 shadow-editorial" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">Add Section</p>
              <h2 className="serif text-[1.5rem] leading-tight mt-0.5">添加章节</h2>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm text-graphite">章节标题</span>
              <Input className="w-full" placeholder="输入章节标题" value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} />
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-black/15 pt-4">
              <Button variant="ghost" onClick={() => setAddSectionOpen(false)}>取消</Button>
              <Button variant="primary" onClick={handleAddSection}>
                <Plus className="size-4" />
                添加
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-black bg-ink-black px-4 py-2.5 text-sm text-parchment-cream shadow-editorial">
          {toast}
        </div>
      ) : null}
    </>
  );
}
