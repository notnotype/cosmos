---
parent: docs/spec/interfaces/0005-web-client.md
range: 概念与定义
sealed_at: 2026-10-26
tags: [spec, web-client, concepts]
tokens_est: 2495
---

## 概念与定义

- **Feed**：API `FeedPage.items` 的 Story-level cards；页面展示 title、summary、kind、
  source，并以 `storyId` 作为卡片 key。
- **Source**：共享合同中的可采集来源快照；Web 表单由**所选来源定义** manifest 的
  descriptive configurationSchema 驱动，创建后默认保持停用，由用户在计划列表行内
  通过 `PATCH /api/v1/collection-plans/{id}` 单独启用/停用。
- **未保存配置 Probe**：`source-config-probe` Job 的 dry-run。表单“测试配置”提交
  所选定义的 `sourceDefinitionRef + operationId + config`（不创建 Source），Web 轮询该 Job 快照
  直到终态或超时；结果显示抓取条数、耗时、样例标题，失败/超时有独立提示。
- **来源定义状态**：表单打开时读取 `GET /api/v1/source-definitions`，保留其中
  `status: enabled` 的全部定义供选择（默认选中 `source.rss@1`）；
  loading/error/ready 三态，error 提供重试，不回退到硬编码字段。
- **页面刷新**：按当前 `activeSearch` 重新并行读取 Feed/Search 与 Source，并替换而不是
  合并现有列表；匹配的 feed/run/job SSE 事件使用同一刷新路径，`snapshot_required` 只写 notice。
- **SSE state**：`connecting`、`connected`、`unavailable` 三态 UI 指示；底层
  `HttpCosmosClient` 的 source error 只会把它置为 unavailable。
- **来源健康**：`source-health` Block 把 Source 快照解释为一行行可读状态——启用徽章、定时语义
  （启用+定时显示“每 N 自动抓取”；启用无定时显示“未配置定时，仅手动录入”；停用显示
  “已停用，定时抓取暂停”或“已停用”）、媒体策略摘要、上次运行时间与最近错误。它不新增
  读合同，投影自 `SourceSnapshot` 的 `enabled/scheduleIntervalMs/mediaPolicy/lastRunAt/lastError`
  与 `planId/planRevisionId`（后两者是计划的 CAS 凭据，ADR-0023 决策 2）。
  行内“媒体策略”入口打开一个表单（图片下载开关 + 单文件/单次上限 + 失败重试次数 + 保留天数，
  留空表示跟随默认/永久保留），保存走 `PATCH /api/v1/collection-plans/:id` 的 `mediaPolicy`
  （带计划的 `baseRevisionId`），超默认值在本地就被拒绝，409 提示版本冲突并刷新（ADR-0014/0015）。
  启用/停用同样走计划端点：媒体预算与启用状态都归采集计划，来源端点只写来源名与目标配置。
- **删除来源（AUT-001）**：来源健康行内还有一个删除按钮，**两段确认**——第一次点击把该行切到
  确认态并显示“只移除配置与定时，已录入内容保留”，第二次点击才发
  `POST /api/v1/sources/:id/removals`（带 `baseRevisionId` 与 `Idempotency-Key`，actor 记 `user`）。
  成功后来源从看板消失、调度停止，已录入的条目与来源历史保留；409 提示版本冲突并刷新。
- **运行记录里的任务（OPS-002）**：运行记录列表选中某个 Run 时，除元数据与控制动作外还会取
  `GET /api/v1/runs/:id/jobs` 并列出该 Run 的 Job（状态、`attempts/maxAttempts` 重试次数、
  `errorCode`/`error`）；结果带 `runId` 并在渲染时比对，避免切换选中后旧响应覆盖。
  没有登记任务时显示“这个 Run 没有登记任务”；读取失败显示可读错误。**Attempt 明细
  （租约窗口、owner 等）仍只在 API**，本面板不展示。
- **保留期清理**：来源健康区底部提供“预览过期媒体 → 确认清理”两步操作，走
  `POST /api/v1/media-cleanups`（`dryRun: true` 预览、`false` 确认）并轮询
  `GET /api/v1/media-cleanups/:runId` 到终态；预览展示候选条数/字节与最多 5 条样例，
  确认后展示实际清理条数与释放字节。Web 不直接删除任何数据，也不新增读合同（ADR-0015）。
- **分类（Label）与 Topic 筛选**：搜索表单把已加载的 Label 与 Topic 渲染成可多选的筛选
  chip；选中项以 id 数组存在表单状态里，提交时拼成 `search` 的 `labelIds`/`topicIds`
  逗号串。它不新增合同，只是把既有 search 过滤条件接出编辑入口。
- **作者 / 媒体类型 / 录入状态筛选（LIB-001）**：搜索表单另有「作者」输入与「媒体类型」
  「录入状态」两个单值下拉（受管枚举，表单 schema 用 `contentKindSchema`/`assetStatusSchema`
  收窄），提交时作为 `author`/`contentKind`/`assetStatus` 传给 `search`，命中条件在筛选区
  回显为 chip。这三个条件**存不进 Saved View**（视图条件形状属 LIB-005，Phase 4）：当前搜索
  带了它们时保存视图会被拒绝并说明原因，套用视图时也会被清空——不允许静默丢条件。
- **Story 时间线**：由 `StoryDetail.entries` 的全部 Revision 与 Observation 展平成按时间
  倒序的事件流（来源名、事件类型、标题、时间），纯客户端投影，不新增读合同。
- **Story 相关内容**：与本 Story 共享分类或共享 Entity 的其它 Story，纯读组合
  `search`/`entity`/`story` 三个既有端点，最多 5 条；只用于“相关但不同事件”的浏览提示，
  不改变 Story 的权威关系。
- **Story 证据来源**：`StoryDetail.evidence` 的渲染——把本 Story 当作证据/提及目标的其它
  条目（来源、标题、关系类型、理由），支持解除与从最近条目下拉添加；Story 成员列表里
  每条成员还会显示它作为证据关联到的其它 Story（`EntryDetail.relatedStories`），这是反向
  视图、不额外发请求（ADR-0011）。
- **Story 当前表示**：面板的事件时间行与关键事实块来自 `StoryDetail.story.timeRange`/`keyFacts`，
  纯客户端投影，不新增读合同。事件时间按本地时刻显示到分钟，任一端只有原文时显示原文并标注
  「不精确」，两项都空则不渲染该行。关键事实按保存顺序列出并带出处标题；`entryId` 不在当前
  候选列表里（条目已删除）时显示「出处已删除」。
- **人工已修改标记**：`StoryDetail.story.producer` 为 `human` 时，事件时间行下方显示「人工已修改 ·
  自动更新已暂停，来源的新版本不会覆盖这里的内容」（`data-story-human-protected`）。这条标记说明
  的是**为什么这个 Story 不再跟随来源**，不是可操作控件：解除保护需要新命令，ADR-0028 不提供。
- **Story 表示编辑**：时间范围与关键事实和标题/类型/subtype 同属「编辑 Story 表示」表单（仅
  非历史壳渲染）。每个端点有「未定 / 准确时刻 / 只有原文（不精确）」三种互斥填法：准确时刻走
  `datetime-local`（存 ISO 秒精度），原文模式填原文再选天/月/年精度（按本地粒度起点算下界、
  `confidence: "uncertain"`）。两端都空是未定；只填结束、或精确模式下结束早于开始都在本地被拒
  且不发请求。关键事实逐行编辑，可新增/上移下移/删除并逐条选出处（先列本 Story 成员，再列
  其它条目）；条数上限由合同把关，保存被拒时把错误显示在面板上。提交经
  `HttpCosmosClient.updateStoryRevision`，发送前按命令 schema parse。
