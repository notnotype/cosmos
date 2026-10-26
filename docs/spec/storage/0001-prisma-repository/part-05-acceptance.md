---
parent: docs/spec/storage/0001-prisma-repository.md
range: 重建验收、实现与测试锚点
sealed_at: 2026-10-26
tags: [spec, storage, acceptance]
tokens_est: 2290
---

## 重建验收

1. 在隔离空 Data Root 应用六条 migration，构造仓储并调用 `initialize()`；查询 `sqlite_master` 能看到 `entry_search`，`health()` 的 storage/migration 为 `ready`，`close()` 能断开客户端。
2. 创建 Source，连续两次以同一 idempotency key 调用 `createQueuedRun`；两次返回同一 Run，Job 表只有一个关联 Job，DomainEvent 中只有一个对应 `run.queued.v1`。
3. 让 owner A claim 一个 legacy Job 后使其 expiry 过去，再由 owner B claim；A 用旧 token 完成返回 `false`，B 的 lease 才能写入终态。
4. 持久化同 external key 且 fingerprint 不变的两项；第二项返回 duplicate、EntryRevision 数仍为 1，但 metrics/精确时间可更新；改变正文 fingerprint 后 revision 数为 2，Feed/Search 读到最新投影。
5. 持久化含 `saved` Asset 的 item；Asset 有 Blob storageKey 且 `readAsset` 读回原 bytes。执行 Probe Job 后，Entry 数和 Checkpoint cursor 保持不变。
6. 用错误 expected revision 写 Workflow checkpoint；返回 `committed=false`、不覆盖当前 cursor/revision 并生成 superseded event；用当前 revision 写入时 revision 恰加一并生成 committed event。
7. 对新 Entry 执行 Feed、FTS Search 和 DomainEvent replay；Feed/Search 返回正确 page/nextCursor，events 严格按 sequence 升序，latest sequence 等于最大 event sequence。
8. 用隔离 fake 让 `SELECT 1` 或 heartbeat 查询失败；`health()` 返回 `storageStatus = failed`，并记录对应阶段而不是返回 ready。
9. 在空库调用 `ensureDefaultBoard()` 两次：两次返回同一 Board（热点/精华/信息流三 Section 与各自初始 Block），`listBoards` 只有一条；删除该 Board 后再调用，观察创建了新的默认 Board。创建重名 Board 观察 `BoardNameConflictError`。
10. 给 `feed` Block 提交白名单外键或给 `collection` Block 缺 `collectionId`，观察 ZodError 且树未变化；提交未知 type 观察拒绝；`duplicateBlock` 后观察同 config 副本插在原块之后；`setBlockVisibility(false)` 后树中该块 `visible=false` 仍存在；`deleteBlock` 后观察其绑定的 SavedView 仍可读取。
11. 在隔离库里 seed 一条扩展前形状的既有 Story（Revision 的两列为 NULL、fingerprint 按升级前的四字段算法算出），不改任何字段调用 `updateStoryRevision`，观察不追加 Revision、current 指针不动且读回的两项为空；给同一 Story 设值、原样重复提交、再省略两项提交，观察每次实质变化只加一条 Revision、清空那条的两列为 NULL、原样重复提交是 no-op。

## 实现与测试锚点

- `packages/storage-prisma/src/index.ts:53-110`：StorageRoots、Prisma client、Data Root containment；`:113-166`：仓储构造、initialize、close。
- `packages/storage-prisma/src/index.ts:168-757`：Source、Run、Step、legacy Job、claim/renew/complete/reset；`:760-1268`：raw/asset Blob、Observation/Entry/Revision/Story/FTS、Workflow ingest item 与 checkpoint CAS；`:1288-1847`：Run completion、Feed/Search/Entries/Story/Entry/Revision/Event/Asset/heartbeat/health；`:1849-2252`：快照投影、attempt projection、Job/Workflow fence、DomainEvent helper。
- `packages/storage-prisma/prisma/schema.prisma`：所有模型、字段、索引、唯一约束和关系；migration 按时间戳前缀顺序应用，Phase 1 从 `20260808003247_phase1_foundation` 起，Phase 2 依次为 `20260907120000_story_revision_versioning`、`20260907130000_story_merge_alias`、`20260908000000_topic_domain_v1`、`20260908120000_entity_relation_v1`、`20260908140000_user_organization_v1`、`20260909100000_board_section_block_v1`、`20260909120000_spotlight_placement_v1`、`20261015000000_provider_model_configuration`、`20261018160000_workflow_activity_dispatch_fence`（forward-only，只增不改）。
- `packages/storage-prisma/src/index.test.ts:58-219`：Data Root、Observation/Revision/Asset/Story/FTS；`:221-332`：metrics 不新建修订；`:334-409`：legacy Job 幂等、租约、事件；`:411-462`：Activity Job 与 legacy claim 隔离；`:464-566`：claim 竞争、max attempts、health 日志；`:568-822`：worker/probe/connector failure/schedule；`:823-912`：Workflow checkpoint 双 fence/CAS。
- `packages/storage-prisma/src/user-organization-domain.test.ts`：Label 唯一命名/指派计数/详情标题解析、`(labelId, targetType, targetId)` 幂等附加与目标存在性、Collection 成员幂等与 `containsStory` 投影、Favorite 幂等与 Story 详情投影，以及 Story merge 的 move/collision 迁移（`collection.item_merged.v1`/`label.assignment_merged.v1`）。`entity-relation-domain.test.ts` 同形覆盖 Entity 命令与 `story_entity.merged.v1`。`entry-story-evidence.test.ts` 覆盖 Entry↔Story 关联的幂等/覆盖写、自关联与缺失目标错误、双向投影、merge 重定向与 self-link 清理、move 后的冗余删除，以及旧库 upgrade 后新表可用。`board-domain.test.ts` 覆盖默认 Board 幂等 seed、Board 唯一名与缺失错误、按类型 config 白名单（含未知 type 与非法 config）、跨 Section move 重排与 visible 切换、duplicate 原位副本、删除 Block 不删除被绑定的 SavedView，以及 Spotlight 的幂等 pin/解除、目标标题解析、缺失目标/看板错误与 Story merge 的 placement 重定向（含同 Board 冲突丢弃）。

- `packages/storage-prisma/src/story-human-protection.test.ts`：PRD §12 第 4 条 / LIB-003 的回归锚点——人工编辑过表示的 Story 在来源重发布该 Entry 后标题/kind/时间范围/关键事实逐项不变、人工 merge 出的多 Entry Story 在成员被重发布后同样不变、未编辑的 Story 仍跟随来源、`producer` 按写入方取值（人工命令 `human`、投影 `system`）且冻结只在本该写入时记 `story.representation_projection_skipped.v1`（ADR-0028）。`story-revision-producer-migration.test.ts` 单独钉住回填判据：只把有匹配 `story.revision_created.v1` 事件（按 `storyId` + `revision` 配对）的 Revision 标为 `human`，同 Story 其它 revision 的事件不误伤。

- Provider/model 配置的仓储在独立文件里，不挂在 `index.ts` 的巨型类上：`packages/storage-prisma/src/model-provider-query-repository.ts`（读投影与 operation 收据查询）、`model-provider-credential-repository.ts`（凭证发布与垃圾清理，`canDelete` 在事务内断言没有 Provider 还指向该 ref）、`model-provider-removal-repository.ts`（单事务删除，引用检查与删除同事务，见上表）、`configured-model-repository.ts`（模型 CRUD 与 CAS，`create` 把 P2002 翻成 `already_exists`、`delete` 把 P2003 翻成 `in_use`）、`model-configuration-lock.ts`（跨进程排他锁，`fs-native-extensions`）、`provider-discovery-reader.ts`。对应的隔离测试：`model-provider-query-integration.test.ts`、`model-provider-credential-repository.test.ts`、`model-provider-removal-integration.test.ts`（真实 sqlite + 42 迁移，覆盖被引用拒绝、版本过期、删除后 `PRAGMA foreign_key_check` 干净）、`configured-model-repository.test.ts`、`model-configuration-lock.test.ts`、`provider-model-migration.test.ts`。这些测试都在隔离数据根下生成自己的 Prisma client，不读写用户数据。
