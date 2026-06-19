# Gen-Report API 集成开发文档

> 从 `GenReportAgent` 项目迁移 gen-report 工作流到 Core API，并将管线接入前端工作台页面。
> 最后更新：2026-06-17

---

## 1. 架构概览

```
用户上传文件（/records）
  → serverPath 映射（uploads/{projectId}/{fileId}/{name}）
  → manifest 自动生成（ManifestBuilder）
  → gen-report 工作流（validate → prepare → extract → generate）
  → 字段预览侧边栏（fill_payloads → set-field）
  → 报告输出（final_report.docx）
```

依赖：外部 Python 包 `gen-report`（`GenReportAgent/` 目录，editable install）。

---

## 2. 接口清单（14 个端点）

全部挂载在 `/api/v1/gen-report/*` 下。

### 2.1 Manifest 管理

| 端点 | 方法 | 用途 | 入参 |
|---|---|---|---|
| `/manifests/validate` | POST | 校验 manifest YAML 配置 | `{ manifestPath }` |
| `/manifests/prepare` | POST | 解析清单，创建工作区 + 快照输入，返回 run_id | `{ manifestPath }` |

### 2.2 项目级工作流（新增）

| 端点 | 方法 | 用途 | 入参 |
|---|---|---|---|
| `/projects/runs` | POST | 从项目数据自动生成 manifest → 启动全流程 → 返回 jobId | `{ projectId }` |

调用链：`Store.project + Store.rule_templates + Store.raw_files` → `ManifestBuilder.build()` → `GenReportService.run_workflow()`。

### 2.3 异步作业追踪

| 端点 | 方法 | 用途 |
|---|---|---|
| `/runs` | POST | 启动全流程（需已存在的 manifest），返回 jobId + 202 |
| `/jobs/{job_id}` | GET | 轮询作业进度，返回 progressEvents 数组 |

### 2.4 分步提取

| 端点 | 方法 | 用途 |
|---|---|---|
| `/runs/{run_id}/extract` | POST | 触发 Claude Code 从原始记录提取字段（异步） |
| `/runs/{run_id}/status` | GET | 查询 run 的 10 个 artifact 状态快照 |
| `/runs/{run_id}/fields` | GET | **新增** — 读取 fill_payloads，返回扁平化字段列表 |

### 2.5 审核与字段修正

| 端点 | 方法 | 用途 |
|---|---|---|
| `/runs/{run_id}/review` | GET | 获取审核包（parsed_sources + 转换问题） |
| `/runs/{run_id}/approve` | POST | 审核通过，解锁 generate |
| `/runs/{run_id}/set-field` | POST | 人工修正单个字段，保留 evidence | `{ section, field, value }` |

### 2.6 生成与交付

| 端点 | 方法 | 用途 |
|---|---|---|
| `/runs/{run_id}/generate` | POST | 生成 final_report.docx |
| `/runs/{run_id}/refresh-inputs` | POST | 刷新输入源，检测 stale artifacts |
| `/runs/{run_id}/open-output` | POST | 打开/下载输出文件 | `{ target: "final_report" \| "workspace" }` |

---

## 3. 后端新增/修改文件

```
backend/
├── app/
│   ├── api/v1/
│   │   ├── gen_report.py          # 路由（14 端点，新增 projects/runs + fields）
│   │   ├── records.py             # 新增 POST /records/upload-files（multipart）
│   │   └── router.py              # 注册 gen_report_router
│   ├── schemas/
│   │   ├── domain.py              # RawFile 新增 serverPath: str | None
│   │   └── gen_report.py          # ManifestValidateRequest 等 Pydantic 模型
│   ├── services/
│   │   ├── gen_report_service.py  # WorkflowService 包装器 + get_fields()
│   │   ├── jobs.py                # JobRegistry（内存异步作业追踪）
│   │   ├── manifest_builder.py    # 从项目数据 → manifest.yaml + 工作区
│   │   ├── mock_store.py          # set_file_path() + 删除时清磁盘
│   │   └── postgres_store.py      # set_file_path() 桩
│   └── models/
│       └── raw_file.py            # 新增 file_path 列
├── pyproject.toml                 # 新增 gen-report 依赖（→ ../../GenReportAgent）
└── .python-version                # 固定 3.12（onnxruntime 兼容）
```

### manifest_builder.py 核心逻辑

```python
class ManifestBuilder:
    def build(project, rule_templates, source_files):
        1. 创建 workspace = /tmp/genreport-workspaces/{project_id}/
        2. 复制模板/规则/模式文件（从 demo_project，可配置）
        3. 根据 rule_templates.category 映射 registry items
        4. 读取 source_files[].serverPath，复制真文件到 sources/
        5. 生成 manifest.yaml + registry.yaml
        6. 返回 manifest_path, workspace_path, run_id, items
```

---

## 4. 前端新增/修改文件

```
frontend/src/
├── lib/
│   ├── types/domain.ts    # RawFile 新增 serverPath；ExtractedField 新增 section
│   └── services/api.ts    # 新增 genReportApi（6 个方法）+ uploadFilesWithContent
└── components/pages/
    └── records-client.tsx  # 核心集成
```

### genReportApi 方法

```typescript
genReportApi.runProjectWorkflow(projectId)  // POST /gen-report/projects/runs
genReportApi.getJob(jobId)                   // GET  /gen-report/jobs/{job_id}
genReportApi.getRunStatus(runId)             // GET  /gen-report/runs/{run_id}/status
genReportApi.getRunFields(runId)             // GET  /gen-report/runs/{run_id}/fields
genReportApi.setRunField(runId, s, f, v)    // POST /gen-report/runs/{run_id}/set-field
```

### records-client.tsx 工作流

```
用户上传文件 → commitUploads()
  ├─ uploadFilesWithContent(projectId, Files[])  // multipart 真文件上传
  │   └─ 后端写文件 → serverPath 存入 store
  └─ 失败回退到 uploadFiles (JSON-only) + 本地 mock

→ startGenReportWorkflow()
  ├─ 无项目 → notice "请先在侧边栏选择一个项目"
  └─ 有项目 → POST /gen-report/projects/runs → jobId

→ pollWorkflowJob(jobId) （每 2s 轮询）
  ├─ progressEvents → 追加到「解析进度」时间线
  ├─ succeeded → fetch fields from /runs/{run_id}/fields
  │   └─ 43 个真字段 → fieldSets → 右侧「字段预览」侧边栏
  └─ 自动解析模拟暂停（workflow 运行时）

→ saveActiveField()
  ├─ activeRunId 存在 → genReportApi.setRunField(runId, section, field, value)
  └─ 否则 → recordApi.updateField (旧 mock 路径)
```

---

## 5. 文件落盘映射

```
上传：POST /records/upload-files (multipart)
  → 后端写文件: uploads/{projectId}/uploading-{filename}/{filename}
  → 存入 store: RawFile.serverPath = "/absolute/path/to/file"
  → ManifestBuilder: 读取 serverPath → copy 到 workspace/sources/
  → gen-report 管线在真文件上运行
```

---

## 6. 验证结果

| 检查项 | 结果 |
|---|---|
| ruff check | 17 预存 E501，无新增 |
| pytest (mock) | 7/7 pass |
| typecheck | ✅ |
| lint | ✅ |
| build | ✅ |
| GET /fields | 43 字段，3 sections |
| POST /set-field | before/after/evidence_preserved |
| 上传 serverPath | 真文件落盘确认 |

---

## 7. 已知限制

1. **extract 阶段需要 Claude Code API Key** — 无 Key 时 extract 会等待 LLM，但 generate 仍可从已有 fill_payloads 生成报告
2. **PostgreSQL 需手动添加 `file_path` 列** — `ALTER TABLE raw_files ADD COLUMN IF NOT EXISTS file_path VARCHAR`
3. **Manifest 模板目前使用 demo_project 文件** — 后续需支持按项目配置自定义模板路径
4. **单文件上传也触发全流程** — 与多文件批量上传走同一路径
5. **工作区使用临时目录** — `genreport-workspaces/` 在 `/tmp` 下，重启后丢失

---

## 8. 下一步开发方向

- [ ] `/reports` 页面集成：运行列表 + 审核面板 + 生成下载
- [ ] 分步流程 UI（validate → prepare → extract → review → approve → generate）
- [ ] `POST /runs`（一键全流程）作为快速通道保留
- [ ] `GET /runs/{run_id}/review` 审核 UI
- [ ] 项目模板配置：自定义 manifest 路径
- [ ] Alembic 迁移：`file_path` 列正式化
