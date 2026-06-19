# Inspection Report Core API

智能检测报告生成系统的 Core API 后端。该服务负责登录认证、用户管理、项目管理、文件元数据、规则配置、报告草稿、操作日志和 gen-report 工作流编排（manifest 构建、字段提取、报告生成）；OCR、文档解析和大模型字段抽取由独立 Python Worker 执行。

后端支持 mock JSON 和 PostgreSQL 双数据层，通过 `STORAGE_BACKEND` 环境变量切换（`mock` 或 `postgres`）。mock 模式使用仓库根目录 `data/` 下的 JSON 表，启动时如果数据文件不存在会自动用种子数据初始化；postgres 模式通过 `postgres_store.py` 和 `repositories/` 访问数据库，schema 变更由 Alembic 迁移管理。pytest 使用临时 `INSPECTION_DATA_DIR`，不会污染根目录数据。

## 本地启动

推荐使用根目录 `dev.sh` 一键启动（自动处理依赖、PostgreSQL、迁移、种子和前后端服务）：

```bash
./dev.sh
```

或手动启动：

```bash
uv sync
cp .env.example .env
uv run alembic upgrade head  # STORAGE_BACKEND=postgres 时先同步表结构
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/v1/health
```

## 目录

```text
app/
  api/v1/       HTTP 路由（auth, projects, records, gen-report, reports, ...）
  core/         配置、安全、异常、日志
  db/           数据库连接和迁移入口
  models/       SQLAlchemy 模型
  repositories/ 数据访问层
  schemas/      Pydantic 入参和出参
  services/     业务服务（mock_store, postgres_store, gen_report_service, manifest_builder）
  storage/      MinIO/S3 文件访问
  tasks/        Celery 任务投递和消费入口
alembic/        数据库迁移（file_path, section, parse_run metadata）
docs/           后端需求、规范、流程文档
tests/          API 和服务测试
```

## 当前接口范围

- 登录、账号协助和用户偏好：`/api/v1/auth/*`
- 项目与指标：`/api/v1/projects*`
- 系统用户、日志：`/api/v1/system/*`
- 系统消息：`/api/v1/messages*`
- 原始记录、解析事件、字段：`/api/v1/records/*`
- 规则模板与规则保存：`/api/v1/rules/*`
- 报告章节、生成、预览、导出和版本管理：`/api/v1/reports/*`
- gen-report 工作流（manifest、运行、审批、字段设置、报告生成）：`/api/v1/gen-report/*`

完整请求和响应结构见 `docs/Core API 接口说明.md`。

## 数据层

根目录 `data/` 在 mock 模式下包含项目、软删除项目、文件、解析事件、字段、规则模板、规则版本、报告章节、报告版本、交付记录、章节元信息、用户、用户偏好、消息和操作日志等表。postgres 模式下对应表由 Alembic 迁移创建和管理。

新增接口时应同步更新 `app/schemas/domain.py`、`app/services/mock_store.py` 和 `app/services/postgres_store.py`（保持双数据层一致）、`app/models` 和 `alembic/`（如涉及 schema 变更）、路由、测试和 `docs/Core API 接口说明.md`。
