# Cosmos 信息模型、相关推荐与持续工作区

> 文档版本：Draft v0.12（设计版本；历史变更由 Git 管理）
>
> 当前实现核对：2026-10-29，代码基线为仓库 HEAD `354e9f9936c7bdb7fda9acd6b4e018deae8b779c`
>
> 产品共同语言：[`../../CONTEXT.md`](../../CONTEXT.md)
>
> 总体架构：[`0001-cosmos-foundation.md`](0001-cosmos-foundation.md)
>
> 原始需求：[`../requirements/0001-original-requirements.md`](../requirements/0001-original-requirements.md)
>
> Workflow Runtime：[`.agents/tasks/04-workflow-runtime/README.md`](../../.agents/tasks/04-workflow-runtime/README.md)

本文专门回答四个问题：

1. 一条外部消息进入 Cosmos 后，哪些对象属于基础信息层？
2. “同一件事”和“与这件事相关”如何分开？
3. Story、Topic、Timeline、热点、精华、Artifact 和原 `Feature` 应如何划界？
4. Cosmos 第一版如何做可解释的聚类与推荐，而不把所有判断交给 LLM？

本文是当前信息领域模型的详细真相源。总体架构只保留摘要和跨模块约束，避免同一套定义在多处漂移。

## 分册索引

本文件按提案 4.3 广域设计拆分为分册(每册 ≤30 KB,封口后只读);主文档保留本轮结论、架构不变量与下方索引。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-02-04.md](0002-information-model/part-02-04.md) | §2–4 概念校准、基础信息层与四种容易混淆的判断 | 19.3 KB |
| [part-05-10.md](0002-information-model/part-05-10.md) | §5–10 组织模型:Topic、推荐、热度、Workspace、关系模型与示例 | 23.5 KB |
| [part-12-14.md](0002-information-model/part-12-14.md) | §12–14 迁移、后置压力测试问题与变更记录 | 10.1 KB |

## 当前实现切片（代码基线）

本主文同时记录设计合同；本节是截至代码基线 `354e9f9936c7bdb7fda9acd6b4e018deae8b779c` 可从代码与已合入规格确认的运行边界，不把下方长期模型当作已交付能力：

- 固定 Source ingest/probe 负责把 `Observation`、`Entry`、`EntryRevision`、Asset 和最小主 Story projection 写入持久层；重复内容、无实质变化和人工 Story Revision 的保护规则以 [`spec/storage/0001-prisma-repository/part-01-domain-model.md`](../spec/storage/0001-prisma-repository/part-01-domain-model.md) 为准。
- Story 的人工编排已包括主归属移动、Revision 更新、merge、split、Entry–Story 关联和 split 后用户状态迁移；`StoryRevision` 的 `timeRange`、`keyFacts` 与 producer 参与当前合同。Topic 已支持人工创建、Revision、merge、成员角色维护和可恢复移除；Entity、Entry relation、Board/Section/Block 与手工 Spotlight placement 也有当前存储与 API 合同。
- `Entry.storyId` 在数据库中可为空；“每个 Entry 有主 Story”在当前切片中是 ingest projection/领域目标，不是数据库层强制约束。merge 的旧标识通过 Story alias 解析，split 历史壳与后继通过 Story replacement 表达，两者不能混为同一关系。
- 当前没有可据此宣称已交付的 Workspace/Artifact 产品模型、自动 Topic 维护、Topic relation/层级、自动推荐与 ranking、自动 Spotlight policy/Trend/TTL、Feed impression/read-state、完整 Agent 预算与权限策略、Publication/Delivery 或 Knowledge/Research workflow；这些仍按下文及分册标为设计目标或后置切片。实际 API 读写范围以 [`spec/interfaces/0002-product-api-http/part-03-content-query.md`](../spec/interfaces/0002-product-api-http/part-03-content-query.md) 为准。

## 1. 本轮结论

此前 `Feature` 同时承担了事件聚类、长期话题、Agent 维护、生成文件、交互任务和热点展示，已经成为没有稳定边界的“万能容器”。本轮把它拆成三层：

```text
信息语义层：Entry -> Story -> Topic + Relationship
加工体验层：Workspace -> Artifact Revision + Interaction State
展示决策层：Timeline View / Spotlight / Feed / Board
```

核心决定（长期设计合同；不等同于当前全部已实现能力）：

1. `Entry` 是用户可读的最小来源内容；`Observation` 是内部不可变采集证据。
2. `Story` 是每个 Entry 的上层规范内容单元，通过稳定核心 `kind` 和受管理、可扩展 `subtype` 区分形态，例如 `media.comic`、`media.anime`；event kind 的成员判定必须严格。
3. `Topic` 围绕一个问题或目标持续组织多个 Story，成员判定允许主观，但不直接收录 Entry。
4. “相关推荐”不等于 Story 聚类。Jeff Dean 的两次不同动态可以相关，但不是同一个 Story。
5. `Timeline` 是视图；`Spotlight` 是展示决定；“精华”是策展区域，三者都不是新的内容实体。
6. `Artifact` 是一次版本化输出。
7. 原 `Feature` 正式改名为 `Workspace`，表示长期、可更新、可交互的体验容器。
8. Workspace 不直接吞入消息；它引用 Topic、Story、Saved View 或 Collection，并通过 Workflow/Agent 维护。
9. 每个 Entry 默认属于一个主 Story，单 Entry Story 是合法状态；Topic、Workspace、Spotlight 和 Feed 等上层概念以 Story 为内容单位。
10. Agent 只有在至少两个不同 Story 构成持续问题，或命中用户明确跟踪规则时，才默认自动创建 Topic。
11. 第一版聚类与相关推荐不使用 embedding。
12. Topic 不自动过期，人工归档后置；自动 Spotlight 使用可续期 TTL，人工固定可以不设 TTL。
13. 人类、Agent 和系统按协作者建模，每次修改都记录 actor 与 revision；第一版保持简单能力边界。
14. 第一版预算只实现全局日预算、单次 Run 上限和紧急保留预算。
15. 核心 Story kind 通过受管理 subtype 注册表扩展；注册项声明所属 kind、版本、展示信息和身份规则。
16. Story split 保留旧 Story 的历史壳，并通过 `replaced_by[]` 指向多个后继 Story；旧 ID 不会被模糊重定向。
17. v1 不建立 Topic 父子层级；跨 Topic 组织使用带类型的 Relation、标签或 Workspace/Board。
18. 一个 `(Topic, Story)` 只有一个当前成员角色；角色变化通过 revision history 记录，不在 v1 保存并列 assertion。
19. Story 身份稳定，标题、摘要、关键事实和时间范围通过不可变 Story Revision 表达，并由当前 Revision 指针选择当前表示。
20. Feed 的曝光、打开、已读、隐藏和“不感兴趣”默认以 `(用户, Story, surface)` 记录；Entry 交互在展开具体信源后单独记录，收藏和批注可指向 Story 或 Entry。
21. Agent 可以移除未被人类确认的自动 Topic 成员；人类明确加入或确认的成员需要提出移除建议，移除通过可恢复 revision 完成。
22. Workspace 输入采用多对多 binding，可有一个主要锚点；Workspace 不要求只绑定一个 Topic，也可以独立存在。
23. Spotlight 分离趋势、重要性、紧急性和用户兴趣信号，使用版本化 policy、迟滞阈值、可续期 TTL 和人工覆盖。
24. Workspace Update/Run 使用 `queued`、`running`、`waiting`、`succeeded`、`failed` 和 `cancelled` 状态；更新期间保留上一成功版本，成功后才原子发布。
25. 人类接受的 Story/Workspace 内容字段可以被保护；Agent 先生成候选 Revision，不能静默覆盖受保护字段。
26. Story 的已读状态保留 `last_seen_revision_id`，新 Revision 产生 `updated_since_last_seen`，不抹掉历史已读事实。
27. merge 将当前用户状态解析到 canonical Story；split 不把收藏、隐藏、反馈或 Topic membership 自动复制给全部后继。
28. Spotlight 人工固定/排除绑定到具体 target placement，直到用户解除；不同 kind 共用 policy 合同，只调整权重和阈值。
29. v1 和默认产品合同面向单个本地用户；actor/revision 为未来协作保留扩展位，但不建设多人同步和多租户。
30. 当前单用户阶段按最大产品权限运行，Agent 可以代替用户执行 GUI 中可执行的操作；不建设审批 UI 或细粒度权限模型。未来多人、远端或不可信扩展再增加独立权限策略。
31. 第一版不建设细粒度权限 UI 或不可信插件沙箱，只运行用户明确安装的本地可信扩展。
32. Phase 1 首条真实 Connector 采用 RSS/RSSHub，并配套 fixture Connector。

**v0.12 增量（2026-09-07）**：Story 域模型 v1 已接受（[`story-domain-v1` Proposal](../proposals/story-domain-v1.md)）。本文 §4 的完整目标按 v1 切片排定实施顺序：先交付用户显式编排（Entry 主归属移动、Story Revision 更新、Story merge canonical/alias），自动聚类与 Knowledge Workflow、Story split、`evidence_for`/`mentions` 跨 Story 引用后置；上述长期目标不因 v1 未实现而失效。

→ §2–4 概念校准、基础信息层与四种容易混淆的判断 已归档:[part-02-04.md](0002-information-model/part-02-04.md)

→ §5–10 组织模型:Topic、推荐、热度、Workspace、关系模型与示例 已归档:[part-05-10.md](0002-information-model/part-05-10.md)

## 11. 架构不变量

1. Observation 永不被聚类、推荐或 Agent 结果原地改写。
2. Entry 来源身份不会因转载去重或 Story 聚类而丢失。
3. 每个 Entry 有一个主 Story；Story membership 按 kind 表达规范内容身份，宽泛相关性使用 Relation 或 Topic。
4. Topic 不自动过期；成员增删、merge 和未来人工归档必须可解释、可撤销、可审计。
5. Ranking 结果是带上下文和 policy/version 的决策，不是内容永久属性。
6. Timeline、Spotlight、精华和 Feed 是展示或策展角色，不制造内容副本。
7. Topic、Workspace、Spotlight 和 Feed 等上层体验以 Story 为内容单位，不直接拥有 Entry；Artifact provenance 仍可引用精确 Entry Revision。
8. Artifact Revision 提交后不可修改；更新产生新 Revision。
9. Agent 可以像协作者一样维护 Topic/Workspace；第一版通过简单能力边界、Run 预算、Command 和 provenance 约束。
10. 人类、Agent 和系统的修改都记录 actor 与 revision；用户标签、批注、Topic 修正和 Interaction State 不因重新分析而丢失。
11. Story/Topic merge 保留 canonical ID、旧 alias、历史 revision 和所有引用。
12. Story split 保留旧历史壳和 `replaced_by[]`，不把旧 ID 模糊重定向到单一后继。
13. v1 不把 Topic 组织成父子树；Topic Relation、标签和 Workspace/Board 承担跨 Topic 导航。
14. 每个 `(Topic, Story)` 只有一个当前成员角色，历史变更保存在 membership revision history。
15. Story 的当前标题、摘要和关键事实由不可变 Story Revision 表达；历史引用不会随当前 Revision 更新。
16. Feed 曝光和主要反馈以 Story/surface 为粒度，Entry 交互只在展开具体信源后记录。
17. Agent 不会静默移除人类明确加入或确认的 Topic 成员。
18. Workspace 输入是多对多 binding；主要锚点不表示所有权，也不是必填。
19. Spotlight 自动决策保留分离信号、policy/version、迟滞和 TTL，人工覆盖优先。
20. Workspace 的维护运行状态、内容新鲜度、生命周期和 Interaction State 不能压进同一个 `status`。
21. Workspace Update 的失败或取消不会替换最近一次成功发布的内容；候选内容必须在成功时原子发布。
22. 人类接受的字段保护优先于 Agent 自动更新，Agent 候选 Revision 不会静默覆盖受保护字段。
23. `last_seen_revision_id` 只增加“有更新”投影，不删除用户过去的已读记录。
24. merge 后当前用户状态解析到 canonical；split 后用户状态和 Topic membership 不自动扇出到所有后继。
25. Spotlight 人工覆盖绑定具体 target placement，并持续到用户解除；kind 差异通过共享 policy 的配置表达。

→ §12–14 迁移、后置压力测试问题与变更记录 已归档:[part-12-14.md](0002-information-model/part-12-14.md)

## Story 内容表示增量设计（Task 40）

已接受的目标与分层合同见 [Story 内容目标设计](../aegis/specs/2026-10-08-story-content-representation-design.md) 和 [内容表示架构](../aegis/specs/2026-10-08-story-content-representation-architecture.md)，实施与验证由 [Task 40](../../.agents/tasks/40-story-content-representation/README.md) 承接。此处记录已接受设计，不表示全部能力已实现。

- Observation 继续唯一拥有原始采集证据；EntryRevision 的来源事实保持不可变。其 `currentRepresentationId` 是可变的表示选择元数据，不构成新的来源修订。
- ContentRepresentation 是 EntryRevision 下独立持久化、版本化的阅读投影；正文为保留语义顺序的受控块 JSON。重新解析新增表示，保留原表示与版本化证据引用。
- Application 统一拥有规范化、质量选择、读取投影与访问策略；Storage 原子保存表示与当前指针并验证归属；Web 和 Agent 不自行解析来源正文或直接读取 Blob。
- 本增量细化 §1 决定 30 的 Agent 边界：单用户最大产品权限不代表生成结果可以自动成为正式事实。三项 Story 分析默认产生候选，接受后才通过正式命令写入并审计；原始证据与媒体字节通过受管读取 scope 检查，不默认注入模型输入。
- 旧 `contentText` 合同和可解释 legacy 回退保留；不批量回填旧数据，不执行任意 HTML，不抓取外链全文。

## 分册勘误登记

分册封口后只读；对已封口分册的更正登记在此，不改写分册正文。

| 日期 | 位置 | 更正 | 理由与决策 |
| --- | --- | --- | --- |
| 2026-09-15 | [`part-05-10.md`](0002-information-model/part-05-10.md) §4.6 中 split 后用户状态的语义 | 补充：split 后用户状态仍不自动扇出（§11 不变量 24 不变），但现在有显式的家族内迁移命令，反向调用即撤销 | ADR-0012 的 Revisit Gate 首项（用户状态的显式迁移、批量与撤销）已处理，稳定结论见 ADR [`0020`](../adr/0020-story-split-user-state-migration-v1.md)；§5.4「可逆操作或补偿记录」在 split 场景的落地即该命令。分册正文不改写。 |
| 2026-09-15 | [`part-05-10.md`](0002-information-model/part-05-10.md) §4.6 的历史壳写边界 | 补充：迁移用户状态是历史壳上唯一允许的写操作；改 Revision、merge、再次 split 仍被拒绝 | 同 ADR [`0020`](../adr/0020-story-split-user-state-migration-v1.md) 决定 7：迁移是 ORG-020 要求的补偿操作，不是对壳内容的改写。分册正文不改写。 |
| 2026-09-24 | [`part-02-04.md`](0002-information-model/part-02-04.md) §5.4 末段的「字段级保护 + 候选 Revision」 | 补充落地口径：**判据是写入者身份**（`StoryRevision.producer`，服务端按写入方赋值），v1 保护粒度是**整条当前 Revision**（含 `Story.kind`），自动结果**按写入方分两类降级**——确定性投影（ingest 的 Entry→Story 投影）跳过并记事件，派生分析（Knowledge Workflow）只能产生候选 Revision；字段级掩码与接受/拒绝界面仍属 ORG-019 | 分册正文只写了「可以形成字段级保护」，没有判据、没有数据、也没有测试，而 Phase 2 已经存在一条会覆盖人工编辑的自动写入路径。稳定决定见 ADR [`0028`](../adr/0028-user-truth-protection-v1.md)（Proposal [`user-truth-protection-v1`](../proposals/user-truth-protection-v1.md) accepted），§11 不变量 22 不变、只被细化。分册正文不改写。 |
| 2026-10-29 | [`part-12-14.md`](0002-information-model/part-12-14.md) §13 第4项「显式 state migration command」 | 显式 Story user-state migration 已有合同、API 与行为测试；仍需单独完成批量、撤销、真实运行压力和端到端验收，故“已实现”与“待验证”并存 | 当前切片已交付命令边界，但分册该条保留的是后置压力问题；主文当前实现切片列出已交付合同，不能把存在测试文件等同于本次执行通过。分册正文不改写。 |
