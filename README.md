# Inspection Report Generation System &middot; 智能检测报告生成系统

**A full-stack workbench for machine tool inspection — upload raw records, configure rules, generate structured reports.**

**面向机床检测行业的工作台系统，覆盖原始记录上传、规则配置、报告生成全流程。**

<br>

<p align="center">
  <img src="https://img.shields.io/badge/status-prototype-orange?style=flat-square" alt="status" />
  <img src="https://img.shields.io/badge/frontend-Next.js%2015-000000?style=flat-square" alt="frontend" />
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square" alt="backend" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
</p>

---

## ✨ Features / 功能

| Module / 模块 | Description / 描述 |
|:---|:---|
| 🔐 **Auth / 登录认证** | Login, password recovery, account settings with message center |
| 📂 **Project Management / 项目管理** | Create, soft-delete, and configure inspection projects |
| 📄 **Raw Records / 原始记录** | Upload inspection records, track parse status, view extracted fields |
| ⚙️ **Rule Configuration / 规则配置** | Define rule templates, map fields, version rule sets for report generation |
| 📊 **Report Generation / 报告生成** | Generate structured reports, preview sections, version deliverables |
| 👥 **User Management / 用户管理** | Admin panel for system user accounts and role assignment |
| 📋 **Operation Logs / 日志管理** | Browse system-wide operation audit trails |

> **Current scope:** Frontend workbench + Core API with local JSON data layer.  
> **Planned:** Real OCR / LLM field extraction, Word/PDF export, Celery task workers, PostgreSQL, MinIO object storage.

---

## 🧱 Architecture / 架构

```
┌──────────────────────────────────────────────────────┐
│                   Frontend Workbench                  │
│                Next.js 15 · React 19                  │
│           src/lib/services/api.ts (adapter)           │
└──────────────────────┬───────────────────────────────┘
                       │  HTTP REST  /api/v1/*
                       ▼
┌──────────────────────────────────────────────────────┐
│                     Core API                          │
│              FastAPI · Pydantic · uv                   │
│        backend/app/api/v1/  (routes)                  │
│        backend/app/services/  (business logic)         │
│        backend/app/services/manifest_builder.py        │
└──────────────────────┬───────────────────────────────┘
                       │  orchestrates
                       ▼
┌──────────────────────────────────────────────────────┐
│               Gen-Report Workflow                     │
│      validate → prepare → extract → generate          │
│        backend/app/services/gen_report_service.py     │
└──────────────────────┬───────────────────────────────┘
                       │  read / write
                       ▼
┌──────────────────────────────────────────────────────┐
│                  Data Layer                           │
│        data/*.json (dev)  ·  PostgreSQL (Alembic)     │
│   projects · users · rules · reports · logs · ...    │
└──────────────────────────────────────────────────────┘
```

- **Frontend** talks only through `src/lib/services/api.ts` — never touches data directly.
- **Backend** serves REST endpoints and orchestrates the gen-report workflow (manifest building, field extraction, report generation). Data persists to local JSON in mock mode or PostgreSQL via `postgres_store.py`; `STORAGE_BACKEND` env var selects the backend.
- **Gen-Report Workflow** drives the four-stage pipeline (validate → prepare → extract → generate) with run-level state, workspace directories, and approval flow.
- **Data** is a set of flat JSON tables under `data/` for mock mode, or PostgreSQL tables managed by Alembic migrations for production. pytest uses a temp directory so tests never pollute real data.

---

## 🗂 Project Structure / 目录结构

```
.
├── frontend/                   Next.js 15 frontend workbench
│   ├── src/
│   │   ├── app/                App Router pages (login, records, rules, reports, ...)
│   │   ├── components/
│   │   │   ├── ui/             Primitive UI components
│   │   │   ├── layout/         Shell, sidebar, topbar
│   │   │   └── pages/          Page-level client components
│   │   └── lib/
│   │       ├── services/       Core API adapter (api.ts)
│   │       ├── types/          TypeScript domain types
│   │       └── mock/           Read-only fallback & demo seeds
│   └── docs/                   Frontend specs, workflows, design docs
│
├── backend/                    FastAPI Core API
│   ├── app/
│   │   ├── api/v1/             Route modules (auth, projects, records, gen-report, ...)
│   │   ├── core/               Config, security, settings
│   │   ├── models/             SQLAlchemy models
│   │   ├── repositories/       Data access layer
│   │   ├── schemas/            Pydantic request / response models
│   │   ├── services/           Business logic, mock_store, postgres_store, gen_report_service, manifest_builder
│   │   └── tasks/              Celery task stubs
│   ├── alembic/                Database migrations (file_path, section, parse_run metadata)
│   ├── tests/                  API and service tests
│   └── docs/                   Backend specs, API docs, dev guide
│
├── data/                       Dev JSON data tables (mock mode)
│   ├── projects.json           Active projects
│   ├── users.json              System users
│   ├── reports.json            Generated reports & versions
│   ├── rules.json              Rule templates & configs
│   └── ...                     Messages, logs, preferences, fields, deliveries, ...
│
├── docs/                       Project-level design & integration docs
│   ├── gen-report-api-integration.md   Gen-report API architecture & endpoint catalog
│   └── superpowers/plans/              Implementation plans
│
├── dev.sh                      One-command full-stack dev launcher (deps + PG + migrate + seed + serve)
├── AGENTS.md                   Agent collaboration guide
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start / 快速开始

### Prerequisites / 环境要求

- **Node.js** ≥ 18 &nbsp;|&nbsp; **pnpm** ≥ 9
- **Python** ≥ 3.11 &nbsp;|&nbsp; **uv** (Python package manager)
- **PostgreSQL** ≥ 14 (optional — mock JSON mode works without it)

### Option A: One-command startup (Recommended) / 一键启动（推荐）

```bash
./dev.sh
```

`dev.sh` handles everything: installs deps (if missing), ensures PostgreSQL is running (when `STORAGE_BACKEND=postgres`), runs Alembic migrations, seeds the database if empty, and starts both backend and frontend with graceful cleanup on `Ctrl+C`.

Options:
```bash
./dev.sh --install     # install deps before starting
./dev.sh --no-migrate  # skip Alembic migrations
./dev.sh --no-seed     # skip database seed check
```

### Option B: Manual startup / 手动分步启动

### 1. Backend / 后端

```bash
cd backend
uv sync                           # install dependencies
cp .env.example .env              # configure environment
uv run alembic upgrade head       # apply migrations (STORAGE_BACKEND=postgres)
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> When `STORAGE_BACKEND=mock` (default), the backend uses `data/*.json` and skips PostgreSQL.

Verify / 验证:

```bash
curl http://127.0.0.1:8000/api/v1/health
```

### 2. Frontend / 前端

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — login page will appear.

> Default API base URL is `http://127.0.0.1:8000/api/v1`.  
> Override with `NEXT_PUBLIC_CORE_API_URL` or `CORE_API_URL` if needed.

---

## 🧪 Checks / 检查

**Frontend:**

```bash
cd frontend
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm build         # Production build
```

**Backend:**

```bash
cd backend
uv run ruff check .
uv run pytest
```

---

## 🎨 Design / 视觉体系

The frontend follows the **Monad** style reference — a quiet editorial aesthetic on warm parchment:

- **Canvas:** Parchment Cream `#f6f3f1`
- **Text:** Charcoal `#242424`, Graphite `#4e4d4d`
- **Surfaces:** Lavender Mist `#cfdaf5` cards
- **Typography:** Serif headings (Source Serif 4 / Lora) + monospace UI text (JetBrains Mono / IBM Plex Mono)

See [`frontend/DESIGN.md`](frontend/DESIGN.md) for the full token reference.

---

## 📄 API Scope / 接口范围

| Prefix / 前缀 | Domain / 领域 |
|:---|:---|
| `api/v1/auth/*` | Login, password recovery, user preferences |
| `api/v1/projects/*` | Project CRUD, metrics |
| `api/v1/records/*` | Raw files, parse events, extracted fields |
| `api/v1/rules/*` | Rule templates, field mapping, versioning |
| `api/v1/reports/*` | Report sections, generation, preview, delivery |
| `api/v1/gen-report/*` | Gen-report workflow: manifest, runs, approval, field setting, generation |
| `api/v1/system/*` | User management, operation logs |
| `api/v1/messages/*` | In-app user messages |

Full request/response schemas: [`backend/docs/Core API 接口说明.md`](backend/docs/Core%20API%20接口说明.md)

---

## 📖 Documentation / 文档

| Document / 文档 | Scope / 范围 |
|:---|:---|
| [`AGENTS.md`](AGENTS.md) | Full project agent collaboration guide — 项目协作说明 |
| [`docs/gen-report-api-integration.md`](docs/gen-report-api-integration.md) | Gen-report API architecture, 14-endpoint catalog, manifest pipeline — gen-report 集成设计 |
| [`frontend/docs/需求规格说明书.md`](frontend/docs/需求规格说明书.md) | System requirements spec — 系统需求规格 |
| [`frontend/docs/前端需求说明.md`](frontend/docs/前端需求说明.md) | Frontend scope & modules — 前端需求范围 |
| [`frontend/docs/前端开发规范SPEC.md`](frontend/docs/前端开发规范SPEC.md) | Frontend coding conventions — 前端开发规范 |
| [`frontend/CLAUDE.md`](frontend/CLAUDE.md) | Frontend collaboration quick reference — 前端协作说明 |
| [`backend/README.md`](backend/README.md) | Backend startup & directory guide — 后端启动和目录说明 |
| [`backend/docs/后端需求说明.md`](backend/docs/后端需求说明.md) | Backend requirements — 后端需求说明 |
| [`backend/docs/后端开发规范.md`](backend/docs/后端开发规范.md) | Backend coding conventions — 后端开发规范 |
| [`backend/docs/Core API 接口说明.md`](backend/docs/Core%20API%20接口说明.md) | Core API endpoint reference (incl. gen-report) — 接口说明 |

---

## 🗺 Roadmap / 路线图

- [x] Frontend workbench with 9 pages
- [x] FastAPI Core API with JSON data layer
- [x] Monorepo history consolidation
- [x] PostgreSQL + Alembic migration (dual mock/postgres store)
- [x] Gen-report workflow API (manifest, runs, approval, generation)
- [x] Records page deep gen-report integration (4-stage progress, section-grouped fields, all-fields modal)
- [ ] Celery task workers (OCR / LLM extraction)
- [ ] MinIO object storage for raw files
- [ ] Real Word / PDF report export
- [ ] Full RBAC with role-based access control
- [ ] CI/CD pipeline
- [ ] Docker Compose one-command startup

---

## 📝 License

MIT — see [LICENSE](LICENSE) for details.
