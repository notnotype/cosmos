---
parent: docs/spec/interfaces/0005-web-client.md
range: 重建验收、实现与测试锚点
sealed_at: 2026-10-26
tags: [spec, web-client, acceptance]
tokens_est: 2683
---

## 重建验收

1. 使用空 `NEXT_PUBLIC_COSMOS_API_URL` 启动 Web，观察初始化请求为同源 `/api/v1/feed` 与
   `/api/v1/sources`，页面先显示 loading，成功后显示四个状态卡和 Feed/Source 内容。
2. 打开“新建计划”，观察 `GET /api/v1/source-definitions` 读取与字段渲染（默认 `source.rss@1`
   的 `feedUrl` 必填、定时默认 30 分钟）；切到 `source.bilibili@1`，观察 `mode` 渲染为
   选择框、`limit` 渲染为数字、认证提示出现，且切换定义清空上一组字段。让 catalog 请求失败，
   观察表单错误与“重试读取”。填写合法值后点击
   “测试配置”，观察 `POST /api/v1/source-config-probes` 与按间隔的
   `GET /api/v1/source-config-probes/:jobId` 轮询，成功显示抓取条数与样例标题，且没有
   `POST /api/v1/sources`。点击“保存计划（停用）”后观察创建请求不含 enabled、表单关闭，
   计划列表新增停用计划。对停用计划点击启用，观察
   `PATCH /api/v1/collection-plans/:id`（body 含 `enabled` 与计划自身的 `baseRevisionId`）
   后计划变为启用。
3. 对 enabled Source 点击录入，观察 POST `/api/v1/sources/:id/runs`，queued/running 时
   notice 包含 Run id；disabled Source 的录入按钮不可点击，且 API 对未启用 Source 的手动
   Run 返回 409 conflict。对同一来源点击停用，观察 activation command 以
   `...:disable` 幂等键发送；在列表过期时并发修改可复现 409 conflict 提示与列表刷新。
   来源健康行内文案跟随状态变化：停用且配置定时显示“已停用，定时抓取暂停”，启用后显示
   “每 30 分钟自动抓取”（与表单默认一致），无定时的启用来源显示“未配置定时，仅手动录入”。
4. 输入 text/source/date 搜索，观察日期边界为 UTC 当日开始/结束、结果替换 Feed、保存
   nextCursor；点击加载更多，观察新 items 追加而不是覆盖。点选一个分类 chip 后搜索，观察
   请求带 `labelIds` 且筛选区回显“分类：<名称>”；把该条件保存为视图、清除筛选后套用视图，
   观察分类条件与结果一起恢复。
5. SSE 收到 `feed.updated.v1`、`run.queued.v1` 或 Run/Job 终态事件时观察 Feed 自动 refresh；
   收到 `run.failed.v1` 时观察失败 notice；收到
   `snapshot_required` 时只观察指定 notice、没有自动 refresh；触发 EventSource error 时观察
   “SSE 不可用”，且不发生自动重连。
6. 点击 Story 后观察 Story title、类型/subtype 徽章、来源成员列表、时间线事件（来源名 + 事件类型 + 时间）、
   最新正文、Entry、Revision、Observation 展开；给两条 Story 打同一分类后重新打开，观察
   “相关内容”列出对方并标注“共享分类：<名称>”，且不把当前 Story 列进自己；把另一条 Story
   的条目作为证据加入后观察“证据来源”出现该项并标注关系类型，解除后消失；更新标题后标题
   与 Revision 变化、归并后来源成员数增加、旧 Story id 打开仍显示 canonical；Story 404/
   网络失败只显示 error，不显示空的 Story panel；点击关闭移除 panel。受管理 subtype 目录
   加载后，编辑表单的 subtype 下拉只列出当前类型的注册项（含「无 subtype」）；把类型改为
   媒体并选中「漫画」保存后，标题旁徽章显示「漫画」，且用 API 直接提交未注册 subtype
   返回 400 且 Story 保持上一次保存的状态（ADR-0013）。
7. 点击检查服务，观察 health card 更新为 `service · workerStatus`，notice 包含
   `storageStatus`；让 health 请求非 2xx，观察 error 文本包含 HTTP status。
8. 刷新浏览器或卸载页面，观察所有 React/SSE 状态重新初始化，且除主题偏好外没有
   localStorage/IndexedDB/URL 持久 cursor；Next rewrite 将 `/api/*` 转到配置 API host。
9. 清空 `cosmos.theme.preference.v1` 后分别以系统浅色/深色加载首页，观察 `<html>`
   首帧即为对应明暗外观；点击“暗色”后 storage 写入并在刷新与系统
   变化下保持；切回“跟随系统”后 key 删除并即时跟随系统。

## 实现与测试锚点

- 外壳（顶栏 + 悬浮侧栏）、路由组与十个页面：[`apps/web/src/app/(shell)/layout.tsx`](../../../../apps/web/src/app/%28shell%29/layout.tsx)、
  [`(reading)/layout.tsx`](../../../../apps/web/src/app/%28reading%29/layout.tsx) 与各路由目录；首页看板是
  [`(shell)/page.tsx`](../../../../apps/web/src/app/%28shell%29/page.tsx)，信息库与检索是
  [`(shell)/library/page.tsx`](../../../../apps/web/src/app/%28shell%29/library/page.tsx)，读一条内容是
  [`(reading)/stories/[id]/story-reading.tsx`](../../../../apps/web/src/app/%28reading%29/stories/%5Bid%5D/story-reading.tsx)。
- 外壳级单条 SSE、事件→topic 映射与 300 ms 合并：[`components/shell/live-provider.tsx`](../../../../apps/web/src/components/shell/live-provider.tsx) 与
  [`live-coalesce.ts`](../../../../apps/web/src/components/shell/live-coalesce.ts)。
- 集中文案与禁用词门禁：[`apps/web/src/copy/messages.ts`](../../../../apps/web/src/copy/messages.ts)、
  [`copy/scan.ts`](../../../../apps/web/src/copy/scan.ts) 与 [`copy/messages.test.ts`](../../../../apps/web/src/copy/messages.test.ts)。
- 版面与预算门禁：[`e2e/browser/layout-and-budget.spec.ts`](../../../../e2e/browser/layout-and-budget.spec.ts)；
  详情页编辑中不被覆盖：[`e2e/browser/story-live-refresh.spec.ts`](../../../../e2e/browser/story-live-refresh.spec.ts)。
- 文档 metadata、lang、字体、主题引导与 Provider：[`apps/web/src/app/layout.tsx`](../../../../apps/web/src/app/layout.tsx)。
- 外观主题合同/Provider/引导脚本：[`apps/web/src/theme/theme.ts`](../../../../apps/web/src/theme/theme.ts)、
  [`theme-provider.tsx`](../../../../apps/web/src/theme/theme-provider.tsx)、
  [`theme-bootstrap.ts`](../../../../apps/web/src/theme/theme-bootstrap.ts) 与
  [`theme.test.ts`](../../../../apps/web/src/theme/theme.test.ts)。
- 三态外观切换器及其实验室登记：[`components/cosmos/theme-switcher.tsx`](../../../../apps/web/src/components/cosmos/theme-switcher.tsx)、
  [`component-lab/registry.tsx`](../../../../apps/web/src/component-lab/registry.tsx)。
- 主题浏览器回归：[`e2e/browser/theme.spec.ts`](../../../../e2e/browser/theme.spec.ts)、
  [`e2e/component-lab/theme.spec.ts`](../../../../e2e/component-lab/theme.spec.ts)。
- Web server instrumentation、logger cache、register/onRequestError：[`apps/web/src/instrumentation.ts`](../../../../apps/web/src/instrumentation.ts)。
- instrumentation lifecycle/redaction test：[`apps/web/src/instrumentation.test.ts`](../../../../apps/web/src/instrumentation.test.ts)。
- 全局 Tailwind/theme 样式：[`apps/web/src/app/globals.css`](../../../../apps/web/src/app/globals.css)。
- 时间线投影与相关内容组合：[`apps/web/src/lib/story-timeline.ts`](../../../../apps/web/src/lib/story-timeline.ts)、
  [`related-stories.ts`](../../../../apps/web/src/lib/related-stories.ts) 与同目录
  `story-timeline.test.ts`、`related-stories.test.ts`。
- Story 表示的表单映射与显示口径：[`apps/web/src/lib/story-time-range-draft.ts`](../../../../apps/web/src/lib/story-time-range-draft.ts)、
  [`story-event-time.ts`](../../../../apps/web/src/lib/story-event-time.ts) 与同目录
  `story-time-range-draft.test.ts`、`story-event-time.test.ts`；渲染与编辑器在
  [`components/cosmos/story-panel/representation.tsx`](../../../../apps/web/src/components/cosmos/story-panel/representation.tsx)、
  [`representation-form.tsx`](../../../../apps/web/src/components/cosmos/story-panel/representation-form.tsx)。
- 分类/Topic 浏览、时间线与相关内容的浏览器回归：
  [`e2e/browser/phase2-organization.spec.ts`](../../../../e2e/browser/phase2-organization.spec.ts)。
- class merge utility：[`apps/web/src/lib/utils.ts`](../../../../apps/web/src/lib/utils.ts)。
- Next rewrite/output/logging：[`apps/web/next.config.ts`](../../../../apps/web/next.config.ts)。
- Web scripts/dependencies：[`apps/web/package.json`](../../../../apps/web/package.json)。
- HTTP URL/schema/error/SSE behavior：[`packages/transport-http/src/client-base.ts`](../../../../packages/transport-http/src/client-base.ts)、[`packages/transport-http/src/client-platform.test.ts`](../../../../packages/transport-http/src/client-platform.test.ts)。
- Shared form/response contracts：[`packages/contracts/src/base.ts`](../../../../packages/contracts/src/base.ts)、[`packages/contracts/src/index.ts`](../../../../packages/contracts/src/index.ts)。
