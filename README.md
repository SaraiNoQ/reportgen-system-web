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
│        backend/app/services/mock_store.py             │
└──────────────────────┬───────────────────────────────┘
                       │  read / write
                       ▼
┌──────────────────────────────────────────────────────┐
│                  Data Layer (dev)                     │
│                  data/*.json                          │
│   projects · users · rules · reports · logs · ...    │
└──────────────────────────────────────────────────────┘
```

- **Frontend** talks only through `src/lib/services/api.ts` — never touches data directly.
- **Backend** serves REST endpoints, persists to local JSON in development; designed to swap in PostgreSQL + MinIO + Celery when ready.
- **Data** is a set of flat JSON tables under `data/` — the dev-era database; pytest uses a temp directory so tests never pollute real data.

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
│   │   ├── api/v1/             Route modules (auth, projects, records, ...)
│   │   ├── core/               Config, security, settings
│   │   ├── schemas/            Pydantic request / response models
│   │   ├── services/           Business logic & mock JSON store
│   │   ├── models/             SQLAlchemy models (for future DB)
│   │   └── tasks/              Celery task stubs
│   └── docs/                   Backend specs, API docs, dev guide
│
├── data/                       Dev JSON data tables
│   ├── projects.json           Active projects
│   ├── users.json              System users
│   ├── reports.json            Generated reports & versions
│   ├── rules.json              Rule templates & configs
│   └── ...                     Messages, logs, preferences, etc.
│
├── AGENTS.md                   Agent collaboration guide
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start / 快速开始

### Prerequisites / 环境要求

- **Node.js** ≥ 18 &nbsp;|&nbsp; **pnpm** ≥ 9
- **Python** ≥ 3.11 &nbsp;|&nbsp; **uv** (Python package manager)

### 1. Backend / 后端

```bash
cd backend
uv sync                           # install dependencies
cp .env.example .env              # configure environment
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

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
| `api/v1/system/*` | User management, operation logs |
| `api/v1/messages/*` | In-app user messages |

Full request/response schemas: [`backend/docs/Core API 接口说明.md`](backend/docs/Core%20API%20接口说明.md)

---

## 📖 Documentation / 文档

| Document / 文档 | Scope / 范围 |
|:---|:---|
| [`AGENTS.md`](AGENTS.md) | Full project agent collaboration guide — 项目协作说明 |
| [`frontend/docs/需求规格说明书.md`](frontend/docs/需求规格说明书.md) | System requirements spec — 系统需求规格 |
| [`frontend/docs/前端需求说明.md`](frontend/docs/前端需求说明.md) | Frontend scope & modules — 前端需求范围 |
| [`frontend/docs/前端开发规范SPEC.md`](frontend/docs/前端开发规范SPEC.md) | Frontend coding conventions — 前端开发规范 |
| [`frontend/CLAUDE.md`](frontend/CLAUDE.md) | Frontend collaboration quick reference — 前端协作说明 |
| [`backend/README.md`](backend/README.md) | Backend startup & directory guide — 后端启动和目录说明 |
| [`backend/docs/后端需求说明.md`](backend/docs/后端需求说明.md) | Backend requirements — 后端需求说明 |
| [`backend/docs/后端开发规范.md`](backend/docs/后端开发规范.md) | Backend coding conventions — 后端开发规范 |

---

## 🗺 Roadmap / 路线图

- [x] Frontend workbench with 9 pages
- [x] FastAPI Core API with JSON data layer
- [x] Monorepo history consolidation
- [ ] PostgreSQL + Alembic migration
- [ ] Celery task workers (OCR / LLM extraction)
- [ ] MinIO object storage for raw files
- [ ] Real Word / PDF report export
- [ ] Full RBAC with role-based access control
- [ ] CI/CD pipeline
- [ ] Docker Compose one-command startup

---

## 📝 License

MIT — see [LICENSE](LICENSE) for details.
