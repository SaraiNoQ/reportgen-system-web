# 前端开发规范 SPEC

## 目标

建立一个结构清晰、已通过 Core API adapter 接入后端的 Next.js 前端工程。页面应通过统一 adapter 调用后端接口，mock 数据仅作为后端不可用时的少量只读 fallback 和演示种子参考。

## 路由规范

| 路由 | 页面 |
| --- | --- |
| `/login` | 系统登录 |
| `/forgot-password` | 账号协助申请 |
| `/records` | 原始记录上传与解析 |
| `/rules` | 规则配置 |
| `/reports` | 报告生成与编辑 |
| `/projects` | 项目管理 |
| `/system/users` | 用户管理 |
| `/system/logs` | 日志管理 |
| `/account` | 账号信息、消息中心和当前项目切换 |

根路由 `/` 重定向到 `/records`。

## 组件规范

- 基础组件放在 `src/components/ui`。
- 页面 Shell 放在 `src/components/layout`。
- 复杂页面交互组件放在 `src/components/pages`。
- 页面文件尽量保持 server component，交互状态下沉到 client component。
- 新页面应优先复用 `Card`、`Button`、`Input`、`Select`、`Textarea`、`DataTable`、`Badge`、`StatusBadge`。

## 样式规范

- 使用 Tailwind CSS v4 和 `src/app/globals.css` 中的主题 token。
- 视觉保持 cream canvas、charcoal text、mono UI、serif heading 的基础体系。
- 当前后台密度采用紧凑版：
  - 卡片圆角约 16px。
  - 按钮、标签和输入框圆角约 6-10px。
  - 组件 padding 相比初版 Figma/`DESIGN.md` 缩小约 30%。
  - 字体大小不随密度压缩而整体变小。
- 表格、编辑器、配置区优先保证信息密度与可扫描性。

## 数据与接口规范

- 类型定义放在 `src/lib/types/domain.ts`。
- mock 数据放在 `src/lib/mock/data.ts`，仅作为 fallback 和演示种子，不作为页面写操作的数据源。
- 页面只调用 `src/lib/services/api.ts` 暴露的 adapter，不直接读取 mock 数据。
- 后续接入真实数据库、对象存储和 AI Worker 时，保持 adapter 函数签名稳定，替换 Core API 内部实现。

## 交互规范

- 所有接口操作需要给出可见反馈，失败时说明 Core API 状态或当前降级行为。
- 文件上传、解析、保存、提交等动作应优先调用 Core API；只有后端不可用时才允许临时保留页面状态兜底。
- 复杂表格在小屏允许横向滚动，不强行压缩列内容。
- 导航状态必须根据当前路径高亮。

## 质量规范

提交前应至少运行：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

涉及 UI 改动时，应启动本地服务并使用浏览器检查关键页面。
