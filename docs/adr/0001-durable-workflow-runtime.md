# ADR-0001：Durable Workflow Runtime

> 状态：Accepted design contract；部分决定由
> [`ADR-0002`](0002-nb-workflow-kernel-cosmos-host.md) 取代
>
> 日期：2026-08-10
>
> 关联架构：[`../architecture/0001-cosmos-foundation.md`](../architecture/0001-cosmos-foundation.md)
>
> 后续实施：[`../tasks/04-workflow-runtime/README.md`](../tasks/04-workflow-runtime/README.md)

## Supersession scope

ADR-0002 取代本 ADR 中以下历史判断：

- `nb-workflow` 只作为语义参考、Cosmos 自己拥有脚本 replay 内核；
- Run/Step/Job 是唯一底层执行分解，Step 是每次执行必需原语；
- “直接依赖 `nb-workflow`”作为整体方案被拒绝。

新的决定是：`nb-workflow` 拥有规范脚本/Activity replay 语义，Cosmos 提供
Durable Backend/Host；Activity 是 journal 单元，Job/Attempt 承担宿主执行，
Step 是可选投影。对应 convergence 由
[`Task 06`](../tasks/06-nb-workflow-kernel-convergence/README.md) 单独实施。

本 ADR 的其余决定继续有效：`Job + Workflow` 组合、Cosmos 持有
Run/Journal/Job/Lease/Outbox 和领域 durable truth、双 lease fencing、输入快照、
Application Command 边界、KnowledgeSignal/ResearchRequest 分离，以及 Harness
不能持有 Cosmos Job 真相。

## Context

Cosmos 不只是定时抓取 RSS。未来同一个系统还需要编排来源采集、Entry 知识处理、跨渠道研究、Workspace 更新、摘要投递和用户/Agent 交互。它们都需要顺序、分支、等待、子任务、预算、重试、取消、租约和进程重启后的恢复。

当前 Phase 1/1B 已有固定 Source Ingest/Probe Job；本 ADR 落地过程中又建立了
脚本式 Durable Workflow Runtime，并把第一条 `cosmos.ingest@1` 接到 API、
schedule 和生产 Worker。通用自定义 Workflow、Connection、Knowledge 和 Research
仍未完成。继续增加 Adapter、LLM 或研究能力前，必须沿用同一个 durable truth，
不能再为每个功能创建专用队列。

本 ADR 原始决定把 `neuro-agent-harness` 和 `nb-workflow` 都视为
Agent/脚本执行语义参考，同时拒绝它们成为 Cosmos 领域状态、Job 租约和外部事实
的持久权威。ADR-0002 已把其中“`nb-workflow` 仅作参考”取代为“规范 Kernel +
Cosmos Durable Host”；拒绝双重 durable truth 的部分继续有效。

## Decision

### 1. 使用 Job + Workflow 组合

- `Workflow` 负责描述和执行流程：顺序、条件、循环、fan-out/fan-in、等待、子 Workflow、预算和收口。
- `Run` 是一次 Workflow 执行；`Step` 是 Run 内的逻辑阶段；`Job` 是 Worker 可领取的持久执行单元。
- `Job` 负责 lease、heartbeat、retry、恢复和终态；Workflow 不能绕过 Job 直接创建不可恢复的进程内任务。
- `DomainEvent` 记录已经发生的领域事实；它辅助审计、SSE 和触发，不替代状态表，也不要求完整 Event Sourcing。

### 2. 脚本式 Workflow 是最低层执行语义

脚本式 Workflow 是 Runtime 的底层形态，允许开发者使用 TypeScript 表达复杂控制流和 Action 组合。Graph、IR、Comfy 类表达是上层编排格式，必须转换为脚本式 Workflow 语义，不建立第二套执行引擎。

所有表达最终共享同一套 Run、Step、Job、lease、retry、cancel、journal、Event 和恢复合同。Graph/IR 不能直接执行任意网络、文件或进程操作。

### 3. 固定四类版本化合同

- `WorkflowDefinition`：可执行流程的版本化定义。
- `ActionDefinition`：可复用能力的版本化输入/输出、Capability、幂等、超时、取消和恢复合同。
- `TriggerBinding`：何时启动、绑定哪个来源/输入、使用哪个 Workflow 版本以及并发/计划策略。
- `WorkflowRun`：保存定义版本、输入快照、触发原因、业务 correlation、预算快照、父子关系、真实开始/结束时间、状态和输出引用。

已创建 Run 不因后来修改 Source、Connection、Trigger 或 Workflow 配置而改变含义。

### 4. Cosmos 持有 Workflow 的 durable truth

Cosmos 持有并持久化：

- Workflow、Run、Step、Job；
- lease token、lease expiry、heartbeat、retry 和 priority/lane/budget；
- checkpoint、等待原因、父子关系和取消状态；
- DomainEvent、Outbox、事件消费游标和领域状态；
- Observation、Entry、Revision、Asset、Story 等领域事实。

所有外部访问必须通过注册的 `ActionDefinition`/Connector；所有领域写入必须通过 Application Command/Service。Workflow 脚本不能直接导入 Prisma、SQLite、Blob Root、任意 HTTP Client 或任意进程 API。

### 5. Harness 不持有 Cosmos Job 的 durable truth

`neuro-agent-harness` 只负责 Agent Invocation、Session、Model Runtime、Profile、Agent 工具和 Agent 侧恢复能力。Cosmos 负责 Job、Lease、Workflow、Outbox、领域事件和信息库事实。

Phase 1 继续直接使用 `pi-ai`。Harness 稳定后，通过 Adapter/Port 接入，不把 Harness 运行时或 `nb-memory` 的内部存储复制进 Cosmos。

### 6. Lease fencing 覆盖整个写入窗口

Worker 领取 Job 后取得 `lease_token`。所有受保护写入都必须验证当前 token，包括：

- Observation、Entry、EntryRevision、Asset 和 Story projection；
- FTS/索引更新；
- DomainEvent、Outbox 和 checkpoint；
- Job/Step/Run 的中间状态和 terminal close。

lease 失效后，旧 Worker 必须被拒绝继续写入或推进 checkpoint。事实写入和 checkpoint 收口必须处于可验证的原子边界内；新 Worker 接管后，旧 Worker 不能覆盖其结果。

同一采集计划的 checkpoint 还必须具有单调 revision。Run 在入队时保存 expected
revision，提交时使用 CAS；已经被其它 Run 推进的旧结果只能记录为 superseded，
不能回滚较新的 cursor。该规则与 Run/Job lease fencing 同时成立，二者不能互相
替代。

### 6.1 Worker capability discovery 不替代 Run admission/ownership

Workflow Worker Registry 只保存 slot capability discovery projection。它可以帮助
诊断和未来 scheduler 找到声明支持某个 Workflow/Action 的 active Worker，但不
拥有 Run，也不替代 Run lease。

Worker 的 admission refresh 只提交正向的、与本地 Definition/Action、持久
catalog 和 Run definition snapshot 精确匹配的 `ready` 证据。单个 Worker 缺少
Action、catalog 或 snapshot mismatch 时，不得直接把全局 Run 写成
`definition_unavailable`；否则不同 capability Worker 之间会互相覆盖全局状态。

未来 `no_capable_worker` 应是独立的 availability/routing projection，必须带有
checkedAt、registry authority、stale window、lane 和 capability evidence。Registry
disabled、过期或不可用时，不能把空结果当成 Definition 不存在，也不能改变 Run
lease claim 的安全语义。

对外的 Worker capability 查询返回 discovery envelope，而不是裸数组：

```ts
{
    status: "enabled" | "disabled" | "unavailable",
    checkedAt: string,
    staleAfterMs: number,
    items: WorkflowWorkerSnapshot[],
}
```

查询成功但没有 active slot 时仍是 `enabled`；`disabled` 不查询 Registry；
只有显式 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 才启用查询，未设置时默认
disabled；`unavailable` 只表示 Registry 读取失败。该 envelope 是诊断/发现
投影，不参与 Run owner assignment、claim 或 admission 状态迁移。

`listActive()` 的空结果不是 projection 删除命令。需要观察 registration
生命周期的 consumer 使用独立只读 `listObserved()` inventory；它不暴露
registration token，并区分 `live`、`stopped` 和 `expired`。Capability
projection Runner 使用单次 `observe({ now, staleAfterMs })` 返回的 `checkedAt`
snapshot 同时取得 active 和 observed registration；`listActive/listObserved`
仍保留作为兼容读取。Capability projection 的 `listStale()` 只提供有界过期
候选查询；只有 Registry 可用、存在明确 terminal observation 且 cleanup grace
period 已过时，才允许产生 cleanup candidate。Runner 本身不执行删除或
tombstone，不改变 last-known admitted snapshot，也不取得 Run/Job lease。
Candidate 必须转换为普通 `maintenance` Workflow enqueue command；command id
由 Worker、projection revision、registration generation 和 terminal observation
稳定派生，Workflow input 只包含 expected projection revision、generation 和
业务时间，不包含任何 lease token。
当前 Application 已提供版本化 Cleanup Workflow/Action 的注册 seam：Action Job
由现有 Workflow Runtime 领取、续租、重试和恢复；Action 执行前重新观察相同的
registration terminal state/time 和 generation，再以 projection revision CAS 写入
`retiredAt`、retirement reason/terminal time，保留 last-known snapshot 并清空
projection lease。重复 invocation 返回 `already_retired`，registration 复活、
generation 已变化或 revision 已变化则安全跳过。该 Definition/Action 尚未接入
`apps/worker` 默认 wiring、scheduler 或 candidate consumer，故仍不是生产自动
cleanup。

同一个 `workerId` 首次 registration 的 generation 为 `1`，replacement 时递增，
heartbeat 不递增。Prisma retirement 使用同一条条件更新同时校验 generation、
terminal state/time、projection revision 和 `retiredAt IS NULL`，从而拒绝
re-check 后被替换的旧 registration。该 guard 只在同一 Prisma/SQLite Data Root
内成立；InMemory Store 只验证 reducer/运行语义，不能替代数据库原子性证明。

当前 registration 已以版本化字段持久化 Workflow/Action evidence；旧 registration
默认是 `evidenceVersion=0`、`legacy` 和空 evidence，当前 Runtime descriptor
使用 `evidenceVersion=1`、`local-executable`。但这些字段仍来自 Worker 自报，
不能单独作为某个 Run 的完整执行证明。Application 的
`WorkflowWorkerCatalogAdmissionService` 可以在显式读取 Definition/Action catalog
后生成 `catalog-admitted` 候选 snapshot，并由当前最小 projection runner 保存
独立的 capability projection；它仍不是 authority/availability projection，
也没有远程签名或信任根。因此缺少 evidence、catalog mismatch 或 source
unavailable 的 Worker 仍只能参与诊断，不能让 availability projector 直接写
`no_capable_worker`。

未来 capability evidence 至少要包含 Worker、Workflow manifest 和每个 Action
dependency 的 hash，以及 `observedAt`/`expiresAt`。只有精确匹配且 observation
未过期时，才能产生 `capable_worker_seen`；Registry disabled/unavailable、旧版
registration 或 mismatch 都必须保持不可判定，并且不改变 Run claim。

### 7. 单用户阶段直接运行，不建设审批 UI

当前单用户阶段按最大产品权限运行，不建设审批 UI 或细粒度权限模型。Capability、预算、Service Endpoint 和 Run 记录仍保留，用于可靠执行、数据范围、外部副作用审计和未来多人/远端/不可信扩展隔离。

### 8. Adapter 只通过 Source Operation/Action 接入

Adapter manifest 必须声明：

- Provider、版本、Source Operation 和 Action；
- 配置、输入/输出和稳定 external key 规则；
- `originLocator`、`discoveryContext`、媒体状态和 checkpoint 能力；
- SecretRef、ConnectorStateStore 命名空间、Capability、预算、超时、取消和恢复语义。

Adapter 不自行持久化 Secret，不直接写核心数据库。一个 Connection 可以绑定多个独立采集计划；每个计划拥有自己的 Trigger、WorkflowBinding、checkpoint、预算、错误和重试边界。

### 9. KnowledgeSignal 与 ResearchRequest 分离

`KnowledgeSignal` 只表示对内容的判断，例如 `urgent`、`needs_research`、`source_conflict` 或 `high_importance`。它保存证据、producer、版本、置信度和关联 Run，但不直接执行任务。

`ResearchRequest` 表示一次研究行动，保存 signal、目标、范围、priority、idempotency key、父 Run/Step、Workflow 版本、状态、预算、时间和结果引用。Trigger 根据 ResearchRequest 启动 Research Workflow。

Research Workflow 可以查询 Cosmos 信息库并访问已配置渠道；外部新发现必须重新通过统一 Ingest Command 进入 Observation → Entry，不能未经入库直接写 Story。

### 10. 当前实现边界

本 ADR 是设计合同。当前已实现脚本 Runtime、Prisma Store、Run/StepRun/Action
Job、等待/Child Workflow、Outbox/parent-wake、lane/priority、固定 Ingest
production wiring、双 lease 领域写入、checkpoint revision/CAS 和
`SourceExecutionSnapshot`。固定 `source.fetch@1` 只读取 Run input，排队后
修改 Source 不改变既有 Run；仍不宣称以下完整能力已经完成：

- 通用自定义 Workflow 的插件加载、稳定管理 API、Trigger/Binding 产品配置和
  完整 production 运维；
- Connection、SecretStore、ConnectorStateStore 和多个采集计划；
- Knowledge/Research Workflow、通用 Trigger Consumer、Outbox 外部发布、
  dead-letter 和循环保护；
- 把固定 Ingest 已验证的 fencing/CAS 扩展到全部未来领域写入和外部副作用；
- Harness/`nb-memory` Adapter。

当前用户可见实现仍以固定 Ingest Workflow、兼容 Probe Job 和 Phase 1 最小 Story
projection 为主；它证明了本 ADR 的第一条生产链路，但不是完整 Workflow 平台、
Connection 系统、Knowledge/Research Runtime 产品面或自动 cleanup subsystem。

## Consequences

### Positive

- Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 可以共用一套恢复、优先级和观测语义。
- Graph/IR/Comfy 可以迭代为用户体验，而不增加第二套执行器。
- 外部 Adapter、LLM 和 Harness 的替换不会改变 Cosmos 的事实、Job 和 Service 合同。
- Research 结果重新进入 Observation → Entry，来源事实、修订和 provenance 保持一致。

### Costs and risks

- 需要先实现较完整的 Runtime、持久 journal、lease fencing、Outbox 和测试矩阵。
- 脚本式 Workflow 的可恢复语义、动态 Action 调用和版本兼容需要严格约束。
- 当前单用户最大权限会把安全重点放在可信扩展、数据边界和可追溯性，而不是审批流程。

## Alternatives considered

### 每类功能各自实现专用 Job 队列

拒绝。短期简单，但会复制重试、租约、取消、恢复和事件语义，研究和知识处理很快会与 Ingest 分叉。

### 只使用 Graph/IR Runtime

拒绝。Graph 适合可视化和配置，但难以自然表达复杂脚本、动态循环和逐步恢复；它应转换到脚本语义，而不是成为第二个底层 Runtime。

### 让 Harness 持有全部任务状态

拒绝。Harness 的 Session/Model Runtime 生命周期与 Cosmos 的领域事实、外部副作用和 Job lease 不同；两边同时持有 durable truth 会产生分叉和恢复冲突。

### 直接复制 `nb-workflow` 或 `neuro-agent-harness`

拒绝直接复制/vendor。该历史选项不等于拒绝通过包依赖使用通用 Kernel：
ADR-0002 已决定依赖 `nb-workflow` 的规范脚本语义，同时由 Cosmos 保留 Service
Endpoint、领域 Command、Job/Lease、Outbox、Blob 和数据库边界。Harness 继续只
通过 Adapter 接入。

## Revisit Gate

在以下条件满足前不引入第二套 Runtime：

1. Durable Workflow Runtime 已通过 Run/Step/Job、lease fencing、重启接管、旧 Worker 拒绝和 checkpoint 行为测试。
2. 至少一个固定 Ingest Workflow、一个 Knowledge Workflow 和一个 Research Workflow 共用同一 Runtime。
3. Graph/IR 转脚本转换可以保存定义版本和输入快照，并保持 Action/Capability 边界。
4. Outbox、Event Consumer 和 SSE 恢复不会产生重复或丢失的领域更新。
5. Harness Adapter 已证明不会重复持有 Cosmos Job 的 durable truth。

## Verification requirements

- contract/domain：版本化 Definition、Context、稳定 external key、KnowledgeSignal/ResearchRequest 和错误码。
- runtime：幂等、lease fencing、heartbeat、接管、旧 Worker 拒绝中途写入、checkpoint 收口、优先级和预算。
- integration：Connector/Source Operation、Connection/Secret/State、Ingest/Knowledge/Research 链路和结果重新入库。
- recovery：进程重启、Outbox 重投、Event cursor、SSE `Last-Event-ID` 和 `snapshot_required`。
- production：Bun 开发、Node 生产、Docker/Compose、共享 Data Root 和独立 Worker。
