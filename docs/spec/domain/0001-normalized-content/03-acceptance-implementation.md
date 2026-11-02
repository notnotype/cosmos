---
parent: ../0001-normalized-content.md
range: 重建验收与实现与测试锚点（原文第 177–205 行）
sealed_at: 2026-11-02
tags: [domain, acceptance, implementation, tests]
tokens_est: 1975
---

[返回主文](../0001-normalized-content.md) · [概念与定义](01-concepts.md) · [行为与输入输出](02-behavior-input-output.md)

## 重建验收

1. **External ID 优先**：给定 externalId 为 `"  guid-1 "`，即使 title/URL 存在，也观察到 `external:guid-1`，且不访问网络或写存储。
2. **URL 与无 URL fallback**：给定无 externalId 但 URL 为 `" https://example.test/a "`，观察到 `url:https://example.test/a`；给定二者皆无且 title/content/exact/sourceLocator 有值，观察到 `fallback:` 后 64 位小写十六进制摘要，且不因 URL 缺失返回 null。
3. **Fallback 稳定性**：给定相同 title/content/exact/sourceLocator（对象键顺序不同），两次 external key 相同；给定 sourceLocator 值变化，观察摘要变化；不允许使用未排序对象 JSON 导致顺序敏感。
4. **Revision fingerprint**：给定只改变 contentText 的两个输入，观察 fingerprint 不同；给定相同六字段，观察 fingerprint 相同；改变 metrics、assets、raw payload、fallback 或 updatedAt 不应改变该函数输入之外的 fingerprint。
5. **Publisher 清洗**：给定空白 platformId、空 handle、null profileUrl 和有效 name，观察返回 platformId/handle/profileUrl 均为 null、metrics 为 null；给定未知 kind 观察 kind 为 `unknown`；给定空 name 观察整体返回 null，不生成 platform ID。
6. **Exact 时间优先**：给定数值 `1_786_170_123` 与 raw `3小时前`，观察 exact 为 `2026-08-08T06:22:03.000Z`、precision 为 second 且 fallback 为 null；不应先使用 raw。
7. **时间单位精度**：给定 now=`2026-08-10T12:00:00.000Z` 和 `3小时前`，观察 fallback precision=hour、lowerBound=`2026-08-10T09:00:00.000Z`；给定 `2周前`，观察 precision=week、lowerBound=`2026-07-27T00:00:00.000Z`；给定 `07-29湖南`，观察 precision=day、lowerBound=`2026-07-29T00:00:00.000Z`。不得把 lowerBound 作为 exact。
8. **时间降级**：给定非法 exact 且 raw 为空，观察返回 null；给定未知 raw，观察 fallback precision=unknown、confidence=uncertain、lowerBound 等于传入 now 的 ISO；给定 timezone=`Asia/Shanghai`，观察其只出现在 fallback 字段，不改变 UTC 回推结果。
9. **Temporal projection**：给定 exact TemporalValue，观察 `temporalProjection` 返回 exact；给定 fallback-only value，观察返回 null；storage 的 publishedAt 不得把 fallback lowerBound 当准确 DateTime。
10. **Story projection**：给定 entry-1/revision-1/title，观察 id=`story:entry-1`、kind=document、subtype/summary 为 null；给定 contentKind=video，观察 kind=media；给定显式 kind，观察其优先于 contentKind；不额外生成非八个字段。
11. **修订持久语义**：在 storage 测试中给定同 source/run/external key 的重复观察，观察 duplicateObservation=true 且不追加 revision；给定 fingerprint 改变，观察 revision number 增加 1 且 current 指向新修订；给定 fingerprint 不变但 exact 时间变化，观察只更新允许的时间/metrics字段，不产生内容 revision。
12. **纯函数边界**：调用所有 domain 导出函数并比较调用前后的数据库、Blob Root、网络请求和日志计数，观察均无 domain 直接副作用；进程重启后不应从 domain 模块恢复任何 durable state。
13. **用户组织枚举**：给定 `targetTypes`，观察其为 `story`/`entry`/`topic`；给定 `favoriteTargetTypes`，观察其为 `story`/`entry` 且是 `targetTypes` 的子集；domain 不导出 Label/Collection/Favorite 的事务或指纹函数。
14. **看板区块枚举**：给定 `blockTypes`，观察其为 `feed`/`spotlight`/`source-health`/`topic-list`/`collection`；给定 `spotlightTargetTypes`，观察其为 `story`/`topic`；domain 不导出 Board/Section/Block 的写入事务或 config 校验。
15. **Story subtype 注册表**：给定 `storySubtypeRegistry`，观察每个 id 以 `<kind>.` 开头、kind 属于 `storyKinds`、version 为正、owner 非空；给定 `checkStorySubtype`，观察 `null` 与 `media.comic`（kind=media）通过，空字符串/未注册/跨 kind/`retired` 分别返回 `empty`/`unregistered`/`kind_mismatch`/`not_active`；给定 `listStorySubtypes({kind:"media"})`，观察返回注册表中 media 的 `active`/`deprecated` 条目且 `retired` 不出现。

## 实现与测试锚点

- `packages/domain/src/index.ts`：`storyKinds`、`topicMemberRoles`、`entityTypes`、`entityRelationTypes`、`targetTypes`、`favoriteTargetTypes`、`contentKinds`、`publisherKinds`、`temporalPrecisions`、`TemporalFallback`/`TemporalValue`/`Publisher`/`ContentMetrics`/`NormalizedAssetInput`/`NormalizedIngestItem`/`StoryRevisionContent`/`TopicRevisionContent`/`EntityRevisionContent` 类型；`deriveExternalKey`、`fingerprintEntryRevision`、`fingerprintStoryRevision`、`fingerprintTopicRevision`、`fingerprintEntityRevision`、`normalizePublisher`、`createTemporalValue`、`temporalProjection`、`mapContentKindToStoryKind`、`projectEntryToStory`。
- `packages/domain/src/index.ts`：`parseExactTimestamp`、`parseTemporalFallback`、`stableStringify` 是重建时间精度、UTC 和 external key 稳定性的内部锚点。
- `packages/domain/src/index.test.ts`：ingestion identity 测试覆盖 external id、无 URL fallback key、内容变化 fingerprint、Publisher 缺 platform id、exact numeric timestamp、`3小时前`、`07-29湖南`、`2周前`、stable story id 和 video→media；topic/entity/user organization 三个 describe 分别锁定受管枚举与指纹 no-op 语义。
- `plugins/rss/src/index.ts:243-322`：`parseRssXml` 的 RSS 字段到 NormalizedIngestItem 映射；`:366-380` 的 enclosure metadata asset。
- `plugins/collectors/src/index.ts:433-524`、`:527-610`、`:730-779`：Bilibili/AI HOT item、metadata asset、ContentMetrics 的来源映射。
- `packages/application/src/index.ts:231-254`：IngestConnector 端口；`packages/application/src/workflow-ingest.ts:351-417`：JSON item 与 BlobRef 往返。
- `packages/storage-prisma/src/index.ts:806-1166`：`persistIngestItemInternal` 的 external key/fingerprint、duplicate/revision、exact time 和事务投影；`:1489-1699`：Entry/Story/Revision/Observation 读取投影。
- `packages/storage-prisma/prisma/schema.prisma:137-249`：Observation、Entry、EntryRevision、Asset、Story、StoryRevision 持久模型字段和关系。
