# 项目协作说明

## 项目定位

本仓库是“智能检测报告生成系统”的前后端工程目录，目标是支撑机床检测原始记录上传、解析、规则配置、报告生成、用户管理和日志管理等业务闭环。

当前实现重点：

- `frontend/`：Next.js 前端工作台，已通过 `src/lib/services/api.ts` 接入 Core API；`src/lib/mock/data.ts` 仅作为后端不可用时的少量只读 fallback 和演示种子。
- `backend/`：FastAPI Core API 后端，提供登录、用户、项目、规则、报告、日志等业务接口；当前以根目录 `data/` 下的 JSON 表作为轻量数据层，后续接入数据库、对象存储、任务队列和 AI Worker。
- `data/`：开发期本地数据表，保存项目、项目软删除记录、文件、字段、规则模板、报告章节、报告版本、交付记录、用户、用户偏好、消息和日志等 JSON 数据。

前端不直接调用文档解析或大模型能力。后续真实链路应由前端调用 Core API，Core API 再编排解析任务和 AI Worker。

## 目录结构

```text
backend/
  app/                  FastAPI 应用代码
  docs/                 后端需求、规范、接口和流程文档
  tests/                后端测试
  README.md             后端启动和目录说明

data/
  *.json                开发期本地数据表，由后端启动和写操作维护

frontend/
  src/app/              Next.js App Router 页面
  src/components/ui/    基础 UI 组件
  src/components/layout/业务 Shell、导航和布局组件
  src/components/pages/ 页面级客户端交互组件
  src/lib/types/        前端领域类型
  src/lib/mock/         前端 fallback 与演示种子数据
  src/lib/services/     Core API adapter
  docs/                 前端需求、规范、技术栈、流程和需求规格文档
  AGENT.md              前端协作说明
  CLAUDE.md             前端协作说明副本
  DESIGN.md             视觉风格参考
```

## 前端文档与规范入口

开发 `frontend/` 前必须先阅读并遵循以下文档。若文档之间存在冲突，按优先级从高到低处理：

1. `frontend/docs/需求规格说明书.md`：系统主需求规格，覆盖登录、用户、日志、项目、原始记录、规则配置和报告生成等模块。
2. `frontend/docs/前端需求说明.md`：当前前端阶段的范围、角色、模块、导航要求和非目标。
3. `frontend/docs/前端开发规范SPEC.md`：路由、组件、样式、数据接口、交互和质量规范。
4. `frontend/docs/开发流程.md`：页面开发、UI 调整、验证和后端接入流程。
5. `frontend/docs/技术栈说明.md`：Next.js、React、TypeScript、Tailwind CSS v4、Core API adapter 等技术边界。
6. `frontend/AGENT.md` 或 `frontend/CLAUDE.md`：前端协作原则、当前页面范围、命令和目录约定。
7. `frontend/DESIGN.md`：视觉风格参考。当前工作台实现可根据业务密度调整圆角、间距和组件尺寸，但应保留 cream canvas、charcoal text、mono UI、serif heading 的基础体系。

`frontend/docs/规则文档终版.pdf` 和 `frontend/docs/figures/` 是需求图示与业务规则参考资料，涉及规则配置、原始记录解析或报告生成时应一并查看。

## 前端当前范围

当前前端页面范围以 `frontend/docs/前端需求说明.md` 和 `frontend/AGENT.md` 为准：

- `/login`：系统登录。
- `/forgot-password`：账号协助申请。
- `/records`：原始记录上传与解析，登录后默认进入。
- `/rules`：规则配置与模板管理。
- `/reports`：报告生成与编辑。
- `/projects`：项目管理，位于左侧“管理”折叠菜单。
- `/system/users`：用户管理，位于左侧“管理”折叠菜单。
- `/system/logs`：日志管理，位于左侧“管理”折叠菜单。
- `/account`：账号信息、消息中心和当前项目切换。

`/dashboard` 和 `/review` 不属于当前前端需求范围。

## 前端实现约定

- 页面文件尽量保持 server component，交互状态下沉到 `src/components/pages` 中的 client component。
- 新页面和新交互优先复用 `src/components/ui`、`src/components/layout` 和 `src/lib/services/api.ts` 的既有模式。
- 页面只调用 `src/lib/services/api.ts` 暴露的 adapter，不直接读取 `src/lib/mock/data.ts`。
- 类型定义放在 `src/lib/types/domain.ts`，演示种子和只读 fallback 数据放在 `src/lib/mock/data.ts`。
- 当前不实现真实二进制上传、真实 OCR、真实 LLM 调用、真实 Word 导出和完整鉴权；相关动作先通过 Core API 的元数据、状态和导出任务边界表达。
- 复杂表格允许横向滚动，优先保证工作台的信息密度、可扫描性和桌面端体验。

## 后端文档入口

后端开发前阅读：

- `backend/README.md`：本地启动和后端目录说明。
- `backend/docs/后端需求说明.md`：Core API、AI Worker、模块和接口边界。
- `backend/docs/后端开发规范.md`：分层、命名、接口、数据库、权限、日志、AI 边界和测试规范。
- `backend/docs/Core API 接口说明.md`：当前前后端联调用 API。
- `backend/docs/技术栈说明.md`：FastAPI、Pydantic、SQLAlchemy、Celery、Redis、MinIO/S3 等技术选择。
- `backend/docs/开发流程.md`：接口设计、数据建模、实现顺序和验证流程。

## 常用命令

前端：

```bash
cd frontend
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

后端：

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
uv run ruff check .
uv run pytest
```

## 验证要求

前端较大修改后至少运行：

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm build
```

涉及 UI 改动时启动 `pnpm dev`，检查：

- `/login`
- `/forgot-password`
- `/account`
- `/records`
- `/rules`
- `/reports`
- `/projects`
- `/system/users`
- `/system/logs`

后端修改后至少运行：

```bash
cd backend
uv run ruff check .
uv run pytest
```

涉及接口变更时同步更新 `backend/docs/Core API 接口说明.md`，并确认前端 `frontend/src/lib/services/api.ts` 的 adapter 边界是否需要调整。

## 数据层约定

- 当前不要直接引入真实数据库；后端通过 `backend/app/services/mock_store.py` 读写根目录 `data/*.json`。
- 新增业务集合时，应同步增加 schema、store 读写、API 路由、接口文档和必要的前端 adapter。
- pytest 使用临时 `INSPECTION_DATA_DIR`，不会污染根目录 `data/`；手动启动后端时默认读写根目录 `data/`。
