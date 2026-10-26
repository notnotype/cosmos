---
parent: docs/spec/storage/0001-prisma-repository.md
range: 输入、输出、状态与持久化
sealed_at: 2026-10-26
tags: [spec, storage, persistence]
tokens_est: 3677
---

## 输入

- Source、Run、Job、Feed、Search、Story、Entry、Revision、Asset、Event、Health 的公共输入/输出由 [`../contracts/0001-public-contracts.md`](../../contracts/0001-public-contracts.md) 与 application 的 `CosmosRepository` 端口拥有；仓储不复制 DTO。
- `NormalizedIngestItem`、`NormalizedAssetInput`、Publisher、TemporalValue、ContentMetrics、`deriveExternalKey` 与 fingerprint 规则由 [`../domain/0001-normalized-content.md`](../../domain/0001-normalized-content.md) 拥有。仓储将已规范化对象 JSON 化后写入列。
- `claimNextJob` 的 `acceptedKinds` 为空时立即返回 `null`；legacy worker 通过 `source-ingest`、`source-probe` 白名单隔离 `workflow-activity`。Job lease 必须为正整数；本仓储不声明默认 lease 配置。
- Feed/Search/Entries 的非法、负数或非数值 cursor 由 `parseCursor` 按 offset 0 处理；Search 日期解析失败抛出明确错误。
- Source/Run/Job/Checkpoint/Asset id 为字符串。查询缺失通常返回 `null`，Prisma `update` 找不到目标时保留底层异常，不统一包装为公共 NotFound DTO。

## 输出

成功输出是 contracts/application 端口定义的快照、页和事件白名单；内部 Prisma row、数据库 URL、绝对路径、secret 不作为公开 API 输出。仓储内部的 Asset snapshot 携带 storageKey，Product API 的公开投影另行剥离（`toPublicAsset` + `publicAssetSnapshotSchema`，见 [`interfaces/0002-product-api-http.md`](../../interfaces/0002-product-api-http.md)）。Feed/Search/Entries 使用 `nextCursor = offset + limit` 或 `null`；DomainEvent replay 的 id 为 sequence 字符串。

## 状态与持久化

SQLite Prisma schema 是权威 durable truth。当前模型/关系的重建要点如下：

| 模型 | 代码可证的关键字段/约束 | 关系/删除边界 |
| --- | --- | --- |
| `SourceInstance` | id、name、kind、configJson、enabled、可空 deletedAt（墓碑，AUT-001）、createdAt、updatedAt | 拥有 observations、runs、checkpoint、entries；Observation/Entry/Checkpoint 级联，Run 外键为 RESTRICT |
| `Checkpoint` | sourceInstanceId 唯一、planId 唯一（可空）、cursor、revision、workflowRunId、updatedAt | 按**采集计划**寻址（ADR-0023 决策 2）；sourceInstanceId 保留到第 4 步 contract 删列；WorkflowRun 删除时 workflowRunId SET NULL |
| `CollectionPlan` | name、sourceId 唯一、可空 connectionId、可空 mediaPolicyJson、overlapPolicy、enabled、revision、时间戳 | 拥有 triggerBindings/checkpoint/runs/workflowRuns；来源删除级联，连接删除 SET NULL；读投影派生 `scheduleIntervalMs`（schedule 行）与 `webhook` 入口（webhook 行），**不暴露触发器 id**（ADR-0025） |
| `TriggerBinding` | sourceId、可空 planId、kind（`schedule`/`manual`/`webhook`）、configJson、enabled、revision、可空 webhookToken（唯一）、可空 secretRef | `(sourceId, kind)` 与 `(planId, kind)` 唯一：一个计划每种类型最多一行，schedule 与 webhook 可共存（ADR-0025）；来源删除级联，计划删除 SET NULL；只有 webhook 行写 webhookToken/secretRef，凭证字节在 SecretStore |
| `ModelProvider` | id、name、api（`openai-completions`/`openai-responses`）、baseUrl、可空 secretRef（唯一）、version、state（默认 `active`）、可空 pendingOperationId（唯一）、时间戳 | 拥有 models；`secretRef` 只指向 SecretStore 里的字节，key 不进本表；`pendingOperationId` 是「同一 Provider 同时只有一个写操作」的占用标记；`state` 的 `deleting` 只存在于 DTO schema，当前没有写入点 |
| `ConfiguredModel` | providerId、modelId（上游标识）、name、contextWindow、maxOutputTokens、version、时间戳 | `(providerId, modelId)` 唯一；`provider` 外键 RESTRICT，删 Provider 必须在同一事务里先删模型；`ConnectionInstance.modelId` 也以 RESTRICT 引用它，删被引用的模型会撞外键并被翻译成 409 `in_use` |
| `ModelConfigurationOperation` | 全局唯一 idempotencyKey、kind（`create`/`update`）、providerId、state（`pending`/`completed`/`failed`/`cleanup_pending`）、phase、generation、可空 expectedVersion/resourceVersion、可空 newSecretRef（唯一）/oldSecretRef、可空 errorCode、时间戳 | 对 Provider 没有外键，所以收据可以活过 Provider 删除；只存非秘密的重放判定与清理线索，key 与可重放的命令 payload 不落本表 |
| `ConnectionInstance` | id、name、connectorId、可空 account、可空 scopeJson（授权范围）、可空 configJson（适配器**非秘密**配置，JSON 文本）、status（`active`/`revoked`/`expired`/`error`）、可空 secretRef、可空 lastError、可空 lastCheckedAt（最近一次登录探测的时间）、可空 modelId、version、时间戳 | 可复用连接身份（ADR-0017）；`secretRef` 只指向 SecretStore 里的字节，凭证不进本表；`configJson` 装适配器自己的非秘密配置（Bilibili 的 OpenCLI profile，Proposal connection-login-lifecycle-v1），连接器从入队冻结的连接投影读它；`lastCheckedAt` 由登录探测回写（仓库方法 `recordConnectionProbe`，ADR-0027 决定 2），**不走公开的更新命令**；模型型连接（`connectorId = cosmos.agent`）用 `modelId` 指向本地模型配置、Provider 由模型归属推导（[Provider/model 配置合同](../../../api/0009-provider-model-configuration.md)），`version` 是选择与撤销的 CAS 令牌；计划删除 SET NULL、来源的 `connectionId` 由仓库事务显式置空 |
| `ConnectorState` | `(namespace, key)` 唯一、valueJson、单调 version（CAS 令牌）、updatedAt | 命名空间化 + 版本化的非秘密运行状态（ADR-0017）；**不写 Secret**，也没有指向计划／来源的外键——命名空间是宿主按 manifest 模板算出来的字符串 |
| `ConnectorStateNamespace` | namespace 主键、planId、时间戳 | 抽屉归属（ADR-0026）：让「这个抽屉属于哪个计划」成为数据，`sourceId`／`connectionId` 靠 join `CollectionPlan` 取得；计划删除级联；**刻意没有从 `ConnectorState.namespace` 指向本表的外键**——登记是尽力而为的元数据，不能成为状态写入的前置条件 |
| `Run` | source、triggerKind、status、created/started/finishedAt、item/created/revised/duplicate 计数、errorCode/errorMessage | 拥有 Step/Job/Observation/DomainEvent；子记录按 schema 级联或 SET NULL |
| `Step` | runId、position 唯一、kind/status/attempts、input/output/error/时间 | 属于 Run，删除级联；Job 可关联 Step |
| `Job` | 可选 runId/stepId/workflowRunId、可选 workflowKernelRevision、kind/status、payload/result、全局唯一 idempotencyKey、attempts/maxAttempts、lease owner/token/expires、nextAttemptAt/error | 同时承载 legacy 与 Activity Job；WorkflowCompletion 以 jobId 唯一关联 |
| `WorkerHeartbeat` | instanceId 唯一、status/version、startedAt/lastSeenAt/stoppedAt | 独立心跳行 |
| `DomainEvent` | 自增 sequence、eventId 唯一、type/version/payload/occurredAt、aggregate、runId、workflowRunId、idempotencyKey | Run/WorkflowRun 关联可 SET NULL；Workflow `(workflowRunId,idempotencyKey)` 唯一 |
| `Observation` | Source/run/workflow、ingestCommandId 唯一、entry、external key/revision、locator、内容/时间/Blob/metrics | Source 删除级联；Run/Workflow/Entry 关联 SET NULL；`(sourceInstanceId,runId,externalKey)` 唯一 |
| `Entry` | `(sourceInstanceId,canonicalExternalId)` 唯一、currentRevisionId 唯一、storyId、metricsJson | 拥有 revisions/observations；Source 删除级联，Story 删除 SET NULL |
| `EntryRevision` | `(entryId,revision)` 唯一、title/summary/content/fingerprint/url/contentKind/Publisher/Temporal/createdAt | Entry 删除级联；Asset 从属于修订 |
| `Asset` | revision、kind/status、sourceUrl/storageKey/mimeType/byteSize/errorMessage/errorCode、attemptCount、lastAttemptAt | EntryRevision 删除级联 |
| `Story`/`StoryRevision`/`StoryAlias` | Story id/kind/subtype/currentRevisionId；Revision `(storyId, revision)` 唯一、fingerprint/producer/actorJson/reason/title/summary、可空 timeRangeJson/keyFactsJson；Alias id→canonicalStoryId | Story 拥有 revisions/entries；Revision 删除级联；Alias 级联到 canonical Story；`producer` 缺省 `system`，由 migration `20260924100000_story_revision_producer` 加列并按 `story.revision_created.v1` 事件回填 `human`（ADR-0028） |
| `StoryReplacement` | `(storyId, successorStoryId)` 唯一、actorJson/reason；`(successorStoryId)` 索引 | 两列都级联到 Story；存在行即历史壳（ADR-0012 决策 1） |
| `Topic`/`TopicRevision`/`TopicAlias` | Topic currentRevisionId；Revision `(topicId, revision)` 唯一、fingerprint/actorJson/reason/title/purpose/scope；Alias id→canonicalTopicId | Topic 拥有 revisions/memberships；Revision/Alias 级联到 Topic |
| `TopicMembership`/`TopicMembershipRevision` | Membership `(topicId, storyId)` 唯一、currentRevisionId；Revision `(membershipId, revision)` 唯一、role/reason/actorJson/tombstone | Membership 级联到 Topic/Story；Revision 级联到 Membership |
| `Entity`/`EntityRevision`/`EntityAlias` | Entity currentRevisionId/type；Revision `(entityId, revision)` 唯一、name/type、fingerprint/actorJson/reason；Alias `(entityId, name)` 唯一 | Entity 拥有 revisions/aliases/links/relations；Revision/Alias 级联到 Entity |
| `StoryEntity` | `(storyId, entityId)` 唯一、producer/producerVersion/confidence/evidence/actorJson/reason | 级联到 Story 与 Entity |
| `EntityRelation` | `(fromEntityId, toEntityId, relationType)` 唯一、producer/producerVersion/confidence/evidence/actorJson/reason | from/to 都级联到 Entity |
| `EntryStoryLink` | `(entryId, storyId)` 唯一、relationType、producer/producerVersion/confidence/evidence/actorJson/reason、`(storyId)` 索引 | 级联到 Entry 与 Story；主归属仍由 `Entry.storyId` 唯一表达 |
| `EntryRelation` | `(fromEntryId, toEntryId)` 唯一、relationType、producer/producerVersion/confidence/evidence/actorJson/reason、`(toEntryId)` 索引 | from/to 都级联到 Entry；对称类型写入前按 id 归一化，所以唯一键等价于无序对；与 Story 归属解耦 |
| `Label` | name 全局唯一、createdAt/updatedAt | 拥有 assignments；Assignment 级联到 Label |
| `LabelAssignment` | `(labelId, targetType, targetId)` 唯一、`(targetType, targetId)` 索引；无 target 外键（多态） | 只级联到 Label；目标行删除不自动清理附加 |
| `Collection`/`CollectionItem` | Collection name/可空 description；Item `(collectionId, storyId)` 唯一、`(storyId)` 索引 | Item 级联到 Collection 与 Story |
| `Favorite` | `(targetType, targetId)` 唯一、createdAt/updatedAt | 无目标外键（多态） |
| `Annotation` | `(targetType, targetId)` 索引、可空 targetRevisionId/quote/evidence/actorJson、body | 无目标外键（多态）；Story merge 时 targetId 重定向到 canonical |
| `SavedView` | name、可空 text/sourceId/publishedAfter/publishedBefore、labelIdsJson/topicIdsJson | 无外键（只存条件，不存结果） |
| `Board` | name 全局唯一、可空 description、时间戳 | 拥有 sections；Section/Block 级联删除；不持有内容对象外键 |
| `BoardSection` | boardId、title、position、`(boardId)` 索引 | 级联到 Board；拥有 blocks |
| `BoardBlock` | sectionId、type、configJson、position、visible、`(sectionId)` 索引 | 级联到 Section；config 只引用内容对象 id，不建外键（悬空降级） |
| `SpotlightPlacement` | `(boardId, targetType, targetId)` 唯一、`(boardId)`/`(targetType, targetId)` 索引、source 默认 `manual`、可空 reason/actorJson/expiresAt | 级联到 Board；目标行不建外键（Story/Topic merge 时显式重定向） |
| `WorkflowRun`/`WorkflowCompletion` | 同库存在，但 kernel state、Run lease、Activity Completion 字段由后续 Host specs 拥有 | 本组件不定义其状态机 |

`entry_search` 不是 Prisma model，而是在 `initialize()` 中创建的 FTS5 virtual table，当前写入列为 `entry_id`、`title`、`content_text`。
