---
parent: docs/spec/storage/0001-prisma-repository.md
range: 概念与定义、存储根与连接、Source/legacy Run/Step/Job、Observation/Entry/Revision/Asset/Story
sealed_at: 2026-10-26
tags: [spec, storage, domain-model]
tokens_est: 2839
---

## 概念与定义

- **Source（来源实例）**：`SourceInstance` 行，保存名称、Connector kind、JSON 配置和启用状态；公共 Source snapshot/config 的唯一 DTO 定义由 contracts owner 持有。
- **Checkpoint（来源游标）**：每个 Source 至多一行的 cursor 记录。`revision`、`workflowRunId` 是 Workflow ingest 路径增加的 CAS/provenance 字段；旧 `setCheckpoint` 不使用 CAS。
- **Legacy Run、Step、Job**：旧采集 lane 的 durable 账本。Run 属于 Source，Step 按 `(runId, position)` 唯一，Job 可关联 Run/Step，也可独立作为 probe；`kind = workflow-activity` 的 Job 不应被本仓储的 legacy worker claim。
- **Observation（观察）**：一次来源捕获的不可变证据，带来源定位、内容、external key、raw payload Blob key 和 provenance；其领域字段/身份规则由 domain owner 定义。
- **Entry、Entry Revision**：Entry 是由 Source 与稳定 canonical external key 归并的本地内容身份；修订按 `(entryId, revision)` 追加，Entry 的 `currentRevisionId` 指向当前修订。
- **Asset、Story**：Asset 从属于 EntryRevision，保存媒体元数据和可选 Blob key；Story 是稳定、可编排的规范内容单元（ADR-0006），一个 Story 承载多个 Entry 的主归属，StoryRevision 按 `(storyId, revision)` 版本化并保存展示字段 fingerprint（title/summary/kind/subtype）与可选 actor/理由，由 current revision 指针选中；`producer` 记录写入者身份（`human`/`system`/`agent`，服务端按写入方赋值，调用方不可传），`producer = "human"` 的当前 Revision 对自动写入方冻结（ADR-0028）。`StoryAlias` 把已 merge（obsolete）的 Story id 指向 canonical Story id；obsolete Story 及其历史 Revision 保留。
- **Domain Event**：`DomainEvent` 是 append-only 事件账本；SQLite 自增 `sequence` 是 replay 游标，`eventId` 唯一，payload 以 JSON 字符串保存。Workflow event 的 idempotency/lease 细节由 EventSink spec 拥有。
- **FTS、Feed、Search、SSE replay**：仓储在初始化时创建 `entry_search` FTS5 表；Feed/Search 从当前 Entry/Revision/Story 关系读取，SSE 只消费按 DomainEvent sequence 查询出的事件，连接、keepalive 和 snapshot_required 由接口组件负责。

## 外部行为

### 存储根和连接

`resolveStorageRoots(dataRoot = COSMOS_DATA_ROOT 或 `.cosmos`, workspaceRoot = COSMOS_WORKSPACE_ROOT 或 `process.cwd()`)` 将相对 data root 锚定到 workspace，并派生 `cosmos.sqlite`、`blobs`、`artifacts`、`cache`、`logs`、`secrets`。`createPrismaClient` 使用 `DATABASE_URL` 覆盖派生的 SQLite URL，否则使用该 database path。`initialize()` 连接 Prisma 并执行：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS entry_search USING fts5(
    entry_id UNINDEXED, title, content_text, tokenize = 'unicode61'
)
```

初始化或 `$connect` 失败会抛出原异常；`close()` 断开 Prisma，失败也向上抛出。

### Source、legacy Run/Step/Job

- `createSource` 将 config JSON 化后创建 Source，`enabled` 缺省为 `true`；`listSources` 按 `createdAt ASC` 且**排除墓碑**（`deletedAt` 非空）；`getSource` 对缺失或墓碑返回 `null`；`setSourceEnabled` 只更新 enabled。
- **删除来源是墓碑（AUT-001）**：`deleteSource` 在同一事务里把 `deletedAt` 置为当前时间、`enabled` 置 false、revision 加一，删除该来源的 `TriggerBinding`，并写 `source.deleted.v1` 事件（含 actor/reason）。**不删除** Entry/Observation/EntryRevision/Asset——`Entry.sourceInstanceId` 是必填级联外键，硬删会连带删掉全部历史。命令幂等：已删除的来源再次调用直接返回墓碑快照，不重复写事件；过期 `baseRevisionId` 抛 revision 冲突；墓碑来源对 `updateSource`/`activateSource` 等同不存在；`listScheduleTriggers` 也跳过墓碑来源。
- Source snapshot 会解析 `kind/config`，并额外查询最新 Run：`lastRunAt` 优先取 `finishedAt`，否则取该 Run 的 `createdAt`；`lastError` 取最新 Run 的 `errorMessage`。
- `createRun` 在同一事务内创建 `running` Run、position 0 的 `running` Step 和 `leased` 的 `source-ingest` Job；Job owner 为 `synchronous-ingest`、attempts 为 1、lease 为当前时间后五分钟，并写 `run.queued.v1`。
- `createQueuedRun` 在同一事务内创建 `queued` Run、`queued` Step 和 `queued` 的 `source-ingest` Job，并写 `run.queued.v1`。有 idempotency key 时，若同 key 已存在且关联 Run，则直接返回原 Run；新 Job 的 payload 至少包含 `sourceId`。
- `createProbeJob` 按 idempotency key 查已有 Job，否则创建独立的 `source-probe`/`queued` Job 并写 `job.queued.v1`。Probe 的成功结果只写 Job，不持久化 Entry 或 Checkpoint。
- `claimNextJob` 只在调用者提供的 `acceptedKinds` 集合内选择，候选为到期可执行的 `queued`/`retry_wait` 或 lease 已过期的 `leased`，按 `createdAt ASC` 取一条。更新谓词包含候选原 status；对已 leased 候选还包含旧 lease owner/token/expiry。成功后 attempts 加一、生成新的随机 lease token、保存 owner/expiry、清空 nextAttemptAt。
- `renewJobLease` 只按 Job id、token、status=`leased` 更新 expiry，并以受影响行数是否为 1 返回 boolean。`completeJob` 只接受当前 token/status，并在事务中写状态、result/error、清空 lease；`retry_wait` 的 nextAttemptAt 默认是当前时间后 30 秒，也可使用调用方给的 retryDelayMs。
- Legacy Job 的实现状态值为 `queued`、`leased`、`retry_wait`、`succeeded`、`failed_terminal`、`cancelled`；claim 发现 attempts 已达到 maxAttempts 时，会在事务内把 Job 置为 `failed_terminal`、清租约、若有关联 Run 则将 Run 置为 `failed` 并写 `job.failed_terminal.v1`，然后返回 `null`。
- `startRun`、`completeRun`、`resetRunForRetry` 在事务内同步更新 Run 和关联 Step 并写事件。传入 legacy `JobLease` 时，先用 Job id、Run id、token、status=`leased` 校验；stale token 会拒绝写入。`completeRun` 无 lease 时还会把该 Run 的 Job 清除租约并映射为 succeeded/cancelled/failed_terminal；带 lease 时不主动清除其它 Job。

### Observation、Entry、Revision、Asset、Story

`persistIngestItem` 和 `persistWorkflowIngestItem` 先使用 domain 规则计算 external key、Entry revision fingerprint、时间/Publisher/Metrics JSON；raw payload 先在数据库事务外写入 Blob Store，状态为 `saved` 且带内容的 Asset 也在事务外写入 Blob。随后一个 Prisma transaction 完成领域写入：

1. Workflow 路径先校验 Run lease、Activity Job lease、attempt 和 kernel revision fence；`ingestCommandId` 已存在时返回已有 `ingestResultJson`，不重复领域写入。legacy Run 内若已有同 `(sourceInstanceId, runId, externalKey)` Observation，也返回 duplicate。
2. 创建 Observation，记录 source/run/workflow provenance、`ingestCommandId`、external id/key/revision、eventKind、source locator/discovery JSON、正文、标题、URL、内容 fingerprint、content kind、Publisher/Metrics/Temporal JSON、exact sourcePublishedAt 和 raw payload Blob key。discovery JSON 至少含触发类型（`kind`，`manual`/`schedule`/`webhook`，缺省 `manual`）与发现渠道（`channel`，ING-004，取连接器声明的受管值；未声明时写 `unknown`）。
3. 找不到 Entry 时创建 Entry。若已有 current revision 的 fingerprint 相同，不追加 EntryRevision，只允许刷新 metrics 和发生变化的 published/updated 时间，并将此次 Observation/Run 结果标为 duplicate；fingerprint 改变时按 current revision 加一追加 EntryRevision。
4. 新修订会 upsert Story（id 沿用既有 `Entry.storyId`，否则用 `story:<entryId>` projection），更新 kind；StoryRevision 以当前 revision 加 1 追加并携带展示字段 fingerprint。**若 Story 的当前 Revision 由人工写入（`producer = "human"`），投影整条跳过**：不改 `Story.kind`、不追加 Revision，且只在本该写入时写 `story.representation_projection_skipped.v1`（ADR-0028）。**若 title/summary/kind/subtype 无实质变化则不追加 StoryRevision**（no-op，ADR-0006 决策 3；扩展两项为空时指纹与升级前相同，该路径不写这两列，ADR-0021 决定 4）；投影写出的 Revision 记 `producer = "system"`；随后更新 Entry/Story current revision、写 Asset 行并重建该 Entry 的 FTS5 行。
5. 写 `entry.created.v1` 或 `entry.revised.v1`，并写 `feed.updated.v1`。legacy Run 递增 item/created/revised/duplicate 计数；Workflow 路径不使用 legacy Run 计数。返回 `createdEntry`、`revisedEntry`、`duplicateObservation` 三个 boolean。

Raw payload/Asset Blob 写入发生在数据库事务前；数据库事务失败时没有跨系统补偿删除这些已写入 Blob 的实现。FileBlobStore 对同一内容 key 使用不覆盖写入，但本仓储不会为已存在的 Blob 再次做完整性验证。
