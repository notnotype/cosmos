# Proposal：Story 域模型 v1（Phase 2 首切片）

> 状态：accepted
>
> 日期：2026-09-07
>
> 需求真相源：[`../requirements/0002-product-requirements.md`](../requirements/0002-product-requirements.md)（Phase 2 定义、ORG-001/004/006/008/011/012/013/014/016/017/020、BRD-007）与 [`../requirements/0001-original-requirements.md`](../requirements/0001-original-requirements.md)
>
> 关联：信息模型 [`../architecture/0002-information-model.md`](../architecture/0002-information-model.md)（Draft v0.11）、总体架构 [`../architecture/0001-cosmos-foundation.md`](../architecture/0001-cosmos-foundation.md)、Phase 1 Task [`../../.agents/tasks/02-rss-ingestion/README.md`](../../.agents/tasks/02-rss-ingestion/README.md)（已 close）、公共术语 [`../../CONTEXT.md`](../../CONTEXT.md)

## 问题

PRD Phase 2 的完成标准第一句是“用户能打开一个多来源 Story，查看时间线和相关内容”。当前实现无法表达这一行为：

- domain 只有“最小 Story projection”（`projectEntryToStory`，id 固定为 `story:${entryId}`），每个 Entry 在 ingest 事务内自动获得一个专属 Story；不存在把多个 Entry 归入同一 Story 的公共命令或语义。
- Prisma 已有 `Story`/`StoryRevision` 表和 `Entry.storyId` 外键，但 `StoryRevision` 没有 revision 编号、fingerprint 或 actor/理由，无法表达不可变版本链；没有 alias/redirect 或 merge 记录；kind/subtype 只是从 Entry 的 contentKind 单向推导。
- Product API 只有单 Story 详情读取，没有“把 Entry 移入/移出 Story、更新 Story Revision、merge 两个 Story”的写入口。
- Web 的 Story 面板（Task 02 已验收）只展示单 Entry Story 及其 Entry/Revision/媒体证据。

架构和信息模型已确认：Topic、Board Block、Saved View、Feed、Spotlight 等上层体验都以 Story 为内容单位（ORG-008）。不先落地 Story 域模型，Phase 2 的组织与看板只能继续建立在“单 Entry projection”上，Topic/看板切片都会反向承担本应由 Story 拥有的归并和身份语义。

本 Proposal 把 Phase 2 首切片冻结为“Story 域模型 v1”：让 Story 成为稳定、可版本化、可人工编排的规范内容单元，但**不包含自动聚类、Knowledge Workflow 或 Topic**。

## 已拍板输入（用户 2026-09-07 对齐）

| 输入 | 决定 |
| --- | --- |
| Phase 1 收尾 | Docker/Compose、发布部署、真实公网长时定时抓取、非 Windows 平台 smoke、长时间故障恢复验收划线为 Phase 2 后置债，不阻塞本 Proposal |
| Phase 2 首切片 | Story 域模型；不是可配置看板 UI，也不是 Connection/多采集计划 |
| v1 归并方式 | 本切片默认“显式人工归并”，不引入 LLM 自动聚类或 Knowledge Workflow |

## 目标与非目标

### 目标

1. Story 成为稳定、可编排的内容单元：一个 Story 可承载多个 Entry（含跨来源），每个 Entry 只有一个主 Story；单 Entry Story 仍是合法且默认的形态（ORG-001、ORG-011）。
2. Story 的展示内容（title、summary、kind、subtype）通过不可变 Story Revision 表达并维护当前指针；实质性变化才追加 revision，历史 revision 可读（ORG-017）。
3. 提供显式公共写入口（Product API command + Application 命令），让用户可执行：把 Entry 移入/移出 Story、更新 Story Revision、把两个 Story merge 为一个 canonical Story；merge 永久保留旧 Story id 的 alias/redirect 与历史 revision（ORG-012）。
4. 维持既有 ingest 行为不回退：新 Entry 继续默认获得自动 Story；既有 `story:${entryId}` 数据可读、Feed/搜索/详情 API 形状兼容；Story kind/subtype 保持核心枚举受管并允许未知 subtype 降级展示（ORG-013）。
5. 提供最小多来源 Story 详情页，作为本切片的浏览器验收面。

### 非目标

- 自动聚类、同事件识别、去重建议和 LLM/确定性 Proposal pipeline（ING-013、ORG-021、ORG-022）——本切片只做用户显式编排。
- Topic 与 Topic Membership、Entity/Relationship、Label/Annotation/Collection/Saved View——后续 Phase 2 切片。
- Story split 的完整生命周期（`replaced_by[]` 多后继与状态迁移）——单独切片；本切片保证不产生需要 split 才能纠正的数据形状。
- 一个 Entry 作为证据关联多个其它 Story（`evidence_for`/`mentions` 跨 Story 引用）——后置；本切片只表达主归属。
- 可配置 Board/Section/Block、Spotlight 策略、多分区 Feed、动态插件 subtype 注册表、多用户权限模型与 embedding。

## 当前行为与证据

- `packages/domain/src/index.ts:3`：`storyKinds = ["event", "document", "media", "thread"]`；`:118` `MinimalStoryProjection` 只有 8 个字段（含固定 `story:${entryId}` 派生 id）；`:248-268` `projectEntryToStory` 按 contentKind 推导 kind、缺省 document、subtype/summary 为 null。domain 没有 Story 修改、move、merge 或 revision 规则。
- `packages/storage-prisma/prisma/schema.prisma:249-270`：`Story`（id、kind、subtype、currentRevisionId、entries）与 `StoryRevision`（storyId、title、summary、createdAt）已存在；`Entry.storyId`（:199、:207）是唯一主归属外键，`onDelete: SetNull`。`StoryRevision` 没有 revision 编号、fingerprint 或 actor 字段；无 alias、无 merge/redirect 表、无 membership 审计。
- `packages/storage-prisma/src/index.ts` `persistIngestItemInternal`：在 ingest 事务内 upsert Story 与 current StoryRevision（spec [规范化内容的状态转换](../spec/domain/0001-normalized-content/02-behavior-input-output.md#状态转换) 1/5、`docs/spec/storage/0001-prisma-repository.md`）；repository 另有 Entry/Story 读取投影。
- `packages/contracts/src/index.ts:358-369`：`storyDetailSchema` 已存在（单 Story + Entry 列表语义待核对）；transport-http 提供详情读取；没有 Story 写命令 schema。
- Web：Story 面板展示单 Entry Story → Entry/Revision/Asset（Task 02 断网与媒体验收已覆盖）；没有“归并/编辑/merge”入口。
- 相关验收证据：domain Story projection 测试、Prisma repository 集成测试、浏览器 ingest E2E（打开 Story）以及组件实验室 StoryPanel fixture。

## 方案与取舍

### 1. 领域层：Story 从“projection”升级为“语义 + 命令/投影分离”

保留 `projectEntryToStory` 作为 ingest 自动创建默认主 Story 的确定性门槛（v1 不引入自动候选/接受）。在 domain 新增 Story 编排语义：

- Story Revision：title/summary/kind/subtype 的实质变化才追加 revision；与 EntryRevision 同口径使用确定性 fingerprint，变化判定不含 actor、时间等非展示字段。
- Move Entry：把 Entry 的主归属从 Story A 移到 Story B；单事务内校验目标 Story 存在、保留 Entry 自身 identity/revision/Asset 不动。
- Merge Story：指定 canonical Story 与一个或多个 obsolete Story；obsolete 的所有 Entry 主归属移到 canonical，obsolete 保留为 alias/redirect，旧 Story/StoryRevision 历史不删除。
- Kind/subtype：v1 保持核心 kind 枚举受管（与 `storyKinds` 一致）并允许 `subtype: string | null`；未知 subtype 读取时按核心 kind 降级展示。动态插件注册表后置，不建立第二套“注册表”机制。

取舍：自动归并、Proposal/接受流程全部后置，v1 的跨来源 Story 只由用户显式执行——成本最低、不引入不可信派生写入；代价是“同事件聚合”体验要等 Knowledge Workflow 切片。

### 2. 持久化与迁移：forward-only，StoryRevision 版本化 + alias 记录

预计改动（以 Task 细化为准）：

- `StoryRevision` 增加 `revision`（int，与 `(storyId, revision)` 唯一）、`fingerprint`，并为 actor/理由保留可空列或事件引用；backfill 时把既有每个 Story 的当前 Revision 回填为 revision 1。
- 新增 merge/redirect 记录（alias 表或 Story 上保留旧 id 映射），merge 后旧 Story id 的读取解析到 canonical 且不删除历史。
- `Entry.storyId` 继续作为主归属唯一真相，不新建并行 membership 表；编排动作在事务内同时落审计/领域事件。

取舍：主归属保留单外键而不是新建多对多 membership 表，避免“两套归属真相”对账；跨 Story 证据引用后置。代价是单个 Entry 在本切片内仍只能属于一个 Story，符合 ORG-011。

迁移验证三态：fresh DB、既有 master 库 upgrade、既有 `story:*` 数据读取/详情不回退；Prisma migration 只增不改，禁止删除或改写历史行。

### 3. 公共边界：Product API command + Application 命令，先不引入新 Workflow 类型

Story 编排是单机本地事务 + 审计，不产生外部副作用，首版以“Product API command → Application 命令 → repository 事务 → 领域事件”落地，**不创建新的 durable Workflow/Action 类型**。与 Knowledge Workflow（未来自动归并）的边界是：自动路径必须走 Workflow/Proposal，人工路径走 command；二者最终都通过同一 Story domain 语义写入。

待 Task 细化的命令形态（版本化、幂等、CAS on Story revision、输入校验先以 `unknown` 收口）：

- `story.move-entry`：移动 Entry 主归属；
- `story.update-revision`：更新 Story 展示内容并递增 revision（无实质变化 no-op）；
- `story.merge`：合并 Story 到 canonical；
- 读取扩展：Story 详情返回多 Entry 成员与当前 Revision，保留现有读取字段兼容。

### 4. Web 最小验证面

Story 详情页从“单 Entry 详情”扩展为“Story 成员列表 + 当前 Revision + 每个 Entry 的来源证据”；提供对应操作入口（先以简单按钮/命令表单落地，视觉打磨不属本切片验收）。生产行为与 API 合同同步进 `docs/spec/`，组件实验室登记对应场景。

## 影响

- **产品/API**：新增 Story 写命令与详情读取扩展；既有 Feed/Story 读取路径保持兼容。公开 DTO 增加 actor/理由等只出现在写命令或审计投影，不扩大单用户权限模型。
- **数据**：Prisma migration 对 `StoryRevision` 版本化与 merge alias 落地；既有数据只回填 revision 1，不重写 Entry.storyId、不删除 Observation/Entry/Revision/Asset。
- **公开合同**：`contracts` 新增/修改 Story 命令与详情 schema；`storyKinds` 核心枚举保持稳定。
- **安全**：Story 编排按本地单用户最大权限执行（沿用既有边界），不引入审批 UI；写入口参数白名单化，禁止绕过 kind/subtype 校验。
- **迁移/回滚**：migration forward-only；merge 是显式用户动作，不做自动历史改写；回滚只回退代码路径，已 merge 数据保留 alias 可解析。
- **发布**：本切片不涉及发布与部署（后置债）。

## 验收草案（设计通过后归 Task）

- **domain focused**：Story Revision fingerprint/no-op/递增规则；kind/subtype 校验与未知 subtype 降级；move-entry 与 merge 的纯语义（canonical 选择、alias 保留、历史 revision 不删除）。
- **storage/迁移**：fresh DB、master 旧库 upgrade、既有 `story:*` 数据回填后读取不回退；move/merge 在单事务内完成且 Entry/Revision/Asset 不动；重复/并发命令按幂等与 revision CAS 拒绝或重放。
- **contracts/API focused**：Story 命令 Zod 校验、幂等键、CAS 冲突、白名单投影；Story 详情返回多 Entry 成员。
- **浏览器**：两个受控来源各自录入后，用户在 Story 详情把第二个 Entry 归入第一个 Story → 详情显示多来源；编辑 Story 标题后出现新 Revision 且历史可查；merge 两个 Story 后旧 URL 仍可打开并指向 canonical。
- **明确不运行**：Docker/Compose、发布部署、真实公网长时定时、非 Windows 平台 smoke、长时间故障恢复（后置债，见顶部状态文档）。

## 对稳定文档的预期改动（接受后执行）

- `docs/requirements/0002-product-requirements.md`：ORG-001/011/012/017 等从“Phase 2 待实现”收敛为 v1 已验证边界描述（保留原始措辞与验收意图）。
- `docs/architecture/0002-information-model.md`：把 Story 域模型从“设计草案”更新为已冻结 v1 边界（主归属 vs 证据引用、Revision 规则、merge alias、split 后置）。
- `docs/adr/`：新增一篇 Story 域模型 v1 ADR，沉淀稳定决定：主归属单外键、StoryRevision 版本化、merge canonical/alias、自动聚类与 Knowledge Workflow 后置。
- `docs/spec/`：domain/0001（Story 语义与 revision 规则）、contracts/0001（新 DTO）、storage/0001-prisma-repository（迁移与读写）、interfaces/0002 与 0005（API 与 Web client）同步；`docs/testing/README.md` 补充测试数据边界。
- 新建 Phase 2 Task（编号由维护者分配）记录实施切片；本 Proposal 状态 draft → accepted 前不修改任何代码或稳定文档。

## 决策记录

| 日期 | 决策 | 决策者 |
| --- | --- | --- |
| 2026-09-07 | Phase 1 残留验收（Docker/Compose、发布部署、真实公网长时定时、非 Windows smoke、长时故障恢复）划线为 Phase 2 后置债，不阻塞 | 用户 |
| 2026-09-07 | Phase 2 首切片 = Story 域模型，v1 先做显式人工归并，不做自动聚类/Knowledge Workflow | 用户 |
| 2026-09-07 | **接受三项默认建议**：保持 ingest 自动单 Entry Story + 显式人工归并（不引入 LLM 自动聚类）；Story Revision 仅在 title/summary/kind/subtype 实质变化时递增；merge 进首切片、split 后置；主归属继续由 `Entry.storyId` 表达 | 用户（评审接受） |
