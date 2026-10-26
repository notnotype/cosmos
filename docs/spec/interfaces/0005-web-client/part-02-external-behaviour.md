---
parent: docs/spec/interfaces/0005-web-client.md
range: 外部行为
sealed_at: 2026-10-26
tags: [spec, web-client, behaviour]
tokens_est: 6902
---

## 外部行为
首次挂载时页面将 `loading=true`，并行调用 `client.feed()`（或 active search）和
`client.listSources()`；完成后展示 Feed/空态和 Source summary。随后打开 `/api/v1/events`
EventSource，页面没有 `afterEventId`，因此 transport 不附带 `after` query，API 缺省 cursor
按 `parseEventCursor(undefined)` 从 **0** 开始，而不是“服务端当前 cursor”。收到任意合法事件
置为 connected；收到 `feed.updated.v1`、`run.queued.v1`、`run.succeeded.v1`、`run.failed.v1`、
`run.retry_wait.v1` 或 `job.failed_terminal.v1` 时调用 refresh（这些是存储层实际发出的
类型：Job 成功没有独立事件，Run 终态覆盖它；Job 重试等待以 `run.retry_wait.v1` 表达）。
收到 `run.failed.v1` 时额外写 notice “一次录入运行失败，已刷新“来源健康”；请在来源行内
查看错误信息。”。收到 `snapshot_required` 只写
notice “服务要求重新读取快照，正在刷新 Feed。”，当前代码不会因此调用 refresh；`onError` 把
状态置为 unavailable。Effect cleanup 关闭 SSE source。

页面提供以下用户流程：

1. **配置计划（schema 驱动）**：打开“新建计划”卡片时读取 `GET /api/v1/source-definitions`，
   保留全部 `enabled` 定义供**来源定义选择器**切换（默认 `source.rss@1`）。定义声明了多个
   操作（`operationIds` 多于一个）时再出**操作选择器**（默认第一个；Bilibili 显示
   `抓取`／`搜索`），字段按**所选操作**的 `configurationSchema.schema` 渲染，它为 `null`
   时回退定义级那份：`enum` → 选择框、`integer`/`number` → 数字、`string` → 文本，三种
   以外不渲染也不猜类型——Bilibili 的 `mode` 只有 `enum` 没有 `type`，按类型白名单过滤
   会把它整条丢掉。必填枚举同样保留一个空选项，避免静默取第一个值。另有
   `scheduleIntervalMinutes`（分钟输入，默认 30，清空表示不自动抓取；保存时换算为
   canonical `scheduleIntervalMs`）与连接选择。定义声明了认证（`auth.kind !== "none"`）时
   展示提示与 label（Bilibili 为“OpenCLI 浏览器登录态”），表单不收集凭证，也**不收集
   适配器配置**——登录态（OpenCLI profile）是连接的非秘密配置，在连接面板里填（Proposal
   connection-login-lifecycle-v1；凭证的载体同样是连接，ADR-0017）。切换定义或切换操作
   都会整组重置配置字段：search 的查询词对 fetch 没有意义。
   表单通过 React Hook Form + Zod 校验。
2. **测试未保存配置**：点击“测试配置”先触发表单校验，通过后 `POST
   /api/v1/source-config-probes`（携带所选定义的 `sourceDefinitionRef`、**所选**的
   `operationId` 与表单里选中的 `connectionId`——未保存配置没有来源与计划，需要登录态的
   操作只能靠它拿连接；不携带幂等键，服务端生成缺省键），随后每 1.5s 轮询
   `GET /api/v1/source-config-probes/:jobId`，30s 未达终态显示超时提示；`succeeded`
   展示抓取条数、耗时、样例标题与“还有更多内容”提示，`failed_terminal`/`cancelled`
   显示错误文本。全程不创建 Source、不写事实数据；表单字段变化会使结果立即作废。
3. **保存停用计划**：先按所选定义的字段规则做客户端校验（必填、整数、范围、枚举取值），
   通过后提交 `POST /api/v1/sources`（默认停用，含 `sourceDefinitionRef`、**所选**
   `operationId`、按字段类型转换后的 `config`、`scheduleIntervalMs` 与可选
   `connectionId`）；成功显示 notice、关闭并 reset 表单，然后 refresh。不再自动启用。
   客户端不复制服务端的条件规则（JSON Schema 表达不了 Bilibili 的「mode=feed 才需要
   profile」），这类错误由服务端 canonical schema 裁决并回显。
4. **行内启用/停用**：计划列表每个计划提供启用或停用按钮（`PATCH
   /api/v1/collection-plans/{id}`，`baseRevisionId=plan.revisionId`）；
   返回 409 conflict 时提示版本冲突并刷新列表，用户可重试。
5. **手动运行**：对 enabled Source 点击按钮，调用 `triggerSource(source.id)`；queued/
   running 显示 Run 已排队，随后 refresh；其它 status 显示当前状态。disabled Source
   的运行按钮不可点击。
6. **搜索**：输入 text/source/date，或点选分类（Label）与 Topic 筛选 chip（多选，条件以
   逗号串提交），日期转换为 UTC 当日开始/结束 ISO，调用 search，保存 `activeSearch` 和
   第一页结果；筛选 chip 回显为“分类：<名称>”/“Topic：<标题>”。无条件搜索清除 active
   search 语义并恢复 Feed。
7. **加载更多**：有 `nextCursor` 时按当前搜索或 Feed query 追加下一页 items；没有 cursor
   不发请求。
8. **Story 展开**：点击卡片的“打开 Story”调用 `client.story(storyId)`，在页面下方显示
   Story title、来源成员（`entries` 全部成员，含来源名/标题/Entry id，以及该成员作为证据
   关联到的其它 Story）、证据来源（`evidence`：来源、标题、关系类型、理由，可解除或从最近
   条目下拉添加）、时间线（成员 Revision 与 Observation 按时间倒序，来源名与事件类型分开
   表达）、相关内容（共享分类或共享 Entity 的其它 Story，先渲染面板再后台补齐，读取失败
   只留空列表）、最新正文、Entry id、Revision badges 与 Observation badges。
9. **条目重复/转载关系（ADR-0022）**：没有独立的条目详情页，所以 v1 把入口放在来源成员
   每一行上——行内徽章按「读到的这一侧」显示 `转载自 X`／`被 X 转载`／`重复于 X`／
   `近似于 X`（读侧宽松类型显示原文），下面一行给出关系类型、对端来源与理由并带「解除」；
   「标记重复 / 转载」在行内展开对端条目与类型两个下拉（对端候选是面板已加载的条目，
   排除自己与已挂关系的条目，同 Story 成员是合法对端）后提交 `client.linkEntryRelation`，
   解除走 `client.unlinkEntryRelation`。写命令返回的是 `fromEntryId` 那一侧的 EntryDetail，
   不是本 Story，所以成功后重读 `client.story(storyId)` 刷新成员行。React key 用
   `(entryId, relationType)`，所以改类型后徽章会随新类型重挂。
9. **Story 编排**：面板“Story 操作”区可编辑标题（`updateStoryRevision`，携带当前
   `baseRevisionId`）或输入 obsolete Story id 把另一个 Story 归并到当前 Story
   （`mergeStories`）；标题/类型/subtype 与时间范围、关键事实在同一个「编辑 Story 表示」
   表单里提交，两项表示每次全量带上（省略即清空由合同拥有），成功后页面用返回的 StoryDetail
   刷新面板，并把表单对齐到刚落库的表示。面板不直接发 API 请求，全部经 props 回调上抛。
   历史壳（`story.status === "split"`）不渲染这一区。
10. **Story 拆分**：成员数 ≥2 的普通 Story 显示“拆分 Story”表单——2–5 个后继（标题 +
   kind，默认继承当前 Story 的标题与 kind），每个当前成员、证据条目、关联 Entity 与
   Topic 成员各有一个“留在历史壳 / 后继 N”下拉；提交前要求每个后继至少分到一个成员，
   然后调用 `splitStory`（ADR-0012）。删除入口只在行数**多于下限**时出现（下限 2 来自
   `storySplitSuccessorMinCount`），因此界面到不了“只剩一个后继”这个必然被拒的状态；
   提交前也按下限先拦一次，给可读文案而不是客户端 schema 的原始报错。若所有成员都被分走，
   原条会变成零成员的历史壳，此时先弹确认（`data-story-split-empty-shell`）说明后果再提交：
   壳不再出现在信息库与看板里，而用户状态留在壳上。成功后面板切到返回的历史壳：标题旁显示“历史壳”
   说明、`来源成员（0）`、后继列表（`data-story-shell` 内的 `data-story-successor-id`
   按钮可继续打开后继），Entry/Revision/Observation 详情与写操作区不再渲染。
   **拆分来源回链**：后继的 `story.splitFrom` 指向它拆出的原条，阅读页左栏渲染“拆分来源”区
   （`data-story-split-origin`，按钮带 `data-story-split-origin-id`）。这是零成员壳唯一的
   界面入口——它没有 entry 投影，不出现在任何列表里，没有回链就只能靠记住 URL 才能回去迁移
   用户状态（ADR-0020）。
11. **拆分后的用户状态迁移与撤销**（ADR-0020）：历史壳上“迁移用户状态”区（`data-story-user-state-migration`）
   把收藏、标签、收藏夹、批注与看板固定从一个家族成员搬到另一个。“从”下拉列出本壳与全部后继，
   “迁到”列出除来源外的其它成员；切换来源会重新读取该成员的状态并清空勾选。读操作由
   `use-story-workspace` 的 `loadStoryUserState` 组合 `story`/`listCollections`/`listAnnotations`/
   `listSpotlightPlacements` 四个读端点完成，提交调用 `migrateStoryUserState`。提交前显示“即将迁移：…”
   摘要，超过 20 项时提示是批量操作；成功后重读来源并显示 `已迁移 N 项标记`（有去重时附带跳过数）。
   把“从”选成某个后继、去向选成本壳，就是撤销同一次迁移。
11. **Topic 入口与详情**：`topic-list` Block 由 `client.listTopics` 加载（按 Block `limit` 截断），每行显示标题与
    active 成员数，点击“打开”调用 `client.topic(topicId)` 打开 TopicPanel。TopicPanel 展示
    title/purpose/scope 与成员列表（role 徽章、story id、reason、actor、removed），支持
    修改角色（`updateTopicMemberRole`）、移除（`removeTopicMember`）、恢复（`restoreTopicMember`）
    以及编辑标题/目的（`updateTopic`）。
12. **从 Story 侧加入/创建 Topic**：StoryPanel 提供“加入 Topic”（选择已有 Topic + 角色，
    `addTopicMember`）与“创建 Topic 并加入本 Story”（标题 + 目的，`createTopic` 以当前
    Story 为 seed，seed 恒为 `core` 角色）；成员添加入口从 Story 侧发起，不在 Topic 面板
    里做 Story 搜索选择器（ADR-0007 决策 4）。
13. **Entity 入口与详情**：`/entities` 页的列表由 `client.listEntities` 加载，每行显示名称与
    关联 Story 数，点击行进入 `/entities/:id`（Task 35 后该页仍是占位页，改名/别名/关系/解除关联
    尚无归属页面，见 Task 35 的 Follow-ups）。EntityPanel 展示规范名/类型/别名与关联 Story、
    双向类型化关系，支持改名/改类型（`updateEntity`，
    携带 `baseRevisionId`）、别名增删（`addEntityAlias`/`removeEntityAlias`）、解除 Story
    关联（`unlinkStoryEntity`）、添加/移除 Entity↔Entity 关系（`createEntityRelation`/
    `removeEntityRelation`，关系目标从已有 Entity 列表选择）。
14. **从 Story 侧关联/创建 Entity**：StoryPanel 显示当前 Story 已关联的 Entity（来自
    StoryDetail `entities`，可解除 `unlinkStoryEntity`），并提供“关联已有 Entity”（下拉
    已有 Entity + `linkStoryEntity`）与“创建 Entity 并关联本 Story”（名称 + 类型，
    `createEntity` 后 `linkStoryEntity`）；关联入口从 Story 侧发起（ADR-0008 决策 3）。
15. **用户组织（标签/收藏/收藏夹）**：StoryPanel“用户组织”区显示收藏开关（`setFavorite`/
    `unsetFavorite`，目标为当前 Story）、已附加标签（`story.labels`，可 `detachLabel`）、
    未附加标签下拉（`attachLabel`）与新建标签（`createLabel` 后立即 `attachLabel` 到当前
    Story），以及收藏夹成员勾选（`addCollectionItem`/`removeCollectionItem`）与新建收藏夹
    （`createCollection`）。页面在初次加载时 `listLabels`/`listCollections`，打开 Story 时用
    `listCollections({ storyId })` 取回 `containsStory` 成员标记；所有写命令成功后重读
    Story 与相应列表。面板不直接发 API 请求，全部经 props 回调上抛。
16. **批注（Annotation）**：StoryPanel 与 TopicPanel 的“批注”区由 `client.listAnnotations`
    加载（目标分别为当前 Story/Topic，Story 目标用 canonical id），展示正文、可选引用文本、
    作者与时间，支持新建（`createAnnotation`）、编辑（`updateAnnotation`）与删除
    （`deleteAnnotation`）；写命令成功后重读该目标的批注列表。
17. **Saved View**：搜索卡内的“已保存视图”区块由 `client.listSavedViews` 加载；点击视图名
    把其条件回填搜索表单（含分类与 Topic 多选）并以 `client.search` 套用（label/topic id
    以逗号串传参，`activeSearch` 同步更新，因此分页与刷新沿用同一筛选），输入名称 +
    “保存当前条件”调用 `client.createSavedView`（保存表单里的全部条件，包括分类与 Topic），
    删除调用 `client.deleteSavedView`。保存的是查询条件而非结果快照。
18. **健康检查**：点击“检查服务”调用 `client.health()`，保存 health 并显示 service、
   workerStatus 及 storageStatus notice。
19. **看板渲染（Board）**：首次挂载先 `client.ensureDefaultBoard()` 再 `client.listBoards()`（串行，避免 seed 前的空列表），把 `BoardDetail` 交给
   `BoardView` 按 Section 顺序渲染可见 Block。交互式搜索与「已保存视图」管理是**页面级入口**
   （`aria-label="信息库与搜索"` 的 section，对齐 PRD §8.2），不再寄居在某个 Block 里；看板内的
   每个 `feed` Block **各自取数**：绑定 Saved View 时按该视图条件调 `client.search`，未绑定调
   `client.feed` 取最新内容（ADR-0010 决定 5 按 2026-09-15 裁定收窄为「悬空引用才占位」，因为
   默认看板的阅读流区块是未绑定态，占位会让首页失去内容流）。`source-health` Block 复用页面持有的
   SourceActions，`topic-list` Block 渲染 Topic 列表，`collection` Block 由组件用
   `client.collection(collectionId)` 自取收藏夹详情，`spotlight` Block 用
   `client.listSpotlightPlacements({ boardId })` 自取固定列表并支持逐项解除。`feed`/`collection`/`spotlight`
   三种自取数 Block 都按绑定值重挂载（避免 effect 内同步 setState），取数失败或引用悬空只降级占位。未知
   Block type 与悬空引用显示占位文案，不影响其它 Block。
20. **看板编辑与人工 Spotlight**：看板工具条提供 Board 切换下拉、编辑模式开关与新建看板；
   编辑模式下分区支持改名/上移/下移/删除，区块支持拖拽排序（分区内、跨分区）/上移/下移/隐藏/复制/删除/跨分区移动，
   添加区块时 `feed` 可选绑定 Saved View、`collection` 可选绑定收藏夹（都可先建为未绑定态），
   区块配置可改绑定与条数（写命令统一用返回的 `BoardDetail` 刷新当前树）。Story/Topic 面板提供“固定到看板热点区”
   （`client.pinSpotlight` 到当前 Board），成功后递增 `refreshToken` 触发 Spotlight 区块重新拉取。
21. **区块拖拽排序**：编辑模式下每个区块带独立拖动按钮（`拖拽排序 <类型>`），用 `@dnd-kit` 的
   `PointerSensor`（4px 激活阈值，避免点编辑控件时误触）与 `KeyboardSensor`（聚焦拖动按钮后
   Space 抓取、方向键移动、Space 放下）。提交落点**只使用 dnd-kit 的 `over`**：拖动期间其它区块
   让位的预览就是按它算的，提交必须用同一个信号，否则同一动作会出现两套判定（实测过：预览
   `[A,C,B,D]`、落库 `[A,C,D,B]`，以及向上拖时指针靠近原位置被算成 no-op）。落点按 arrayMove
   语义（把被拖区块移到目标区块当前下标）翻译成一次
   `client.moveBoardBlock(blockId, { sectionId, position })`；服务端 `position` 是「先移除被拖区块、
   再在剩余区块之间插入」的下标，`moveBlock` 语义与该口径等价。松手时先按同一语义在本地落定
   （`applyLocalMove`）再等服务端返回覆盖，失败回滚；`DragOverlay` 关闭 `dropAnimation`，
   使「预览 → 结果」之间不再插入旧顺序或浮层回弹。拖拽只改展示配置，不触碰底层内容
   （ADR-0010 决定 1）。**一个看板只有一个 `DndContext`**（`BoardDndProvider`，2026-10-03 修正）：
   原先每个分区各包一层，分区之间互不可见，拖拽永远解析不出跨分区落点；落点仍按「拖到哪个区块
   就用它在分区内的下标」解析，因此拖到别的分区的区块上就是跨分区移动（与编辑器的「移到」下拉
   同一条 `moveBlock` 路径，ADR-0010 决定 7）。上移/下移按钮与拖拽并存，键盘与按钮路径不回退。
22. **存储面板（OPS-003/004）**：`/settings` 页“存储”区的 `StoragePanel` 挂载时并行 `client.storageStats()`、
    `client.listBackups()` 与 `client.listConnectorStateNamespaces()`，展示数据库/Blob/缓存/可清理媒体的
    占用与备份数量；“新建备份”调 `client.createBackup()`，“恢复”调 `client.restoreBackup(backupId)`
    并提示需重启 API/Worker 才生效。“导出用户数据”调 `client.exportUserData()`，把返回的 `UserDataExport`
    序列化成 JSON 文件交给浏览器下载（文件名 `cosmos-user-data-<exportedAt>.json`，与 API 的
    `Content-Disposition` 用同一约定），并显示各类对象的条数。导出只读、不落盘，内容不含采集内容、
    连接配置与 Secret（ADR-0019 决策 5）。
    面板另有「连接器状态」一组（ING-012 / ADR-0026）：范围下拉默认「全部已归属」，其余选项按名字列出
    抽屉并标出「未归属」（未归属抽屉只能点名导出）；「导出连接器状态」调
    `client.exportConnectorState(scope)` 并下载 `cosmos-connector-state-<exportedAt>.json`。「导入连接器状态」
    读用户选择的文件、先用 `connectorStateExportSchema` 在本地解析（选错文件时给出「不是导出件」而不是
    服务端 400），再调 `client.importConnectorState({mode, targetNamespace?, export})` 并显示新增／覆盖／
    跳过的条数；模式默认「只补缺失」，「覆盖本地」需用户显式选择。
23. **连接面板（AUT-009）**：`/automation` 页“连接”区的 `ConnectionPanel` 挂载时调 `client.listConnections()`。
    新建连接调 `client.createConnection({name, connectorId, configJson?, scopeJson?})`：`connectorId`
    为空时回退 `generic`，两个 JSON 字段为空时不发送该字段。**适配器配置**（`configJson`）是连接的
    非秘密适配器配置，Bilibili 的 OpenCLI profile 就填在这里（Proposal connection-login-lifecycle-v1）；
    每行把它按 `键: 值` 渲染（空值显示「未记录」）。它与**授权范围**（`scopeJson`）都只要求合法 JSON——
    非法时在本地拦下（显示错误、保留表单、不发请求），合法时先 `JSON.stringify` 规范化再提交。
    “标记失效”在行内收集原因后调 `client.updateConnection(id, {status: "error", lastError: 原因})`，
    “恢复可用”调 `client.updateConnection(id, {status: "active", lastError: null})`；两者成功后重取列表，
    “删除”调 `client.deleteConnection(id)`。授权范围与失效原因**今天仍没有自动写入方**（登录探测属
    本 Task 的切片 4b，见 EXT-006），所以面板对这两个字段提供的是用户侧记录入口，不假装系统探测到了原因；
    适配器配置则已经由连接器在抓取时读取。
    **登录探测（切片 4b，ADR-0027 决定 2）**：挂载时同时读 `client.listSourceDefinitions()`，按
    `auth.probeSupported` 决定哪些连接显示「检查登录状态」按钮——没有声明就不显示，避免给用户一个必然 409
    的动作。点击后调 `client.createConnectionProbe(id)` 并按 1.5s 轮询 `client.getConnectionProbe(jobId)`
    （上限 150s，**大于**连接器的 120s 子进程超时，否则一次慢但会成功的探测永远显示成超时）；结论由 API 写回
    连接，面板随后重取列表，因此「可用／错误」徽标与「失效原因」反映的是**系统观测**。每行还显示「上次检查」
    （`lastCheckedAt`，空值「未检查」），并在探测结束后就地显示结论（`active` 显示「登录状态正常：<账号>」，
    其它显示可读原因）。
