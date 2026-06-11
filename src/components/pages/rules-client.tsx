"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/forms";
import { DataTable, Td } from "@/components/ui/table";
import type { RuleField, RuleTemplate } from "@/lib/types/domain";

export function RulesClient({ templates }: { templates: RuleTemplate[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [selectedFieldId, setSelectedFieldId] = useState(templates[0]?.fields[2]?.id ?? "");
  const [tab, setTab] = useState("判定规则");
  const [toast, setToast] = useState("");

  const template = useMemo(() => templates.find((item) => item.id === selectedTemplateId) ?? templates[0], [selectedTemplateId, templates]);
  const field: RuleField | undefined = template.fields.find((item) => item.id === selectedFieldId) ?? template.fields[0];

  return (
    <>
      <SectionHeader eyebrow="Rule Configuration" title="模板管理" />
      <div className="grid gap-3.5 xl:grid-cols-[190px_minmax(0,1fr)_270px]">
        <Card className="min-w-0">
          <Input className="mb-4 w-full" placeholder="搜索模板名称" />
          <div className="space-y-4">
            {Array.from(new Set(templates.map((item) => item.category))).map((category) => (
              <div key={category}>
                <p className="mb-2 text-sm font-medium">{category}</p>
                <div className="space-y-2">
                  {templates
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedTemplateId(item.id);
                          setSelectedFieldId(item.fields[0]?.id ?? "");
                        }}
                        className={`w-full rounded-lg border px-3 py-1.5 text-left text-sm ${
                          item.id === selectedTemplateId ? "border-ink-black bg-ink-black text-parchment-cream" : "border-transparent hover:border-ink-black/20"
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-5 w-full" variant="secondary">
            <Plus className="size-4" />
            新建模板
          </Button>
        </Card>
        <Card className="min-w-0">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="serif text-3xl">模板详情：{template.name}</h2>
              <p className="mt-2 text-sm text-warm-stone">当前版本：{template.version} · {template.updatedAt} 更新</p>
            </div>
            <div className="flex gap-2">
              <Button>
                <Copy className="size-4" />
                复制
              </Button>
              <Button variant="primary">编辑模板</Button>
            </div>
          </div>
          <div className="mb-5 flex gap-2">
            {["模板预览", "字段定义", "数据来源", "版本管理"].map((item) => (
              <Badge key={item} tone={item === "字段定义" ? "active" : "neutral"}>{item}</Badge>
            ))}
          </div>
          <DataTable headers={["字段名称", "字段类型", "是否必填", "数据来源", "操作"]}>
            {template.fields.map((item) => (
              <tr key={item.id} className={item.id === selectedFieldId ? "bg-lavender-mist/55" : ""}>
                <Td>{item.name}</Td>
                <Td>{item.type}</Td>
                <Td>{item.required ? "是" : "否"}</Td>
                <Td><Badge tone="neutral">{item.source}</Badge></Td>
                <Td>
                  <button className="mr-4 underline underline-offset-4" onClick={() => setSelectedFieldId(item.id)}>查看</button>
                  <button className="text-graphite underline underline-offset-4">编辑</button>
                </Td>
              </tr>
            ))}
          </DataTable>
          {field ? (
            <div className="mt-4 rounded-lg border border-ink-black/15 bg-parchment-cream/60 p-3.5">
              <h3 className="serif text-2xl">字段详情：{field.name}</h3>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <p><span className="text-warm-stone">字段编码</span><br />{field.code}</p>
                <p><span className="text-warm-stone">字段类型</span><br />{field.type}</p>
                <p><span className="text-warm-stone">数据来源</span><br />{field.source}</p>
                <p><span className="text-warm-stone">校验规则</span><br />{field.validation}</p>
                <p><span className="text-warm-stone">显示格式</span><br />{field.format}</p>
                <p><span className="text-warm-stone">示例值</span><br />{field.example}</p>
              </div>
            </div>
          ) : null}
          <div className="mt-4">
            <h3 className="serif mb-4 text-2xl">版本管理</h3>
            <div className="grid gap-3">
              {["v2.1.0 生效中", "v2.0.0 已发布", "v1.0.0 已归档"].map((version) => (
                <div key={version} className="flex items-center justify-between rounded-lg border border-ink-black/15 px-3 py-2 text-sm">
                  <span>{version}</span>
                  <button className="underline underline-offset-4">预览</button>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="min-w-0" lavender>
          <h2 className="serif text-3xl">规则编辑器</h2>
          <div className="mt-5 flex gap-2">
            {["溯源表", "判定规则", "结论模板"].map((item) => (
              <button key={item} onClick={() => setTab(item)} className={`rounded-lg border px-3 py-1.5 text-sm ${tab === item ? "border-ink-black bg-ink-black text-parchment-cream" : "border-ink-black/20"}`}>{item}</button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-ink-black/15 bg-parchment-cream/55 p-4">
            <p className="text-sm text-graphite">当</p>
            <div className="my-4 flex flex-wrap items-center gap-3 text-sm">
              <Badge>实测值</Badge>
              <span>≤</span>
              <Badge>标准值</Badge>
              <span>时，判定为</span>
              <Badge tone="success">合格</Badge>
            </div>
            <p className="text-sm text-graphite">否则判定为 <span className="text-ink-black">不合格</span></p>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm text-graphite">计算公式</p>
            <div className="rounded-lg border border-ink-black/15 bg-parchment-cream/55 p-4 text-sm">
              (实测值 - 标准值) / 标准值 * 100
            </div>
          </div>
          <Button className="mt-5 w-full" variant="primary" onClick={() => setToast("规则已保存，并记录版本变更")}>
            <Save className="size-4" />
            保存规则
          </Button>
          {toast ? <p className="mt-4 text-sm text-graphite">{toast}</p> : null}
        </Card>
      </div>
    </>
  );
}
