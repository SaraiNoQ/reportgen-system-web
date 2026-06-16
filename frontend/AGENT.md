# 前端协作说明

## 项目定位

本项目是“智能检测报告生成系统”的大前端工程。当前阶段目标是建立已接入 Core API、可演示、可迭代的 Next.js 前端工作台，覆盖登录、项目管理、原始记录上传与解析、规则配置、报告生成、用户管理和日志管理。

## 开发原则

- 需求优先级：`docs/需求规格说明书.md` 高于 Figma 初版原型；视觉风格以 `DESIGN.md` 为基础，但可根据业务工作台密度要求调整圆角、间距和组件尺寸。
- 当前已接入本地 Core API，后端使用根目录 `data/` 下的 JSON 表持久化项目、文件、字段、规则、报告、用户、用户偏好、消息和日志数据；大模型解析、真实 Word 导出和完整鉴权仍先不实现。
- 页面结构保持工具型后台风格，桌面端优先，复杂表格允许横向滚动。
- 代码变更应优先复用 `src/components/ui`、`src/components/layout` 和 `src/lib/services/api.ts` 的既有模式。

## 当前页面范围

- `/login`：登录入口。
- `/forgot-password`：账号协助申请。
- `/records`：原始记录上传与解析，登录后默认进入。
- `/rules`：规则配置与模板管理。
- `/reports`：报告生成与编辑。
- `/projects`：项目管理，位于左侧“管理”折叠菜单。
- `/system/users`：用户管理，位于左侧“管理”折叠菜单。
- `/system/logs`：日志管理，位于左侧“管理”折叠菜单。
- `/account`：账号信息、消息中心和当前项目切换。

`/dashboard` 和 `/review` 不属于当前需求范围，前端页面已移除。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

## 目录约定

- `src/app`：Next.js App Router 页面。
- `src/components/ui`：基础 UI 组件。
- `src/components/layout`：业务 Shell、左侧导航、顶部栏。
- `src/components/pages`：带交互状态的页面级客户端组件。
- `src/lib/types`：前端领域类型。
- `src/lib/mock`：后端不可用时的只读 fallback 和演示种子。
- `src/lib/services`：Core API adapter，对页面暴露稳定调用边界。
- `docs`：需求、规范、技术栈和开发流程文档。**每次开发新功能前，必须仔细阅读docs/目录下的规范和相关文档。**

## 接口联调约定

- 前端页面只通过 `src/lib/services/api.ts` 调用 Core API。
- 默认后端地址为 `http://127.0.0.1:8000/api/v1`，可通过 `NEXT_PUBLIC_CORE_API_URL` 或 `CORE_API_URL` 覆盖。
- 服务端页面初始化和浏览器端交互都应使用同一套 adapter；后端不可用时，少量只读接口可保留本地 fallback 以保证页面可打开。
