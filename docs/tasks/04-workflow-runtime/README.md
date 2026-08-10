# Cosmos Workflow Runtime

> 状态：Planned / continuous Task
>
> 本 Task 统一记录 Cosmos 后续 Workflow 基础建设，不把运行时拆成多个互相漂移的碎片 Task。
>
> 总体架构：[`../../architecture/0001-cosmos-foundation.md`](../../architecture/0001-cosmos-foundation.md)
>
> Durable Workflow ADR：[`../../adr/0001-durable-workflow-runtime.md`](../../adr/0001-durable-workflow-runtime.md)
>
> 产品需求：[`../../requirements/0002-product-requirements.md`](../../requirements/0002-product-requirements.md)
>
> 当前实现状态：[`../../../PROJECT-STATUS.md`](../../../PROJECT-STATUS.md)

## 1. 背景

Cosmos 当前已经完成 Phase 1 最小服务器闭环和 Phase 1B 的部分受管采集切片，但运行控制仍主要是固定的 Source Ingest/Probe Job。产品后续需要让 Ingest、Knowledge、Research、Maintenance、Delivery 和 Interaction 共用一个可恢复的执行基础。

本 Task 采用 `Job + Workflow`：

- Workflow 负责流程、分支、等待、子任务和收口。
- Run 表示一次 Workflow 执行。
- Step 表示逻辑阶段。
- Job 表示 Worker 可领取、租约、重试和恢复的持久任务。
- DomainEvent 表示已经发生的事实。

脚本式 Workflow 是最低层执行语义。Graph、IR、Comfy 等上层表达只转换为脚本语义，不建立第二套 Runtime。`nb-workflow` 提供脚本式 Conductor 的语义参考；`neuro-agent-harness` 只负责 Agent/Session/Model Runtime，不能与 Cosmos 同时持有 Job 的 durable truth。

## 2. 目标

建立一个不依赖 RSS、Bilibili、LLM 或具体 UI 的通用 Workflow 公共合同，使以下链路都能使用相同的 Run/Step/Job、租约、预算、事件和恢复机制：

```text
Trigger
  -> WorkflowDefinition@version
      -> WorkflowRun(inputSnapshot)
          -> StepRun
              -> Job
                  -> ActionDefinition@version
                      -> Application Command / Query
```

## 3. 范围

### 3.1 公共合同与运行时

- Workflow、Action、Trigger 的版本化 schema。
- `WorkflowContext`：
  - `callAction`
  - `query`
  - `startChildWorkflow`
  - `waitForSignal`
  - `checkpoint`
  - `emit`
  - `isCancelled`
  - `getBudget`
- Run/Step/Job 状态、输入/输出引用、父子关系、等待原因和终态错误。
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
- 不把当前固定 Ingest/Probe Job 伪装为通用 Runtime。

## 5. 实施顺序

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

### 已存在

- Phase 1 固定 Ingest/Probe Job。
- Prisma/SQLite、FTS、Blob、Observation/Entry/Revision/Asset 和最小 Story projection。
- API/Worker 的基础 Job lease、heartbeat、retry、checkpoint 和 SSE。

### 仍缺

- 通用 Workflow Runtime 和上述完整 Context。
- 完整 lease fencing，尤其是中途事实写入、FTS 和 checkpoint。
- Connection/Secret/State、多采集计划和 Adapter manifest。
- Knowledge/Research、Outbox/Consumer、Harness/`nb-memory` Adapter。
- 无 URL 稳定身份中的 `sourceLocator`、真实 discovery provenance 和 Run 输入快照。

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

## 9. 变更记录

### 2026-08-10

- Action 合同切片完成（由独立 PR 交付）：`ActionDefinition`/`ActionDescriptor` schema 与 Action 错误码进 `packages/contracts`；`ActionRegistry`、`ActionHandler`、`ActionExecutionError` 与 `IngestConnectorActionAdapter` 进 `packages/application`；新增 contracts/application focused 测试 29 个，全量测试 92 个通过。
- 设计规格：[`docs/superpowers/specs/2026-08-10-action-contract-design.md`](../../superpowers/specs/2026-08-10-action-contract-design.md)。
- 交付边界：合同 + 注册 + connector 适配器试点；Job/Workflow 执行路径、API endpoint、manifest 解析留给本 Task 后续 Step。

### 2026-08-08

- 建立 Workflow Runtime 持续 Task。
- 固定 `Job + Workflow`、脚本优先语义和 Cosmos/Harness durable truth 边界。
- 固定 Connection/Adapter/Knowledge/Research 的后续实现顺序。
