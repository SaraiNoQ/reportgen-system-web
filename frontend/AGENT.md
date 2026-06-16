# 前端协作说明

## 项目定位

本项目是“智能检测报告生成系统”的大前端原型工程。当前阶段目标是建立可演示、可迭代的 Next.js 前端工作台，覆盖登录、项目管理、原始记录上传与解析、规则配置、报告生成、用户管理和日志管理。

## 开发原则

- 需求优先级：`docs/需求规格说明书.md` 高于 Figma 初版原型；视觉风格以 `DESIGN.md` 为基础，但可根据业务工作台密度要求调整圆角、间距和组件尺寸。
- 首期不接真实后端，不实现真实大模型解析、Word 导出和鉴权，只通过 mock 数据与 API adapter 表达接口边界。
- 页面结构保持工具型后台风格，桌面端优先，复杂表格允许横向滚动。
- 代码变更应优先复用 `src/components/ui`、`src/components/layout` 和 `src/lib/services/api.ts` 的既有模式。

## 当前页面范围

- `/login`：登录入口。
- `/records`：原始记录上传与解析，登录后默认进入。
- `/rules`：规则配置与模板管理。
- `/reports`：报告生成与编辑。
- `/projects`：项目管理，位于左侧“管理”折叠菜单。
- `/system/users`：用户管理，位于左侧“管理”折叠菜单。
- `/system/logs`：日志管理，位于左侧“管理”折叠菜单。

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
- `src/lib/mock`：mock 数据。
- `src/lib/services`：API adapter，对页面暴露稳定调用边界。
- `docs`：需求、规范、技术栈和开发流程文档。**每次开发新功能前，必须仔细阅读docs/目录下的规范和相关文档。**
