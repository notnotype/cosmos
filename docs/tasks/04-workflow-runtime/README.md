# Cosmos Workflow Runtime

> 状态：In progress / fixed Ingest production slice converged
>
> 本 Task 统一记录 Cosmos 后续 Workflow 基础建设，不把运行时拆成多个互相漂移的碎片 Task。
>
> 总体架构：[`../../architecture/0001-cosmos-foundation.md`](../../architecture/0001-cosmos-foundation.md)
>
> Durable Workflow ADR：[`../../adr/0001-durable-workflow-runtime.md`](../../adr/0001-durable-workflow-runtime.md)
>
> Kernel/Host ADR：[`../../adr/0002-nb-workflow-kernel-cosmos-host.md`](../../adr/0002-nb-workflow-kernel-cosmos-host.md)
>
> 后续收敛 Task：[`../06-nb-workflow-kernel-convergence/README.md`](../06-nb-workflow-kernel-convergence/README.md)
>
> 产品需求：[`../../requirements/0002-product-requirements.md`](../../requirements/0002-product-requirements.md)
>
> 当前实现状态：[`../../../PROJECT-STATUS.md`](../../../PROJECT-STATUS.md)

## 1. 背景

Cosmos 已完成 Phase 1 最小服务器闭环、Phase 1B 的部分受管采集切片，以及第一条
固定 Ingest Workflow 生产接线。API 手动触发和 schedule 已走通用
Run/StepRun/Action Job Runtime；Probe 和兼容入口仍使用旧 Source Job。产品后续
仍需让 Knowledge、Research、Maintenance、Delivery、Interaction 和用户自定义
Workflow 共用同一个可恢复执行基础。

本 Task 采用 `Job + Workflow`：

- Workflow 负责流程、分支、等待、子任务和收口。
- Run 表示一次 Workflow 执行。
- Activity 表示 journal 中需要稳定恢复的调用、查询、等待或非确定性操作。
- ActionDefinition 表示 Activity 调用的版本化能力合同。
- Job 表示 Host 为 Activity 创建的可领取任务。
- Attempt 表示 Worker 持有 lease 的一次实际执行。
- Step 表示可选逻辑分组/UI 投影，不再是底层必需原语。
- DomainEvent 表示已经发生的事实。

脚本式 Workflow 是最低层执行语义。Graph、IR、Comfy 等上层表达只转换为脚本
语义，不建立第二套 Runtime。ADR-0002 已把 `nb-workflow` 固定为规范脚本 Kernel；
Cosmos 提供 Durable Backend/Host、TaskStore、Job/Lease、Outbox 和领域事务。
`neuro-agent-harness` 只负责 Agent/Session/Model Runtime，不能与 Cosmos 同时
持有 Job 的 durable truth。

本 Task 的固定 Ingest Spike 是持久化、恢复和产品 parity 证据，不再继续扩展成
与 `nb-workflow` 平行的通用脚本内核。后续 Kernel 收敛、API/Worker 解耦和
TaskStore/WakeupBus 进入 Task 06。

## 2. 目标

建立一个不依赖 RSS、Bilibili、LLM 或具体 UI 的通用 Workflow 公共合同，使以下链路都能使用相同的 Run/Activity/Job/Attempt、租约、预算、事件和恢复机制：

```text
Trigger
  -> WorkflowDefinition@version
      -> WorkflowRun(inputSnapshot)
          -> Journal / Activity
              -> ActionDefinition@version
                  -> Job
                      -> Attempt + Lease
                          -> Application Command / Query
          -> Step projection (optional)
```

## 3. 范围

### 3.1 公共合同与运行时

- Workflow、Action、Trigger 的版本化 schema。
- Activity identity、fingerprint、journal replay 和可选 Step projection。
- `WorkflowContext`：
  - `callAction`
  - `query`
  - `startChildWorkflow`
  - `waitForSignal`
  - `checkpoint`
  - `emit`
  - `isCancelled`
  - `getBudget`
- Run/Activity/Job/Attempt 状态、输入/输出引用、父子关系、等待原因和终态错误。
- priority、lane、budget、waiting、递归深度和并发限制。
- 版本化 DomainEvent、Outbox 和 Event Consumer cursor。

### 3.2 Durable 恢复

- 业务幂等键。
- lease token、过期时间、heartbeat 和接管。
- 有界重试、指数退避和终态失败。
- lease fencing 覆盖 Observation、Entry/Revision、Asset、FTS、Event、Outbox、checkpoint 和 terminal close。
- 旧 Worker 不能在 lease 失效后继续写入或推进 checkpoint。
- Run/Job 收口必须保持一致性；恢复不能依赖进程内内存。

### 3.3 Connection、Adapter 与采集计划

- `ConnectionInstance`、`SourceInstance`、`TriggerBinding`、`WorkflowBinding` 和用户可见的采集计划。
- `SecretStore` 与 `ConnectorStateStore` 的 Port/Adapter。
- 一个 Connection 下多个独立采集计划，各自拥有 checkpoint、discovery context、预算、错误和重试边界。
- Adapter manifest：
  - Provider 与版本；
  - Source Operation；
  - Action；
  - 配置/输入/输出 schema；
  - stable external key；
  - `originLocator` 与 `discoveryContext`；
  - SecretRef、StateStore namespace；
  - Capability、限流、超时、取消、重试和恢复。

### 3.4 Ingest、Knowledge 与 Research

- Ingest Workflow 先保存 Observation、Entry、Revision、Asset 和最小 Story，不等待 LLM。
- Observation 永远追加，不覆盖。
- 无 URL 内容的 stable external key 必须使用完整 `sourceLocator`。
- Knowledge Workflow 支持脚本优先、模型辅助和 Agent 升级策略。
- `KnowledgeSignal` 与 `ResearchRequest` 分离。
- Research Request 的状态、priority、budget、idempotency、父子关系、失败恢复和结果引用。
- Research Workflow 可以查询 Cosmos 并访问已配置渠道；外部发现重新进入 Observation → Entry。
- Trigger Consumer 的循环保护、重复触发合并和研究预算。

### 3.5 Harness/记忆接入边界

- 为 `neuro-agent-harness` 预留 Agent Invocation、Session、Model Runtime、Profile 和 Capability Adapter。
- 为 `nb-memory` 预留共享知识管理者记忆/知识库的 Adapter/Port。
- 不把 Harness 或 `nb-memory` 的内部存储复制进 Cosmos。
- Phase 1 继续直接使用 `pi-ai`，接入不阻塞本 Task 的基础 Runtime。

## 4. 非目标

- 不实现完整 Graph UI。
- 不实现通用 Agent UI。
- 不实现多用户权限、租户或审批系统。
- 不实现推荐算法、用户行为偏好模型或平台推荐信号独立模型。
- 不在本 Task 接入全部平台。
- 不把 `nb-workflow`、`nb-memory` 或 Harness 直接复制进 Cosmos。
- 不在本 Task 继续扩展 Cosmos 自有 replay 内核；收敛工作属于 Task 06。
- 不把一条固定 Ingest Workflow 误报为完整的用户自定义 Workflow 平台。

## 4.1 Convergence handoff

截至 2026-08-11，本 Task 的执行方向由 ADR-0002 部分修正：

- 现有 Prisma Store、Job/Lease、Worker、Outbox、双 fence、checkpoint CAS 和
  固定 Ingest 保留。
- Cosmos `packages/workflow-runtime` 中的脚本 replay、path 和等待语义只作为
  parity 基线，不再新增 Knowledge/Research/Agent 能力。
- `nb-workflow` 的 Core/Runtime/Backend/Testing 拆分只是草案，实际代码调整在
  独立仓库 Task、分支和 worktree 中进行。
- SQL TaskStore 是任务权威；WakeupBus/Redis 只做可选通知。Redis、PostgreSQL 和
  S3 不在当前 Task 04 实现。
- `wf.agents.invoke` 属于可选 Agent Extension，等待 Harness 文档；Core 不依赖
  Harness。

Task 04 walkthrough 继续保存 Spike 的历史证据；Task 06 从这些证据建立
conformance/parity，不重写历史 Round。

## 5. 历史实施顺序

下列顺序记录 Task 04 Spike 的原始推进方式。ADR-0002 之后的规范 Kernel 和
Activity/Attempt 收敛顺序以 Task 06 为准。

### Step 1：术语和公共合同

- 统一使用 `Workflow`；旧 `Flow` 只在原始需求或历史迁移说明中保留。
- 定义 Definition、Binding、Run、Step、Job、Action、Trigger、Event、Error 和 Capability schema。
- 定义协议版本、输入快照、输出引用和错误可操作性。

### Step 2：Durable Run/Step/Job Runtime

- 持久状态表与 Application Service。
- Job claim、lease、heartbeat、retry、waiting、cancel 和 terminal close。
- priority/lane/budget 与父子关系。
- 基于持久状态恢复，不依赖内存队列。

### Step 3：Lease fencing 和恢复

- 所有受保护写入都检查 lease token。
- Ingest 事实写入、FTS、DomainEvent、Outbox 和 checkpoint 收口。
- 进程中断、租约过期、Worker 接管和旧 Worker 拒绝提交。
- 明确未知外部结果和不能自动重试的副作用。

### Step 4：Trigger、Connection 和采集计划

- TriggerBinding、schedule/poll/event/condition/dependency。
- Connection、SecretRef、SecretStore、StateStore。
- 一个连接多个采集计划的隔离 checkpoint、预算和错误。
- Trigger Consumer 与重复触发/循环保护。

### Step 5：Connector/Adapter manifest

- Source Operation/Action 注册。
- 输入、输出、稳定 external key、origin locator、discovery context 和媒体状态。
- Adapter 只能通过 Service/Command/Query/Action 访问核心能力。

### Step 6：Ingest identity/provenance

- 无 URL fallback key 使用 `sourceLocator`。
- Observation、Entry、Revision、Asset 和 Story provenance。
- `create`、`update`、`delete`、`snapshot`/tombstone 语义。
- Run 保存定义版本、Source 配置和输入快照。

### Step 7：KnowledgeSignal/ResearchRequest

- Knowledge Workflow 的 Proposal/Signal 输出。
- Research Request 状态机、幂等、priority、budget、父子关系和结果引用。
- Research 结果重新进入统一 Ingest Command。

### Step 8：Outbox 和事件消费者

- DomainEvent 持久化和 Outbox 投递。
- Consumer cursor、幂等和失败重投。
- Run、Job、Feed 和 Research 事件。
- 无法补齐事件时的 `snapshot_required`。

### Step 9：Graph/IR 转换边界

- Graph/IR schema 只表达可转换的 Workflow。
- 转换结果引用脚本 WorkflowDefinition 版本。
- 转换不得绕过 Action、Capability、lease、retry 和恢复。
- 不做反向脚本到 Graph 的强制转换。

### Step 10：Harness/`nb-memory` Adapter 预留

- Agent Invocation 与 Cosmos Job/Run 的映射。
- Session/Profile/Model Runtime 的边界。
- 共享记忆读写 Port、Node 生产兼容性和存储生命周期。
- 验证 Harness 不持有 Cosmos Job 的 durable truth。

## 6. 最小合同

### KnowledgeSignal

```text
id
targetType
targetId
targetRevisionId
kind
reason
evidenceRefs
producer
producerVersion
confidence
runId
createdAt
```

建议的 `kind`：

```text
urgent
needs_research
source_conflict
high_importance
```

Signal 是追加式判断，不覆盖旧判断。

### ResearchRequest

```text
id
signalIds
goal
scope
priority
idempotencyKey
parentRunId
parentStepId
workflowRef
workflowVersion
status
createdAt
startedAt
finishedAt
resultRefs
error
```

状态：

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
                  -> expired
```

### WorkflowContext

```ts
type WorkflowContext = {
    callAction(actionRef: string, input: unknown, options?: unknown): Promise<unknown>;
    query(queryRef: string, input: unknown): Promise<unknown>;
    startChildWorkflow(workflowRef: string, input: unknown, options?: unknown): Promise<unknown>;
    waitForSignal(signalRef: string): Promise<unknown>;
    checkpoint(value: unknown): Promise<void>;
    emit(event: unknown): Promise<void>;
    isCancelled(): boolean;
    getBudget(): unknown;
};
```

具体 schema、journal 和行为由本 Task 的 focused tests 固定，不能由某个 Connector 或 UI 私自定义。

## 7. 当前状态与风险

架构状态：固定 Ingest 生产链已收敛并可作为 parity 基线；通用脚本内核方向已
转交 Task 06。当前 Cosmos Spike 尚未依赖 `nb-workflow`，TaskStore/WakeupBus、
manifest-only API、独立 Migrator 和 Agent Extension 也尚未实现。以下“已存在”
描述当前 Spike 证据，不表示 ADR-0002 的目标组装已经完成。

### 已存在

- Phase 1 固定 `cosmos.ingest@1` Workflow 与兼容 Probe/legacy Job。
- Prisma/SQLite、FTS、Blob、Observation/Entry/Revision/Asset 和最小 Story projection。
- API/Worker 的基础 Job lease、heartbeat、retry、checkpoint 和 SSE。
- API 手动 Source Run 与 schedule 通过 Prisma atomic
  `WorkflowCommandRepository` 创建版本化 Ingest Run；默认
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`，Worker 注册并执行
  `source.fetch@1 → library.ingest@1[] → source.checkpoint@1`。
- 固定 Ingest 的 Observation、Entry/Revision、Asset、最小 Story、FTS、
  DomainEvent/Outbox 与 checkpoint 写入同时验证 Workflow Run lease 和 Action
  Job lease；两个 Prisma Runtime 的接管测试证明旧 Worker 不能继续提交。
- URL-free fallback identity 已包含 `sourceLocator`；Observation discovery
  context 保存 manual/schedule、Workflow ref 和 Action command key。缺少条目级
  稳定 locator 时，内容变化仍可能创建新 Entry，不能把弱 fallback 误报成稳定
  external identity。
- Workflow Run 保存 definition/input/correlation、lane/priority/budget 和真实
  startedAt/finishedAt；Source query 通过 correlation 投影最近运行和错误。
- 固定 Ingest Run 保存独立 `SourceExecutionSnapshot`、cursor、checkpoint revision
  和 trigger；`source.fetch@1` 不再读取当前 Source。相同幂等键重放复用首次快照，
  排队后修改 Source 配置不会改变该 Run 的外部读取。
- Source checkpoint 保存单调 revision，Run 输入快照 expected revision；并发旧
  Run 记录 `source.checkpoint.superseded.v1`，不覆盖较新 cursor。
- retryable Action 在 `nextAttemptAt` 前不会让父 Run 被 Worker 反复领取。
- Workflow journal 使用版本化 typed-tree codec 保存 `Uint8Array` 等运行时值，
  marker-shaped 用户对象不会被误转；旧 `__cosmosType` 数据仍可读取。
- 尚未进入 `origin/master` 的 Workflow spike migrations 已压缩为单个
  `20260810170000_workflow_runtime`；当前最终树共 4 条 migration。历史 Round 中
  的 8–26 条计数描述压缩前的 spike 过程，不是当前部署清单。
- 脚本式 Workflow Runtime spike：Run orchestration、Action Invocation、Action Job、Signal、checkpoint、child wait/start、child terminal StepRun propagation、journal replay 和 Run/Job lease fencing。
- `apps/worker` 已通过统一 `WorkerPollerSupervisor` 接入 Workflow Run lane，
  默认并发为 `1`，也可显式设为 `0` 关闭；每个 slot 使用稳定 owner，宿主 stop
  signal 会传播到 Runtime/Action，abort 后保留 lease 让后续 Worker 接管。
- 真实 Prisma/SQLite Store 已通过同一个 Worker Run lane 验证：持久 Run 能由
  lane dispatch；宿主 lane abort 后，过期 Run/Action Job 能由新 lane reclaim
  并成功收口。
- Source Job claimant 已按 `jobKinds` 隔离；它不会消费
  `workflow-action`，避免固定 Ingest Worker 把 Workflow Action 误判为
  `unsupported_job`。
- `WorkflowRuntime.enqueue()` 已成为“校验 Definition → 持久化 queued Run”
  的最小提交边界；`start()` 复用该路径，未知 Definition 不会通过 Runtime
  API 入队。
- Worker 的 `claimNextRun()` 现在按已注册 `workflowRefs` admission；未知
  Definition 即使已经在 queued，也不会被当前 Worker 领取后误终止。
- Node production Worker entry 已在隔离 Data Root 启动，日志显示 Workflow
  lane 生效，并在同一 SQLite 中写入 `ready` heartbeat；通过显式 IPC test
  control 已验证 `worker.stopped`、资源关闭和 `stopped` heartbeat，但
  Windows OS 子进程 `SIGTERM` 仍未作为通过项。
- Prisma Workflow Store spike：WorkflowRun、WorkflowStepRun、Action Invocation、持久 DomainEvent、Outbox message、per-Consumer delivery、Consumer cursor 和基本 claim/ack/fail。
- Generic Outbox Consumer Runner spike：单次 claim → handler → ack/fail tick，带错误分类和 lease-lost 结果。
- Consumer Registry/Binding spike：Definition 不可变、Binding revision/CAS 和从持久配置解析 Runner。
- `WorkflowCommandService` spike：统一 catalog、Binding 和 Run enqueue 的应用层
  控制入口；command id 会产生 system-scoped DomainEvent/Outbox，Run enqueue
  具备 durable idempotency。
- `WorkflowCommandRepository` 已增加 Prisma atomic 实现：catalog、Binding 和
  Run enqueue 可以把状态变更、DomainEvent 与 Outbox 放在同一个 transaction；
  同一 commandId 的并发请求只保留一个结果。固定 Ingest 的 API、schedule 和
  Worker 生产组装已经注入该 repository；其它未来 Command 仍需逐条固定事务
  边界。
- Workflow Run admission projection：`unknown`、`ready` 和
  `definition_unavailable`，不可用 Run 不参与 claim，Definition 恢复后可由同一
  Runtime 重新领取；当前 Worker refresh 只写正向 `ready`，不会把单个 Worker
  的负面本地观察升级成全局 `definition_unavailable`。后者及未来
  `no_capable_worker` 需要独立的权威 projector；aggregate-only Outbox event 已
  通过 Prisma/SQLite 验证。
- `WorkflowRuntime.describeWorkerCapabilities()` 已把本地 Worker 的
  `workerId`、`lane`、`workflowRefs` 和 `actionRefs` 变成显式 descriptor；
  admission diagnostics 会带上这份 snapshot。Run lease 仍是实际 ownership，
  descriptor 目前只用于本地路由过滤和诊断；refs/capabilities 是 discovery hint，
  不是精确 Run snapshot 的 manifest evidence。
- 新增不落库的 `assessWorkflowWorkerCapability()` 纯评估，验证
  `WorkerEvidence × RunDefinitionSnapshot → capable/ineligible/unknown`；它只
  固定未来 evaluator 的状态语义，不接入 claim、scheduler、Registry persistence
  或 API。
- 新增不落库的 `aggregateWorkflowWorkerAvailability()`，要求 fresh enabled
  discovery 和 `assessmentComplete=true` 才能生成 `no_capable_worker`；partial、
  stale、disabled、unavailable 或 unknown evidence 都不能升级成该状态。
- `WorkflowWorkerRegistration` 已通过 InMemory/Prisma Registry 和真实 Worker
  lane 生命周期接入：每个 Workflow slot 启动时注册，独立 TTL timer 与每次
  poll 前 heartbeat，token/TTL 失效后重新注册，slot drain 后停止注册。
  Registry 是 capability discovery projection，不替代 Run lease；注册失败
  fail-open，不阻断 Workflow Runtime 执行。
- Worker registration 已增加版本化 Workflow/Action evidence 的兼容持久化；
  Round 87–97 已验证 catalog admission Application port/Prisma bridge、独立
  capability projection reducer、最小 InMemory/Prisma durable projection store
  和独立 runner tick，以及两个 Prisma client/runner 之间的跨进程 lease
  fencing。新增的 `listObserved()` 只读 inventory 能区分 live、stopped 和
  expired registration；`observe({ now, staleAfterMs })` 在一个
  `checkedAt` snapshot 中同时提供 active 和 observed registration；
  `listStale()` 只返回过期 projection，runner 结合 terminal observation 和
  grace period 生成 cleanup candidate，但不直接清理，也不清除 last-known
  admitted snapshot。cleanup candidate 现在可以转换成带
  `expectedProjectionRevision`、`registrationGeneration` 和稳定 command id 的
  `maintenance` Workflow enqueue command；Application 已提供可显式注册的
  Cleanup Workflow/Action catalog 和最小 Runtime 执行 seam。Action Job 会重新
  核对 terminal observation/generation，并用同一条 Prisma 条件更新做 revision
  CAS，设置 `retiredAt`/tombstone、保留快照和清空 projection lease；重复
  invocation、registration 复活、generation replacement 和旧 revision 均有
  明确结果。availability scheduler、独立生产 consumer、自动 candidate 消费、
  query API、delete/purge policy 和自动 registration 消费仍未实现。
- Application Query、Nest API 和 HTTP Service Client 已提供只读 active Worker
  capability 查询；返回带 `status`、`checkedAt`、`staleAfterMs` 和 `items` 的
  discovery envelope，不暴露 registration token。`enabled + items=[]` 表示查询
  成功但当前为空；`disabled` 不查询 Registry；`unavailable` 表示 Registry
  查询失败。API/Worker 只有显式 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 才启用
  Registry，未设置时默认 disabled。该查询仍不参与 owner assignment、scheduler
  或 Run admission。

### 仍缺

- `nb-workflow` Kernel/Backend Port 与 Cosmos Prisma Host convergence；当前仍是
  两套平行脚本实现，不能在此基础上继续扩展通用 Knowledge/Research/Agent。
- 正式 TaskStore/WakeupBus Port、自适应 polling、可选通知和通知丢失/重复测试；
  Redis/PostgreSQL Adapter 均未实现。
- API manifest-only、Worker executable-only、独立 Migrator 和远程 Worker
  Gateway 边界尚未落地。
- Worker 默认执行内置 Ingest 与 receipt reconciliation Workflow；插件 manifest
  安装、通用 Definition/Action 导入、自定义 Workflow 生产加载和完整管理 API
  尚未完成，因此不能宣称用户自定义 Workflow 已生产可用。
- Workflow Run lane 已有最小父子 Workflow wait/resume、timeout、取消传播和
  parent-wake wiring，但 API 仍没有完整的 Workflow/Run/Step/Job 管理入口，
  真实生产进程的 signal/restart/reclaim 尚未验收。
- 固定 Ingest 仍有 Blob preflight 与事务复核之间的极窄 race；未来
  Asset/Knowledge/Research Command 需要复用同一 lease fencing。
- Connection/Secret/State、多采集计划和 Adapter manifest。
- Knowledge/Research、Outbox 外部发布、通用 Trigger Consumer、Consumer Registry
  的 API/Transport 接入、Harness/`nb-memory` Adapter。
- 固定 Ingest 的 API/Worker command wiring 已使用 Prisma atomic repository；
  其它未来 Command 和测试用 InMemory adapter 仍需逐条确认原子边界。
- admission refresh 只处理当前 Worker 已注册的 Workflow refs；未知插件的 Run
  仍保持 queued，后续拥有该 ref 的 Worker 可以接管。持久 Worker Registry
  已存在并能记录 slot capability 与版本化 Workflow/Action evidence；纯
  capability evaluator、catalog admission port、Prisma Definition Registry
  bridge、projection reducer、registration observation、stale candidate query
  和最小 Cleanup Workflow/Action Job 已有 focused/runtime smoke coverage；
  `registrationGeneration` 已保护同一 Prisma/SQLite Data Root 内
  replacement-before-retire 的条件更新，但跨 Worker owner assignment、无 owner
  的 API projection、durable availability、自动 candidate consumer、delete/purge、
  远程 Worker 和插件 manifest handshake 仍未实现。catalog-admitted snapshot
  当前不会自动写回 registration，也不改变 Run claim。
- Outbox 的 per-Consumer delivery 已完成最小 spike，但旧 message-level 状态字段仍保留，尚未完成生产迁移和清理。
- Outbox 已有最小 bounded retry/backoff policy，但 Consumer policy 持久化、dead-letter、`snapshot_required` 和外部副作用幂等尚未完成。
- 固定 Ingest 只表达 manual/schedule provenance；关注账号、推荐流、搜索、
  公告监控和 Research 仍需由未来采集计划提供完整 discovery context。
- 内容寻址 Blob 在领域事务前预写，极端中断会留下不可见 orphan bytes；Blob GC
  尚未实现。
- Source/Connection/多采集计划 StateStore、Source 删除与历史保留语义仍未完成。
- URL-free fallback 缺少显式 `identityStrength`、`identityVersion` 和
  `identityBasis`；没有条目级稳定 locator 时，来源修订可能形成新 Entry。
- fetch page/item 当前在 Job result、Invocation result、Step output 和后续
  Action input 中重复持久化；大 Feed/媒体前需要 value/reference 与 journal
  retention。
- `listSources()` 当前按 Source 分别查询 legacy Run 与 Workflow Run，查询量为
  `1 + 2N`；Phase 1 小规模可接受，扩展采集计划前应改为批量 projection。

## 8. 验证要求

所有验证分开报告：

- contracts/domain：版本化合同、错误、稳定 ID、Signal/Request 和 Proposal。
- storage：隔离 Data Root、迁移、Repository、Blob containment、FTS 和 checkpoint。
- runtime：幂等、lease fencing、接管、旧 Worker 拒绝中途写入、优先级、预算和等待。
- ingestion：URL、无 URL、重复、修订、媒体状态、delete/tombstone 和 discovery context。
- API：Workflow、Source、Run、Step、Job、Research、Event 和错误响应。
- SSE：正常推送、cursor、`Last-Event-ID`、重连和 `snapshot_required`。
- browser：Source 配置、运行触发、Feed/Search/详情和服务异常状态。
- production：Bun 开发、Node 生产、standalone Web、Docker、migration、共享 Data Root。

未运行的代码、Docker、浏览器、真实来源、长时间恢复和真实 Agent 验收不得由文档检查替代。

## 9. Spike A：脚本式 Workflow 最小运行语义

### 9.1 目的

在不改动现有固定 Ingest Runtime 的前提下，验证脚本式 Workflow 是否可以通过统一的 `Run → Action Invocation → Job` 语义实现等待、恢复、幂等和租约 fencing。

### 9.2 实现

新增 `packages/workflow-runtime` spike 包：

- `WorkflowDefinition<I, O>`：版本化脚本 Workflow。
- `ActionDefinition<I, O>`：版本化可调用能力。
- `WorkflowContext`：`callAction`、`query`、`startChildWorkflow`、`waitForSignal`、`checkpoint`、`emit`、取消和预算读取。
- `WorkflowStore`：运行时依赖的持久化 Port。
- `InMemoryWorkflowStore`：只用于 spike 和行为测试，不作为生产存储。
- Workflow Run orchestration lease，以及 Action Job lease heartbeat。
- Action Invocation 与 Job 的稳定幂等键。
- 等待信号后的 resume。
- 已完成 Action 的 journal replay。
- 旧 lease token 拒绝 Job completion。

最小验证路径：

```text
Workflow
  → Action Job 执行一次
  → checkpoint
  → waitForSignal
  → signal + resume
  → journal replay
  → 不重复执行已完成 Action
```

### 9.3 结论与限制

- 脚本式 Workflow 可以建立在可替换 `WorkflowStore` 之上，后续可以用 Prisma 实现同一 Port。
- `callAction` 必须产生稳定 path/idempotency key；当前 spike 允许显式 `key`，未提供时才使用顺序 fallback。
- Graph/IR 不需要独立 Runtime，但需要编译为带稳定 path 的脚本 Workflow。
- 当前初始 Spike A 尚未实现持久 Outbox；后续 Spike B 已验证 Outbox 的持久化和基本投递控制，但仍未实现真实外部发布、Child Workflow 调度、非 Action 类型的 StepRun 和生产级恢复。
- 当前 spike 的 `InMemoryWorkflowStore` 不能被 API/Worker 直接使用，也不能替代当前 Cosmos Repository。

### 9.4 验证

- `bun run --cwd packages/workflow-runtime typecheck`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts`：2 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run test`：16 个测试文件、65 个测试通过。

## 10. Spike B：持久 Outbox 的 claim/ack/fail

### 10.1 目的

验证 DomainEvent 产生的 Outbox message 能否在 SQLite 中被 Worker 安全领取、接管、确认和失败重试，并且旧 Worker 不能在租约失效后继续改变投递状态。

### 10.2 实现

- `WorkflowOutboxMessage` 通过 `eventSequence` 与 DomainEvent 顺序关联。
- `WorkflowOutboxConsumerCursor` 持久保存 Consumer 的高水位位置。
- `WorkflowStore` 增加：
  - `claimOutbox`
  - `ackOutbox`
  - `failOutbox`
- InMemory 和 Prisma Store 都支持：
  - pending message claim；
  - 过期 lease takeover；
  - 旧 token ack/fail 拒绝；
  - retryable failure 返回 pending 并延迟 1 秒；
  - terminal failure 保持 failed，不再自动领取；
  - 按 `eventSequence` 严格顺序领取，前序 leased/pending/failed 会阻塞后续消息；
  - ack 与 cursor 推进在同一 Prisma transaction 中完成。
- 修复 InMemory Outbox 使用 event ID 与 message ID 混用导致的重复 pending 副本。

### 10.3 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、9 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、67 个测试通过。
- 在隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：8 条 migration 全部通过。

### 10.4 偏差与限制

- 首次 focused test 暴露 InMemory message key 错误；修复后重新运行并通过。
- 顺序 focused test 暴露 InMemory 和 Prisma 都会跳过前序 leased message；修复为严格按 `eventSequence` 扫描后重新运行并通过。
- 还没有外部 publisher、Consumer crash/restart 全链路、指数退避、最大尝试次数、dead-letter 或 `snapshot_required`。
- 当前 cursor 只服务于 Outbox spike，尚未与 SSE `Last-Event-ID` 统一。

## 11. Spike C：per-Consumer Group Outbox delivery

### 11.1 目的

验证同一条 DomainEvent 能否被 Knowledge、Delivery、SSE 或其它独立 Consumer Group 各自消费，而不共享 message-level lease、ack 和 cursor。

### 11.2 实现

- 新增 `WorkflowOutboxDelivery(messageId, consumerId)`。
- Outbox message 保留事件事实和 payload；delivery 保存每个 Consumer Group 的：
  - status；
  - attempts；
  - availableAt；
  - lease owner/token/expiry；
  - last error；
  - publishedAt。
- `claimOutbox` 按 Consumer Group 懒创建 delivery，并对每个 Group 独立执行严格 `eventSequence` 领取。
- `ackOutbox`、`failOutbox` 通过 `consumerId + messageId + leaseToken` fencing。
- ack 与对应 Consumer cursor 仍在同一 Prisma transaction 中收口。
- InMemory Store 与 Prisma Store 保持同一行为合同。
- `failOutbox` 公共合同增加 `consumerId`，避免错误地修改其它 Consumer Group 的 delivery。

### 11.3 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、13 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、71 个测试通过。
- 在隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：9 条 migration 全部通过。

### 11.4 偏差与限制

- 首次 Prisma focused test 暴露 Delivery 缺少 `publishedAt`；补齐 schema/migration 后重新运行并通过。
- 旧 `WorkflowOutboxMessage` 的 status/lease/attempt 字段仍保留在 schema 中，当前只作为历史兼容字段；per-Consumer delivery 才是新 claim/ack/fail 的事实来源。生产化前需要单独完成迁移、清理和监控语义收口。
- 仍没有外部 publisher、Consumer crash/restart 全链路、dead-letter、`snapshot_required` 或 SSE cursor 统一。

## 12. Spike D：bounded retry 与 exponential backoff

### 12.1 目的

验证 delivery 失败不应无限以固定间隔重试；重试策略需要有界、可计算，并在达到最大尝试次数后进入 terminal `failed`。

### 12.2 实现

- 新增 `WorkflowOutboxRetryPolicy`：
  - `maxAttempts`；
  - `baseDelayMs`；
  - `maxDelayMs`。
- 默认策略为：

```text
maxAttempts = 3
baseDelayMs = 1000
maxDelayMs = 60000
```

- `resolveWorkflowOutboxFailure` 统一计算 retryable failure 的状态和下一次可领取时间。
- 第一轮失败按 base delay，后续按指数退避并受 max delay 限制。
- 达到 `maxAttempts` 后，即使调用方仍标记 retryable，也进入 terminal `failed`。
- InMemory 和 Prisma Store 都在 lease fencing 下使用相同策略；Prisma failure close 在事务中读取 attempts 并条件更新。

### 12.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、15 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、73 个测试通过。
- 在隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：9 条 migration 全部通过。

### 12.4 偏差与限制

- Retry policy 当前由调用方传入，是一次失败处理的输入快照；尚未作为 Consumer Definition/Binding 的持久版本化配置。
- terminal `failed` 仍会阻塞当前 Consumer Group 的 eventSequence，dead-letter/人工 skip 尚未实现。
- 外部 publisher 的未知结果、Consumer crash/restart 和 `snapshot_required` 仍未覆盖。

## 13. Spike E：generic Outbox Consumer Runner

### 13.1 目的

验证 Worker 如何使用同一套 Store Port 完成一次可恢复的 `claim → handler → ack/fail`，并把 handler 错误、重试和 lease 丢失显式返回给上层调度器。

### 13.2 实现

- 新增 `WorkflowOutboxConsumer`，每次 `runOnce()` 最多处理一条 delivery。
- handler 成功后调用 `ackOutbox`；ack 因 lease 失效被拒绝时返回 `lease_lost`。
- 提供：
  - `WorkflowOutboxRetryableError`；
  - `WorkflowOutboxTerminalError`；
  - 可替换的 `classifyError`；
  - `idle`、`published`、`retry_wait`、`failed_terminal`、`lease_lost` 结果。
- 未显式标记为 retryable 的未知异常默认按 terminal 处理，避免错误无限重试。
- Runner 只负责一次 tick 和状态收口，不负责长循环、外部 HTTP、SSE 或具体发布副作用。
- 增加 InMemory 和 Prisma Store 的 Runner 行为测试。

### 13.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、19 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、77 个测试通过。
- 本轮没有修改 Prisma schema；Round 11 已验证的隔离 Data Root migration（9 条）仍适用。

### 13.4 偏差与限制

- Runner 尚未提供长循环、并发 worker pool、consumer registration、事件过滤或 retention。
- handler 已经完成外部副作用但 ack 丢失时，恢复会再次执行 handler；这仍是 at-least-once，外部副作用必须由 Action/Publisher 自己提供幂等键或 receipt。
- Runner 没有把“外部结果未知”自动变成成功或失败；需要后续 Delivery/Receipt 合同。
- 仍未接入 API/Worker 的实际生产循环。

## 14. Spike F：Consumer Definition/Binding 与事件过滤

### 14.1 目的

把 Consumer Group 订阅哪些事件从 Runner 的隐含逻辑提升为版本化 Definition/Binding 合同，并确保不匹配的事件不会阻塞该 Consumer 的 cursor。

### 14.2 实现

- 新增版本化合同：
  - `WorkflowOutboxConsumerDefinition`；
  - `WorkflowOutboxConsumerBinding`。
- Definition 最小字段：
  - `id`；
  - `version`；
  - `eventTypes`；
  - `leaseMs`；
  - `retryPolicy`。
- `WorkflowOutboxConsumer` 可以从 Definition 读取 event filter、lease 和 retry policy。
- `claimOutbox` 支持 `eventTypes`：
  - 不匹配事件创建/更新为 `skipped` delivery；
  - 同一 Consumer cursor 在同一 Store 操作中推进；
  - 匹配事件继续走 claim → handler → ack/fail；
  - `skipped` 与 `published` 一样不会再次领取。
- InMemory 和 Prisma Store 保持同一过滤语义。

### 14.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、21 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、79 个测试通过。
- 本轮没有新增 Prisma migration；`skipped` 使用现有 String status 字段，Round 11 的 9 条 migration 仍适用。

### 14.4 偏差与限制

- Definition/Binding 当前是公共运行时合同，还没有 Consumer 注册表、持久版本绑定或 API。
- 已经 skipped 的历史事件不会因为 Definition filter 改变而自动重放；需要新 Consumer Group/Binding 或显式 replay 操作。
- `skipped` 会推进高水位 cursor，因此过滤器变更不能被当成无副作用的配置热更新。
- 仍未实现 event retention、订阅路由、dead-letter、snapshot_required 和真实 Trigger Consumer。

## 15. Spike G：持久 Consumer Registry/Binding

### 15.1 目的

验证 Consumer Definition/Binding 不应只存在于 Worker 进程内；Definition 版本和当前激活 Binding 需要可持久解析，Worker 重启后仍能得到同一配置。

### 15.2 实现

- 新增 `WorkflowOutboxConsumerDefinition` 表：
  - `(id, version)` 复合主键；
  - eventTypes；
  - lease；
  - retry policy；
  - created/updated 时间。
- 新增 `WorkflowOutboxConsumerBinding` 表：
  - `consumerId`；
  - 当前 definition id/version；
  - enabled；
  - 复合外键约束。
- 新增 `WorkflowOutboxConsumerRegistry` Port：
  - `registerDefinition`；
  - `getDefinition`；
  - `upsertBinding`；
  - `getBinding`；
  - `resolve`。
- 同一 Definition `(id, version)` 再次注册必须内容一致；不同内容会返回 conflict，禁止原地覆盖版本。
- Binding 可以从 v1 切换到已注册的 v2；禁用 Binding 后 Runner factory 拒绝构造。
- 新增 InMemory Registry、Prisma Registry 和 `createWorkflowOutboxConsumerFromRegistry`。

### 15.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 在隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：10 条 migration 全部通过。

### 15.4 偏差与限制

- Registry 目前没有 API、权限、审批或多租户隔离；当前单用户阶段只验证持久配置和版本不变量。
- Binding 切换版本不会自动重放旧 Consumer cursor/skipped delivery；需要显式新 Consumer Group 或 replay command。
- Registry 还没有 Definition 删除、retention、audit event、并发激活 fencing 和配置快照关联到 Workflow Run。

## 16. Spike H：Consumer Binding revision/CAS fencing

### 16.1 目的

防止两个管理动作或旧 Worker 同时更新 Consumer Binding 时互相覆盖；Binding 激活需要带 expected revision，并以 compare-and-set 方式推进。

### 16.2 实现

- `WorkflowOutboxConsumerBinding` 增加 `revision`，初始值为 `0`。
- `upsertBinding` 只负责首次创建或完全相同内容的幂等写入；不同内容必须使用 activation。
- 新增 `activateBinding`：
  - 输入 definition、enabled 和 `expectedRevision`；
  - 成功后 revision 原子递增；
  - expected revision 不匹配返回 `WorkflowConsumerBindingConflictError`。
- InMemory/Prisma Registry 都实现同一 CAS 语义。
- 新增 `20260808220000_workflow_consumer_binding_revision` migration。
- Zod 拆分 Binding input/output：初始化输入可省略 revision，持久化输出始终包含 revision。

### 16.3 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck:packages`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 在隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：11 条 migration 全部通过。

### 16.4 偏差与限制

- CAS 只保护 Binding 指针更新，还没有 Application Command、审计 DomainEvent、操作者/来源和 API。
- Definition/Binding 激活尚未与正在运行的 Worker lease 或 Workflow Run 配置快照绑定。
- 没有多用户权限、审批或远程不可信扩展隔离；这些仍是产品后置边界。

## 17. Spike I：wait_signal StepRun 持久语义

### 17.1 目的

验证 Workflow 等待外部 Signal 时，`WorkflowStepRun` 能与 Signal 消费保持一致，Worker 重启/Workflow replay 不会再次等待已经成功消费的 Signal。

### 17.2 实现

- `WorkflowStore` 新增 `consumeSignalStep`：
  - 校验 Workflow Run lease；
  - 创建或恢复 `wait_signal` StepRun；
  - 没有 Signal 时将 StepRun 置为 `waiting`；
  - 有 Signal 时在同一 Store transaction 内消费 Signal 并将 StepRun 置为 `succeeded`；
  - 已成功 StepRun replay 时直接返回保存的 output。
- Runtime 使用稳定 path：`wait_signal:<signalRef>`。
- InMemory 实现使用同一内存状态边界；Prisma 实现使用同一 transaction。
- 现有 waiting workflow 测试增加 StepRun 状态断言：
  - 等待时 `waiting`；
  - signal resume 后 `succeeded` 且 output 持久。

### 17.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 本轮没有新增 Prisma migration；使用既有 `WorkflowStepRun` 表。

### 17.4 偏差与限制

- 当前只完成 `wait_signal` StepRun；`checkpoint`、`child_workflow` 仍没有独立 StepRun 状态。
- Signal 当前仍是每个 `(runId, signalRef)` 一个可覆盖值，没有 Signal history、超时、取消原因或多次排队语义。
- `consumeSignalStep` 只保护当前 Run lease；Signal producer 的授权、来源和审计仍未建模。

## 18. Spike J：checkpoint StepRun 原子收口

### 18.1 目的

验证 Workflow checkpoint 不应只修改 Run 的 checkpoint 字段；它还需要一个可追踪的 `checkpoint` StepRun，并与 Run checkpoint 在同一个持久事务中更新。

### 18.2 实现

- `WorkflowStore` 新增 `recordCheckpoint`：
  - 校验当前 Run lease；
  - 创建或恢复 `checkpoint` StepRun；
  - 写入 StepRun output/status；
  - 同时写入 Workflow Run checkpoint。
- Prisma 使用同一 transaction；InMemory 保持同一状态边界。
- `WorkflowContext.checkpoint` 支持可选 `{ key }`：
  - 显式 key 生成稳定 `checkpoint:<key>` path；
  - 未提供 key 时使用当前脚本执行内的 `checkpoint:<sequence>` fallback。
- 现有 waiting workflow 测试增加 `checkpoint:1` StepRun 的 succeeded/output 断言。

### 18.3 验证

- `bun run typecheck:packages`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 本轮没有新增 Prisma migration；复用既有 `WorkflowStepRun` 表。

### 18.4 偏差与限制

- 未提供 key 的 checkpoint 仍依赖脚本执行顺序；Graph/IR 编译器必须生成显式稳定 key。
- `child_workflow` 当前只完成 start-only StepRun：可以原子创建并幂等复用子 Run，但尚未实现父子等待、结果绑定、失败传播、取消和恢复。
- Run checkpoint 仍只保存最新值，没有 checkpoint history 或独立 replay command。

## 19. Spike K：child Workflow start-only StepRun

### 19.1 目的

验证脚本 Workflow 可以在持久边界内启动一个子 Workflow，并在父 Workflow replay 后复用同一个子 Run，而不会因重复执行脚本产生重复子任务。

### 19.2 实现

- `WorkflowContext.startChildWorkflow()` 支持：
  - 解析并校验目标 Workflow Definition 和输入；
  - 默认 `wait: false`；
  - 使用 `child:<key>` 作为稳定 Step path；未提供 key 时使用当前执行内的序号 fallback；
  - 通过 `WorkflowStore.startChildWorkflowStep()` 完成父 Run lease 校验和持久化。
- InMemory Store 与 Prisma Store 在同一存储操作中：
  - 校验父 Run lease；
  - 首次调用创建 queued 子 `WorkflowRun`，写入 `parentRunId`；
  - 创建父级 `child_workflow` StepRun，状态为 `running`，output 为 `{ runId }`；
  - replay 时按父 Run + path 找回已有 StepRun，并返回原子保存的子 Run ID。
- `wait: true` 目前明确返回未实现错误，不产生没有恢复语义的半成品等待状态。
- 本 Spike 不自动执行 queued 子 Run；子 Run 调度、父子完成等待和结果传播后置。

### 19.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、26 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、84 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- InMemory 测试覆盖：
  - 子 Run 的 `parentRunId`、输入、kind 和 queued 状态；
  - 父级 `child_workflow` StepRun；
  - Signal resume 后 replay 返回同一个子 Run ID；
  - `wait: true` 明确失败。
- Prisma 测试覆盖同一持久化与 replay 合同。

### 19.4 过程偏差与修复

- 首次 Prisma focused test 失败：`WorkflowRun.id` 在 schema 中是必填字段，child transaction 漏传 ID。
- 修复为在 Prisma transaction 内生成 `randomUUID()`，随后 focused tests 重新通过。
- 本轮没有新增 Prisma schema，因此不新增 migration。

### 19.5 偏差与限制

- `wait: true` 尚未实现；父 Workflow 不会自动等待、接收子 Run output 或传播子 Run failure。
- `child_workflow` StepRun 在父 Workflow 完成后仍可能保持 `running`，因为本轮没有 child completion consumer。
- queued 子 Run 还没有接入实际 Worker/Runtime 调度循环。
- 尚未实现 child cancellation、递归深度限制、父子 budget 传播和结果引用 schema。

### 19.6 下一步

- 先定义 child completion 的持久事件、父级 wait StepRun 和结果引用，再实现 wait/resume。
- 明确 child failure/cancel/timeout 如何收口父 Run。
- 将 queued child Run 接入持久 Job/Trigger 调度，而不是在父 Runtime 进程内直接执行。

## 20. Spike L：durable Workflow Run dispatch tick

### 20.1 目的

验证已经持久化为 `queued` 的 Workflow Run 可以由共享 Store 驱动领取和执行，而不是只能依赖创建它的 Runtime 进程立即调用 `start()`。这为后续 `apps/worker` 长循环、child Run 调度和进程重启恢复保留接缝。

### 20.2 实现

- `WorkflowStore` 增加 `claimNextRun()`：
  - 领取最早的 `queued` Run；
  - 领取 lease 已过期的 `running` Run，用于进程中断后的接管；
  - 不自动领取 `waiting` Run，避免没有新 Signal/Trigger 时忙循环；
  - 返回带新 lease token 的 `ClaimedWorkflowRun`。
- InMemory Store 按 `createdAt + id` 稳定排序并领取。
- Prisma Store 在 transaction 内：
  - 查询 queued/expired running 候选；
  - 使用状态、旧 lease token 和过期时间进行条件更新；
  - 重新读取带新 lease 的 Run；
  - 领取竞争失败时返回空。
- `WorkflowRuntime.runNext()`：
  - 一次最多领取并执行一个 Run；
  - 复用与 `start()`/`resume()` 相同的 Definition、heartbeat、Action/Signal/lease fencing 和 terminal close 路径；
  - 无可运行 Run 时返回 `null`。
- 现有 start-only child Run 可以由下一次 `runNext()` tick 领取；本轮仍不实现父级等待和结果传播。

### 20.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、28 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、86 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- InMemory/Prisma 测试验证两个 queued Run 按稳定顺序各执行一次，完成后下一次 tick 返回 `null`。

### 20.4 偏差与限制

- 这只是单次 dispatch tick，不是 `apps/worker` 的长循环、并发池、优雅停机或 heartbeat 服务。
- 当前调度顺序是 `createdAt + id`，尚未实现 priority、lane、fairness、budget admission 或 schedule time。
- WorkflowRun orchestration lease 与 Action Job lease 仍是两个层次；本轮没有把每个 Workflow Run 再包装成独立 Job。
- `waiting` Run 仍需 Signal、Trigger 或未来 child completion consumer 显式唤醒。
- queued child Run 仍没有父子完成等待、结果绑定、失败传播、取消或超时语义。

### 20.5 下一步

- 把 `runNext()` 接入可持久 heartbeat、退出和重启恢复的 Worker loop。
- 定义 priority/lane/并发 admission 与 queued Run 的 claim fairness。
- 在完成 child completion 事件和父级 wait StepRun 合同后，再实现 `wait: true`。

## 21. Spike M：multi-Worker claim fencing

### 21.1 目的

验证多个 Runtime/Worker 共享同一个 Workflow Store 时，同一个 queued Run 只能被一个 Worker 领取和执行；其它 Worker 必须因为已有有效 lease 返回 idle，而不能重复执行 Workflow。

### 21.2 实现

- InMemory 和 Prisma focused tests 各创建两个独立 `WorkflowRuntime`，共享同一个 Store。
- 测试 Workflow 在第一个 Worker 获得 Run lease 后暂停，确保第二个 Worker 在第一个 Worker 尚未完成时尝试 `runNext()`。
- 第二个 Worker 的 `claimNextRun()` 返回 `null`。
- 释放第一个 Workflow 后，只有第一个 Worker 完成 Run，最终状态和 output 只写入一次。
- 本轮没有修改 schema，因此没有新增 migration。

### 21.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、30 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、88 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- InMemory/Prisma 都通过单有效 lease 的竞争测试。

### 21.4 偏差与限制

- 本轮验证的是“一个 Worker 已持有 lease 时的竞争”，还没有覆盖 SQLite 高并发锁冲突、lease 到期接管期间的旧 Worker 中途写入和网络分区。
- `runNext()` 仍是单次 tick，不是多 Worker 长循环、并发池或公平调度器。
- lease 竞争只保护 WorkflowRun orchestration；Action Job、外部副作用和 child completion 仍需要各自的 fencing/幂等合同。

### 21.5 下一步

- 增加 lease 到期接管的 runtime-level 测试：旧 Worker 执行中，新的 Worker 接管后旧 Worker 不能 terminal close。
- 将竞争测试接入实际 Worker loop 和 shutdown/heartbeat 生命周期。
- 再评估 SQLite 的 busy timeout、重试和调度公平性。

## 22. Spike N：runtime-level stale Worker takeover

### 22.1 目的

验证旧 Worker 在 Workflow 执行期间失去 Run lease 后，即使它随后恢复并返回结果，也不能覆盖新 Worker 接管后已经写入的 terminal state。

### 22.2 实现

- InMemory 和 Prisma focused tests 各创建两个独立 Runtime：
  - stale Worker 使用短 lease；
  - current Worker 使用正常 lease。
- 测试临时让 stale Worker 的 `renewRun` 失败，并让第一次 Workflow 执行暂停，等待 lease 过期。
- current Worker 通过 `runNext()` 接管同一个 `running` Run，执行第二次并写入 `output: "current"`。
- 释放 stale Worker 后，它必须抛出 `WorkflowLeaseLostError`，不能将 `"stale"` 写入 Run。
- 最终持久 Run 保持 `succeeded/current`。
- 本轮没有修改 schema，因此没有新增 migration。

### 22.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、32 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、90 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- InMemory/Prisma 都通过旧 Worker 中途恢复拒绝 terminal close 的测试。

### 22.4 偏差与限制

- 测试通过受控 Store renew 失败模拟 lease 丢失，不等同真实进程 kill、网络分区或系统时钟漂移。
- 旧 Worker 在 lease 丢失后仍可能继续产生外部副作用；本轮只验证 Cosmos 持久状态不能被旧 Worker 覆盖，未知外部结果仍需 Publisher/Action receipt。
- Workflow Runtime 尚未把 lease-lost 分类为可观测的 Worker 结果，也没有统一 drain/shutdown 协议。

### 22.5 下一步

- 将 lease-lost、taken-over、unknown-result 变成 Worker tick 的结构化结果。
- 在真实 Worker loop 中验证进程中断、重启、heartbeat 和退出时不再领取新任务。
- 为 Action/Connector 外部副作用补齐 receipt/idempotency 边界。

## 23. Spike O：可停止的 Workflow Worker loop

### 23.1 目的

把 `WorkflowRuntime.runNext()` 包装成一个可单测、可停止、可观测的 Worker loop 接缝，同时不改变当前固定 Ingest Worker 的生产入口。

### 23.2 实现

- 新增 `WorkflowWorkerLoop`：
  - `tick()` 执行一次 `runNext()`；
  - `processed` 返回 Run ID 和最终 Run status；
  - 无任务返回 `idle`；
  - `WorkflowLeaseLostError` 返回结构化 `lease_lost`；
  - 其它异常返回 `error`。
- `start()`：
  - 立即执行第一 tick；
  - 按 `pollIntervalMs` 等待下一次 tick；
  - 不在等待期间占用数据库 lease。
- `stop()`：
  - 设置停止标志；
  - 唤醒 poll timer，不必等待完整轮询间隔；
  - 等待当前 tick 完成后退出。
- `onTick` 作为最小观测 Port，Worker 宿主可以映射到结构化日志/heartbeat/metrics。
- 仅加入 `packages/workflow-runtime`，没有把它接入 `apps/worker/src/main.ts`；当前 apps/worker 仍只运行固定 Ingest/Probe Worker。

### 23.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts`：1 个测试文件、21 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、93 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- 覆盖 processed、idle、stop 唤醒和 lease_lost 结果。

### 23.4 偏差与限制

- 这是 Runtime package 的 loop contract，不是生产 Worker wiring；没有多种 Consumer 的统一调度、优雅 shutdown drain 或 WorkerHeartbeat 持久化。
- `onTick` 不是完整 metrics/tracing contract；回调异常处理、backpressure、并发度和 lane 仍后置。
- 当前 loop 每次只处理一个 Workflow Run；Outbox Consumer 和旧 Source Job 仍有各自的 loop。
- `stop()` 等待当前 tick 完成，但不会取消正在运行的 Action 或外部 Connector。

### 23.5 下一步

- 设计宿主级 Worker supervisor：Workflow Run、Action Job、Outbox、Source Job 的 lane/admission/fairness。
- 将 loop 的 `lease_lost/taken_over/unknown_result` 接入统一 heartbeat、日志和恢复指标。
- 在确认 Definition 注册和生产 wiring 后，再把 package loop 接入 `apps/worker`。

## 24. Spike P：child terminal close propagation

### 24.1 目的

补齐 child Workflow 的一个独立生命周期事实：child Run 进入 `succeeded/failed/cancelled` 后，父级 `child_workflow` StepRun 不能永远停留在 `running`。本轮只收口 StepRun，不实现父 Run 的 wait/resume。

### 24.2 实现

- `WorkflowStore` 新增 `completeRun()`，要求当前 Run lease token，并在同一 Store/transaction 内：
  - 写入 child Run 的 terminal status/output/error；
  - 清除 child Run lease；
  - 根据 `parentRunId` 和 StepRun output 中的 `runId` 找到父级 `child_workflow` StepRun；
  - 将父 StepRun 收口为 `succeeded/failed/cancelled`；
  - 写入 `{ runId, status, result, error }` 作为 child completion output。
- `WorkflowRuntime` 的成功/业务失败 terminal close 改用 `completeRun()`；waiting 仍使用 `updateRun()`。
- InMemory/Prisma 保持同一合同和原子边界。
- child terminal propagation 不自动 requeue 父 Run，不发送新的父级 Signal，也不实现 `wait: true`。

### 24.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、37 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、95 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- 覆盖 child success 与 child failure：
  - child Run terminal 状态；
  - 父 StepRun terminal 状态；
  - output/error 结果引用；
  - InMemory/Prisma 一致性。

### 24.4 偏差与限制

- `wait: true` 仍未实现；父 Run 不会因 child 完成自动重新排队或恢复。
- 当前传播依赖 child Run 的 `parentRunId` 和父 StepRun output 中的 runId；尚未有独立 parent-child relation 表或 completion event。
- `completeRun()` 当前由 Runtime terminal close 使用；直接调用旧 `updateRun(status=terminal)` 不会触发 child propagation，后续需要收紧 Application Command 边界。
- child completion 尚未写入独立 DomainEvent/Outbox，也没有 child result schema/version。

### 24.5 下一步

- 定义 child completion DomainEvent/Outbox 和父级 wait StepRun 的唤醒合同。
- 决定 child success/failure/cancel/timeout 对父 Run 的 requeue、传播和幂等规则。
- 将所有 terminal close 收口到统一 Application Command，禁止旁路 `updateRun` 产生不完整生命周期。

## 25. Spike Q：child wait/resume 最小合同

### 25.1 目的

实现 `startChildWorkflow(wait:true)` 的最小 durable 语义：父 Run 等待 child，child 完成后父 Run 被重新排队，下一次 `runNext()` replay 父脚本并取得 child result；不把 timeout、取消传播和事件消费者提前混入。

### 25.2 实现

- `WorkflowRunRecord` 增加：
  - `waitingKind`：当前支持 `signal`、`child_workflow`；
  - `waitingRef`：Signal ref 或 child Run ID；
  - `waitingSignal` 保留为 signal UI/兼容字段，child wait 时为 `null`。
- Prisma 增加 migration：
  - `20260808230000_workflow_waiting_reason`；
  - `WorkflowRun.waitingKind`；
  - `WorkflowRun.waitingRef`。
- `WorkflowWaitingError` 变成带 kind/ref 的等待合同，兼容旧的 signal-only 构造方式。
- `startChildWorkflowStep` 接收 `wait`：
  - `wait:false` 创建 `running` child StepRun；
  - `wait:true` 创建 `waiting` child StepRun，并让父 Run 保存 `waitingKind=child_workflow`、`waitingRef=childRunId`；
  - child 成功时返回 result；
  - child failed/cancelled 时让父 Run 进入业务失败路径。
- `completeRun` 在同一 Store/transaction 内：
  - 收口 child Run；
  - 收口父 `child_workflow` StepRun；
  - 若父 Run 正等待同一个 child，则清除等待字段并置为 `queued`；
  - 不唤醒等待 Signal，也不重排队无关父 Run。
- `runNext()` replay 父脚本：
  - existing child StepRun succeeded → 读取保存 result；
  - existing child StepRun failed → 父 Run 进入 failed；
  - 没有重复创建 child Run。

### 25.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、39 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、97 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：12 条 migration 全部通过。
- `git diff --check`：通过。
- 本轮涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。
- 覆盖 InMemory/Prisma：
  - 父 Run waiting kind/ref；
  - child success → parent queued → parent replay succeeded；
  - child failure → parent queued → parent replay failed；
  - 既有 Signal wait 行为不回归。

### 25.4 过程偏差与修复

- 首次 focused test 发现 `updateRun(status=waiting)` 被错误当成 terminal，清除了 waiting kind/ref；修复为 waiting 释放 lease、terminal 才清除等待原因。
- 同一问题还使 InMemory queued parent 保留旧 lease token，`claimNextRun()` 将其排除；补上 waiting 的 lease release 后通过。
- 原有 `wait:true` 未实现测试已更新为新的 waiting 合同。

### 25.5 偏差与限制

- 只实现 child completion 后的精确父 Run requeue；没有 timeout、parent/child cancel propagation、retry policy 或死信。
- child completion 尚未产生独立 DomainEvent/Outbox，也没有跨进程 completion consumer；当前传播发生在 child terminal close transaction 内。
- `updateRun(status=terminal)` 旁路仍可能绕过 child propagation；后续应收紧 terminal Application Command。
- parent result 当前为动态 JSON，没有独立 schema/version/引用表。
- 生产 `apps/worker` 尚未注册 Workflow Definition 或接入 `WorkflowWorkerLoop`。

### 25.6 下一步

- 为 child completion 增加 DomainEvent/Outbox 与 consumer，验证跨进程父子唤醒。
- 定义 timeout、cancel、retry、budget 和递归深度传播。
- 将 `wait:true` 接入一个真实的 Knowledge/Research Workflow，再评估是否需要独立 ParentChildRelation 表。

## 26. Spike R：Workflow terminal DomainEvent/Outbox

### 26.1 目的

让每个 Workflow terminal close 都产生可持久观察的 `workflow.run.terminal` DomainEvent 和 Outbox message，为未来跨进程 child completion consumer、SSE 和审计提供事实来源。

### 26.2 实现

- `completeRun()` 在当前 Run lease fencing 下写入 terminal event：
  - type：`workflow.run.terminal`；
  - version：`v1`；
  - idempotency key：`workflow-run:<runId>:terminal`；
  - payload：Run ID、status、output、error、parentRunId。
- InMemory Store：
  - terminal Run、父 StepRun propagation 和 terminal Event/Outbox 在同一状态边界完成；
  - event sequence 与 Outbox sequence 复用同一顺序源。
- Prisma Store：
  - terminal Run、父 StepRun propagation、DomainEvent 和 WorkflowOutboxMessage 在同一 transaction；
  - 已存在 terminal event 时不重复创建。
- 既有 Workflow 显式业务事件仍保留；一个 Run 可以同时有业务事件和 terminal 生命周期事件。

### 26.3 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、39 个测试通过。
- 验证显式业务事件先于 terminal 事件，两个 Outbox message 都是 pending。
- child success 的 terminal event 在 InMemory/Prisma 都包含 output，并可通过 Run ID 查询。

### 26.4 Round 25 基线偏差与限制

- Round 25 记录的当时状态：parent-wake Consumer 尚不存在，父级传播发生在 child transaction 内；该边界已由 Round 27 的 Spike S 推进为 Outbox parent-wake Consumer。
- event payload 是动态 JSON，尚未有独立 schema registry、retention、签名或敏感字段筛选。
- terminal event 不能表示外部 Action 的未知结果；外部副作用仍需 receipt/幂等合同。
- direct `updateRun(status=terminal)` 仍不会产生 terminal event；后续需要统一 terminal Application Command。

### 26.5 Round 26 兼容性修复与验证

Round 25 的第一次全量测试发现固定 Ingest 测试仍假设每个 Run 只有一个事件：

```text
16 个测试文件中 15 个通过，96/97 个测试通过。
```

这是测试断言落后于新事件合同，不是 Runtime 的事件重复写入。已将测试改为分别断言：

- `ingest.page.persisted` 业务事件；
- `workflow.run.terminal` 生命周期事件；
- 两个 Outbox message 都处于 `pending`。

Round 26 验证结果：

- focused：3 个测试文件、40 个测试通过；
- full：16 个测试文件、97 个测试通过；
- `bun run db:validate`：通过；
- `bun run db:generate`：通过；
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用；
- `git diff --check`：通过；
- Markdown 代码围栏、文件末尾换行和相对链接检查：通过。

### 26.6 下一步

- 为 `workflow.run.terminal` 增加 Consumer Definition/Binding 和 parent wake consumer，验证跨进程恢复。
- 定义 event payload schema/version、retention、dead-letter 和 `snapshot_required`。
- 将 terminal event 接入 SSE/审计，但保持领域状态表为事实来源。

## 27. Spike S：Outbox 驱动的跨进程 parent wake

### 27.1 目的

把 child Workflow 完成后的父级传播从 terminal close transaction 中拆出，验证以下链路：

```text
child completeRun
→ WorkflowRun terminal
→ workflow.run.terminal DomainEvent / Outbox
→ terminal parent-wake Consumer
→ parent child_workflow StepRun 收口
→ waiting parent Run queued
→ parent Workflow replay
```

### 27.2 实现

- `WorkflowStore.completeRun()` 只负责：
  - 在 Run lease fencing 下收口 terminal 状态；
  - 清理 Run lease 和 waiting 字段；
  - 追加幂等的 `workflow.run.terminal@v1` DomainEvent/Outbox。
- 新增 `WorkflowStore.propagateChildWorkflowTerminal()`：
  - 从持久 child Run 读取真实 terminal 状态、结果和错误；
  - 校验 Event payload 中的 `runId` 与 `parentRunId`；
  - 按 child Run ID 找到唯一父 `child_workflow` StepRun；
  - 将 StepRun 收口为 `succeeded`、`failed` 或 `cancelled`；
  - 只有父 Run 仍在等待同一个 child 时才重新排队。
- 新增 `WorkflowTerminalParentWakeConsumer`：
  - 固定消费 `workflow.run.terminal@v1`；
  - 处理无父级的 terminal event 时只 ack，不产生副作用；
  - handler 已提交但 ack 丢失时允许重新投递；
  - 重投递通过 StepRun 状态和 child ID 做幂等收口。
- InMemory 和 Prisma Store 都在各自的持久化边界内实现上述命令；消费租约和 ack 仍由通用 Outbox Consumer 负责。

### 27.3 验证

- InMemory/Prisma child wait 测试确认：child terminal close 后父 Run 仍为 `waiting`，直到独立 Consumer 处理 Outbox 才变为 `queued`。
- InMemory retry 测试模拟“父级状态已提交、ack 失败”：
  - 第一次消费进入 `retry_wait`；
  - 第二次投递成功 ack；
  - 父 StepRun 和父 Run 没有重复推进。
- Prisma 测试重复执行 `propagateChildWorkflowTerminal()`，第二次返回 `stepUpdated=false`、`parentRequeued=false`。
- full test：16 个测试文件、98 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- Round 27 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 27.4 设计结论

- terminal close 和 parent wake 是两个不同的 durable 事实：
  - terminal close 属于 child Run 的生命周期收口；
  - parent wake 属于对 terminal 事实的异步投影/协调。
- parent wake 不能只依赖进程内回调，否则 child Worker 与 parent Worker 分离后无法恢复。
- parent wake handler 必须从数据库读取 child 的真实终态，而不是信任可被重投递的 payload 作为唯一事实。
- 事务提交与 Outbox ack 之间允许出现“副作用已完成、消息仍待重试”的窗口，因此 handler 必须幂等。

### 27.5 偏差与限制

- `WorkflowTerminalParentWakeConsumer` 尚未接入 `apps/worker` 的 supervisor、lane 和 heartbeat。
- 尚未实现 Consumer Definition/Binding 的生产注册和版本迁移。
- 尚未处理 timeout、parent/child cancel propagation、child retry/dead-letter、budget 或递归深度。
- parent wake 目前只更新一个匹配的父 `child_workflow` StepRun；多父引用、Join 和 Fan-in 尚未建模。
- 尚未加入 terminal payload 的正式 schema registry、retention、签名和敏感字段筛选。

### 27.6 下一步

- 把 parent-wake consumer 注册到生产 Worker，并验证跨进程 restart/reclaim。
- 统一 terminal Application Command，收紧可绕过 Event/Outbox 的 `updateRun(status=terminal)` 旁路。
- 增加 timeout/cancel/retry/budget/递归深度合同，再接真实 Research Workflow。

## 28. Spike T：统一 terminal Application Command 与取消 fencing

### 28.1 目的

消除 `updateRun(status=terminal)` 旁路，确保成功、失败和取消都经过明确的 terminal Application Command，并产生一致的 DomainEvent/Outbox。

### 28.2 实现

- 新增 `WorkflowStore.cancelRun()`：
  - 可取消 `queued`、`running` 和 `waiting` Run；
  - 清理 waiting 状态和已有 orchestration lease；
  - 清理旧 lease 使正在执行的 Worker 无法继续 terminal close；
  - 写入幂等的 `workflow.run.terminal@v1` Event/Outbox；
  - 对重复取消返回已有终态，不追加重复事件。
- `WorkflowRuntime.cancel()` 改为调用 `cancelRun()`。
- `WorkflowStore.updateRun()` 拒绝 `succeeded`、`failed`、`cancelled` 状态写入；它只保留运行中状态、等待状态、checkpoint 和普通错误更新。
- Prisma 将 terminal event/outbox 创建抽为同一 transaction helper，`completeRun()` 和 `cancelRun()` 共用。

### 28.3 验证

- InMemory/Prisma focused：2 个测试文件、42 个测试通过。
- full test：16 个测试文件、100 个测试通过。
- 取消后 `completeRun()` 使用旧 Worker lease 会被 `WorkflowLeaseLostError` 拒绝。
- 重复 `cancelRun()` 的 Event 数量保持为 1。
- `updateRun(status=terminal)` 明确失败并提示使用 `completeRun` 或 `cancelRun`。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- Round 28 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 28.4 设计结论

- terminal 状态不是普通字段 patch，而是需要持久副作用的 Application Command。
- 取消是一次 terminal close，不是只在内存中设置一个取消标记。
- 清 lease 是取消 fencing 的必要条件；否则旧 Worker 可能在用户取消后覆盖结果。
- terminal Event/Outbox 的幂等 key 继续统一为 `workflow-run:<runId>:terminal`。

### 28.5 偏差与限制

- 当前没有 cancellation request/审批状态；单用户阶段直接执行取消。
- parent/child cancel propagation 仍由 terminal parent-wake consumer 后置处理，没有主动级联取消。
- `WorkflowRuntime.cancelledRuns` 仍是进程内的快速取消提示，持久状态才是恢复事实。
- 尚未将所有外部 Application Service 的 terminal close 入口统一到同一 Command Bus。

### 28.6 下一步

- 把 cancel 请求、超时和 Worker heartbeat 纳入统一 Run Control 合同。
- 验证 cancel 与 child wait、Action Job lease、重启恢复的组合。
- 将 parent-wake Consumer 注册到生产 Worker，并补真实 restart/reclaim smoke。

## 29. Spike U：child cancellation 的 parent wake 与 replay

### 29.1 目的

验证取消不是孤立的 child 终态，而是可以沿已有 terminal Event/Outbox 链路驱动等待父 Workflow 的恢复，并最终得到明确的父级结果。

### 29.2 实现验证

链路固定为：

```text
parent wait:true
→ child queued
→ cancelRun(child)
→ child cancelled + terminal Event/Outbox
→ parent-wake Consumer
→ child_workflow StepRun cancelled
→ parent Run queued
→ parent replay
→ parent failed with child cancellation error
```

- InMemory/Prisma 都验证 child cancel 后父 Run 在 Consumer 处理前仍保持 `waiting`。
- Consumer 处理后只唤醒等待同一 child ID 的父 Run。
- 父脚本 replay 读取已收口的 `child_workflow` StepRun，并把取消错误转为父 Run 的明确 `failed` 终态。
- child 取消事件和父级 terminal 事件在同一 Consumer Group 中按 sequence 顺序消费；无父级的事件只 ack。

### 29.3 验证

- InMemory/Prisma focused：2 个测试文件、43 个测试通过。
- 覆盖 `cancelRun()`、terminal Event/Outbox、parent-wake、StepRun `cancelled`、父 Run requeue 和父 replay failure。
- full test：16 个测试文件、101 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- Round 29 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 29.4 设计结论

- child cancellation 复用 terminal close 和 parent-wake，不另造一条父子传播通道。
- 父级是否失败由 Workflow 脚本 replay 决定，Store 只负责持久投影和 requeue；这保留了未来自定义“取消后继续/降级/重试”策略的空间。
- 取消错误必须持久在 child StepRun output/error 中，不能只依赖内存异常。

### 29.5 偏差与限制

- 尚未实现主动的 parent → child 级联取消；当前只能取消指定 Run。
- 尚未定义取消策略（立即取消、优雅停止、补偿、降级继续）及其版本化配置。
- Action Job 运行中被取消时，Job lease/外部副作用的停止与补偿仍未闭合。
- 尚未做跨进程真实 restart/reclaim smoke。

### 29.6 下一步

- 把 Run cancellation policy、timeout 和 signal wait 纳入统一 Run Control 合同。
- 验证取消与 Action Job lease、外部副作用 receipt、Worker restart 的组合。
- 再评估 parent → child cancel propagation 是否需要独立 Durable Command。

## 30. Spike V：durable Workflow deadline 与 timeout sweep

### 30.1 目的

验证 Workflow timeout 不依赖进程内 timer，而是由持久 deadline 和 Worker/Runtime tick 共同驱动；服务重启后仍可以从数据库识别并收口过期 Run。

### 30.2 实现

- `WorkflowRun` 新增持久 `deadlineAt`，并增加 `[status, deadlineAt]` 索引。
- `CreateWorkflowRunInput` 支持 `deadlineAt`；`WorkflowRuntime.start()` 支持 `timeoutMs`，转换为绝对 deadline。
- `WorkflowStore.expireDueRuns({ now, limit })`：
  - 扫描 `queued`、`running`、`waiting` 中 deadline 已到的 Run；
  - 清理 waiting 字段和 lease；
  - 以现有 `failed` terminal 状态收口；
  - 写入稳定错误 `Workflow deadline exceeded.` 和 terminal Event/Outbox；
  - 使用 CAS 条件，避免两个 Worker 重复收口同一个 Run。
- `WorkflowRuntime.runNext()` 和 `executeRun()` 每次 tick 先执行 timeout sweep。
- `completeRun()` 在发现当前 Run 已过 deadline 时，将迟到的成功/失败结果拒绝为 deadline failure，不能覆盖超时终态。
- 新增 migration：
  - `20260809000000_workflow_run_deadline`

### 30.3 状态取舍

本轮暂不新增 `timed_out` 状态，timeout 先复用 `failed` + 稳定 error 文本。这是可逆的边界，避免在还没有产品查询/筛选合同前扩大 Run/Step terminal 状态机；未来可以通过 `terminationReason` 或独立状态迁移。

### 30.4 验证

- InMemory/Prisma focused：2 个测试文件、46 个测试通过。
- waiting Run 过期：Runtime tick 将 Run 从 `waiting` 收口为 `failed`，并追加 terminal Event。
- running Run 过期：迟到 `completeRun(status=succeeded)` 返回 deadline failure，Event 数量保持幂等。
- full test：16 个测试文件、104 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- Round 30 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 30.5 设计结论

- timeout 的 durable truth 是 `deadlineAt` 和持久 Run 状态，不是某个 Worker 是否还活着。
- 清理 Run lease 是 timeout fencing 的必要条件；过期 Worker 不能继续推进结果。
- timeout sweep 必须是可重复、可抢占的 Store Command，不能只在内存里扫描。
- deadline 只负责终止 Run；父级传播仍统一复用 terminal Outbox/parent-wake Consumer。

### 30.6 偏差与限制

- 正在执行的 Action 到 deadline 后，外部副作用可能已经发生；本轮只保证最终 Run 不接受迟到结果，没有实现 Action 级取消/补偿/receipt。
- `WorkflowWorkerLoop` 目前通过 `runtime.runNext()` 间接 sweep，没有独立 timeout supervisor/指标。
- deadline 暂时只在 Run 创建时设置；没有动态延长、缩短、pause 或子 Run budget/deadline 传播。
- timeout 使用 `failed` 状态，尚无 `terminationReason` 查询字段。

### 30.7 下一步

- 验证 timeout 与 Action Job lease、外部副作用 receipt 和 Worker restart/reclaim 的组合。
- 设计 Run Control policy：cancel、timeout、pause、resume、grace period 和 parent/child propagation。
- 再决定是否引入独立 `timed_out` 状态或 `terminationReason`。

## 31. Spike W：Workflow terminal 与 Action Job fencing

### 31.1 目的

补齐 Run terminal 与 Action Job 自己的 lease 之间的边界，避免 Workflow 已取消或超时后，旧 Action Job 仍把结果写回 Invocation/StepRun。

### 31.2 实现

- Run terminal close（成功、失败、取消、timeout）会在同一 Store 边界取消该 Run 的：
  - `queued` Action Job；
  - `leased` Action Job；
  - `retry_wait` Action Job。
- 同步将关联 `WorkflowActionInvocation` 和 Action `WorkflowStepRun` 置为 `cancelled`，清理 Job lease/retry 时间。
- InMemory/Prisma `claimJob()`：
  - 已知 Run 为 terminal 或 deadline 已到时不再领取；
  - 非 terminal Run 保留低层 Job Port 的现有操作合同。
- InMemory/Prisma `completeJob()`/`failJob()`：
  - 已知 Run terminal 或 deadline 已到时返回 `false`；
  - 旧 lease 不得覆盖 cancelled Invocation/StepRun。
- timeout sweep 和 `cancelRun()` 复用同一 Job cancellation helper，避免三套收口逻辑漂移。

### 31.3 过程偏差与修复

第一次 focused test 把 Job claim 收紧为必须 `Run.status=running`，触发了两个既有低层 Store 测试回归：

- Prisma 基础持久化测试在 queued Run 上直接验证 Job；
- InMemory stale Job 测试使用了没有创建 Run 的历史 spike fixture。

修复为只对“已知 terminal/deadline Run”做 fencing；orphan InMemory fixture 暂时保留为历史低层测试边界，未来应在 Application Command 层禁止生成。

### 31.4 验证

- InMemory/Prisma focused：2 个测试文件、48 个测试通过。
- 取消/timeout 后旧 `completeJob()`、`failJob()` 返回 `false`。
- 取消/timeout 后新的 `claimJob()` 返回 `null`。
- Invocation/Action StepRun 保留 cancelled 状态和错误。
- full test：16 个测试文件、106 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- Round 31 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 31.5 设计结论

- Run lease fencing alone 不足以保护 Action Job；Job 必须同时检查父 Run 的 terminal/deadline 状态。
- terminal close 应统一取消尚未完成的内部 Job，否则恢复扫描会重新执行已经失效的工作。
- 外部 Action 已发生的副作用仍不能被数据库回滚；Job cancellation 只保证 Cosmos 内部结果不会迟到写入。

### 31.6 偏差与限制

- 当前没有真正的 Action cancellation token/进程级中断；正在执行的用户代码只能在返回时被拒绝提交。
- 外部副作用 receipt、unknown-result、补偿和幂等仍未实现。
- InMemory 仍允许历史测试创建没有父 Run 的 Invocation/Job；生产 Application 层需要补存在性约束。
- 尚未把 Job cancellation 事件接入审计/SSE。

### 31.7 下一步

- 为 Action Definition 增加 cancellation/abort port 和外部副作用 receipt。
- 验证 timeout/cancel 与 Job retry takeover、Worker restart/reclaim 的组合。
- 在 Application Command 层禁止 orphan Invocation，并把 Job 状态迁移纳入正式 Run Control。

## 32. Spike X：apps/worker 的 Workflow parent-wake wiring（历史基线）

### 32.1 目的

把已经验证的 terminal Outbox/parent-wake Consumer 接入服务器 Worker 入口，同时保持当前固定 Ingest Worker 的运行边界。

### 32.2 实现

- 新增 Application 层 `WorkflowParentWakeWorker`：
  - 复用现有 Worker logger；
  - 将 parent-wake delivery status 作为可观察 worker 记录；
  - 不拥有 Workflow Definition，也不直接操作 Prisma。
- `apps/worker` 启动时：
  - 使用现有 `PrismaCosmosRepository.prisma` 创建 `PrismaWorkflowStore`；
  - 使用同一个 Data Root/SQLite 连接消费 `workflow.run.terminal`；
  - Consumer ID 可由 `COSMOS_WORKFLOW_PARENT_WAKE_CONSUMER_ID` 配置；
  - owner 使用独立的 `<instanceId>:workflow-parent-wake` lease identity。
- 每次 worker poll 的顺序：

```text
parent-wake Consumer tick
→ fixed Ingest Job tick
→ shared heartbeat
```

- parent-wake 出错只记录错误并继续固定 Ingest poll，避免新 Workflow 能力阻塞现有 Phase 1 Ingest。

### 32.3 重要边界

- 本轮只接入 terminal parent-wake Consumer。
- 在 Round 32 当时没有把 `WorkflowWorkerLoop.runNext()` 接入生产入口，因为
  当时还没有真实 Workflow Definition Registry/Action Registry；Round 61 已补上
  可选 lane，但仍保持默认关闭并保留本节的 Registry 限制。
- 没有把 Knowledge/Research Workflow、Consumer Registry binding 或完整 supervisor 假装成已生产化。
- 没有新增数据库 migration。

### 32.4 验证

- Application focused：1 个测试文件、6 个测试通过。
- Apps typecheck：API、Worker、Web 通过。
- Worker 只读审查确认 Workflow Store 与旧 Ingest Repository 共享同一 Prisma/Data Root，未建立第二连接。
- full test：16 个测试文件、107 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- Round 32 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 32.5 设计结论

- Parent-wake Consumer 可以先于完整 Workflow execution 接入生产 Worker，作为低风险的 durable projection consumer；Round 61 进一步把 Workflow Run 作为可配置 lane 接入同一宿主。
- Workflow execution loop 必须等 Definition/Action Registry、Run admission、lane、heartbeat 和错误监控合同齐备后再接入。
- 旧 Ingest 与新 Workflow 的共享数据库不是共享进程状态；两者仍通过各自 Store/Application Port 隔离。

### 32.6 偏差与限制

- parent-wake 当前与固定 Ingest 共用一个 poll timer，每次最多消费一条 terminal event。
- 没有独立 Workflow Worker heartbeat/status；现有 heartbeat 只表示整个 Worker 进程 ready。
- 没有 consumer registry 的生产 binding/版本激活流程。
- 生产 Docker、restart/reclaim、真实 terminal event 仍未验收。

### 32.7 下一步

- 增加通用 Definition/Action Registry、插件加载和 Run 输入快照后，再逐步开启自定义 Workflow lane。
- 接入持久 Consumer Registry/Binding，并为 parent-wake 配置正式 definition version。
- 在真实 Workflow Definition Registry 存在后，再开启 `WorkflowWorkerLoop`。

## 33. Spike Y：parent-wake Definition/Binding Registry 激活

### 33.1 目的

把 `apps/worker` 的 parent-wake Consumer 从进程内硬编码配置提升为持久 Definition/Binding 合同，验证版本不可变、启动幂等和 disabled binding 尊重。

### 33.2 实现

- 新增固定 `workflow.parent-wake@1` Definition：
  - event type：`workflow.run.terminal`；
  - lease/retry policy 作为 Definition 内容；
  - Definition version 内容不可变。
- 新增 `createWorkflowTerminalParentWakeConsumerFromRegistry()`：
  - 只激活 enabled binding；
  - 解析绑定的 definition/version；
  - 缺失或 disabled binding 明确失败。
- `apps/worker` 启动：
  - 注册 `workflow.parent-wake@1`；
  - 缺失 binding 时幂等创建 enabled binding；
  - 已存在 disabled binding 时不自动启用；
  - 使用 Registry 解析出的 lease/retry，不用 Ingest `leaseMs` 覆盖 Definition。
- Definition 内容变更必须创建新 version，不能在启动时覆写同一 `id@version`。

### 33.3 验证

- Workflow Runtime focused：1 个测试文件、30 个测试通过。
- 覆盖 enabled binding 解析、Consumer idle tick、disabled binding 拒绝。
- Apps typecheck：API、Worker、Web 通过。
- 无新增 migration。
- full test：16 个测试文件、108 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- Round 33 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 33.4 设计结论

- Consumer Definition 是不可变协议；Binding 是可变部署状态。
- Worker 启动可以做幂等“缺失 binding 初始化”，但不能替用户重新启用 disabled binding。
- lease/retry 配置属于 Definition version，不属于每次进程启动的临时覆盖。

### 33.5 偏差与限制

- 当前只激活 parent-wake 一个 Consumer，其他 Knowledge/Research/SSE binding 尚未生产注册。
- 没有 binding activation audit、灰度、rollback 或 supervisor 状态页。
- 如果数据库存在指向未注册旧 Definition 的 binding，Worker 启动会失败，需要显式补齐 Definition version。
- 仍没有完整 Workflow Definition/Action Registry，因此 `WorkflowWorkerLoop` 未接入 apps/worker。

### 33.6 下一步

- 为 Definition/Binding activation 增加启动诊断和可观测状态。
- 抽取多 lane Worker Supervisor，统一 fixed Ingest、parent-wake、timeout sweep。
- 在真实 Workflow Registry 稳定后再启用 Workflow Run execution lane。

## 34. Spike Z：Action Invocation 的父 Run existence fencing

### 34.1 目的

消除 InMemory/Prisma 对 orphan Action Invocation/Job 的不一致，确保 Action 只能挂在存在且仍可执行的 Workflow Run 上。

### 34.2 实现

- InMemory/Prisma `ensureActionInvocation()` 现在都：
  - 校验 `WorkflowRun` 存在；
  - 拒绝 terminal Run；
  - 拒绝 deadline 已到的 Run；
  - 仅允许继续创建/复用 non-terminal、未过期 Run 的 Action Invocation。
- 修正历史 InMemory stale Job fixture，显式创建对应父 Run。
- 保留 Job Port 对非 terminal queued/waiting Run 的低层操作兼容；Application/Runtime 正常路径仍在 running Run 中调用。

### 34.3 验证

- InMemory/Prisma focused：2 个测试文件、49 个测试通过。
- missing parent Run：明确返回 `Workflow Run not found`。
- cancelled parent Run：明确返回 `Workflow Run is not executable`。
- 既有 Action Job lease、retry 和 replay 测试继续通过。
- full test：16 个测试文件、108 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- Round 34 涉及的两个 Markdown 文件：代码围栏、文件末尾换行和相对链接检查通过。

### 34.4 设计结论

- `WorkflowRun → WorkflowActionInvocation → Job → StepRun` 的父关系必须在创建 Invocation 时建立，不能等 Job claim 才发现。
- InMemory spike 必须尽量与 Prisma 的持久 FK/存在性语义一致，否则 focused tests 会掩盖生产差异。
- orphan fixture 不再是可接受的 Application 合同；低层测试若需要模拟异常，应该显式标注为 Store corruption case。

### 34.5 偏差与限制

- 数据库已有历史 orphan 数据时没有 repair/migration；当前只阻止新建。
- `WorkflowActionInvocation` 尚未有独立 corruption scan 或 repair command。
- Action cancellation/receipt/unknown-result 仍未实现。

### 34.6 下一步

- 增加 Workflow Store integrity audit：扫描 orphan Invocation、Job、StepRun 和 terminal Run 的 active Job。
- 把完整性审计接入启动诊断和维护 Workflow。
- 继续设计 Action 外部副作用 receipt 与 cancellation port。

## 35. Spike AA：Workflow integrity audit

### 35.1 目的

增加只读的 `WorkflowStore.auditIntegrity()`，用来发现持久化状态中的关系断裂和终态泄漏。审计不是修复器，也不改变 Run、StepRun、Job 或 Invocation。

### 35.2 检查范围

- orphan Action Invocation：Invocation 的父 `WorkflowRun` 不存在。
- orphan Workflow Job：Job 引用的 Action Invocation 或父 Run 不存在。
- orphan Workflow StepRun：StepRun 的父 Run 不存在。
- Invocation 与 Job 的关联不一致。
- Invocation 与 StepRun 的关联不一致。
- terminal Run 仍存在 active Action Job。
- terminal Run 仍存在 active 的非 `child_workflow` StepRun。

父 Run 已经 terminal、但 `child_workflow` StepRun 仍等待子 Run terminal event 的情况是合法的异步 parent-wake 状态，不应被误报为 active step 泄漏。

### 35.3 实现

- InMemory Store 与 Prisma Store 都提供结构化 `WorkflowIntegrityReport`。
- Issue 带稳定 `kind`、实体类型、实体 ID 和必要的关联信息，并按稳定顺序输出，便于日志比较和后续诊断。
- 测试通过专用 corruption fixture 直接制造损坏关系，验证审计能发现问题；正常关系先验证 `issueCount: 0`。
- 本轮没有新增数据库 migration，也没有自动删除历史孤儿记录。

### 35.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、51 个测试通过。
- 覆盖正常状态、terminal Run 上 active Job/非 child StepRun，以及 orphan Invocation/Job/StepRun。

### 35.5 设计结论

- 完整性审计应当是启动诊断、维护命令和后续运维指标的只读基础能力。
- “能发现损坏”与“能安全修复损坏”是两个不同合同；修复前必须先定义保守的 ownership、补偿和人工确认边界。
- `child_workflow` 的异步等待必须继续由 terminal Outbox/parent-wake 收口，不能用通用 active-step 规则粗暴判定为泄漏。

### 35.6 偏差与限制

- 尚无历史 orphan repair command、dry-run repair plan 或启动时阻断策略。
- 尚未为 integrity issue 建立持久审计快照、告警级别和 API 展示。
- 审计当前是全表扫描，数据量增大后需要分页、索引或按租约/时间窗口分层扫描。

### 35.7 下一步

- 增加面向运维的只读诊断入口，先报告 issue，不自动修复。
- 设计 orphan repair 的候选动作和不可自动修复的终态。
- 继续收口 Action 外部副作用 receipt、取消和 unknown-result 边界。

## 36. Spike AB：父子 Workflow 的级联取消

### 36.1 目的

收口父 Run 取消或 deadline 超时后的后代生命周期。此前 `cancelRun()` 只取消目标 Run 的 Action Job，子 Workflow 可能继续运行并产生外部访问或副作用。

### 36.2 合同

- 显式取消父 Run 时，递归取消所有仍处于 `queued`、`running` 或 `waiting` 的后代 Run。
- 已经 `succeeded`、`failed` 或 `cancelled` 的后代不被改写。
- 父 Run deadline 超时后，根 Run 仍以 `failed` 收口；未终态后代以 `cancelled` 收口，并携带父 deadline 原因。
- 每个被级联取消的 Run 都独立追加 `workflow.run.terminal` Event/Outbox，使用稳定 terminal idempotency key。
- 取消顺序按后代深度优先、根 Run 最后收口；这样 parent-wake 看到的事件顺序与子树完成方向一致。
- normal `completeRun(succeeded/failed)` 不自动取消 fire-and-forget child Workflow；只有显式 cancel 和 deadline timeout 触发级联。

### 36.3 实现

- InMemory Store 增加后代树收集和深度优先 terminal close。
- Prisma Store 在同一 transaction 内：
  - 先用状态条件收口根 Run；
  - 收集后代并以 `updateMany` 做状态 fencing；
  - 逐个取消后代 Action Job/Invocation/Action StepRun；
  - 为每个成功收口的后代写 terminal Event/Outbox。
- 重复取消只返回既有终态，不重复追加 terminal Event。
- stale child Worker 的 `completeJob()` 不能覆盖级联取消后的 Job/Invocation/StepRun。

### 36.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、55 个测试通过。
- 覆盖：
  - 父取消；
  - 多级后代；
  - active child Action Job；
  - stale completion fencing；
  - 重复取消幂等；
  - 父 deadline 导致根失败、后代取消。

### 36.5 设计结论

取消是 Run Control 的树级命令，不应只修改一个 Run 的状态。数据库内的 terminal close、Job fencing 和子树传播必须在同一持久化边界内收口；parent-wake 仍负责之后的父 StepRun projection。

### 36.6 偏差与限制

- Prisma 当前为 spike 使用全量读取后在内存中构建后代树；大规模数据需要递归查询、分层批处理或专门的 lineage 索引。
- 级联取消只能阻止 Cosmos 接受迟到结果，不能中断已经在外部运行的代码，也不能撤销已经发生的外部副作用。
- 远程 Worker 的 `ActionExecutionContext.isCancelled()` 仍不是跨进程即时通知；需要后续 cancellation signal/abort port。
- 已经 terminal 的父 Run 不会自动修复仍 active 的异常后代；这类状态由 integrity audit 发现，repair policy 后置。

### 36.7 下一步

- 设计 Action effect receipt、idempotency key、unknown-result 和补偿边界。
- 再将 cancellation signal/abort port 接到 Action Worker。
- 评估 descendant lineage 查询在 SQLite 与未来 PostgreSQL 上的实现策略。

## 37. Spike AC：Action effect receipt 与 unknown-result

### 37.1 目的

补齐 Action 已经访问外部系统或产生外部副作用、但 Worker 可能在 Cosmos terminal close 前失联的事实边界。Run/Job lease 只能保护内部状态，不能证明外部副作用没有发生。

### 37.2 合同

`ActionDefinition` 可以声明：

```ts
effectMode: "none" | "external"
```

`external` Action 必须为每次 Job attempt 建立一个 Receipt。Receipt 的唯一业务范围是：

```text
(jobId, attempt)
```

Receipt 状态：

```text
started
→ committed
→ compensated

started
→ unknown
→ committed
→ compensated
```

- `started` 由 Runtime 在调用外部 Action 前持久化。
- Action 必须在返回成功前调用 `context.recordReceipt({ status: "committed", ... })`，或者在无法确定外部结果时记录 `unknown`。
- `unknown` 不得被自动重试覆盖；当前实现把对应 Job 收口为 `failed_terminal`，等待后续 reconciliation/compensation。
- `committed` 不会被迟到的 `unknown` 降级。
- Run/Job 取消会把仍为 `started` 的 Receipt 转换为 `unknown`。
- Action 收到稳定的 `idempotencyKey`、`jobId` 和 `attempt`；当前稳定业务幂等键为 `${runId}:${path}`。

### 37.3 实现

- 新增 `WorkflowActionReceipt` Prisma model 和 migration：
  - 关联 WorkflowRun、ActionInvocation、Job；
  - 保存 external reference、details 和 error；
  - `(jobId, attempt)` 唯一。
- InMemory/Prisma Store 新增：
  - `recordActionReceipt()`；
  - `listActionReceipts()`；
  - 单调状态迁移和 external reference conflict 检查。
- `ActionExecutionContext` 新增：
  - `jobId`；
  - `idempotencyKey`；
  - `attempt`；
  - `recordReceipt()`。
- `WorkflowStore.auditIntegrity()` 增加 Receipt 的 orphan、ownership、attempt 和 terminal `started` 检查。

### 37.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、57 个测试通过。
- 覆盖：
  - effectful Action 成功 receipt；
  - stable idempotency key/attempt 暴露；
  - unknown receipt 后不进入 retry；
  - unknown → committed 的单调升级；
  - 取消时 started → unknown；
  - InMemory/Prisma 持久化与查询。

### 37.5 设计结论

Receipt 不替代 Job，也不把外部系统的事实复制成 Cosmos 可以强行回滚的状态。它是“这次尝试与外部副作用之间的证据链”，用于幂等重试、人工/Agent reconciliation 和未来补偿。

### 37.6 偏差与限制

- 当前 Job status 没有新增 `unknown_result`，未知事实由 Receipt 表达，Job 以 `failed_terminal` 停止自动重试。
- `committed` Receipt 在 stale `completeJob()` 后不会自动把结果重新绑定到 Invocation；reconciliation/query-by-idempotency 仍未实现。
- `compensated` 只有状态合同，没有补偿 Action、补偿预算和操作审计。
- 当前 `recordReceipt()` 仍由 Action 代码主动提供 externalRef/details，Cosmos 不理解第三方平台的语义。

### 37.7 下一步

- 增加 Receipt reconciliation command：按 idempotency key 查询外部系统并恢复 Invocation/Job。
- 设计 `unknown_result` 的 API/SSE/维护 UI projection。
- 增加 Action abort/cancellation port，并验证进程中断、重启接管与 Receipt 的组合。

## 38. Spike AD：Committed Receipt reconciliation

### 38.1 目的

让 committed Receipt 不只是诊断记录：当外部系统已经确认副作用、但旧 Worker 在 `completeJob()` 前失去 lease 时，维护 Worker 可以在严格 CAS 条件下把已知结果重新绑定到当前 Job/Invocation/StepRun。

### 38.2 合同

`reconcileActionReceipt({ receiptId, result, now })` 只允许以下情况应用：

- Receipt 状态是 `committed`；
- Workflow Run 尚未 terminal，且 deadline 尚未到；
- Job 的 `attempts` 与 Receipt 的 attempt 完全相同；
- Job 没有仍然有效的 active lease；
- Job 不是 `cancelled`。

结果原因：

```text
applied
already_applied
not_committed
run_terminal
run_deadline
attempt_superseded
active_lease
job_cancelled
```

`attempt_superseded` 是关键 fencing：如果新 Worker 已经领取了同一个 Job 的下一次 attempt，旧 Receipt 不能覆盖新 attempt 的结果。

### 38.3 实现

- InMemory/Prisma Store 新增 `reconcileActionReceipt()`。
- 应用成功时在同一 Store/transaction 内：
  - Job → `succeeded`；
  - Invocation → `succeeded` 并写入 result；
  - Action StepRun → `succeeded` 并写入 output；
  - 清除 Job lease/retry 时间。
- 重复调用返回 `already_applied`，不会覆盖第一次结果。
- 本轮没有新增 migration；复用了 Round 37 的 Receipt 表。

### 38.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、58 个测试通过。
- 覆盖：
  - expired lease 的 committed Receipt 应用；
  - 重复 reconciliation 幂等；
  - 新 attempt 接管后拒绝旧 Receipt；
  - InMemory/Prisma Job、Invocation、StepRun 结果同步。

### 38.5 设计结论

Reconciliation 必须是显式 Application Command，不应让普通 Worker retry 隐式猜测外部副作用是否成功。`receiptId + attempt` 是恢复边界；如果 attempt 已变化，系统应停下来交给新的 Action/查询 Workflow，而不是强行覆盖。

### 38.6 偏差与限制

- 当前 reconciliation 的 `result` 由维护者、Connector 或后续 Workflow 提供，Cosmos 不会自动访问第三方平台查询。
- 没有把 reconciliation 接入 API、CLI、SSE 或权限审计。
- 没有实现 `unknown → committed` 的外部查询自动转化；当前仍需先由外部事实生成 committed Receipt。
- Prisma reconciliation 的候选扫描/领取仍以后续维护入口为边界，没有独立的 reconciliation Job queue。

### 38.7 下一步

- 将 reconciliation 封装为 `maintenance` Workflow/Job，而不是暴露裸 Store 方法。
- 增加外部查询 Action 和 Receipt reconciliation 结果事件。
- 继续补 Action abort signal、Worker restart/reclaim 与 Receipt 的组合场景。

## 39. Spike AE：Action AbortSignal 与跨进程取消提示

### 39.1 目的

把 Run Control 的取消从“最终不接受结果”推进到“正在执行的 Action 能收到标准停止提示”。这不是强杀机制，Action/Connector 必须自行决定如何停止网络请求、子进程或外部 SDK 调用。

### 39.2 合同

`ActionExecutionContext` 新增：

```ts
signal: AbortSignal
```

- 同一个 `WorkflowRuntime.cancel(runId)` 会立即 abort 当前 Runtime 中该 Run 的 active Action。
- 另一个 Runtime/Worker 取消 Run 后，当前 Action 的 Job heartbeat 发现 `renewJob=false`，触发同一个 signal。
- `isCancelled()` 同时反映 durable cancel 的本地投影和 `signal.aborted`。
- Action 收到 abort 后仍必须遵守 `completeJob/failJob` fencing；signal 不是提交权限。
- Action 可以忽略 signal，但这样只能保证 Cosmos 内部最终状态不被迟到结果覆盖，不能保证外部副作用停止。

### 39.3 实现

- `WorkflowRuntime` 按 Run 保存 active `AbortController` 集合。
- `cancel()` 先 abort 当前 Runtime 的 Action，再执行持久 `cancelRun()`。
- Action Job heartbeat 在 lease renew 失败或异常时 abort signal。
- `RuntimeContext.callAction()` 在 finally 中注销 controller，避免长生命周期 Runtime 泄漏。
- 不新增数据库字段或 migration。

### 39.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`：1 个测试文件、37 个测试通过。
- 覆盖：
  - 本地 Runtime cancel 的即时 abort；
  - 不同 Runtime cancel 后 heartbeat 驱动的 abort；
  - abort 后旧 Action 仍无法完成 Job/Run。

### 39.5 设计结论

取消需要两层合同：

```text
AbortSignal：尽快通知正在执行的代码
Lease fencing：最终阻止迟到代码写入 durable truth
```

两者不能互相替代。AbortSignal 是 cooperative cancellation；强制终止、子进程回收和第三方请求中断属于 Action/宿主能力。

### 39.6 偏差与限制

- 父 Run 级联取消不会直接枚举并 abort 其他进程中的所有 descendant Action；它们依赖各自 heartbeat 发现 Job 已被取消。
- 没有实现 Abort reason、grace period、drain timeout 或强制 kill。
- `AbortSignal` 还没有被映射到 Connector/Adapter 的统一 abort port。

### 39.7 下一步

- 为 Action/Connector 定义统一 `abort`/graceful stop port。
- 将 cancellation、lease_lost、unknown-result 接入 Worker Supervisor 和 heartbeat。
- 继续验证 Worker restart/reclaim 与 abort/Receipt 的组合。

## 40. Spike AF：Receipt reconciliation 的 maintenance Workflow 边界

### 40.1 目的

把 Round 38 的裸 `WorkflowStore.reconcileActionReceipt()` 收敛到 Workflow/Action 模型中，验证未来可以编排：

```text
外部查询 Action
→ committed Receipt
→ Receipt reconciliation Action
→ 通知/审计/知识处理 Action
```

### 40.2 合同

新增版本化定义：

```text
Action    cosmos.receipt.reconcile@1
Workflow  cosmos.maintenance.receipt-reconcile@1
```

Workflow 输入：

```ts
{
    receiptId: string;
    result: unknown;
}
```

Workflow 输出保留：

- `receiptId`
- `invocationId`
- `applied`
- reconciliation `reason`

底层 CAS、Run deadline、active lease、attempt supersede 和 cancelled Job 规则不改变。

### 40.3 实现

- 新增 `createWorkflowReceiptReconcileAction()`。
- 新增 `createWorkflowReceiptReconciliationWorkflow()`。
- 新增 `registerWorkflowReceiptReconciliation(runtime, store, now)`：
  - 注册 Action Definition；
  - 注册 maintenance Workflow Definition；
  - 允许宿主决定是否启用，不在 `apps/worker` 自动开启。
- InMemory focused test 通过真实 Workflow Runtime 执行 reconciliation，确认结果重新写入原 Invocation。
- 不新增数据库字段或 migration。

### 40.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`：1 个测试文件、38 个测试通过。
- 覆盖底层 reconciliation 和 maintenance Workflow 编排边界。

### 40.5 设计结论

Reconciliation 是一种 maintenance Workflow，而不是 API 对数据库的特殊旁路。外部平台查询、Receipt 更新、结果恢复、通知和审计都可以通过 Action 组合；Cosmos Runtime 只负责 durable orchestration 和边界 fencing。

### 40.6 偏差与限制

- 当前 registration helper 仍是 package-level spike，没有生产 Definition Registry/Binding/权限/审计接线。
- maintenance Workflow 的 `result` 由上游查询 Action 或调用方提供，尚未定义标准外部查询协议。
- 没有把 reconciliation 结果作为 DomainEvent/Outbox 事件发布。

### 40.7 下一步

- 将该 Workflow Definition 放入持久 Definition Registry，并通过 Binding 控制启用。
- 增加外部查询 Action 的 Adapter contract 和查询结果校验。
- 为 reconciliation、compensation、notification 设计统一 maintenance lane。

## 41. Spike AG：Workflow lane/priority 调度接缝

### 41.1 目的

验证 Ingest、Knowledge、Research、Maintenance 等 Workflow 是否可以在同一持久 Run 表中隔离领取，并为后续 Worker Supervisor 提供最小 admission/lane 接缝。

### 41.2 合同

每个 `WorkflowRun` 新增：

```text
lane     默认 "default"
priority 默认 0
```

`claimNextRun()`：

- 如果 Worker 指定 lane，只能领取同 lane 的 queued 或 lease expired Run；
- 按 `priority DESC`；
- 再按 `createdAt ASC`、`id ASC` 稳定排序；
- 没有 wildcard lane，也没有跨 lane 自动窃取。

`WorkflowRuntimeOptions.lane` 表示 Worker 的 admission lane。父 Workflow 启动 child 时，child 继承父的 lane/priority；独立创建的 Run 可以显式指定。

### 41.3 实现

- Runtime 公共合同新增 lane/priority schema、默认值和 Run/Input 字段。
- `WorkflowRuntime.start()` 支持 `lane`/`priority`。
- `WorkflowRuntime.runNext()` 将 Worker lane 传给 Store。
- InMemory/Prisma `claimNextRun()` 保持同一过滤和排序语义。
- Prisma migration：
  - `20260809110000_workflow_run_lane_priority`；
  - 新增 `WorkflowRun.lane`、`WorkflowRun.priority`；
  - 新增 `(lane, status, priority, createdAt)` 索引。

### 41.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、64 个测试通过。
- 覆盖：
  - default/maintenance lane 隔离；
  - priority 高者先领取；
  - Runtime lane admission；
  - child lane/priority inheritance；
  - Prisma 持久 mapping。

### 41.5 设计结论

Lane 是 Worker 的领取边界，priority 是 lane 内的排序信号；它们不替代 Workflow budget、backpressure、fairness 或 rate limit。把这些概念混成一个 `priority` 字段会导致后续返工，因此本轮只固定最小调度语义。

### 41.6 偏差与限制

- 没有 priority aging/fairness；高优先级持续涌入可能饿死低优先级 Run。
- 没有 lane capacity、并发度、backpressure、rate limit 或 quota admission。
- 没有 parent/child 跨 lane policy；当前 child 直接继承父 lane。
- `apps/worker` 尚未按 lane 启动多个正式 Supervisor lane。

### 41.7 下一步

- 设计 Worker Supervisor 的 lane configuration、并发上限、heartbeat 和 drain。
- 加入 priority aging/fairness 的可选策略，不修改底层脚本 Workflow 语义。
- 将 Source schedule、Research request、Maintenance reconciliation 映射到正式 lane。

## 42. Spike AH：Workflow lane supervisor 接缝

### 42.1 目的

在不替换现有 `apps/worker` 的情况下，验证多个 Workflow lane、并发 slot 和 graceful stop 可以由一个宿主级 Supervisor 统一管理。

### 42.2 合同

`WorkflowLaneSupervisor` 接受多个 lane definition：

```ts
{
    id: string;
    lane: string;
    runtime: WorkflowRuntime;
    concurrency?: number;
    pollIntervalMs?: number;
}
```

- 每个 lane 创建固定数量的 `WorkflowWorkerLoop` slot；
- slot 共享同一 lane admission，但每个 tick 独立 claim Run；
- 一个 Workflow 业务失败收口为 `processed + runStatus=failed`，不阻塞其他 slot；
- lease/store 基础设施异常仍以 `error`/`lease_lost` 暴露；
- `stop()` 停止领取新 tick，等待当前 tick 和各 slot loop 退出；
- Supervisor 不自动接管 fixed Ingest、parent-wake 或 Worker heartbeat。

### 42.3 实现

- 新增 `WorkflowLaneSupervisor`、lane status、slot tick result。
- 构造时校验：
  - lane id 唯一；
  - Runtime lane 与 definition lane 一致；
  - concurrency 和 poll interval 为正数。
- `tick()` 按 lane concurrency 并发执行 slot。
- `start()`/`stop()` 复用现有 `WorkflowWorkerLoop` 的可停止 poll 生命周期。
- 不新增数据库字段或 migration。

### 42.4 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`：1 个测试文件、43 个测试通过。
- 覆盖：
  - concurrency=2 的 bounded slots；
  - lane 内多个 Run 处理；
  - 业务失败与成功 slot 隔离；
  - start/stop drain；
  - slot tick 观测结果。

### 42.5 设计结论

Supervisor 是宿主运行控制层，不应进入脚本 Workflow 语义。Workflow Runtime 提供单次 durable tick 和 lease fencing；Supervisor 决定 lane、并发、poll、停止和未来的 backpressure。

### 42.6 偏差与限制

- 当前 Supervisor 只管理 Workflow Runtime loop，不管理旧 Ingest Job、parent-wake Outbox Consumer 或 heartbeat。
- 没有全局并发预算、lane quota、fairness、aging、backpressure、circuit breaker 或 shutdown grace period。
- 多 slot 当前可共享同一个 Runtime workerId；生产实现需要决定 slot/worker identity 与 heartbeat 维度。
- 没有接入 `apps/worker`，避免把实验性 Supervisor 当作生产入口。

### 42.7 下一步

- 抽象统一 `PollerLane` Port，让 Ingest、Outbox、Workflow Run 共用 Supervisor 生命周期。
- 增加 durable Worker lane heartbeat、slot identity、drain deadline 和 backpressure。
- 评估 lane 内 priority aging 与全局 budget admission。

## 43. Spike AI：通用 Poller Lane Supervisor

### 43.1 目的

把 Supervisor 生命周期从 Workflow Runtime 中再抽象一层，验证旧 Ingest Worker、Outbox parent-wake 和未来 Workflow Run lane 可以共享同一种 poller/slot/stop 合同。

### 43.2 合同

`WorkerPollerSupervisor` 接受：

```ts
{
    id: string;
    concurrency?: number;
    pollIntervalMs?: number;
    createPoller(slot: number): WorkerPollerPort;
}
```

- 每个 slot 有独立 identity；
- `tick()` 对 lane 的 slots bounded 并发；
- 单个 poller 抛错只产生该 slot 的 `error`，不影响其他 slot；
- `start()` 启动 poll loop；
- `stop()` 停止新 poll、唤醒 timer 并等待当前 poll 完成；
- observation callback 抛错不会停止 poller。

### 43.3 与 WorkflowLaneSupervisor 的关系

```text
WorkerPollerSupervisor       宿主通用生命周期
└── WorkflowLaneSupervisor   Workflow Run 专用 admission/lease tick
```

本轮没有强行把两者合并成一套复杂泛型；Workflow Runtime 仍保留 `processed/failed/lease_lost` 语义，宿主 Poller Supervisor 只负责 poller 生命周期和 slot 错误隔离。

### 43.4 实现

- `packages/application/src/index.ts` 新增：
  - `WorkerPollerPort`；
  - `WorkerPollerLaneDefinition`；
  - `WorkerPollerSupervisor`；
  - slot tick result/status。
- `createPoller(slot)` 为未来 Ingest/Outbox/Workflow lane 提供 owner/consumer identity 注入点。
- 不修改 `apps/worker/src/main.ts`，不改变现有生产轮询链路。
- 不新增数据库字段或 migration。

### 43.5 验证

- `bun run test -- packages/application/src/index.test.ts --reporter=dot`：1 个测试文件、8 个测试通过。
- 覆盖：
  - bounded poller slots；
  - 单 slot error isolation；
  - observation callback failure isolation；
  - graceful stop/drain；
  - duplicate lane/invalid concurrency validation。

### 43.6 设计结论

宿主 Supervisor 不应理解 Entry、Story 或 Action 业务；它只协调可持久化的 poller。WorkflowLaneSupervisor 可以作为一种更强的 poller adapter，fixed Ingest 和 Outbox 也应沿相同生命周期接入。

### 43.7 偏差与限制

- 通用 Supervisor 仍是 package-level spike，没有统一 heartbeat/metrics/tracing。
- 没有 poller backpressure、lane quota、circuit breaker、drain deadline 或 force stop。
- `apps/worker` 尚未迁移到通用 Supervisor；当前生产代码仍有手写 `setInterval`。

### 43.8 下一步

- 为 Ingest Worker、parent-wake Consumer 和 Workflow Supervisor 实现 Poller Adapter。
- 统一 slot identity、WorkerHeartbeat、日志字段和 shutdown 状态。
- 再设计 backpressure 与 lane budget，不把策略塞入单个 Poller。

## 44. Spike AJ：固定 Worker 的 Poller Adapter

### 44.1 目的

验证现有固定 Ingest/Probe Worker 和 terminal parent-wake Consumer 可以接入通用
`WorkerPollerSupervisor`，同时保持各自的 Job/Outbox 领域语义不进入宿主层。

### 44.2 合同

新增两个 Application 层 factory：

```ts
createIngestionWorkerPollerLane(...)
createWorkflowParentWakeWorkerPollerLane(...)
```

- Ingest lane 为每个 slot 创建一个 `IngestionWorker`；
- owner identity 使用 `<ownerPrefix>:<laneId>:<slot>`；
- 每个 parent-wake slot 由调用方提供已经完成 Definition/Binding 解析的 Consumer；
- Supervisor 只看到 `pollOnce()`，不解释 Job、Outbox、Entry 或 Workflow 状态；
- Consumer 的 lease/ack/cursor 仍由 parent-wake Consumer 自己持有。

### 44.3 实现

- `packages/application/src/index.ts`
  - 新增 `IngestionWorkerPollerLaneOptions`；
  - 新增 `createIngestionWorkerPollerLane`；
  - 新增 `WorkflowParentWakeWorkerPollerLaneOptions`；
  - 新增 `createWorkflowParentWakeWorkerPollerLane`。
- `packages/application/src/index.test.ts`
  - 验证两个 Ingest slot 生成独立 owner；
  - 验证两个 parent-wake slot 分别创建 Consumer；
  - 验证 adapter 不改变 Supervisor 的结果封装。
- 没有修改 `apps/worker/src/main.ts`，没有新增 migration。

### 44.4 设计结论

Poller Adapter 的职责是“把领域 worker 实例化为宿主 slot”，不是把 Job 或
Consumer 的状态抽象成另一套状态机。Ingest 的 owner identity 可以由 lane factory
同步生成；parent-wake 的异步 Definition/Binding 解析仍由宿主在创建 lane 前完成。

这保留了一个重要边界：

```text
宿主 Supervisor：slot 生命周期、并发、停止、观测
领域 Worker：claim/lease/retry/checkpoint 或 claim/ack/cursor
```

### 44.5 偏差与限制

- `apps/worker` 仍使用手写 `setInterval`，本轮只验证 adapter，不迁移生产 wiring。
- `WorkerPollerLaneDefinition.createPoller()` 仍为同步 factory；需要异步创建
  Consumer 的宿主必须先完成 Definition/Binding 解析。
- slot heartbeat、全局预算、backpressure、fairness、drain deadline 和强制
  abort 仍未实现。

### 44.6 下一步

- 在不改变领域 worker 合同的前提下，把 adapters 组合到一个 worker bootstrap
  spike，验证 startup/shutdown 顺序和 disabled binding。
- 再决定是否需要 async lane materialization，而不是先把异步初始化塞入
  `WorkerPollerSupervisor` 构造函数。

## 45. Spike AK：Worker bootstrap 的多 lane 接线

### 45.1 目的

验证生产 `apps/worker` 可以使用通用 Poller Supervisor 管理固定 Ingest 和
parent-wake 两条 lane，并明确 graceful shutdown 的顺序。

### 45.2 实现

- `apps/worker/src/main.ts`
  - Ingest lane 通过 `createIngestionWorkerPollerLane()` 创建；
  - parent-wake lane 按 slot 预先完成 Definition/Binding 解析，再通过
    `createWorkflowParentWakeWorkerPollerLane()` 注入；
  - 每个 Ingest slot 使用独立 Job owner；
  - 每个 parent-wake slot 使用独立 Consumer owner；
  - `WorkerPollerSupervisor.start()` 取代手写 `setInterval`；
  - `onTick` 负责统一 poller 错误观察和 process-level ready heartbeat；
  - shutdown 顺序固定为：

```text
stop supervisor
→ drain active poll
→ heartbeat(stopped)
→ close Repository
→ close Logger
```

- 默认保持单 slot；通过环境变量预留：
  - `COSMOS_WORKER_INGEST_CONCURRENCY`
  - `COSMOS_WORKER_PARENT_WAKE_CONCURRENCY`

### 45.3 设计结论

生产 Worker 的 bootstrap 可以只负责组合：

```text
Repository / Connector / Definition Registry
→ Domain Worker Poller Adapter
→ WorkerPollerSupervisor
```

它不需要把 Ingest 或 Outbox 状态翻译成统一业务状态。Supervisor 的 `error`
只表示 poller 基础设施或未处理异常；领域 Worker 仍返回自己的 Job/Consumer
结果并自行完成 durable 收口。

异步的 Consumer Definition/Binding 解析放在 Supervisor 构造之前完成，避免让
同步构造函数隐式拥有数据库初始化和网络/注册依赖。

### 45.4 偏差与限制

- 本轮只完成 bootstrap 接线，尚未建立独立的 Worker bootstrap 单元测试。
- heartbeat 仍是进程级状态，不是持久化的 lane/slot heartbeat。
- 多 lane 的公平性、预算、backpressure、drain deadline 和强制 abort 仍未实现。
- Workflow Run execution lane 仍未启用；当前 parent-wake 只是 durable projection
  consumer。

### 45.5 验证

- `bun run --cwd apps/worker typecheck`：通过。
- `bun run build:worker`：通过。
- `pwsh -NoProfile -File scripts/smoke-node.ps1`：通过；
  - Worker health 为 `ready`；
  - Source/Run/Feed/Search/Story/SSE 链路通过；
  - API/Worker/Connector 结构化日志关联通过。
- `COSMOS_WORKER_INGEST_CONCURRENCY=2`
  `COSMOS_WORKER_PARENT_WAKE_CONCURRENCY=2` 下重跑同一 smoke：通过。

该 smoke 使用隔离 Data Root，并验证 Worker 能启动和消费真实 API 任务；
脚本当前使用 `Stop-Process -Force` 清理进程，因此 graceful shutdown 仍未作为
独立验收证据。

### 45.6 下一步

- 补充 graceful shutdown/drain 的独立进程级验收；
- 将 startup 配置解析和 lane 状态抽成可测试的 bootstrap port；
- 再评估是否需要异步 lane materialization，以及是否接入 Workflow Run lane。

## 46. Spike AL：Worker bootstrap 的可测试边界

### 46.1 目的

把 Worker 主入口中的环境变量解析和 lane materialization 抽成独立模块，
避免 `apps/worker/src/main.ts` 同时承载配置规则、Consumer 初始化、lane
组合和 Supervisor 生命周期。

### 46.2 实现

新增 `apps/worker/src/bootstrap.ts`：

- `readWorkerBootstrapConfig()`：
  - 统一解析 poll interval、lease、Ingest concurrency、parent-wake
    concurrency、版本和 Consumer ID；
  - 非正数、非有限数和非整数配置在启动前失败。
- `createWorkerPollerLanes()`：
  - 总是创建 Ingest lane；
  - disabled parent-wake 不 materialize Consumer；
  - enabled parent-wake 按 slot 异步创建 Consumer；
  - 将 owner identity 固定为
    `<instanceId>:workflow-parent-wake:<slot>`。

`apps/worker/src/main.ts` 现在只负责：

```text
Repository / Connector / Registry 初始化
→ bootstrap lane composition
→ WorkerPollerSupervisor
→ heartbeat / signal / close
```

### 46.3 测试

新增 `apps/worker/src/bootstrap.test.ts`，覆盖：

- 默认和显式环境配置；
- 非法配置拒绝；
- disabled binding 不创建 parent-wake Consumer；
- 2 个 Ingest slot + 2 个 parent-wake slot 的 owner/lane 组合。

### 46.4 设计结论

异步外部依赖的 materialization 应由 bootstrap port 完成；通用 Supervisor
继续只接收已经构造好的 Poller。这样可以测试“是否创建了哪些 lane/slot”，
也不会把 Registry/Prisma 初始化细节泄漏进通用运行时。

### 46.5 偏差与限制

- 尚未把 heartbeat 状态和 lane/slot 状态抽成持久模型。
- graceful shutdown 仍缺独立进程级测试；现有 Node smoke 使用强制清理。
- Workflow Run execution lane 仍未接入生产 Worker。

### 46.6 下一步

- 设计可测试的 graceful shutdown harness，验证 SIGTERM/SIGINT 后的 drain 和
  stopped heartbeat；
- 检查配置变更对 Docker/.env.example/部署文档的同步；
- 再评估 lane heartbeat、backpressure 和 Workflow Run lane。

## 47. Spike AM：Poller graceful drain fencing

### 47.1 目的

验证 Supervisor 在一个 slot 的 `pollOnce()` 尚未返回时收到 stop 请求，
能够等待当前 poll 完成，同时拒绝新的手动 tick。

### 47.2 发现与修复

原实现只拒绝 `running` 和 `stopped` 状态的手动 `tick()`；当状态已经进入
`stopping` 时仍会接受新的 tick。这会让 shutdown drain 期间出现额外 poll，
破坏“停止接纳新工作”的生命周期合同。

修复为 `stopping` 状态明确抛出：

```text
Worker Poller Supervisor is stopping.
```

当前顺序固定为：

```text
stop()
→ status=stopping
→ 拒绝新 tick
→ 等待 current poll
→ status=stopped
```

### 47.3 测试

新增 Application focused test：

- poller 阻塞在当前 tick；
- `stop()` 进入 `stopping`；
- 新 `tick()` 被拒绝；
- 释放 poller 后 stop 等待完成；
- `poll.finished` 先于 Supervisor stopped。

### 47.4 设计结论

Supervisor 的 drain 是 admission fencing，不是强制终止外部调用。正在执行的
Connector/Consumer/Action 仍需要自己的 AbortSignal 和租约 fencing；Supervisor
只保证不再启动新的 poll，并等待已有 poll 返回。

### 47.5 偏差与限制

- 尚未做真实 OS signal 到 Worker 进程的独立测试；
- 没有 drain deadline 或卡死 poller 的强制回收；
- `stopped` heartbeat 仍由 apps/worker signal handler 写入。

### 47.6 下一步

- 将 signal handler 的 shutdown sequence 抽成可注入 port；
- 增加 drain deadline/超时后的 degraded close 设计；
- 同步更新 Docker stop grace period 和 Worker 运维状态。

## 48. Spike AN：可注入的 Worker shutdown sequence

### 48.1 目的

把 `apps/worker` 的 signal handler 从不可测试的 `process.exit()` 闭包中抽出，
验证 shutdown 的阶段顺序、幂等和 degraded close。

### 48.2 实现

新增 `createWorkerShutdownController()`，由宿主注入：

- `stopPollers`
- `heartbeatStopped`
- `closeRepository`
- `announceStopped`
- `closeLogger`
- `onStageError`

控制器保证：

```text
stop pollers
→ heartbeat(stopped)
→ close repository
→ announce worker.stopped
→ close logger
```

- 多次收到 SIGINT/SIGTERM 共享同一个 Promise；
- 任一阶段失败不会跳过后续清理；
- 结果返回 `ok/exitCode=0` 或 `degraded/exitCode=1`；
- `process.exit()` 只留在 `apps/worker/src/main.ts` 的最外层 signal adapter。

### 48.3 测试

新增 bootstrap focused tests：

- 成功 shutdown 的阶段顺序；
- 重复 signal 的 promise 去重；
- poller/repository/logger 任一阶段失败后的继续清理和 degraded 结果。

### 48.4 设计结论

signal 是宿主输入，不应成为领域 Worker 的状态机。shutdown controller 只协调
生命周期阶段；Job/Outbox/Workflow 的 durable 收口仍由各自 Store/Worker 完成。

### 48.5 偏差与限制

- 尚未有真实 OS signal + 独立 Worker 进程的 graceful shutdown 验收；
- 没有 drain deadline，阻塞 poll 仍可能无限等待；
- `stopped` heartbeat 仍是 process-level，不包含每个 lane/slot。

### 48.6 下一步

- 增加可配置 drain deadline；
- 设计超时后的 degraded close、AbortSignal 和租约处理；
- 将 Docker stop grace period 与 shutdown deadline 对齐。

## 49. Spike AO：Poller drain deadline 的显式结果

### 49.1 目的

验证 Supervisor 可以在 deadline 到达时报告“仍有活动 slot”，而不把未完成
poll 错误地标记为 `stopped`。

### 49.2 合同

```ts
supervisor.stop({ deadlineMs })
```

返回：

```ts
{
    status: "drained" | "timed_out";
    activeSlots: Array<{ laneId: string; slot: number }>;
}
```

- `drained`：所有当前 poll 已完成，Supervisor 进入 `stopped`；
- `timed_out`：Supervisor 保持 `stopping`，返回仍在运行的 slot；
- timeout 不会强制终止 poll，也不会关闭 Repository；
- 后续调用无 deadline 的 `stop()` 仍可等待最终 drain。

### 49.3 实现与测试

- `packages/application/src/index.ts`
  - 新增 `WorkerPollerStopOptions`；
  - 新增 `WorkerPollerStopResult`；
  - `stop()` 支持可选 non-negative deadline；
  - active slot 通过 loop promise 观察。
- `packages/application/src/index.test.ts`
  - 阻塞 poll 的 timeout；
  - timeout 后拒绝新 tick；
  - 释放 poll 后继续完成最终 drain；
  - 负 deadline 在任意 Supervisor 状态下拒绝。

### 49.4 设计结论

deadline 只是“观察和分级关闭”的边界，不是安全强杀机制：

```text
timed_out
→ 仍可能有外部调用
→ 不能直接假设 Repository 可安全关闭
```

真正的 degraded close 需要和 AbortSignal、Job/Outbox lease fencing、进程终止
以及 Docker stop grace period 一起设计。

### 49.5 偏差与限制

- `apps/worker` 当前仍使用无 deadline 的 graceful shutdown；
- timeout 后的宿主策略尚未自动化；
- 没有持久化 drain state 或 active slot heartbeat。

### 49.6 下一步

- 将 `WorkerPollerStopResult` 接入 shutdown controller；
- 设计 timeout 后先 abort、再等待 fencing、最后决定 Repository close 的策略；
- 增加进程级 SIGTERM 验收。

## 50. Spike AP：Drain timeout 的安全 shutdown 边界

### 50.1 目的

验证 `WorkerPollerStopResult.timed_out` 接入 shutdown controller 后，不会在
仍有活动 poll 时关闭共享资源。

### 50.2 合同

当 `stopPollers()` 返回：

```ts
{
    status: "timed_out";
    activeSlots: ...
}
```

shutdown controller：

- 返回 `degraded`、`exitCode=1`；
- 调用 `onDrainTimeout` 记录 active slots；
- 不写 `heartbeat(stopped)`；
- 不调用 `Repository.close()`；
- 不调用 `Logger.close()`；
- 不宣称 `worker.stopped`。

正常 `drained` 或没有返回 stop result 时，继续完整清理。

### 50.3 设计结论

```text
timed_out
→ active poll 仍可能访问 Repository
→ 不关闭共享资源
→ 由最外层宿主决定进程终止
```

这避免了“旧 poll 仍在执行、Repository 已关闭”的二次竞态。后续需要把
AbortSignal、lease fencing 和进程终止组合起来，才能实现更完整的 degraded close。

### 50.4 测试

- 正常 shutdown 结果增加 `resourcesClosed=true` 和空 active slots；
- timeout shutdown 返回 `resourcesClosed=false`；
- timeout 路径只执行 `pollers.stop → drain.timeout`；
- 仍保留阶段失败后的继续清理测试。

### 50.5 偏差与限制

- `apps/worker` 当前没有配置 drain deadline，所以生产仍走完整 graceful drain；
- timeout 后由 `process.exit(1)` 终止进程，尚未实现先 abort/lease fencing 的编排；
- 没有真实 SIGTERM 进程级验证。

### 50.6 下一步

- 为 Worker 增加可配置 `COSMOS_WORKER_DRAIN_DEADLINE_MS`；
- 在 timeout 路径接入 Action/Connector AbortSignal；
- 验证旧 Job/Outbox Worker 在进程终止后不能继续写入。

## 51. Spike AQ：Worker drain deadline 配置接线

### 51.1 实现

新增可选环境变量：

```text
COSMOS_WORKER_DRAIN_DEADLINE_MS
```

- 未配置：保持无限 cooperative drain；
- 配置非负毫秒数：传递给 `WorkerPollerSupervisor.stop()`；
- 配置非法值：Worker bootstrap 在启动配置阶段失败；
- Worker started log 记录 deadline（未配置时为 `null`）。

### 51.2 运行结果

- deadline 内完成：正常写 stopped heartbeat、关闭 Repository/Logger；
- deadline 超时：复用 Spike AP 的安全路径：
  - 记录 `worker.drain_timeout`；
  - 返回 degraded；
  - 不写 stopped heartbeat；
  - 不关闭 Repository/Logger；
  - 最外层以 `exitCode=1` 终止进程。

### 51.3 设计结论

默认行为保持兼容，deadline 是显式的运维策略而不是隐式强杀。只有明确配置
deadline 后，Worker 才会进入 timeout 分支；真正的 abort/fencing 仍需后续接入。

### 51.4 测试

- bootstrap 配置默认值包含 `drainDeadlineMs=undefined`；
- 显式 `1500` 可解析；
- 负值被拒绝；
- Round 50 timeout shutdown 行为继续通过。

### 51.5 偏差与限制

- 真实 SIGTERM 与 deadline 的进程级测试仍未完成；
- timeout 后依赖 `process.exit(1)`，尚未实现外部调用 abort；
- Docker stop grace period 尚未同步。

### 51.6 下一步

- 做 Node Worker 的 SIGTERM + deadline smoke；
- 将 AbortSignal 从 Supervisor/Worker 传播到 Connector/Consumer；
- 验证 timeout 后 lease fencing 和重启接管。

### 51.7 平台验证记录

在当前 Windows 环境用 Node 子进程实验 `process.kill(childPid, "SIGTERM")`
和 `"SIGINT"`，子进程均直接退出且没有触发 Node signal handler。该调用不能
作为 Windows graceful shutdown 验收手段。

因此当前证据分开记录：

- PowerShell 7 Node smoke：startup 和真实业务链路通过；
- shutdown controller focused test：顺序、幂等、timeout 分支通过；
- Windows 独立进程 graceful SIGTERM：未验证，现有 `smoke-node.ps1` 使用
  `Stop-Process -Force` 清理。

## 52. Spike AR：Poller AbortSignal 传播

### 52.1 实现

`WorkerPollerPort.pollOnce()` 增加可选 `AbortSignal`：

```ts
pollOnce(signal?: AbortSignal): Promise<unknown>
```

`WorkerPollerSupervisor`：

- 每个 slot 持有独立 `AbortController`；
- `start()` 为新生命周期创建新的 controller；
- `stop()` 先 abort 当前 slot，再等待 poll 返回；
- timeout 仍只报告 active slot，不强制终止。

### 52.2 设计边界

本轮只扩展宿主 Port，不改变领域 Worker 的错误分类：

```text
Supervisor AbortSignal
→ Poller Adapter
→ Connector/Consumer/Action（后续选择性接入）
```

AbortSignal 是 cooperative hint；Job/Outbox lease fencing 仍是 durable truth
的最终边界。领域适配器必须决定 abort 是取消、retry_wait、unknown result
还是继续完成外部副作用。

### 52.3 测试

- 阻塞 poll 收到 stop 后观察到 `signal.aborted`；
- abort 后 poll 返回，Supervisor 正常 drained；
- 既有 timeout、stopping tick fencing 和全量恢复测试继续保留。

### 52.4 偏差与限制

- Ingest Connector、parent-wake Consumer 尚未消费 signal；
- 没有把 AbortError 自动映射到 Job 状态；
- 没有跨进程 abort 或 OS signal 证明。

### 52.5 下一步

- 为 Connector/Consumer 定义统一 signal/abort port；
- 明确 abort 与 retry/unknown Receipt 的映射；
- 验证 Ingest 在外部 fetch 中断后的 lease/checkpoint 行为。

## 53. Spike AS：AbortSignal 到 Ingest/Probe Connector

### 53.1 实现

将 cooperative signal 继续传递到 Application 的外部来源边界：

- `ConnectorProbeService.runSource(sourceId, signal?)`；
- `IngestionService.runSource/runExistingRunWithLease(..., signal?)`；
- `IngestionWorker.pollOnce(signal?)`；
- `IngestConnector.fetchItems({ source, cursor, signal? })`。

Supervisor stop → Poller Adapter → Ingest/Probe → Connector fetch 现在有一条
明确的可选 signal 链路。

### 53.2 语义边界

本轮没有自动把 AbortError 映射成某个 Job 状态，也没有自动推进/回退
checkpoint。Connector/Adapter 仍需要自行决定：

- 是否真正中断外部请求；
- 返回 retryable failure；
- 报告 unknown external result；
- 是否允许已经完成的副作用继续进入 durable 收口。

### 53.3 测试

- ConnectorProbe focused test 确认传入同一个 AbortSignal；
- Application Worker/Connector 既有测试继续通过；
- Supervisor 层仍验证 stop 时 signal aborted。

### 53.4 偏差与限制

- 内置 RSS/Collector 当前只是接收可选 signal，未必主动消费；
- parent-wake Consumer 的底层 delivery 尚未实现 signal-aware abort；
- checkpoint/Entry/Asset 写入没有新增 signal fencing；
- lease fencing 仍是最终正确性边界。

### 53.5 下一步

- 为 Connector/Consumer 定义 AbortError 和 retry/unknown 统一合同；
- 做中断中的 Ingest fixture，验证旧 checkpoint、Observation 和 Job lease；
- 将 Action effect receipt 与 abort 结果组合验证。

## 54. 变更记录

### 2026-08-08

- 建立 Workflow Runtime 持续 Task。
- 固定 `Job + Workflow`、脚本优先语义和 Cosmos/Harness durable truth 边界。
- 固定 Connection/Adapter/Knowledge/Research 的后续实现顺序。
- 完成 Spike A：验证脚本 Workflow 的 Action journal replay、等待恢复和 stale lease rejection。
- 完成 Fixed Ingest Workflow 接缝 spike，验证 `source.fetch → library.ingest → checkpoint/event`。
- 完成 Spike B：验证持久 Outbox 的 cursor、claim、lease takeover、ack、retryable failure 和 terminal failure。
- 完成 Spike C：验证 per-Consumer Group delivery、独立 lease/ack/cursor 和多消费者隔离。
- 完成 Spike D：验证 bounded retry、指数退避和 max attempts terminal close。
- 完成 Spike E：验证 generic Outbox Consumer Runner 的单次 tick、错误分类、ack/fail 和 lease-lost 恢复边界。
- 完成 Spike F：验证 Consumer Definition/Binding、event filter、skipped delivery 和 cursor 推进。
- 完成 Spike G：验证持久 Consumer Registry、Definition 版本不可变、Binding 激活和 Runner 解析。
- 完成 Spike H：验证 Consumer Binding revision/CAS fencing 和 stale activation rejection。
- 完成 Spike I：验证 `wait_signal` StepRun 的等待、Signal 消费、resume 和 replay 持久语义。
- 完成 Spike J：验证 checkpoint StepRun 与 Run checkpoint 的原子收口和稳定 path 边界。
- 完成 Spike K：验证 child Workflow start-only StepRun、父子 Run 关联、稳定 path replay 和 `wait: true` 的明确后置边界。
- 完成 Spike L：验证 queued/expired Workflow Run 的单次 durable dispatch tick、稳定领取顺序和无任务时的 idle 返回。
- 完成 Spike M：验证两个独立 Worker 共享 Store 时的单 lease claim fencing 和不重复执行。
- 完成 Spike N：验证旧 Worker lease 失效后不能覆盖新 Worker 的 terminal close。
- 完成 Spike O：验证 `WorkflowWorkerLoop` 的 processed/idle/lease_lost 结果和可停止 poll 生命周期。
- 完成 Spike P：验证 child terminal close 在同一 Store/transaction 内收口父级 child_workflow StepRun。
- 完成 Spike Q：验证 `startChildWorkflow(wait:true)` 的 waiting kind/ref、child completion requeue 和父脚本 replay。

### 2026-08-09

- 完成 Spike R：验证 `completeRun()` 原子写入 `workflow.run.terminal` DomainEvent/Outbox，且与显式业务事件共存、不重复。
- 完成 Round 26：修正固定 Ingest 对 terminal event 的旧事件数量假设，focused/full、Prisma 和文档验证重新通过。
- 完成 Spike S：验证 terminal Outbox 由独立 parent-wake Consumer 驱动父 StepRun 收口和 waiting Run requeue，且 ack 丢失重试不会重复推进。
- 完成 Spike T：统一 terminal Application Command，取消路径写入 terminal Event/Outbox，并用 lease fencing 拒绝旧 Worker 收口。
- 完成 Spike U：验证 child cancellation 经 terminal Outbox 和 parent-wake Consumer 驱动父 StepRun 收口、父 Run requeue 与父 replay failure。
- 完成 Spike V：验证持久 Workflow deadline、timeout sweep、迟到 terminal fencing 和 deadline migration。
- 完成 Spike W：验证 terminal Run 对 Action Job/Invocation/StepRun 的取消和 stale completion fencing。
- 完成 Spike X：将 terminal parent-wake Consumer 接入 `apps/worker` 的共享 Prisma/Data Root poll 链路，保留 Workflow Definition Runtime 后置边界。
- 完成 Spike Y：将 parent-wake Consumer 改为持久 Definition/Binding Registry 激活，验证版本不可变和 disabled binding 尊重。
- 完成 Spike Z：统一 InMemory/Prisma Action Invocation 的父 Run existence/terminal/deadline fencing，消除新 orphan Invocation。
- 完成 Spike AA：增加 InMemory/Prisma `WorkflowStore.auditIntegrity()` 只读完整性审计，覆盖 orphan 关系、Invocation/Job/StepRun 关联不一致和 terminal Run 的 active work 泄漏。
- 完成 Spike AB：父取消和 deadline timeout 递归收口未终态后代，每个 Run 独立写入 terminal Event/Outbox，并验证 stale child completion fencing。
- 完成 Spike AC：新增 `WorkflowActionReceipt` 持久模型，将 effectful Action 的 started/committed/unknown/compensated 证据与 Job attempt、稳定幂等键关联。
- 完成 Spike AD：增加 committed Receipt 的显式 reconciliation，按 Run deadline、active lease 和 attempt fencing 条件恢复 Job/Invocation/StepRun。
- 完成 Spike AE：为 ActionExecutionContext 增加 AbortSignal，同进程 cancel 立即通知，跨进程取消由 Job heartbeat 传播。
- 完成 Spike AF：将 Receipt reconciliation 包装为版本化 maintenance Workflow/Action，验证外部查询→恢复→后续处理的组合边界。
- 完成 Spike AG：为 WorkflowRun 增加持久 lane/priority，验证 Worker lane admission、priority 排序和 child 继承。
- 完成 Spike AH：新增 WorkflowLaneSupervisor，验证 lane slot 并发、业务失败隔离和 graceful stop 接缝。
- 完成 Spike AI：新增通用 WorkerPollerSupervisor，固定宿主 poller 的 slot、错误隔离和 graceful drain 合同。
- 完成 Round 68：新增 Workflow/Action metadata catalog 与 Workflow activation
  binding 的 InMemory/Prisma 最小 Port；固定 `(id, version)` 不可变、注册幂等、
  manifest hash、required Action refs 和 binding revision/CAS 边界。
- 完成 Round 69：为 Workflow Run 持久化 Definition/Action snapshot，并将本地
  executable admission 与 snapshot 做精确匹配；旧的 null snapshot Run 保持可恢复。
- 完成 Round 70：将可选持久 Definition/Action Registry 接入 Runtime；
  active binding 控制新提交，既有 Run 依据 snapshot 继续，Worker claim 校验
  catalog hash 与本地 executable metadata。
- 完成 Round 71：新增只读 `inspectWorkflowAdmissions()` diagnostics，显式报告
  executable/catalog/binding 的可执行性差异，不改变 Run durable 状态。
- 完成 Round 72：Worker bootstrap 在实际创建 Workflow Runtime 后输出结构化
  admission diagnostics；诊断失败隔离，不阻断 Worker 启动。
- 完成 Round 73：以 `COSMOS_WORKER_WORKFLOW_REGISTRY=prisma` 显式启用
  catalog-backed Worker；内置 receipt Workflow/Action 注册 manifest/binding，
  且尊重 disabled binding。

## 55. Spike AJ：统一取消、重试和未知结果合同

### 55.1 共享合同

`packages/contracts` 现在提供统一的执行失败分类：

```text
aborted
retryable
terminal
unknown
```

同时提供 `ExecutionAbortedError`、`isExecutionAbortedError()` 和
`throwIfExecutionAborted()`。Connector、Consumer 和 Action 可以识别同一种
cooperative cancellation，而不依赖某个宿主层的具体错误实例。

### 55.2 Ingest

- Worker 在停止 signal 已中止时不再创建 schedule Run 或 claim 新 Job；
- Connector/Run abort 不完成 Run；
- abort 不推进 checkpoint，也不把 Job 收口为 retry/terminal；
- Job lease expiry/reclaim 仍是恢复事实。

### 55.3 Outbox Consumer

`WorkflowOutboxConsumer.runOnce(handler, signal?)` 现在支持：

- signal 在 claim 前中止：返回 `aborted`，不 claim；
- handler 执行中或 ack 前中止：返回 `aborted`，不 ack/fail；
- handler 抛出 `WorkflowOutboxUnknownError`：返回 `unknown`，不安全重试；
- 只有明确 retryable/terminal 的错误才调用 `failOutbox()`。

### 55.4 验证与限制

- contracts/application/workflow-runtime focused：67 个测试通过；
- 三个 package typecheck 通过；
- Prisma 中断→租约到期→接管组合尚未验证；
- unknown delivery 当前依赖 lease expiry 和 handler 幂等，独立
  Outbox receipt reconciliation 后置。

## 56. Spike AK：Prisma Ingest abort 后的租约接管

新增真实 Prisma/SQLite 行为测试，验证：

```text
Connector abort
→ Run 保持 running
→ Job 不 complete/fail
→ lease 到期
→ 新 Worker reclaim
→ Entry / Run / checkpoint 成功收口
```

第一 Worker 在 Connector fetch 中止后不写入 Entry、不推进 checkpoint，也不把
Job 标记为 retry/terminal。短 lease 到期后，第二 Worker 使用新的 owner 和
lease token 接管同一 Job，并完成后续 Ingest。

验证：

- `bun run test -- packages/storage-prisma/src/index.test.ts --run`
  - 1 个测试文件、10 个测试通过；
- 既有 Prisma stale completion、retry 和 persistent worker 测试保持通过。

尚未覆盖：

- 部分 Observation 已写入后 abort 的去重/修订组合；
- Prisma Parent-wake 的 abort/unknown takeover；
- drain deadline 超时后的进程级重启接管。

## 57. Spike AL：部分 Observation 写入后的同 Run 重放去重

新增 Prisma/SQLite 行为测试，模拟一页包含两个条目的 Ingest：

```text
persist item-1
→ abort
→ lease expiry
→ replay same Run/page
→ item-1 no-op
→ item-2 creates Entry
→ checkpoint commit
```

最终验证：

- 2 个 Entry；
- 2 个 Observation；
- 同一 Run 的重放项没有新增 Observation 或 Entry；
- 新条目正常创建；
- checkpoint 成功推进到 `partial-cursor`；
- Run 成功收口。

这固定了两个不同的身份边界：

- `(sourceInstanceId, runId, externalKey)` 防止同一 Run 重放重复写 Observation；
- `(sourceInstanceId, canonicalExternalId)` 防止跨 Run 重复创建 Entry。

## 58. Spike AM：Prisma Outbox abort/unknown 接管

新增真实 Prisma/SQLite Outbox Consumer 行为测试：

```text
claim
→ abort/unknown
→ 不 ack、不 fail
→ lease 到期
→ 新 Worker reclaim
→ handler 重放
→ cursor 推进
```

验证结果：

- abort delivery 在 lease 未到期时不能被第二个 Worker 抢占；
- lease 到期后新 Worker 可以接管并 ack；
- unknown delivery 不进入 `retry_wait`；
- sequence cursor 只在明确 ack 后推进；
- Prisma Workflow Store focused 测试为 25 个，通过。

尚未覆盖事务中途 abort 的故障注入、Outbox receipt reconciliation 和多
Consumer Group 的独立 takeover。

## 59. Spike AN：Ingest Observation/Checkpoint lease fencing

此前只有 `startRun()` 和 `completeRun()` 验证 Job lease，item 写入和 checkpoint
没有统一携带 lease。现在：

- `persistIngestItem()` 接收当前 `JobLease`；
- `setCheckpoint()` 接收 `runId` 和当前 `JobLease`；
- Prisma 在 Blob preflight、Observation/Entry transaction 和 checkpoint
  transaction 中验证 lease；
- stale Worker 使用旧 token 不能创建 Entry、Observation 或 checkpoint；
- current Worker 使用新 token 可以继续收口。

验证：

- application/storage typecheck 通过；
- Prisma Ingest focused：12 个测试通过。

仍需处理 Blob preflight 与事务复核之间的极窄 race，以及 lease heartbeat 丢失后
Connector 的主动中断。

## 60. Spike AO：Job lease heartbeat 驱动 Ingest abort

`IngestionWorker` 现在为已领取 Job 建立 execution-local
`AbortController`：

```text
renewJobLease=false/throws
→ ExecutionAbortedError
→ Connector/Probe/Ingest signal.aborted
→ 不 complete/fail Job
→ lease fencing 兜底
```

宿主 stop signal 和 Job lease-loss signal 使用同一个 execution signal。新增
`leaseHeartbeatMs` 只作为测试接缝，默认生产 heartbeat 行为不变。

验证：

- application typecheck 通过；
- Application focused：17 个测试通过。

仍需验证真实 Prisma Worker 的 heartbeat 失效、Connector 中断，以及
Action/Research/Knowledge Workflow 对同一模式的复用。

## 61. Round 68：Definition/Action metadata catalog

### 61.1 目标

把 Round 67 识别出的“持久 catalog”和“进程内 executable registry”分开，
验证跨进程共享元数据所需的最小公共 Port，同时不把 TypeScript 函数或任意
运行时代码序列化进 SQLite。

### 61.2 实现

新增 `WorkflowDefinitionRegistry` 及其两个实现：

- `InMemoryWorkflowDefinitionRegistry`：用于行为测试和后续纯运行时组合；
- `PrismaWorkflowDefinitionRegistry`：持久化到 SQLite。

持久 catalog 分成三类数据：

```text
WorkflowDefinitionCatalog(id, version, kind, provider, manifestHash,
                          capabilities, requiredActionRefs, metadata)
ActionDefinitionCatalog(id, version, provider, manifestHash, capabilities,
                        effectMode, retryable, maxAttempts, metadata)
WorkflowDefinitionBinding(workflowId, definitionVersion, enabled, revision)
```

固定的行为合同：

- Definition/Action 的 `(id, version)` 是不可变内容；
- 相同内容重复注册是幂等；数组去重排序、metadata 按 key 规范化后比较；
- 同一版本内容不同会返回 conflict，不会原地覆盖；
- Binding 必须引用已存在的 Workflow catalog；
- `upsertWorkflowBinding` 只允许首次创建或完全相同的重复提交；
- 版本切换和启停必须通过 `expectedRevision` CAS，成功后 revision 加一；
- disabled binding 不解析为 active Workflow；
- catalog 只保存 manifest/能力/输入关系等元数据，可执行的
  `WorkflowDefinition`/`ActionDefinition` 函数仍由每个 Worker 进程本地注册。

新增 Prisma migration：

`20260809120000_workflow_definition_catalog`

### 61.3 验证

- `bun run db:validate`：通过；
- `bun run db:generate`：通过；
- `bun run test -- --run packages/workflow-runtime/src/definition-registry.test.ts
  packages/workflow-runtime/src/index.test.ts`：2 个文件、53 个测试通过；
- `bun run test -- --run packages/storage-prisma/src/definition-registry.test.ts`：
  1 个 Prisma/SQLite 测试通过；
- `bun run typecheck:workflow-runtime`：通过；
- `bun run typecheck:storage`：通过。
- 隔离 Data Root 的 `bun run db:migrate`：16 条 migration 全部通过；
- `bun run typecheck`：通过；
- `bun run test -- --run`：19 个测试文件、167 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`、仓库 Markdown 结构检查：通过。

### 61.4 边界与后续

本轮仍未把 catalog 接入 `WorkflowRuntime.enqueue()` 或 `runNext()`。当前执行
admission 仍是本地已注册 Definition 的 `workflowRefs` 过滤；catalog 还没有：

- Definition manifest hash 与 Run 的 snapshot；
- required Action 的提交/claim 前静态解析；
- Worker executable registry 与持久 catalog 的差异诊断；
- unknown/blocked `definition_unavailable` 状态；
- activation audit、Application Command 和 API。

因此本轮证明的是“持久 metadata catalog 可以与 executable registry 分层”，
不是“插件 Workflow 已经可以跨 Worker 生产执行”。

## 62. Round 69：Workflow Run definition/action snapshot

### 62.1 目标

让一次 Run 记录“创建时实际选择了哪一版 Workflow 和 Action 元数据”，并让
Worker 在 claim 前检查本地 executable registry 是否与该 snapshot 一致。

### 62.2 实现

新增 `WorkflowRunDefinitionSnapshot`：

```text
workflowRef
manifestHash
actionDependencies: [{ actionRef, manifestHash }]
```

`WorkflowDefinitionMetadata` 新增可选的 `manifestHash` 和
`requiredActionRefs`；`ActionDefinitionMetadata` 新增可选的 `manifestHash`。

行为：

- `WorkflowRuntime.enqueue()` 解析 Workflow 的 required Action refs，校验
  Action 已注册，并把 Workflow/Action manifest hash 写入 Run snapshot；
- child Workflow 创建也保存自己的 snapshot；
- `runNext()` 将当前进程可执行的 snapshot 作为 claim admission；
- InMemory/Prisma Store 只领取 snapshot 完全匹配的 queued/expired Run；
- 旧数据库中 `definitionSnapshotJson = null` 的 Run 按 workflow ref 继续可领取，
  保持迁移前 Run 的恢复兼容；
- direct `resume()` 在 claim 前检查 snapshot，不会静默执行 hash 不一致的代码；
- Prisma 通过 `20260809130000_workflow_run_definition_snapshot` 保存 snapshot。

本轮没有把所有动态 `callAction()` 自动追加回 snapshot；只有 Workflow
manifest 声明的 `requiredActionRefs` 进入静态 admission。动态 Action 依赖仍需
后续通过显式 manifest 或运行中追加且受 lease fencing 的 snapshot 命令解决。

### 62.3 验证

- `bun run db:validate`、`bun run db:generate`：通过；
- Workflow snapshot focused：3 个 InMemory 测试通过；
- Prisma snapshot focused：1 个 SQLite 测试通过；
- Workflow Runtime/Prisma storage typecheck：通过；
- 初次 focused 失败原因是测试夹具未注册 required Action，补齐夹具后重新通过；
- Docker、浏览器、真实插件加载和跨进程 Worker restart：未运行。

## 63. Round 70：持久 catalog 接入 Runtime admission

### 63.1 目标

完成 Round 68/69 之间的最后一段接缝：让持久 catalog 不只是旁路 metadata，
而是参与 Workflow 提交和 Worker admission，同时不改变没有注入 Registry 的
内置旧路径。

### 63.2 实现

`WorkflowRuntimeOptions` 新增可选 `definitionRegistry`。

注入 Registry 时：

- `enqueue()` 和 child Workflow 创建必须解析 active Workflow binding；
- active catalog 的 `(id, version)`、Workflow manifest hash 和
  `requiredActionRefs` 必须与本地 executable Definition 一致；
- required Action 必须同时存在于本地 executable registry 和持久 Action catalog，
  manifest hash 必须一致；
- Run snapshot 使用 catalog 的 hash，而不是只相信提交进程的本地对象；
- `runNext()` 读取 exact `(workflowId, version)` catalog 做本地 executable
  admission，不要求历史 Run 仍处于 active binding；
- binding 被禁用后，新提交失败；已经创建且 snapshot 完整的 Run 仍可以继续；
- catalog 或本地 executable 不一致的 Worker 不 claim；
- 未注入 Registry 的内置 Runtime 仍使用 Round 69 的本地 snapshot/admission。

新增错误：

- `WorkflowDefinitionCatalogInactiveError`
- `WorkflowDefinitionCatalogMismatchError`

### 63.3 验证

- InMemory Runtime catalog focused：4 个测试通过；
- Prisma catalog + Workflow Runtime focused：2 个测试通过；
- 已覆盖 active enqueue、disabled binding 拒绝新 Run、existing snapshot Run
  继续执行、Workflow/Action hash mismatch admission；
- `bun run typecheck:workflow-runtime`、`bun run typecheck:storage`：
  通过；
- `git diff --check`：通过。
- 全量并行测试首次暴露默认 5 秒 timeout 下的 Prisma/SQLite cleanup 竞态；
  `vitest.config.ts` 将 test/hook timeout 调整为 15 秒后，`bun run test --
  --run`：21 个测试文件、174 个测试通过；
- `bun run typecheck`：通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。

### 63.4 边界

本轮只接入 Runtime 的 metadata admission，不引入第二套执行器：

- catalog 仍不保存可执行代码；
- activation audit/API、blocked `definition_unavailable` projection 尚未实现；
- 动态 `callAction()` 仍需要显式 `requiredActionRefs` 或后续追加式 dependency
  合同；
- `apps/worker` 当前仍未默认开启通用 catalog-backed Workflow lane；
- Connection、Trigger、Secret、State 和 Adapter manifest 仍未接入。

## 64. Round 71：Workflow admission diagnostics

### 64.1 目标

解释“某个 Worker 为什么没有 claim 某个 Workflow”，为后续 Worker startup
diagnostics 和 `definition_unavailable` durable projection 提供公共输出，但
本轮不把诊断直接写成 Run 状态。

### 64.2 合同

新增 `WorkflowAdmissionDiagnostic`：

```text
workflowRef
status
detail
localManifestHash
catalogManifestHash
catalogVersion
bindingEnabled
bindingRevision
missingActionRefs
checkedAt
```

当前 status：

```text
ready
action_not_registered
catalog_not_found
catalog_mismatch
action_catalog_not_found
invalid_definition
```

`inspectWorkflowAdmissions()` 是只读查询：

- 没有 Registry 时，检查本地 executable Definition/required Action；
- 注入 Registry 时，检查 exact catalog version、Action catalog、hash 和
  binding revision；
- binding disabled 仍可以是 `ready`，因为它只阻止新提交，不阻止已有
  snapshot Run 恢复；
- 不改变 `WorkflowRun`、Job、lease 或 checkpoint。

### 64.3 验证

- InMemory Runtime diagnostics：5 个测试通过；
- Prisma catalog + Runtime diagnostics：2 个测试通过；
- 覆盖本地 Action 缺失、catalog 缺失、active/disabled binding、exact
  catalog/hash 一致性；
- `bun run typecheck:workflow-runtime`、`bun run typecheck:storage`：
  通过；
- `git diff --check`：通过。

### 64.4 边界

本轮仍未：

- 把 diagnostics 接入 `apps/worker` startup log 或 API；
- 将 `catalog_not_found` 转成 `definition_unavailable` durable projection；
- 为 catalog/Binding activation 写 audit event；
- 解决动态 Action 依赖的静态提取。

## 65. Round 72：Worker bootstrap diagnostics 接线

### 65.1 目标

把 Round 71 的 Runtime diagnostics 接到真实 Worker 组合层，确保启动阶段能看到
“本地 Worker 能执行什么、为什么不能执行”，但不把诊断调用变成新的 durable
写入或阻止正常 Worker 启动。

### 65.2 实现

`createWorkflowRunWorkerPollerLane()` 增加 Runtime 创建回调；
`createWorkerPollerLanes()` 将 Runtime 实例转交 bootstrap。

Worker 在 `WorkerPollerSupervisor` 创建各 slot 的 poller 后调用：

```text
每个 Workflow Runtime
  → inspectWorkflowAdmissions()
      → worker.workflow_admission_diagnostic
```

日志字段包含：

- `workerId`、`lane`；
- `workflowRef`、`status`、`detail`；
- local/catalog manifest hash；
- catalog version；
- binding enabled/revision；
- missing Action refs；
- checkedAt。

`ready` 使用 info；其它状态使用 warn。诊断查询异常使用
`worker.workflow_admission_diagnostic_failed` 记录 error，但不会跳过后续
bootstrap 和 Worker poller 启动。

当 Workflow lane concurrency 为 `0` 时没有 Runtime 实例，也不会输出虚假的
全局 `ready`。现有 Ingest、Parent-wake 和 shutdown 流程不变。

### 65.3 验证

- Worker bootstrap focused：11 个测试通过；
- 覆盖 ready diagnostics、诊断查询失败隔离和现有 Workflow lane slot 接线；
- `bun run --cwd apps/worker typecheck`：通过；
- `git diff --check`：通过。

### 65.4 边界

- 当前生产 `apps/worker` 仍未默认注入持久 Definition Registry，因此没有
  catalog-backed diagnostics；接线已经就位，Registry 注入仍需独立配置/Task；
- diagnostics 仍只读，不改变 Run status、Job lease 或 checkpoint；
- 尚未把 diagnostics 接到 Web/API，也没有 `definition_unavailable` durable
  projection。

## 66. Round 73：Worker opt-in catalog-backed Runtime

### 66.1 配置合同

新增 Worker 配置：

```text
COSMOS_WORKER_WORKFLOW_REGISTRY=disabled | prisma
```

默认是 `disabled`，不改变既有 Worker 行为。设为 `prisma` 后：

- Worker 创建 `PrismaWorkflowDefinitionRegistry`；
- 启动时注册内置 receipt reconciliation Action/Workflow catalog；
- 缺少 binding 时创建 enabled revision `0`；
- 已存在 binding（包括 disabled 或指向其它版本）不被强制重启；
- 每个 Workflow Runtime 注入同一个 Registry；
- Round 72 bootstrap diagnostics 变成 catalog-backed diagnostics。

内置定义提供稳定 metadata：

```text
Action:   builtin:cosmos.receipt.reconcile@1
Workflow: builtin:cosmos.maintenance.receipt-reconcile@1
```

### 66.2 Node production smoke

隔离 Data Root、Node production build 和 IPC control 验证：

- `bun run db:migrate`：17 条 migration 成功；
- `node apps/worker/dist/main.js` + `COSMOS_WORKER_WORKFLOW_REGISTRY=prisma`
  启动成功；
- SQLite 中确认 1 条内置 Action catalog、1 条 Workflow catalog、1 条
  enabled Workflow binding revision `0`；
- `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1` 时输出
  `worker.workflow_admission_diagnostic`，状态 `ready`，local/catalog hash
  相同；
- IPC graceful shutdown：exit code `0`；
- `COSMOS_WORKER_WORKFLOW_CONCURRENCY=0` 时不输出虚假 Workflow ready。

### 66.3 边界

- 只有内置 receipt Workflow 在本轮自动注册；插件 manifest/Workflow catalog
  仍没有通用安装和激活入口；
- 当前 opt-in Registry 仍是本地可信 Worker 组合，不是远端服务/多用户权限；
- disabled binding 的已有 snapshot Run 仍可恢复，新提交会被拒绝；
- Docker、浏览器、真实平台来源和 OS-level signal 仍未验收。
