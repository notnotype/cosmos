# Prisma 领域仓储（`PrismaCosmosRepository`）

## 状态

当前实现规格；后续代码变化应同步更新本文。本文记录当前实现中 `@cosmos/storage-prisma` 的领域仓储行为，不把需求、Draft 或历史 Spike 当作实现。

## 最后更新

2026-11-02（来源读投影合并 legacy Run 与 WorkflowRun；来源列表为批量读，勘误登记入口建立）。

## 组件定位

`PrismaCosmosRepository` 实现 application 的 `CosmosRepository` 端口，负责 SQLite/Prisma 中的 Source、legacy ingestion Run/Step/Job、Checkpoint、规范化内容、Blob 元数据、DomainEvent、Feed/Search/Story/Entry/Revision 查询、Worker heartbeat 与存储健康投影。API、`IngestionService`、`IngestionWorker` 只通过 application 端口访问它；Connector 不直接访问 Prisma。

它不拥有 Durable Host 的 Kernel state CAS、Workflow Run lease、Activity Job/Completion 生命周期或 EventSink 的 Run lease 合同；这些行为分别见 [`0002-workflow-backend.md`](0002-workflow-backend.md)、[`0003-workflow-host-store.md`](0003-workflow-host-store.md) 和 [`0004-workflow-event-sink.md`](0004-workflow-event-sink.md)。共享 DTO 只引用 [`../contracts/0001-public-contracts.md`](../contracts/0001-public-contracts.md)，规范化内容只引用 [`../domain/0001-normalized-content.md`](../domain/0001-normalized-content.md)。

### 在系统中的位置与作用
它是 SQLite/Prisma 领域持久化层，实现 application 的 `CosmosRepository` 端口，承接 Source、legacy ingest、内容查询和领域写入。

### 解决的问题
它把规范化内容、Checkpoint、Blob metadata、DomainEvent、Feed/Search/Story 等读写放进事务和统一查询入口，避免 API、Worker 或 Connector 各自操作数据库。

### 使用方式
API、`IngestionService` 和 legacy `IngestionWorker` 只调用 application port，由本 Repository 执行 SQL/Prisma；Connector 先经 application/domain，Durable Host 的 Backend/lease 行为则调用相邻 storage 组件。

### 典型情景
保存一次 legacy ingest 结果、读取 Feed/Search/Story，或提供 Worker heartbeat/存储健康投影时，选择本 Repository。

## 分册索引

本文件是当前实现规格的参考型清单,按章节拆分为分册(每册 ≤30 KB 且 ≤9k token,封口后只读);主文档只保留状态、组件定位、非目标/边界与下方索引,行为细节按章节查阅分册。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-01](0001-prisma-repository/part-01-domain-model.md) | 概念与定义、存储根与连接、Source/legacy Run/Step/Job、Observation/Entry/Revision/Asset/Story | 9.1 KB |
| [part-02](0001-prisma-repository/part-02-checkpoint-and-queries.md) | Checkpoint、领域查询、事件 replay | 23.2 KB |
| [part-03](0001-prisma-repository/part-03-persistence.md) | 输入、输出、状态与持久化 | 12.2 KB |
| [part-04](0001-prisma-repository/part-04-lifecycle.md) | 状态转换、副作用、错误与降级、依赖、配置 | 4.6 KB |
| [part-05](0001-prisma-repository/part-05-acceptance.md) | 重建验收、实现与测试锚点 | 7.4 KB |
| [ERRATA](0001-prisma-repository/ERRATA.md) | 已封口分册的勘误登记（追加型台账） | 1.4 KB |

→ 概念与定义、存储根与连接、Source/legacy Run/Step/Job、Observation/Entry/Revision/Asset/Story 已归档:[part-01-domain-model.md](0001-prisma-repository/part-01-domain-model.md)
→ Checkpoint、领域查询、事件 replay 已归档:[part-02-checkpoint-and-queries.md](0001-prisma-repository/part-02-checkpoint-and-queries.md)
→ 输入、输出、状态与持久化 已归档:[part-03-persistence.md](0001-prisma-repository/part-03-persistence.md)
→ 状态转换、副作用、错误与降级、依赖、配置 已归档:[part-04-lifecycle.md](0001-prisma-repository/part-04-lifecycle.md)
→ 重建验收、实现与测试锚点 已归档:[part-05-acceptance.md](0001-prisma-repository/part-05-acceptance.md)

## 分册勘误登记

分册封口后只读；对已封口分册的更正登记在独立台账 [`ERRATA.md`](0001-prisma-repository/ERRATA.md)，不改写分册正文。新增勘误追加到该台账末尾。

## Task 42 当前存储补充

- `SystemConfig.storyAgentTimeoutSeconds` 为整数秒，默认 300；配置部分更新在事务中仅修改提供的字段，保存超时不覆盖默认模型。独立 additive migration 为既有 singleton 保留默认模型及时间戳并补默认秒数。应用边界限定 30–1800，新任务把秒数换算为 Invocation 毫秒快照；既有 Run/幂等重放不重读当前值。
- Story Generation 从本 Workflow 的持久终态 Activity `Job.errorCode` 读取白名单码，未知值回退 `generation_failed`，不猜测原始消息。公开 Job/Attempt 投影按关联 Workflow definition 限定 Story 范围，输出固定安全消息、取消空错误，Story Job result 不公开。Attempt 仅当前尝试使用 Job 当前错误码；无独立持久码的历史尝试使用 `generation_failed`，不从原始 event message 推断。无法识别所属 Workflow 的孤立 Activity 不公开错误/结果；无 Job 的 Attempt 为空。内部持久诊断不改写，其它可识别 Workflow 的读合同保留。
- 实现与回归：[配置仓储](../../../packages/storage-prisma/src/system-config.ts)、[持久错误读码](../../../packages/storage-prisma/src/story-agent-failure-code.ts)、[安全读投影](../../../packages/storage-prisma/src/repository/story-agent-public-projection.ts)、[Job/Attempt 测试](../../../packages/storage-prisma/src/run-jobs.test.ts)；稳定决定见 [ADR-0033](../../adr/0033-story-agent-timeout-and-error-codes.md)。

## 非目标/边界

不提供 Kernel WorkflowRun state CAS、Workflow Run/Activity/Completion lease 状态机、durable signals/timers/child workflows、外部 event outbox、跨进程锁或多主机数据库语义；不把 FTS 当作独立编辑 API。Blob 写入和数据库事务没有跨系统回滚；legacy `setCheckpoint` 没有 CAS。真实 RSS/Bilibili/OpenCLI、Docker、Browser/E2E、跨进程长时 recovery 和多数据库后端未由本组件测试证明。
