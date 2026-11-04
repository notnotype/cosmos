# Cosmos 总体架构设计

> 文档版本：Draft v0.25（设计版本；历史变更由 Git 管理）
>
> 当前实现核对：2026-10-29，代码基线为仓库 HEAD `354e9f9936c7bdb7fda9acd6b4e018deae8b779c`
>
> 原始需求真相源：[`../requirements/0001-original-requirements.md`](../requirements/0001-original-requirements.md)
>
> 产品需求：[`../requirements/0002-product-requirements.md`](../requirements/0002-product-requirements.md)
>
> 初始调研：[`../research/2026-08-06-daily-digest-research.md`](../research/2026-08-06-daily-digest-research.md)
>
> `nb-memory` 调研：[`../research/2026-08-08-nb-memory-research.md`](../research/2026-08-08-nb-memory-research.md)
>
> 信息领域模型：[`0002-information-model.md`](0002-information-model.md)
>
> API 与 DTO 草案：[`../api/README.md`](../api/README.md)
>
> API 边界 ADR：[`../adr/0003-service-worker-api-boundaries.md`](../adr/0003-service-worker-api-boundaries.md)
>
> 已合入实现规格：[`../spec/README.md`](../spec/README.md)

本文是可持续调整的总体设计，不是不可修改的最终合同。用户的新需求先逐字追加到 requirements，再在本文中解释、建模和调整；稳定且改回成本高的决定再提炼为 ADR。
本文正式使用 `Workflow`。旧文档中的 `Flow` 只作为原始需求措辞或历史迁移说明保留，不再作为现行架构合同。

## 分册索引

本文件按领域拆分为分册(每册 ≤30 KB,封口后只读);主文档保留当前决定(§19)与架构不变量(§21)。
按章节定位内容:先查下表,再读对应分册;§20(核心边界结论与后置决定)与 §22(变更记录)已归档,后续变更条目追加于本文件末尾「变更记录(续)」。

| 分册 | 章节 | 大小 |
|---|---|---|
| [part-01-03.md](0001-cosmos-foundation/part-01-03.md) | §1–3(结论、目标与边界、架构原则) | 18.9 KB |
| [part-04.md](0001-cosmos-foundation/part-04.md) | §4(Source、Trigger、Workflow 与 Action) | 15.6 KB |
| [part-05-06.md](0001-cosmos-foundation/part-05-06.md) | §5–6(持久化事件与任务运行时、采集层：Observation 没有 URL 假设) | 20.9 KB |
| [part-07-12.md](0001-cosmos-foundation/part-07-12.md) | §7–12(信息库领域模型、检索与查询、采集相关性与推荐系统、Agent、Artifact 与 Workspace、看板架构、Pub) | 19.6 KB |
| [part-13-17.md](0001-cosmos-foundation/part-13-17.md) | §13–17(数据所有权与存储、模块与仓库布局、公开合同、安全、隐私和平台边界、使用场景映射) | 21.1 KB |
| [part-18-20.md](0001-cosmos-foundation/part-18-20.md) | §18–20(实施路线、核心边界结论与后置决定) | 16.8 KB |
| [part-22.md](0001-cosmos-foundation/part-22.md) | §22(变更记录) | 13.9 KB |

## 已接受、部分实现：Provider/model 产品配置

用户已接受 [Provider/model 配置](../proposals/connection-credential-entry-v1.md)。目标所有权为数据库 Provider/model 配置、Provider 独占 SecretStore 引用、模型型 Connection 单选已有模型；可信 Worker 按次解析并执行发现/生成，保存不外呼。详细接口与恢复边界见 [Draft 合同](../api/0009-provider-model-configuration.md)。已落地的部分：Provider/模型创建与编辑、Provider 删除（含引用检查与本地凭证清理）、凭证写入与清理补偿、同步模型发现、模型型 Connection 选择、`agent.invoke@2` 执行链路。编辑 Provider 前的受影响连接查询不新增服务端端点，由界面用连接列表与模型列表自行聚合。这已替代原单 Worker 部署 profile 与 Connection.secretRef 模型凭证路径：Worker 不再读取 `COSMOS_AGENT_*`、也不再注册 `agent.invoke@1`，模型与凭证一律按调用时的 Connection 解析。普通非模型连接和 SecretStore 明文文件合同保留。

## 19. 当前决定

以下条目是长期设计合同；只有分册“当前实现与设计合同”明确列出的部分属于当前代码切片。固定 Ingest、API manifest-only、Worker executable、Worker Admin 和本地 SQLite/Data Root 见 [`0001-cosmos-foundation/part-01-03.md`](0001-cosmos-foundation/part-01-03.md)；Gateway、多主机、独立 Migrator、Knowledge/Research、完整 Agent/Harness、Workspace/Artifact 与自动策展仍是目标或待验证。封口分册若保留早期切片口径，以本主文、架构入口及 spec/代码为准，正式更正走同级 [`ERRATA.md`](0001-cosmos-foundation/ERRATA.md)。

以下决定进入当前 v0.19 基线，但后续需求仍可通过记录理由调整：

1. Source、Trigger、Workflow、Action 分离。
2. URL 为可选字段；结构化 origin locator 承担来源定位。
3. Observation 不可变，Entry 通过 Revision 表达来源变化。
4. Story 与 Topic 分开；Story 是带 kind 的规范内容单元，Topic 表示目的驱动的长期范围。
5. Artifact 与 Workspace 分开；Workspace 保存长期体验，Artifact 保存版本化产物。
6. Timeline 是视图；热点是 Spotlight 展示决定；精华是 Board 策展角色。
7. 看板与底层内容解耦，Block 通过 ID、Workspace、Saved View 或 Query 引用内容。
8. Agent 使用普通 Action/Run 合同和配置能力范围。
9. 第一阶段采用 Prisma + 本地 SQLite + Blob/Artifact 文件存储；SQLite 专用能力集中在受控 SQL Adapter。
10. 看板优先，推送后置，但保留 Publication/Delivery 边界。
11. 每个 Entry 默认拥有一个主 Story，允许单 Entry Story；Topic、Workspace、Spotlight 和 Feed 等上层体验使用 Story，不直接使用 Entry。
12. Topic 只收录 Story；Agent 自动创建 Topic 后默认启用独立 Maintenance Binding。
13. 第一版聚类和相关推荐不使用 embedding。
14. Agent 自动创建 Topic 需要至少两个不同 Story，或命中用户明确跟踪规则。
15. Topic 不自动过期，人工归档后置。
16. 人类、Agent 和系统按协作者记录 actor、revision、理由与关联 Run。
17. 第一版预算使用全局日预算、单次 Run 上限和紧急保留预算，超预算时降级为确定性规则。
18. `active`、Board 可见性、Spotlight 和订阅拆成独立 Binding/Placement/Subscription。
19. 自动 Spotlight 使用可续期 TTL，人工固定可以不设 TTL。
20. 第一版保留 actor/revision/理由/Run 审计，复杂权限与冲突处理后置。
21. 一个 Entry 只有一个主 Story，但可以作为证据关联多个其它 Story。
22. Story/Topic merge 使用 canonical ID，并保留旧 alias/redirect、历史 revision 和引用。
23. Story subtype 通过受管理注册表扩展；注册项声明核心 kind、版本、展示信息和身份规则，核心 kind 合同保持稳定。
24. Story split 保留旧 Story 历史壳，并以 `replaced_by[]` 指向全部后继；旧 ID 不模糊重定向到单一后继。
25. v1 不建立 Topic 父子层级；Topic Relation、标签和 Workspace/Board 负责跨 Topic 组织。
26. 一个 `(Topic, Story)` 只有一个当前成员角色，历史变化保存在 membership revision history。
27. Story 当前标题、摘要、关键事实和时间范围使用不可变 Story Revision，并由 `current_revision_id` 选择当前表示。
28. Feed 的 impression/open/read/hide/not interested 默认按 `(用户, Story, surface)` 记录，Entry 交互在展开信源后补充。
29. Agent 只能直接移除未被人类确认的自动 Topic 成员；人类确认成员需要提出移除建议。
30. Workspace 输入使用多对多 binding 和可选主要锚点，不要求一个 Workspace 只绑定一个 Topic。
31. Spotlight 使用分离信号、版本化 policy、迟滞阈值、可续期 TTL 和人工覆盖。
32. Workspace 更新运行态与生命周期、内容新鲜度、Board 可见性和 Interaction State 分开。
33. Workspace Update 使用 `queued`、`running`、`waiting`、`succeeded`、`failed` 和 `cancelled`；失败/取消保留上一成功版本，成功时原子发布。
34. 人类接受的 Story/Workspace 字段可以保护；Agent 先生成候选 Revision，不能静默覆盖受保护字段。
35. Story Read State 保存 `last_seen_revision_id`，新 Revision 只派生“有更新”，不删除已读历史。
36. merge 将当前用户状态解析到 canonical；split 不自动将用户状态和 Topic membership 扇出到全部后继。
37. Spotlight 人工固定/排除绑定具体 target placement，直到用户解除；不同 kind 共用 policy 合同。
38. v1 和默认产品合同面向单个本地用户；未来协作不破坏 actor/revision 合同，但当前不建设多人同步和多租户。
39. 当前单用户阶段知识管理者和 Agent 按最大产品权限运行，不建设审批 UI 或细粒度权限模型；未来再叠加远端/多人/不可信扩展的权限策略。
40. 第一版不建设细粒度权限 UI 或不可信插件沙箱，只运行用户明确安装的本地可信扩展。
41. Phase 1 首条真实 Connector 使用 RSS/RSSHub，并配套 fixture Connector。
42. 初步技术基线为 React + Next.js App Router、Tailwind、shadcn/ui、React Hook Form、Zod、NestJS、Prisma + SQLite；开发使用 Bun，生产使用 Node。
43. 服务器部署优先，同时为客户端模式和客户端与服务分离模式保留兼容边界；三种模式共用 Service Endpoint、Command、Query、Event 和 SSE Transport。
44. Phase 1 直接使用 `pi-ai`；`neuro-agent-harness` 独立去领域化演进，稳定后通过 ModelRuntime、SessionStore、Profile 和 Capability Adapter 接入；sidecar 不属于 Harness Core。
45. Desktop Shell 的具体技术后置；Docker/Compose 作为服务器交付形态的初步封装，不能改变领域和 Transport 合同。
46. Phase 1B 的来源身份使用版本化 `SourceDefinitionManifest.ref`，manifest 显式提供 `connectorId` 与 operation；旧 `Source.kind` 只在迁移和运行时兼容期间保留，新 Product API 不接受 kind，也不允许任意 connector override。
47. Phase 1B 已有受管 Bilibili `hot`、`feed` 与其它 manifest operation；新增场景必须通过新的配置合同和标准化测试进入 Registry。
48. Phase 1B 的 AI HOT 只调用固定公开 endpoint，并使用服务返回的 cursor；通用 HTTP 代理能力不属于 Collector 核心。
49. API 不执行外部采集；Probe 和 Ingest 都先创建持久 Job，由 Worker 负责执行、租约、重试和恢复。
50. Probe 是 dry-run，不写 Observation、Entry、Asset，不推进 checkpoint；Probe 结果通过 Job Snapshot 查询。
51. OpenCLI 的浏览器登录态由 OpenCLI/Browser Bridge 管理，Cosmos 只保存 profile 引用，不保存 Cookie、Token 或密码。
52. 运行控制采用 `Job + Workflow` 组合；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达转换为脚本语义并落到同一持久 Runtime。
53. 知识管理者是共享 `nb-memory` 之上的高权限系统角色，可以通过 Web Chat、`cosmos cli` 和 ingest/research Workflow 参与系统操作；它不是单一 Session。
54. 个性化配置由 Agent 记忆、Cosmos 观察到的用户行为和未来其它信号共同生成；当前不要求逐字段 provenance，也不独立建模平台推荐偏好信号。
55. `nb-memory` 作为共享记忆/知识库通过 Adapter/Port 接入 Cosmos；它不替代 Cosmos 的 Observation、Entry、Run、Job 或 Workflow Runtime。
56. Workflow 是 Cosmos 的主动行为核心；Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 都使用同一脚本优先 Runtime，并通过 `kind + tags` 做轻量分类。
57. Ingest 本身是一种 Workflow；外部来源事实先完成 Observation/Entry/Revision/Asset 入库，不等待 LLM。
58. Entry → Story 是可由用户或 Agent 配置的 Knowledge Workflow；Research 不直接耦合 Ingest，而是由分析信号产生 Research Request，再由 Trigger 启动独立 Research Workflow。
59. Research Workflow 可以查询 Cosmos 信息库并访问外部渠道；研究结果重新经过 Observation → Entry，不直接写入 Story。
60. `NormalizedIngestItem` 是采集标准化输出合同；当前 manifest 已使用受管的 `fetch`/`search` 等 operation，通用的 SourceOperation 产品管理面仍是设计目标，不与 `SourceDefinitionManifest.ref -> connectorId` 映射混用。
61. `externalId` 和 `Publisher.platformId` 都允许为空；作者 ID 缺失不能阻止录入，也不能用作者名伪造内容身份。
62. `ContentKind` 与 `StoryKind` 是两个不同层次的枚举，必须通过显式映射投影。
63. `TemporalValue` 优先保存证据层精准 UTC 时间；fallback 只在 exact 缺失时产生，精度提升不创建 Revision。
64. ContentMetrics 是 Entry 当前快照；指标变化不创建 EntryRevision，Publisher 和 ContentKind 参与内容 Revision 指纹。

65. `nb-workflow` 是 Cosmos Worker 使用的规范脚本 Kernel；Cosmos 不再长期维护第二套 Activity identity、fingerprint、replay、map/all、wait 和 Child Workflow 语义。
66. `nb-workflow` 持久化是可选 Backend 能力；Memory、Local Durable 和 Distributed Durable 必须显式声明不同的恢复能力，能力不足时在 Run 启动前拒绝。
67. Cosmos Workflow Host 持有 Run/Journal、TaskStore、Job/Attempt/Lease、Outbox、Worker 和领域事务的 durable truth；`nb-workflow` 不依赖 Cosmos 领域。
68. `Activity` 是 journal 恢复单元，`ActionDefinition` 是能力合同，`Job` 是可领取任务，`Attempt` 是带 lease 的一次执行；`Step` 是可选逻辑/UI 投影。
69. `TaskStore` 是 Job 状态、retry 和 lease 的唯一权威；`WakeupBus` 只负责通知，Redis Streams 是可选 Adapter，不是 Job 或领域终态真相。
70. Local Durable 默认 SQLite + 自适应 polling；真正多主机目标是 PostgreSQL + S3/MinIO + 可选 Redis，不通过共享 SQLite 网络盘实现。
71. API 是 manifest-only 控制面，Worker 是 executable 执行面；当前本地切片已满足这两个边界，独立 Migrator 仍是目标运维单元，Compose 仍由 API 启动命令执行 migration。生产部署、多主机和 Gateway 语义仍未完成或未验证。
72. Agent 能力属于可选 `nb-workflow` Extension，映射到版本化的 `agent.invoke@1`／`@2`；Core 不依赖 Harness。当前可信 Worker 无条件注册 `agent.invoke@2`：没有启动期 profile、没有部署开关，能否调用由调用时那条 Connection 决定，模型、地址与凭证按 Connection → Model → Provider → SecretStore 每次解析。`agent.invoke@1` 仅作为兼容端口、输入输出契约和 catalog 条目保留，没有进程注册；当前外部 Provider 的长期可用性仍未验证。
73. Task 39 已交付 `agent.invoke@2` 的独立 pi-ai Adapter 与 Provider/Model/Connection/SecretRef 解析链路；`agent.invoke@1` 的 Invocation Port/Fake Adapter 只保留为兼容合同和既有验证依据，不应再描述为当前 Agent 首个生产切片。Harness、`nb-memory`、Artifact、Workspace、Knowledge 和 Research 产品能力仍后置（Proposal [`agent-invocation-v1`](../proposals/agent-invocation-v1.md)、ADR [`0030`](../adr/0030-agent-invocation-v1.md)）。
74. 并发控制分为 Worker slot、多 Worker、Workflow 内并发、资源级限流和 CollectionPlan overlap policy；任一层都不能替代 TaskStore lease/fencing。
74. 对外边界拆为 Product Service API、Worker Admin API 和 Worker Gateway API；三者使用独立消费者、路径和版本。
75. Worker Gateway v1 使用 HTTPS long-poll，先由 SQL TaskStore 原子 claim 再返回 Attempt；未来 WebSocket 只能作为相同语义的 Transport Adapter。
76. ActionDefinition 使用 `host`、`trusted_worker` 和 `remote_worker` execution placement；领域写入不经普通远程 Worker。
77. Direct Worker 与 Gateway Worker 必须共享 TaskStore/Attempt/Receipt conformance；Worker Admin 不提供同步 Job execute，Gateway 不持有第二套终态。

78. 第一条可用产品 E2E 必须从 Web 配置入口开始；首版只开放 `rss` schema 驱动入口，用户填写实际 RSS URL；`fixture-rss` 只用于集成/管线测试。
79. 配置产品流程采用“校验 → 测试未保存配置 → 保存为停用 Source → 单独启用”；默认定时 30 分钟、测试立即执行、用户可修改或关闭定时、已排队 Run 使用创建时配置快照作为实现建议，具体调度合同待冻结。
80. v1 媒体边界已冻结（media-boundary-v1 Proposal 与 ADR-0005）：媒体发现范围为 RSS 条目自身 enclosure 与正文媒体标签，不抓取 `webUrl` 外部全文；Application 统一媒体获取并受控下载图片，Connector 只纯提取、不直接接触 Data Root。按来源的图片开关、单文件/单次 Run 预算、失败重试和保留期已在 v1 的受限范围落地；外链图片、视频本体、历史回填、单条数量上限、全局默认值环境化和 `local` 作用域键仍后置或待验证。
81. v1 数据分层冻结：domain bytes/Asset → Application Workflow BlobRef → Storage Asset metadata → Product API 受控下载；公共 4 态不变，降级原因以可空 `errorMessage` 透传（无 migration）；媒体失败不自愈且保留原文外链，Connector 不直接访问 Data Root。
82. SourceInstance 以版本化 `sourceDefinitionRef` 作为唯一业务身份；manifest 显式提供 `connectorId`，旧 `kind` 只在迁移和运行时兼容期间保留，并由 manifest 映射约束，不允许新 API 写入或隐式 kind→ref 推导。
83. SourceInstance 持久化单调整数 `revision`，公开投影提供不透明 `revisionId`；创建从 revision 1 开始且默认停用，配置更新和启用状态变更都必须使用基于 revision 的 CAS。过期 revision 返回 `conflict`，不得使用 `updatedAt` 代替。
84. 旧数据迁移先按已登记的 kind→sourceDefinitionRef/operationId 显式映射预检；未知 kind、非唯一映射或 manifest 不可用时阻断迁移并报告，不静默生成 ref。
85. `CollectionPlan` v1 落地为真实对象：用户可见的独立采集计划持有连接引用、触发器、媒体预算、计划级 checkpoint 与状态命名空间，v1 与采集目标一对一；目标继续承载内容身份（Entry/Observation 归属不变）。重叠策略 v1 只实现与现状等价的一种，本节第 73 条预留的 `queue`/`replace`/`allow`/`merge` 随后续切片；迁移按 expand／backfill／read switch／contract 四步，contract 单独部署与授权（Proposal [`collection-plan-v1`](../proposals/collection-plan-v1.md)、ADR [`0023`](../adr/0023-collection-plan-v1.md)）。
86. AUT-004 的剩余触发形态 v1 落地为 `webhook` 一种：Phase 2 只交付 Webhook——入口以 `TriggerBinding` 为定位对象（`planId` 优先、否则按来源）、持有不可猜的不透明标识、凭证走 SecretStore 并沿用明文-at-rest 的既有边界、请求必须有幂等与限流与体积上限与脱敏、触发的原因/输入/时间/定义版本四项证据落 Run 既有位置；`event`／`condition`／`dependency` 记 Phase 3，`poll` 不单列类型（轮询由 `schedule` + 持久 checkpoint 表达）。§4.1 预留的七种 Trigger 类型不因此改写（Proposal [`trigger-forms-v1`](../proposals/trigger-forms-v1.md)、ADR [`0024`](../adr/0024-trigger-forms-v1.md)）。
87. 一个采集计划可以持有多个 `TriggerBinding`：唯一约束为「每来源／计划、每种类型一行」（`(sourceId, kind)`／`(planId, kind)`），schedule 行与 webhook 行可共存，各自持有 `enabled` 与 `revision`；调度只读 schedule 行，计划的调度写入口只动 schedule 行；计划读投影不暴露触发器 id（ADR [`0025`](../adr/0025-multi-trigger-per-plan.md)，取代 ADR-0018 决定 1 的单绑定口径）。

## 21. 架构不变量
后续实现和重构必须持续验证：

1. 新算法不能改写原始 Observation。
2. 外部信息没有 URL 时仍能完整录入、查询、关联和显示。
3. 重新抓取和重启不能无界地产生重复 Entry、Job 或推送。
4. 用户标签、批注、收藏、Board 和交互进度不因重分析或 Artifact 刷新丢失。
5. 每个自动摘要、关系、Story 归并和 Artifact 都能追溯 producer/version/evidence。
6. Connector、Action、Agent 和 Board 插件不直接依赖核心数据库表。
7. Feed 在 LLM 不可用时仍能工作。
8. 已保存内容在断网时仍能被搜索和阅读；未保存媒体清楚显示状态。
9. 删除看板区块不会删除其引用的信息。
10. 外部副作用结果未知时不会被伪装为成功或自动当作失败重放。
11. Story split 不会让旧链接或历史 Artifact 被静默导向错误的单一后继。
12. v1 的 Topic 关系不会被实现成隐含的父子树。
13. 同一 Topic 中同一 Story 的当前角色唯一，历史修改可审计。
14. Story 当前表示更新不会改写历史 Artifact、Publication 或批注引用的 Revision。
15. Feed 反馈的粒度与实际被排序、展示的 Story 保持一致。
16. Agent 不会静默移除人类明确加入或确认的 Topic 成员。
17. Workspace 的输入 binding、主要锚点和身份相互独立。
18. Spotlight 人工覆盖在解除前不会被自动策略反向修改。
19. Workspace 更新失败不会把上一次成功内容替换为半成品。
20. 人类接受的字段保护不会被 Agent 自动更新绕过。
21. Story 的“有更新”投影不会伪造或删除历史已读记录。
22. split 不会把收藏、隐藏、反馈或 Topic membership 无提示地复制到所有后继。
23. Spotlight 人工覆盖在具体 Placement 上生效，不会意外改变其它 Board 的展示。
24. 第一版不会因为未来多人协作设想而引入多租户、同步或复杂权限系统。
25. 当前单用户阶段不建设审批拦截；未来权限策略不得绕过既有 Service/Workflow/Capability 合同。
26. 本地可信扩展仍不能直接依赖核心数据库表，未来隔离升级不需要重写扩展合同。
27. UI 和扩展不直接访问 Prisma、SQLite、Data Root 或 Blob/Artifact Root；跨宿主访问统一经过版本化 Transport。
28. Phase 1 的 Story 是最小 projection，不把跨来源聚类、merge、split 和 Topic 维护误报为已完成能力。
29. Worker 即使与 API 分进程运行，仍与应用层共享持久 Job/Lease/Idempotency 合同，不依赖进程内内存状态恢复。
30. API 不直接执行外部 Connector；所有 Probe/Ingest 外部副作用都经过持久 Job 和 Worker lease。
31. Connector 不接受任意 OpenCLI command、任意 HTTP endpoint、Header 或认证信息作为用户配置。
32. Probe 不写入 Observation、Entry、Asset 或 checkpoint。
33. Adapter 不直接持久化 Secret；凭证通过 SecretRef/SecretStore 访问，非秘密运行状态通过命名空间化 StateStore 访问。
34. 一个 Connection 可以复用多个 SourceInstance，但每个采集计划的 Trigger、Workflow、checkpoint、预算和错误状态必须可区分。
35. LLM 或其它 Action 请求的子任务必须持久化父子关系、因果 Event、能力范围、预算和收口状态，不能只依赖进程内内存。
36. LLM 生成的分类、Story 聚类、关系、推荐特征和 Artifact 结果必须保留 producer/version/evidence，并不能伪装成来源事实。
37. 外部平台推荐流是候选发现来源，不等于 Cosmos 的最终 Ranking；普通 Feed 在 LLM 不可用时仍能工作。
38. Job 与 Workflow 必须共享同一持久 Runtime；脚本式 Workflow 是底层执行形态，Graph/IR/Comfy 类表达不能形成绕过租约、重试和恢复的第二执行路径。
39. 当前单用户阶段知识管理者可以代替用户执行 GUI 操作，但不能绕过 Service/Capability/Workflow/Job 边界或直接访问核心数据库。
40. 多个知识管理者分身共享 `nb-memory` 长期记忆；`nb-memory` 不替代 Cosmos 的 Observation、Entry、Run、Job 和外部来源证据。
41. 个性化程序配置可以由记忆和行为观察重新生成，不要求每个配置字段都复制一般派生结果的 producer/version/evidence 账本。
42. 平台推荐信号当前不作为独立的 Cosmos 用户偏好模型输入；平台推荐流仍不能直接等同于用户偏好。
43. Ingest Workflow 保存外部来源事实时不等待 LLM；LLM 或 Knowledge Workflow 失败不能丢失已提交的 Observation/Entry。
44. Entry → Story 的处理策略可以由用户或 Agent 配置为不同 Knowledge Workflow，但任何策略都不能覆盖旧 Observation。
45. Research 不直接嵌入 Ingest；研究请求、触发原因和 Research Workflow Run 必须可追踪、可重试和可恢复。
46. Research Workflow 发现的新来源内容重新经过 Observation → Entry，不直接把未经入库的外部结果写入 Story。
47. Cosmos 与 `nb-workflow` 不能各自维护一套 Activity identity、fingerprint 和 replay 真相；脚本语义只有一个规范 Kernel。
48. 可选持久化 Backend 必须公开 durability capabilities；Memory Backend 不能被描述成支持进程重启、多 Worker 或 durable timer。
49. TaskStore 是 Job/Attempt/lease 的唯一权威；WakeupBus 消息丢失或重复不能改变任务最终可执行性和 owner。
50. Worker 收到 Redis 或其它 Wakeup 后仍回 TaskStore claim；任何领域写入继续在 SQL transaction 中验证当前 lease。
51. API 不加载或执行 Connector/Action executable；可信 Worker 独占 executable，远程 Worker 不直接访问数据库和 Data Root。
52. Migrator 的成功是 API 与 Worker 生产启动的前置条件，不由 API 生命周期隐式拥有。
53. Workflow 内并发、Worker slot、多 Worker、资源限流和 CollectionPlan overlap policy 都必须有界，且不能绕过幂等和 lease fencing。
54. `nb-workflow` Core 不依赖 Harness；Agent Invocation/Session 的恢复不能与 Cosmos Job durable truth 形成双重所有权。
55. Product Service API 不返回 Worker/Job lease、Secret 或 executable；Worker Admin 不执行 Job；Worker Gateway 不拥有第二套任务终态。
56. API readiness 不依赖 Worker 在线；Worker unavailable 时已保存内容仍可查询，产品健康单独表达执行能力降级。
57. Gateway Session generation 控制 registration/claim；Attempt ownership 由 Session、owner epoch、lease token 和 expiry 的持久 tuple 决定，resume 必须 CAS 转移并轮换 token。
58. 只有 `remote_worker` Action 可下发给普通远程 Worker；`host` 领域写入必须通过 Application Command 和当前 fence。
59. Direct/Gateway Transport 的差异不能改变 Job 状态机、retry、Receipt、取消或迟到结果处理。
60. lease 丢失后的 late evidence 只能追加 external `unknown` 审计，不能取得 owner、Secret、terminal 或领域写入能力。
61. 并发 Gateway claim 必须在 TaskStore 中原子保留 Session/lane capacity；Worker 上报 slot 和进程内 long-poll 都不是容量权威。
62. `nb-workflow@0.2.0` Kernel API 已用于当前 Cosmos Durable Host 固定 Ingest；后续扩展仍须通过 Kernel/Backend conformance。Task 04 Spike 与 API Draft 只能作为 Host/Worker 边界和历史证据，不能被误报为 Gateway 或其它未实现能力。
63. 采集计划、采集目标、连接与触发器的归属边界唯一：Run/WorkflowRun 记录计划，Entry/Observation 归目标，计划级 checkpoint 与状态命名空间不出现第二套并行当前状态。
64. Agent 是 Worker 的可选 Workflow Action，可用性由调用时那条 Connection 决定而非部署开关；不把 connectorId 当模型 Provider；每次调用校验 active Connection 并通过 SecretStore callback 临时把凭证交给 pi-ai，不能承诺内存清零或撤销已发出的外部请求。

