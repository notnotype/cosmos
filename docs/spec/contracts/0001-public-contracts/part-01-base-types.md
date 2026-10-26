---
parent: docs/spec/contracts/0001-public-contracts.md
range: 概念与定义、协议和内容基础类型、Source 与采集命令、状态和查询 DTO
sealed_at: 2026-10-26
tags: [spec, contracts, base-types]
tokens_est: 4393
---

## 概念与定义

### 协议和内容基础类型

- **协议版本**：`protocolVersion` 固定为 `"v1"`。
- **ContentKind**：wire enum 为 `post`、`article`、`video`、`audio`、`image`、`comment`、`listing`。本包只负责枚举解析；值的领域含义和 Story 映射由[规范化内容](../../domain/0001-normalized-content.md)负责。
- **PublisherKind**：wire enum 为 `user`、`channel`、`subreddit`、`official-account`、`org`、`unknown`。它是 Publisher 的传输字段，不由本包生成身份或执行领域归一化。
- **Publisher**：`platformId`、`name`、`handle`、`profileUrl`、`kind`、`metrics`。`platformId`、`handle`、`profileUrl` 接受可空字符串，字符串先 trim，空白转为 `null`；`name` trim 后至少一个字符。缺少平台 ID 不会由本合同生成新的身份。
- **PublisherMetrics**：`followers`、`following`、`statuses`、`voteup` 是可选、可空且必须为有限数值；`reliable` 可为 `high`、`low`、`unknown`。这是 wire shape，不包含 domain 的来源清洗策略。
- **TemporalPrecision**：`second`、`minute`、`hour`、`day`、`week`、`month`、`year`、`unknown`。
- **TemporalFallback**：保留原始 `raw`、带 offset 的 `lowerBound`、`precision`、可空 `timezone` 和 `confidence`（`high`、`inferred`、`uncertain`）。
- **TemporalValue**：`exact` 是带 offset 的 datetime 或 `null`；`exactPrecision` 只能是 `second` 或 `null`；`fallback` 是 `TemporalFallback` 或 `null`。至少必须有 `exact` 或 `fallback` 之一。exact/fallback 的推导和投影算法由 domain 负责。
- **ContentMetrics**：`values` 中的 `likes`、`views`、`reposts`、`comments`、`collects`、`score` 是可选、可空有限数值；`raw` 是 `Record<string, string>`；另有 `reliability`（`high`/`low`/`unknown`）和带 offset 的 `capturedAt`。本包只校验该 wire shape，不负责 Connector 的数值转换。

### Source 与采集命令

- **sourceDefinitionRef**（trim 后的版本化 ref，如 `source.rss@1`）是 SourceInstance 的唯一业务身份；**operationId** 必须出现在该定义 manifest 的 operationIds 中。旧 **SourceKind** 只作为迁移期运行时投影保留，新 Product API 命令不接受 `kind`。
- **SourceConfig** 的通用字段是可选 `feedUrl`、`fixturePath`、`media`（来源级媒体策略）与 `scheduleIntervalMs`（coerce 整数，范围 1,000 至 31 天毫秒）；该 passthrough schema 仅作历史投影。
- **SourceMediaPolicy**（ADR-0014/0015）是来源级媒体策略：可选 `images`（`download`/`metadata_only`，缺省 `download`）、可选 `maxFileBytes`（64KiB–10MB）与 `maxRunBytes`（1MiB–50MB）。上界即全局默认，来源只能收紧；`mediaPolicyCeilings` 是同一组数字的单一来源，媒体获取组件的运行时默认值取自它。另有两个可选字段：`retry.maxAttempts`（0–10，缺省 3，含首次尝试，0 = 关闭重试）与 `retentionDays`（0–3650，缺省或 0 = 永久保留）。
- 各 Source definition 的 canonical 配置校验由 `getSourceConfigurationSchema(ref, operationId?)` 返回的 strict Zod schema 负责：RSS 要求 http(s) 的 `feedUrl` 并接受可选 `media`；fixture RSS 仅接受调度字段；Bilibili 的 `fetch` 要求 `mode`（`profile` 已不在来源配置里——它归连接，见下）；AI HOT 接受调度字段。带 `operationId` 时先查该 operation 的覆盖 schema（`sourceOperationConfigurationSchemas`，目前只有 Bilibili 的 `search`：要求 `query`、可选 `limit`），未登记就回退定义级那份——所以 `bilibili.fetch` 与 `source.rss@1` 的校验结果不变。manifest 的 JSON Schema 只是发布投影（`source.rss@1` 的描述里同步声明了 `media`）。
- **revisionId** 形如 `<sourceId>:<revision>`；创建默认停用并从 revision 1 开始。**SourceActivationCommand** 为 `{ enabled, baseRevisionId }`，配合唯一 `Idempotency-Key` 使用：同 key 同请求重放返回首次记录的结果快照，同 key 不同请求或过期 baseRevision 返回冲突，无状态变化的 no-op 记录命令但不递增 revision。
- **CreateSourceCommand**：strict 的 `name`（trim 后 1–200 字符）、`sourceDefinitionRef`、`operationId` 和 `config`，不接受 `enabled`。**UpdateSourceCommand**：必填 `baseRevisionId` 加可选 `name` 与完整替换的 `config`。
- **SourceExecutionSnapshot** 冻结 `id`、`name`、`sourceDefinitionRef`、`operationId`、`connectorId`、迁移投影 `kind`、`config`、`enabled`、`revisionId`、`createdAt`、`updatedAt`，以及可选可空的 `connection`。`connection` 是连接的**非秘密投影**（`{id, connectorId, configJson}`）：入队时冻结，因此排队后修改连接配置不改变已创建 Run 的输入（AUT-016）；它只带身份与非秘密配置，`status`/`lastError` 这类活诊断不进。未保存配置的探测与 legacy 路径没有连接，故该字段可选。**SourceSnapshot** 在同一字段上增加可变诊断 `lastRunAt`、`lastError`、可选 `connectionId`（ADR-0017）与可选 `scheduleIntervalMs`（ADR-0018，来自 TriggerBinding）。
- **TriggerBinding（ADR-0018）**：`id`、`sourceId`、`kind`（`schedule`/`manual`/`webhook`，ADR-0024 加入 webhook）、`config`（`{ intervalMs? }`）、`enabled`、`revisionId`、`createdAt`/`updatedAt`。一个计划每种类型最多一行，schedule 与 webhook 可共存（ADR-0025）；入口标识与凭证引用不在这个投影里，产品面从计划快照的 `webhook` 块读（ADR-0024）。`CreateSourceCommand`/`UpdateSourceCommand` 用顶层可选 `scheduleIntervalMs`（update 可 null 移除）。`SourceDefinitionManifest` 新增 `auth`（`none|oauth|cookie|secret_ref|external` + `secretRefRequired` + `probeSupported`：第三个布尔声明这个 Adapter 能不能对连接的登录态给出结论，宿主据此决定要不要允许发起连接探测，不硬编码 connectorId，ADR [`0027`](../../../adr/0027-connection-login-lifecycle-v1.md)）与 `operations`（operationId、input/output schema、可空 `configurationSchema`（这个 operation 的用户可填配置；`null` = 沿用定义级那份，ADR 0027 决定 3）、external key、discovery context、media、stateStore 命名空间）。
- **SourceProbeResult**：`sourceId`、`connectorId`、非负整数 `itemCount`、`nextCursorAvailable` 和 `checkedAt`。
- **IngestCommand**：非空 `sourceId`、`triggerKind`（`manual`/`schedule`/`webhook`，默认 `manual`）和可选幂等键；幂等键 trim 后 1 至 300 个字符。**TriggerEvidence**（ADR-0024）：`bindingId`、`externalEventId`、`receivedAt` 三个非空字符串，strict；`triggerKind = "webhook"` 的 Run 必须带它，`manual`/`schedule` 不带。

### 状态和查询 DTO

- **RunStatus**：`queued`、`running`、`succeeded`、`failed`、`cancelled`。
- **StepStatus**：`queued`、`running`、`succeeded`、`failed`、`cancelled`。
- **JobStatus**：`queued`、`leased`、`retry_wait`、`succeeded`、`failed_terminal`、`cancelled`。
- **JobKind**：`source-ingest`、`source-probe`、`workflow-activity`。
- **AssetStatus**：`saved`、`metadata_only`、`skipped`、`failed`。
- **JobSnapshot**：`id`、`kind`、可空 `sourceId`/`runId`、`status`、非负整数 `attempts`、正整数 `maxAttempts`、可空 `errorCode`/`error`、`createdAt`、`updatedAt` 和可空的 `result: unknown`。
- **AssetSnapshot**：`id`、`kind`、`status`、可空 `sourceUrl`、可空 `storageKey`、可空 `mimeType` 、可空数值 `byteSize`、可选可空 `errorMessage`（有界 500 字符，降级原因说明；saved 可为空，见 ADR-0005）、可选可空 `errorCode`（机器可读降级原因，读取侧放宽，见 ADR-0015）与可选非负整数 `attemptCount`（已完成的下载尝试次数，含首次）。这是 contracts 的共享/内部资产元数据投影，不是领域层带 `Uint8Array` 的 Asset input。`PrismaCosmosRepository.toAssetSnapshot` 会填充 `storageKey`；公开读 DTO 不使用这一份，而是 `publicAssetSnapshotSchema`（由本 schema 省略 `storageKey`），并由 Product API 的 feed、search、entries、story、entry、revision 路由在返回前经 `toPublicAsset` 逐个挑字段，因此这六条路由的 HTTP JSON 不含 `storageKey`。`GET /assets/:assetId` 另行读取 bytes。
- **MediaCleanupCommand**（ADR-0015）：strict 的可选 `sourceId` 与可选布尔 `dryRun`（缺省 true）。**MediaCleanupReport**：`dryRun`、可空 `sourceId`、`candidateCount`、`candidateBytes`、`cleanedCount`、`cleanedBytes`、`sharedKeyCount`、最多 20 条 `samples`（assetId/sourceId/sourceName/title/byteSize/createdAt/expiredAt）与 `startedAt`/`finishedAt`。**MediaCleanupRunSnapshot**：`runId`、`status`、可空 `report` 与可空 `error`。
- **RunSnapshot**：`id`、可空 `sourceId`、`triggerKind`、可选可空 `triggerEvidence`（触发原因，ADR-0024；manual/schedule 的 Run 由投影写 `null`）、`status`、`createdAt`、可空 `startedAt`/`finishedAt`、`itemCount`、`createdEntryCount`、`revisedEntryCount` 和可空 `error`。
- **Run 控制（ADR-0016）**：`CancelRunCommand`/`RecoverRunCommand` 为 strict 的可选 `reason`（trim ≤500）；`RerunRunCommand` 为 strict 空对象。**RunControlResult**：`action`（`cancelled`/`recovered`/`rerun`）、复用 `RunSnapshot` 的 `run`、面向用户的 `reuse` 与 `sideEffects` 字符串。公共 `RunStatus` 五态不变。
- **Connection（ADR-0017）**：`ConnectionInstance` 快照含 `id`/`name`/`connectorId`/可空 `account`/可空 `scopeJson`/可空 `configJson`（适配器的**非秘密**配置，JSON 文本；Bilibili 的 OpenCLI profile 住在这里，凭证永远不在这里）/`status`（`active|revoked|expired|error`）/可空 `secretRef`/可空 `lastError`/可空 `lastCheckedAt`（最近一次登录探测的时间，由探测回写、**不走公开更新命令**）/`createdAt`/`updatedAt`。`CreateConnectionCommand` 要求非空 `name`+`connectorId`，其余可选（含 `configJson`）；`UpdateConnectionCommand` 全可选（`name`/`status`/`configJson`/`secretRef`/`lastError`）。`SourceSnapshot` 增加可选可空 `connectionId`（无认证来源 null），`UpdateSourceCommand` 增加可选可空 `connectionId`。**SourceConfigProbeCommand** 增加可选可空 `connectionId`：未保存配置的探测没有来源与计划，需要登录态的操作靠它拿到连接。
- **连接登录探测（ADR-0027 决定 2）**：**ConnectionProbeResult**：`connectionId`、`outcome`（`active|expired|error`，`expired` = 需要用户重新登录，`error` = 这次没得出结论）、可空 `account`（探测到的账号标签）、可空 `reason`（面向用户的原因）与 `checkedAt`。**ConnectionProbeJobPayload**：只带 `connectionId`（strict）。**ConnectionProbeJobSnapshot** 是 `JobSnapshot` 的 `kind: "connection-probe"` 特化 + 可空 `result`；`JobKind` 相应新增 `connection-probe`。探测**不产生 Run、不产生条目**：它是连接的事实，不是采集。
- **StorageStats（ADR-0019）**：`databaseBytes`/`blobBytes`/`blobFileCount`/`artifactBytes`/`cacheBytes`/`logBytes`/`secretBytes` 加 `categories`（`raw`/`user`/`rebuildable`/`cleanable`，非负整数）与 `snapshotAt`。**BackupSnapshot**：`id`/`name`/`byteSize`/`createdAt`。
- **UserDataExport（ADR-0019 决策 5）**：strict 的 `schemaVersion`（当前固定 `1`）、`exportedAt`、`counts`（八个非负整数：`labels`/`collections`/`favorites`/`annotations`/`savedViews`/`boards`/`spotlightPlacements`/`targets`）与 `data`。`data` 的八个分区分别是 `labelDetailSchema[]`、`collectionDetailSchema[]`、`favoriteItemSchema[]`、`annotationSchema[]`、`savedViewSchema[]`、`boardDetailSchema[]`、`spotlightPlacementSchema[]` 与 `userDataExportTargetSchema[]`——导出直接复用各对象的公开读投影，不新造第二套对象定义。**UserDataExportTarget**：`targetType`（读取侧宽松字符串）、`targetId`、可空 `title`、可空 `webUrl`；目标已被删除时 `title` 为 null 而引用仍保留，导出不因悬空引用失败。`schemaVersion` 是唯一版本位，新增分区或改变字段含义时升版本。
- **连接器状态导出／导入（ADR-0026）**：**ConnectorStateNamespaceSummary** 是清单项——`namespace`、`keyCount`、可空 `planId`／`sourceId`／`connectionId` 与 `unattributed`（未归属时三个归属字段都是 null）。**ConnectorStateExport** 是 strict 导出信封——`schemaVersion`（当前固定 `1`）、`exportedAt`、`scope`（`kind` ∈ `namespace|plan|connection|source|attributed` + 可空 `value`）、`counts`（`namespaces`/`keys`）与 `namespaces[]`；每个抽屉是 `namespace` + 可空 `owner`（`planId`/`sourceId`/可空 `connectionId`，未归属为 null）+ `entries[]`（`key`、`value`、正整数 `version`、`updatedAt`）。**ConnectorStateImportCommand**：`mode`（`skip-existing` 默认／`overwrite`）、可选 `targetNamespace`、`export`（整份导出信封，导入边界因此只有一个被校验的输入）。**ConnectorStateImportResult**：`mode`、`namespaces`、`created`、`overwritten`、`skipped`。**ConnectorStateExportQuery**：`namespace`／`planId`／`connectionId`／`sourceId` 四选一（最多给一个，否则校验失败）。导出件不含 Secret、连接配置、`Checkpoint` 或其它表字段。
- **HealthResponse**：`status` 固定为 `ok`；包含 `service`、`version`、`protocolVersion`、`timestamp`，以及 `workerStatus`（`unknown`/`starting`/`ready`/`stopped`）、`storageStatus`（`unknown`/`starting`/`ready`/`failed`）和 `migrationStatus`（`unknown`/`pending`/`ready`/`failed`）。
- **ServiceError**：`code` 为 `validation_failed`、`not_found`、`conflict`、`service_unavailable`、`protocol_mismatch` 或 `uncertain`；并有 `message`、可选 `requestId`/`commandId`、可选 `details: Record<string, unknown>` 和 `retryable`。
- **SearchQuery**：可选 trim 后最多 500 个字符的 `text`、`sourceId`、带 offset 的 `publishedAfter`/`publishedBefore`、`cursor`；`limit` coerce 为 1 至 100 的整数，默认 `20`。`EntryListQuery` 的 `sourceId`/`cursor` 可选，`limit` coerce 为 1 至 100 的整数，默认 `50`。
