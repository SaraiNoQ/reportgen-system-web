# Inspection Report Core API

智能检测报告生成系统的 Core API 后端。该服务负责登录认证、用户管理、项目管理、文件元数据、规则配置、报告草稿、操作日志和解析任务编排；OCR、文档解析和大模型字段抽取由独立 Python Worker 执行。

当前开发期数据层使用仓库根目录 `data/` 下的 JSON 表。后端启动时如果数据文件不存在，会自动用种子数据初始化；接口写操作会同步回写对应 JSON 文件。pytest 使用临时 `INSPECTION_DATA_DIR`，不会污染根目录数据。

## 本地启动

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
  api/          HTTP 路由
  core/         配置、安全、异常、日志
  db/           数据库连接和迁移入口
  models/       SQLAlchemy 模型
  repositories/ 数据访问层
  schemas/      Pydantic 入参和出参
  services/     业务服务
  storage/      MinIO/S3 文件访问
  tasks/        Celery 任务投递和消费入口
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

完整请求和响应结构见 `docs/Core API 接口说明.md`。

## 当前 JSON 表

根目录 `data/` 当前包含项目、软删除项目、文件、解析事件、字段、规则模板、规则版本、报告章节、报告版本、交付记录、章节元信息、用户、用户偏好、消息和操作日志等表。新增接口时应同步更新 `app/services/mock_store.py`、`app/schemas/domain.py`、路由、测试和 `docs/Core API 接口说明.md`。
