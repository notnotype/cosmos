---
parent: docs/spec/interfaces/0005-web-client.md
range: 状态与持久化、外观主题、状态转换、副作用、错误与降级、依赖、配置
sealed_at: 2026-10-26
tags: [spec, web-client, state]
tokens_est: 3096
---

## 状态与持久化

页面业务状态均为 React 内存 state，不写 URL query 或 IndexedDB；Task 35 之后它们按页与域分开，
不再集中在单一页面：

- 每个页面自己的 `notice`/`error`/`loading`，以及它挂载的域 hook 持有的读模型
  （`feed`/`nextCursor`/`activeSearch`/`sources`/`story`/`plans`/`topics`/`entities`）；
- 编辑面的草稿（标题、类型、细分类型、时间范围、关键事实）留在右栏 `StoryEditPanel` 内部，
  「有没有未保存的编辑」以**上次同步时的服务端状态**为基准，供 ADR-0029 决策 7 的刷新边界判断；
  五份草稿都由这一个判定守着，浏览器门禁逐字段断言（`story-live-refresh.spec.ts`）；
- `definitionState`（来源定义 loading/ready/error）、`probeState`（idle/running/
  succeeded/failed/timeout）、`activatingSourceId`（进行中的启用/停用行）；
- `streamState`（connecting/connected/unavailable），由外壳的 `LiveProvider` 持有并下发给顶栏与
  「窗口过窄」提示。

唯一的产品 localStorage 持久化是外观主题偏好 `cosmos.theme.preference.v1`
（见下方“外观主题”）；刷新页面会重新加载 API snapshots 并恢复主题偏好，SSE
连接不持久化 last event id。API/数据库/Blob 是唯一业务持久真相，其余 UI
状态只做当前视图投影。

## 外观主题

Web 使用**单一明暗轴** `data-cosmos-appearance="light|dark"`（ADR-0029 决策 5：Task 35 删除了
原先 `data-cosmos-theme="neurobook"` × `data-cosmos-colorway="macos-*"` 两套轴，不是改名）。
产品偏好是三值枚举 `system | light | dark`：

- `<head>` 内的静态引导脚本在首帧前读取 `cosmos.theme.preference.v1` 与
  `prefers-color-scheme`，把最终 `data-cosmos-appearance`、`dark` class 和
  `style.colorScheme` 写到 `<html>`；脚本只含仓库常量，解析或存储异常回退浅色；
  无法识别的存量取值（含旧的 `macos-*`）落回 `system`；
- `ThemeProvider` 用模块级 store 作为唯一浏览器真相：订阅 matchMedia（仅 system
  生效）与 storage 跨标签同步，并把同一属性幂等写回 `<html>`；服务端快照固定
  system → 浅色；
- 顶栏“外观主题”分组的 `ThemeSwitcher` 提供键盘可达的三态切换；
  “跟随系统”删除存储 key，显式选择写入；写入失败仅影响当前标签页且 UI 不声称已持久化；
- 实验室 URL 的 `appearance=light|dark` 只控制预览画布根节点
  （含局部 `dark` class），与全局 chrome 偏好互不覆盖；token override 仍是预览内最高优先级。

`globals.css` 以 `[data-cosmos-appearance]` 承载明暗两套取值，
并把它们映射到现有 shadcn 语义 token；
`prefers-reduced-motion` 将主题动效时长归零。生产构建下 `/dev/components`
仍返回 404，主题能力不改变 Product API、SSE 或表单语义。

## 状态转换

1. `unmounted → loading/connecting`：页面挂载，初始化 forms，启动 refresh 和 SSE。
2. `loading → loaded`：feed/search 与 sources 都 resolve，写入 arrays，`loading=false`；
   Feed 空数组进入空态。
3. `loading → error`：任一初始 promise reject，写 error；finally 仍将 loading=false。
4. `connecting → connected`：收到合法 SSE message；`connecting → unavailable`：
   EventSource error 或 malformed event（transport onError）。
5. `connected/unavailable → refreshing`：只在匹配本页 topic 的事件上重新读取当前 query；
   `run.failed.v1` 同时写失败 notice；`snapshot_required` 仅写 notice “服务要求重新读取快照，
   正在刷新 Feed。”，不会自动 refresh。**详情页编辑中不覆盖**（ADR-0029 决策 7）：
   `/stories/:id` 订阅 `stories` topic，有未保存编辑时只显示“这条内容在别处有了新变化。
   你正在编辑的内容没有被改动。”与“重新读取”，由用户决定何时重读；没有未保存编辑则静默重读。
6. `source-form-open → loading → ready/error`：打开表单读取 catalog；error 可重试并回到
   loading；ready 前不渲染表单字段。
7. `probe idle → running → succeeded/failed/timeout`：测试配置提交后进入 running；
   轮询到 `succeeded`（含 result）显示统计，`failed_terminal`/`cancelled` 显示失败原因，
   30s 未终态显示超时；任一表单字段变化或重新打开表单立即回到 idle（作废旧结果）。
8. `source-form-open → submitting → closed/notice`：合法创建成功后关闭/reset并刷新；
   reject 保持 form 并显示 error。保存不再触发启用。
9. `source-row → activating → refreshed/conflict`：行内启用/停用期间该行按钮禁用；
   成功后 refresh；409 conflict 提示版本冲突并 refresh。
10. `feed/search → paginating`：存在 nextCursor 时追加 page.items；失败保留已有 items
   并显示 error。
11. `feed-card → story-open`：点卡片导航到 `/stories/:id`（Task 35 起是独立页面，不再是抽屉）；
    Story API 成功写 StoryDetail；失败不打开并显示 error。`story-revision-update`：提交新标题后
    以返回 StoryDetail 刷新编辑面；`story-merge`：归并成功后来源成员数增加，旧 Story id 的后续
    打开重定向到 canonical。
   `story-split`：提交后以返回的历史壳刷新面板（成员清空、后继列表可见、写操作区消失），
   点击后继按钮打开该后继的普通 Story 视图。
12. 页面卸载 → SSE closed：effect cleanup 调用 transport close。

## 副作用

- 浏览器 fetch：初始化/refresh 并行请求 Feed/Search 与 Sources；打开表单读取
  source-definitions；测试配置提交并轮询 probe Job；保存、启用/停用、搜索、分页、
  health、Story、Run 分别请求对应 API。
- 浏览器 EventSource：挂载建立一个 SSE 连接，事件驱动 refresh，卸载关闭连接。
- API Source create/activation/run 与 source-config-probe Job 会产生服务端持久副作用
  （probe 只持久化 Job 记录，不写 Observation/Entry/Asset/checkpoint）；页面自身不直接
  写业务数据。
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

- 初始 refresh、SSE 事件 refresh、catalog 读取、Source create、activation、probe 提交/轮询、
  search、pagination、health、run、Story 任一请求失败，都不抛出到 React page boundary；
  捕获后使用 `readError` 写 error/status 或对应的局部状态（catalog 错误在表单内提供重试，
  probe 失败在结果区显示原因）。
- probe 轮询到达 30s 上限显示超时文案，提示可稍后重新“测试配置”；不做后台继续轮询。
- activation 409 conflict 显示“版本冲突”提示并刷新列表，不自动重试启用。
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
- API runtime/rewrite：[`apps/web/next.config.ts`](../../../../apps/web/next.config.ts)、
  [`apps/api/src/main.ts`](../../../../apps/api/src/main.ts)。

## 配置

- `NEXT_PUBLIC_COSMOS_API_URL`：客户端 API base URL，默认空字符串（同源 rewrite）。
- `COSMOS_API_URL`：Next rewrite 的 server-side destination，默认 `http://localhost:14310`。
- Next 输出为 standalone；日志 incomingRequests/browserToTerminal 被关闭；具体 build/start
  脚本见 `apps/web/package.json`。
- 页面 `layout.tsx` metadata 为 title `Cosmos`、description “本地优先的信息聚合与个人情报工作台”，
  html lang=`zh-CN`，载入 Geist/Geist Mono 与 `globals.css`。

没有页面级 API timeout、重试、认证、SSE replay 配置或持久 UI 配置。
