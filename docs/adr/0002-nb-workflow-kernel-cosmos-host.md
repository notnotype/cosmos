# ADR-0002：`nb-workflow` Kernel 与 Cosmos Durable Host

> 状态：Accepted design contract
>
> 日期：2026-08-11
>
> 关联架构：[`../architecture/0001-cosmos-foundation.md`](../architecture/0001-cosmos-foundation.md)
>
> 后续实施：[`../tasks/06-nb-workflow-kernel-convergence/README.md`](../tasks/06-nb-workflow-kernel-convergence/README.md)
>
> 部分取代：[`ADR-0001`](0001-durable-workflow-runtime.md)

## Context

Cosmos 的固定 Ingest Spike 已经验证 Prisma Run/Job/Lease、双 lease fencing、
Outbox、等待/子 Workflow、Worker 接管和生产链路，但同时在
`packages/workflow-runtime` 中实现了一套独立脚本 replay 内核。现有
`nb-workflow` 则已经探索 `path + seq + kind + fingerprint`、稳定并发分支、
等待/resume 和 Agent Session 等脚本语义。

两套内核继续平行演进会让 fingerprint、Query journal、并发、等待和恢复规则
分叉。另一方面，直接让通用框架拥有 Cosmos 的领域数据库、Job lease 或
Application transaction，会把 `nb-workflow` 绑定到 Cosmos，也会产生两个
durable truth。

用户确认 `nb-workflow` 应像 LangChain 一样提供可组合能力，持久化可选；同时
确认队列应拆为持久任务真相和可选唤醒层，Agent 能力等待
`neuro-agent-harness` 合同稳定后通过扩展接入。

## Decision

### 1. `nb-workflow` 拥有规范脚本语义

`nb-workflow` 是 Cosmos Worker 使用的规范 Workflow Kernel，拥有：

- Workflow 脚本控制流；
- Activity 的 `path + seq + kind + fingerprint` 身份；
- journal replay、局部失效和受控非确定性；
- `map/all` 的稳定分支与有界并发；
- wait/signal/timer、Child Workflow 和取消传播；
- Backend、ActivityExecutor、ValueStore、DefinitionRegistry、EventSink 和扩展
  所需的通用 Port。

Graph/IR/Comfy 表达转换到这套脚本语义，不建立第二套执行器。Cosmos 不再长期
维护另一套 Activity identity、fingerprint 或 replay 内核。

`nb-workflow` 的具体包名与物理拆分仍是实现草案。Core、Runtime、Memory Backend、
Agent Extension 和 Testing/Conformance 是职责边界，不是本 ADR 冻结的 npm 包
清单；实际调整必须在独立 Task、分支和 worktree 中完成。

### 2. 持久化可选，能力必须显式

`nb-workflow` 不依赖 Cosmos、Prisma、SQLite、PostgreSQL、NestJS、NeuroBook 或
Harness。Backend 可以是 Memory、SQLite、PostgreSQL 或其它实现，但必须声明：

- 是否支持进程重启；
- 是否支持多 Worker 与 lease；
- 是否支持 durable signal/timer；
- 是否支持 external receipt、Outbox 和大值引用。

WorkflowDefinition 可以声明最低 durability 要求。Runtime 在启动 Run 前拒绝能力
不足的 Backend；Memory Backend 不能伪装成支持跨进程恢复。

### 3. Cosmos 拥有 Durable Backend/Host 与领域真相

Cosmos Workflow Backend/Host 持有：

- WorkflowRun、Activity journal 和定义/输入快照；
- TaskStore、Job、Attempt、lease、heartbeat、retry、lane、priority 和 budget；
- Signal、Timer、Child Run、checkpoint、receipt 和 waiting 状态；
- DomainEvent、Outbox、消费游标和 Worker registry；
- Application Command、领域事务和 Observation/Entry/Story 等业务事实。

Cosmos Worker 组装 `nb-workflow` Kernel、Cosmos Backend、Action/Connector
executable 和 Application Port。所有外部访问经过 Action/Connector；所有领域
写入经过 Application Command。Kernel 不直接访问 Prisma、Data Root 或领域表。

当前 Cosmos Spike 的 Prisma Store、Job/Lease、Outbox、Worker Supervisor、双
lease fencing、Source execution snapshot、checkpoint CAS、固定 Ingest 和行为
测试全部保留并适配，不因 Kernel convergence 被推倒重写。

### 4. Activity、Action、Job、Attempt 与 Step 分开

- `Activity` 是 Workflow journal 中一次外部读取、写入、等待或非确定性操作。
- `ActionDefinition` 是 Activity 调用的版本化能力合同。
- `Job` 是 Host 为执行 Activity 创建的可领取任务。
- `Attempt` 是 Worker 对 Job 的一次实际执行，持有 lease。
- `Step` 是可选的命名逻辑分组和 UI/trace 投影，不是 replay 必需原语。

现有 `WorkflowStepRun` 可以作为迁移和 UI 证据保留，但不能要求每个 Activity
重复保存一份 Step 输入/输出。

### 5. TaskStore 是权威，WakeupBus 只通知

队列固定拆为：

```text
TaskStore
= Job、状态、retry、Attempt、lease 和 fencing 的唯一真相

WakeupBus
= 通知 Worker 可能有工作；不拥有 claim、lease 或终态
```

Local Durable 默认使用 SQLite TaskStore + 自适应 polling，不要求 Redis。
WakeupBus 可以由进程内 signal、PostgreSQL `LISTEN/NOTIFY`、Redis Streams 或其它
消息系统实现。Worker 收到通知后仍回 TaskStore 正式 claim；通知丢失由 fallback
polling 恢复，重复通知由 SQL lease/幂等拒绝。

Redis 可以用于 wakeup、Streams、rate limit、cache 和非权威 presence，但不持有
Workflow/Job terminal、checkpoint 或唯一 lease。当前不使用 BullMQ 等 Redis
队列替代 Cosmos Job，因为 Redis lease 无法与 SQL 领域写入进行原子 fencing。

### 6. 部署与宿主边界

- Web 通过 HTTP/SSE 访问 API，可以独立部署。
- 当前 API/Worker 是独立进程，但共享 SQLite/Data Root/Blob Root，只支持同机或
  共享卷。
- 目标 API 是 manifest-only 控制面，不加载 executable；Worker 是执行面，独占
  Workflow/Action/Connector executable。
- 数据库 migration 由独立一次性 Migrator 完成。
- 可信核心 Worker 可以直连同一 SQL Backend，以便领域写入原子验证 lease。
- 远程或第三方 Worker 通过 Worker Gateway 主动连接，不直接访问数据库、
  Secret 永久值或 Data Root。
- 分布式目标组合是 PostgreSQL TaskStore/领域库、S3/MinIO ValueStore 和可选
  Redis WakeupBus，不使用共享 SQLite 网络盘。

Worker 可以暴露健康、能力、指标和 drain 控制端点，但 Job 不通过同步 HTTP 调用
执行，避免形成第二套调度和 unknown-result 路径。

### 7. 并发分层控制

并发分为：

1. Worker slot 并发；
2. 多 Worker 进程；
3. Workflow 内 `map/all` 并发；
4. Provider/Connection/Source/域名/模型等资源级并发与 rate limit；
5. CollectionPlan 的 `forbid/queue/replace/allow/merge` 重叠策略。

这些层次都必须有界，并继续服从 TaskStore lease、幂等、预算和领域 fencing。

### 8. Agent 是可选 Extension

`wf.agents.invoke()` 属于可选 Agent Extension，不进入 `nb-workflow` Core。它在
Cosmos 中映射到版本化 `agent.invoke@1` Activity/Action/Job。

`neuro-agent-harness` 负责 Agent Invocation、Session、Profile 和 Model Runtime；
Cosmos 负责 Workflow Run、Activity journal、Job/Lease 和领域状态；`nb-memory`
负责知识管理者共享长期记忆。Harness 文档稳定前不实现具体 Adapter，也不能让
Harness 与 Cosmos 同时持有 Job durable truth。

### 9. Kernel-first 实施门禁

Cosmos 不在 `nb-workflow` 的 Kernel API、Activity identity/fingerprint、replay、
并发、等待/取消和 Backend conformance 稳定前继续扩展自身脚本内核。实施顺序是
先在独立 `nb-workflow` 任务中建立规范语义，再以 Task 04 Spike 的持久恢复证据和
API/DTO Draft v0.2 为输入实现 Cosmos Worker/Durable Host。

Task 04 的 Runtime 只保留为 parity、迁移和回滚证据；`nb-workflow` 的物理包拆分、
发布方式、Cosmos 依赖方式和 Cosmos Attempt 的物理存储形态继续由独立实现任务
验证，本 ADR 不提前冻结。

## Consequences

### Positive

- Cosmos 与 NeuroBook 等宿主可以复用同一套脚本、fingerprint、并发和恢复语义。
- Memory demo、SQLite 单机和 PostgreSQL 分布式是 Backend 组合，不是三套 Runtime。
- Cosmos 已验证的持久化、fencing 和领域事务继续存在，不被通用 Kernel 吞并。
- Redis、Harness、数据库和对象存储可以替换，而 Workflow 脚本语义保持稳定。
- API/Worker/远程 Worker 的可执行代码和数据权限边界更清楚。

### Costs and risks

- 当前 Cosmos Spike 与目标架构存在真实偏差，需要一次受测试保护的 convergence。
- `nb-workflow` 当前设计仍偏内存与 Agent 场景，需要先抽出通用 Port 和 conformance
  suite。
- 两个仓库需要版本协调；在 parity 完成前不能删除 Cosmos 现有 Runtime。
- Activity/Step/Job 数据可能需要兼容读取或迁移，不能机械改表。
- PostgreSQL、Redis、S3 和远程 Worker 只是边界，不会因本 ADR 自动获得实现。

## Alternatives considered

### 继续独立扩展 Cosmos Runtime

拒绝。它会继续复制 `nb-workflow` 的 fingerprint、map/all、等待、Agent 和 replay
语义，且当前 7,400 行 Runtime 已形成明显审查与维护风险。

### 让 `nb-workflow` 直接拥有 Cosmos Prisma Schema 和领域事务

拒绝。通用框架会被 Cosmos 领域绑定，且 Kernel 与 Host 的 durable truth 难以
分开测试和替换。

### 以 Redis/BullMQ 作为唯一 Job 真相

拒绝。Redis lease 不能与 SQL 中的 Observation、Entry、FTS、Outbox 和 checkpoint
原子 fencing；保留 SQL Run 的同时又会形成双重任务真相。

### 本地模式也强制部署 Redis

拒绝。Desktop、个人服务器和单机 Compose 不需要额外基础设施；自适应 SQL
polling 足以提供可靠性，WakeupBus 保持可选。

### 将 Agent API 写入 Core

拒绝。普通 Ingest/Transform Workflow 不应依赖 Harness、模型或 Session 生命周期；
Agent 必须通过可选 Extension 接入。

## Revisit Gate

只有在以下任一条件出现时重新评估本决定：

1. `nb-workflow` 无法在不依赖 Cosmos 领域的前提下表达固定 Ingest 所需的
   fingerprint、等待、取消和恢复语义；
2. Cosmos Prisma Backend 无法保持现有双 lease fencing、checkpoint CAS 和
   Application transaction；
3. Backend conformance suite 证明 Core/Host 分离会产生不可消除的双重状态；
4. Redis-only 方案能在同一原子协议中证明领域写入 fencing，且迁移收益明显高于
   SQL TaskStore；
5. Harness 提供的恢复模型无法与 Cosmos Job ownership 建立单一权威边界。

在 convergence 验证失败前，不删除当前 Cosmos Runtime；失败必须记录具体合同
缺口和可复现证据，而不是退回两套内核长期并行。

## Verification requirements

- `nb-workflow` Core：fingerprint 变化、稳定 map 分支、wait/resume、cancel、
  Child Workflow 和受控非确定性。
- Backend conformance：Memory 与 Cosmos Prisma Backend 运行同一行为套件，并
  明确 durability capabilities。
- Cosmos recovery：进程重启、Run/Job reclaim、旧 Attempt 拒写、双 lease
  fencing、checkpoint CAS 和 receipt unknown/reconcile。
- Ingest parity：固定 `cosmos.ingest@1` 的 Observation、Revision、Asset、Story、
  FTS、Event/Outbox、Feed/Search 和幂等结果不变。
- Host boundary：API 不加载 executable，Worker 独占 executable，Migrator 可独立
  运行，manifest hash/capability 可诊断。
- Queue：无 WakeupBus、重复通知、丢失通知和 Redis 不可用时都由 TaskStore
  fallback 保持正确性。
- Production：Bun 开发、Node 生产、migration、standalone Web、浏览器与当前
  production smoke 分开报告。
- 未实现项：Redis/PostgreSQL/S3、远程 Worker、Harness、Knowledge/Research 和
  Graph UI 不得由 convergence focused tests 代替。
