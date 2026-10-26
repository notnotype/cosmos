---
parent: docs/spec/interfaces/0002-product-api-http.md
range: Source 资源、Run、Job、Attempt
sealed_at: 2026-10-26
tags: [spec, api-http, sources]
tokens_est: 4943
---

### Source 资源

| Method/path | 输入 | 成功输出、状态和副作用 |
| --- | --- | --- |
| `GET /sources` | 无 | `SourceSnapshot[]`；按 repository 顺序读取，不写入。 |
| `GET /sources/:sourceId` | path `sourceId` | 单个 `SourceSnapshot`；不存在 404。 |
| `POST /sources` | JSON body `CreateSourceCommand`（strict，无 `enabled`） | HTTP 201，创建默认停用的 Source（`revisionId` 从 `<id>:1` 起）并返回投影。先按 Zod 合同解析，再确认 ref 对应 enabled manifest 与 operationId，最后按 canonical 配置 schema 校验 `config` 后写库。 |
| `PATCH /sources/:sourceId` | JSON body `UpdateSourceCommand`：必填 `baseRevisionId`，可选 `name` 与完整替换的 `config` | HTTP 200，CAS 更新后返回投影；不存在 404；body 不合法或配置校验失败 400；revision 过期 409。`config` 存在时先经 canonical schema 校验。 |
| `POST /sources/:sourceId/activation-commands` | 必需非空且 ≤300 字符的 `Idempotency-Key` header；body `SourceActivationCommand` | HTTP 201 返回更新后投影。启用前按 canonical schema 校验已保存配置；同 key 同请求重放返回首次记录的结果快照；同 key 不同请求或过期 `baseRevisionId` 409；no-op 不递增 revision。 |
| `POST /sources/:sourceId/removals` | 必需非空且 ≤300 字符的 `Idempotency-Key` header；body `DeleteSourceCommand`：必填 `baseRevisionId`，可选 `actor`/`reason` | HTTP 200 返回删除后的投影（**墓碑**语义，AUT-001）：来源从列表/读取/调度中消失，已录入的 Entry/Observation/Revision 与媒体全部保留；删除移除调度绑定并写 `source.deleted.v1` 审计事件。命令天然幂等——重复调用返回同一份结果、不重复写事件；过期 `baseRevisionId` 409；来源不存在 404。 |
| `POST /sources/:sourceId/test` | 可选 `Idempotency-Key` header（≤300 字符） | 不变：HTTP 202 返回 `JobSnapshot`，创建 `source-probe` Job；未提供 key 时生成随机 probe key；Source 不存在 404。 |
| `POST /sources/:sourceId/runs` | 可选 `Idempotency-Key` header（≤300 字符） | HTTP 201 返回 Product Run；仅接受已启用 Source，未启用 409 `conflict`；Source 不存在 404；无 header 时生成随机 key。优先 Workflow Control 入队 `cosmos.ingest@1`，否则走 legacy queued Run。 |
| `POST /media-cleanups` | 可选 `Idempotency-Key` header（≤300 字符）；body `MediaCleanupCommand`（可选 `sourceId`、可选 `dryRun`，缺省 `dryRun: true`） | HTTP 201 返回 `MediaCleanupRunSnapshot`；入队 `cosmos.media-cleanup@1`。durable host 未启用时 409 `conflict`；未知字段或非法 body 400 `validation_failed`；同 key 不同 `{sourceId, dryRun}` 409 `conflict`。无 header 时生成随机 key。 |
| `GET /media-cleanups/:runId` | path `runId` | HTTP 200 返回 `MediaCleanupRunSnapshot`（`status` 为公开 Run 状态；`report` 在 Action 完成后由 `media.cleanup.completed.v1` 事件填充，未完成或未解析时为 `null`）；不存在 404。 |
| `GET /connections` | 无 | HTTP 200 返回 `ConnectionInstance[]`（按 createdAt 升序）。 |
| `GET /connections/:connectionId` | path `connectionId` | HTTP 200 返回 `ConnectionInstance`；不存在 404。 |
| `POST /connections` | body `CreateConnectionCommand` | HTTP 201 返回 `ConnectionInstance`（status 缺省 `active`）；非法 body 400 `validation_failed`。 |
| `PATCH /connections/:connectionId` | body `UpdateConnectionCommand`（全可选） | HTTP 200 返回更新后的 `ConnectionInstance`；不存在 404。 |
| `POST /connections/:connectionId/removals` | path `connectionId` | HTTP 200 返回 ack；同事务把引用该连接的 Source `connectionId` 置空，不删除来源。 |
| `POST /connections/:connectionId/probes` | path `connectionId`；可选 `Idempotency-Key` header（≤300 字符） | HTTP 202 返回 `ConnectionProbeJobSnapshot`，创建 `connection-probe` Job（ADR-0027 决定 2）；连接不存在 404；该连接的 Connector 没在 manifest 里声明 `auth.probeSupported` 时 409 `conflict`；无 header 时由 API 生成 `connection-probe:<uuid>` 幂等键。探测由 Worker 执行——API 不访问外部平台。 |
| `GET /connection-probes/:jobId` | path `jobId` | HTTP 200 返回 `ConnectionProbeJobSnapshot`；不存在或不是 `connection-probe` 的作业 404（不泄露其它种类的作业）。 |
| `GET /collection-plans` | 无 | HTTP 200 返回 `CollectionPlanSnapshot[]`（按 createdAt 升序；墓碑来源的计划不出现）。 |
| `GET /collection-plans/:planId` | path `planId` | HTTP 200 返回 `CollectionPlanSnapshot`；不存在或来源已删除 404。 |
| `PATCH /collection-plans/:planId` | body `UpdateCollectionPlanCommand`：必填 `baseRevisionId`，可选 `name`/`connectionId`/`scheduleIntervalMs`/`mediaPolicy`/`enabled` | HTTP 200 返回更新后投影；不存在 404；revision 过期 409；`enabled: true` 前先按 canonical schema 校验已保存的目标配置，不合法 400。`scheduleIntervalMs` 只增/改/删 schedule 触发器，不触碰 webhook 入口（ADR-0025）。 |
| `POST /collection-plans/:planId/webhook-entry` | path `planId` | HTTP 201 返回 `{ planId, entryPath, credential }`（ADR-0024）：入口标识与凭证一起生成或轮换，**明文凭证只在这个响应里出现一次**，旧凭证立即失效；不存在 404。不要求计划已启用——计划停用时由 inbound 端点拒绝请求。 |
| `DELETE /collection-plans/:planId/webhook-entry` | path `planId` | HTTP 200 返回撤销后的 `CollectionPlanSnapshot`（`webhook` 回到 `null`）：删除入口标识与凭证字节，幂等；不存在 404。 |

Webhook 入口的 `entryPath` 会出现在 URL 与日志里，所以它不是凭证；凭证本体只在生成/轮换响应里出现一次，读投影只回答 `credentialConfigured`（ADR-0024）。

Connection 的 `secretRef` 只以不透明字符串回显；凭证本体只在 SecretStore 内、经能力受限租约读写，不进入任何 HTTP DTO、DomainEvent、Job payload 或日志（ADR-0017）。`configJson` 是连接的**非秘密**适配器配置（Bilibili 的 OpenCLI profile 住在这里），创建与更新都可写、读取原样回显。`POST /source-config-probes` 接受可选 `connectionId`：未保存配置的探测没有来源与计划，需要登录态的操作靠它拿连接；不存在的连接当场 404 `not_found`。

| `GET /storage-stats` | 无 | HTTP 200 返回 `StorageStats`（数据库/Blob/Artifact/Cache/Log/Secret 字节 + 分层 `categories`）；只读。 |
| `GET /backups` | 无 | HTTP 200 返回 `BackupSnapshot[]`（数据根 `backups/` 下的数据库备份，按时间升序）。 |
| `POST /backups` | 无 | HTTP 201 返回 `BackupSnapshot`；用 `VACUUM INTO` 生成一致快照到 `backups/backup-<timestamp>.sqlite`（不依赖源码 checkout，Blob 不随备份）。 |
| `POST /backups/:backupId/restores` | path `backupId` | HTTP 200 返回 ack；恢复前生成 `pre-restore-*.sqlite` 保护备份后覆盖当前 SQLite；不存在 404；需重启 API/Worker 生效。 |
| `GET /exports/user-data` | 无 | HTTP 200 返回 JSON 附件（`UserDataExport`，`Content-Disposition: attachment; filename="cosmos-user-data-<exportedAt>.json"`，文件名里的 `:` 换成 `-`）；只读、不落盘、不改状态。 |
| `GET /connector-state/namespaces` | 无 | HTTP 200 返回 `ConnectorStateNamespaceSummary[]`；每个抽屉的 key 条数、归属（`planId`／`sourceId`／`connectionId`）与 `unattributed`；只读。 |
| `GET /exports/connector-state` | query `namespace`／`planId`／`connectionId`／`sourceId` 四选一，缺省 = 全部已归属 | HTTP 200 返回 JSON 附件（`ConnectorStateExport`，`filename="cosmos-connector-state-<exportedAt>.json"`）；只读、不落盘；同时给出多个范围参数按 400 `validation_failed` 拒绝。 |
| `POST /imports/connector-state` | body `ConnectorStateImportCommand` | HTTP 201 返回 `ConnectorStateImportResult`；默认 `skip-existing`，`overwrite` 时 `version = 本地 + 1`；body 超过 64 KB 返回 413 `payload_too_large`；`targetNamespace` 只在导出件含单个抽屉且目标抽屉已有归属登记时接受，否则 400 `validation_failed`。 |

`GET /exports/user-data` 的内容是七类用户真相对象（Label、Collection、Favorite、Annotation、Saved View、Board 树、Spotlight）加一份被引用目标的摘要（`targets`：目标类型、id、标题、条目的 `webUrl`）；字段直接复用各对象的公开读投影。它**不含**采集内容与派生投影、运行记录、连接与来源配置、Secret 字节、`ConnectorState` 与 `storageKey`；整库副本由 `POST /backups` 承担（ADR-0019 决策 5）。导出读取不加事务，是尽力而为的一致快照，`exportedAt` 是它的时间标记。

`GET /exports/connector-state` 只导出 `ConnectorState`：按抽屉（命名空间）切分，每项带归属快照与 `key`／`value`／`version`／`updatedAt`。归属来自 `ConnectorStateNamespace`，所以范围过滤是一次 join，不解析 manifest 模板；**未归属抽屉不属于任何一种范围**，默认不带走，只能按名字点名（`namespace`），此时导出件里 `owner` 为 `null`（ADR-0026）。它不含 Secret、连接配置、`Checkpoint` 与其它表；整库副本仍由 `POST /backups` 承担。

`POST /imports/connector-state` 只写 `ConnectorState`，不触发采集、不写事件、不改计划与连接。导入是数据写入：回滚代码不会撤销已经写进库的状态，需要时用同一入口的 `overwrite` 反向导入旧件，或整库恢复。非法输入（结构不符、超出体积上限）整批拒绝，不做部分写入；合法输入在单个事务内写完。

Catalog page 当前固定 `nextCursor: null`，`snapshotAt` 是响应生成时的 ISO 时间。Builtin
catalog 包含 `rss`、`fixture-rss`、`bilibili`、`aihot` Source definitions，Workflow
`cosmos.ingest@1` 与 `cosmos.media-cleanup@1`，以及 `source.fetch@1`、`media.retry.fetch@1`、
`media.retry.apply@1`、`library.ingest@1`、`source.checkpoint@1`、`media.cleanup@1`
Action manifests；这些是当前实现锚点，不是允许客户端执行的命令列表。


`CreateSourceCommand` 的 `name` 去空格后 1–200 字符；`sourceDefinitionRef` 必须命中当前
Catalog 的 enabled manifest，`operationId` 必须出现在其 operationIds 内；`config` 由
contracts 的 `getSourceConfigurationSchema(ref, operationId)` strict Zod schema 校验——这是
canonical 校验真相，manifest JSON Schema 只是发布投影。命令不接受 `enabled`：创建固定停用，
只能通过 activation command 启用。Source 公开 config 按**该 operation 声明的字段**投影：键取自
同一份 canonical schema（RSS 为 `feedUrl`；Bilibili `fetch` 为 `mode`/`limit`/`schemaVersion`，
`search` 为 `query`/`limit`/`schemaVersion`），未声明的键不回显；读不到 canonical schema 的来源
（历史 kind 投影）退回只保留 `feedUrl`。投影**不含**凭证：OpenCLI profile 住连接的 `configJson`，
不在来源 config 里。

`POST /sources/:sourceId/runs` 只接受已启用的 Source：未启用返回 409 `conflict`；
可选 `Idempotency-Key` 超过 300 字符按 400 `validation_failed` 拒绝，缺失时生成随机
`manual:<sourceId>:<uuid>` key。Workflow Control 仍按 key 复用 envelope 并在身份冲突时抛出
`WorkflowHostConflictError` 映射为 409。

### Run、Job、Attempt

| Method/path | 输入 | 成功输出与错误 |
| --- | --- | --- |
| `GET /runs` | 可选 `sourceId`、`limit` | 运行记录：按创建时间倒序返回最近 durable `RunSnapshot[]`（缺省 20 条、上界 100）；只含 durable `WorkflowRun`，不含 legacy Run 泳道。 |
| `GET /runs/:runId` | path `runId` | 先查 Workflow Host envelope，存在则返回 Product Run；否则查 legacy `RunSnapshot`；两者都不存在 404。 |
| `GET /runs/:runId/jobs` | path `runId` | `{ items: JobSnapshot[] }`（按 createdAt 升序，OPS-002）：`runId` 同时匹配 legacy `Job.runId` 与 durable `Job.workflowRunId`，因为两种 Run 共用同一个 Run 读端点。未知 Run 返回空列表而不是 404。这是产品面从 Run 走到 Job 的唯一入口；Attempt 明细仍由 `/jobs/:jobId/attempts` 提供。 |
| `GET /workflow-runs/:runId` | path `runId` | 当前实现别名，调用同一 `/runs/:runId` 查询和投影；不存在 404。 |
| `POST /runs/:runId/cancellations` | body 可选 `reason` | Run 控制 v1：非终态 Run 终态化 `cancelled` + fence；不存在 404，终态/并发 409；返回 `RunControlResult`（`run` + `reuse`/`sideEffects`）。 |
| `POST /runs/:runId/recoveries` | body 可选 `reason` | Run 控制 v1：无活动 lease 的非终态 Run 置 `resumeRequired` 送回恢复队列；活动 lease/终态 409，不存在 404。 |
| `POST /runs/:runId/re-runs` | 可选 `Idempotency-Key` header | Run 控制 v1：终态 Run 复用采集入队产生全新 Run；非终态 409、不存在 404、非 ingest 400 `invalid_state`；返回新 Run 的 `RunControlResult`。 |
| `GET /jobs/:jobId` | path `jobId` | `JobSnapshot`，不含 lease token；不存在 404。 |
| `GET /jobs/:jobId/attempts` | path `jobId` | `AttemptPage`（`items`、`nextCursor: null`、`snapshotAt`），由持久 Domain Events 投影 Attempt；查询本身不 claim/renew/complete。 |
| `GET /attempts/:attemptId` | path `attemptId` | 单个 `AttemptSnapshot`；无法解析或不存在 404；不含 lease token。 |

Workflow Product Run 的字段包括 envelope run id、Source/trigger 投影、公开 status、
Definition identity、idempotency key、resumeRequired 和创建/更新时间；内部
`queued→queued`、`running→running`、`waiting→running`、`completed→succeeded`、
`failed→failed`、`cancelled→cancelled`。Legacy Run 使用 contracts 中的 `RunSnapshot`
字段（含 item/revision/error 计数）。HTTP 不提供 claim、heartbeat、completion、lease
renewal 或内部 Kernel state 写端点。

`AttemptSnapshot` 的唯一字段由 `WorkflowAttemptSnapshot` 端口结果原样投影：
`id`、`jobId`、正整数 `number`、`workerId`、`workerInstanceId`、`ownerEpoch`、可空
`ownerSessionId`、`status`（`leased`/`succeeded`/`failed`/`lease_lost`/`cancelled`/
`uncertain`）、`leaseAcquiredAt`、`leaseExpiresAt`、可空 `lastHeartbeatAt`、可空
`finishedAt` 和可空 `error`。`error` 若存在只有 `kind`（`aborted`/`retryable`/`terminal`/
`unknown`）、可空 `code`、`message`、`retryable`、可空 `occurredAt` 和固定 `detailsRef: null`。

Repository 的 `projectWorkflowAttempts` 只读取 `workflow.activity.<status>.v1` 事件，
忽略缺失、非安全整数或非正数 `payload.attempt`。事件按持久 sequence 升序读取，再按
`number` 升序输出；同一 number 的首个事件创建 `id = <jobId>:attempt:<number>`，后续
事件覆盖当前状态/worker/lease 时间，终态事件写入 `finishedAt`。`owner` 非空字符串
作为 `workerId` 与 `workerInstanceId`，否则为字面值 `"unknown"`；事件没有
`ownerSessionId`/`ownerEpoch`/heartbeat，所以当前投影分别是 `null`/`0`/`null`。
事件状态映射是：`leased → leased`、`succeeded → succeeded`、`cancelled → cancelled`、
`released → lease_lost`，其它状态（包括 `failed_terminal`、`retry_wait`）→ `failed`；
有 error 时 `retry_wait` 只影响 `error.kind=retryable`，`cancelled` 为 `aborted`，
`released` 为 `unknown`，其它为 `terminal`。事件没有 error 时保留此前 error。

Detail 查询要求 id 含 `:attempt:` 且前缀作为 job id；当前存储解析后缀使用
`Number.parseInt`，因此真正无法转成正的安全整数、空前缀、未知 job 或不存在 number 才
返回 404 `not_found`，而带数字前缀的脏后缀（例如 `1x`）可能被当前实现接受，这是待修复
的解析严格性缺口，不应被规格误写成已拒绝。列表不会先查 Job：空/未知 job id 当前可得
200 空 `AttemptPage`。
