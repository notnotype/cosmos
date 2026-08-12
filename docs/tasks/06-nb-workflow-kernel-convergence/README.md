# Task 06：`nb-workflow` Kernel 与 Cosmos Host 收敛

> 状态：Design synchronized / implementation paused
>
> 阻塞：Blocked on `nb-workflow` stabilization
>
> 日期：2026-08-11
>
> 总体架构：[`../../architecture/0001-cosmos-foundation.md`](../../architecture/0001-cosmos-foundation.md)
>
> 稳定决定：[`../../adr/0002-nb-workflow-kernel-cosmos-host.md`](../../adr/0002-nb-workflow-kernel-cosmos-host.md)
>
> API 边界：[`../../adr/0003-service-worker-api-boundaries.md`](../../adr/0003-service-worker-api-boundaries.md)
>
> API/DTO 草案：[`../../api/README.md`](../../api/README.md)
>
> 前序 Spike：[`../04-workflow-runtime/README.md`](../04-workflow-runtime/README.md)
>
> Walkthrough：[`walkthrough.md`](walkthrough.md)
>
> 当前状态：[`../../../PROJECT-STATUS.md`](../../../PROJECT-STATUS.md)

## 1. 目标

把当前两套平行脚本内核收敛为：

```text
nb-workflow
  -> 规范 Workflow/Activity 脚本与 replay 语义

Cosmos Workflow Backend/Host
  -> Run/Journal、TaskStore、Job/Attempt/Lease、Outbox、Worker、领域事务
```

第一条验收链路仍是固定 `cosmos.ingest@1`。收敛完成后，用户看到的
Source → Run → Feed/Search/Story 行为、现有领域数据、恢复和生产证据必须保持
不变；Cosmos 不再拥有第二套 Activity identity、fingerprint、map/all、wait 和
Child Workflow replay 实现。

### 1.1 当前实施门禁与输入

本 Task 当前只保存目标合同，不启动运行时代码调整。后续实现必须按顺序使用三份
输入：

1. 独立 `nb-workflow` 任务产出的稳定 Kernel API、Memory Backend 和 conformance
   suite；
2. Task 04 Cosmos Runtime Spike 已验证的恢复、lease、Outbox、Worker 接管、
   固定 Ingest parity 和生产证据；
3. [`docs/api/`](../../api/README.md) Draft v0.2 的 Product Service、Worker Admin
   和 Worker Gateway 边界。

`nb-workflow` 的 Activity identity/fingerprint、replay、`map/all`、wait/resume、
cancel 和 Backend capability conformance 未稳定前，本 Task 不继续扩展 Cosmos
平行 Runtime，也不开始 Cosmos Worker/Host convergence。Task 04 是证据与回滚
基线，不是规范 Kernel。

## 2. 背景与当前偏差

Task 04 的 Spike 已经验证：

- Prisma WorkflowRun/Job/Lease/Outbox；
- Worker slot、heartbeat、retry、接管和 receipt；
- Run/Action Job 双 lease fencing；
- Source execution snapshot 和 checkpoint revision/CAS；
- 固定 Ingest、Node production 和浏览器最小闭环。

这些成果应保留。但当前 Cosmos `packages/workflow-runtime` 也实现了脚本 path、
Action replay、wait/signal、Child Workflow 和 InMemory Store，与 `nb-workflow`
形成平行内核。已发现的语义差异包括：

- `nb-workflow` 使用 `path + seq + kind + fingerprint`；Cosmos 当前已有 Action
  主要按显式 path/key 重放。
- `nb-workflow` 已探索稳定 `map/all` 分支；Cosmos 尚无同等公共组合合同。
- Cosmos `query()` 当前不是完整 journaled Activity，动态 Knowledge/Agent
  Workflow 可能在 replay 时读取新值并复用旧 Action 结果。
- Cosmos 的 Job/Invocation/Step output 会重复物化相同值；未来大 Feed 和 Agent
  产物需要 ValueStore 引用。

因此本 Task 不是普通“拆大文件”，也不是把两个仓库机械合并。它先固定语义与
Backend conformance，再迁移一条生产 Workflow，最后删除确定重复的内核。

## 3. 仓库与变更边界

### 3.1 `nb-workflow`

`nb-workflow` 是通用框架真相源。Core、Runtime、Memory Backend、Agent Extension
和 Testing/Conformance 是当前职责草案，物理包名、目录和发布策略不在本 Task
文档中提前冻结。

实际代码调整必须：

- 新开独立 Task、分支和 worktree；
- 开始前重新审计 dirty worktree；
- 保留用户已有未提交修改；
- 先建立行为测试，再移动或拆分代码；
- 不从 Cosmos 复制 Prisma、领域类型或应用服务进入通用 Core。

2026-08-11 架构同步时，`nb-workflow` 的 `master` 已有用户未提交修改，至少涉及
`src/index.ts`、`src/ports.ts`、`src/runner.ts`、`src/types.ts`、
`test/kernel.test.ts` 和 `test/scenario-rp.test.ts`。本轮没有修改这些文件；正式
实施开始时必须重新核对，不能假设该快照仍然有效。

### 3.2 Cosmos

Cosmos 保留：

- 现有 Prisma schema/migration；
- WorkflowRun、Action Invocation、Job/Lease、Worker registry；
- Worker Supervisor、lane、heartbeat、retry、drain；
- DomainEvent、Outbox、SSE；
- 双 lease fencing、Source snapshot、checkpoint CAS；
- 固定 Ingest Action/Application Command；
- 现有 focused/full/Node/browser 证据。

Cosmos 收敛：

- 自有 Workflow 脚本解释和 replay；
- Activity path/fingerprint 分配；
- wait/query/child/checkpoint 的重复语义；
- InMemory Workflow Kernel；
- API 对 executable Connector/Action 的加载；
- 过大的 Runtime/Store 物理职责。

## 4. 核心合同

### 4.1 执行词汇

```text
WorkflowDefinition
└─ WorkflowRun
   ├─ Journal
   │  └─ Activity
   │     └─ ActionDefinition
   │        └─ Job
   │           └─ Attempt + Lease
   └─ Step Projection (optional)
```

- Activity 是 replay 单元。
- ActionDefinition 是版本化能力合同。
- Job 是 Cosmos Host 的可领取任务。
- Attempt 是 Worker 持有 lease 的一次执行。
- Step 只用于命名逻辑分组、trace 或 UI，不参与底层 identity。

### 4.2 Backend 能力

Backend 至少声明：

```text
processRestart
multiWorker
leases
signals
durableTimers
externalReceipts
outbox
```

Memory Backend 不得通过类型或默认值暗示跨进程恢复。WorkflowDefinition 可以声明
最低能力；不满足时在 Run 创建/启动前失败。

### 4.3 TaskStore 与 WakeupBus

```text
TaskStore
  -> Job/status/retry/Attempt/lease/fencing authoritative truth

WakeupBus
  -> optional notification only
```

本 Task 固定 Port 与无 Bus/进程内 signal 行为，但不实现 Redis/PostgreSQL
Adapter。任何 Wakeup 后，Worker 仍回 TaskStore claim；fallback polling 必须在
通知丢失时保证最终执行。

### 4.4 Cosmos Host

Cosmos Host 把：

- Workflow Run/Journal 映射到 Prisma Store；
- Activity 映射到 ActionDefinition/Job；
- Query 映射到 journaled Cosmos Query Activity；
- Signal/Timer/Child Workflow 映射到持久状态；
- 领域写入映射到 Application Command；
- 大值映射到 Blob/Artifact ValueStore 引用；
- terminal 变化映射到 DomainEvent/Outbox。

Host 必须保留 Run lease 与 Action Job lease 的双重验证。Kernel 不持有 Prisma
Client，也不直接提交 Observation、Entry、FTS 或 checkpoint。

## 5. 实施顺序

### Step 0：重新审计与建立基线

- 核对 Cosmos Spike 和 `nb-workflow` 两个 worktree、分支、dirty 文件和最新测试。
- 固定两边当前 public API、journal shape 和 failure/replay 行为。
- 记录现有 285-test/Node/browser 证据是否仍是最新；过期证据不得复用为新结果。
- 不在 dirty `master` 上直接做架构重写。
- 当前停止在文档收口；在独立 `nb-workflow` 任务完成前不执行后续 Step。

### Step 1：独立 `nb-workflow` 任务——语义核心与 Port

- 固定 WorkflowDefinition、WorkflowRun、Activity identity 和 fingerprint。
- 固定 replay 后缀失效、受控 `now/random`、cancel、wait/signal 和 Child Workflow。
- 定义 Backend、ActivityExecutor、DefinitionRegistry、ValueStore、EventSink、
  Clock 和 ID Port。
- Agent API 从 Core 移到可选扩展合同；不接 Harness 实现。
- 该步骤在 `nb-workflow` 自己的 Task、分支和 worktree 中规划和实施，不在
  Cosmos worktree 直接修改 sibling 仓库。

### Step 2：独立 `nb-workflow` 任务——Memory Backend 与 conformance suite

- 用 Memory Backend 跑完整 Kernel 行为测试。
- 覆盖 fingerprint 变化、稳定 map 分支、并发完成顺序、ask/resume、cancel 和
  crash/replay harness。
- Backend 能力不足时明确拒绝。
- conformance suite 可以被 Cosmos Prisma Backend 复用。
- Step 1–2 的公共 API 和 conformance 通过稳定门禁后，才开始 Cosmos Step 3。

### Step 3：Cosmos Backend Adapter

- 在 Cosmos 侧适配现有 Prisma Store，不把 Prisma 上移到 `nb-workflow`。
- 建立 Activity ↔ Action Invocation/Job 的稳定映射。
- 保持 Run/Job lease、receipt、waiting、Outbox 和 Worker Registry。
- 先以兼容读取/双实现测试比较，不直接删除旧 Runtime。
- 明确 StepRun 作为可选投影的迁移策略。

### Step 4：固定 Ingest parity

让同一个：

```text
cosmos.ingest@1
  -> source.fetch@1
  -> library.ingest@1[]
  -> source.checkpoint@1
```

由 `nb-workflow` Kernel 驱动，同时保持：

- Source execution snapshot；
- Run/Command 幂等与冲突；
- Observation 不可变；
- Entry/Revision/Asset/Story/FTS；
- DomainEvent/Outbox；
- 双 lease fencing；
- checkpoint revision/CAS；
- retry_wait、接管和旧 Worker 拒写。

### Step 5：本地宿主与控制面解耦

- 先按 [`docs/api`](../../api/README.md) 建立公共 Zod schema 和 Transport
  conformance，不从 Prisma model 反向生成公共 DTO。
- Product Service、Worker Admin 和 Worker Gateway 继续保持独立
  package/module、路径、版本和 consumer 合同；本步骤只实现本地 Host/Worker
  所需的 Product 控制面和共享合同。
- API 只加载 manifest/schema/capability，不加载 Connector/Action executable。
- Worker 独占 executable，并注册 manifest evidence。
- migration 从 API 启动命令拆为独立 Migrator。
- Product API liveness/readiness 与 Worker availability 分开；Worker 下线不阻止
  已保存内容 Query。
- 不以同步 API 调用 Worker 执行 Job。
- ActionDefinition 声明 `host`、`trusted_worker` 或 `remote_worker` placement；
  领域写入 Action 只在 Host 执行。
- Worker Admin Draft v0.2 作为本地 Worker 稳定后的实现参考，不先于 Kernel 和
  本地 Worker conformance。
- Worker Gateway Draft v0.2 只保留远程边界设计；fake Gateway、真实 bootstrap
  identity、Secret Broker、远程 Secret resolution 和公网 Gateway 全部后置。

### Step 6：删除重复内核

只有 parity、恢复和生产验收通过后才删除：

- Cosmos 自有脚本 replay/context；
- 重复的 InMemory Kernel；
- 非 journaled Query 路径；
- 已由规范 Kernel 覆盖的 wait/child/checkpoint 代码。

Prisma Host、领域 Command、Job/Lease/Outbox、Worker Supervisor 和 fencing 不得
因为“删除 Runtime”被误删。

### Step 7：后续 Adapter Gate

完成本 Task 后再分别开 Task 处理：

- Worker Admin health/readiness/status/capability/metrics/drain；
- Worker Gateway fake conformance 与远程执行；
- Redis Streams WakeupBus；
- PostgreSQL/S3 分布式 Backend；
- `neuro-agent-harness` Agent Adapter；
- Connection/Secret/CollectionPlan；
- Knowledge/Research Workflow；
- Graph/IR UI。

## 6. 非目标

- 不在本 Task 实现 Redis、PostgreSQL、S3/MinIO 或远程 Worker。
- 不在下一轮本地 Host/Worker convergence 实现 Worker Admin 或 fake Gateway；
  它们只保留已审查的 API/DTO 输入。
- 不接入 `neuro-agent-harness`、`nb-memory` 或真实 LLM。
- 不实现 Knowledge/Research、推荐、Graph UI 或通用 Agent UI。
- 不接入更多平台。
- 不重做信息库领域模型。
- 不把 `nb-workflow`、Harness 或 NeuroBook 代码直接 vendor 到 Cosmos。
- 不因 package 美观而先拆文件、后补语义测试。
- 不承诺旧 Spike 临时数据库在未发布 migration 历史上的升级。

## 7. 验收矩阵

### `nb-workflow` focused

- `path + seq + kind + fingerprint` 稳定。
- 输入 fingerprint 改变时后缀按合同失效。
- `map/all` 并发完成顺序不改变 branch identity。
- wait/signal、cancel、timer 和 Child Workflow 可 replay。
- Memory Backend capability 声明准确。

### Cosmos Backend/recovery

- Prisma Backend 通过同一 conformance suite。
- Worker 中断后 Run/Job 可 reclaim。
- 旧 Attempt 不能写 Observation、FTS、Event、Outbox 或 checkpoint。
- 双 lease fencing 与 checkpoint CAS 保持。
- Wakeup 缺失/重复不影响 TaskStore 正确性。
- 大值使用引用时，恢复和审计仍可读取。

### 固定 Ingest parity

- fixture 重复运行不新增 Entry。
- 来源修订产生 EntryRevision，旧 Observation 保留。
- URL-free 内容可录入、搜索和打开。
- manual/schedule provenance、Source snapshot 和 checkpoint 不回退。
- Feed/Search/Story/Entry/Source/Revision 用户链路不变。

### Host/production

- API 构建不加载 executable Connector/Action。
- Worker 单独加载并报告 manifest evidence。
- Product API、Worker Admin 和 Worker Gateway schema/Transport contract 分开。
- API ready 且 Worker unavailable 时，Feed/Search/Story 仍可读取已保存内容。
- 本轮 Host/Worker 验收不以 Worker Admin/Gateway fake 代替；两者保持待实现，
  也不宣称远程、多主机或公网安全。
- Migrator 可独立成功/失败并阻止不兼容宿主启动。
- Bun 开发、Node 生产、migration、standalone、浏览器分别通过。
- Docker、真实 RSS、跨平台和长时间恢复继续单独报告。

## 8. 停止与回滚条件

在以下情况停止删除旧 Runtime，并记录最小复现：

- Kernel 无法表达现有双 lease/receipt/wait 语义；
- Prisma Adapter 需要把 Cosmos 领域依赖引入 `nb-workflow` Core；
- parity 要求同时维护两套 authoritative journal；
- migration 需要破坏已有领域事实或无法兼容 `origin/master`；
- focused 通过但 restart/Node/browser 用户链路出现行为变化。

回滚优先保留现有 Cosmos Spike 和生产证据，不以未完成的新 Kernel 替换工作链。
回滚不是允许两套内核永久并行；必须形成新的 ADR 或明确的阻塞报告。

## 9. 当前状态

本轮只完成架构、API/DTO、ADR、Task 和项目入口文档收口：

- 尚未创建 `nb-workflow` 实施分支/worktree；
- 尚未修改两个仓库的运行时代码；
- Task 06 当前暂停并阻塞于 `nb-workflow` 稳定门禁；
- 尚未实现 Backend Port、TaskStore/WakeupBus、Migrator 或 manifest-only API；
- 已形成并经五路只读审查修订的 Product Service、Worker Admin、Worker Gateway
  和 DTO/场景 Draft v0.2，尚未进入 `@cosmos/contracts` 或宿主实现；
- 本轮没有运行代码测试、Node、浏览器、Docker、真实来源或 Harness 验收；
- Task 04 的固定 Ingest Spike 继续作为 parity 与回滚基线，不再作为未来平行
  Runtime 的扩展入口。
