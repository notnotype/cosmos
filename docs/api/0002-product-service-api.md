# Product Service API 草案

> 状态：Draft v0.2；目标合同，等待 `nb-workflow` Kernel 门禁后实施
>
> 基础路径：`/api/v1`
>
> 公共约定：[`0001-common-contracts.md`](0001-common-contracts.md)

除 `/healthz`、`/readyz` 和表中显式写出的完整路径外，下列资源 Path 均相对于
`/api/v1`。

## 1. 边界

Product Service API 面向 Web、CLI、Desktop、知识管理者工具和受控插件。它是应用
Command/Query/Event 的 HTTP/SSE 映射，不是 Prisma Repository 的远程外观。

Controller 只能调用 Application Port。API 可以读取 manifest/schema/capability，
但不加载或执行 Workflow、Action、Connector 或 Agent executable。

未认证模式只面向 loopback/明确受信网络。能够从其它主机访问的 Product API 必须
在独立部署 Task 中固定 HTTPS、身份、Session/Token 生命周期和受控文件访问；CORS
不能替代这条边界。

## 2. System 与 Capability

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/healthz` | `LivenessSnapshot`；无数据库访问 |
| Convergence | `GET` | `/readyz` | `ReadinessSnapshot`；API 可读写能力 |
| Current | `GET` | `/api/v1/health` | `ServiceHealthSnapshot` |
| Convergence | `GET` | `/api/v1/capabilities` | `ServiceCapabilitySnapshot` |
| Planned | `GET` | `/api/v1/settings` | 非秘密的产品设置与 revision |
| Planned | `PATCH` | `/api/v1/settings` | 基于 `If-Match` 更新产品设置 |

API readiness 不要求 Worker 在线。`ServiceHealthSnapshot` 可以同时显示：

- API/Storage/Migration ready；
- 当前无 capable Worker；
- 某些 Action/SourceDefinition unavailable；
- 已保存 Feed/Search 仍然可用。

## 3. Catalog 与插件 manifest

### 3.1 插件

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/plugins` | `Page<PluginManifestSummary>` |
| Planned | `GET` | `/plugins/{pluginId}` | `PluginManifestDetail` |
| Reserved | `POST` | `/plugin-installations` | 创建受控安装/启用流程 |
| Reserved | `GET` | `/plugin-installations/{id}` | 安装/校验状态 |
| Reserved | `DELETE` | `/plugin-installations/{id}` | 停用或卸载；不隐式删数据 |

插件安装涉及代码执行和发布生命周期，只有独立 Task 明确校验来源、版本、hash、
权限和回滚后才实现。Catalog Query 本身不加载 executable。

### 3.2 Definition catalog

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/source-definitions` | `Page<SourceDefinitionSummary>` |
| Convergence | `GET` | `/source-definitions/{id}` | `SourceDefinitionDetail` |
| Convergence | `GET` | `/source-definitions/{id}/operations` | `Page<SourceOperationDefinition>` |
| Convergence | `GET` | `/workflow-definitions` | `Page<WorkflowDefinitionSummary>` |
| Convergence | `GET` | `/workflow-definitions/{id}/versions/{version}` | `WorkflowDefinitionDetail` |
| Convergence | `GET` | `/action-definitions` | `Page<ActionDefinitionSummary>` |
| Convergence | `GET` | `/action-definitions/{id}/versions/{version}` | `ActionDefinitionDetail` |
| Planned | `GET` | `/trigger-definitions` | `Page<TriggerDefinitionSummary>` |
| Planned | `GET` | `/story-subtypes` | `Page<StorySubtypeDefinition>` |
| Planned | `GET` | `/workspace-view-definitions` | `Page<WorkspaceViewDefinition>` |
| Planned | `GET` | `/board-block-definitions` | `Page<BoardBlockDefinition>` |

`SourceDefinition` 取代当前 `/connectors` 的对外语义。它只返回用户可配置 operation、
schema 和能力，不暴露 OpenCLI command、可执行路径或进程对象。

## 4. Connection、Source、CollectionPlan 与 Trigger

### 4.1 Connection

Connection 表示用户在一个 Provider 上可复用的登录/授权关系。Secret 值不通过本
API 返回。

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/connections` | `Page<ConnectionSummary>` |
| Planned | `POST` | `/connections` | `ConnectionSnapshot` |
| Planned | `GET` | `/connections/{id}` | `ConnectionDetail` |
| Planned | `PATCH` | `/connections/{id}` | 新 revision 的 `ConnectionSnapshot` |
| Planned | `POST` | `/connections/{id}/authorization-sessions` | `202 AuthorizationSessionSnapshot` |
| Planned | `GET` | `/authorization-sessions/{id}` | 登录/OAuth/device/browser 状态 |
| Planned | `POST` | `/authorization-sessions/{id}/cancel` | 取消未完成授权 |
| Planned | `POST` | `/connections/{id}/probes` | `202 ProbeSnapshot` |
| Planned | `POST` | `/connections/{id}/revocations` | 撤销 Secret，不删历史 Entry |
| Planned | `DELETE` | `/connections/{id}` | 只允许已撤销且无活动引用时删除配置 |

Browser Bridge/OpenCLI profile 可以投影为一种外部管理的 Connection，不把 Cookie
复制进 Cosmos。

### 4.2 Source

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/sources` | `Page<SourceSummary>`；当前代码暂为数组 |
| Current | `POST` | `/sources` | `SourceSnapshot` |
| Current | `GET` | `/sources/{id}` | `SourceDetail` |
| Current | `PATCH` | `/sources/{id}` | `SourceSnapshot`；当前只支持 enabled |
| Planned · Phase 1 remainder | `DELETE` | `/sources/{id}` | 删除配置或创建删除计划；历史事实策略显式 |
| Convergence | `POST` | `/sources/{id}/probes` | `202 ProbeSnapshot` |
| Current | `POST` | `/sources/{id}/runs` | `202 WorkflowRunSnapshot` |
| Planned | `GET` | `/sources/{id}/observations` | 来源 Observation page |
| Planned | `GET` | `/sources/{id}/entries` | 来源 Entry page |
| Planned · Phase 1 remainder | `GET` | `/sources/{id}/health` | 来源状态、最近成功/错误和计划摘要 |

`POST /sources/{id}/runs` 是 Ingest 的产品快捷入口，规范行为仍是创建
`WorkflowRun`；它不建立第二种 Run。

### 4.3 CollectionPlan

CollectionPlan 是用户可见的独立采集目标。一个 Connection 可以有多个计划，各自
拥有 Trigger、checkpoint、预算、错误和 overlap policy。

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/collection-plans` | `Page<CollectionPlanSummary>` |
| Planned | `POST` | `/collection-plans` | `CollectionPlanSnapshot` |
| Planned · Phase 1 remainder | `GET` | `/collection-plans/{id}` | `CollectionPlanDetail` |
| Planned · Phase 1 remainder | `PATCH` | `/collection-plans/{id}` | 新 revision Snapshot |
| Planned | `DELETE` | `/collection-plans/{id}` | 停止未来触发，不删历史事实 |
| Planned · Phase 1 remainder | `POST` | `/collection-plans/{id}/runs` | 手动触发绑定 Workflow |
| Planned · Phase 1 remainder | `GET` | `/collection-plans/{id}/checkpoint` | `CheckpointSnapshot` |
| Reserved | `POST` | `/collection-plans/{id}/checkpoint-resets` | 高影响重置 Command/预览 |

Source 与 CollectionPlan 的最终关系仍可在实现 Task 调整，但 API 不允许用户直接
配置 Worker ID。Phase 1 完整范围可以先为每个 Source 创建一个默认 CollectionPlan，
只开放 manual/schedule、预算、checkpoint 和 overlap；Phase 2 再开放同一
Connection 下的多 Operation/多计划管理。默认计划不是第二套调度模型。

### 4.4 TriggerBinding 与 Webhook

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/trigger-bindings` | `Page<TriggerBindingSummary>` |
| Planned | `POST` | `/trigger-bindings` | `TriggerBindingSnapshot` |
| Planned | `GET` | `/trigger-bindings/{id}` | `TriggerBindingDetail` |
| Planned | `PATCH` | `/trigger-bindings/{id}` | 新 revision Snapshot |
| Planned | `DELETE` | `/trigger-bindings/{id}` | 停止未来触发 |
| Planned | `POST` | `/hooks/{bindingId}` | 经 binding-specific 校验的外部触发 |

Webhook payload 先存受控引用和触发证据，再创建 Run；不能把未校验 payload 直接
当 Workflow input 或 Event。

## 5. Workflow 控制与运行诊断

### 5.1 Definition Binding

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/workflow-bindings` | 当前启用的 Definition version |
| Convergence | `PUT` | `/workflow-bindings/{workflowId}` | revision-protected version binding |
| Convergence | `DELETE` | `/workflow-bindings/{workflowId}` | 停用未来 Run，不改变历史 |

### 5.2 WorkflowRun

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/workflow-runs` | 按 kind/status/ref/correlation/time 分页 |
| Convergence | `POST` | `/workflow-runs` | `202 WorkflowRunSnapshot` |
| Current | `GET` | `/workflow-runs/{id}` | 通用 Run Snapshot；当前路径为 `/runs/{id}` |
| Convergence | `POST` | `/workflow-runs/{id}/cancellations` | 级联取消 Command |
| Planned | `POST` | `/workflow-runs/{id}/reruns` | 新 Run，声明重用/失效策略 |
| Planned | `POST` | `/workflow-runs/{id}/resumptions` | 从安全等待/恢复点创建恢复 Command |
| Convergence | `POST` | `/workflow-runs/{id}/signals` | 写入版本化 Signal |
| Convergence | `GET` | `/workflow-runs/{id}/activities` | `Page<ActivitySnapshot>` |
| Convergence | `GET` | `/workflow-runs/{id}/steps` | 可选 UI projection |
| Convergence | `GET` | `/workflow-runs/{id}/jobs` | `Page<JobSnapshot>` |
| Convergence | `GET` | `/workflow-runs/{id}/events` | Run-scoped Event page |
| Convergence | `GET` | `/workflow-runs/{id}/usage` | budget/usage Snapshot |

`POST /workflow-runs` 输入只接受 catalog 中存在并启用的 `workflowRef`、合法 input、
correlation 和允许的预算覆盖。客户端不能伪造 definition snapshot、lease、Job
或 admission result。Run Snapshot 同时保存不可变 Trigger cause、原始触发输入
引用/指纹和映射后的 Workflow input；两者不能在执行时重新读取当前配置。

### 5.3 Activity、Job、Attempt 与 Receipt

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/activities/{id}` | `ActivityDetail` |
| Current | `GET` | `/jobs/{id}` | `JobDetail` |
| Convergence | `GET` | `/jobs/{id}/attempts` | `Page<AttemptSnapshot>` |
| Convergence | `GET` | `/attempts/{id}` | 不含 lease token 的 AttemptDetail |
| Convergence | `GET` | `/jobs/{id}/receipts` | 外部副作用 Receipt 历史 |
| Planned | `POST` | `/jobs/{id}/retry-requests` | 用户请求重试；由 Policy 决定新 Attempt |

Product API 不提供 claim、renew、complete 或 fail Job 的写端点。那些操作只存在于
Cosmos Backend 或 Worker Gateway。

### 5.4 Worker discovery

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/workflow-workers` | Worker discovery envelope |
| Planned | `GET` | `/workflow-workers/{id}` | registration/capability 投影，不含 token |

Worker discovery 是诊断，不是 assignment 或 Run owner。

## 6. 信息库

### 6.1 Observation

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/observations` | 来源、Run、时间、event kind 分页 |
| Planned | `GET` | `/observations/{id}` | `ObservationDetail` |
| Planned | `GET` | `/observations/{id}/payload` | 受控原始 payload/ValueRef |

Observation 不提供 PATCH。合法删除只能通过数据保留/删除计划，并保留允许的
tombstone/audit。

### 6.2 Entry 与 Revision

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/entries` | `Page<EntrySummary>` |
| Current | `GET` | `/entries/{id}` | `EntryDetail` |
| Planned | `GET` | `/entries/{id}/revisions` | `Page<EntryRevisionSnapshot>` |
| Planned | `GET` | `/entries/{id}/observations` | provenance page |
| Planned | `GET` | `/entries/{id}/relations` | Entry 到 Story/Entity/Entry 关系 |
| Current | `GET` | `/entry-revisions/{id}` | 当前路径暂为 `/revisions/{id}` |

来源修订通过 Ingest Command 产生，不允许用户用普通 PATCH 改写 EntryRevision。
用户批注、标签和修正 Proposal 使用独立资源。

### 6.3 Asset、Blob 与文件

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/assets/{id}` | 已保存内容流；支持 ETag/Range 的目标合同 |
| Planned | `GET` | `/assets/{id}/metadata` | `AssetSnapshot` |
| Planned | `POST` | `/assets/{id}/save-requests` | 尝试补存远端媒体 |
| Planned | `GET` | `/blobs/{ref}` | 只接受受控 capability/ref，不暴露 storage key |

## 7. Search、Feed 与用户交互

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/search` | `LibrarySearchQuery` → `Page<SearchHitSnapshot>`；当前实现字段仍较少 |
| Current | `GET` | `/feed` | `FeedQuery` → `Page<FeedItemSnapshot>`；默认 Story Feed |
| Planned | `GET` | `/feeds/{surface}` | 指定 SavedView/Ranking Policy 的 Story Feed |
| Planned | `GET` | `/stories/{id}/related` | 相关但不同 Story，带解释 |
| Planned | `POST` | `/interactions` | impression/open/read/save/hide/not_interested 等 |
| Planned | `GET` | `/read-states` | 按 Story/surface 查询 |
| Planned | `PUT` | `/read-states/{storyId}` | 更新 last seen revision |

Feed 返回 Story，不把同一 Story 的多个 Entry 算成多次曝光。展开具体来源后才记录
Entry interaction。

## 8. Story、Topic、Entity 与关系

### 8.1 Story

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/stories/{id}` | Phase 1 最小 StoryDetail |
| Planned | `GET` | `/stories` | kind/subtype/topic/entity/time 分页 |
| Planned | `GET` | `/stories/{id}/revisions` | Story Revision page |
| Planned | `POST` | `/stories/{id}/revision-proposals` | 人类/Agent 候选表示 |
| Planned | `GET` | `/stories/{id}/memberships` | Entry membership/current/history |
| Planned | `POST` | `/story-merge-commands` | canonical merge |
| Planned | `POST` | `/story-split-commands` | 历史壳 + successors |
| Planned | `POST` | `/story-membership-commands` | accept/reject/move/correct |
| Planned | `POST` | `/story-state-migration-previews` | merge/split 后用户状态与 Topic membership 影响预览 |
| Planned | `POST` | `/story-state-migration-commands` | 显式 apply/revert；保存 actor、依据和关联 Run |

merge/split 和 membership 修改要求 base revision、actor、reason 和 evidence。

### 8.2 Topic

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/topics` | Topic page |
| Planned | `POST` | `/topics` | Topic + initial revision |
| Planned | `GET` | `/topics/{id}` | TopicDetail |
| Planned | `PATCH` | `/topics/{id}` | 新 Topic Revision |
| Planned | `POST` | `/topics/{id}/archive-commands` | 明确人工归档；后置 |
| Planned | `GET` | `/topics/{id}/memberships` | 当前角色与历史 |
| Planned | `POST` | `/topic-membership-commands` | add/change/remove/propose_remove |
| Planned | `GET` | `/topics/{id}/relations` | typed Topic relations |
| Planned | `POST` | `/topic-relation-commands` | 不建立父子层级 |
| Planned | `GET` | `/topics/{id}/maintenance-binding` | 独立维护绑定 |
| Planned | `PUT` | `/topics/{id}/maintenance-binding` | 更新维护 Workflow/预算 |

### 8.3 Entity 与 Relationship

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/entities` | type/name/alias 查询 |
| Planned | `GET` | `/entities/{id}` | EntityDetail |
| Planned | `GET` | `/relationships` | target/type/evidence 查询 |
| Planned | `POST` | `/relationship-proposals` | 自动或人工关系候选 |
| Planned | `POST` | `/relationship-commands` | accept/reject/correct |

## 9. 用户真相：Label、Annotation、Collection、SavedView

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET/POST` | `/labels` | Label CRUD |
| Planned | `GET/PATCH/DELETE` | `/labels/{id}` | revision-protected |
| Planned | `GET/POST` | `/annotations` | 支持 ResourceRef/fragment |
| Planned | `GET/PATCH/DELETE` | `/annotations/{id}` | 不随派生刷新丢失 |
| Planned | `GET/POST` | `/collections` | Collection CRUD |
| Planned | `GET/PATCH/DELETE` | `/collections/{id}` | stable identity |
| Planned | `POST` | `/collection-membership-commands` | 显式成员变更 |
| Planned | `GET/POST` | `/saved-views` | 保存 Query/Feed 条件 |
| Planned | `GET/PATCH/DELETE` | `/saved-views/{id}` | revision-protected |

## 10. Knowledge、Proposal 与 Research

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/knowledge-signals` | target/kind/producer/status 分页 |
| Planned | `GET` | `/knowledge-signals/{id}` | 不可覆盖的判断 |
| Planned | `GET` | `/knowledge-signals/{id}/dispositions` | 接受、忽略、转研究等独立处理记录 |
| Planned | `POST` | `/knowledge-signals/{id}/dispositions` | 追加 disposition；不覆盖 Signal |
| Planned | `GET` | `/proposals` | Story/Topic/Relation/Workspace 候选 |
| Planned | `GET` | `/proposals/{id}` | evidence 和 producer |
| Planned | `POST` | `/proposals/{id}/decisions` | accept/reject/supersede |
| Planned | `GET` | `/research-requests` | status/priority/target 分页 |
| Planned | `POST` | `/research-requests` | `202 ResearchRequestSnapshot` |
| Planned | `GET` | `/research-requests/{id}` | 关联 Run、结果和错误 |
| Planned | `POST` | `/research-requests/{id}/cancellations` | 取消对应 Research Run |

KnowledgeSignal 不直接启动执行。ResearchRequest 经 Trigger/Workflow 执行；外部发现
重新进入统一 Ingest。`KnowledgeSignalDispositionSnapshot` 是独立追加记录，不把
KnowledgeSignal 改成可变任务状态。ResearchRequest 通过 `runRef` 连接 Trigger、
Activity/Action/Attempt、预算、失败恢复和结果 provenance，不在 Request 中复制
一份运行时 journal。

## 11. 知识管理者与 Agent 交互

知识管理者不是一个 Session，但 Web Chat/CLI 的每条对话仍需要稳定 conversation
和 Run 引用。

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Reserved | `GET` | `/knowledge-manager` | 角色、可用入口、共享 memory 状态摘要 |
| Planned | `POST` | `/agent-conversations` | 创建一个交互分身/conversation |
| Planned | `GET` | `/agent-conversations/{id}` | ConversationSnapshot |
| Planned | `GET` | `/agent-conversations/{id}/messages` | message page |
| Planned | `POST` | `/agent-conversations/{id}/messages` | `202` 创建 Agent Invocation Run |
| Planned | `POST` | `/agent-conversations/{id}/cancellations` | 取消当前 invocation |

对话中执行 GUI 等价操作仍调用普通 Product Command；Agent 不能获得 Prisma 或任意
内部路由旁路。具体 Session/Profile/Model DTO 等 Harness 文档稳定后再收口。

## 12. Workspace 与 Artifact

### 12.1 Workspace

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET/POST` | `/workspaces` | Workspace page/create |
| Planned | `GET/PATCH` | `/workspaces/{id}` | stable identity + config revision |
| Planned | `GET` | `/workspaces/{id}/revisions` | config/content revisions |
| Planned | `GET` | `/workspaces/{id}/input-bindings` | many-to-many inputs |
| Planned | `POST` | `/workspace-input-binding-commands` | add/change/remove |
| Planned | `GET` | `/workspaces/{id}/updates` | WorkspaceUpdate page |
| Planned | `POST` | `/workspaces/{id}/updates` | `202` 启动维护 Workflow |
| Planned | `POST` | `/workspace-updates/{id}/cancellations` | 取消但保留上次成功版本 |
| Planned | `GET/PUT` | `/workspaces/{id}/maintenance-binding` | Trigger/Workflow/预算/Agent 绑定 |
| Planned | `GET/PUT` | `/workspaces/{id}/interaction-state` | schema-versioned user progress |

### 12.2 Artifact

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/artifacts` | target/producer/workspace 分页 |
| Planned | `GET` | `/artifacts/{id}` | Artifact identity/current revision |
| Planned | `GET` | `/artifact-revisions/{id}` | immutable revision metadata |
| Planned | `GET` | `/artifact-revisions/{id}/manifest` | 文件清单、hash、provenance |
| Planned | `GET` | `/artifact-revisions/{id}/files/{path}` | 受控文件读取 |
| Planned | `POST` | `/artifact-revisions/{id}/render-capabilities` | 短期隔离渲染 capability |

Workspace Update 只有成功时原子切换 current Artifact/Workspace Revision。
HTML/交互 Artifact 默认只能在独立 origin、sandbox 和 CSP 下渲染，禁止访问宿主
DOM、文件系统、Secret、数据库和未声明网络。`executable: boolean` 不能替代
RenderProfile/SandboxPolicy；放宽能力保持 `Reserved`，需要单独审计。

## 13. Board 与 Spotlight

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET/POST` | `/boards` | Board page/create |
| Planned | `GET/PATCH` | `/boards/{id}` | revision-protected config |
| Planned | `GET` | `/boards/{id}/render` | 当前授权 Snapshot |
| Planned | `POST` | `/board-layout-commands` | Section/Block move/add/remove/configure |
| Planned | `GET` | `/spotlight-placements` | target/board/status |
| Planned | `POST` | `/spotlight-placement-commands` | pin/exclude/release |
| Planned | `GET` | `/spotlight-policies` | policy/version/config |
| Planned | `PUT` | `/spotlight-policies/{id}` | revision-protected |

删除 Board Block 不删除它引用的 Story、Workspace、Artifact 或 SavedView。

## 14. Publication、Subscription 与 Delivery

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/subscriptions` | Topic/Workspace/Publication subscription |
| Planned | `POST/PATCH/DELETE` | `/subscriptions...` | 独立于 Topic/Placement |
| Planned | `GET` | `/publications` | Publication page |
| Planned | `POST` | `/publications` | 冻结 Board/Query/Revision Snapshot |
| Planned | `GET` | `/publications/{id}` | immutable content refs |
| Planned | `GET` | `/publication-revisions/{id}` | 网页/图片/正文同一快照 |
| Planned | `POST` | `/publications/{id}/deliveries` | `202 DeliveryIntentSnapshot` |
| Planned | `GET` | `/delivery-intents/{id}` | Attempt/receipt/uncertain |
| Planned | `POST` | `/delivery-intents/{id}/retry-requests` | 受 policy 控制 |
| Planned | `POST` | `/delivery-intents/{id}/reconciliations` | 查询外部渠道收口 |

Subscription 保存 schedule/timezone/misfire policy、目标、Channel capability、
授权状态、优先级和用户规则。Publication/Delivery 只消费冻结的
PublicationRevision；每天 08:00 之类的调度不能只存在于 Worker 内存。

## 15. 存储、备份、导出、删除与完整性

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Planned | `GET` | `/storage/usage` | DB/Blob/Artifact/Cache/Log 分项 |
| Planned | `GET` | `/storage/roots` | 只返回逻辑类别和状态，不返回绝对路径 |
| Planned | `POST` | `/backups` | `202 BackupSnapshot` |
| Planned | `GET` | `/backups/{id}` | 内容范围、hash、状态 |
| Planned | `POST` | `/restores` | 独立高风险恢复计划 |
| Planned | `POST` | `/exports` | `202 ExportSnapshot` |
| Planned | `GET` | `/exports/{id}` | 下载能力和保留时间 |
| Planned | `POST` | `/deletion-plans` | 先生成影响预览 |
| Planned | `GET` | `/deletion-plans/{id}` | 引用、不可恢复项、预计回收 |
| Planned | `POST` | `/deletion-plans/{id}/executions` | 显式确认后执行 |
| Planned | `POST` | `/cleanup-runs` | Cache/Blob GC/retention maintenance |
| Planned | `GET` | `/integrity-reports` | orphan、引用和 Runtime 一致性 |
| Planned | `POST` | `/integrity-audits` | `202` 只读审计 Run |
| Planned | `GET` | `/migration-status` | schema compatibility |

restore、delete 和 repair 不由普通 PATCH 表达，必须有预览、幂等、Run、审计和失败
恢复。备份清单必须明确数据库、Observation payload、Blob、Artifact、用户真相、
日志/缓存和 Secret 的包含/排除规则；恢复顺序和版本兼容不能从文件夹拷贝隐式推断。

## 16. Event Stream

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Current | `GET` | `/events` | SSE，支持 `Last-Event-ID`/`after` |

Event 类型至少覆盖：

- Source/Connection/CollectionPlan 状态；
- Workflow Run/Activity/Job/Attempt/Receipt；
- Observation/Entry/Story/Topic/Knowledge/Research；
- Feed/Spotlight/Workspace/Artifact/Board；
- Publication/Delivery；
- storage/integrity/backup/export；
- `snapshot_required.v1`。

高频 progress 可以压缩或采样，但终态和外部副作用不能只存在于易丢失的 transient
stream。

## 17. 当前路径迁移

当前分支尚未发布稳定 v1，建议在实现前直接收敛：

| 当前路径 | 规范路径 |
| --- | --- |
| `/api/v1/connectors` | `/api/v1/source-definitions` |
| `/api/v1/sources/{id}/test` | `/api/v1/sources/{id}/probes` |
| `/api/v1/runs/{id}` | `/api/v1/workflow-runs/{id}` |
| `/api/v1/revisions/{id}` | `/api/v1/entry-revisions/{id}` |

如果在迁移前已经出现外部消费者，再通过有限期限 alias 和 deprecation Header
迁移；目前不为未发布路径永久维护两份 canonical route。
