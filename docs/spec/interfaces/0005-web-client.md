# Web Client

## 状态

当前实现规格；后续代码变化应同步更新本文。本文记录当前 Next.js Web 应用（外壳 + 十个路由，
Task 35 的前端重做；含 Phase 1 采集链路与 Phase 2 组织/看板浏览）、开发态 React 组件实验室
及其与 Product API 的边界。实验室浏览器/生产验收结果只在本轮 Task 与 `PROJECT-STATUS.md`
记录，不把 Docker、真实来源或 Windows smoke 写成已验证能力。

## 最后更新

2026-10-01（Task 35：信息架构、单一明暗轴、外壳级 SSE、集中文案与门禁）。

## 组件定位

Web Client 是 `apps/web/src/app/` 下的一个 client-side Next App Router 应用，由**外壳 + 十个路由**
组成（Task 35 的信息架构，ADR-0029）：外壳是顶栏 + 悬浮侧栏（`(shell)/layout.tsx`）与唯一例外
`(reading)/stories/[id]`（只留顶栏与返回入口）；**悬浮侧栏与整组限宽自 2026-10-03 起随
`--nav-scale` 缩放**（当前 1.25：侧栏 196→245 px，整组 1120→1145 px；主内容区仍 880 px，
行宽不随之变宽，见 [`side-nav.tsx`](../../../apps/web/src/components/shell/side-nav.tsx)）；
1.5 先试用后由维护者收敛到 1.25（2026-10-03）；
**悬浮侧栏跟随滚动**（`sticky top-[calc(4rem+2.5em)]`，2026-10-03），其高度仍由内容撑开
（导航项超过视口高度时底部会被裁，见 ADR-0029 的 Revisit Gate 第 1 条）；十一个路由是 `/`（看板）、`/library`（信息库与检索）、
`/topics`、`/entities`、`/organize`（标签/收藏夹/收藏/批注/已保存视图）、`/automation`
（来源/采集计划/连接/运行记录）、`/models`（模型：服务商凭证与模型目录）、`/settings`、`/system`、
`/stories/:id`（读一条内容）与 `/dev/components`
（组件实验室）。各页只挂载自己那几个域 hook，使用 `HttpCosmosClient` 读取 Feed/Source/Health 与来源定义
Catalog、以未保存配置 Probe 测试 RSS 配置、创建默认停用的 Source、在来源列表行内启用/停用、手动触发
已启用 Source 的 Run、搜索分页，并用 SSE 事件触发刷新。`layout.tsx` 提供中文语言、字体变量、
metadata 和全局样式；`components/ui/*` 是 UI primitive，`lib/utils.ts` 只提供
Tailwind class 合并。`instrumentation.ts` 是 Next server instrumentation：Node runtime
按需创建并缓存一个 `cosmos-web` logger，`register()` 写一次 `web.started`，
`onRequestError` 只写脱敏后的请求元数据和错误对象。

**顶栏的现行取值**（维护者 2026-10-03 四条裁定：太矮、与下方间隔小、与页面底融为一体、白色不好看）：
高度 **64 px**（V4 原文 56，勘误记 [`frontend-redesign-v1`](../../proposals/frontend-redesign-v1.md) 勘误节）；
底色走第 2 层 token **`--surface-toolbar`** = `color-mix(in srgb, var(--cosmos-shadow) 10%, var(--background))`
（亮 `#deddd8` / 暗 `#121513`）：比画布底 `--background` 深一档的暖纸灰，用主题感知的
`--cosmos-shadow`（亮暖褐 / 暗纯黑）染色，两套主题都得到同一档关系，不必写死两组色值；
顶栏标题与状态文字的对比度实测亮 12.2:1、暗 14.9:1。
**不加下边框**（底色已足够区分，再画线是重复表达）；与下方框架留 **2.5em（40 px，该层级字号 16 px）**
间隔——间隔由两个路由组 layout 的 `pt-[2.5em]` 提供，**不放在顶栏自身的底部内边距**
（后者会让 64 px 顶栏里的内容偏上、不再垂直居中）。
`e2e/browser/layout-and-budget.spec.ts` 的 `TOP_BAR_HEIGHT_PX` 与它同步（该常量是「导航不被顶栏压住」的下限）。

页面是本地优先的信息聚合工作台展示层，不直接依赖 Prisma、SQLite、Data Root 或 Blob
Root。服务端路由和共享 DTO 详见 [Product API HTTP](0002-product-api-http.md)，transport
错误与 schema 校验详见 [HTTP Client](0004-http-client.md)。Catalog page、CapabilitiesResponse、
AttemptSnapshot/AttemptPage 与 Asset download 虽由 API 提供，但当前 `HttpCosmosClient`
没有对应方法；本页面也不调用这些边界。

### 在系统中的位置与作用
它是 Cosmos 面向用户的 Next.js 展示层，位于浏览器页面与 `HttpCosmosClient` 之间，负责把 Product API 数据组织成信息聚合工作台。

### 解决的问题
它提供 Feed/Source/Health、搜索、Story 展开、手动 Source Run 和 SSE 刷新等可见交互，同时把数据库、Blob 和 API 细节留在服务端/transport。

### 使用方式
浏览器加载外壳后由 client component 调用 `HttpCosmosClient`；需要刷新时监听 SSE，
配置来源（catalog 读取、未保存配置 Probe、保存停用、行内启用/停用）或触发 Run 也通过
已有 client 方法和 API 路由完成，不直接访问 Prisma。

### 典型情景
本地浏览内容、检查 Source/Health，验证一次未保存配置的探测结果，保存并启用来源后
观察手动/定时 ingest 的页面刷新，验证搜索分页或打开一条 Story；Catalog、Attempt 或
Asset download 中未被 client 封装的部分不由它承担。

## 分册索引

本文件是当前实现规格的参考型清单,按章节拆分为分册(每册 ≤30 KB 且 ≤9k token,封口后只读);主文档只保留状态、组件定位、非目标/边界与下方索引,行为细节按章节查阅分册。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-01](0005-web-client/part-01-concepts-and-definitions.md) | 概念与定义 | 7.3 KB |
| [part-02](0005-web-client/part-02-external-behaviour.md) | 外部行为 | 20.7 KB |
| [part-03](0005-web-client/part-03-input-and-output.md) | 输入、输出 | 11.4 KB |
| [part-04](0005-web-client/part-04-state-and-lifecycle.md) | 状态与持久化、外观主题、状态转换、副作用、错误与降级、依赖、配置 | 9.6 KB |
| [part-05](0005-web-client/part-05-acceptance-and-anchors.md) | 重建验收、实现与测试锚点 | 8.8 KB |
| [part-06](0005-web-client/part-06-component-lab.md) | React 组件实验室 | 5.7 KB |

→ 概念与定义 已归档:[part-01-concepts-and-definitions.md](0005-web-client/part-01-concepts-and-definitions.md)
→ 外部行为 已归档:[part-02-external-behaviour.md](0005-web-client/part-02-external-behaviour.md)
→ 输入、输出 已归档:[part-03-input-and-output.md](0005-web-client/part-03-input-and-output.md)
→ 状态与持久化、外观主题、状态转换、副作用、错误与降级、依赖、配置 已归档:[part-04-state-and-lifecycle.md](0005-web-client/part-04-state-and-lifecycle.md)
→ 重建验收、实现与测试锚点 已归档:[part-05-acceptance-and-anchors.md](0005-web-client/part-05-acceptance-and-anchors.md)
→ React 组件实验室 已归档:[part-06-component-lab.md](0005-web-client/part-06-component-lab.md)

## 非目标/边界

- 当前页面只开放 RSS 配置；不宣称浏览器端可配置 Bilibili/OpenCLI、Secret、
  Connection、Plugin、Workflow definition 或 arbitrary Action。
- 不实现用户认证、授权、跨用户隔离、interaction/read-state（含“未读”过滤）、文件上传、
  offline cache、service worker 或通知中心。
- Schema 驱动表单只消费 manifest 中 string/integer 字段并按已知字段名渲染展示文案；
  其它类型的配置字段、多 operation 选择和 catalog 变更的实时刷新不在当前 UI。
- 未保存配置 Probe 的轮询固定 1.5s/30s；不提供后台继续等待、进度百分比或历史探测列表；
  真实公网 RSS 的探测/录入端到端仍未验收（当前证据来自受控本地 RSS）。
- 不把 EventSource unavailable 后“服务恢复会重新连接”文案写成已实现自动 reconnect；
  当前代码只显示 unavailable，后续连接依赖页面重新挂载或上层操作。
- Browser visual/e2e、Docker、真实网络来源和跨进程 recovery 未在当前代码和测试中验证；本规格的验收步骤需在相应运行环境中单独执行。
