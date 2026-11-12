# Cosmos 产品需求文档

> 状态：Draft v0.18
>
> 最后更新：2026-08-23
>
> 原始需求真相源：[`0001-original-requirements.md`](0001-original-requirements.md)
>
> 当前技术方案：[`../architecture/0001-cosmos-foundation.md`](../architecture/0001-cosmos-foundation.md)
>
> 信息领域模型：[`../architecture/0002-information-model.md`](../architecture/0002-information-model.md)
>
> Workflow Runtime Task：[`.agents/tasks/04-workflow-runtime/README.md`](../../.agents/tasks/04-workflow-runtime/README.md)
>
> Kernel Convergence Task：[`.agents/tasks/06-nb-workflow-kernel-convergence/README.md`](../../.agents/tasks/06-nb-workflow-kernel-convergence/README.md)
>
> API 与 DTO 草案：[`../api/README.md`](../api/README.md)

## Story Agent 超时与失败提示补充（2026-11-12）

本节为已确认的当前产品要求，优先于封口分册中涉及这些行为的旧说明；实现与验收状态见 [Task 42](../../.agents/tasks/42-default-model-ui-api/walkthrough.md)。

- 用户可在设置页保存 Story Agent 单次调用超时，单位秒，默认 300，允许 30–1800 的整数。空值、非整数和越界不能保存；读取失败可重试，保存失败保留输入并明确提示。
- 新生成使用创建任务时的超时；修改设置不改写正在执行的任务或旧请求。单次超时不是整个任务总时长承诺，自动重试可能使总时长更长。
- 生成失败要说明超时、需要认证、触发限流、超出预算、配置无效、依赖不可用或生成内容不符合要求，并给出对应的设置/检查/重试建议；无法确定的失败用通用提示。用户取消以中性状态展示，不能显示为失败。
- 页面及同一 Story 任务的公开诊断只提供安全的固定说明；不得暴露密钥、原始服务商响应或内部异常，也不得用当前设置秒数冒充旧任务实际时限。

## 分册索引

本文件按领域拆分为分册(每册 ≤30 KB,封口后只读);主文档保留产品概述、原则、待决定事项与下方索引,功能与验收细节按 §号查阅分册。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-06.md](0002-product-requirements/part-06.md) | §6 端到端用户体验 | 4.4 KB |
| [part-07-1.md](0002-product-requirements/part-07-1.md) | §7.1–7.4 采集、运行时与检索 | 18.4 KB |
| [part-07-2.md](0002-product-requirements/part-07-2.md) | §7.5 Story、Topic、Entity 与关系 | 21.4 KB |
| [part-07-3.md](0002-product-requirements/part-07-3.md) | §7.7–7.11 Agent、看板、发布、运维与扩展 | 15.1 KB |
| [part-08-09.md](0002-product-requirements/part-08-09.md) | §8 主要产品界面、§9 关键用户场景与验收 | 5.9 KB |
| [part-10-12.md](0002-product-requirements/part-10-12.md) | §10 非功能需求、§11 数据保留与所有权、§12 实施范围与阶段验收 | 9.6 KB |
| [part-14-15.md](0002-product-requirements/part-14-15.md) | §14 原始需求追踪、§15 当前解释与勘误候选 | 12.8 KB |
| [ERRATA.md](0002-product-requirements/ERRATA.md) | 分册勘误登记（追加型台账，2026-09-18 自主文档拆出） | 13.4 KB |

## 0. 文档职责

本文把用户原始描述整理成可讨论、可排期、可验收的产品需求。它回答“Cosmos 要解决什么问题、用户能做什么、什么算完成”，不锁定具体数据库表、类名或框架实现。

文档按以下规则演进：

1. 用户的新原话先追加到 `0001-original-requirements.md`，保留原始措辞、数字、示例和不确定性。
2. 本文同步更新当前产品解释、需求编号、优先级、验收条件和待决策项。
3. 架构文档说明“如何实现”；两份文档发生冲突时，先根据原始需求澄清产品行为，再调整架构。
4. 尚未由用户确认的内容标为“当前假设”或“待决定”，不能伪装成最终需求。

## 1. 产品概述

### 1.1 一句话定义

Cosmos 是一个本地优先、可编排的信息聚合与个人情报平台：它代替用户持续浏览多个信息渠道，把关注领域的内容尽可能录入本地信息库，再通过可配置看板、Agent 深入研究、持续 Workspace 和后续推送帮助用户理解与行动。

### 1.2 要解决的问题

用户目前需要分别打开 BiliBili、X、Telegram、群聊、公众号、邮箱、公告网站和搜索页面才能获得信息。这种方式存在四个问题：

- 覆盖不足：人的浏览时间有限，无法持续检查更多来源和更深的关联信息。
- 信息碎片化：同一事件分散在官方公告、社交帖子、评测、教程和讨论中。
- 内容易失：推荐流、群聊和网页内容可能被更新、删除或在断网时无法访问。
- 消化成本高：用户仍要自行去重、判断重要性、阅读长文、做批注和持续跟踪。

### 1.3 产品愿景

Cosmos 最终应成为用户可控制的“信息采集与理解层”：

- 外部平台负责产生信息和提供发现入口。
- Cosmos 负责更广地采集、可靠地保存、建立关系、排序和追踪。
- Agent 负责在授权范围内深读、补充调研并生成可追溯产物。
- 看板和推送负责在合适的时间呈现合适的信息。
- 用户保留对来源、关注范围、数据、排序、Agent 数据范围和外部发送的最终控制。

## 2. 产品目标与成功定义

### 2.1 核心目标

1. 在用户授权和资源预算内，尽可能广地覆盖用户关注领域。
2. 让成功录入的信息在本地离线时仍可查询和阅读。
3. 保留来源身份和原始证据，让摘要、聚类、推荐和 Agent 结论可追溯。
4. 把多个来源组织成事件、长期关注对象和相关内容网络。
5. 通过看板降低用户浏览成本，并允许用户高度自定义内容和布局。
6. 让 Agent 生成报告、批注、课程和可视化页面，同时保存版本和用户交互状态。
7. 在看板闭环稳定后，支持定时摘要与紧急消息推送。
8. 允许用户通过 Source、Trigger、Workflow、Action、Agent 和 Board Block 扩展系统。

### 2.2 产品成功信号

第一条可运行链路完成后建立基线，再为以下指标设置目标值：

- 覆盖度：关注 Topic 在给定时间段内发现的独立来源和有效信息数量。
- 新鲜度：来源发生变化到内容成功录入、可查询和可展示之间的延迟。
- 离线可用率：已录入条目中，本地可阅读正文与已承诺媒体的比例。
- 重复控制：同一来源重复轮询产生的重复 Entry、重复 Job 和重复推送比例。
- 可追溯率：自动摘要、Story、关系、推荐和 Artifact 能定位到依据的比例。
- 展示价值：用户的打开、保存、隐藏、不感兴趣、追踪和完成交互反馈。
- 自动化可靠性：Run 成功率、可恢复失败、终态失败和结果未知的分布。
- 用户节省时间：用户获得同等信息覆盖所需的主动浏览时间变化。

在没有真实使用数据前，不人为编造数值门槛。每个实施阶段必须同时交付测量方法和当期基线。

## 3. 目标用户与使用假设

### 3.1 首要用户

第一阶段面向愿意在个人电脑或私有环境中运行 Cosmos 的重度信息用户，例如开发者、研究者、产品经理、创作者和需要持续跟踪行业动态的人。

这类用户通常：

- 同时关注多个平台、账号、网站、关键词和长期主题。
- 希望拥有本地数据和离线访问能力。
- 愿意配置来源、规则、Agent 和看板。
- 既需要低成本普通信息流，也需要少量高价值深入分析。
- 对私信、群聊和邮件等敏感来源有明确权限与隐私要求。

### 3.2 当前产品假设

- 第一阶段和默认产品合同面向单个本地用户；未来可以在不改变领域 actor/revision 合同的前提下增加协作能力，但本项目当前不建设多人同步和多租户。
- 用户明确授权每个 SourceInstance，并负责其第三方账号和平台使用权限。
- 运行环境可以持续或定时启动 Worker；睡眠或关机后应在恢复时安全补跑。
- LLM 和外部 Agent 能力可能不可用、昂贵或失败；普通录入、搜索和 Feed 不能依赖它们在线工作。
- 本地磁盘不是无限的；媒体、历史版本、缓存和 Agent 成本需要可配置预算。
- 未认证单用户阶段的作用域键、配置/来源/Blob/运行记录归属和未来认证替换点是待设计建议，不是当前已冻结的持久化合同。

## 4. 产品原则与边界

### 4.1 产品原则

- 广采集、窄展示：进入信息库和出现在当前看板是两个独立决定。
- 本地优先：已成功保存的内容不依赖原平台在线才能阅读。
- 证据优先：原始来源与派生理解分开保存。
- 无 URL 假设：消息、邮件和群聊内容没有网页链接时仍是完整的一等信息。
- 多来源优先：同一事件保留不同来源，而不是只保留一篇代表文章。
- 非 LLM 基线：常规 Feed、过滤、全文检索和基础去重在 LLM 不可用时工作。
- 用户可控：来源、数据保留、Agent 的数据范围、排序偏好和外部发送均有明确设置；复杂权限系统后置。
- 记忆与配置分层：知识管理者的长期记忆、Cosmos 观察到的行为和未来其它信号可以共同生成程序可读配置；当前不把平台推荐信号单独建模成偏好层。
- 可扩展但有边界：自定义代码和插件通过公开能力合同访问系统。

### 4.2 当前非目标

- 第一阶段不建设互联网级、多租户 SaaS。
- 第一阶段不引入 Kafka、RabbitMQ 或微服务集群。
- 不承诺绕过平台认证、反爬、付费墙、数字版权保护或服务条款。
- 不承诺所有视频、图片、附件和受保护正文都能完整离线保存。
- 不让 LLM 充当原始事实、权限、删除数据或外部发送的唯一裁决者。
- 第一版不建设细粒度 ACL、多人协作权限 UI 或不可信插件沙箱；只保留简单的本地信任边界和未来可迁移的能力合同。
- 不把平台首页推荐直接等同于 Cosmos 的最终推荐结果。
- 本 PRD 不把通用 Workflow Runtime、全部 Connector、完整看板或推送误报为当前已交付能力；当前实现状态以 `PROJECT-STATUS.md` 和对应 Task 为准。

## 5. 产品概念

| 用户表达 | 产品概念 | 用户可感知的含义 |
| --- | --- | --- |
| 信息来源 | Source | 一类外部渠道及用户配置好的具体账号、列表、网站或查询 |
| 手动/定时/自定义触发 | Trigger | 决定何时启动一次自动化 |
| 触发后执行的逻辑 | Workflow + Action | 编排抓取、清洗、入库、Agent、渲染或发送 |
| 原始信息/信息条目 | Observation + Entry | 每次采集证据与稳定可查询的信息条目 |
| 上层规范内容单元 | Story | 每个 Entry 的上层单位，以 kind 区分 event、document、media、thread 等形态 |
| 话题 | Topic | 围绕问题或目标持续组织 Story，不直接收录 Entry |
| 便签 | Annotation | 用户或 Agent 对内容、片段或主题的批注与观点 |
| 分类 | Label / Saved View | 标签和可重复使用的查询视图 |
| 精华 | Workspace + Artifact | 长期精选体验及其报告、网页、图表或附件产物 |
| 热点 | Spotlight | 看板中的高关注展示决定，可指向 Story、Topic、Workspace 或 Artifact |
| 知识管理者 | Knowledge Manager | 用户与系统交互的高权限窗口，可通过 Web/CLI 代替用户执行已授权操作 |
| 时间线 | Timeline View | 按时间展示 Story 或 Topic 更新的视图 |
| 消息流 | Feed | 由查询、候选生成、去重和排序得到的普通内容流 |
| 看板 | Board | 可配置的 Section 与 Block 集合 |
| 摘要 | Publication | 某个时点冻结、可渲染和投递的内容版本 |

内部命名不是最终中文 UI 文案。产品设计阶段可以继续优化用户可见名称，但不能重新混淆事件、长期主题、产物和展示位置。

→ §6 端到端用户体验 已归档:[part-06.md](0002-product-requirements/part-06.md)

## 7. 功能需求

阶段含义：

- `Phase 1`：第一条信息录入、离线查询和最小 Feed 垂直链路。
- `Phase 2`：信息组织与可配置看板。
- `Phase 3`：Agent Artifact 与长期 Workspace。
- `Phase 4`：推荐能力与更多渠道覆盖。
- `Phase 5`：Publication、定时摘要和紧急推送。
- `跨阶段`：从首次实现起持续成立的产品合同。

→ §7.1–7.4 采集、运行时与检索 已归档:[part-07-1.md](0002-product-requirements/part-07-1.md)
→ §7.5 Story、Topic、Entity 与关系 已归档:[part-07-2.md](0002-product-requirements/part-07-2.md)
→ §7.7–7.11 Agent、看板、发布、运维与扩展 已归档:[part-07-3.md](0002-product-requirements/part-07-3.md)

→ §8 主要产品界面、§9 关键用户场景与验收 已归档:[part-08-09.md](0002-product-requirements/part-08-09.md)

→ §10 非功能需求、§11 数据保留与所有权、§12 实施范围与阶段验收 已归档:[part-10-12.md](0002-product-requirements/part-10-12.md)

## Story 内容阅读增量（Task 40）

已接受的产品行为见 [Story 内容目标设计](../aegis/specs/2026-10-08-story-content-representation-design.md)，实施由 [Task 40](../../.agents/tasks/40-story-content-representation/README.md) 承接；这里是验收目标，不是已交付声明。

1. 用户阅读新采集内容时，正文与媒体保持来源语义顺序；纯文本、HTML、结构化文章及混合内容使用一致阅读体验，不显示可执行的原始 HTML。
2. 来源正文明确标示来源；多来源 Story 可选择正文，不默默拼接。旧数据、空正文、解析不完整、媒体未保存或失败均有可理解的提示与回退。
3. 同一来源修订的阅读表示可升级和回退，历史引用仍指向实际读取版本；证据不可用时保留产物与审计，并明确尚待核验。
4. Agent 默认读取 Story 摘要，需要来源正文、原文证据或媒体字节时显式选择受管范围。摘要、关系提取和质量审查先生成候选，用户接受后才写入正式内容并记录审计。
5. 第一阶段不批量回填历史正文，不抓外链全文，不渲染任意 HTML，不执行音视频转录或自动理解，不自动聚类或将 Agent 结果直接写成正式事实。

## 13. 待决定事项

以下问题不会阻塞 Phase 0，但会影响后续范围或顺序：

1. 文本、图片、视频、私信和历史修订的默认保留预算及清理策略。
2. BiliBili、X、Telegram、公众号、QQ群和 AIHOT 的合法、稳定接入方式。
3. Board 是否在 Phase 2 就支持多个实例，还是先只提供一个默认 Board。（2026-09-09 注记：按 [`board-section-block-v1` Proposal](../proposals/board-section-block-v1.md) 决策为多 Board 实体 + 产品预置一个默认 Board，见 ADR-0010。）
4. 摘要链接只在本机/局域网访问，还是提供受鉴权的公网发布。
5. 首批推送渠道的优先级，以及 QQ 采用的具体适配方式。
6. 远端 Git 托管、发布方式和跨平台目标。
7. 同一 Workspace 的并发更新、重复触发合并和取消/接管语义。
8. Agent 候选 Revision 的接受/拒绝界面，以及字段保护的最小实现。
9. `updated_since_last_seen` 在不同 surface、Story split 和 Story merge 后的投影规则。
10. 显式 state migration command 的批量操作、撤销和用户确认边界。（2026-09-15 注记：split 的用户状态迁移按 [`story-split-user-state-migration-v1` Proposal](../proposals/story-split-user-state-migration-v1.md) 与 ADR [`0020`](../adr/0020-story-split-user-state-migration-v1.md) 收窄——批量以「一次命令显式声明多类对象、每类上限 500」表达，撤销是同一命令的反向调用而不是账本回放，确认边界是「API 不做二次确认、Web 提交前显示迁移摘要并在超过 20 项时提示批量」。其它 state migration 场景——merge 之外的跨对象批量、一键撤销、通用撤销账本——仍待决定。）
11. Bun 开发与 Node 生产在 Next、Nest、Prisma、Worker 和 Harness Adapter 上的完整兼容矩阵及发布检查。
12. Prisma/SQLite 的 FTS5 migration、触发器、Raw SQL Repository 和未来存储替换边界。
13. 三种部署模式的认证、公网暴露、SSE 恢复和 Blob/Artifact transfer
    capability；Product/Worker/Admin 三面、HTTPS long-poll Gateway 和 Action
    execution placement 已有独立草案。
14. Desktop Shell 的具体实现、Node sidecar 生命周期以及安装、升级和卸载行为。
15. `pi-ai` 直接接入到 Harness `ModelRuntime` 的迁移门槛，以及 NeuroBook Harness 与独立 Harness 的行为差异。
16. SecretStore 的第一版后端是操作系统凭据库、加密文件还是其它本地实现；无论实现如何，公共合同均只暴露 SecretRef/能力受限租约。
17. Adapter 的 Source 操作是由多个 SourceDefinition、一个带 operation 的 SourceDefinition，还是用户可见的“采集计划”聚合表达。
18. `nb-workflow` Kernel/Backend Port 与 Cosmos Durable Host 如何映射 Activity、Job/Attempt、fan-out/fan-in、等待、子 Workflow、取消/接管和可恢复 journal；Graph/IR 转换为脚本语义的具体 API。
19. Entry → Story 的 Proposal 在什么置信度、来源类型和用户设置下可以自动接受，哪些字段必须人工确认。
20. 推荐系统的第一版 Feed surface、用户反馈权重、LLM 异步特征和 Top-N rerank 的预算边界。
21. `nb-memory` Adapter/Port 的具体 API、存储根目录、Node 生产兼容性以及 Cosmos Observation/Behavior 到 memory 的映射。
22. 知识管理者 Web Chat、`cosmos cli`、ingest 参与方式和高权限操作的最小 Capability/运行合同；当前不建设审批 UI。
23. Agent 记忆与行为观察生成程序可读个性化配置的 schema、更新频率和人工覆盖边界。
24. Workflow Context、Action 调用、Child Workflow、Research Request、Workflow kind/tags 和用户/Agent 配置绑定的公共 API。
25. 看板撤销（编辑模式下误操作可恢复）。（2026-09-24 维护者裁定：**当前不需要该功能，登记为额外需求（后置）**，原始原话见 [`0001-original-requirements.md`](0001-original-requirements.md) 同日条目。设计输入保留在 [`board-undo-v1` Proposal](../proposals/board-undo-v1.md)（`rejected`，不采用），其中核实到：看板删除是**物理删行**、现行 DomainEvent payload **不足以回放**、仓库已有两条可逆性先例（ADR-0020「反向调用、不建账本」与 Topic 成员 tombstone+restore），且「删除」与「隐藏」的用户可见边界从未被定义。BRD-002 只要求「删除区块不删除内容」，**不要求可撤销**。）

→ §14 原始需求追踪、§15 当前解释与勘误候选 已归档:[part-14-15.md](0002-product-requirements/part-14-15.md)

## 已接受、部分实现：模型配置入口

用户可在左导航“模型”管理多个 Provider 及其模型，共享 Provider 的 API key；真实值仅保存到 SecretStore，编辑不回填，留空保留，保存不调用模型。模型型 Connection 单选已有 Provider 的一个模型，其它连接行为不变。模型发现必须显式触发，候选确认后才添加；首版公网 HTTPS、OpenAI 兼容 Chat Completions/Responses，分别验收、不自动回退。被引用配置禁止删除，删除 Provider 清理其本地凭证副本但不撤销服务商 key；清理失败须可见。依据 [已接受 Proposal](../proposals/connection-credential-entry-v1.md)，接口候选见 [Draft](../api/0009-provider-model-configuration.md)；创建/编辑、删除 Provider、凭证写入、同步发现、模型选择与 `agent.invoke@2` 已实现并有隔离测试，**编辑前受影响连接提示由界面自行聚合、不新增服务端端点**，接口逐条状态见该 Draft 的路由表；真实请求、迁移与浏览器验收仍未获批准。

## 分册勘误登记

分册封口后只读；对已封口分册的更正登记在独立台账 [`ERRATA.md`](0002-product-requirements/ERRATA.md)（2026-09-18 从本文件拆出，只搬位置、不改写条目），不改写分册正文。新增勘误追加到该台账末尾。
