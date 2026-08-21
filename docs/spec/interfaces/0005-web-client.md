# Web Client

## 状态

当前实现规格；后续代码变化应同步更新本文。本文记录当前 Phase 1 Next.js Web 页面、
开发态 React 组件实验室及其与 Product API 的边界。实验室浏览器/生产验收结果只在本轮 Task
与 `PROJECT-STATUS.md` 记录，不把 Docker、真实来源或 Windows smoke 写成已验证能力。

## 最后更新

2026-08-20。

## 组件定位

Web Client 是 `apps/web/src/app/page.tsx` 的一个 client-side Next App Router 页面，
使用 `HttpCosmosClient` 读取 Feed/Source/Health、创建 fixture Source、手动触发 Source
Run、搜索分页、展开 Story，并用 SSE 事件触发刷新。`layout.tsx` 提供中文语言、字体变量、
metadata 和全局样式；`components/ui/*` 是 UI primitive，`lib/utils.ts` 只提供
Tailwind class 合并。`instrumentation.ts` 是 Next server instrumentation：Node runtime
按需创建并缓存一个 `cosmos-web` logger，`register()` 写一次 `web.started`，
`onRequestError` 只写脱敏后的请求元数据和错误对象。

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
浏览器加载 `page.tsx` 后由 client component 调用 `HttpCosmosClient`；需要刷新时监听 SSE，创建 fixture 或触发 Run 也通过已有 client 方法和 API 路由完成，不直接访问 Prisma。

### 典型情景
本地浏览内容、检查 Source/Health，验证搜索分页或观察一次手动 ingest 的页面刷新时，使用该页面；尚未封装的 Catalog、Attempt 或 Asset download 不由它承担。

## 概念与定义

- **Feed**：API `FeedPage.items` 的 Story-level cards；页面展示 title、summary、kind、
  source，并以 `storyId` 作为卡片 key。
- **Source**：共享合同中的可采集来源快照；当前 Web 新建表单固定提交 `fixture-rss`，
  让用户随后手动触发录入。
- **页面刷新**：按当前 `activeSearch` 重新并行读取 Feed/Search 与 Source，并替换而不是
  合并现有列表；匹配的 feed/run/job SSE 事件使用同一刷新路径，`snapshot_required` 只写 notice。
- **SSE state**：`connecting`、`connected`、`unavailable` 三态 UI 指示；底层
  `HttpCosmosClient` 的 source error 只会把它置为 unavailable。

## 外部行为
首次挂载时页面将 `loading=true`，并行调用 `client.feed()`（或 active search）和
`client.listSources()`；完成后展示 Feed/空态和 Source summary。随后打开 `/api/v1/events`
EventSource，页面没有 `afterEventId`，因此 transport 不附带 `after` query，API 缺省 cursor
按 `parseEventCursor(undefined)` 从 **0** 开始，而不是“服务端当前 cursor”。收到任意合法事件
置为 connected；收到 `feed.updated.v1`、`run.succeeded.v1`、`run.failed.v1`、`job.succeeded.v1`、
`job.retry_wait.v1` 或 `job.failed_terminal.v1` 时调用 refresh。收到 `snapshot_required` 只写
notice “服务要求重新读取快照，正在刷新 Feed。”，当前代码不会因此调用 refresh；`onError` 把
状态置为 unavailable。Effect cleanup 关闭 SSE source。

页面提供以下用户流程：

1. **新建来源**：打开“新建来源”卡片，填写 name 和 fixture path，表单通过 React Hook
   Form + Zod 校验，提交 `POST /api/v1/sources` 的 `fixture-rss` command；成功显示 notice、
   关闭并 reset 表单，然后 refresh。
2. **手动运行**：对 enabled Source 点击按钮，调用 `triggerSource(source.id)`；queued/
   running 显示 Run 已排队，随后 refresh；其它 status 显示当前状态。
3. **搜索**：输入 text/source/date，日期转换为 UTC 当日开始/结束 ISO，调用 search，
   保存 `activeSearch` 和第一页结果。无条件搜索清除 active search 语义并恢复 Feed。
4. **加载更多**：有 `nextCursor` 时按当前搜索或 Feed query 追加下一页 items；没有 cursor
   不发请求。
5. **Story 展开**：点击卡片的“打开 Story”调用 `client.story(storyId)`，在页面下方显示
   Story title、来源、最新正文、Entry id、Revision badges 与 Observation badges；点击
   关闭清除 story。
6. **健康检查**：点击“检查服务”调用 `client.health()`，保存 health 并显示 service、
   workerStatus 及 storageStatus notice。

## 输入

### Runtime/config

页面在模块初始化时创建：

```ts
new HttpCosmosClient({
    baseUrl: process.env.NEXT_PUBLIC_COSMOS_API_URL ?? "",
})
```

空 base URL 产生同源 `/api/v1/...` URL；若设置绝对 URL，则浏览器直接访问该 API base URL。
Next rewrite 在 `apps/web/next.config.ts` 将 `/api/:path*` 转到
`${COSMOS_API_URL ?? "http://localhost:4310"}/api/:path*`。这些环境变量不是页面运行时
表单输入，不提供认证或 Secret。

### Form input

- Source form：`name` trim 后 1–200 字符；`fixturePath` trim 后至少 1 字符；默认
  `Cosmos fixture`、`fixtures/rss/basic.xml`。提交时 kind 固定 `fixture-rss`、enabled=true、
  config `{ fixturePath }`。
- Search form：text trim/max 500，sourceId、publishedAfter、publishedBefore 可为空；
  search command 固定 `limit: 20`。非空 date 变成 `YYYY-MM-DDT00:00:00.000Z` 或
  `YYYY-MM-DDT23:59:59.999Z`。
- Source run：无 idempotency key 参数，transport 不发送该 header。
- SSE：页面没有 `afterEventId` 或持久 cursor；`HttpCosmosClient.openEventStream` 因此打开不带
  query 的 `/api/v1/events`。API 对缺省 cursor=0，页面首次连接会从 sequence 0 replay，而不是
  从服务端当前末尾连接；页面也不读取/写入 `Last-Event-ID`。

## 输出

页面显示：

- 顶部 Cosmos/Phase 1 标识、说明、新建来源和检查服务按钮；notice/status 与 error/alert
  互斥显示最新状态文本。
- 四个状态卡：服务器部署模式/health（有 health 时显示 service·workerStatus）、Source
  数与启用数、Prisma+SQLite 文案、SSE 已连接/正在连接/SSE 不可用。
- Source actions：无 Source 显示“创建第一个 fixture 来源”；每个 enabled Source 有
  手动录入按钮，disabled Source 按钮禁用。
- Feed：loading 时显示“正在读取本地 Feed…”；非 loading 且为空显示暂无内容；有 items
  时展示 Story kind、sourceName、title、summary、打开 Story；有 nextCursor 显示加载更多。
- Story panel：展示 title、source、revision 数、最新 revision contentText、Entry/source
  信息、Revision/Observation badges。

页面使用共享 DTO 的 response shape，不在 UI 重新定义 API DTO；`readError` 对
`CosmosTransportError` 显示 `服务请求失败（HTTP <status>）。`，其它 Error 显示 message，
未知值显示 `发生未知错误。`。

## 状态与持久化

页面所有状态均为 React 内存 state，不写 localStorage、IndexedDB、URL query 或其它
持久介质：

- `feed`、`nextCursor`、`activeSearch`、`sources`、`story`、`health`；
- `notice`、`error`、`loading`、`showSourceForm`；
- `eventStreamState`（connecting/connected/unavailable）。

刷新页面会重新加载 API snapshots；SSE 连接不持久化 last event id。API/数据库/Blob 是
唯一业务持久真相，UI 状态只做当前视图投影。

## 状态转换

1. `unmounted → loading/connecting`：页面挂载，初始化 forms，启动 refresh 和 SSE。
2. `loading → loaded`：feed/search 与 sources 都 resolve，写入 arrays，`loading=false`；
   Feed 空数组进入空态。
3. `loading → error`：任一初始 promise reject，写 error；finally 仍将 loading=false。
4. `connecting → connected`：收到合法 SSE message；`connecting → unavailable`：
   EventSource error 或 malformed event（transport onError）。
5. `connected/unavailable → refreshing`：只在匹配 feed/run/job event 时重新读取当前 query；
   `snapshot_required` 仅写 notice “服务要求重新读取快照，正在刷新 Feed。”，不会自动 refresh。
6. `source-form-open → submitting → closed/notice`：合法创建成功后关闭/reset并刷新；
   reject 保持 form 并显示 error。
7. `feed/search → paginating`：存在 nextCursor 时追加 page.items；失败保留已有 items
   并显示 error。
8. `feed-card → story-open`：Story API 成功写 StoryDetail；失败不打开并显示 error；
   close 清除 story。
9. 页面卸载 → SSE closed：effect cleanup 调用 transport close。

## 副作用

- 浏览器 fetch：初始化/refresh 并行请求 Feed/Search 与 Sources；创建、搜索、分页、health、
  Story、Run 分别请求对应 API。
- 浏览器 EventSource：挂载建立一个 SSE 连接，事件驱动 refresh，卸载关闭连接。
- API Source create/run 会产生服务端持久副作用；页面自身不直接写业务数据。
- React state 更新和表单 reset 是内存副作用；UI primitive 仅影响渲染。

Web server instrumentation 的副作用独立于 client page：在 Node runtime，Next 调用
`register()` 时 `getWebLogger()` 动态 import `@cosmos/logging` 并惰性创建模块级缓存 logger，
随后写一条 `web.started`（runtime、mode）；重复 hook 调用复用同一 logger。Next 调用
`onRequestError(error, request, context)` 时复用/创建该 logger，截掉 `request.path` 的 query
后写 `web.request.failed`，字段只有 method、path、routeType、routerKind、可选 digest，
错误对象作为 logger error 参数传递。Edge runtime 两个 hook 都因 `getWebLogger()` 返回 null
而无日志副作用。当前测试只锚定 Node-style logger 初始化、started/error 事件和 query 不进入
结构化 fields，不代表浏览器/e2e 或生产日志 sink 已验收。

## 错误与降级

- 初始 refresh、SSE 事件 refresh、Source create、search、pagination、health、run、Story
  任一请求失败，都不抛出到 React page boundary；捕获后使用 `readError` 写 error/status。
- SSE unavailable 时页面明确提示“数据仍可手动刷新；服务恢复后会重新连接。”但当前代码
  不自动重连；用户可使用检查服务、搜索或其它按钮产生请求。
- Snapshot required 不直接在浏览器恢复某个 cursor；当前代码只写 notice，不自动 refresh 当前 snapshot。
- 空 Feed 是正常空态，不是错误；Source 列表为空显示创建引导。
- 表单 Zod 错误通过 FieldError 就地显示，提交按钮在 `isSubmitting` 时禁用并显示保存中。
- HTTP 400/404/5xx 的 status 在 transport error notice 中可见，但 API error body 的
  code/details 不在当前页面呈现；未捕获的非 `Error` 使用通用文本。

## 依赖

- Next.js 16 App Router、React 19 client component；
- `@cosmos/contracts` 的 Source/Feed/Search/Health/Story DTO 与 create schema；
- `@cosmos/transport-http` 的 `HttpCosmosClient`、`CosmosTransportError`；
- React Hook Form、`@hookform/resolvers/zod`、Zod；
- lucide icons、Tailwind/shadcn-style UI primitives、`cn` utility；
- API runtime/rewrite：[`apps/web/next.config.ts`](../../../apps/web/next.config.ts)、
  [`apps/api/src/main.ts`](../../../apps/api/src/main.ts)。

## 配置

- `NEXT_PUBLIC_COSMOS_API_URL`：客户端 API base URL，默认空字符串（同源 rewrite）。
- `COSMOS_API_URL`：Next rewrite 的 server-side destination，默认 `http://localhost:4310`。
- Next 输出为 standalone；日志 incomingRequests/browserToTerminal 被关闭；具体 build/start
  脚本见 `apps/web/package.json`。
- 页面 `layout.tsx` metadata 为 title `Cosmos`、description “本地优先的信息聚合与个人情报工作台”，
  html lang=`zh-CN`，载入 Geist/Geist Mono 与 `globals.css`。

没有页面级 API timeout、重试、认证、SSE replay 配置或持久 UI 配置。

## 重建验收

1. 使用空 `NEXT_PUBLIC_COSMOS_API_URL` 启动 Web，观察初始化请求为同源 `/api/v1/feed` 与
   `/api/v1/sources`，页面先显示 loading，成功后显示四个状态卡和 Feed/Source 内容。
2. 在 Source 表单提交空 name 或空 fixture path，观察 Zod FieldError 且不发送 POST；提交
   合法默认值，观察 request body 为 `{name,kind:"fixture-rss",config:{fixturePath},enabled:true}`，
   成功后 notice、表单关闭并刷新列表。
3. 对 enabled Source 点击录入，观察 POST `/api/v1/sources/:id/runs`，queued/running 时
   notice 包含 Run id；disabled Source 的按钮不可点击。
4. 输入 text/source/date 搜索，观察日期边界为 UTC 当日开始/结束、结果替换 Feed、保存
   nextCursor；点击加载更多，观察新 items 追加而不是覆盖。
5. SSE 收到 `feed.updated.v1`、Run/Job 终态事件时观察 Feed 自动 refresh；收到
   `snapshot_required` 时只观察指定 notice、没有自动 refresh；触发 EventSource error 时观察
   “SSE 不可用”，且不发生自动重连。
6. 点击 Story 后观察 Story title、最新正文、Entry、Revision、Observation 展开；Story
   404/网络失败只显示 error，不显示空的 Story panel；点击关闭移除 panel。
7. 点击检查服务，观察 health card 更新为 `service · workerStatus`，notice 包含
   `storageStatus`；让 health 请求非 2xx，观察 error 文本包含 HTTP status。
8. 刷新浏览器或卸载页面，观察所有 React/SSE 状态重新初始化，且没有 localStorage/
   IndexedDB/URL 持久 cursor；Next rewrite 将 `/api/*` 转到配置 API host。

## 实现与测试锚点
- 页面状态、调用、SSE、表单、搜索、Story 和渲染：[`apps/web/src/app/page.tsx`](../../../apps/web/src/app/page.tsx)。
- 文档 metadata、lang、字体和 body wrapper：[`apps/web/src/app/layout.tsx`](../../../apps/web/src/app/layout.tsx)。
- Web server instrumentation、logger cache、register/onRequestError：[`apps/web/src/instrumentation.ts`](../../../apps/web/src/instrumentation.ts)。
- instrumentation lifecycle/redaction test：[`apps/web/src/instrumentation.test.ts`](../../../apps/web/src/instrumentation.test.ts)。
- 全局 Tailwind/theme 样式：[`apps/web/src/app/globals.css`](../../../apps/web/src/app/globals.css)。
- class merge utility：[`apps/web/src/lib/utils.ts`](../../../apps/web/src/lib/utils.ts)。
- Next rewrite/output/logging：[`apps/web/next.config.ts`](../../../apps/web/next.config.ts)。
- Web scripts/dependencies：[`apps/web/package.json`](../../../apps/web/package.json)。
- HTTP URL/schema/error/SSE behavior：[`packages/transport-http/src/index.ts`](../../../packages/transport-http/src/index.ts)、[`packages/transport-http/src/index.test.ts`](../../../packages/transport-http/src/index.test.ts)。
- Shared form/response contracts：[`packages/contracts/src/base.ts`](../../../packages/contracts/src/base.ts)、[`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts)。
## React 组件实验室

组件实验室是 `/dev/components` 下的开发工具，不属于 Product API 或产品导航。Server Component
先检查 `process.env.NODE_ENV`，非 development 调用 `notFound()`；开发态通过 Suspense 承载
使用 `useSearchParams()` 的 client workbench。实验室不创建 `HttpCosmosClient`、EventSource，
不读取 Prisma、SQLite、Data Root、Blob Root 或用户数据。

受管公共模块位于 `apps/web/src/components/ui/*.tsx` 与
`apps/web/src/components/cosmos/*.tsx`，每个模块在静态 registry 中有唯一 id、默认场景、
控件 schema、合成 fixture、token 子集和 render 目标。`registry-integrity.ts` 比较两个目录与
注册表，拒绝缺失、重复、无默认场景、缺控件值或未登记 token；当前登记 8 个 UI primitive 和
5 个 Cosmos 展示组件。

首页 `page.tsx` 是数据请求容器：它独占 `HttpCosmosClient`、SSE、React Hook Form 的
`handleSubmit`、搜索/分页/Story 状态和错误处理。无副作用展示组件只接收共享 DTO、展示状态和
回调：首页与实验室复用同一实现，实验室使用固定 synthetic fixture，不复制演示组件。

当前产品展示组件边界：

- `SourceForm`：接收来源表单 `UseFormReturn` 和页面提交事件，展示 Zod 字段错误与 submitting 状态；
- `StatusSummary`：接收 health、source summary 和 connecting/connected/unavailable 状态；
- `SourceActions`：接收 `SourceSnapshot[]` 与 run 回调，展示空、disabled 和 configured 状态；
- `FeedBrowser`：接收 Feed、Source、搜索表单、loading、cursor 与 Story 回调；
- `StoryPanel`：接收 `StoryDetail` 与关闭回调，展示 revision/observation 元数据。

实验室 URL 只保存 `component`、`scene`、`viewport`、`theme`、`colorway`；非法值归一化并以
`replace` 修正，用户操作以 `push` 保留浏览器前进/后退。已登记 token 的临时输入在失焦时校验，
版本化快照写入 `localStorage`，JSON 导入整份原子校验；覆盖只写预览根节点的 inline custom
properties，不写 `:root`，因此实验室 chrome 与产品页面不受污染。

实现入口：[`apps/web/src/component-lab/registry.tsx`](../../../apps/web/src/component-lab/registry.tsx)、
[`apps/web/src/component-lab/workbench.tsx`](../../../apps/web/src/component-lab/workbench.tsx)、
[`apps/web/src/app/dev/components/page.tsx`](../../../apps/web/src/app/dev/components/page.tsx)。
组件登记、URL/快照/草稿测试和实验室浏览器/生产验收边界见
[`docs/testing/README.md`](../../testing/README.md) 与
[`Task 09`](../../../.agents/tasks/09-react-component-lab/README.md)。

## 非目标/边界

- 当前页面只有 fixture-rss 创建表单；不宣称浏览器端可配置 RSS/Bilibili/OpenCLI、Secret、
  Connection、Plugin、Workflow definition 或 arbitrary Action。
- 不实现用户认证、授权、跨用户隔离、Saved View、interaction/read-state、文件上传、
  offline cache、service worker 或通知中心。
- 不把“真实 RSS 只需要改类型”的表单说明当作已实现浏览器行为；当前 UI 固定 kind 为
  fixture-rss。
- 不把 EventSource unavailable 后“服务恢复会重新连接”文案写成已实现自动 reconnect；
  当前代码只显示 unavailable，后续连接依赖页面重新挂载或上层操作。
- Browser visual/e2e、Docker、真实网络来源和跨进程 recovery 未在当前代码和测试中验证；本规格的验收步骤需在相应运行环境中单独执行。
