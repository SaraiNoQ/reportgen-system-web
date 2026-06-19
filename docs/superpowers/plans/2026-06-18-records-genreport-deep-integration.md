# Records Page Gen-Report Deep Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deeply integrate the gen-report workflow into the records page — real-time workflow progress in the "解析进度" card, cross-file section-grouped field preview in the sidebar, and seamless flow from upload → parse → field review → report generation.

**Architecture:** The `records-client.tsx` component already has hooks for `workflowJobId`, `workflowStatus`, `workflowEvents`, `activeRunId`, `pollWorkflowJob`, and field fetching. The plan upgrades these from proof-of-concept to production-quality: richer progress display, proper section grouping, field editing that syncs to the run workspace, and a "全部字段" modal for cross-file review.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, `src/lib/services/api.ts` (genReportApi)

## Global Constraints

- Run `pnpm typecheck && pnpm lint && pnpm build` after all changes
- All API calls go through `src/lib/services/api.ts` — never call fetch directly
- Use existing components: `Card`, `Button`, `Badge`, `Input`, `StatusDot`, `DataTable`, `SectionHeader` from `src/components/ui/`
- Follow the DESIGN.md tokens: parchment-cream, charcoal text, lavender-mist cards, serif headings
- No `as any`, `@ts-ignore`, or empty catch blocks
- Workflow events must deduplicate via `seenProgressMessagesRef`
- Workflow polling must cleanup on unmount (clearTimeout)
- Backend already supports `registerRunPath` — run is accessible immediately after project/runs POST

---

## File Map

| File | Responsibility |
|---|---|
| `src/lib/types/domain.ts` | Add `WorkflowProgress` type and expand `WorkflowJob` |
| `src/lib/services/api.ts` | Add `genReportApi.approveRun()` and `genReportApi.generateRun()` |
| `src/components/pages/records-client.tsx` | Main integration: progress display, field section grouping, "全部字段" modal, workflow control buttons |

---

### Task 1: Expand Domain Types and API

**Files:**
- Modify: `frontend/src/lib/types/domain.ts`
- Modify: `frontend/src/lib/services/api.ts`

**Interfaces:**
- Produces: `WorkflowProgress` type, `genReportApi.approveRun()`, `genReportApi.generateRun()`

- [ ] **Step 1: Add WorkflowProgress type to domain.ts**

Add after the `RunStatus` type (line 154):

```typescript
export type WorkflowProgressStage =
  | "validate"
  | "prepare"
  | "extract"
  | "review"
  | "generate";

export type WorkflowProgress = {
  stage: WorkflowProgressStage;
  status: "pending" | "active" | "done" | "failed";
  label: string;
  meta: string;
};
```

- [ ] **Step 2: Run typecheck to verify**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (no new file imports yet, just type declarations)

- [ ] **Step 3: Add approve + generate endpoints to genReportApi in api.ts**

Add after `setRunField` (line 398):

```typescript
  /** Approve a run's review package. */
  approveRun(runId: string) {
    return postJson<{ status: string; approval: boolean; message: string }>(
      `/gen-report/runs/${runId}/approve`
    );
  },
  /** Generate report documents for a run. */
  generateRun(runId: string, section?: string | null) {
    return postJson<{ status: string; sections: Record<string, string>; message: string }>(
      `/gen-report/runs/${runId}/generate`,
      section ? { section } : {}
    );
  },
```

- [ ] **Step 4: Run typecheck again**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types/domain.ts frontend/src/lib/services/api.ts
git commit -m "feat: add WorkflowProgress type and approve/generate API endpoints"
```

---

### Task 2: Workflow-Driven Parse Progress Bar

**Files:**
- Modify: `frontend/src/components/pages/records-client.tsx`

**Interfaces:**
- Consumes: `WorkflowProgress` from Task 1, existing `workflowStatus`, `workflowJobId`, `workflowEvents` state
- Produces: `workflowStages: WorkflowProgress[]` derived state, updated progress bar logic

- [ ] **Step 1: Add workflowStages derived state**

Add after the `steps` useMemo (after line 333):

```typescript
const workflowStages = useMemo((): WorkflowProgress[] => {
  const events = workflowEvents.map((e) => e.label);
  const statusLabel = workflowStatus ?? "idle";

  const stageState = (prefix: string): "pending" | "active" | "done" | "failed" => {
    if (statusLabel === "failed") return prefix === "extract" && !events.some((e) => e.includes("completed")) ? "failed" : "done";
    if (statusLabel === "succeeded") return "done";
    if (statusLabel === "running" || statusLabel === "queued") {
      const started = events.some((e) => e.toLowerCase().includes(prefix) || e.toLowerCase().includes(prefix === "extract" ? "main agent" : prefix));
      const completed = events.some((e) => e.toLowerCase().includes(`${prefix} completed`) || e.toLowerCase().includes(`${prefix} succeeded`));
      if (completed) return "done";
      if (started) return "active";
      return "done"; // earlier stages are done if later stages are active
    }
    return "pending";
  };

  return [
    { stage: "validate", status: stageState("validate"), label: "配置验证", meta: statusLabel === "failed" ? "失败" : stageState("validate") === "done" ? "已通过" : "等待中" },
    { stage: "prepare", status: stageState("prepare"), label: "工作区准备", meta: stageState("prepare") === "done" ? "已就绪" : "等待中" },
    { stage: "extract", status: stageState("extract"), label: "字段提取", meta: statusLabel === "running" ? "提取中…" : statusLabel === "failed" ? "失败" : statusLabel === "succeeded" ? `${fieldCount} 个字段` : "等待中" },
    { stage: "generate", status: stageState("generate"), label: "报告生成", meta: statusLabel === "succeeded" ? "已完成" : "等待中" },
  ];
}, [workflowEvents, workflowStatus]);

const fieldCount = useMemo(() => {
  let count = 0;
  for (const fileId of Object.keys(fieldSets)) {
    count += (fieldSets[fileId] ?? []).length;
  }
  return count;
}, [fieldSets]);
```

Place `fieldCount` before `workflowStages`.

- [ ] **Step 2: Replace the "字段提取 N%" badge in parse progress header**

Find the line (approximately 1184):
```tsx
<Badge tone="active">字段提取 {activeParseProgress}%</Badge>
```

Replace with:
```tsx
<Badge tone={workflowJobId ? "active" : "neutral"}>
  {workflowJobId
    ? workflowStatus === "succeeded"
      ? `提取完成 · ${fieldCount} 字段`
      : workflowStatus === "failed"
      ? "工作流失败"
      : `工作流 ${workflowStatus === "queued" ? "排队中" : "进行中"}`
    : `字段提取 ${activeParseProgress}%`}
</Badge>
```

- [ ] **Step 3: Replace the 3-column stats grid with a 4-stage workflow progress bar**

Find the three-column stats grid (approximately lines 1186-1198) and replace the entire grid block with:

```tsx
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
```

- [ ] **Step 4: Add Loader2 and AlertTriangle imports if missing**

At the top of the file check the import block. If `Loader2` or `AlertTriangle` are not imported from `lucide-react`, add them:

```typescript
import { ..., Loader2, AlertTriangle, ... } from "lucide-react";
```

- [ ] **Step 5: Run lint + typecheck**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/pages/records-client.tsx
git commit -m "feat: workflow-driven parse progress with 4-stage bars"
```

---

### Task 3: Section-Grouped Field Preview in Sidebar

**Files:**
- Modify: `frontend/src/components/pages/records-client.tsx`

**Interfaces:**
- Consumes: `fieldSets` state, `activeRunId`, `genReportApi.setRunField`, existing `openFieldEditor`, `saveActiveField`
- Produces: Section-grouped field display in sidebar, cross-file field navigation, section headers with field counts

- [ ] **Step 1: Build section-grouped field list**

Add a derived state that groups fields by section for the currently previewed file:

After the `editableFields` declaration (approximately line 297), add:

```typescript
const sectionGroupedFields = useMemo(() => {
  const fields = editableFields;
  if (fields.length === 0) return [];
  const groups: { section: string; label: string; fields: ExtractedField[] }[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    const section = f.section || "main";
    if (!seen.has(section)) {
      seen.add(section);
      groups.push({
        section,
        label: section === "main" ? "基本信息" : section === "geometry_precision" ? "几何精度检测" : section === "position_precision" ? "位置精度检测" : section,
        fields: [],
      });
    }
    groups.find((g) => g.section === section)?.fields.push(f);
  }
  return groups;
}, [editableFields]);
```

- [ ] **Step 2: Replace flat field list with section-grouped display**

Find the field list in the sidebar (approximately lines 1370-1391) that renders:

```tsx
{editableFields.map((field) => (
  <button ...>...</button>
))}
```

Replace the entire content between `<p className="mt-2 text-xs leading-5">` and the `{activeField ? (` block with:

```tsx
<p className="mt-2 text-xs leading-5 text-warm-stone">
  {activeRunId
    ? "点击字段可人工修正，保存后同步至报告工作区。"
    : "点击字段可人工修正，保存后字段来源标记为人工校核。"}
</p>
<div className="mt-3 space-y-3">
  {sectionGroupedFields.length > 0 ? (
    sectionGroupedFields.map((group) => (
      <div key={group.section}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-graphite">{group.label}</span>
          <span className="text-[11px] text-warm-stone">{group.fields.length}</span>
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
    ))
  ) : (
    <p className="rounded-md border border-ink-black/10 p-3 text-sm text-warm-stone">
      {workflowJobId && workflowStatus === "running"
        ? "字段提取中，完成后将自动展示…"
        : "暂无提取字段，请先上传文件并开始解析。"}
    </p>
  )}
</div>
```

- [ ] **Step 3: Run lint + typecheck**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pages/records-client.tsx
git commit -m "feat: section-grouped field preview in sidebar with workflow awareness"
```

---

### Task 4: "全部字段" Modal for Cross-File Review

**Files:**
- Modify: `frontend/src/components/pages/records-client.tsx`

**Interfaces:**
- Consumes: `fieldSets`, `uploaded`, `sectionGroupedFields`
- Produces: Full-field modal with tab-per-section layout, inline editing, all-fields-overview

- [ ] **Step 1: Add allFieldsTab state**

Add near other state declarations (after `allFieldsOpen` at line 248):

```typescript
const [allFieldsSection, setAllFieldsSection] = useState<string>("main");
```

- [ ] **Step 2: Build the "全部字段" modal**

Add the modal JSX after the existing `{activeField ? (` editor block (after line 1413), before the `{uploadModalOpen ? (` block:

```tsx
{allFieldsOpen ? (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm" onClick={() => setAllFieldsOpen(false)}>
    <div
      className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-xl border border-ink-black bg-parchment-cream shadow-editorial"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-ink-black/15 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-warm-stone">All Extracted Fields</p>
          <h2 className="serif text-[1.8rem] leading-tight">全部字段</h2>
          <p className="mt-1 text-sm text-graphite">
            来自 gen-report 提取的 {fieldCount} 个字段，按 section 分组，可编辑任意字段值。
          </p>
        </div>
        <button type="button" aria-label="关闭全部字段" onClick={() => setAllFieldsOpen(false)}>
          <X className="size-5" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-ink-black/10 px-4 py-2">
        {(() => {
          const allFields = Object.values(fieldSets).flat();
          const sections: string[] = [];
          for (const f of allFields) {
            const s = f.section || "main";
            if (!sections.includes(s)) sections.push(s);
          }
          return sections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setAllFieldsSection(section)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1 text-xs font-medium transition",
                allFieldsSection === section
                  ? "bg-ink-black text-parchment-cream"
                  : "text-graphite hover:bg-ink-black/10"
              )}
            >
              {section}
            </button>
          ));
        })()}
      </div>

      {/* Field table by section */}
      <div className="flex-1 overflow-y-auto p-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-black/10 text-xs text-warm-stone">
              <th className="pb-2 pr-3 font-medium">字段名</th>
              <th className="pb-2 pr-3 font-medium">当前值</th>
              <th className="pb-2 pr-3 font-medium">置信度</th>
              <th className="pb-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(fieldSets)
              .flat()
              .filter((f) => (f.section || "main") === allFieldsSection)
              .map((field) => (
                <tr key={field.id} className="border-b border-ink-black/6">
                  <td className="py-2 pr-3 text-xs text-warm-stone">{field.name}</td>
                  <td className="py-2 pr-3">
                    {activeFieldId === field.id ? (
                      <input
                        type="text"
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void saveActiveField(); }}
                        className="w-full rounded border border-ink-black/20 px-2 py-1 text-sm"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm">{field.value || "—"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={cn("text-xs", field.confidence >= 90 ? "text-ink-black" : "text-[#8b3228]")}>
                      {field.confidence}%
                    </span>
                  </td>
                  <td className="py-2">
                    {activeFieldId === field.id ? (
                      <div className="flex gap-1">
                        <Button variant="primary" size="sm" onClick={() => void saveActiveField()} loading={savingField}>
                          保存
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setActiveFieldId(null)}>
                          取消
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => openFieldEditor(field)}>
                        <Edit3 className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {(() => {
          const sectionFields = Object.values(fieldSets).flat().filter((f) => (f.section || "main") === allFieldsSection);
          return sectionFields.length === 0 ? (
            <p className="py-6 text-center text-sm text-warm-stone">该 section 暂无字段。</p>
          ) : null;
        })()}
      </div>

      <div className="flex justify-end gap-2 border-t border-ink-black/15 p-4">
        <Button variant="ghost" onClick={() => setAllFieldsOpen(false)}>关闭</Button>
        {activeRunId && workflowStatus === "succeeded" ? (
          <Button variant="primary" onClick={() => {
            void genReportApi.generateRun(activeRunId).then(() => {
              setNotice("报告已生成，可前往报告页面查看。");
            }).catch(() => setNotice("报告生成接口暂不可用。"));
          }}>
            生成报告
          </Button>
        ) : null}
      </div>
    </div>
  </div>
) : null}
```

- [ ] **Step 2: Update openFieldEditor to track which field is being edited**

The `openFieldEditor` function (line 516) already sets `activeFieldId` and `draftValue`. The modal's inline editing uses these same state variables. This step requires NO change — it works by sharing state.

- [ ] **Step 3: Update "全部字段" button to indicate when workflow fields are available**

Find the existing "全部字段" button (approximately line 1338):

```tsx
<Button variant="ghost" onClick={() => setAllFieldsOpen(true)}>
  全部字段
</Button>
```

Replace with:

```tsx
<Button
  variant="ghost"
  onClick={() => setAllFieldsOpen(true)}
>
  全部字段
  {fieldCount > 0 ? (
    <span className="ml-1 grid size-5 place-items-center rounded-full bg-ink-black text-[11px] text-parchment-cream">
      {fieldCount}
    </span>
  ) : null}
</Button>
```

- [ ] **Step 4: Run lint + typecheck**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/pages/records-client.tsx
git commit -m "feat: all-fields modal with section tabs, inline editing, and generate button"
```

---

### Task 5: Poll Workflow During Extraction for Field Fetching

**Files:**
- Modify: `frontend/src/components/pages/records-client.tsx`

**Interfaces:**
- Consumes: `genReportApi.getRunFields`, `activeRunId`, `pollWorkflowJob`
- Produces: Fields fetched during extraction (not just on success), `refreshFieldsOnRunAvailable`

- [ ] **Step 1: Fetch fields as soon as activeRunId becomes available**

Modify `pollWorkflowJob` to fetch fields immediately when `activeRunId` is first set, rather than waiting for workflow completion. Find the block where `activeRunId` is set (line 929-932):

```typescript
if (!activeRunId) {
  const runIds = Object.keys(job.runPaths);
  if (runIds.length > 0) setActiveRunId(runIds[0]);
}
```

Replace with:

```typescript
if (!activeRunId) {
  const runIds = Object.keys(job.runPaths);
  if (runIds.length > 0) {
    const runId = runIds[0];
    setActiveRunId(runId);
    // Fetch fields as soon as the run is registered — may return partial data if extract is still running
    genReportApi.getRunFields(runId).then((data) => {
      if (data.fields.length > 0) {
        setFieldSets((current) => {
          const next = { ...current };
          for (const fileId of Object.keys(next)) {
            next[fileId] = data.fields;
          }
          return next;
        });
      }
    }).catch(() => { /* fields not ready yet — will retry on success */ });
  }
}
```

- [ ] **Step 2: Keep the existing success-handler field fetch for final state**

The existing block at lines 939-960 already fetches fields on success. This stays as a fallback/final-state fetch. No change needed.

- [ ] **Step 3: Run lint + typecheck + build**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm build`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pages/records-client.tsx
git commit -m "feat: fetch fields from run immediately when run_id registered during workflow"
```

---

### Task 6: Integration Smoke Test

**Files:**
- No file changes — verification only

- [ ] **Step 1: Start backend**

```bash
cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend && pnpm dev
```

- [ ] **Step 3: Manual test flow**

1. Open `http://localhost:3000/records`
2. Select a project from the sidebar (e.g., "数字化工厂智能制造产线检验")
3. Upload a file (drag & drop or click upload)
4. Observe: the "开始解析" button click triggers `startGenReportWorkflow()`
5. Observe: the parse progress card shows 4-stage workflow progress (validate → prepare → extract → generate)
6. Observe: heartbeats and stage transitions appear in the timeline
7. After extract completes:
   - Sidebar shows section-grouped fields (基本信息, 几何精度检测, 位置精度检测)
   - Click "全部字段" → modal with section tabs, inline editing, generate button
8. Edit a field → save → verify `POST /runs/{run_id}/set-field` is called
9. Click "生成报告" in the all-fields modal → verify `POST /runs/{run_id}/generate` is called

- [ ] **Step 4: Verify error handling**

1. Kill the backend → observe polling gracefully fails with notice "查询进度失败"
2. Restart backend → observe new upload triggers fresh workflow

- [ ] **Step 5: Run final check**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm build
```

Expected: all PASS
