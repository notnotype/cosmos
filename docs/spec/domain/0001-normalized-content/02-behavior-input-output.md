---
parent: ../0001-normalized-content.md
range: 外部行为至配置（原文第 83–176 行）
sealed_at: 2026-11-02
tags: [domain, behavior, input-output, persistence]
tokens_est: 3333
---

[返回主文](../0001-normalized-content.md) · [概念与定义](01-concepts.md) · [重建验收与实现锚点](03-acceptance-implementation.md)

## 外部行为

所有导出的函数都是同步纯函数，除 `createTemporalValue` 在未提供 now 时读取当前时钟外，不访问外部资源。Connector 先把各来源字段转换为本模型，再由 storage 用 external key 和 fingerprint 判断是否新建、重复或追加修订。

`createTemporalValue` 优先使用 exact；exact 无效时保留原始时间文本并创建 fallback。`deriveExternalKey` 先选稳定 externalId，再选 URL，最后用规范化字段生成 hash。`fingerprintEntryRevision` 对 Entry 修订内容字段做确定性摘要；`fingerprintStoryRevision` 只对 Story 展示字段与归一化后非空的扩展做摘要，`fingerprintTopicRevision` 只对 Topic 展示字段做摘要，`fingerprintEntityRevision` 只对 Entity 的 name/type 做摘要。`projectEntryToStory` 只生成八个字段的最小投影。

## 输入

### NormalizedIngestItem 与资产

领域输入允许 `sourceLocator` 中存在任意未知值，也允许 `NormalizedAssetInput.content` 为 `Uint8Array`。调用者必须提供 title、contentText、kind 等字段；webUrl 可为空；externalId 也可为空，但 item 至少应有 externalId、URL 或 sourceLocator 中的定位证据。跨 Workflow 时，application 先把领域值转换为[公共合同](../../contracts/0001-public-contracts.md)的 strict JSON-safe wire shape；domain 算法本身不执行该 schema 校验。

### Publisher 输入

`normalizePublisher` 接受 null/undefined 或字段值为 unknown 的记录。只有可转换为非空文本的 name 才能生成 Publisher；platformId、handle、profileUrl 不是必需身份字段。

### Temporal 输入

`createTemporalValue` 接受可选 unknown `exact`、可选可空字符串 `raw`、可选 `Date now` 和可选可空 `timezone`。exact 可以是 finite number、数字字符串或 Date 可解析字符串；raw 在 exact 失败后作为显示/来源证据。

### 身份和 Story 输入

`deriveExternalKey` 接受 optional externalId/webUrl、必需 title、可选 contentText/publishedAt/sourceLocator。`fingerprintEntryRevision` 接受 title、summary、contentText、webUrl、kind、publisher 和可选 `contentSource`。未声明 `contentSource` 时保持原有指纹算法；声明后以稳定序列化的来源输入替代解析派生的 `contentText` 参与指纹，图片或顺序变化产生新来源修订，解析器变化与下载状态变化不产生来源修订。`projectEntryToStory` 接受 entryId、revisionId、title 和可选 summary/kind/subtype/contentKind。`fingerprintTopicRevision` 接受 title、purpose、可空 scope。

## 输出

### Publisher 输出

有效输入得到带显式 `platformId`、`name`、`handle`、`profileUrl`、`kind`、`metrics` 的 Publisher；无效或空 name 得到 null。不会生成平台 ID、不会替换成任意 profile URL。

### TemporalValue 输出

exact 成功时返回 `{ exact: ISO, exactPrecision: "second", fallback: null }`。exact 失败但 raw 非空时返回 exact/exactPrecision 为 null 的 fallback；raw 为空时返回 null。`temporalProjection` 只返回 exact ISO；fallback-only value 投影为 null。

### 身份与 Story 输出

`deriveExternalKey` 返回：`external:<trimmed externalId>`、`url:<trimmed webUrl>`，或 `fallback:<64位 sha256 hex>`。`fingerprintEntryRevision` 返回 64 位 SHA-256 十六进制字符串。

`projectEntryToStory` 返回 `MinimalStoryProjection` 的八个字段：`id`、`kind`、`subtype`、`title`、`summary`、`entryId`、`revisionId`。id 固定为 `story:${entryId}`；显式 kind 优先；否则 video/audio/image 映射为 media、comment 映射为 thread、post/article/listing 映射为 document，缺省为 document；subtype 和 summary 默认 null，title 与 ID 原样保留。`fingerprintStoryRevision` 接受 `StoryRevisionContent` 并返回 64 位 SHA-256 十六进制字符串；相同展示字段重复计算得到同一指纹。`fingerprintTopicRevision` 接受 `TopicRevisionContent` 并返回 64 位 SHA-256 十六进制字符串；title/purpose/scope 任一变化都会改变指纹。

### Story subtype 输出

`listStorySubtypes` 接受可选 `kind` 与可选 `statuses`（缺省 `["active","deprecated"]`），返回按注册表顺序过滤后的注册项数组，不复制对象。`checkStorySubtype` 接受 `kind`、`subtype`（可空）与可选注册表覆盖，返回 `{ok:true, registration}` 或 `{ok:false, reason, registration}`；`reason` 取 `empty`/`unregistered`/`kind_mismatch`/`not_active`，`registration` 在能定位到条目时一并返回，便于调用方生成可读错误。

## 状态与持久化

本组件无数据库、Blob 或文件持久状态。Publisher、TemporalValue、metrics、item、external key 和 fingerprint 在调用中即时生成；进程重启后不恢复任何值。领域 durable truth 由 storage owner 保存：

- Observation 保存每次来源捕获的 externalId/externalKey/sourceLocator/webUrl/capturedAt/sourcePublishedAt 等证据。
- Entry 在 `(sourceInstanceId, canonicalExternalId=externalKey)` 上保持稳定身份。
- EntryRevision 追加 title、summary、contentText、webUrl、kind、publisher、时间 JSON、sourcePublishedAt、fingerprint 和 revision number。
- Asset 记录修订下的 kind/status/sourceUrl/storageKey/mimeType/byteSize；bytes 通过 application/storage 的 Blob 边界保存。
- Story/StoryRevision 保存最小 Story 投影及当前指针。
- Topic/TopicRevision/TopicMembership/TopicMembershipRevision/TopicAlias 保存 Topic 的不可变展示版本、`(topicId, storyId)` 唯一成员关系与 revision/tombstone 历史、以及 merge 的 alias 重定向（ADR-0007）。
- Entity/EntityRevision/EntityAlias/StoryEntity/EntityRelation 保存 Entity 的不可变 name/type 版本与名称别名、`(storyId, entityId)` 唯一 Story↔Entity 关联、以及带方向的 `(fromEntityId, toEntityId, relationType)` 唯一 Entity↔Entity 类型化关系；关联与关系保存 provenance（producer/producerVersion/confidence/evidence/actor/reason）（ADR-0008）。
- Label/LabelAssignment 保存全局唯一命名的分类标签与 `(labelId, targetType, targetId)` 唯一的多态附加；Collection/CollectionItem 保存命名收藏夹与 `(collectionId, storyId)` 唯一 Story 成员；Favorite 保存 `(targetType, targetId)` 唯一的 Story/Entry 轻量收藏标记。标签不进入被标注对象自身的 revision——它是对象外的用户真相，重分析刷新派生数据不改变它（ADR-0009、NFR-004）。

## 状态转换

domain 函数本身没有可变状态机；storage 按这些语义转换 durable 内容：

1. 首次遇到一个 Source instance + external key 时，创建 Observation、Entry、revision 1，并生成 `story:${entryId}` 的 Story 投影。
2. 同一 run 和 external key 再次出现时，返回 duplicate observation 结果，不追加同一次运行的重复观察。
3. 已有 Entry 的当前修订 fingerprint 相同时，不追加内容 revision；实现可以更新新的 exact 发布时间、updatedAt JSON 或 metrics。
4. fingerprint 改变时追加 revision number +1，并使新修订成为 current；Observation 的 eventKind 为 update。
5. Story 事务只在展示字段 fingerprint 与当前 StoryRevision 不同时追加 revision（按当前 revision 加 1）并移动 current 指针；相同则 no-op。该写入由 storage transaction 完成，不是 domain 函数副作用（ADR-0006）。
6. 公共 Observation DTO 虽然允许 `delete`/`snapshot`，但当前 item persist 路径只产生 `create`/`update`，不能把枚举值写成已实现的来源处理能力。

## 副作用

`normalizePublisher`、`createTemporalValue`、`temporalProjection`、`mapContentKindToStoryKind`、`deriveExternalKey`、`fingerprintEntryRevision`、`fingerprintStoryRevision`、`fingerprintTopicRevision`、`fingerprintEntityRevision` 和 `projectEntryToStory` 不写数据库、不写 Blob、不发网络请求、不写日志、不发 Domain Event。唯一的时间外部输入是 createTemporalValue 在缺少 now 时读取本地进程时钟；hash 使用 `node:crypto`。

Connector 读取外部来源的网络/进程副作用属于 Connector；storage 将 item 写入数据库、保存 raw payload/asset bytes、更新 run 计数、写事件属于 storage/application。不能把这些邻接副作用归入 domain。

## 错误与降级

- `normalizePublisher` 对 null/undefined 或无有效 name 降级为 null；未知 Publisher kind 降级为 `unknown`，不会抛出或虚构身份。
- `createTemporalValue` 对无效 exact 降级到 raw fallback；无有效 exact 且 raw 为空返回 null；无法识别的 raw 保留原文、当前时间下界、`unknown` 精度和 `uncertain` 置信度。
- 非法日期不会被当作合法日期；月日候选只选当前年或前一年中的合法日期，且选距 now 最近者。
- fingerprint 和 external key 不因缺 URL 失败：externalId、URL 都缺时使用 fallback hash；sourceLocator 参与 hash 以减少同标题碰撞。
- domain 不负责把 storage 冲突、Blob 完整性、Connector malformed payload 或 workflow lease 错误转换为公共错误；这些由相应 owner 处理。

## 依赖

- `node:crypto` 的 `createHash("sha256")`。
- Connector：`plugins/rss/src/index.ts` 的 `parseRssXml` 使用 Publisher/Temporal 规范化并生成 article；`plugins/collectors/src/index.ts` 的 `normalizeBilibiliOutput` 与 `normalizeAiHotItem` 使用 Publisher、Temporal、metadata Asset 和 metrics。
- Application：`packages/application/src/index.ts` 的 `IngestConnector` 返回 readonly NormalizedIngestItem 且不持久化；`packages/application/src/workflow-ingest.ts` 的 `toJsonItem/fromJsonItem` 在 JSON wire shape 与 Blob bytes 之间转换。
- Storage：`packages/storage-prisma/src/index.ts` 的 `persistIngestItemInternal` 使用 external key、fingerprint 和 exact temporal projection；Prisma schema 的 Observation、Entry、EntryRevision、Asset、Story、StoryRevision 是 durable owner。
- 跨边界 JSON schema：[公共合同](../../contracts/0001-public-contracts.md)。该 schema 是 wire owner；本文件保留 domain 语义算法和运行时接口，不另立一套边界解析规则。

## 配置

本组件没有环境变量、配置文件、路径或网络端点。时间函数可通过调用参数传入 `now` 和 `timezone`；缺失时 now 使用当前 Date，timezone 记录为 `UTC`。Connector 的来源配置、fixture 路径和 OpenCLI/HTTP 参数不属于 domain 配置。
