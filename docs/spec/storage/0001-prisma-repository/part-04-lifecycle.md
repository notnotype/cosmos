---
parent: docs/spec/storage/0001-prisma-repository.md
range: 状态转换、副作用、错误与降级、依赖、配置
sealed_at: 2026-10-26
tags: [spec, storage, lifecycle]
tokens_est: 1456
---

## 状态转换

- Source：创建时 enabled 缺省 true；只通过 `setSourceEnabled` 改变 enabled。
- Legacy Run：`createRun` 直接进入 running；`createQueuedRun` 进入 queued；`startRun` 进入 running；`completeRun` 进入 succeeded/failed/cancelled 终态并写 finishedAt；`resetRunForRetry` 回到 queued 并清空 startedAt/finishedAt。仓储不实现新的 cancel request 状态。
- Step：随 Run 的 queued/running/终态同步，startRun 增加 attempts。
- Legacy Job：queued 或到期 retry_wait → leased；当前 lease 可转 succeeded、retry_wait、failed_terminal；过期或旧 token 不可覆盖。达到 maxAttempts 时由 claim 直接转 failed_terminal。
- Observation：创建后作为证据保留；同一 legacy Run/external key 重放返回 duplicate。相同 Entry fingerprint 不追加修订，指标准确时间可刷新；不同 fingerprint 追加修订。
- Checkpoint：legacy upsert 可直接替换 cursor；Workflow checkpoint 只有 expected revision 匹配才递增，失配只产生 superseded 结果。
- DomainEvent：append-only，sequence 不复用；Workflow key 的同 type/version/payload 可幂等重放，不同 payload 由 Workflow event helper 冲突拒绝。
- ModelProvider/ConfiguredModel：写入走 `expectedVersion` 的 CAS（`updateMany where { id, version }`，`count !== 1` 即 `version_conflict`）；Provider 的 `pendingOperationId` 在写操作期间占用，`state` 当前只会是 `active`。删除 Provider 在同一事务里连删模型，被 Connection 引用时整个事务拒绝。
- ModelConfigurationOperation：`pending` → `completed` 或 `failed`（清理未完成时 `cleanup_pending`）；phase 与 generation 由恢复流程推进，代次递增后旧执行者失去发布资格。收据不对 Provider 建外键，所以 Provider 删除后仍可读取。

## 副作用

- Prisma transaction：Run/Step/Job 与 queued/leased/completion event；Observation/Entry/EntryRevision/Story/StoryRevision/Asset/FTS 与 ingest events；Workflow checkpoint 与 checkpoint event。
- 文件系统：raw payload 和 saved Asset 先写 Blob Root；`readAsset` 从 Blob Root 读取。
- FTS：初始化确保表存在；每次新 Entry 修订删除旧 entry_search 行再插入新标题/正文。
- 事件/日志：DomainEvent 是持久账本；结构化 logger 记录初始化、claim 竞争、terminal Job、存储错误和 health 阶段。日志不替代事件。
- 没有跨 Blob/SQLite 的事务补偿，也没有外部 outbox、消息发送或 exactly-once 发布。

## 错误与降级

- JSON/config/DTO 解析失败、日期过滤非法、FTS/Prisma/Blob I/O 失败一般按原异常向上抛出。
- 两个例外按约束翻成业务码，而不是交给统一兜底：同一 Provider 下重复的 `modelId`（P2002）翻成 `already_exists`，删除仍被 Connection 引用的模型或 Provider（P2003 / 引用计数非零）翻成 `in_use`。两者重试都不会成功，退化成 `dependency_unavailable` 会让界面提示「稍后重试」并永远失败。
- stale legacy Job 的 renew/complete 返回 `false`；空 acceptedKinds 返回 `null`；竞争导致条件更新为 0 时 claim 返回 `null` 并记录 debug。
- maxAttempts 到达后 legacy Job terminalize，关联 Run 失败；具体 connector 错误是否可重试由 application worker 决定，本仓储只保存结果与 errorCode。
- `health()` 对数据库查询失败或 heartbeat 查询失败返回失败状态而不是抛出；其它健康查询成功时 worker heartbeat 超时只投影为 stopped。
- FTS virtual table 缺失会在初始化时创建；没有后台修复损坏 FTS 行的独立能力。

## 依赖

依赖 Prisma Client/SQLite、`@cosmos/contracts`、`@cosmos/domain`、`@cosmos/application` 的 `CosmosRepository`/日志/Host fence 类型以及 `@cosmos/blob-store`。Application 拥有端口和 legacy worker 合同，Domain 拥有规范化身份/内容规则，Blob Store 拥有文件路径和内容完整性；本组件拥有 SQL 领域表、事务和查询。

## 配置

- `COSMOS_DATA_ROOT`：默认 `.cosmos`；相对路径以 `COSMOS_WORKSPACE_ROOT` 或当前工作目录为基准。
- `COSMOS_WORKSPACE_ROOT`：只控制相对 Data Root 锚定。
- `DATABASE_URL`：覆盖派生 SQLite URL；当前实现基于 SQLite Prisma schema，不声明 PostgreSQL/MySQL 行为。
- Data Root 派生 `databasePath/blobRoot/artifactRoot/cacheRoot/logRoot/secretRoot`；`resolveContainedPath` 拒绝相对路径逃出受控根。
