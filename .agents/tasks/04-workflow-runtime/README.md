# Cosmos Workflow Runtime

> 状态：In progress / fixed Ingest production slice converged
>
> 本 Task 统一记录 Cosmos 后续 Workflow 基础建设，不把运行时拆成多个互相漂移的碎片 Task。
>
> 总体架构：[`../../../docs/architecture/0001-cosmos-foundation.md`](../../../docs/architecture/0001-cosmos-foundation.md)
>
> Durable Workflow ADR：[`../../../docs/adr/0001-durable-workflow-runtime.md`](../../../docs/adr/0001-durable-workflow-runtime.md)
>
> Kernel/Host ADR：[`../../../docs/adr/0002-nb-workflow-kernel-cosmos-host.md`](../../../docs/adr/0002-nb-workflow-kernel-cosmos-host.md)
>
> 后续收敛 Task：[`../06-nb-workflow-kernel-convergence/README.md`](../06-nb-workflow-kernel-convergence/README.md)
>
> 产品需求：[`../../../docs/requirements/0002-product-requirements.md`](../../../docs/requirements/0002-product-requirements.md)
>
> 当前实现状态：[`../../../PROJECT-STATUS.md`](../../../PROJECT-STATUS.md)

## 历史分册索引

Spike 体系与早期规划节已按大小切分归档到 `readme/` 子目录(每册 ≤30 KB,封口后只读);
主文档保留背景/目标/范围/最小合同/当前状态与风险/验证要求与最新 Round 记录。

| 分册 | 覆盖范围 | 大小 |
|---|---|---|
| [sections-04-18.md](readme/sections-04-18.md) | §4.1–18(Convergence handoff、历史实施顺序、Spike A–J) | 22.1 KB |
| [sections-19-26.md](readme/sections-19-26.md) | §19–26(Spike K–R) | 22.9 KB |
| [sections-27-33.md](readme/sections-27-33.md) | §27–33(Spike S–Y) | 22.5 KB |
| [sections-34-41.md](readme/sections-34-41.md) | §34–41(Spike Z–AG) | 21.5 KB |
| [sections-42-52.md](readme/sections-42-52.md) | §42–52(Spike AH–AR) | 22.9 KB |
| [sections-53-63.md](readme/sections-53-63.md) | §53–63(Spike AS、变更记录、Spike AJ–AO(二段)、Round 68–70) | 20.3 KB |

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

架构状态：固定 Ingest 生产链已依赖 `nb-workflow` 并可作为 parity 基线；更广泛的
Host/Backend convergence、通用脚本内核边界和完整验收仍未完成。TaskStore/WakeupBus、
manifest-only API、独立 Migrator 和 Agent Extension 也尚未全部实现。以下“已存在”
描述当前主线可核对的实现，不表示 ADR-0002 的全部目标组装已经完成。

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
- 当前 `master` 的 Worker host 保留固定 Ingest 的 Run/Activity lane；`packages/worker-admin` 只提供进程内的 health、status、capabilities、metrics 和 drain 管理面。
- 当前 `master` 没有持久 `WorkflowWorkerRegistration`、Registry/能力投影 Prisma 模型、TTL 注册生命周期、版本化注册表 evidence 或 `GET /api/v1/workflow-workers`；`Worker Admin.status()` 的 `registrationGeneration` 固定为 `null`。
- Worker Admin 的 capability 输出是本地 executable evidence，不是跨进程发现、Run owner、准入状态或调度依据。`assessWorkflowWorkerCapability()`、`aggregateWorkflowWorkerAvailability()`、`no_capable_worker` 和 cleanup consumer 当前均未实现。
- 上述注册表、能力评估、投影和查询能力曾出现在归档标签 `archive/t04-workflow-runtime-spike-wip-20260818` 的 `b8a1701`，但该提交不在当前 `master` 祖先链；对应 Round 78–97 只保留为历史 WIP 记录，未来恢复时必须在当前基线上重新实现和验收。
- Source 列表与计划列表的读都已做批量投影：计划（含触发器与连接）与两类运行行分别
  按来源 id、计划 id 集合批量读取，查询次数与来源数、计划数无关；运行行按归属者
  只取最新一条，读到的行数上界等于归属者数。单条读与列表读共用同一套归并规则。

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
- 当前主线没有 Worker capability discovery/Registry、版本化持久 evidence、权威 availability projection、scheduler/consumer 消费或 `no_capable_worker`；归档标签 `b8a1701` 的 WIP 代码不属于当前实现，未来若恢复该方向必须在当前基线上重新实现并验收。
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
- 来源列表与计划列表的运行诊断都是批量投影：查询次数只与读的表有关，与来源数、
  计划数无关，且每个归属者各自最新的一条由 SQL 窗口函数选出（行数不随历史长度
  增长）。单条读与列表读共用同一套归并规则。

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
