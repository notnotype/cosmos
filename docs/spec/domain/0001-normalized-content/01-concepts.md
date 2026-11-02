---
parent: ../0001-normalized-content.md
range: 概念与定义（原文第 29–82 行）
sealed_at: 2026-11-02
tags: [domain, normalized-content, concepts]
tokens_est: 3797
---

[返回主文](../0001-normalized-content.md) · [行为与输入输出](02-behavior-input-output.md) · [重建验收与实现锚点](03-acceptance-implementation.md)

## 概念与定义

### 内容、发布者和采集 item

- **ContentKind** 是领域语义词汇：`post`、`article`、`video`、`audio`、`image`、`comment`、`listing`。这些值与[公共合同](../../contracts/0001-public-contracts.md)的 wire enum 对齐，但本文件只规定 domain 如何消费它们，不复制 Zod 校验。
- **StoryKind** 固定为 `event`、`document`、`media`、`thread`。
- **TopicMemberRole** 是 Topic 成员角色的受管枚举：`core`、`update`、`background`、`analysis`、`counterpoint`、`tutorial`（ADR-0007）；写入侧由[公共合同](../../contracts/0001-public-contracts.md)校验，读取侧允许未知值降级展示。
- **EntityType** 是 Entity 本体类型的受管枚举：`person`、`organization`、`product`、`project`、`model`、`location`（ORG-003、ADR-0008）。**EntityRelationType** 是 Entity↔Entity 类型化关系的受管枚举：`founded`、`works_at`、`located_in`、`produced`、`part_of`、`related_to`（ADR-0008 决策 4）。两者写入侧由公共合同校验，读取侧允许未知值降级展示；domain 只提供枚举语义，不执行关系写入事务。
- **EntryStoryRelationType** 是 Entry↔Story 辅助关系的受管枚举：`evidence_for`（该条目是目标 Story 的证据）、`mentions`（该条目提到目标 Story 但不作为证据）（ORG-011、ADR-0011 决策 1）。写入侧由公共合同校验，读取侧允许未知值降级展示；domain 只提供枚举语义，主归属仍由 `Entry.storyId` 表达，关系写入事务由 storage 执行。
- **EntryRelationType** 是条目↔条目跨来源重复/转载关系的受管枚举：`duplicate_of`（同一篇稿件的完全重复）、`syndicated_from`（转载，有方向）、`near_duplicate_of`（摘编/改写/翻译等近似）（ING-006、ADR-0022 决策 1）。domain 另外提供 `symmetricEntryRelationTypes`（`duplicate_of` 与 `near_duplicate_of`）、`isSymmetricEntryRelationType` 与 `normalizeEntryRelationEndpoints`：对称类型按两个 Entry id 的字典序归一化，`syndicated_from` 保留调用方断言的语义方向（ADR-0022 决策 3）。**一对条目只保留一个当前语义**，未知类型读取侧降级且不按对称排序（猜顺序等于发明方向）。
- **PublisherKind** 是领域语义词汇：`user`、`channel`、`subreddit`、`official-account`、`org`、`unknown`；wire 形状和边界解析由[公共合同](../../contracts/0001-public-contracts.md)拥有。
- **NormalizedAssetInput** 是领域侧附件输入：`kind`、可空 `sourceUrl`、`status`（`saved`/`metadata_only`/`skipped`/`failed`）、可空 `mimeType`、可空 `byteSize`、可选可空 `errorMessage`（降级原因）和 `content: Uint8Array | null`。这里的 bytes 是领域运行时值，不是 Workflow JSON 字段；Workflow 中的 BlobRef wire shape 只由[公共合同](../../contracts/0001-public-contracts.md)定义，bytes 的 hash/containment 校验由[FileBlobStore](../../storage/0005-file-blob-store.md)负责。
- **NormalizedIngestItem** 包含可选可空 `externalId`、`title`、可空 `summary`、`contentText`、可空 `webUrl`、`kind`、可空 `publisher`、可空 `metrics`、可空 `publishedAt`、可选可空 `updatedAt`、`sourceLocator: Record<string, unknown>`、可选 `discoveryChannel`（受管发现渠道，ING-004；由连接器声明，**不参与 fingerprint**——同一条内容换一种发现方式不产生新 Revision）、`rawPayload`、可选 `rawPayloadMimeType` 和只读资产数组。URL 可以为 null；没有 URL 仍可凭 externalId 或 sourceLocator 建立身份。进入 Workflow JSON 前由 contracts schema 做 wire 校验，domain 不再定义第二套边界规则。

### 有序内容表示（Task40）

`NormalizedIngestItem` 可选声明 `contentSource`：`plain-text`、`safe-html-input` 或 `structured-source-content`。HTML 输入不可信。Application 的确定性 Normalizer 按来源顺序生成受控内容块；领域只定义语义类型，不依赖 HTML 解析库。媒体输入以来源 URL 表达，持久化时绑定同一来源修订下的实际 Asset ID。

Observation 分别持有原始 payload 和声明输入的 Blob 引用。EntryRevision 保持来源修订不变；其 `ContentRepresentation` 子版本保存解析器版本、有序 JSON 块、可读文本与 `complete/partial/failed` 状态。重新解析只追加表示版本，当前指针及人工锁属于选择元数据。明确读取历史版本失败时不回退到当前或旧文本；无表示的旧数据只做安全文本投影，不批量回填。

公开读取、重建、锁定／回退和 Agent 候选接口见[内容表示 API](../../../api/0008-story-content-representation.md)。实施与分层验证见 [Task40 walkthrough](../../../../.agents/tasks/40-story-content-representation/walkthrough.md)。

### Publisher

**PublisherMetrics** 是领域侧发布者指标语义：可选可空的 `followers`、`following`、`statuses`、`voteup` 数值和 `reliable`（`high`/`low`/`unknown`）。**Publisher** 有可空 `platformId`、`handle`、`profileUrl`、非空 `name`、`kind` 和可选可空 `metrics`。相同字段在 Workflow/HTTP 中的 wire shape 由[公共合同](../../contracts/0001-public-contracts.md)校验；domain 只负责下述归一化算法。

`normalizePublisher` 不把缺失字段升级为身份：输入为 null/undefined 返回 null；name 不是字符串或 trim 后为空时整个 Publisher 返回 null；文本字段 trim，空白转 null；不在 PublisherKind 集合中的 kind 归为 `unknown`；platformId 缺失保持 null；返回对象总是显式带 platformId、name、handle、profileUrl、kind、metrics，其中 metrics 是输入值或 null。

### TemporalValue 与时间精度

**TemporalPrecision** 为 `second`、`minute`、`hour`、`day`、`week`、`month`、`year`、`unknown`；**TemporalConfidence** 为 `high`、`inferred`、`uncertain`。**TemporalFallback** 记录 `raw`、`lowerBound`、`precision`、`timezone` 和 `confidence`；**TemporalValue** 记录 `exact`（ISO 字符串或 null）、`exactPrecision`（只有 `second` 或 null）和 `fallback`。这些是 domain 语义输入/输出接口；对应的 datetime、nullable 和证据约束由[公共合同](../../contracts/0001-public-contracts.md)在 wire 边界执行。

exact 是可投影的准确时间；fallback 只表达来源文本和一个下界，不等于准确发布时间。代码的所有回推和截断使用 UTC；传入 timezone 只是结果中的记录字符串，不执行时区换算。

### ContentMetrics

**ContentMetrics** 是领域侧指标语义：`values`（可选可空的 likes/views/reposts/comments/collects/score）、`raw: Record<string, string>`、`reliability`（`high`/`low`/`unknown`）和 `capturedAt`。domain 没有独立 metrics 构造函数；现有 Connector 会保留原文本，在去掉逗号后尝试转换为有限数值，至少有一个非空 raw 字段时才建立 metrics，并使用 `reliability: "unknown"` 与当前 ISO 时间。公共 wire schema 只由[公共合同](../../contracts/0001-public-contracts.md)拥有；这里不复制其 Zod 规则。

### 身份、观察、Entry、修订与 Story

- **external key** 是在单个 domain item 上为来源内容选择的稳定字符串；storage 再把 source instance 纳入唯一约束。
- **revision fingerprint** 是内容修订的 SHA-256 十六进制摘要。
- **Observation** 表示一次来源捕获的不可变证据，包含 externalId、externalKey、sourceLocator、URL、捕获时间、来源发布时间及事件类型。当前持久化路径从 item 产生 `create` 或 `update`。
- **Entry** 是同一 Source instance 下由 canonical external key 归并的本地内容身份。
- **Entry Revision** 是 Entry 的追加式内容快照；变化时 revision number 增加，当前指针移动到新快照。
- **Asset** 是附着在修订上的媒体/附件持久投影；领域输入中的 bytes 在 application/storage 边界外置到 Blob 后才进入持久资产 metadata。
- **Story** 是稳定、可编排的规范内容单元（ADR-0006）：一个 Story 承载多个 Entry 的主归属，Story 的展示内容通过版本化 StoryRevision 表达。domain 仍提供 `projectEntryToStory` 作为 ingest 自动创建默认单 Entry Story 的确定性门槛（id=`story:${entryId}`），跨来源归并/merge 由 storage 命令执行；domain 只产生纯函数与投影，不执行 Story 事务。
- **StoryRevisionContent** 是 Story Revision 的当前表示（ADR-0021）：四个基础展示字段（title、可空 summary、核心 kind、可空 subtype）加可选 `timeRange`（`{start: TemporalValue, end: TemporalValue|null}`）与有序 `keyFacts`（`{text, entryId|null}`，上限 `storyKeyFactMaxCount`=20、`storyKeyFactMaxTextLength`=500 字）；`normalizeStoryRepresentation` 是 fingerprint 与持久化共用的归一化（trim、丢弃空文本事实、起点无效则整段为 null）；`fingerprintStoryRevision` 只在扩展非空时追加扩展键，**扩展为空时摘要输入与升级前逐字节相同**，Revision 不做回填。
- **TopicRevisionContent** 是 Topic Revision 的展示字段集合（title、purpose、可空 scope）；`fingerprintTopicRevision` 对这三个字段做确定性 SHA-256 指纹，用于判定 Topic 展示内容的“实质性变化”与 no-op（ADR-0007 决策 1）。Topic 成员角色、membership revision 与 merge 去重语义由 storage 命令执行，domain 只提供角色枚举与指纹纯函数。
- **EntityRevisionContent** 是 Entity Revision 的展示字段集合（`name`、受管 `type`）；`fingerprintEntityRevision` 对这两个字段做确定性 SHA-256 指纹，用于判定 Entity 身份表示的“实质性变化”与 no-op（ADR-0008 决策 2）。Entity 名称别名、Story↔Entity/Entity↔Entity 的 provenance 语义由 storage 命令执行，domain 只提供类型枚举与指纹纯函数。
- **targetTypes** 是用户组织对象的附加目标受管枚举（`story`/`entry`/`topic`），供 Label 附加与后续 Annotation 目标共用；读取侧未知值降级（ADR-0009 决策 1）。**favoriteTargetTypes** 是收藏标记的目标子集（`story`/`entry`）——Topic 本身已是长期容器，不作为收藏目标（ADR-0009 决策 3）。Label/Collection/Favorite 的注册、附加与成员关系由 storage 命令执行，domain 只提供枚举常量，不产生指纹。
- **blockTypes** 是看板区块类型的受管枚举（`feed`/`spotlight`/`source-health`/`topic-list`/`collection`）；写入侧由公共合同校验，读取侧未知值降级为占位（ADR-0010 决策 2）。区块的 config 白名单、持久化与排序由 contracts/storage 执行，domain 只提供枚举常量。**spotlightTargetTypes** 是人工 Spotlight 固定的目标受管枚举（`story`/`topic`）；Workspace/Artifact 留待 Phase 3（ADR-0010 决策 3）。
- **Story subtype 注册表**是 Story 核心 kind 之上的受管取值清单（`storySubtypeRegistry`，ADR-0013）：每个注册项声明 `id`（必须按 `<kind>.<name>` 命名空间化）、所属 `kind`、注册项 `version`、`label`/`description`、状态 `status`（`active`/`deprecated`/`retired`）、声明式 `identityPolicy`（v1 只记录不执行）与 `owner`。v1 首批注册 `media.comic`/`media.anime`/`media.video`。`listStorySubtypes` 只返回 `active` 与 `deprecated` 条目供产品消费；`checkStorySubtype` 是写入侧门槛——`null` 合法，空字符串、未注册、跨 kind 或非 `active` 都返回带原因的拒绝，未知 subtype 的既有数据仍可读取并按核心 kind 降级展示。注册表是代码常量，不建表、不写 migration。
