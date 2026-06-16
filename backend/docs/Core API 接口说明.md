# Core API 接口说明

本文档记录当前前后端联调用的 Core API。现阶段所有数据来自根目录 `data/` 下的 JSON 表，不连接真实数据库；接口路径和请求/响应结构会作为后续接入 PostgreSQL、对象存储、任务队列和大模型抽取引擎的稳定边界。

## 基础约定

- API 前缀：`/api/v1`
- 默认本地地址：`http://127.0.0.1:8000/api/v1`
- 前端环境变量：
  - `NEXT_PUBLIC_CORE_API_URL`：浏览器端请求地址
  - `CORE_API_URL`：服务端渲染请求地址
- 当前鉴权：`POST /auth/login` 返回本地 JWT；`POST /auth/forgot-password` 返回内部协助单；后续补齐刷新 token、细粒度权限校验和真实密码重置流程。
- 当前存储：根目录 `data/*.json`。后端启动时如果没有数据文件，会从代码内置种子数据初始化；写操作会回写 JSON 表。
- 测试存储：pytest 通过 `INSPECTION_DATA_DIR` 使用临时数据目录，避免污染根目录 `data/`。

## 本地数据表

当前 `data/` 目录包含：

| 文件 | 用途 |
| --- | --- |
| `project_metrics.json` | 项目统计卡片 |
| `projects.json` | 项目列表与项目状态 |
| `deleted_projects.json` | 项目软删除记录，用于日志页恢复 |
| `raw_files.json` | 原始记录文件元数据 |
| `parse_timeline.json` | 默认解析时间线 |
| `parse_events_by_file.json` | 文件级解析事件 |
| `extracted_fields.json` | 默认字段示例 |
| `fields_by_file.json` | 文件级结构化字段 |
| `rule_templates.json` | 规则模板、字段定义和版本 |
| `rule_template_versions.json` | 规则模板版本历史 |
| `report_sections.json` | 报告章节目录与正文 |
| `report_versions.json` | 报告版本历史 |
| `report_deliveries.json` | 报告预览、导出和更正版上传记录 |
| `report_section_meta.json` | 报告章节类别、更正版文件名等章节元信息 |
| `users.json` | 用户列表 |
| `user_preferences.json` | 用户工作台偏好，例如当前项目 |
| `messages.json` | 系统消息 |
| `operation_logs.json` | 操作日志 |

这些文件只是开发期轻量数据层。后续接入数据库时，应保持 API 响应结构稳定，把文件读写替换为 repository/ORM 实现。

## 系统与登录

### `GET /health`

用途：健康检查。用于本地启动验证、部署探针和联调前确认服务可访问。

响应：

```json
{
  "status": "ok",
  "service": "inspection-report-core-api",
  "environment": "local"
}
```

### `POST /auth/login`

用途：登录系统，后续进入工作台。

请求：

```json
{
  "username": "zhanggong",
  "password": "report-demo"
}
```

响应：

```json
{
  "ok": true,
  "accessToken": "<jwt>",
  "user": {
    "id": "u1",
    "name": "张工",
    "role": "编制员",
    "department": "检测一部",
    "status": "启用",
    "lastLogin": "2024-05-20 10:05"
  }
}
```

### `POST /auth/forgot-password`

用途：忘记密码页面提交内部协助申请，当前返回开发期协助单号。

请求：

```json
{
  "account": "zhanggong",
  "contact": "zhanggong@example.com"
}
```

响应：

```json
{
  "ticketId": "PWD-0001",
  "message": "已生成密码协助申请，请联系系统管理员完成核验。",
  "expiresInMinutes": 30
}
```

### `GET /auth/me`

用途：根据 `Authorization: Bearer <token>` 返回当前登录会话，用于前端刷新页面后校验本地 session。

### `GET /auth/preferences`

用途：读取当前登录用户的工作台偏好。当前用于恢复跨会话的当前项目选择，数据来自 `data/user_preferences.json`。

响应：

```json
{
  "userId": "u1",
  "currentProjectId": "p1"
}
```

### `PATCH /auth/preferences`

用途：更新当前登录用户的工作台偏好。若 `currentProjectId` 不存在，会清空该字段。

请求：

```json
{
  "currentProjectId": "p2"
}
```

### `POST /auth/logout`

用途：退出登录并写入登录认证操作日志。当前不维护服务端 token 黑名单。

### `GET /system/users`

用途：用户管理页面列表。

### `POST /system/users`

用途：新增用户。

请求：

```json
{
  "name": "新用户",
  "role": "编制员",
  "department": "检测一部",
  "status": "启用"
}
```

### `POST /system/users/import`

用途：批量导入用户。当前返回固定开发期用户；后续应接收导入文件对象 key，并创建导入任务。

### `GET /system/users/export`

用途：导出用户清单。当前返回开发期文件名和用户行数；后续返回对象存储下载地址或导出任务。

响应：

```json
{
  "fileName": "系统用户清单.xlsx",
  "rows": 6,
  "status": "ready"
}
```

### `PATCH /system/users/{user_id}`

用途：编辑用户姓名、角色、部门或状态。

### `PATCH /system/users/{user_id}/status?status=启用|禁用`

用途：启用或禁用账号。

### `GET /system/logs`

用途：日志管理页面列表。当前登录、上传、解析、报告生成、用户管理等动作会写入 `data/operation_logs.json`。

支持查询：

- `q`：按模块、操作人、动作搜索
- `module`：按模块过滤
- `result`：按结果过滤，支持 `成功`、`失败`、`警告`

### `GET /system/logs/export`

用途：导出当前筛选条件下的日志。当前返回开发期文件名和行数；后续返回对象存储下载地址或导出任务。

### `GET /system/logs/{log_id}`

用途：查看日志详情。

## 消息中心

### `GET /messages`

用途：读取当前登录用户的系统消息。支持按当前项目、模块和系统事件展示工作台通知；当前数据来自 `data/messages.json`。

响应：

```json
[
  {
    "id": "m1",
    "title": "平面度检测记录解析完成",
    "content": "必要字段 6/6 已满足报告生成条件，可进入报告生成页面继续处理。",
    "module": "原始记录上传",
    "type": "成功",
    "read": false,
    "time": "2024-05-20 10:35",
    "projectId": "p1"
  }
]
```

### `PATCH /messages/{message_id}/read`

用途：将指定消息标记为已读。当前更新 `data/messages.json`。

### `PATCH /messages/read-all`

用途：将当前消息列表全部标记为已读。当前更新 `data/messages.json`。

## 项目概览

### `GET /projects`

用途：项目列表页面。

### `GET /projects/metrics`

用途：项目统计卡片。

### `POST /projects`

用途：新建项目。当前写入 `data/projects.json`，默认状态为 `待上传`、进度为 `0`，并写入项目管理操作日志。

请求：

```json
{
  "name": "接口联调测试项目",
  "owner": "测试员",
  "type": "综合检测"
}
```

响应：

```json
{
  "id": "p6",
  "name": "接口联调测试项目",
  "code": "PJT-202606130336-006",
  "type": "综合检测",
  "owner": "测试员",
  "status": "待上传",
  "progress": 0,
  "updatedAt": "2026-06-13 03:36"
}
```

### `DELETE /projects/{project_id}`

用途：软删除项目。当前从 `data/projects.json` 移到 `data/deleted_projects.json`，并写入项目管理警告日志。

响应：

```json
{
  "project": {
    "id": "p6",
    "name": "接口联调测试项目",
    "code": "PJT-202606130336-006",
    "type": "综合检测",
    "owner": "测试员",
    "status": "待上传",
    "progress": 0,
    "updatedAt": "2026-06-13 03:36"
  },
  "deletedAt": "2026-06-13 03:40",
  "actor": "管理员",
  "logId": "l12"
}
```

### `GET /projects/deleted`

用途：日志管理页读取已删除项目记录，生成可恢复操作入口。

### `POST /projects/{project_id}/restore`

用途：恢复软删除项目。当前从 `data/deleted_projects.json` 移回 `data/projects.json`，并写入项目管理成功日志。

响应：

```json
{
  "project": {
    "id": "p6",
    "name": "接口联调测试项目",
    "code": "PJT-202606130336-006",
    "type": "综合检测",
    "owner": "测试员",
    "status": "待上传",
    "progress": 0,
    "updatedAt": "2026-06-13 03:45"
  },
  "restored": true
}
```

## 原始记录上传与解析

### `GET /records/files`

用途：原始记录上传页已上传文件列表。

### `GET /records/parse-timeline`

用途：页面初始化时的默认解析时间线。

### `GET /records/files/{file_id}/parse-events`

用途：指定文件解析事件。后续接入 AI Worker 后，该接口应读取任务事件表或任务状态流。

### `GET /records/fields`

用途：默认字段预览。

### `GET /records/fields-by-file`

用途：按文件返回结构化字段集合。记录页初始化时优先使用该接口，保证页面字段来自 `data/fields_by_file.json`，而不是前端复制默认字段。

响应：

```json
{
  "f1": [
    {
      "id": "f1-e1",
      "name": "检验项目",
      "value": "平面度",
      "confidence": 98
    }
  ]
}
```

### `GET /records/files/{file_id}/fields`

用途：指定文件的结构化抽取字段。

### `GET /records/files/{file_id}/preview`

用途：获取已上传文件的预览信息并记录预览操作。后续应返回对象存储的短期签名地址或预览转换任务。

### `POST /records/exports`

用途：导出 Excel、JSON 和内部数据包格式的解析结果。当前返回开发期文件名；后续返回异步导出任务或对象存储下载地址。

### `POST /records/uploads`

用途：批量上传确认后创建解析任务。当前前端只提交文件元数据；后续应改为先上传对象存储，再把对象 key、文件 hash、顺序和检测类型发送给 Core API。

请求：

```json
{
  "files": [
    {
      "name": "主轴精度检测记录.pdf",
      "type": "PDF",
      "size": "2.00 MB",
      "detectedType": "几何精度"
    }
  ]
}
```

响应：

```json
{
  "files": [],
  "parseEvents": {},
  "fields": {}
}
```

后续 AI 对接要求：

- Core API 创建 `parse_job`，状态初始为 `queued`。
- Core API 将任务投递到队列，payload 至少包含 `project_id`、`file_id`、`object_key`、`detected_type`、`template_version`。
- AI Worker 只消费任务并回写事件、字段和错误，不直接面向前端。

### `PATCH /records/files/{file_id}/status`

用途：重试解析或更新解析状态。当前支持 `解析中`、`解析成功`、`解析失败`；更新为 `解析成功` 时会向 `data/parse_events_by_file.json` 写入“字段提取完成”和“结构化结果已写入字段库”事件。

### `PATCH /records/files/{file_id}/type`

用途：人工确认或修改检测类型。

### `PATCH /records/files/{file_id}/fields/{field_id}`

用途：人工修正字段值。

### `POST /records/files/{file_id}/fields`

用途：解析失败后人工补录字段。

### `DELETE /records/files/{file_id}`

用途：删除未锁定文件记录。

## 规则配置

### `GET /rules/templates`

用途：规则配置页初始化模板分类、字段定义、字段详情和版本信息。

响应：

```json
[
  {
    "id": "rt1",
    "category": "几何精度",
    "name": "平面度检测模板",
    "version": "v2.1.0",
    "updatedAt": "2024-05-18",
    "fields": [
      {
        "id": "rf1",
        "name": "检验项目",
        "code": "inspection_item",
        "type": "文本",
        "required": true,
        "source": "固定值",
        "format": "{value}",
        "validation": "必填",
        "example": "平面度"
      }
    ]
  }
]
```

### `POST /rules/templates`

用途：新建规则模板。可选 `baseTemplateId`，用于从已有模板复制字段定义。

请求：

```json
{
  "name": "综合检测模板",
  "category": "综合检测",
  "baseTemplateId": "rt1"
}
```

### `POST /rules/templates/{template_id}/copy`

用途：复制规则模板。当前会复制模板字段定义，生成“原模板名 副本”，并写入 `data/rule_templates.json` 和 `data/rule_template_versions.json`。

### `PATCH /rules/templates/{template_id}`

用途：编辑规则模板名称或分类。

请求：

```json
{
  "name": "平面度检测模板-新版",
  "category": "几何精度"
}
```

### `GET /rules/templates/{template_id}/versions`

用途：读取指定规则模板的版本历史，支撑规则配置页“版本管理”列表。

响应：

```json
{
  "versions": [
    {
      "id": "rtv1",
      "templateId": "rt1",
      "version": "v2.1.0",
      "label": "v2.1.0 生效中",
      "status": "生效中",
      "createdAt": "2024-05-18",
      "actor": "管理员"
    }
  ]
}
```

### `PATCH /rules/templates/{template_id}/fields/{field_id}`

用途：编辑模板字段定义。当前更新 `data/rule_templates.json` 中对应字段，返回更新后的完整模板；版本号不在该接口中递增，需继续调用 `POST /rules/save` 形成正式版本记录。

请求：

```json
{
  "name": "实测值",
  "code": "actual_value",
  "type": "数值",
  "required": true,
  "source": "原始记录",
  "format": "{value} mm",
  "validation": "必填，数值范围 -9999 ~ 9999",
  "example": "0.012"
}
```

### `POST /rules/save`

用途：保存当前模板或字段规则，更新模板版本并写入操作日志。

请求：

```json
{
  "templateId": "rt1",
  "fieldId": "rf3",
  "ruleText": "当实测值 ≤ 标准值时，判定为合格；否则判定为不合格。"
}
```

响应：

```json
{
  "ok": true,
  "message": "规则已保存，并记录版本变更",
  "version": "v2.1.1",
  "template": {
    "id": "rt1",
    "category": "几何精度",
    "name": "平面度检测模板",
    "version": "v2.1.1",
    "updatedAt": "2026-06-13",
    "fields": []
  }
}
```

后续真实实现要求：

- 规则模板、字段定义、判定规则和结论模板应拆表保存。
- 模板发布、归档、回滚必须保留完整版本快照。
- 报告生成和解析任务必须记录使用的模板 ID 与版本号。

## 报告生成

### `GET /reports/workspace`

用途：报告生成页初始化接口。一次性返回章节、版本历史、交付文件记录和章节元信息，前端用它恢复版本列表、章节类别和已上传更正版状态。

响应：

```json
{
  "sections": [],
  "versions": [
    {
      "id": "initial-1",
      "label": "V1.0 系统 生成初稿",
      "createdAt": "2024-05-20 11:00",
      "actor": "系统",
      "kind": "initial"
    }
  ],
  "deliveries": [
    {
      "id": "d1",
      "kind": "preview",
      "scope": "report",
      "fileName": "智能制造产线项目检测报告.pdf",
      "format": "pdf",
      "status": "ready",
      "sectionId": null,
      "createdAt": "2024-05-20 11:18"
    }
  ],
  "sectionMeta": {
    "s1": {
      "sectionId": "s1",
      "categoryId": "cover",
      "revisionName": null
    }
  }
}
```

### `GET /reports/sections`

用途：报告生成页初始化目录和章节内容。

### `POST /reports/generate`

用途：根据当前项目字段、章节类别和模板生成报告初稿。当前不调用真实大模型，会用固定业务内容更新 `data/report_sections.json`，并写入 `data/report_versions.json` 与 `data/report_deliveries.json`。

请求：

```json
{
  "projectId": "p1",
  "sectionCategories": {
    "s1": "cover",
    "s2": "conclusion"
  }
}
```

后续 AI 对接要求：

- Core API 汇总项目字段、规则模板、章节类别和用户修订内容。
- Core API 创建报告生成任务，可同步返回当前任务状态，也可在任务完成后返回章节内容。
- AI Worker 只负责生成章节草稿、质量建议和转换输入，不直接控制版本、权限和审计日志。

### `POST /reports/sections`

用途：新增人工章节。

### `PATCH /reports/sections/order`

用途：拖拽目录后保存章节顺序。

### `PATCH /reports/sections/{section_id}`

用途：保存章节内容、状态或类别。传入 `categoryId` 时会更新 `data/report_section_meta.json`。

### `DELETE /reports/sections/{section_id}`

用途：删除章节。

### `POST /reports/sections/{section_id}/revision`

用途：上传章节更正版 Word 后登记版本。当前记录更正版文件名到 `data/report_section_meta.json`，写入 `data/report_versions.json` 和 `data/report_deliveries.json`；后续应关联对象存储文件和 PDF 转换任务。

### `POST /reports/drafts`

用途：保存草稿版本。当前写入 `data/report_versions.json`。

### `POST /reports/exports`

用途：导出 Word 或 PDF。当前返回开发期文件名并写入 `data/report_deliveries.json`；后续返回对象存储下载地址或异步导出任务。

### `POST /reports/previews`

用途：登记整份报告或指定章节的 PDF 预览动作。当前写入 `data/report_deliveries.json`；后续应返回 PDF 转换任务状态和预览文件地址。

### `POST /reports/versions/rollback`

用途：将报告回退至指定版本，并返回回退后的章节快照。当前写入 `data/report_versions.json`；后续由版本表保存完整章节快照、操作人和变更说明。

### `POST /reports/submit`

用途：提交报告进入审核状态。当前将 `data/projects.json` 中默认项目更新为 `待审核`，并写入操作日志；后续应创建审核流转记录、锁定报告版本并发送消息通知。

响应：

```json
{
  "ok": true,
  "status": "待审核"
}
```
