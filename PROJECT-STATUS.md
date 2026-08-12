# Cosmos Project Status

> 截至 2026-08-11。

## 一句话结论

`origin/master` 已完成 Phase 1 最小服务器闭环，完整 Phase 1/扩展平台仍未完成。
当前未合并的 Task 04 worktree 另行验证了
fixture RSS → 版本化 Workflow Run → fetch/ingest/checkpoint Action Job →
Observation/Revision/Asset/最小 Story → Prisma/SQLite/FTS5 → Nest API/Worker/Web，
以及 AI HOT、Node 和浏览器链路；这些是 Spike 证据，不是目标 Kernel convergence
已经交付。

架构已决定让 `nb-workflow` 成为唯一规范脚本 Kernel、Cosmos 保留 Durable Host，
并使用 SQL TaskStore + 可选 WakeupBus。下一工程工作是先独立稳定
`nb-workflow`，再参考 Task 04 Spike 和 `docs/api/` Draft v0.2 实现 Cosmos 本地
Worker/Host。Worker Admin 随后实现，远程 Worker Gateway 继续后置。

## 当前真相分层

- `origin/master`：Phase 1 最小服务器闭环的当前共享基线。
- Task 04 worktree：未合并的 Durable Workflow Runtime Spike、恢复和产品验收
  证据；当前质量结论仍是“需修改、尚不建议合并”。
- ADR-0002/0003：已经接受的 Kernel/Host、TaskStore/WakeupBus 和三个 API 面边界。
- `docs/api/` Draft v0.2：已经五路只读审查、尚未进入公共 Zod schema 或宿主实现
  的目标合同。
- Task 06：设计已同步、实现暂停，阻塞于 `nb-workflow` 稳定门禁。

## 已完成

- 初始化本地 `master` 分支。
- 建立需求、架构、ADR、研究和 Task 文档体系。
- 逐字保存项目初始需求与本轮需求。
- 整理完整产品需求文档，建立需求编号、阶段范围、验收条件、主要界面和原始需求追踪。
- 完善根目录 README，作为项目介绍、能力概览、使用场景和路线入口。
- 形成 Source / Trigger / Workflow / Action、信息库、Story、Topic、Workspace、Artifact、看板和后续投递的架构草案。
- 新增独立信息领域模型，拆开同一事件聚类、宽泛相关推荐、Topic 组织和 Workspace 持续体验。
- 明确 Timeline 是视图、Spotlight 是展示决定、“精华”是 Board 策展角色。
- 整理本地单用户阶段的混合召回、可解释排序和多样性推荐基线。
- 接受 `Subject -> Topic` 与 `Feature -> Workspace`。
- 确认每个 Entry 默认拥有一个主 Story，Story 以 event/document/media/thread 等 kind 表达规范内容，允许单 Entry Story。
- 确认 Agent 自动创建 Topic 需要至少两个不同 Story，或命中用户明确跟踪规则。
- 确认 Topic 不自动过期，人工归档后置。
- 确认人类、Agent 和系统按协作者记录 actor/revision。
- 确认 Workspace UI 按 kind 使用栏目、专题、学习计划或工作区。
- 确认核心 Story kind 保持稳定，media 等内容通过 subtype 细分。
- 确认 Topic、维护、Board 放置、Spotlight 和订阅使用独立关系。
- 确认自动 Spotlight 使用可续期 TTL，人工固定可以不设 TTL。
- 确认第一版权限与预算保持简单，只保留 actor/revision、全局日预算、单次 Run 上限和紧急保留预算。
- 确认一个 Entry 只有一个主 Story，但可以关联多个其它 Story。
- 确认 Story/Topic merge 保留 canonical ID、旧 alias 和历史引用。
- 确认 Story subtype 使用受管理注册表，核心 kind 合同保持稳定，未知 subtype 可降级读取。
- 确认 Story split 保留旧 Story 历史壳，以 `replaced_by[]` 指向全部后继，不做模糊单目标重定向。
- 确认 v1 不建立 Topic 父子层级，使用 Relation、标签或 Workspace/Board 组织。
- 确认一个 `(Topic, Story)` 只有一个当前成员角色，历史修改保存在 revision history。
- 确认 Story 当前标题、摘要、关键事实和时间范围使用不可变 Story Revision 与当前指针。
- 确认 Feed 曝光和主要反馈按 Story/surface 记录，Entry 交互在展开具体信源后补充。
- 确认 Agent 不能静默移除人类明确加入或确认的 Topic 成员。
- 确认 Workspace 输入使用多对多 binding 和可选主要锚点。
- 确认 Spotlight 使用分离信号、版本化 policy、迟滞、TTL 和人工覆盖。
- 补充 Workspace Update/Run：用户应能看到 Agent 更新状态、操作者、步骤和最近结果，运行态不与生命周期或 Board 状态混写。
- 确认 Workspace Update 使用六种状态，失败/取消保留上一成功版本，成功时原子发布。
- 确认人类接受的 Story/Workspace 字段可以保护，Agent 先生成候选 Revision。
- 确认 Read State 保存 `last_seen_revision_id`，新 Revision 派生“有更新”。
- 确认 merge 将当前用户状态解析到 canonical；split 不自动扇出状态和 Topic membership。
- 确认 Spotlight 人工覆盖绑定具体 Placement，直到用户解除；不同 kind 共用 policy 合同。
- 确认 v1 和默认产品合同面向单个本地用户，未来协作只保留 actor/revision 扩展位。
- 确认当前单用户阶段知识管理者和 Agent 按最大产品权限运行，不建设审批 UI 或细粒度权限模型；未来再叠加远端/多人/不可信扩展的权限策略。
- 确认第一版不建设细粒度权限 UI 或不可信插件沙箱，只运行本地可信扩展。
- 确认 Phase 1 首条真实 Connector 使用 RSS/RSSHub，并配套 fixture Connector。
- 初步确认 React + Next.js App Router、Tailwind、shadcn/ui、React Hook Form、Zod、NestJS、Prisma + SQLite、Docker；技术选择允许在实现验证后调整。
- 初步确认 Bun 用于开发、Node 用于生产，并要求共享代码和 Worker 保持 Node-compatible。
- 初步确认服务器部署优先，同时保留客户端模式和客户端与服务分离模式；三种模式共用版本化 Service Endpoint、Command、Query、Event 和 SSE Transport。
- 初步确认 Phase 1 先直接使用 `pi-ai`；`neuro-agent-harness` 独立演进，后续通过适配合同接入；sidecar 移出 Harness Core。
- 将 Phase 1 的实现范围收紧为 RSS/RSSHub + fixture + 最小 Story projection，并建立持续 walkthrough。
- 初始化 Bun workspace、TypeScript 基线和根级 lockfile。
- 建立 `apps/web`、`apps/api`、`apps/worker`，并验证 Next.js、NestJS API 健康端点和 Node Worker 生产产物。
- 建立 `contracts`、`domain`、`application`、`storage-prisma`、`blob-store` 和 `plugins/rss` 最小包边界。
- 建立 Prisma SQLite schema、受控 FTS5 SQL、URL-free RSS fixture，以及 Dockerfile/Compose 服务器入口。
- 完成第一版运行诊断日志：API、Worker、Connector、存储和 Web 服务端统一输出 `log.v1` JSONL，支持 request/Run/Job/Source/Connector 关联、脱敏、轮转和本地保留。
- 按 shadcn skill 初始化 `components.json`，加入 `button`、`card`、`badge` 源码组件和最小 Story Feed 页面。
- 固化 `Source`、`Run`、`Job`、`Feed`、`Search`、`Story`、`Entry`、`Revision`、`Asset`、错误、健康检查和 SSE Event Envelope 合同，并提供 HTTP Service Client。
- 完成 Prisma migration、`COSMOS_DATA_ROOT`/`DATABASE_URL` 数据边界、隔离 Data Root、内容寻址 Blob Store 和 FTS5/BM25 受控 SQL Adapter。
- 完成 fixture/RSS Connector 的 URL、无 URL、重复轮询、来源修订和媒体元数据路径；重复录入不产生重复 Entry，来源变化追加 Revision，原始 Observation 保留。
- API 已提供 Source 创建/查询/启停/测试、手动 queued Run、Run 状态、Feed、Search、Story/Entry/Revision 详情和受控 Asset 读取。
- Worker 已接入持久 Job claim、租约 token、过期接管、旧 token 拒绝、有限指数退避、schedule bucket、heartbeat 和 checkpoint。
- API 手动 Source Run 与 schedule 已统一通过 Prisma atomic
  `WorkflowCommandRepository` 创建 `cosmos.ingest@1` Run；Worker 默认执行
  `source.fetch@1 → library.ingest@1[] → source.checkpoint@1`，Probe 与兼容入口
  暂时保留旧 Source Job。
- 固定 Ingest 的领域事务同时验证 Workflow Run lease 与 Action Job lease；
  Observation、Entry/Revision、Asset、最小 Story、FTS、DomainEvent/Outbox 和
  checkpoint 的 stale Worker 写入均有 Prisma 行为测试。
- URL-free fallback identity 已包含规范化 `sourceLocator`；Observation 保存
  manual/schedule、Workflow ref 和稳定 Action command key。缺少条目级稳定
  locator 时，内容修订仍可能生成新 Entry。
- Workflow Run 保存 definition/input/correlation、lane/priority/budget 以及真实
  started/finished 时间；Source 查询通过 correlation 投影最近一次 Ingest
  Workflow 状态。
- 固定 Ingest Run 保存独立 `SourceExecutionSnapshot`、cursor、checkpoint revision
  和 trigger；`source.fetch@1` 不再重新查询当前 Source。InMemory 与 Prisma
  行为测试证明排队后修改 Source 配置不会改变该 Run，幂等重放也不会读取新配置。
- Source checkpoint 保存单调 revision；并发旧 Run 的 CAS 失败会记录
  `source.checkpoint.superseded.v1`，保留已经采集的 Observation，但不会回滚
  新 cursor。
- Action 的 `retry_wait` 通过 `nextAttemptAt` 参与 Run claim；重试到期前不会让
  父 Run 被 Worker 高频反复领取。
- Workflow Run lane 已接入持久 `WorkflowWorkerRegistration`：每个 slot 使用独立
  registration token、TTL heartbeat、失效重注册和 graceful stop；Registry 只做
  capability discovery，不替代 Run lease ownership。
- Application Query、Nest API 和 HTTP Service Client 已接入只读
  `GET /api/v1/workflow-workers`；返回不暴露 registration token 的 discovery
  envelope。`enabled`、`disabled` 和 `unavailable` 分别表示查询成功、功能关闭
  和注册表查询失败；查询成功但没有 active Worker 时仍返回 `enabled` + 空
  `items`，不把它误判成 Definition 不存在，也不参与 Run 调度。API/Worker
  只有显式 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 才启用 Registry，未设置时
  默认 disabled。
- 修复 Worker process heartbeat 的 fire-and-forget race，Supervisor drain 现在等待
  `ready` observation 后再写入 `stopped`。
- admission refresh 已收紧为正向证据：单个 Worker 的本地 catalog/Action/
  snapshot 失败不会覆盖全局 Run 为 `definition_unavailable`；未来由独立
  projector 表达全局不可用或 `no_capable_worker`。
- Worker Registry 当前保存的 Workflow/Action refs 和 generic capabilities
  只是 discovery hint；它还不能证明某个 slot 与 Run 的
  `definitionSnapshot`、Workflow manifest hash 和 Action dependency hashes
  精确匹配。未来 availability projection 必须使用单独的 capability evidence，
  不能把 ref 命中直接当成可执行证明。
- 新增不落库的 `assessWorkflowWorkerCapability()` 纯评估：对单个 Worker
  evidence 与 Run snapshot 返回 `capable`、`ineligible` 或 `unknown`；它不参与
  claim，不改变 Run/lease 状态，也不代表 Registration evidence 已经持久化。
- 新增不落库的 `aggregateWorkflowWorkerAvailability()`：只有 fresh enabled、
  `assessmentComplete=true` 且没有 capable Worker 时才产生诊断性的
  `no_capable_worker`；disabled、unavailable、stale 或 partial evidence 都保持
  unknown/registry_unavailable。
- 增加 Phase 1B 受管 Collector Runtime：`bilibili`、`aihot`、`rss`、`fixture-rss` 使用业务 Source kind，OpenCLI 不暴露为通用来源类型。
- Probe 已改为异步持久 Job；API 只创建/查询 Job，Worker 执行 dry-run，Probe 不写 Observation、Entry、Asset 或 checkpoint。
- 完成 OpenCLI 固定版本 `1.8.6`、外部 executable 覆盖、版本校验、Browser Bridge doctor 前置检查和 profile 引用边界；Cosmos 不保存 Cookie/Token。
- 将 OpenCLI 执行器抽象为独立插件 `plugins/opencli`（`@cosmos/plugin-opencli`）：runner、退出码映射（66/69/77/超时）、doctor/version 预检和 executable 覆盖随迁并导出；Bilibili Connector 改为引用该插件，API/Worker 依赖链与 Ingest/Probe Job 路径不变。
- 完成 AI HOT 固定 endpoint `https://aihot.virxact.com/api/v1/items`、cursor 采集、统一 Entry 标准化和错误恢复。
- 真实 AI HOT Worker smoke 已通过：隔离 SQLite 中 queued Run 成功并保存 3 条 Entry。
- SSE 已提供持久 Domain Event、游标回放、`Last-Event-ID`/`after`、keepalive 和 `snapshot_required`；Web 会自动刷新并展示服务/SSE 状态。
- Web 已通过 Service Endpoint 完成来源表单、真实健康检查、队列触发、Feed、关键词/来源/时间/分页搜索和 Story → Entry → Source/Revision 展开。
- Node 生产冒烟和 Playwright 浏览器链路已通过；浏览器验证覆盖来源创建、队列触发、Feed、搜索、URL-free Story 详情和服务状态。
- 结束本次 grilling；实现级未决问题转入后置清单。
- 确认第一版聚类和相关推荐不使用 embedding。
- 完成 `nb-memory` 本地调研：确认其适合作为知识管理者共享长期记忆/知识库，不替代 Cosmos 的 Workflow、Job 或来源事实运行时。
- 确认知识管理者是共享 `nb-memory` 之上的高权限系统角色，可通过 Web Chat、`cosmos cli` 和 ingest/research Workflow 参与；它不是单一 Session。
- 修正个性化配置方向为“Agent 记忆 + Cosmos 观察到的用户行为 + 未来其它信号 → 程序可读配置”，暂不要求逐字段 provenance，也不独立建模平台推荐偏好信号。
- 确认运行控制采用 `Job + Workflow` 组合；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达转换为脚本语义。
- 确认 `nb-workflow` 是规范脚本 Kernel，持久化通过可选 Backend 组合；Cosmos
  保留 Run/Journal、TaskStore、Job/Lease、Outbox、Worker 和领域事务。
- 确认队列拆为 SQL TaskStore 与可选 WakeupBus；Redis Streams 只做唤醒、限流
  和缓存，不成为 Job/lease 的第二权威。
- 确认 Activity 是 journal 单元、ActionDefinition 是能力合同、Job 是可领取
  任务、Attempt 是持有 lease 的一次执行，Step 降为可选逻辑/UI 投影。
- 确认 `wf.agents.invoke` 属于可选 Agent Extension，具体 Harness Adapter 等
  `neuro-agent-harness` 文档稳定后接入，Core 不依赖 Harness。
- 确认 Workflow 是主动行为核心；Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 使用同一 Runtime 的轻量分类。
- 确认 Ingest 不等待 LLM；Entry → Story 是用户/Agent 可配置的 Knowledge Workflow，Research 通过 Request/Trigger 与 Ingest 解耦。
- 将 `CONTEXT.md` 收缩为产品共同语言，只维护经常使用、跨模块或容易歧义的核心概念；实现级对象留待真实开发需要时再定义。
- 迁移并精简适用于 Cosmos 的 Agent、Task、worktree 和验证约定。
- 将 neuro-book 的通用协作流程去领域化迁移到 Cosmos：补充双语贡献指南、Issue 分流、标签清单、PR 模板和安全报告入口；未复制依赖 neuro-book 运行时代码、发布脚本或产品专用 CI 的 workflow。
- 确认 Cosmos 按 GNU Affero General Public License v3.0 only（AGPL-3.0-only）发布，并复制许可证全文到根目录 `LICENSE`。
- 补足协作主路径、远端同步、Windows worktree 清理、RSS/RSSHub 首条切片和公开贡献权利说明；GitHub Actions 仍按本阶段决定保持不变。

## 当前架构基线

以下是 v0.21 的 Phase 0/Phase 1B/1C 基线；后续需求仍可通过记录理由调整：

- 服务器部署优先的模块化单体；逻辑上分 Web、API、Worker 和一次性 Migrator。
  当前 Web 可以独立部署，API/Worker 仍共享 SQLite/Data Root，只支持同机或共享卷。
- Web 使用 React + Next.js App Router；API 使用 NestJS；UI 初步使用 Tailwind、shadcn/ui、React Hook Form 和 Zod。
- Bun 用于开发，Node 用于生产；共享包和 Worker 运行路径保持 Node-compatible。
- Prisma + SQLite 保存核心元数据、关系、任务与用户状态；FTS5/BM25、虚拟表和
  触发器通过受控 SQL Adapter 使用。WAL/busy timeout 是 Local Durable 目标，
  当前尚未在代码/migration 中显式验证。
- `nb-workflow` 目标拥有规范脚本/Activity replay 语义；Cosmos Workflow Host
  拥有持久 Backend、TaskStore、Job/Attempt/Lease、Outbox、Worker 和领域事务。
  当前 Spike 仍是独立 Runtime，收敛由 Task 06 实施。
- TaskStore 是 SQL 中的任务权威；本地默认自适应 polling，不要求 Redis。
  WakeupBus/Redis 只做可选通知，真正多主机目标是 PostgreSQL + S3/MinIO +
  可选 Redis。
- API 目标只加载 manifest/schema/capability，Worker 独占 executable；当前 API
  仍加载部分 Connector/Action，实现尚未收口。
- 对外合同拆成 Product Service、Worker Admin 和 Worker Gateway。远程 Worker
  使用 HTTPS long-poll；Attempt owner 由 Session/owner epoch/lease token/expiry
  的持久 tuple 决定，resume 必须 TaskStore CAS 转移并轮换 token。真实 Gateway
  尚未实现。
- 服务器、客户端、客户端与服务分离三种模式共用版本化 Service Endpoint、Command、Query、Event 和 SSE Transport；客户端不直接访问 Prisma、SQLite 或 Data Root。
- 内容寻址 Blob Store 保存原始 payload、图片和附件；Artifact Root 保存版本化生成产物，Cache Root 可重建。
- 运行日志不写入 SQLite；API、Worker、Web 分别写入 `api.jsonl`、`worker.jsonl`、`web.jsonl`，默认使用 `<Data Root>/logs`，也可由 `COSMOS_LOG_ROOT` 指定，stdout + 文件双写，7 天保留和 256 MiB 总量上限。
- 原始 Observation 不可变，外部 URL 可选；派生分析和索引可重建并保留 provenance。
- Entry 是稳定信息条目；每个 Entry 默认拥有一个主 Story，Story 使用稳定 kind 和受管理 subtype 注册表；Topic 只组织 Story。
- Workspace 保存长期体验、维护策略和交互状态；Artifact 保存不可变的版本化输出。
- Topic、Workspace、Spotlight 和 Feed 等上层体验以 Story 为内容单位，不直接使用 Entry。
- Story 聚类与相关推荐使用不同判定；第一版推荐以显式关注、BM25、Entity/关系、时间、引用、新颖性和本地反馈为主，不使用 embedding。
- Agent 自动创建 Topic 需要两个不同 Story 或明确跟踪规则；Topic 不自动过期。
- 人类、Agent 和系统均作为协作者，每次修改记录 actor、revision、理由和关联 Run。
- 第一版预算只限制全局日额度、单次 Run 的时间/token/工具调用和紧急保留预算，超预算时降级。
- TopicMaintenanceBinding、BoardPlacement、SpotlightPlacement 和 Subscription 相互独立；自动 Spotlight 使用可续期 TTL。
- Entry 可通过 evidence_for/mentions 关联多个其它 Story；Story/Topic merge 保留 canonical ID 与 alias。
- Story split 保留旧历史壳和 `replaced_by[]`；Topic v1 不使用父子层级，Topic membership 只有一个当前角色并保存 revision history。
- Story 当前表示由不可变 Story Revision 和 `current_revision_id` 维护；历史产物引用精确 Revision。
- Feed 反馈与被排序的 Story/surface 对齐；Agent 对人类确认的 Topic 成员只能提出移除建议。
- Workspace 输入是多对多 binding，可有主要锚点；Workspace Update/Run、生命周期、内容新鲜度、Placement 和 Interaction State 分开。
- Spotlight 自动策略保存分离信号、policy/version、迟滞和 TTL，人工覆盖优先。
- Workspace Update 失败/取消不替换上一成功版本；人类保护字段优先于 Agent 候选 Revision。
- Read State 使用 `last_seen_revision_id`；merge/split 的状态迁移保持 canonical 与历史壳边界。
- v1 和默认产品合同是个人本地优先，不实现多人同步、多租户或复杂权限系统。
- 当前单用户阶段知识管理者和 Agent 按最大产品权限运行，不建设审批 UI 或细粒度权限模型；未来再叠加远端/多人/不可信扩展的权限策略。
- 第一版扩展按本地可信代码处理，但继续使用 SDK/Command/Query/Event；Phase 1 从 RSS/RSSHub + fixture 开始。
- Phase 1B 的 Collector 核心只保存统一 `NormalizedIngestItem`：内容使用 `ContentKind`，作者使用允许空 `platformId` 的 `Publisher`，指标保存为 Entry 当前快照，时间使用证据优先的 `TemporalValue`；Connector 不直接访问 Prisma、SQLite 或 Blob Root。
- Bilibili v1 只支持受管 `hot`/`feed` 场景；AI HOT 只支持固定公开 endpoint 和服务 cursor。
- Ingest 通过固定 Durable Workflow 的 Run/StepRun/Action Job 执行，Probe
  暂时通过旧持久 Job 执行；两者的外部访问都只发生在 Worker，API 不执行
  Connector。
- 看板优先于推送实现；推送边界仍在架构中保留。
- Phase 1 只实现一个 Entry → 一个最小 Story projection；跨来源聚类、Story merge/split、Topic 维护和完整推荐后置。
- Phase 1 直接使用 `pi-ai`；`neuro-agent-harness` 继续独立去领域化演进，稳定后再接入 Cosmos。
- Agent 调用目标通过可选 `wf.agents.invoke` Extension 映射到
  `agent.invoke@1`；Harness 负责 Invocation/Session/Profile/Model，不能持有
  Cosmos Job durable truth。
- Workflow 是主动行为核心；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达转换为脚本语义，不建立第二套 Runtime。
- Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 使用同一 Runtime 的 `kind + tags` 分类。
- Ingest 先保存 Observation/Entry/Revision/Asset；Entry → Story 由可配置 Knowledge Workflow 处理，Research Workflow 通过 Research Request/Trigger 独立运行。
- `nb-memory` 作为 Knowledge Manager 的共享长期记忆/知识库候选；Cosmos 通过 Adapter/Port 接入，不直接依赖其内部文件。
- Knowledge Manager 的 Web Chat、`cosmos cli`、多个分身和 ingest/research 参与属于后续 Phase 3 方向，不是当前 Phase 1 已实现能力。
- 个性化配置由 Agent 记忆、Cosmos 行为观察和未来其它信号生成；平台推荐流可作为候选来源，但平台推荐信号暂不进入独立偏好模型。

## 2026-08-08 本轮架构审查记录

本轮从用户配置和扩展生产者的角度检查了数据库、Adapter、Worker、Pipeline、LLM 和推荐链路，结论如下：

- 当前 Phase 1/1B 是可靠采集和最小离线信息库基础，不是完整的可编排知识平台。
- 当时先区分 `Domain`、`Run`、`Step`、`Job` 和 `DomainEvent`；2026-08-11 又将
  运行词汇细化为 Run、Activity、Job、Attempt 和可选 Step。
- 数据库是事实、状态、历史和用户真相的中心；插件和 Agent 通过版本化合同访问，不直接依赖 Prisma 表。
- 长期扩展需要统一 `ConnectionInstance`、`SecretStore` 和 `ConnectorStateStore`。Adapter 负责认证协议和状态 schema，但不自行决定 Secret 的持久化位置。
- 同一个连接可以拥有多个独立采集计划，例如 Bilibili 动态每 30 分钟、推荐流每 2 小时；每个计划分别拥有 Trigger、Workflow、checkpoint、预算、错误和重试边界。
- Ingest 本身是一种 Workflow；外部来源事实先完成 Observation/Entry/Revision/Asset 入库，不等待 LLM。
- Entry → Story 采用“同步确定性事实入库 + 异步可配置 Knowledge Workflow”。策略可以是批量全量 Agent，也可以是脚本优先后升级 Agent。
- Research 不直接耦合 Ingest；分析信号创建 Research Request，由 Trigger 启动独立 Research Workflow，研究结果重新经过 Observation → Entry。
- 推荐区分外部候选、Admission 和 Cosmos Ranking；代码负责硬约束和 LLM 不可用时的降级，LLM 提供可追溯的异步特征或受限 rerank。
- `nb-memory` 调研已经完成并写入研究文档；Cosmos 与其的 Adapter、共享存储生命周期和 Node 生产兼容性尚未实现或验收。
- 2026-08-10 完成 Task 05：RSS、Bilibili、AI HOT 输出统一内容合同；作者空 ID、listing/video 映射、指标无 Revision 刷新和 TemporalValue 持久化已有 focused 覆盖。
- 个性化配置不再按每个字段设计完整 producer/version/evidence 账本；一般 Story、关系、推荐特征和 Artifact 派生结果仍保留各自 provenance 合同。

本轮不扩大 Phase 1 实现范围。继续增加更多平台 Adapter 前，优先建立 Connection/Secret/State、脚本优先 Workflow API、持久子任务、Knowledge/Research Workflow、Proposal/Provenance 和 `nb-memory` Adapter 的实现 Task。

## 2026-08-11 Workflow Kernel 与队列架构修正

本轮从当前代码、`nb-workflow` 和原始 session 结论重新划定所有权：

- 当前 Cosmos Spike 没有基于 `nb-workflow`，两者是平行脚本实现；继续扩展会让
  fingerprint、Query journal、map/all、等待和恢复语义分叉。
- 新目标是 `nb-workflow` 提供类似 LangChain 的通用脚本 Kernel 和可选 Backend，
  Cosmos Worker 通过 Durable Backend/Host 组装它。
- 当前 Prisma Store、Job/Lease、Outbox、Worker Supervisor、双 fence、
  Source snapshot、checkpoint CAS、固定 Ingest 和生产证据保留，不推倒重写。
- 队列固定为 `TaskStore + WakeupBus`。SQLite/PostgreSQL 中的 Job/lease 是唯一
  真相；Redis Streams 可以唤醒 Worker，但 Worker 仍回 SQL claim。
- 当前 Worker 已有 slot 并发和多进程 lease 基础；Provider/Connection/Source/
  Model 资源限流、公平调度和 CollectionPlan overlap policy 尚未实现。
- Agent 调用属于可选 Extension；Harness 文档稳定前不接入。

已新增 ADR-0002 与 Task 06。此次只同步文档，没有修改两个仓库的运行时代码，
也没有实现 Redis、PostgreSQL、Migrator、远程 Worker 或 Harness Adapter。

## 2026-08-11 API/DTO 草案与五路审查

本轮从原始需求、PRD、信息模型、总体架构和当前实现反推完整公共能力，新增独立
[`docs/api/`](docs/api/README.md)：

- 公共 Header、分页、错误、幂等、ETag、ValueRef、SSE 和兼容规则；
- Product Service 的 Source/Connection/CollectionPlan、Workflow、Library、
  Story/Topic、Knowledge/Research、Feed、Workspace/Artifact、Board、
  Publication/Delivery 和数据运维 API/DTO；
- Worker Admin 的 liveness/readiness/status/capability/metrics/drain；
- Worker Gateway 的 bootstrap Session、long-poll claim、Attempt heartbeat、
  Receipt/Result、Value transfer、Secret reservation、replacement/resume 和
  backpressure；
- 用户、故障、Transport 和 Direct/Gateway conformance 场景。

五个隔离只读代理分别审查产品覆盖、durable runtime、Gateway 分布式协议、
运维安全/生命周期和 DTO/Zod 演进性，5/5 成功。主审后修订为 Draft v0.2：

- 分开实现成熟度与产品 Phase，明确 Phase 1 remainder；
- 补齐 Trigger/Research provenance、CollectionPlan discovery context、
  KnowledgeSignal disposition、协作审计和 Story 状态迁移；
- 补齐推荐解释、Workspace update、Artifact sandbox、Subscription 和数据生命周期；
- Gateway 使用 Attempt owner tuple + resume CAS/token rotation，增加 late evidence、
  persisted slot reservation、claim batch replay、Receipt CAS、deadline 和
  canonical bytes；
- 明确未认证 Product API 只允许本机/受信网络，公网/真实 Gateway/Secret Broker
  仍是独立 release gate。

详细发现、证据和 disposition 见
[`docs/api/0007-review-findings.md`](docs/api/0007-review-findings.md)。本轮没有修改
代码、数据库、migration 或测试；v0.2 不能被报告为已实现 API。

## 2026-08-11 文档收口与实施暂停

本轮将架构、API/DTO、ADR、Task 和项目入口统一为同一实施顺序：

```text
稳定 nb-workflow Kernel / conformance
-> 参考 Task 04 Spike 和 API Draft v0.2
-> 实现 Cosmos 本地 Worker / Durable Host
-> 实现 Worker Admin
-> 最后考虑远程 Worker Gateway
```

Task 04 继续作为历史 Spike、parity 和回滚证据，不再扩展为第二套规范 Kernel。
Task 06 当前暂停，不创建 `nb-workflow` 分支、远端、包或 Cosmos 依赖；具体包
拆分、发布策略、Attempt 物理表和 Gateway 实现留给后续独立任务验证。

本轮只修改 Markdown 并运行文档一致性检查，没有修改代码、Prisma、migration、
依赖、Docker 或测试，也没有 commit、push、PR、合并或远端操作。

## 后置决定

- “分类”是稳定导航分区、自由标签，还是二者的上位概念。
- 同一 Workspace 的并发更新、重复触发合并和取消/接管语义。
- Agent 候选 Revision 的接受/拒绝界面和字段保护最小实现。
- `updated_since_last_seen` 在不同 surface、Story split 和 merge 后的投影规则。
- 显式 state migration command 的批量操作、撤销和用户确认边界。
- 文本、图片、视频、私信和历史修订的默认保留预算。
- BiliBili 更深场景、X、Telegram、公众号、QQ群以及平台条款和长期稳定性。
- 多 Board、公网摘要链接、推送渠道和跨平台发布策略。
- Source、Trigger、Workflow、Action 的产品关系已确认；更细的实现边界、版本合同和持久运行行为统一转入 Workflow Runtime Task。
- Bun 开发与 Node 生产在 Next、Nest、Prisma、Worker 和 Harness Adapter 上的完整兼容矩阵。
- Prisma/SQLite 的 FTS5 migration、触发器、Raw SQL Adapter 和未来存储替换边界。
- 三种宿主模式的认证、Service Endpoint、SSE 恢复、Blob/Artifact 访问和版本协商。
- Desktop Shell 的具体技术、安装/升级/卸载生命周期，以及 `pi-ai` 到 Harness 的迁移门槛。
- SecretStore 第一版后端，以及 Adapter SecretRef/StateStore 的具体公共接口。
- 一个 Connection 下多个 SourceInstance/采集计划的 UI 和持久模型。
- 脚本优先 Workflow API、Context、Action 调用、Child Workflow、Journal、Graph/IR 转换和 kind/tags。
- Knowledge Manager Web Chat、`cosmos cli`、多分身共享记忆和 ingest 参与的具体运行合同；当前不建设审批 UI。
- Research Request、Trigger、Research Workflow、外部渠道访问、结果重新入库和失败恢复语义。
- `nb-memory` Adapter、存储根目录、tick/instant 映射和 Node 生产兼容性。
- Agent 记忆、行为观察和未来信号生成程序可读个性化配置的 schema、更新频率和人工覆盖边界。
- Entry → Story Proposal 的自动接受门槛、用户确认界面和 StoryMembership 迁移。
- Admission、Ranking、Impression、Feedback 和 LLM 异步特征的第一版预算。

## 文档审查结论

### 已验证的 Task 04 Spike 基线

- Source execution snapshot focused：3 个测试文件、32 个测试通过；覆盖
  Source 查询态与执行态合同分离、相同幂等键不重读配置，以及真实 Prisma Run
  排队后修改 Source 配置仍使用首次快照。
- 当前全量 Vitest：39 个测试文件、285 个测试通过；packages/apps typecheck、
  Web lint、Prisma validate/generate 和 production build 已通过。
- 全新隔离 Data Root 已应用当前 4 条 migration，`db:status` 为 up to date。
  从真实 `origin/master` 的 3 条 migration 预置 Source、Checkpoint、Run、Job、
  DomainEvent 和 Observation 后升级到第 4 条，全部数据保留，checkpoint revision
  为 `0`，新增 Workflow 外键为 `null`，`PRAGMA foreign_key_check` 无错误。
- Phase 1 固定 Ingest Workflow 链路可运行：
  fixture/RSS → Workflow Run/Action Job → Observation/Entry/Revision/Asset →
  最小 Story projection → Search/Feed/Story 查询。
- Registry-enabled Node production smoke 已验证 API/Worker、Workflow Worker
  registration、固定 Ingest、Feed/Search/Story、SSE、结构化日志关联和
  registration token 不暴露。
- Next standalone 已在 Windows 上重建目录型内部 symlink；Node 24 可启动
  standalone server。浏览器验收覆盖 Source 创建、Workflow 触发、SSE 自动刷新、
  Feed/Search/Story/Entry/Source/Revision/Observation、URL-free 内容、第二次运行
  幂等和健康状态，控制台无 error/warning。
- 代码和文档都保留了当前单用户最大产品权限、旧 Observation 不覆盖和 Web 不直接访问数据库/文件系统的边界。
- Round 86–97 已验证 Worker evidence 的版本化持久化、catalog admission
  Application port/Prisma bridge、独立 capability projection reducer、最小
  durable Prisma projection store、跨 client lease fencing、registration
  observation、checkedAt registry snapshot、有界 stale candidate query 和
  Maintenance Workflow command builder，以及保留 last-known snapshot 的
  `retiredAt`/tombstone CAS 和最小 Cleanup Workflow/Action Job 执行 seam。
  Round 97 又验证了 registration generation 递增、replacement 后旧 cleanup
  被拒绝，以及 Prisma 单条条件更新对 registration generation/terminal
  observation 的原子保护；availability API/scheduler、独立生产 consumer、
  自动 candidate 消费、真正 delete/purge 和 authority projection 仍未实现。

### 尚未完成

- 通用自定义 Workflow 的插件加载、稳定管理 API、Trigger/Binding 产品配置、
  Graph/IR 编译器和完整生产运维面。Task 04 有独立脚本 Runtime、
  WorkflowContext、Child Workflow 和恢复 Spike，但目标 `nb-workflow` Kernel 与
  Cosmos Host convergence 尚未实现。
- Connection、SecretStore、ConnectorStateStore、多个采集计划和 Adapter manifest/Source Operation。
- KnowledgeSignal、Knowledge Workflow、ResearchRequest、Research Workflow、
  通用 Trigger Consumer、Outbox 外部发布和完整事件消费恢复。
- `neuro-agent-harness`/`nb-memory` Adapter、Knowledge Manager Web/CLI、行为观察到程序配置的转换和推荐系统。

### 阻塞后续扩展的实现缺口

- 当前 discovery provenance 只表达 manual/schedule；关注账号、推荐流、搜索、
  公告监控和 Research 需要未来采集计划提供完整 discovery context。
- Source/Connection/多采集计划/StateStore 尚未真正建模；checkpoint 目前仍按
  Source 保存，不能表达一个 Connection 下多个独立计划。
- Source 删除与历史 Observation 保留、内容寻址 Blob orphan GC、Outbox 外部
  投递和通用 Consumer 恢复仍需单独设计和验收。
- Worker capability evidence 已有最小版本化持久化、catalog-admitted projection
  和带 revision CAS 的 tombstone/retirement；registration replacement 竞态在
  同一 Prisma/SQLite Data Root 内已有 `registrationGeneration` 条件保护，但
  仍缺远程信任根、权威 availability projection、scheduler/consumer 消费以及
  delete/purge policy，因此不能安全地产生权威 `no_capable_worker`。
- URL-free fallback 尚无 `identityStrength`、`identityVersion` 和
  `identityBasis`；没有条目级稳定 locator 时，内容修订可能形成新 Entry。
- 固定 Ingest 会在 Job result、Invocation result、Step output 和后续 Action
  input 中重复保存 page/item；大 Feed/媒体前需要 value/reference 和 journal
  retention。
- Source 列表当前有 `1 + 2N` 的 legacy/Workflow 最近运行查询；Phase 1 小规模
  可运行，扩展更多来源前需要批量 projection。
- 当前 Product API 无认证并可绑定 `0.0.0.0`，Compose 发布 API 端口；只能视为
  本机/受信网络验收入口，不能作为公网模板。CORS 不等于认证。
- fixture Source 当前允许绝对 `fixturePath`；在远程暴露前必须限制到受控 fixture
  root，拒绝绝对路径、遍历和 symlink escape。
- 当前 Source/Job/Asset public projection 尚未证明完全移除 Secret、内部 config、
  arbitrary result、`storageKey` 和绝对路径；Controller 需要白名单 DTO。
- 当前尚无 `/healthz`/`readyz` 分离、Worker Admin、Gateway owner handoff、
  late-evidence、Receipt CAS、claim capacity/replay/backpressure 或真实 bootstrap
  identity。

### 项目级质量审查

当前分支结论是“需修改”：固定 Ingest 链路已经达到可审查状态，历史正确性验证
通过，但还不建议直接合并。相对 `origin/master`/merge-base `45ae918`，当前
worktree 仍包含一个 WIP 提交和大量未暂存、未跟踪变更，跨公共合同、Runtime、
持久化、API、Worker、迁移和部署边界；精确文件数以实时 `git status` 为准。

合并前的首要动作已经从“只在 Cosmos 内拆大文件”修正为“先完成 Task 06
Kernel convergence”：

- `packages/workflow-runtime/src/index.ts` 为新增 7,400 行单文件，包含 272 个
  top-level 声明，同时拥有合同、InMemory Store、Outbox、Definition/Worker
  Registry、capability、RuntimeContext 和 Worker loop。脚本 replay/context
  职责应收敛到 `nb-workflow`，Cosmos 只保留 Host 侧职责；不能先把平行内核拆成
  多个更难删除的文件。
- `packages/storage-prisma/src/workflow-store.ts` 为新增 2,971 行单类 Store，混合
  Run、Job、Action、Signal、child、Event 和 Outbox 持久化。它应作为 Cosmos
  Backend 真相保留，再按 Run/Job、Activity/receipt、Signal/child 和 Event/Outbox
  拆内部 repository，不复制 terminal/fencing 逻辑。
- `packages/storage-prisma/src/index.ts` 从 1,859 行增至 2,426 行；
  `persistIngestItemInternal()` 为 426 行并同时处理 Blob preflight、身份、Revision、
  Asset、Story、FTS、Event/Outbox 和双 lease fencing。它仍是唯一 canonical
  ingest transaction，但需要抽出明确模块边界，不能继续扩张。

已完成的架构拍板：

- `nb-workflow` 是规范 Kernel，Cosmos 是 Durable Host；
- Activity/ActionDefinition/Job/Attempt/Step 的职责；
- TaskStore/WakeupBus 与 Redis 非权威边界；
- API/Worker/Migrator 目标宿主边界；
- Agent Extension 等待 Harness 合同。

Task 06 仍需通过 Spike 决定具体 package/Port 形状、StepRun 迁移和
value/reference retention。URL-free identity strength/version/basis、Source
`1 + 2N`、Blob orphan GC 和 generic command payload 冲突继续作为独立债务。
本次文档决定不改变当前分支“需修改、尚不建议直接合并”的结论。

## 尚未实现

- Docker/Compose 实际容器启动、共享卷和 healthcheck 验收；当前环境没有 Docker CLI。
- 真实 RSS/RSSHub 网络来源验收、跨平台 Node 验收和更长时间的 Worker 重启演练。
- Bilibili 真实 Entry 保存验收；本机 Browser Bridge 已连接（doctor 实测 `Extension: connected v1.0.22`、profile `vmhtnh8p`、Connectivity: connected），真实 hot/feed 采集链路仍待验收。
- 完整的 Source/Trigger/Workflow/Action 产品配置模型；Phase 1 只把固定 Ingest
  Workflow 接入生产，不包含用户自定义 Workflow 编辑/安装/管理。
- `nb-workflow` Core/Runtime/Backend conformance、Cosmos Prisma Host 和固定
  Ingest convergence；当前仍有两套平行脚本实现。
- TaskStore/WakeupBus 正式 Port、自适应 polling、Redis Streams Adapter、
  PostgreSQL/S3 分布式预设和远程 Worker Gateway。
- manifest-only API、executable-only Worker 和独立 Migrator。
- API/DTO Draft v0.2 的 Zod schema、Product/Application/Transport 迁移、Worker
  Admin、Gateway fake conformance、owner handoff、late evidence、Receipt CAS 和
  真实 bootstrap identity。
- SQLite WAL/busy timeout 的显式配置与并发行为验收。
- Connection/Secret/State 统一管理和 Adapter 登录生命周期。
- 可配置多采集计划、通用 Workflow 插件/管理产品面、LLM 子任务和
  Proposal/Provenance。
- 去重、Story 归并、Topic 成员、分类、关系和推荐系统。
- Agent 分析、Artifact、Workspace 和交互状态。
- 看板、推送、摘要图片和网页发布。

## 验证边界

当前收敛分支已完成以下分层检查：

- `git diff --check`：通过。
- `bun install`：通过，生成根 `bun.lock`。
- `bun run db:validate`、`bun run db:generate`：通过，Prisma schema 合法并生成 Prisma Client 6.19.3。
- `bun run typecheck`、`bun run build`、`bun run lint:web`：通过。
- 当前最终全量基线：`bunx vitest run --reporter=dot` 通过，39 个测试文件、
  285 个测试；`bun run typecheck`、`bun run lint:web`、`bun run build`、
  `bun run db:validate` 和 `bun run db:generate` 通过。
- Task 05 基线：13 个测试文件、63 个测试通过；覆盖 Publisher、
  ContentKind、TemporalValue、指标持久化和包含 `sourceLocator` 的 URL-free
  fallback；无条目级稳定 locator 时的修订身份仍待显式建模。
- 当前隔离数据库已应用 4 条 migration，状态 up to date；真实 master 三条
  migration 携带既有数据升级到第 4 条也已通过。
- 启用 Prisma Definition/Worker Registry 的 Node production smoke 通过；固定
  Ingest Run 产出 Feed 3 条、Search 1 条，并验证 Story、SSE、日志 correlation、
  API 400/404、Run/Probe 幂等重放与冲突、超长 key 拒绝和 Worker discovery。
- Node production Connector smoke：通过；AI HOT 真实 GET 返回 200，Worker 真实保存 3 条 Entry；OpenCLI 内置入口返回版本 `1.8.6`。
- Bilibili doctor smoke：已运行；daemon 在端口 `19825`，但 Browser Bridge 为 `Extension: not connected`，真实 hot 采集未执行成功。
- Docker/Compose 仍因当前环境缺少 Docker CLI 未验证。
- Playwright 浏览器验收：通过来源创建、固定 Ingest Workflow、SSE 自动刷新、
  Feed 3 条、搜索 `Cosmos` 1 条、Story → Entry → Source/Revision/Observation、
  URL-free 内容、第二次 Run 幂等和健康检查；控制台 0 error、0 warning。
  Source execution snapshot 收口后没有改动 Web/Transport；最终后端由随后一次
  Registry-enabled Node production smoke 覆盖，本轮未重复浏览器点击。
- `docker` 命令不存在，因此 Docker/Compose 验收保留为未运行。
- API/DTO 文档收口检查：全仓 48 个 Markdown 相对链接错误 0、未闭合围栏 0、
  EOF 缺失 0、尾随空白 0、conflict marker 0；PRD 164 个定义型需求 ID 无重复；
  原始需求只新增 22 行、删除 0 行；8 份 API 文档的 37 个 TypeScript 围栏合并后
  strict/noEmit syntax + semantic 检查为 0 diagnostics；staged files 0。
- API/DTO v0.2 本轮只运行文档与内嵌类型检查，没有重跑代码 typecheck/test/build、
  Node、browser、Docker、真实来源、恢复或 Gateway 多主机。
- 未运行：Docker/Compose、真实 RSS/RSSHub、Bilibili Browser Bridge 成功采集、跨平台 Node 和长时间故障恢复验收。

2026-08-11 文档收口只运行 Markdown 一致性、需求编号、append-only 和 dirty
文件边界检查；没有重新运行 typecheck、Vitest、build、Node、浏览器、Docker、
真实来源或 Agent。上面的代码/产品证据来自 Round 104–105 的既有 Spike 基线，
不是本轮新架构已经实现或重新验收的证据。

本轮文档验证结果：49 个 Markdown 的相对链接、围栏、EOF、尾随空白和冲突标记
错误均为 0；PRD 164 个定义型需求 ID 无重复；原始需求相对 `HEAD` 为
`+28/-0`；`git diff --check` 通过。编辑前后 77 个非文档 dirty 项的综合
SHA-256 均为
`7aa14ea29ec056cd6f8b81f991a57cbabac2803dbdba825d81b64aa90e0c6826`，
本轮未改变代码、migration、依赖、Docker 或既有删除状态。

此前 Phase 0 的远端仓库、许可证、研究文件 SHA-256 和 GitHub 配置检查结果仍保留在历史 Task 记录中；本次没有执行远端同步、commit、push 或发布。
