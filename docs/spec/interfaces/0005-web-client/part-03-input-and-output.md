---
parent: docs/spec/interfaces/0005-web-client.md
range: 输入、输出
sealed_at: 2026-10-26
tags: [spec, web-client, io]
tokens_est: 3870
---

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
`${COSMOS_API_URL ?? "http://localhost:14310"}/api/:path*`。这些环境变量不是页面运行时
表单输入，不提供认证或 Secret。

### Form input

- Source form：`name` trim 后 1–200 字符（默认 `Cosmos RSS`）；配置字段集合来自**当前选中的
  来源定义 + 当前选中的操作** manifest 的 descriptive schema（所选操作的
  `configurationSchema.schema`，为 `null` 时回退定义级；`enum` → 选择框、`integer`/`number` →
  数字、`string` → 文本），未知类型字段不渲染；切换定义或操作都会清空整组配置字段；
  `scheduleIntervalMinutes` 为可选整数分钟（默认 `30`，1–44640，清空即关闭定时）；
  `connectionId` 为空串表示不绑定连接。保存发送
  `{name, sourceDefinitionRef: <所选 ref>, operationId: <所选 operationId>, config: <按字段类型转换>, scheduleIntervalMs?, connectionId?}`
  且不含 enabled；创建后保持停用。客户端校验只覆盖能从 JSON Schema 读出的规则
  （必填、整数、最小/最大、枚举取值），条件规则由服务端裁决。测试配置发送
  `{sourceDefinitionRef, operationId, config}` 到 probe 端点，轮询间隔 1.5s、上限 30s。
- Search form：text trim/max 500，sourceId、publishedAfter、publishedBefore 可为空；
  `labelIds`/`topicIds` 为多选数组（默认空，提交时 join 成逗号串，未选中不发送该字段）；
  search command 固定 `limit: 20`。非空 date 变成 `YYYY-MM-DDT00:00:00.000Z` 或
  `YYYY-MM-DDT23:59:59.999Z`。
- Source run：无 idempotency key 参数，transport 不发送该 header。
- SSE：页面没有 `afterEventId` 或持久 cursor；`HttpCosmosClient.openEventStream` 因此打开不带
  query 的 `/api/v1/events`。API 对缺省 cursor=0，页面首次连接会从 sequence 0 replay，而不是
  从服务端当前末尾连接；页面也不读取/写入 `Last-Event-ID`。

## 输出

页面显示：

- 顶部 Cosmos/Phase 1 标识、说明、新建计划和检查服务按钮；notice/status 与 error/alert
  互斥显示最新状态文本。
- 四个状态卡：服务器部署模式/health（有 health 时显示 service·workerStatus）、采集计划
  数与启用数、Prisma+SQLite 文案、SSE 已连接/正在连接/SSE 不可用。
- 采集计划看板：无计划显示“采集计划随来源一同创建，一个来源对应一个计划。”（ADR-0023 计划与目标一对一，界面不提供独立的计划创建入口）；**按连接分组**（无连接的计划归
  “未绑定连接”组，该组固定压尾），每组标题是连接名与计划数；每个计划行展示启用/停用徽章、
  名称、定时语义行（“每 N 分钟自动抓取”/“未配置定时，仅手动录入”/“已停用，定时抓取暂停”/
  “已停用”）、媒体策略摘要、上次运行时间与最近错误（红色截断）；行内提供启用/停用按钮，
  enabled 计划另有手动录入按钮，disabled 计划的运行按钮禁用。每个计划行还展示 Webhook 入口
  状态（“Webhook 入口：已配置/未生成”）；行内按钮打开入口面板，面板给出入口地址（与页面同源，
  Next 把 `/hooks/*` 透传给 API）、凭证状态、生成/轮换与撤销按钮，生成或轮换成功后在同一面板
  显示**唯一一次**的明文凭证与 curl 调用示例（ADR-0024）。行内图标按钮（启用/停用、手动录入、
  Webhook 入口、媒体策略、删除）都带文字提示，鼠标悬停与键盘聚焦都能看到；提示文案与按钮的
  可访问名是同一份，读屏用户与鼠标用户看到的是同一个动作名（提示只做说明，动作仍在按钮上）。
- 连接面板（AUT-009）：`/automation` 页“连接”区列出可复用连接；**按创建时间倒序**，新建的连接排在最前，
  用户保存后不必在列表里定位。每行显示状态徽标、名称、账号，以及
  **授权范围**与**失效原因**两行——空值显示“未记录”，授权范围按 `键: 值` 渲染顶层标量对象、
  其它形状回退紧凑 JSON、解析不了的值原样显示。行内动作按状态二选一（“标记失效”或“恢复可用”），
  删除始终可用。**新建连接走模态框**（“新建连接”按钮打开，标题与按钮同名）：连接保存的是登录凭据的
  引用而不是凭据本身，表单里是名称、Connector、适配器配置与授权范围；保存成功即关闭并清空表单，
  取消或按 Esc 也清空。列表本身常驻页面，不被表单挤占。
- Source form：loading 显示“正在读取来源定义…”；catalog 不可用时显示错误与“重试读取”；ready 时先显示来源定义选择器，再按所选 manifest 渲染字段（含 `enum` 选择框与认证提示），
  测试结果区显示 running/成功统计/失败原因/超时四态。
- Feed：loading 时显示“正在读取本地 Feed…”；非 loading 且为空显示暂无内容；有 items
  时展示 Story kind、sourceName、title、summary、打开 Story（导航到 `/stories/:id`，Task 35 起
  不再是抽屉）；有 nextCursor 显示加载更多；
  搜索表单在存在 Label/Topic 时渲染多选筛选 chip，命中条件回显为筛选 chip。
- Story panel：展示 title、source、revision 数、来源成员（含反向证据关联）、证据来源、
  时间线（时间/事件类型/来源/标题）、相关内容（标题 + 相关原因）、最新 revision contentText、
  Entry/source 信息、Revision/Observation badges。
- **Story 阅读页版面**（Task 36 切片 A，维护者 2026-10-02 裁定，2026-10-03 修正为现行取值）：
  `/stories/:id` 是**两栏**——
  左栏「内容」（标题/meta/摘要/时间线/正文/关键事实/媒体/成员/证据/相关内容），右栏「操作编辑」
  （收藏、改表示、归并、拆分、打标签、批注、话题、Entity、收藏夹、固定到看板）。
  **整组宽 = 视口 80%、居中**，左右两栏宽度比 **3:1**，三档断点（1024/1280/1440 px）都取同一组
  比例、不堆叠；1024 px 以下仍只显示「窗口过窄」提示（ADR-0029 决策 6，不降级布局）。
  右栏随页面滚动、不吸附。**宽度用 `vw` 表达**，因此窄档不需要各自的规则。
  **正文跟着左栏撑满，不再限 34em**：V4 的「正文行宽 ≤34em」合同自 2026-10-03 起在阅读页废止，
  代价是大屏上单行可达 ~1070 px（1920 视口实测，勘误与理由见
  [`frontend-redesign-v1.md`](../../../proposals/frontend-redesign-v1.md) 勘误节）。
  阅读页的限宽由页面自己承担（`(reading)/stories/[id]/page.tsx` 不再包 `max-width`）；
  外壳那条「侧栏 + 内容整体限宽 1120 px」不适用于本页（ADR-0029 决策 2 的唯一例外）。
  媒体**只在左栏**渲染：`RevisionAssets` 不再出现在编辑面里（一个区块一个所有者）。
  编辑面（右栏 `StoryEditPanel`）**默认展开**（2026-10-03 裁定）。标题行只有「编辑与关联 + 展开/收起」；
  展开后按**使用频率**分四段（维护者 2026-10-03 裁定，顺序 C→B→A→D），段与段之间一条分隔线：

  | 段 | 名称 | 内容 | 判据（改的是哪一层数据） |
  | --- | --- | --- | --- |
  | C | 我的标记 | 收藏、固定到看板、标签、收藏夹、批注 | 只写「用户 × Story」，不改内容 |
  | B | 家族与关系 | 归并、拆分 Story；壳上另加已拆分、迁移用户状态 | 改多条 Story 的拓扑 |
  | A | 内容与表示 | 标题/类型/子类型、时间范围、关键事实、保存修改 | 改当前 Revision（受 ADR-0028 保护） |
  | D | 对象关联 | 关联 Entity、加入 Topic | 改关系表，两端都是已有对象 |

  四段各有一个段标题（维护者 2026-10-03：「每一段要有一个 Title」），由 `StoryEditPanel`
  统一渲染，层级夹在面板总标题（`text-lg`）与字段标题（`font-medium`）之间；段组件不再自带标题。
  三条分割线只在段间（C|B、B|A、A|D），其中 A 段（拆分）只对多成员 Story 出现，它的线与标题
  跟内容绑在同一个条件上，避免留下「有标题、无内容」的空段。
  **右栏最小宽度 240 px**（维护者 2026-10-03）：按 3:1 算 1024 px 窗口下右栏只剩 199 px，
  表单被压坏；下限只在窄档生效（1440 px 下右栏 282 px），代价是窄档整组略超 80%、由左栏让位。
  版面合同的可断言部分：`data-story-columns` / `data-story-column="content|actions"`，
  浏览器门禁在三档断点断言居中（±2 px）、无横向溢出，并在右栏宽于下限时断言整组宽为视口 80%
  （±1%）与两栏比 2.9–3.2、下限生效时断言右栏 ≥240 px，另断言正文与左栏等宽（`story-reading.spec.ts`）。
- **分隔线合同**（2026-10-03 起，右栏面板及其子区块统一）：块与块之间用
  `components/ui/separator.tsx` 的 `<Separator decorative />`——独立元素、`bg-border`
  （＝token `--border`，实测 `#e6e4dc`）、高度 `--divider-thickness`（**0.75em**，维护者 2026-10-03；
  16 px 字号下 12 px）、**两头圆角**（`rounded-full`，半径被钳到高度的一半＝两端半圆帽，
  维护者 2026-10-03）、`aria-hidden`（线表达视觉层级，不是内容语义，不给辅助技术加停顿）。
  **竖向线固定 1 px 且不加圆角**，不复用 `--divider-thickness`——同值会把竖线变成 8 px 宽的色块。
  **列表行（`first:` / `last:` 变体）与 `CardFooter` / `DialogFooter` / `Tabs`
  的线仍用 `border` 写法**：前者要靠伪变体表达「第一行不要线」，后两者是容器几何而非版面分隔。
  写 `border` 时必须显式带 `border-border`——Tailwind v4 预检让边框默认继承 `currentColor`，
  只写 `border-t` 会得到正文墨色的深线（这个缺陷在 Task 36 Round 5 才被发现）。
  **线的位置规则：只放在两个相邻兄弟区块之间，绝不放在区块的尾部**。尾部写法在两个区块相邻渲染时
  （`isShell` 的「已拆分」+「迁移用户状态」）会叠出两条线；同理，子组件不自带开头的线，
  父级负责在区块之间声明边界——否则子组件相邻渲染时也会叠线（Task 36 Round 8 修的就是这一条）。
  条件渲染的区块要把线跟区块绑在同一个条件里，避免只剩一条孤儿线。
  **Round 9 把这条规则收紧到全仓**：任何区块组件（`story-panel/*`、`story-edit/*`）都**不自带分隔线**，
  线只在**父级**的相邻子元素之间放。此前 `story-actions`、`revision-assets`、`entities-editor`
  各自带内部线，与父级的段间线叠成双线（Round 10 实测抓到），已全部撤掉。

页面使用共享 DTO 的 response shape，不在 UI 重新定义 API DTO；`readError` 对
`CosmosTransportError` 显示 `服务请求失败（HTTP <status>）。`，其它 Error 显示 message，
未知值显示 `发生未知错误。`。
