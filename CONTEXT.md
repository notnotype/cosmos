# Cosmos Context

> 最后更新：2026-08-11。
>
> 本文件维护 Cosmos 经常使用、跨模块出现或容易歧义的产品共同语言。它不是数据库实体清单，也不提前记录尚未在产品讨论中出现的实现对象。

## 文档边界

- 用户原话保存在 [`docs/requirements/0001-original-requirements.md`](docs/requirements/0001-original-requirements.md)。
- 已整理的产品行为保存在 [`docs/requirements/0002-product-requirements.md`](docs/requirements/0002-product-requirements.md)。
- 总体技术设计保存在 [`docs/architecture/0001-cosmos-foundation.md`](docs/architecture/0001-cosmos-foundation.md)。
- 信息分层、聚类、相关推荐和持续工作区的详细模型保存在 [`docs/architecture/0002-information-model.md`](docs/architecture/0002-information-model.md)。
- 下列定义是当前讨论基线；仍在讨论的名称会明确标注，不当作冻结合同。

## 核心语言

### 信息库

Cosmos 在用户授权和资源预算内持续积累、可查询并尽量可离线访问的内容集合。它保存来源证据、信息条目、关系、用户数据和 Agent 产物。

“已录入后可离线访问”不等于完整复制所有外部资源；正文、图片和附件按来源能力、权限与存储策略尽可能保存。

### 信息条目（Entry）

用户可以单独阅读、收藏、标注和引用的一条来源内容，例如文章、帖子、视频、邮件、群聊消息或公告。它必须保留来源身份，但不要求存在 URL。

“原始报道”不适合作为上位词，因为邮件、娱乐视频和群聊消息未必是报道；“信息”又过于宽泛。当前统一称为“信息条目”，代码概念为 `Entry`。

采集实现中还会保留不可变的 `Observation`，表示 Cosmos 某次实际看到的外部证据；这是为了处理重复轮询和来源编辑，不需要在普通产品对话中与 `Entry` 混用。

Phase 1B 的 `NormalizedIngestItem` 是 Connector 的唯一标准化输出。它使用独立的 `ContentKind` 表达 `post`、`article`、`video`、`audio`、`image`、`comment` 和 `listing`，不复用 Story 的 `kind`。

发布者 `Publisher` 是 Entry 的内容属性。`platformId` 明确允许为空：有作者名但没有平台 ID 时仍保存作者，空白 ID 规范化为 `null`；没有作者信息时 `publisher` 为 `null`。作者 ID 不参与 Entry 身份去重，未知作者类型使用 `unknown`。

来源时间使用 `TemporalValue`：Connector 优先提供证据层精准时间并统一为 UTC，拿不到时才保留展示文本解析出的 fallback。旧 `sourcePublishedAt` 只是查询/API 投影，时间精度提升不产生新 Revision；指标是 Entry 当前快照，变化不产生 Revision。

### Story（规范内容单元）

`Story` 是上层组织和展示使用的规范内容单元。每个 Entry 都属于一个主 Story，Story 使用稳定的 `kind` 区分 `event`、`document`、`media`、`thread` 等形态，并可用受管理、可扩展的 `subtype` 细分，例如 `media.comic`、`media.anime`。核心 kind 的合同保持稳定；新增 subtype 通过注册表声明所属 kind、展示信息、版本和身份规则，不把每个细分都升级成新的顶层 kind。

`event` Story 把描述同一现实事件的多个 Entry 归到一起，例如 BiliBili、AIHot 和 X 的三条“Qwen 3.8 Max 发布”。技术博客、教程、娱乐视频和讨论串也拥有 Story，但通常是单 Entry Story。

不同 kind 使用不同的归并标准。`event` 要求同一现实事件；共享人物或主题只说明“相关”。允许一个 Story 只有一个 Entry。

一个 Entry 只能属于一个主 Story，主 Story 表达该 Entry 自身的规范内容身份。Entry 可以通过 `evidence_for`、`mentions` 或具体文本片段关联多个其它 Story；一篇讨论多个事件的文章仍以 document Story 为主。

### 话题（Topic）

`Topic` 是用户或 Agent 为了持续理解某个问题而建立的关注范围。它回答的是：“为了理解这个问题，哪些 Story 值得持续放在一起？”

Topic 是主观且有目的的，可以带标题、问题、范围和纳入规则，例如“为什么 Jeff Dean 从 Google 离职引起轰动？”或“DeepSeek 定价与生态影响”。

Topic 与 Story 的区别不在持续时间，而在成员关系：Story 按“同一事件”归并，Topic 按“对同一问题有帮助”组织。Topic 只收录 Story，不直接收录 Entry。

Agent 只有在至少两个不同 Story 构成持续问题，或命中用户明确配置的跟踪规则时，才默认自动创建 Topic。单个紧急 Story 通常进入 Spotlight，而不是自动创建 Topic。

Topic 不自动过期。人工归档能力后置。Topic、维护、看板放置、Spotlight 和订阅分别由独立 Binding/Placement/Subscription 表达。

v1 不建立 Topic 的父子层级。需要表达 Topic 之间的联系时，使用带类型的 Topic Relation、标签或 Workspace/Board 的组织结构。

一个 `(Topic, Story)` 组合只有一个当前成员角色；角色变更、纳入和移除通过 revision history 保存，不在 v1 同时维护多方并列 assertion。

### 相关内容

“相关”不是 Story 成员关系。Topic、Workspace、Spotlight 和 Feed 等上层体验以 Story 为组织单位；Entry 仍作为 Story 内的来源证据。第一版使用实体、时间、引用、因果、BM25 和用户兴趣等信号，暂不使用 embedding。

例如“Jeff Dean 创立 Discovery Loop”和“Jeff Dean 离开 Google/Gemini”共享人物并可能构成前后发展，因此适合作为相关 Story，或共同进入一个 Topic；它们不是同一个 Story。

### 分类

分类说明“这类内容放在哪里浏览”，例如开发、硬件、娱乐。它通常由标签和持久查询组合实现，不承担事件聚类或话题跟踪职责。

### 持续工作区（Workspace）

`Workspace` 是一个长期存在、可更新、可交互的用户体验单元，已经替代此前的 `Feature`。`Feature` 在软件开发中通常表示“功能”，同时又被拿来表示话题、页面和精华，歧义过大。

Workspace 可以引用多个 Story、Topic、查询或集合，绑定视图模板和可选的 Workflow/Agent，并保存产物引用与用户交互状态；可以有一个可选的主要锚点，但不要求只能围绕一个 Topic。它不直接拥有或复制信息条目；更换 Agent、模板或报告版本后，身份、看板位置和进度仍然存在。

“每天五个单词”“Jeff Dean 离职专题”“每日 AI 写作竞品分析”都可以是 Workspace。

内部统一使用 `Workspace`；界面按 kind 显示“栏目”“专题”“学习计划”或“工作区”，不强制一个中文总称。

Workspace 的“正在更新”不是 Workspace 身份、生命周期或看板可见性的字段。它由独立的 Workspace Update/Run 状态投影表达，状态为 `queued`、`running`、`waiting`、`succeeded`、`failed` 或 `cancelled`。更新期间仍能查看最近一次成功发布的内容，失败或取消不会替换它。

### 产物（Artifact）

`Artifact` 是用户、系统或 Agent 生成的一次可保存结果，例如研究报告、批注版文章、图片、数据集、附件包或可视化网页。

Artifact 是版本化输出，不负责长期身份、自动刷新或用户进度。Workspace 可以连续产生多个 Artifact Revision。

### 热点（Spotlight）

热点不是新的内容类型，而是某个 Story、Topic 或 Workspace 在一段时间内获得高关注展示的结果。

系统可以根据消息量增速、来源多样性、重要性、紧急性和用户关注计算信号；自动 Spotlight 使用可续期 TTL，人工固定可以不设 TTL。

### 时间线（Timeline）

Timeline 是按时间展示 Story 或 Topic 更新的视图，不是与 Story、Topic 并列的聚合实体。台风登陆适合 Timeline 视图，不意味着它必须成为一种 `Timeline` 类型。

### 精华

“精华”是看板中的策展角色，不是单一底层实体。需要周期更新、Agent 维护或交互状态时使用 Workspace；只是一份固定报告或网页时使用 Artifact。

### 信息流与看板

信息流（Feed）是按分类、查询或推荐策略排列出的连续浏览结果，不是另一份内容副本。

看板（Board）把 Spotlight、精华、Workspace、Artifact 和 Feed 组合、分区和排序，但不拥有底层内容。

## 关系速记

```text
Observation -> Entry -> Story -> Story Revision
                     \-> source evidence

Story + Entity -> Topic
Topic / Story / Query --input binding--> Workspace -> Artifact Revision

Story / Topic / Workspace --Spotlight--> Board
Story --Ranking--> Feed --> Board
```

- `Entry -> Story` 是按 Story kind 判定的主归属；event kind 才要求“同一事件”的严格归并。
- `Story -> Topic` 是“对这个问题有帮助”的主观纳入；Topic 不直接收录 Entry。
- `related_to` 是比 Topic 更轻量、可由算法动态计算的关系。
- Story/Topic merge 选择 canonical ID；旧 ID 永久作为 alias/redirect，历史 revision 和引用不删除。
- Story split 保留旧 Story 作为历史壳，并以 `replaced_by[]` 明确列出后继 Story；旧 ID 不会被静默解析到某一个后继。
- Topic 不建立父子层级；Topic 间关系、标签以及 Workspace/Board 组织承担跨 Topic 的导航。
- `(Topic, Story)` 只有一个当前成员角色，角色变化通过 revision history 记录。
- Topic、Workspace、Spotlight 和 Feed 等上层体验使用 Story，不直接使用 Entry；需要查看证据时再展开 Story 成员。
- Workspace 负责持续体验，Artifact 负责某一次输出，Board 负责摆放。
- Workspace 输入关系可以是多对多，并可标记一个主要锚点；Workspace 不因绑定或解绑 Topic 而改变身份。
- Workspace Update/Run 是维护执行状态；它与 Workspace 生命周期、Board Placement 和 Interaction State 分开。
- Workspace Update 的候选内容只有成功时才原子发布；失败或取消保留上一成功版本。
- 人类接受的字段可以保护，Agent 先生成候选 Revision，不能静默覆盖受保护字段。
- Read State 保存 `last_seen_revision_id`，新 Revision 派生“有更新”，不删除历史已读事实。
- merge 当前用户状态解析到 canonical；split 不自动把状态或 Topic membership 复制到全部后继。
- Spotlight 人工固定/排除绑定具体 Placement，直到用户解除；不同 kind 共用 policy 合同。

## 自动化语言

- `Source`：从哪里获取什么信息。
- `Connection`：用户在某个外部平台上可复用的一次登录或授权关系。
- `CollectionPlan`：用户可见的采集计划；它把 Connection/Source Operation、Trigger、Workflow、checkpoint、预算和重叠策略组合成一个独立采集目标。
- `Trigger`：何时或因何开始。
- `Workflow`：要完成的过程，负责流程、分支、等待、子任务和收口。
- `Activity`：Workflow 中一次需要 journal 的外部读取、写入、等待或非确定性操作。
- `ActionDefinition`：Activity 可以调用的一项版本化能力合同。
- `WorkflowRun`：某一版 WorkflowDefinition 对一份输入快照的一次执行。
- `Job`：宿主为了执行 Activity 而创建的可领取任务。
- `Attempt`：Worker 对 Job 的一次实际执行；它持有本次执行的 lease。
- `Step`：可选的命名逻辑分组和 UI 投影，不是每次执行都必须创建的底层原语。
- `TaskStore`：Job、状态、重试和 lease 的持久权威来源。
- `WakeupBus`：通知 Worker 有工作可领取的机制；它不拥有 Job 的状态或终态。
- `Product Service API`：Web、CLI、Desktop 和知识管理者工具访问 Cosmos 产品
  Command、Query、Event 与受控文件的公共边界。
- `Worker Admin API`：单个 Worker 面向运维的健康、能力、指标和 drain 边界；它不
  接受同步 Job 执行请求。
- `Worker Gateway`：无数据库权限的远程 Worker 主动领取 Attempt、续租和回传结果
  的协议边界；TaskStore 仍是任务和 lease 的唯一权威。
- `Execution Placement`：ActionDefinition 对执行位置的稳定声明，区分
  `host`、`trusted_worker` 和 `remote_worker`。
- `Agent`：通过可选 Agent Action 参与 Workflow 的协作者；它可以维护 Topic 或 Workspace，但不能改写来源原文。
- 人类、Agent 和系统的每次修改都记录 actor、时间、操作、基础 revision、理由和关联 Run。第一版是个人本地优先，不建设细粒度权限系统。
- 当前单用户阶段按最大产品权限运行，不建设审批 UI 或细粒度权限模型；Service/Capability 边界首先是执行、恢复和未来隔离合同，不是当前阶段的权限拦截。
- 未来需要多人、远端或不可信扩展时，再将外部 Source、数据范围、Secret 和外部发送纳入独立权限/审批策略。
- 第一版只运行用户明确安装的本地可信扩展，复杂权限 UI 和不可信插件沙箱后置。

## 2026-08-08：从用户角度的架构审查

> 本节记录本轮讨论形成的共同方向。除非明确标为“已确认”，否则仍属于待实现验证的架构建议，不等同于当前代码已经具备的能力。

### Run、Activity、Job、Attempt、Step、Domain 与 DomainEvent

- `Domain` 是业务领域层，不是数据库表；负责稳定身份、业务规则和可重建的领域计算，不依赖 Prisma、Nest 或 Next。
- `Run` 是一次完整 Workflow 的执行记录，例如“每 30 分钟抓取一次 Bilibili 动态”。
- `Activity` 是 Run journal 中一次需要稳定识别和恢复的交互，例如查询、Action 调用、等待、计时器或子 Workflow。
- `ActionDefinition` 是 Activity 调用的版本化能力合同；它不是某一次执行。
- `Job` 是宿主为执行 Activity 创建的可领取任务，`Attempt` 是 Worker 持有 lease 的一次实际尝试。
- `Step` 是可选的逻辑分组和 UI 投影，例如“拉取”或“入库”，不再是 Workflow 恢复所必需的底层原语。
- `DomainEvent` 是已经发生的事实，例如 `entry.created`、`run.succeeded` 或 `job.failed_terminal`，用于审计、SSE 和后续 Workflow 触发；它不代替领域状态，也不是完整 Event Sourcing。
- 当前已经有脚本优先的 Durable Workflow Runtime、Prisma Store、Run/StepRun/Action Job、等待/子 Workflow、Outbox、lane/priority、租约恢复和固定 `cosmos.ingest@1` 生产接线。API 手动触发与 schedule 走同一个 Ingest Workflow；Probe 及兼容路径仍使用旧 Source Job。通用自定义 Workflow 的稳定 API、插件加载和产品配置尚未完成。

### 数据库与扩展边界

- 数据库是事实、状态、历史和用户真相的持久中心，但不是插件公共合同；插件和 Agent 不直接依赖 Prisma 表。
- 原始 Observation、Entry、EntryRevision、Asset 和用户确认属于持久真相；FTS、分类、关系、推荐特征和 LLM 结果通常属于带 producer/version/evidence 的派生投影。个性化程序配置暂不要求逐字段复制这套 provenance 账本，以免把配置层做成分析结果账本。
- 运行时采用“状态表 + 持久 DomainEvent + 可重建 Projection”，不把所有业务状态压缩到事件日志或任意 JSON 中。
- 外部生产者、Adapter、Connector 和 Cosmos 内部 Action 需要通过版本化 Command、Query、Event、Capability 和 Service Endpoint 访问核心能力。

### Producer、Adapter、Source 与采集计划

- “Producer/Provider”表示外部平台或数据提供者，例如 Bilibili、RSS、AI HOT。
- “Adapter/Connector”表示把某个 Provider 接入 Cosmos 的代码；它负责认证协议、外部读取、标准化和平台特有错误处理。
- Phase 1B 的 `IngestConnector` 是按 `Source.kind` 解析的运行时边界，负责配置校验、外部读取、标准化输出和 cursor，不直接写 Prisma、SQLite 或 Blob。`SourceOperation` 是未来在同一 Provider 下区分多个采集操作的粒度，不是当前用户配置字段。
- `SourceDefinition` 描述一种可用来源或操作；`SourceInstance` 表示用户配置好的具体采集目标。
- 用户界面可以把 `SourceInstance + Trigger + WorkflowBinding` 组合展示为“采集计划”，但不应让用户直接配置 Worker。
- 一个连接可以复用多个采集计划。例如同一个 Bilibili 账号可以有“动态每 30 分钟”和“推荐流每 2 小时”两个独立计划；它们分别拥有游标、错误、预算、发现上下文和重试边界。

### 凭证与适配器状态

- 当前建议由 Cosmos 提供统一 `SecretStore`；Adapter 负责登录协议和凭证格式，但不自行决定凭证的持久化位置。
- `ConnectionInstance` 保存平台、账号、授权范围、状态和 `SecretRef`；Cookie、Token、Refresh Token 不进入普通配置、Job payload、DomainEvent 或日志。
- Adapter 运行时只获得能力受限、短生命周期的凭证租约。
- Cosmos 同时提供命名空间化、版本化的 `ConnectorStateStore`，保存 cursor、ETag、分页 token、速率状态等非秘密状态；Adapter 可以定义状态 schema，但 Cosmos 负责生命周期、备份、并发和恢复。
- OpenCLI/Browser Bridge 当前可以作为外部登录态管理例外，Cosmos 只保存 profile 引用；长期仍需要将其映射到统一 Connection 合同。

### Trigger、Workflow 与 Worker

- `Trigger` 负责判断何时或因何启动，`Workflow` 负责组织过程，`Action` 负责提供单项能力，`Worker` 只负责可靠执行持久 Job。
- 推荐的执行关系为：

```text
Connection / CollectionPlan
  -> Trigger
  -> WorkflowDefinition@version
  -> WorkflowRun
  -> Journal / Activity
  -> ActionDefinition
  -> Job
  -> Attempt + Lease
  -> Worker / Adapter
```

- 未来 Workflow 需要支持顺序、条件、foreach、fan-out/fan-in、等待输入、取消、重试、预算和子 Run；LLM 派发的研究任务也必须通过同一运行时创建子 Job，而不是绕过 Worker 进入内存队列。
- 当前 `scheduleIntervalMs` 放在 Source 配置中只是 Phase 1 简化实现；长期应由持久 Trigger 表达频率、时区、错过执行策略、并发策略和限流。
- Workflow 是 Cosmos 的主动行为核心，但不是领域事实本身。Run、Activity、Job、Attempt、ActionDefinition、Trigger 和持久事件围绕同一个执行合同协作；Step 只作为可选投影。
- 运行控制采用 `Job + Workflow` 组合：Job 是持久执行单元，Workflow 负责组织步骤、分支、等待、子任务和收口。
- 脚本式 Workflow 是最底层、最灵活的执行形态；Graph/IR/Comfy 类表达属于上层编排格式，可以转换为脚本式 Workflow 语义。它们不建立第二套执行 Runtime。
- `nb-workflow` 是规范的脚本执行 Kernel，拥有 Activity path/fingerprint、replay、并发、等待和恢复协议；持久化通过可选 Backend/Port 组合。
- Cosmos Workflow Host 提供持久 Backend、TaskStore、Job/Attempt/Lease、Outbox、Worker 和领域事务；Cosmos 不再长期维护第二套脚本 replay 内核。
- `TaskStore` 是任务权威，`WakeupBus` 只负责唤醒 Worker。Worker 收到通知后仍必须回 TaskStore 正式 claim，不能由通知消息决定 Job 归属或终态。
- `neuro-agent-harness` 不进入 `nb-workflow` Core。Agent 能力通过可选扩展映射到版本化 ActionDefinition；Harness 负责 Agent Invocation、Session、Profile 和 Model Runtime，Cosmos 继续持有 Workflow/Job durable truth。
- 当前实施门禁是先在独立任务中稳定 `nb-workflow` 的 Kernel API 和 conformance，
  再参考 Task 04 Spike 的持久恢复证据与 `docs/api/` Draft v0.2 实现 Cosmos
  Worker/Host。Worker Admin 在本地 Worker 稳定后实现，远程 Worker Gateway
  继续后置；当前不继续扩展 Cosmos 的平行 replay 内核。
- Workflow 可以使用轻量 `kind + tags` 分类，但所有分类共用同一 Runtime。当前建议的 kind 包括 `ingest`、`knowledge`、`research`、`maintenance`、`delivery`、`interaction` 和 `custom`。
- 当前固定 Ingest 的生产链路是
  `cosmos.ingest@1 → source.fetch@1 → library.ingest@1[] → source.checkpoint@1`。
  每个领域写入同时验证 Workflow Run lease 与 Action Job lease；Run 保存定义、
  `SourceExecutionSnapshot`、cursor/checkpoint revision、trigger 和 correlation
  快照；`source.fetch@1` 只读取 Run 中的 Source 配置，不在执行时重新查询当前
  Source。Source checkpoint 使用单调 revision/CAS，过期的并发 Run 只能留下
  可追溯 Observation，不能回滚较新的 cursor。
- 当前 Workflow Runtime 已能生成本地 `WorkerCapabilitySnapshot`，其中包含
  `workerId`、`lane`、`workflowRefs` 和 `actionRefs`。这些 refs 是 Worker
  的本地 claim/admission 过滤提示，不是持久 owner；Run lease 才是实际执行
  ownership。
- 当前 Worker 不会领取未知 Workflow ref，也不会把未知插件 Run 标记为
  `definition_unavailable`；Run 保持 `queued`/`admissionStatus=unknown`，等拥有
  该 ref 的 Worker 出现后接管。当前已增加持久
   `WorkflowWorkerRegistration` projection：它记录每个 Workflow slot 的
   workerId、lane、Workflow/Action refs、capabilities、TTL、registration token、
   registration generation 和版本化 Workflow/Action evidence。旧 registration 默认
  `evidenceVersion=0`/`legacy`/空 evidence；当前 Worker descriptor 产生
  `evidenceVersion=1`/`local-executable`。这些字段仍是 Worker 自报的
  discovery input，不是安全信任证明；Run lease 仍是实际执行 ownership。
  Application 已有显式 CatalogAdmission source/service 和纯一致性 evaluator，
  并已写入独立的最小 capability projection；但 authority projection、owner
  assignment、远程 Worker 或插件 manifest handshake 仍未实现。
- Registry 的 `listActive()` 只回答当前可路由的 active slot，空数组不是删除
  projection 的命令。独立的 `listObserved()` inventory 读取不暴露 token 的
  durable registration，并以 `live`、`stopped`、`expired` 区分时间观察结果。
- Projection Runner 使用一次 `observe({ now, staleAfterMs })` 返回的
  `checkedAt` snapshot 同时获得 active 和 observed registration，避免同一 tick
  中两次 Registry 查询产生时序差异；`listActive/listObserved` 仍保留为兼容
  读取。
- Projection Store 的 `listStale()` 是有界只读查询；Projection Runner 只有在
  Registry 可用、明确观察到 stopped/expired 且 grace period 已过时，才报告
  cleanup candidate。Runner 本身仍不删除、不生成 tombstone、不取得 Run/Job
  lease，也不清除 last-known admitted snapshot；Registry unavailable、active
  set empty 或 registration 未观察到时都保持保守。
- cleanup candidate 可以转换为版本化的
  `cosmos.maintenance.worker-capability-projection-cleanup@1` enqueue command；
  command id 由 worker、projection revision、registration generation 和 terminal
  observation 稳定生成，Workflow 输入只携带 expected revision、generation 和
  业务时间，不携带任何 lease token。
  Application 已提供对应的版本化 Workflow/Action Definition、catalog 注册
  seam 和最小执行实现：Action Job 先重新观察相同的 registration terminal
  state/time 和 generation，再用 `expectedProjectionRevision` CAS 写入
  `retiredAt`、retirement reason/terminal time，保留 last-known snapshot 并清空
  projection lease。Prisma Store 在同一 Data Root 的单条条件更新中再次校验
  generation 和 terminal observation，因此 registration 在 re-check 后被替换时
  不会写入旧 tombstone；相同 Action invocation 可重放为 `already_retired`，
  registration 已复活或 projection revision 已变化则安全跳过。该
  Definition/Action 尚未由 `apps/worker` 默认 wiring、scheduler 或 candidate
  consumer 自动注册/消费；InMemory Store 也不能模拟这个跨表数据库原子性。
- 当前提供只读 `GET /api/v1/workflow-workers` 查询和对应 HTTP Service Client；
  返回不含 registration token 的 Worker discovery envelope。`status=enabled`
  表示注册表查询成功，即使 `items` 为空；`status=disabled` 表示功能被配置关闭
  且不会查询注册表；Worker Registry 未显式设为 `prisma` 时默认是 disabled；
  `status=unavailable` 表示查询失败。它不负责调度、owner assignment 或 Run
  admission 状态迁移。
- Workflow Run 的当前 `admissionStatus` 只接受 Worker 的正向可执行证据写入
  `ready`；单个 Worker 缺少 Action、catalog 或 snapshot mismatch 时不得把全局
  Run 写成 `definition_unavailable`，以免阻塞另一个拥有同一 Workflow ref 的
  Worker。此类负面本地观察留在 diagnostics；当前新增的
  `createCatalogAdmittedWorkflowWorkerEvidence()` 和
  `WorkflowWorkerCatalogAdmissionService` 只产生显式诊断/候选 projection，
  不改变 Run 状态。未来的 `definition_unavailable`/`no_capable_worker` 仍需要
  有权威输入的独立 projector，不能由任意 Worker 直接覆盖全局状态。

### Entry、Story 与知识 Pipeline

- 当前 Entry → Story 是保守的单 Entry Story projection，用于先保证可阅读，不代表完成了跨来源事件聚类。
- Ingest 本身是一种 Workflow，但事实入库的核心事务由 Cosmos Application Layer 保证；外部来源事实不等待 LLM。
- Entry → Story 是可由用户或 Agent 配置的 `knowledge` Workflow。可以“所有 Entry 分批走 Agent”，也可以“脚本策略先处理，难以决策、强相关或重要内容再升级给 Agent”。
- 推荐保留两条路径：
  - 同步事实路径：Workflow/代码完成标准化、去重、证据保存、Revision 和最小 Story 创建，不依赖 LLM。
  - 异步知识路径：可配置 Workflow 召回候选，规则/模型/LLM 生成分类、聚类、实体、关系、重要性和紧急性建议。
- LLM 不直接改写 Observation 或最终用户真相；它生成带输入 Revision、模型/版本、置信度、Evidence 和 Run 的 `AnalysisResult/Proposal`，再由 Policy 自动接受、进入候选或请求用户确认。
- LLM 可以担任“知识管理员”或研究规划者，但数据库、Runtime、Capability 和预算仍是权威；当前单用户阶段不建设审批 UI。LLM 请求多个平台搜索时，只能调用已注册且可用的 Adapter/Action。
- 未来跨来源 Story 需要 `StoryMembership`、候选聚类、merge/split 历史和可审计的证据引用；不能只依赖当前 `Entry.storyId`。
- Research 不直接耦合到 Ingest。知识分析可以产生紧急、需要研究或来源冲突等信号，再创建持久的 `ResearchRequest`（名称待定），由 Trigger 启动独立的 `research` Workflow。
- Research Workflow 可以同时查询 Cosmos 信息库并访问已配置的外部渠道；新发现仍重新经过 Observation → Entry，而不是直接写入 Story。

### 知识管理者与个性化配置（草案）

- 知识管理者是用户与 Cosmos 交互的高权限系统角色，可以代替用户执行 GUI 中可执行的操作；它仍通过 Service/Workflow/Capability 边界运行，不直接写数据库或绕过外部副作用控制。
- 用户入口包括 Web GUI 内的直接聊天，以及 `cosmos cli`。两者调用同一组版本化 Command、Query、Workflow 和 Event 合同。
- 知识管理者不是一个 Session。系统可以有多个聊天、ingest、研究或其它专业分身，它们共享同一个 `nb-memory` 长期记忆与知识库。
- `nb-memory` 适合作为知识管理者的共享记忆/知识库；Cosmos 负责信息库、行为观察、运行时和外部能力。对应调研记录见 [`docs/research/2026-08-08-nb-memory-research.md`](docs/research/2026-08-08-nb-memory-research.md)。
- ingest 过程中可以调用知识管理者进行知识点细究、补充研究或生成 Proposal；需要外部平台搜索时，知识管理者必须通过已注册且可用的 Adapter/Action 创建持久子 Job。
- 个性化配置的当前方向是：`Agent 记忆 + Cosmos 观察到的用户行为 + 未来其它信号 -> 程序可读的配置`。当前不设计逐字段 producer/version/evidence，也不把平台自身推荐信号作为独立偏好模型。

### 推荐系统

- 外部平台的推荐流可以是候选来源，但不等于 Cosmos 的最终推荐，也暂不作为独立的 Cosmos 用户偏好信号建模。
- Cosmos 推荐采用两道决策：
  - `Admission`：是否值得保存到信息库。
  - `Ranking`：当前是否值得在某个 Feed/Board surface 展示。
- 代码负责硬过滤、时间、新颖性、来源质量、去重、多样性、预算和模型不可用时的降级。
- LLM 可以异步生成主题、实体、质量、重要性、紧急性和小规模 rerank 特征，但普通 Feed 不应依赖在线 LLM。
- 后续需要持久化 `Candidate`、`FeatureValue`、版本化 `RecommendationPolicy`、`RecommendationDecision`、`Impression`、`Feedback` 和 `ReadState`，并保留排序原因。

### 当前完整性判断

- Phase 1 的采集、持久化、搜索和离线阅读基础已经足够继续验证。
- 面向高扩展产品的连接管理、通用自定义 Workflow 产品面、知识处理、Story 多成员关系和推荐反馈闭环尚未完整实现。
- 在继续增加大量平台 Adapter 前，优先补齐 `Connection/Secret/State`、脚本优先的 Workflow API、通用 Job/子任务和 Proposal/Provenance 合同。
- 知识管理者与 `nb-memory` 的共享记忆接入方向已确认，但 Adapter、行为观察到程序配置的转换和 Web/CLI 入口尚未实现。
- 当前已发现的实现边界需要在扩展更多 Workflow/Adapter 时继续收口：
  - 固定 Workflow Ingest 已用双 lease fencing 保护 Observation、Entry/Revision、
    Asset、FTS、DomainEvent/Outbox 和 checkpoint，并验证旧 Worker 接管后不能写入；
    其它未来领域 Command 必须复用该 fence，旧兼容 Ingest 路径尚未删除。
  - 无 URL fallback identity 已包含规范化 `sourceLocator`；有条目级稳定 locator
    时可以把来源修订归入同一 Entry。若 Adapter 只能提供页面级 locator，fallback
    仍会包含规范化内容，正文修改可能生成新 Entry。后续需要显式
    `identityStrength`、`identityVersion` 和 `identityBasis` 合同，不能把弱
    fallback 误报成稳定外部身份。
  - 固定 Ingest 已保存 `manual`/`schedule`、Workflow ref 和 Action command key；
    关注账号、推荐流、搜索、公告监控和 Research 仍需由未来采集计划提供更完整
    discovery context。
  - 当前 Prisma `SourceInstance` 仍是 Phase 1 的简化 Source；Connection、多个
    采集计划、Trigger/Workflow binding 和 StateStore 尚未建模，checkpoint 仍按
    SourceInstance 维护。
  - Workflow Run 已保存定义、输入、correlation、开始/结束时间和 budget 快照；
    当前 Ingest 还会保存独立 Source execution snapshot。相同幂等键重放复用首次
    Source/cursor 输入，不读取后来修改的配置。
  - Source checkpoint 已有 revision/CAS，较旧并发 Run 不会覆盖较新 cursor；完整
    Connection/多采集计划上线后，revision 必须迁移到各计划独立的 StateStore。
  - 当前 Ingest journal 会在 Job、Action Invocation、Step output 和后续 Action
    input 中重复保存 page/item；fixture 规模可接受，扩展大 Feed 或二进制来源前
    必须设计 value/reference、Blob/Artifact 引用和 journal retention。
  - capability projection retirement 的 registration replacement 窗口已经由
    Prisma 的 `registrationGeneration` 条件更新收口，但这只覆盖同一 Data Root
    内的 projection cleanup，不等于通用领域写入或 Ingest lease fencing。

## 当前命名结论

1. 用户可读的最小内容单元使用“信息条目 / Entry”，不使用“原始报道”作为总称。
2. 上层规范内容单元使用 `Story`，并通过 kind 区分 event、document、media、thread；event Story 才表示同一事件聚类。
3. 长期、主观、目的驱动的聚合使用“话题 / Topic”，正式替代 `Subject`。
4. `Timeline` 是视图模板，`Spotlight` 是展示角色，二者都不是内容聚合类型。
5. `Workspace` 正式替代 `Feature`；界面根据 kind 使用“栏目”“专题”“学习计划”或“工作区”。
6. `Artifact` 保留，专门表示可追溯、版本化的生成结果。
7. 每个 Entry 默认拥有一个主 Story，单 Entry Story 是合法状态；Topic 只收录 Story。
8. Agent 自动创建 Topic 需要至少两个不同 Story，或命中用户明确跟踪规则。
9. 第一版相关推荐不使用 embedding。
10. Topic 不自动过期；人工归档后置。
11. 第一版预算保持简单：全局日预算、单次 Run 上限和紧急保留预算；复杂继承、公平调度和借用后置。
12. Story kind 保持少量核心集合，细分使用受管理、可扩展的 subtype。
13. 一个 Entry 只有一个主 Story，但可以作为证据关联多个其它 Story。
14. Story/Topic merge 保留旧 ID alias、历史 revision 和可审计 merge 记录。
15. Story subtype 通过受管理注册表扩展，核心 kind 合同保持稳定。
16. Story split 保留旧 Story 历史壳，并用 `replaced_by[]` 指向后继 Story；旧 ID 不会被模糊重定向。
17. v1 不建立 Topic 父子层级；Topic 间联系使用 Relation、标签或 Workspace/Board 组织。
18. Topic 成员关系只有一个当前角色，历史角色和修改过程保存在 revision history。
19. Story 使用不可变 Revision 和当前 Revision 指针；历史报告固定引用当时的 Revision。
20. Feed 的曝光与主要反馈以 `(用户, Story, surface)` 为粒度，展开信源后再记录 Entry 交互；收藏和批注可明确指向 Story 或 Entry。
21. Agent 可直接移除未被人类确认的自动 Topic 成员；人类明确加入或确认的成员需要提出移除建议，所有移除保留可恢复历史。
22. Workspace 可以绑定多个 Topic、Story、查询或集合，并可有一个主要锚点。
23. Spotlight 使用分离信号、版本化 policy、迟滞阈值和 TTL；人工固定或排除覆盖自动策略。
24. Workspace Update/Run 表达 Agent 的更新执行状态，不与 Workspace 身份、生命周期、Board Placement 或 Interaction State 混为一个字段。
25. Workspace Update 失败/取消保留上一成功版本，成功时原子发布候选内容。
26. 人类接受的字段保护优先于 Agent 自动更新。
27. `last_seen_revision_id` 只增加“有更新”投影，不抹掉已读历史。
28. merge 解析当前状态到 canonical；split 通过显式 migration，不自动扇出状态。
29. Spotlight 人工覆盖绑定具体 Placement，直到用户解除。
30. v1 和默认产品合同面向单个本地用户；未来协作保留 actor/revision 扩展位。
31. 当前单用户阶段知识管理者和 Agent 按最大产品权限运行，不建设审批 UI 或细粒度权限模型；未来再叠加远端/多人/不可信扩展的权限策略。
32. 第一版不建设细粒度权限 UI 或不可信插件沙箱，只运行本地可信扩展。
33. Phase 1 首条真实 Connector 使用 RSS/RSSHub，并配套 fixture Connector。
34. 运行控制采用 `Job + Workflow` 组合；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达转换为脚本语义并落到同一持久 Runtime。
35. 知识管理者是共享 `nb-memory` 之上的高权限系统角色，可以通过 Web Chat、`cosmos cli` 和 ingest/research Workflow 参与系统操作；它不是单一 Session。
36. 个性化配置由 Agent 记忆、Cosmos 观察到的用户行为和未来其它信号共同生成；当前不要求逐字段 provenance，也不独立建模平台推荐偏好信号。
37. Workflow 是 Cosmos 的主动行为核心；Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 使用同一 Runtime，并通过 `kind + tags` 做轻量分类。
38. Ingest 本身是一种 Workflow；事实入库不等待 LLM。Entry → Story 是可由用户或 Agent 配置的 Knowledge Workflow。
39. Research 不直接耦合 Ingest；分析信号创建 `ResearchRequest`（名称待定），由 Trigger 启动独立 Research Workflow。
40. Research Workflow 可以查询 Cosmos 信息库并访问外部渠道；研究结果重新经过 Observation → Entry，不直接写入 Story。
41. `Activity` 是 Workflow journal 的恢复单元；`ActionDefinition` 是能力合同；`Job` 是可领取任务；`Attempt` 是持有 lease 的一次执行；`Step` 只是可选逻辑/UI 投影。
42. `nb-workflow` 拥有规范脚本语义，Cosmos Workflow Host 拥有持久 TaskStore、Job/Lease、Outbox 和领域事务；两者不平行实现 replay。
43. `TaskStore` 是任务状态和 lease 的唯一真相；`WakeupBus` 是可选通知层，不能成为第二套任务权威。
44. `CollectionPlan` 正式表示 Connection/Source Operation、Trigger、Workflow、checkpoint、预算和重叠策略组成的用户可见采集计划。
45. 实施顺序固定为先稳定 `nb-workflow`，再以 Task 04 Spike 和 Worker API Draft
    作为输入实现 Cosmos Worker/Host；Worker Admin 与远程 Gateway 不先于本地
    Worker 的 Kernel convergence。

## 技术与运行形态（初步）

> 2026-08-07。本节记录已经确认、但明确允许在真实实现后调整的技术方向。

- Web 使用 React + Next.js App Router；API 使用 NestJS；脚本优先的 Workflow 和 Job 由独立 Worker 运行。开发使用 Bun，生产使用 Node，面向生产的共享代码保持 Node-compatible，不把 Bun-only API 变成领域或公共合同。
- 初始数据层使用 Prisma + SQLite；FTS5/BM25、虚拟表、触发器和其它 SQLite 专用查询可以通过受控 SQL Adapter 实现。Prisma、SQLite 和搜索实现都不是不可替换的领域合同。
- 服务器部署是第一优先级；产品同时保留客户端模式和客户端与服务分离模式。三种模式共用 versioned Command、Query、Event 和 Service Endpoint 合同，客户端不直接访问 Prisma、SQLite 或 Data Root。
- Desktop Shell 只负责承载 UI、连接本地或远程服务并管理必要的本地生命周期；具体选择 Tauri、Electron 或其它壳后置，不让壳概念进入领域模型。
- 当前 Agent 使用量较少，Phase 1 可以直接使用 `pi-ai`。`neuro-agent-harness` 作为独立项目持续演进；稳定后再通过 `ModelRuntime`、`SessionStore`、Profile 和 Capability Adapter 接入 Cosmos。
- Harness 的 TSX Profile、领域无关常用工具（例如 `read`）和 SSE Transport 可以逐步吸收，但 NeuroBook 专属 Profile、Workspace、路径、配置和 watcher 不进入 Core；sidecar 不属于 Harness 核心职责，旁路执行由 Workflow 组合。
- shadcn/ui 使用官方 skill 和 CLI，组件代码归项目源码所有；skill 只约束组件查询、文档、组合、样式和更新流程，不是 Cosmos 的领域依赖。

## 后置事项

1. 同一 Workspace 的并发更新、重复触发合并和取消/接管语义。
2. Agent 候选 Revision 的接受/拒绝界面，以及字段保护的最小实现。
3. `updated_since_last_seen` 在不同 surface、Story split 和 Story merge 后的投影规则。
4. 显式 state migration command 的批量操作、撤销和用户确认边界。
5. Bun 开发与 Node 生产在 Next、Nest、Prisma、Worker 和 Harness Adapter 上的兼容矩阵。
6. Prisma/SQLite 的 FTS5 Migration、触发器、Raw SQL Repository 和未来存储替换边界。
7. 服务器、客户端和客户端与服务分离模式的认证、Service Endpoint、SSE 恢复和 Blob/Artifact 访问合同。
8. Desktop Shell 的具体实现、Node sidecar 生命周期和安装/升级/卸载行为。
9. `pi-ai` 直接接入到 Harness `ModelRuntime` 的迁移门槛，以及 NeuroBook Harness 与独立 Harness 的行为差异。
10. SecretStore 第一版后端，以及 Adapter 访问 SecretRef/StateStore 的公共接口。
11. 一个 Connection 下多个 SourceInstance/采集计划的 UI 和持久模型。
12. 脚本优先 Workflow Runtime 的 Context、Action 调用、fan-out/fan-in、等待、Child Workflow、Journal、Graph/IR 转换和取消/接管语义。
13. Entry → Story Knowledge Workflow 的绑定、批处理、脚本/Agent 升级策略、Proposal 自动接受门槛和 StoryMembership 迁移。
14. Admission、Ranking、Impression、Feedback 和 LLM 异步特征的第一版预算。
15. `nb-memory` Adapter/Port、共享记忆目录、Node 生产兼容性以及 Cosmos Observation/Behavior 到 memory 的映射。
16. 知识管理者 Web Chat、`cosmos cli`、ingest 参与方式和高权限操作的最小运行合同；当前不建设审批 UI。
17. Agent 记忆与行为观察生成程序可读个性化配置的 schema、更新频率和人工覆盖边界。
18. Research Request、Trigger、Research Workflow、外部渠道访问、结果重新入库和失败恢复语义。

这些事项不阻塞 Phase 0，且本次 grilling 不继续展开。
