---
parent: docs/spec/interfaces/0002-product-api-http.md
range: Content query
sealed_at: 2026-10-26
tags: [spec, api-http, content-query]
tokens_est: 4313
---

### Content query

| Method/path | 输入 | 成功输出与分页 |
| --- | --- | --- |
| `GET /feed` | query `cursor?`、`limit?` | `FeedPage`。limit 缺省 20；非数字回退 20，随后 clamp 到 1–100；cursor 交给 repository。按更新倒序返回 Story Feed，nextCursor 是偏移字符串或 null。 |
| `GET /search` | query `text?`（最多 500）、`sourceId?`、`publishedAfter?`、`publishedBefore?`（带 offset 的 ISO）、`labelIds?`、`topicIds?`（逗号分隔 id）、`author?`（最多 200，按发布者 name/handle 子串、大小写不敏感）、`contentKind?`（受管内容形态）、`assetStatus?`（受管资产四态）、`cursor?`、`limit?`（1–100，默认 20） | `SearchPage`，FTS/过滤结果与 rank；label/topic 过滤为 any-of 语义（Story 级标签、active Topic 成员），`author`/`contentKind`/`assetStatus` 为单值等值条件、彼此 AND；`assetStatus` 命中「当前 Revision 的资产里存在该状态」的条目；Zod 解析失败 400。无写副作用。 |
| `GET /entries` | query `sourceId?`、`cursor?`、`limit?`（1–100，默认 50） | `EntryPage`；Zod 解析失败 400。 |
| `GET /stories/:storyId` | path `storyId` | `StoryDetail`：Story 摘要（含 `status`/`replacedBy` 与当前表示的 `timeRange`/`keyFacts`）、可空 `entry`（最近成员，兼容位）、`entries`（全部成员，updatedAt 倒序）、`entities`（关联 Entity 快照列表）与 `topics`（当前 Topic 成员）。旧 merge id 先解析到 canonical Story；split 历史壳保留自身 id 且可零成员；不存在/无当前 Revision 404。 |
| `POST /stories/:storyId/entry-moves` | body `MoveEntryToStoryCommand` | `StoryDetail`；Schema 失败 400，Entry/Story 缺失 404。 |
| `POST /stories/:storyId/revisions` | body `UpdateStoryRevisionCommand` | `StoryDetail`；Schema 失败 400（含 `end` 早于 `start`、事实超 20 条或单条超 500 字），Story 缺失 404，`baseRevisionId` 过期或目标是历史壳 409 conflict，subtype 不是该 kind 的可写注册项 400 `validation_failed`（ADR-0013）。body 的 `timeRange`/`keyFacts` 可选，**省略即清空**（全量提交，ADR-0021 决定 5）；内容无实质变化时 current 指针不动。 |
| `POST /stories/merges` | body `MergeStoriesCommand` | `StoryDetail`；Schema 失败 400，Story 缺失 404，归并自身/已 merge Story/历史壳 409 conflict。 |
| `POST /stories/:storyId/splits` | body `SplitStoryCommand` | `StoryDetail`（历史壳）；Schema 失败 400，Story 缺失 404，后继不足 2 个、映射不属于当前关系、跨后继重复、自关联或已是历史壳 409 conflict（ADR-0012），后继 subtype 不是该 kind 的可写注册项 400 `validation_failed`（ADR-0013）。每个后继可带自己的 `timeRange`/`keyFacts`，未带即为空；壳上的两项不复制给后继（ADR-0021 决定 6）。 |
| `POST /stories/:storyId/user-state-migrations` | body `MigrateStoryUserStateCommand`（目标 Story 与五类对象选择） | `StoryUserStateMigrationResult`（每类 `moved`/`deduped`）；Schema 失败 400，来源或目标 Story 缺失 404，两端不是同一 split 家族、同一 Story、或命名的行不在来源 Story 上 409 conflict（ADR-0020）。来源在 path、目标在 body，形态对齐 `/splits`。 |
| `GET /story-subtypes` | query `kind?`（核心 kind 枚举） | `StorySubtypePage`：受管理 subtype 目录（`active` + `deprecated`，`retired` 不返回）；未知 `kind` 400。只读，不写任何状态。 |
| `GET /topics` | query `cursor?`、`limit?` | `TopicPage`；limit 经 clampLimit，按 Topic `updatedAt` 倒序，nextCursor 为偏移字符串或 null。 |
| `GET /topics/:topicId` | path `topicId` | `TopicDetail`（topic 摘要 + 成员列表，含 removed/tombstone 成员）；旧 merge id 解析到 canonical Topic，不存在 404。 |
| `POST /topics` | body `CreateTopicCommand` | `TopicDetail`；Schema 失败 400，`seedStoryId` 不是有效 Story 404。 |
| `POST /topics/:topicId/revisions` | body `UpdateTopicCommand` | `TopicDetail`；Schema 失败 400，Topic 缺失 404，`baseRevisionId` 过期 409。 |
| `POST /topics/merges` | body `MergeTopicsCommand` | `TopicDetail`；Schema 失败 400，Topic 缺失 404，归并自身/已 merge Topic 409。 |
| `POST /topics/:topicId/members` | body `AddTopicMemberCommand` | `TopicDetail`；Schema 失败 400，Topic/Story 缺失 404。 |
| `POST /topics/:topicId/member-role-updates` | body `UpdateTopicMemberRoleCommand` | `TopicDetail`；Schema 失败 400，Topic/Story 缺失或成员已移除 404。 |
| `POST /topics/:topicId/member-removals` | body `RemoveTopicMemberCommand` | `TopicDetail`；Schema 失败 400，成员缺失 404。 |
| `POST /topics/:topicId/member-restorations` | body `RestoreTopicMemberCommand` | `TopicDetail`；Schema 失败 400，成员缺失 404。 |
| `GET /entities` | query `cursor?`、`limit?` | `EntityPage`；limit 经 clampLimit，按 Entity `updatedAt` 倒序，nextCursor 为偏移字符串或 null。 |
| `GET /entities/:entityId` | path `entityId` | `EntityDetail`（current name/type、aliases、关联 Story 列表、双向关系列表）；不存在 404。 |
| `POST /entities` | body `CreateEntityCommand` | `EntityDetail`；Schema 失败 400（未知 `type`/超长等）。 |
| `POST /entities/:entityId/revisions` | body `UpdateEntityCommand` | `EntityDetail`；Schema 失败 400，Entity 缺失 404，`baseRevisionId` 过期 409。 |
| `POST /entities/:entityId/aliases` | body `AddEntityAliasCommand` | `EntityDetail`；Schema 失败 400，Entity 缺失 404。 |
| `POST /entities/:entityId/alias-removals` | body `RemoveEntityAliasCommand` | `EntityDetail`；Schema 失败 400，Entity 缺失 404。 |
| `POST /story-entity-links` | body `LinkStoryEntityCommand` | `EntityDetail`；Schema 失败 400，Story/Entity 缺失 404。 |
| `POST /story-entity-links/removals` | body `UnlinkStoryEntityCommand` | `EntityDetail`；Schema 失败 400，Story/Entity 缺失 404。 |
| `POST /entity-relations` | body `CreateEntityRelationCommand` | `EntityDetail`；Schema 失败 400，未知关系类型/自环 409，端点 Entity 缺失 404。 |
| `POST /entity-relations/removals` | body `RemoveEntityRelationCommand` | `EntityDetail`；Schema 失败 400，from Entity 缺失 404。 |
| `POST /entry-story-links` | body `LinkEntryStoryCommand` | `StoryDetail`（canonical 目标 Story）；Schema 失败 400，Entry/Story 缺失 404，指向自己的主 Story 409。 |
| `POST /entry-story-links/removals` | body `UnlinkEntryStoryCommand` | `StoryDetail`；Schema 失败 400，Entry/Story 缺失 404；不存在的关系是幂等 no-op。 |
| `POST /entry-relations` | body `LinkEntryRelationCommand` | `EntryDetail`（`fromEntryId` 那一侧）；Schema 失败 400，端点 Entry 缺失 404，自关联或有向反向提交 409（对称类型的反向提交是覆盖写，不是冲突）。 |
| `POST /entry-relations/removals` | body `UnlinkEntryRelationCommand` | `EntryDetail`（`fromEntryId` 那一侧）；Schema 失败 400，端点 Entry 缺失 404；不存在的关系是幂等 no-op。 |
| `GET /labels` | 无 | `LabelList`；按 name 升序，含 `assignedCount`。 |
| `GET /labels/:labelId` | path `labelId` | `LabelDetail`（按类型分组的 `assignedStories`/`assignedEntries`/`assignedTopics`，各含解析后的标题）；不存在 404。 |
| `POST /labels` | body `CreateLabelCommand` | `LabelItem`；Schema 失败 400，重名 409。 |
| `PATCH /labels/:labelId` | body `UpdateLabelCommand`（只有 `name`） | `LabelItem`（改名后的行，含随行读出的 `assignedCount`）；Schema 失败 400，不存在 404，重名 409。**原地改写**：Label 不是 revision 模型，没有版本历史；写 `label.updated.v1`。 |
| `POST /labels/:labelId/removals` | path `labelId` | `UserOrganizationAck`（`action: "label.deleted"`）；不存在 404。 |
| `POST /label-assignments` | body `LabelAssignmentCommand` | `UserOrganizationAck`（`action: "label.assigned"`）；Schema 失败 400（未知 `targetType`），Label 缺失 404，目标 Story/Entry/Topic 缺失 404。 |
| `POST /label-assignments/removals` | body `LabelAssignmentCommand` | `UserOrganizationAck`（`action: "label.unassigned"`）；错误同上；缺失附加为幂等 no-op。 |
| `GET /collections` | query `storyId?` | `CollectionList`；给出 `storyId` 时每项含 `containsStory`。 |
| `GET /collections/:collectionId` | path `collectionId` | `CollectionDetail`（成员 Story 含当前标题与 `addedAt`）；不存在 404。 |
| `POST /collections` | body `CreateCollectionCommand` | `CollectionSummary`；Schema 失败 400。 |
| `PATCH /collections/:collectionId` | body `UpdateCollectionCommand` | `CollectionSummary`；Schema 失败 400，不存在 404。 |
| `POST /collections/:collectionId/removals` | path `collectionId` | `UserOrganizationAck`（`action: "collection.deleted"`）；不存在 404。 |
| `POST /collections/:collectionId/items` | body `CollectionItemCommand` | `UserOrganizationAck`（`action: "collection.item_added"`）；Schema 失败 400，Collection/Story 缺失 404。 |
| `POST /collections/:collectionId/items/removals` | body `CollectionItemCommand` | `UserOrganizationAck`（`action: "collection.item_removed"`）；错误同上；缺失成员为幂等 no-op。 |
| `GET /favorites` | 无 | `FavoriteList`；按加入时间倒序。 |
| `POST /favorites` | body `FavoriteCommand` | `UserOrganizationAck`（`action: "favorite.set"`）；Schema 失败 400（`topic` 等非法目标），目标缺失 404。 |
| `POST /favorites/removals` | body `FavoriteCommand` | `UserOrganizationAck`（`action: "favorite.unset"`）；错误同上；缺失收藏为幂等 no-op。 |
| `GET /annotations` | query `targetType`、`targetId` | `AnnotationList`；目标按 canonical 解析，按 `createdAt` 升序；Schema 失败 400，目标缺失 404。 |
| `POST /annotations` | body `CreateAnnotationCommand` | `Annotation`；Schema 失败 400（未知 `targetType`、空 body），目标缺失 404。 |
| `PATCH /annotations/:annotationId` | body `UpdateAnnotationCommand` | `Annotation`；Schema 失败 400，批注缺失 404。 |
| `POST /annotations/:annotationId/removals` | path `annotationId` | `UserOrganizationAck`（`action: "annotation.deleted"`）；不存在 404。 |
| `GET /saved-views` | 无 | `SavedViewList`；按 `createdAt` 升序。 |
| `POST /saved-views` | body `CreateSavedViewCommand` | `SavedView`；Schema 失败 400（空名称、非法条件）。 |
| `PATCH /saved-views/:savedViewId` | body `UpdateSavedViewCommand` | `SavedView`；Schema 失败 400，不存在 404。 |
| `POST /saved-views/:savedViewId/removals` | path `savedViewId` | `UserOrganizationAck`（`action: "saved_view.deleted"`）；不存在 404。 |
| `GET /boards` | 无 | `BoardList`；按 `createdAt` 升序，含 `sectionCount`。 |
| `POST /boards/ensure-default` | 无 | `BoardDetail`；幂等 seed 默认看板（无任何 Board 时创建热点/精华/信息流三 Section）。 |
| `GET /boards/:boardId` | path `boardId` | `BoardDetail`（sections 与 blocks 各按 position 升序）；不存在 404。 |
| `POST /boards` | body `CreateBoardCommand` | `BoardDetail`；Schema 失败 400（空名称），name 冲突 409。 |
| `PATCH /boards/:boardId` | body `UpdateBoardCommand` | `BoardDetail`；Schema 失败 400，不存在 404，name 冲突 409。 |
| `POST /boards/:boardId/removals` | path `boardId` | `BoardCommandAck`（`action: "board.deleted"`）；级联删除配置树，不触碰内容对象；不存在 404。 |
| `POST /board-sections` | body `CreateSectionCommand` | `BoardDetail`；Schema 失败 400，Board 缺失 404。 |
| `PATCH /board-sections/:sectionId` | body `UpdateSectionCommand` | `BoardDetail`；Schema 失败 400，Section 缺失 404；`position` 提供时重排该 Board 的分区顺序。 |
| `POST /board-sections/:sectionId/removals` | path `sectionId` | `BoardCommandAck`（`action: "board_section.deleted"`）；连带其下 Block；不存在 404。 |
| `POST /board-blocks` | body `CreateBlockCommand` | `BoardDetail`；Schema 失败 400（未知 type、非法 config 白名单），Section 缺失 404。 |
| `PATCH /board-blocks/:blockId` | body `UpdateBlockConfigCommand` | `BoardDetail`；config 按已存 type 重新校验（失败 400），Block 缺失 404。 |
| `POST /board-blocks/:blockId/moves` | body `MoveBlockCommand` | `BoardDetail`；跨 Section 重排并紧凑化原 Section；目标 Section 缺失 404。 |
| `POST /board-blocks/:blockId/visibility` | body `SetBlockVisibilityCommand` | `BoardDetail`；隐藏只改 `visible`，不删除行。 |
| `POST /board-blocks/:blockId/duplications` | path `blockId` | `BoardDetail`；副本插在原块之后，复用同 type/config。 |
| `POST /board-blocks/:blockId/removals` | path `blockId` | `BoardCommandAck`（`action: "board_block.deleted"`）；不删除被引用的内容对象；不存在 404。 |
| `GET /spotlight-placements` | query 可选 `boardId` | `SpotlightPlacementList`（含解析后的 `targetTitle`）；按 `createdAt` 升序。 |
| `POST /spotlight-placements` | body `PinSpotlightCommand` | `SpotlightPlacement`；Schema 失败 400（未知 targetType、缺 boardId），目标或 Board 缺失 404，重复固定为幂等 no-op。 |
| `POST /spotlight-placements/:placementId/removals` | path `placementId` | `BoardCommandAck`（`action: "spotlight_placement.deleted"`）；物理解除；不存在 404。 |
| `GET /entries/:entryId` | path `entryId` | `EntryDetail`（当前 revision、revision 列表、observations）；不存在或无 current revision 404。 |
| `GET /revisions/:revisionId` | path `revisionId` | `RevisionDetail`；不存在 404。 |
| `GET /assets/:assetId` | path `assetId` | HTTP 200 二进制 `StreamableFile`，Content-Type 为保存的 mime type；没有可读取内容 404。响应不是 JSON DTO。 |

Feed/Search/Entry 的 cursor 是当前存储实现的偏移 cursor；非法/负 cursor 在存储层按
0 处理。Search date 仍会经过 contracts 的 offset datetime 校验；存储层无法构造有效
日期时也拒绝。Entry/Revision 只读（唯一的例外是 `entry-relations`，它写的是条目之间的重复/转载关系，不是条目本身）；Story 写操作仅限上述四个编排端点（entry-moves、revisions、merges、entry-story-links），Entity/关系写操作仅限上方
entities/revisions/aliases/alias-removals/story-entity-links/entity-relations 端点，用户组织写操作仅限
labels/label-assignments/collections/items/favorites/annotations/saved-views 端点，看板写操作仅限
boards/board-sections/board-blocks/spotlight-placements 端点，其余路径不在 API 层修改事实。
