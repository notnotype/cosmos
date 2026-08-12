# Workflow Runtime Spike Walkthrough

> 本文件是 `docs/tasks/04-workflow-runtime/README.md` 的 append-only 实施记录。
>
> 每一轮只记录已经执行的动作、验证证据、偏差和下一步；未验证内容不得写成完成。

## Round 0 — 文档基线与分支建立

日期：2026-08-08

### 目标

- 将 Workflow Runtime 架构合同提交到 `master`。
- 从最新 `master` 建立独立 spike 分支和 worktree。

### 已执行

- `master` 提交 `9fe84f2`：`docs: complete workflow architecture contracts`。
- 已推送 `origin/master`。
- 创建分支 `chore/t04-workflow-runtime-spike`。
- 创建 worktree：
  `C:\Users\notnotype\Documents\CodeRepository\GithubProjects\cosmos\.worktree\t04-workflow-runtime-spike`。

### 验证

- `master` 与 `origin/master` 同步。
- 主工作区与 spike worktree 分离。

## Round 1 — 脚本式 Workflow 最小语义

日期：2026-08-08

### 目标

验证脚本式 Workflow 是否可以通过统一的 `Run → Action Invocation → Job` 语义实现：

- Action 执行；
- checkpoint；
- wait/resume；
- journal replay；
- stale lease rejection。

### 已执行

- 新增 `packages/workflow-runtime`。
- 定义 `WorkflowDefinition`、`ActionDefinition`、`WorkflowContext` 和可替换的 `WorkflowStore`。
- 实现仅用于 spike 的 `InMemoryWorkflowStore`。
- 为 Action Invocation 生成稳定的 `runId + path` 幂等边界。
- 实现 Job lease、过期接管和旧 token 拒绝完成。
- 实现 Workflow 等待 Signal 后 resume。
- 实现已完成 Action 的 journal replay。
- 修正 RSS/Collector 测试使用的 `@cosmos/logging` devDependency，使新 worktree 的 clean install 可以完成 package typecheck。

### 验证

- `bun install --frozen-lockfile`：通过。
- `bun run --cwd packages/workflow-runtime typecheck`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts`：2 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run test`：14 个测试文件、59 个测试通过。

### 偏差与限制

- 当前 Store 仍是内存实现，不能代表生产持久化。
- Workflow Run 没有数据库恢复验证。
- Action path 没有完整的 Graph/IR path 编译器。
- Child Workflow 目前只创建子 Run，不负责完整的父子等待和恢复。
- Outbox、Consumer cursor、并发 Run fencing 和中途事实写入 fencing 尚未实现。

### 下一步

- 将 `WorkflowStore` 的持久化要求拆成 Prisma 可实现的表和事务边界。
- 先验证 Workflow Run、Action Invocation、Job lease、Signal 和 Event 的 SQLite schema。
- 再把 InMemory Store 测试迁移为 SQLite/Prisma focused test。

## Round 2 — Prisma Store 与 SQLite migration

日期：2026-08-08

### 目标

验证第一轮的 `WorkflowStore` Port 能否映射到现有 Prisma/SQLite，而不把 Workflow Runtime 直接绑定到 ORM。

### 已执行

- 新增 `WorkflowRun`、`WorkflowActionInvocation`、`WorkflowSignal` 表。
- 为现有 `Job` 增加 `workflowRunId`，使 Workflow Action 与现有 Job lease/retry 表达复用同一 Job 记录。
- 为现有 `DomainEvent` 增加 Workflow 关联和可选 `idempotencyKey`。
- 新增 `PrismaWorkflowStore`，实现：
  - Run 创建、查询和状态更新；
  - Action Invocation 幂等创建；
  - Job claim、过期接管和 token fencing；
  - Job completion/failure；
  - Signal 写入和一次性消费；
  - DomainEvent 幂等写入和游标读取。
- 新增 Workflow Runtime + Prisma Store 集成测试。
- 补充 clean worktree 所需的测试 devDependency 和 Vitest source alias。

### Migration

- `20260808163613_workflow_runtime_spike`
- `20260808170000_workflow_event_idempotency`

两条 migration 已在隔离 SQLite Data Root 上通过 `migrate deploy`。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 Data Root `bun run db:migrate`：4 条 migration 全部通过。
- Prisma Store focused tests：2 个测试通过。
- Workflow Runtime + Prisma Store focused tests：4 个测试通过。
- `bun run build:packages`：通过。
- `bun run typecheck:packages`：通过。
- `bun run test`：15 个测试文件、60 个测试通过。

### 偏差与限制

- 当前 Workflow Run 本身还没有独立的 orchestration lease；只有 Action Job 有 lease。
- `updateRun`、checkpoint 和 Workflow Event 尚未携带 Run lease token。
- Prisma Store 还没有 Outbox 表、Consumer cursor 和持久 Trigger Consumer。
- 目前仍是 spike，不应直接让 API/Worker 使用新 Runtime。

### 下一步

- 为 Workflow Run 增加 orchestration lease 和 stale Run fencing。
- 让 checkpoint、Run terminal close 和 Workflow Event 在同一 lease 边界下提交。
- 再考虑把固定 `source-ingest` 迁移为第一个真实 Workflow。

## Round 3 — Run fencing 与 Action/Run heartbeat

日期：2026-08-08

### 目标

解决 Round 2 暴露的关键缺口：Workflow 脚本本身没有 orchestration lease，长时间 Action 也可能超过 Job lease。

### 已执行

- `WorkflowRun` 增加 `leaseOwner`、`leaseToken`、`leaseExpiresAt`。
- `WorkflowStore` 增加：
  - `claimRun`
  - `renewRun`
  - `assertRunLease`
  - 带 lease token 的 `updateRun`
- `WorkflowRuntime` 在执行脚本前领取 Run lease。
- checkpoint、terminal close、Workflow Event 和 Query/Action/Signal 路径都检查 Run lease。
- Runtime 为 Run 和 Action Job 分别启动 heartbeat。
- `PrismaWorkflowStore` 增加 SQLite Run lease、renew 和 fencing 实现。
- 新增 `20260808173000_workflow_run_leases` migration。
- 增加 InMemory 和 Prisma 的 stale Run takeover 测试。
- 增加长时间 Action 的双 heartbeat 测试。

### 验证

- focused Workflow Runtime/Prisma Store：7 个测试通过。
- `bun run typecheck:packages`：通过。

### 过程偏差

第一次 stale Run 测试使用了人工时间戳 `100/111`，而更新操作使用真实当前时间，导致第二个 lease 也被判断为过期。已统一为同一真实时钟基准，随后 focused 测试通过。

### 当前限制

- `WorkflowActionInvocation` 仍同时承担了最小 StepRun journal 的角色，尚未拆出独立 `WorkflowStepRun` 模型。
- Run lease 和 Action lease 尚未接入现有 API/Worker 的固定 Ingest 链路。
- 长时间 Action 的外部副作用未知结果、Outbox、Child Workflow 和 Trigger Consumer 仍未实现。

### 下一步

- 明确并实现独立的 `WorkflowStepRun`/step path 合同，避免 Action Invocation 兼任逻辑 Step。
- 将 fixed `source-ingest` 包装为真实 Workflow，验证旧 Ingest 与新 Runtime 的行为一致性。
- 在同一事务中收口 Step、Job、Run、checkpoint、DomainEvent/Outbox。

## Round 4 — 独立 WorkflowStepRun 持久模型

日期：2026-08-08

### 目标

解决 Action Invocation 兼任逻辑 Step 的歧义，让 `Run → StepRun → Action Invocation → Job` 在数据库中可区分。

### 已执行

- 新增 `WorkflowStepRun` 模型和 `workflowStepRun` SQLite 表。
- `WorkflowActionInvocation` 增加可选唯一 `stepId`。
- Runtime 增加 `WorkflowStepRecord`、Step 状态和 Step kind 合同。
- Action Job claim、completion、failure 会同步更新对应 StepRun。
- `WorkflowStore.getStep()` 已加入持久化 Port。
- 新增 StepRun focused 断言，确认 Action 完成后 StepRun 的 output/status 已持久化。
- 新增 `20260808180000_workflow_step_run` migration。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 Data Root `bun run db:migrate`：6 条 migration 全部通过。
- Workflow Runtime/Prisma Store focused tests：7 个测试通过。
- `bun run build:packages`：通过。
- `bun run typecheck:packages`：通过。
- `bun run test`：15 个测试文件、64 个测试通过。

### 过程偏差

第一次 schema 修改误把现有 Source Job 的 `stepId` 标成了 `@unique`，同时遗漏了 Workflow Invocation 的一对一唯一约束，Prisma 校验立即捕获并已修正。最终 migration 和 schema 已重新验证。

### 当前限制

- Round 4 当时只持久化 `action` 类型 StepRun；Round 16/17 已补齐 `wait_signal` 与 `checkpoint`，`child_workflow` 仍未完成。
- Step、Job、Run 的最终收口还没有和 Observation/Entry/FTS/Outbox 放进同一个领域 Command 事务。
- 新 Runtime 尚未接入当前 API/Worker 的固定 Ingest。

### 下一步

- 增加固定 Ingest Workflow 的 source fetch、library ingest、checkpoint Action。
- 验证旧 IngestionService 与 Workflow Runtime 的行为等价和重复录入边界。
- 设计 Outbox 与 Trigger Consumer 的持久 cursor。

## Round 5 — Fixed Ingest Workflow 接缝

日期：2026-08-08

### 目标

验证当前固定 Ingest 是否可以先通过 Application Action 接缝接入 Workflow Runtime，而不让 Connector 直接依赖 Prisma，也不立即改写 API/Worker。

### 已执行

- 新增 `packages/application/src/workflow-ingest.ts`。
- 定义：
  - `source.fetch@1`
  - `library.ingest@1`
  - `cosmos.ingest@1`
- Workflow 顺序固定为：

```text
source.fetch
  → library.ingest[0..N]
  → checkpoint
  → ingest.page.persisted
```

- `library.ingest` 通过 `ActionExecutionContext.runId` 获得 Workflow Run ID，再调用 Application 侧 persist Port。
- 每个 item 使用稳定 `library.ingest:N` path，避免把整个页面作为一个不可恢复的大 Job。
- 新增 fixture callback 测试，确认成功后 resume 不会重复 fetch 或 persist。
- 调整 package build/typecheck 顺序，让 Workflow Runtime 成为 Application 的底层依赖。

### 验证

- Fixed Ingest Workflow focused test：1 个测试通过。
- `bun run build`：通过，包含 API、Worker 和 Next Web。
- `bun run typecheck`：通过，包含 packages 和 apps。
- `bun run test`：16 个测试文件、65 个测试通过。

### 当前限制

- 该接缝目前仍使用 callback Port，尚未把现有 `IngestionService` 的真实 Connector/Repository 迁移进来。
- 现有 `persistIngestItem` 的 `runId` 仍是旧 Source Run 语义，不能直接把 Workflow Run ID 当作旧 Run 外键使用。
- 因此当前不能宣称固定 Ingest 已经切换到新 Runtime；这只是行为和依赖边界 spike。

### 下一步

- 提供 Workflow 专用的 `IngestApplicationCommand`，把 Workflow Run、Source Plan 和 Entry 入库事务正确关联。
- 让 Observation/Entry/Asset/FTS/DomainEvent/Outbox 写入携带同一个 Run lease fencing。
- 用 fixture + SQLite 做新旧 Ingest 双跑比较，再决定是否替换现有 `IngestionService`。

## Round 6 — DomainEvent 与 Outbox 原子落盘

日期：2026-08-08

### 目标

验证 Workflow Event 不只是被 SSE 读取的日志，而是可以在同一数据库事务中产生可靠的后续投递意图。

### 已执行

- 新增 `WorkflowOutboxMessage` 模型和 SQLite 表。
- `WorkflowStore` 增加 `WorkflowOutboxRecord` 与 `listOutbox()`。
- InMemory Store 的 `appendEvent()` 同时生成 `pending` Outbox。
- `PrismaWorkflowStore.appendEvent()` 在同一 Prisma transaction 中写入：
  - `DomainEvent`
  - `WorkflowOutboxMessage`
- Outbox 保存 event ID、版本、payload、attempt、availableAt 和未来 lease 字段。
- 增加 InMemory、Application Ingest 和 Prisma Store 的 Outbox 断言。
- 新增 `20260808183000_workflow_outbox` migration。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- Workflow/Application/Prisma focused tests：8 个测试通过。
- `bun run typecheck:packages`：通过。
- 隔离 Data Root `bun run db:migrate`：7 条 migration 全部通过。
- `bun run build`：通过，包含 API、Worker 和 Next Web。
- `bun run typecheck`：通过，包含 packages 和 apps。
- `bun run test`：16 个测试文件、65 个测试通过。

### 当前限制

- 目前只有 Outbox pending 持久化，没有 Consumer cursor、claim、publish、retry 或 `snapshot_required`。
- 现有固定 Ingest 的 `DomainEvent` 写入路径尚未全部迁移到同一 Outbox 合同。
- Outbox 还没有触发 Knowledge/Research Workflow。

### 下一步

- 增加 Outbox Consumer cursor 和 lease。
- 验证重复投递、Consumer 重启和无法补齐事件时的 snapshot 语义。
- 再把 `entry.created/revised` 映射到 KnowledgeSignal/Research Trigger。

## Round 7 — Outbox Consumer cursor

日期：2026-08-08

### 目标

验证 Outbox 消费者可以依靠持久的单调 cursor 恢复读取，而不是依赖进程内队列。

### 已执行

- `WorkflowOutboxMessage` 增加 `eventSequence`。
- 新增 `WorkflowOutboxConsumerCursor` 表。
- `WorkflowStore` 增加：
  - `listOutboxAfter`
  - `getOutboxCursor`
  - `advanceOutboxCursor`
- InMemory 和 Prisma Store 都实现 cursor 单调前进。
- 同一 event 的 Outbox 仍通过 DomainEvent 幂等键保证只创建一次。
- 新增 `20260808190000_workflow_outbox_cursor` migration。
- 增加 cursor 读取、推进和重复推进拒绝测试。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- Outbox/Consumer cursor focused tests：8 个测试通过。
- `bun run typecheck:packages`：通过。

### 当前限制

- Cursor 只记录消费位置，尚未实现 Outbox message lease、publish receipt、retry/backoff 和 dead-letter。
- Cursor 只能保证 Cosmos 内部读取恢复，不能让外部副作用自动变成 exactly-once。
- `snapshot_required` 和 SSE cursor 还没有与 Outbox Consumer 统一。

### 下一步

- 实现 Outbox message claim/lease/ack。
- 增加 Consumer crash/restart 测试，区分 at-least-once 与外部副作用未知。
- 将 `entry.created/revised` 作为 Trigger 输入，创建 KnowledgeSignal 或 ResearchRequest。

## Round 8 — Outbox claim、ack、retry 与 lease fencing

日期：2026-08-08

### 目标

把 Round 7 的持久 Consumer cursor 延伸为最小的 Outbox 投递控制，验证：

- Worker 可以领取 pending message；
- lease 过期后可以被另一个 Worker 接管；
- 旧 token 不能 ack/fail；
- retryable failure 可以重新进入 pending；
- terminal failure 不会被无界重复领取；
- ack 与 cursor 推进在 Prisma 中处于同一个事务边界。

### 已执行

- `WorkflowStore` 增加：
  - `ClaimedWorkflowOutbox`；
  - `claimOutbox`；
  - `ackOutbox`；
  - `failOutbox`。
- InMemory Store 实现 Outbox claim、lease takeover、ack/cursor 推进和 retry/terminal failure。
- Prisma Store 实现同一组操作：
  - pending message 的原子 claim；
  - 过期 leased message 的 token 替换；
  - ack 时校验 message ID、lease token 和 lease expiry；
  - fail 时校验 message ID、lease token 和 lease expiry；
  - ack 与 Consumer cursor 在同一 Prisma transaction 中收口。
- 修正终态 `failed` 的领取条件：只有 `pending` 和过期 `leased` 可以再次领取。
- 修正 InMemory Outbox 的 Map key：初始记录、claim 和 ack/fail 统一使用 message ID，避免接管后残留重复 pending 记录。
- 增加 InMemory 和 Prisma focused 行为测试，覆盖正常 claim、未过期 lease 拒绝、过期接管、旧 token 拒绝、retryable failure、terminal failure 和 cursor 推进。

### 验证

- 首次 focused test 未通过：发现 InMemory Outbox 使用 event ID 写入、message ID 更新，造成同一消息出现 pending 与 leased 两条记录。
- 修复后 `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、9 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、67 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下执行 `bun run db:migrate`：8 条 migration 全部通过。

### 结论

- 基于当前 `WorkflowStore` Port，SQLite/Prisma 可以表达最小的 Outbox claim/ack/fail 和 lease fencing。
- retryable failure 与 terminal failure 已经有不同的持久语义；当前 terminal failure 不会被自动再次领取。
- ack/cursor 的持久收口可以作为后续 Trigger Consumer 的基础，但这仍然是 at-least-once 投递控制，不代表外部副作用 exactly-once。

### 偏差与限制

- 当前 Outbox message 上只有一组 lease 字段，语义按一个 Consumer Group、多 Worker 接管验证；多个独立消费者需要 per-consumer delivery 状态，当前模型尚不支持。
- 尚未实现外部 publisher、Consumer crash/restart 全链路、最大尝试次数、指数退避、dead-letter 和 `snapshot_required`。
- Outbox cursor 尚未与 SSE `Last-Event-ID` 合并。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 先补 Consumer Group 与 per-consumer delivery 的边界决策，避免把当前单组 spike 误当成通用事件总线。
- 再实现外部 publisher/Trigger Consumer 的进程重启恢复和 bounded retry。
- 之后把 `entry.created/revised` 映射到 KnowledgeSignal/ResearchRequest，并验证循环触发保护。

## Round 9 — Outbox 严格顺序与 cursor 跳过防护

日期：2026-08-08

### 目标

检查 Round 8 的 claim 逻辑在多个消息并发存在时是否会绕过前序消息，避免 ack 后将 Consumer cursor 推进到未实际投递的高水位。

### 已执行

- 增加 InMemory 和 Prisma 行为测试：
  - 第一条消息持有未过期 lease 时，不能领取第二条消息；
  - 第一条消息进入 terminal `failed` 后，第二条消息也不能越过它；
  - 后续消息仍保持 pending，不因尝试领取而被错误改写。
- 将 InMemory `claimOutbox` 改为按 `eventSequence` 从 cursor 后逐条扫描：
  - `published` 可以跳过；
  - 可领取的 `pending` 或过期 `leased` 才能成为候选；
  - 未到时间的 pending、未过期 leased 和 terminal failed 都会阻塞后续消息。
- 将 Prisma `claimOutbox` 从“符合条件的任意最早消息”改为同样的顺序扫描，避免 SQL `OR` 条件直接跳过被阻塞的前序消息。

### 验证

- 首次顺序 focused test 未通过：InMemory 和 Prisma 都能在第一条消息 leased/failed 时领取第二条消息。
- 修复后 `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、11 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、69 个测试通过。
- 本轮没有修改 Prisma schema；Round 8 已验证的隔离 Data Root migration（8 条）仍适用。

### 结论

- 当前单 Consumer Group cursor 确实是高水位语义，claim 必须保持事件顺序；允许后续消息越过前序消息会造成不可恢复的事件跳过。
- terminal failed 在引入 dead-letter/人工 skip 机制前必须阻塞 cursor，不能伪装成已消费。

### 偏差与限制

- 该顺序保证只对当前“一个 Consumer Group、多 Worker”模型成立；多个独立 Consumer Group 仍会被 message-level lease/status 互相干扰。
- 当前扫描是 Store 内部的顺序遍历，尚未优化为生产规模的 indexed query/partition。
- 仍未实现外部 publisher、Consumer crash/restart、bounded retry、dead-letter 和 `snapshot_required`。

### 下一步

- 建立 `WorkflowOutboxDelivery(messageId, consumerId)` 级别的投递状态 spike，使多个独立 Consumer Group 可以各自 claim/ack/cursor。
- 在 per-consumer delivery 稳定后，再接入 Trigger Consumer 和外部 publisher。

## Round 10 — per-Consumer Group Outbox delivery

日期：2026-08-08

### 目标

修复 Round 9 暴露的多消费者边界：同一条 DomainEvent 需要同时被 Knowledge、Delivery、SSE 或其它独立 Consumer Group 消费时，各组必须拥有独立的 delivery lease、ack、retry 和 cursor。

### 已执行

- 先增加行为测试，固定同一条 Outbox message 被两个 Consumer Group 同时 claim、分别 ack、分别推进 cursor 的合同；旧 message-level lease 实现按预期失败。
- 新增 `WorkflowOutboxDelivery` Prisma 模型和 `20260808200000_workflow_outbox_delivery` migration：
  - 唯一键为 `(messageId, consumerId)`；
  - delivery 保存 status、attempts、availableAt、lease、error 和 publishedAt；
  - 同一个 Outbox message 可以有多个独立 Consumer Group delivery。
- InMemory Store 新增按 `(consumerId, messageId)` 隔离的 delivery state。
- Prisma Store 的 `claimOutbox`：
  - 为当前 Consumer Group 懒创建 delivery；
  - 按 event sequence 严格扫描；
  - 每个 Group 独立进行 lease takeover；
  - 不再使用 message-level lease/status 作为新投递操作的事实来源。
- Prisma `ackOutbox` 和 `failOutbox` 改为通过 `consumerId + messageId + leaseToken` 校验 delivery，并让 ack 与对应 cursor 在同一 transaction 中完成。
- `failOutbox` Port 增加 `consumerId`，避免跨 Consumer Group 修改状态。
- 保留旧 `WorkflowOutboxMessage` 的 status/lease/attempt 字段作为本轮 additive migration 的历史字段，但在文档中明确 per-Consumer delivery 才是新语义。

### 验证

- 首次 Prisma focused test 未通过：发现 `WorkflowOutboxDelivery` 漏了 `publishedAt` 字段，导致 ack 无法持久化。
- 补齐 schema 和 migration 后：
  - `bun run db:validate`：通过；
  - `bun run db:generate`：通过；
  - `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、13 个测试通过；
  - `bun run typecheck:packages`：通过；
  - `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
  - `bun run test`：16 个测试文件、71 个测试通过；
  - 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：9 条 migration 全部通过。

### 结论

- Outbox event fact 与 Consumer delivery state 必须分离；一个 message 不能只持有一组全局 lease/status。
- `consumerId` 代表 Consumer Group；同一 Group 内由多个 Worker 通过 lease 接管，同一 message 在不同 Group 中各自独立投递。
- 当前 per-Consumer delivery 已足够承载后续 Knowledge、Research、Delivery 和 SSE Consumer 的隔离恢复测试。

### 偏差与限制

- 旧 message-level 字段尚未从 Prisma schema 和历史 migration 中清理；它们不能再作为新的投递状态依据，生产化前需要单独迁移/清理 Task。
- Delivery row 目前懒创建；尚未有 Consumer 注册、订阅过滤、事件类型路由和 retention/cleanup 策略。
- 仍未实现外部 publisher、Consumer crash/restart 全链路、bounded retry、dead-letter、`snapshot_required` 和 SSE cursor 统一。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 先补 Delivery 的 Consumer 注册/事件过滤/retention 合同，避免 Outbox 无限增长。
- 再实现一个真实的 Trigger Consumer：从 `entry.created/revised` 事件生成 KnowledgeSignal 或 ResearchRequest。
- 之后验证 Consumer 重启、外部副作用未知结果和 dead-letter/snapshot_required。

## Round 11 — bounded retry 与 exponential backoff

日期：2026-08-08

### 目标

把 Round 10 的 per-Consumer delivery failure 从“调用方传 retryable，固定延迟 1 秒”提升为有界、可计算、可测试的重试策略。

### 已执行

- 新增 `WorkflowOutboxRetryPolicy`：
  - `maxAttempts`；
  - `baseDelayMs`；
  - `maxDelayMs`。
- 固定默认策略：

```text
maxAttempts = 3
baseDelayMs = 1000
maxDelayMs = 60000
```

- 新增 `resolveWorkflowOutboxFailure`：
  - 第 1 次失败使用 base delay；
  - 后续失败使用指数退避；
  - 延迟不超过 max delay；
  - attempts 达到 maxAttempts 后进入 terminal `failed`。
- `InMemoryWorkflowStore.failOutbox` 和 `PrismaWorkflowStore.failOutbox` 共用同一失败计算合同。
- Prisma failure close 在 transaction 中读取当前 attempts，并以 lease token/expiry 条件更新 delivery，避免旧 Worker 依据过期状态写回。
- 增加 InMemory/Prisma retry policy 行为测试，覆盖两次退避和第三次 terminal close。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、15 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、73 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：9 条 migration 全部通过。
- `git diff --check`：通过。

## Round 89 — 独立 capability projection 消费与 fencing

日期：2026-08-10

### 目标

验证 catalog admission 结果被消费时，不会把 raw Worker registration、catalog
proof 和 Run ownership 混成一条状态；特别固定 source unavailable、旧 Worker
兼容和 projection writer fencing。

### 新增 projection reducer

`packages/application/src/workflow-worker-projection.ts` 新增：

```ts
applyWorkflowWorkerCapabilityProjectionUpdate(previous, update)
```

Projection state 同时保留：

- `localSnapshot`：最新 Worker raw descriptor，始终更新；
- `admittedSnapshot`：最近一次 source 可用且通过 admission 的 snapshot；
- `admissionStatus`：`admitted | partial | rejected | unavailable`；
- `rejections`、`admissionErrorCode`、`admissionError`；
- raw observation 的 `observedAt`/`expiresAt`；
- admitted proof 自己的 `admittedAt`/`admittedExpiresAt`；
- 独立的 `revision`；
- 独立的 `projectionLeaseOwner`、`projectionLeaseToken`、
  `projectionLeaseExpiresAt`。

更新规则：

```text
source=available + admitted/partial
  → 替换 admittedSnapshot 和 rejection projection

source=available + rejected
  → 清除旧 admittedSnapshot，保留当前 rejection

source=unavailable
  → 更新 local/raw observation 和错误诊断
  → 保留上一次 admittedSnapshot 及其原始 expiry
  → 不把“暂时读不到 catalog”解释成“当前无能力”
```

写入必须同时满足：

- Worker id 匹配；
- projection lease owner/token 仍匹配且未过期；
- expected revision 匹配；
- 新 projection lease 在当前时间有效。

旧 token、过期 projection lease 和 revision 冲突都会被拒绝，且不会改变旧
state。state 明确不包含 `runLeaseToken` 或 `registrationToken`。

### 兼容边界

- `evidenceVersion=0`/`legacy` Worker 可以继续作为 `localSnapshot` 保存；
- legacy Worker 没有完整 Workflow/Action evidence 时只能得到
  `rejected`/diagnostic，不会自动产生 `admittedSnapshot`；
- projection reducer 不调用 WorkflowStore、Job、Run claim、Worker Registry
  或 Prisma；
- 本轮没有新增 migration，后续 Prisma 表必须单独保存 projection revision/
  lease，不得复用 Run lease 或 registration token。

### TDD 与验证

`packages/application/src/workflow-worker-projection.test.ts` 覆盖 6 个场景：

- 首次保存 raw + admitted evidence；
- source unavailable 保留 last-known admitted；
- available rejection 清除旧 proof；
- legacy evidence 只做诊断；
- stale token/revision writer fencing；
- projection lease 过期拒绝。

验证结果：

- focused projection tests：6 个通过；
- `bunx vitest run --reporter=dot`：通过，33 个测试文件、231 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `scripts/smoke-node.ps1`（显式 Prisma Worker Registry）：通过；
- 空 SQLite 实际应用 20 个 migration，包含
  `20260809160000_workflow_worker_evidence`；
- `git diff --check`：通过。

### 当前边界与下一步

当前 reducer 只固定 Application 状态合同，尚未提供 durable projection store、
claim/renew API 或独立 Prisma migration。下一轮应在不改变 reducer 语义的前提
下，设计 projection 的持久 Port 和 SQLite schema，重点验证：

1. source unavailable 不覆盖 last-known admitted；
2. Projection lease fencing 在两个进程竞争时成立；
3. projection 重启后可恢复，不依赖内存；
4. Run lease、Job lease、registration token 和 projection lease 四者不能互换。

## Round 90 — Durable capability projection Port 与 Prisma Store

日期：2026-08-10

### 目标

把 Round 89 的 projection reducer 接到可恢复的 durable Port，验证重启恢复、
projection lease 接管和 SQLite 持久化，同时不改变现有 Run/Job/Registration
ownership。

### Application Port

`packages/application/src/workflow-worker-projection-store.ts` 新增：

```text
WorkflowWorkerCapabilityProjectionStore
  get(workerId)
  claim({ workerId, owner, now, leaseMs })
  renew({ workerId, owner, leaseToken, now, leaseMs })
  apply({
      workerId,
      owner,
      leaseToken,
      expectedRevision,
      localSnapshot,
      admission,
      observedAt,
      expiresAt,
      now,
  })
```

`InMemoryWorkflowWorkerCapabilityProjectionStore` 作为合同实现，复用
Round 89 reducer，不作为生产存储。claim/renew/apply 使用 projection 自己的
owner/token/expiry/revision。

### Prisma Store 与 migration

新增：

```text
packages/storage-prisma/src/workflow-worker-projection.ts
packages/storage-prisma/prisma/migrations/
└── 20260809170000_workflow_worker_capability_projection/migration.sql
```

新增模型 `WorkflowWorkerCapabilityProjection`，与
`WorkflowWorkerRegistration`、`WorkflowRun`、`Job` 分离：

- raw local snapshot 与 admitted snapshot JSON；
- source/admission/error/rejections；
- raw/admitted observation 时间；
- projection revision；
- projection lease owner/token/expiry；
- created/updated 时间。

Prisma store 的 `apply` 使用：

```text
读取当前 row
→ 校验 projection lease
→ 复用 Application reducer
→ revision + owner + token + expiry CAS update
→ 读取并返回新 projection
```

旧 projector 在 lease 过期或 revision/token 不匹配时不能写入；新 projector
接管后可以继续使用旧 state。source unavailable 只更新错误和 raw observation，
不清除 last-known admitted snapshot，也不延长旧 admitted proof 的 expiry。

数据库边界使用 `workflowWorkerCapabilitySnapshotSchema` 和
`workflowWorkerCapabilityProjectionSchema` 对 JSON/枚举/错误原因做 Zod 校验；
不保留裸 `JSON.parse` 类型断言。

### TDD 与验证

Application focused：

- projection reducer：6 个测试通过；
- InMemory durable-shaped store：3 个测试通过。

Prisma focused：

- 新 Prisma client 重启后恢复 projection；
- 过期 projector 被新 owner 接管；
- 旧 owner 不能提交；
- renew 后 source unavailable 保留 last-known admitted；
- 2 个 Prisma store 测试通过。

全量验证：

- `bunx vitest run --reporter=dot`：通过，35 个测试文件、236 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `scripts/smoke-node.ps1`（显式 Prisma Worker Registry）：通过；
- 空 SQLite 实际应用 21 个 migration，包含
  `20260809170000_workflow_worker_capability_projection`；
- `git diff --check`：通过。

### 当前边界与下一步

- Durable projection store 已有最小实现，但还没有独立 projection worker/consumer
  进程；
- 当前 projection 不参与 API availability、scheduler、owner assignment 或
  `WorkflowRun.admissionStatus`；
- registration 的 raw evidence 与 projection 的 admitted evidence 仍是两个
  明确层次，尚未自动同步；
- 尚未做两个真实 Node 进程同时竞争 projection lease 的长时间测试；
- 下一轮应验证 projection consumer 的 restart/replay、旧 projection 过期清理、
  availability query 快照和跨进程竞争，仍不能把 projection lease 转换成 Run
  lease。

## Round 91 — 独立 capability projection runner

日期：2026-08-10

### 目标

把 active Worker registration、catalog admission 和 durable projection store
串成一个可单独部署/恢复的 consumer tick，同时不把它接入 Worker poller 或
Workflow Run ownership。

### 实施

`packages/application/src/workflow-worker-projection-runner.ts` 新增：

```text
WorkflowWorkerCapabilityProjectionRunner.tick()
```

每次 tick：

```text
Registry.listActive(public registration snapshot)
  → renew 本 runner 已持有的 projection lease，或 claim 新 lease
  → WorkflowWorkerCatalogAdmissionService.admit(local snapshot)
  → ProjectionStore.apply(expectedRevision + projection lease)
```

边界：

- 只读取 `WorkflowWorkerRegistration` 的 public fields，不读取 registration
  token；
- local snapshot 的 `lastSeenAt`/registration expiry 作为 raw observation 时间；
- runner 维护自己的 lease token map；进程重启后 token 丢失，等待 durable lease
  expiry 后由新 runner 接管；
- source unavailable 仍提交到 projection reducer，由 reducer 保留
  last-known admitted；
- Registry unavailable 返回 `registry_unavailable`，不创建/清除/覆盖 projection；
- apply 失败或被另一个 projector fencing 时只记录 `skipped/failed`，不修改
  Run/Job/lease；
- `tick()` 自带串行 tail，避免同一个 runner 的重入竞争。

### TDD 与验证

`packages/application/src/workflow-worker-projection-runner.test.ts` 覆盖：

- active registration 经 catalog admission 写入 admitted projection；
- 下一 tick renew projection lease；
- catalog source outage 后保留 admitted snapshot；
- Worker Registry unavailable 不写 projection。

验证结果：

- runner focused：2 个测试通过；
- `bunx vitest run --reporter=dot`：通过，36 个测试文件、238 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `scripts/smoke-node.ps1`（显式 Prisma Worker Registry）：通过；
- 空 SQLite 实际应用 21 个 migration；
- `git diff --check`：通过。

### 当前边界与下一步

- runner 尚未作为独立 `apps/worker`/consumer 进程启动；
- 尚未把 projection query 暴露给 API，也没有 `no_capable_worker` durable
  availability projection；
- 尚未做两个真实 Node 进程竞争同一 projection lease 的长时间 restart/replay；
- 未实现 stale projection cleanup、registration 消失后的 tombstone 或
  snapshot_required；
- 下一轮继续验证跨进程 projection runner restart/reclaim 和 query 快照，但
  projection lease 仍不能转换为 Run lease。

### 结论

- retry policy 应该属于 Consumer/Binding 的版本化配置，并在一次失败处理时作为输入快照使用；Store 不应自行猜测业务是否可重试。
- Store 仍必须强制 max attempts 和 backoff，不能允许一个错误在 Worker 重启后无限快速循环。
- terminal failure 与 retryable failure 已经拥有不同的持久状态，但 dead-letter/skip 仍是下一层控制。

### 偏差与限制

- 当前 policy 由调用方传入，尚未持久化到 Consumer Definition/Trigger Binding。
- terminal `failed` 仍阻塞当前 Consumer Group 的 eventSequence；没有 dead-letter queue、人工 skip 或 `snapshot_required`。
- 还没有真实 Outbox Consumer Runner、外部 publisher、crash/restart 全链路和未知外部副作用结果。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 建立 Consumer Definition/Binding 的最小注册合同，持久化 retry policy、事件过滤和 retention。
- 写一个可重启的 generic Outbox Consumer Runner，验证 claim → handler → ack/fail → lease takeover 全链路。
- 再接入 `entry.created/revised` 的 Trigger Consumer，进入 KnowledgeSignal/ResearchRequest 方向。

## Round 12 — generic Outbox Consumer Runner

日期：2026-08-08

### 目标

把 Store 层的 claim/ack/fail 组合成一个可被 Worker 调用的最小执行单元，同时保持 Runtime 不绑定外部 HTTP、SSE 或具体发布系统。

### 已执行

- 新增 `WorkflowOutboxConsumer`，`runOnce()` 每次最多处理一条 delivery：

```text
claim
  → handler
  → ack
      ↘ lease_lost
  → 或 fail(retry policy)
```

- 新增错误分类：
  - `WorkflowOutboxRetryableError`；
  - `WorkflowOutboxTerminalError`；
  - 可替换的 `classifyError`。
- Runner 输出明确结果：
  - `idle`；
  - `published`；
  - `retry_wait`；
  - `failed_terminal`；
  - `lease_lost`。
- 默认未知异常按 terminal 处理；显式 retryable 异常才进入 retry policy。
- 增加 InMemory 测试：
  - 成功 handler → ack；
  - retryable error → retry_wait → 延迟后再次成功；
  - terminal error → failed_terminal 并阻塞当前 cursor；
  - handler 期间 lease 被其它 Worker 接管 → 旧 Runner 返回 lease_lost；
  - Worker 重启后可接管 delivery。
- 增加 Prisma Store 集成测试，验证 generic Runner 可以真正推进持久 cursor。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、19 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、77 个测试通过。
- 本轮没有修改 Prisma schema；Round 11 已验证的隔离 Data Root migration（9 条）仍适用。
- `git diff --check`：通过。

### 结论

- Worker 循环可以建立在一个单次 `runOnce` Port 之上；长循环、并发度和调度策略可以留在宿主层，不污染 Workflow Runtime 语义。
- lease lost 必须是显式结果，不应被旧 Worker 当作成功或普通业务失败。
- handler 成功与 ack 成功是两个不同事实：外部副作用可能已经发生，但 ack 可能因租约失效失败，因此整体仍是 at-least-once。

### 偏差与限制

- Runner 尚未接入 apps/worker 的实际循环，也没有并发 worker pool、consumer registration、事件过滤和 retention。
- 未知外部结果尚未建模为 receipt/uncertain；外部 Publisher 需要自己的幂等键、receipt 和恢复策略。
- 仍未接入 API、Trigger Consumer、KnowledgeSignal 或 ResearchRequest。
- Workflow Runtime 仍是独立 spike，旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 定义 Consumer Definition/Binding：consumer group、事件过滤、retry policy、lane、并发度和 retention。
- 将 Runner 接到独立 Worker loop，加入 crash/restart、heartbeat 和受控 shutdown 验证。
- 之后用 `entry.created/revised` 做第一个真实 Trigger Consumer，验证 KnowledgeSignal/ResearchRequest 的循环保护。

## Round 13 — Consumer Definition/Binding 与事件过滤

日期：2026-08-08

### 目标

验证 Consumer Group 的事件订阅范围可以被显式描述，并且被过滤掉的事件不会卡住 Consumer cursor 或被误交给 handler。

### 已执行

- 新增版本化公共合同：
  - `WorkflowOutboxConsumerDefinition`；
  - `WorkflowOutboxConsumerBinding`。
- Definition 固定最小字段：`id`、`version`、`eventTypes`、`leaseMs` 和 `retryPolicy`。
- `WorkflowOutboxConsumer` 支持从 Definition 读取 filter/lease/retry 配置。
- `WorkflowStore.claimOutbox` 增加可选 `eventTypes`：
  - 不匹配的 pending delivery 标记为 `skipped`；
  - 在同一次 Store 操作中推进该 Consumer cursor；
  - 匹配的 delivery 继续走正常 claim；
  - `skipped` delivery 不会再次进入 handler。
- InMemory/Prisma 都增加 ignored event → accepted event 的过滤行为测试。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、21 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、79 个测试通过。
- 本轮没有新增 Prisma migration；`skipped` 使用现有 String status，Round 11 已验证的 9 条 migration 仍适用。
- `git diff --check`：通过。

### 结论

- 事件过滤必须属于 Consumer delivery，而不是在 handler 内丢弃；否则 cursor 无法可靠推进，重启后会重复扫描。
- `skipped` 是一种持久 delivery 终态，和 `published` 一样推进 cursor，但不代表事件被外部发布。
- Definition version 需要和 Consumer Binding 一起管理；过滤器变更不能默认重放已经 skipped 的历史事件。

### 偏差与限制

- Definition/Binding 目前只是公共运行时合同，没有持久 Consumer Registry、API、订阅路由或版本激活流程。
- 当前用 `consumerId` 作为 delivery/cursor scope；若要重放旧过滤范围，应创建新 Binding/Consumer Group 或显式 replay。
- 没有 retention、dead-letter、snapshot_required 或真实 Trigger Consumer。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 设计 Consumer Registry/Binding 持久模型：版本激活、事件过滤、retry policy、lane、并发度和 retention。
- 将 skipped/published/failed 的 retention 与 replay 操作写成明确 Application Command。
- 接入第一个 `entry.created/revised` Trigger Consumer，生成 KnowledgeSignal/ResearchRequest 并验证循环保护。

## Round 14 — 持久 Consumer Registry/Binding

日期：2026-08-08

### 目标

验证 Consumer Definition/Binding 在 Worker 重启后可以从共享 SQLite Data Root 重新解析，Definition 版本不可变，Binding 可以切换到新版本。

### 已执行

- 新增 `WorkflowOutboxConsumerRegistry` Port：
  - `registerDefinition`；
  - `getDefinition`；
  - `upsertBinding`；
  - `getBinding`；
  - `resolve`。
- InMemory Registry 实现：
  - 同一 `(id, version)` 相同内容可重复注册；
  - 同一版本不同内容拒绝覆盖；
  - Binding 必须指向已注册 Definition；
  - disabled Binding 不参与 resolve。
- Prisma 新增：
  - `WorkflowOutboxConsumerDefinition`；
  - `WorkflowOutboxConsumerBinding`；
  - `20260808210000_workflow_consumer_registry` migration。
- 新增 `PrismaWorkflowOutboxConsumerRegistry`。
- 新增 `createWorkflowOutboxConsumerFromRegistry`，按 `consumerId` 读取当前 Binding/Definition，再构造 Runner。
- 增加 InMemory/Prisma 版本不可变、Binding v1 → v2、缺失 Definition 和 disabled Binding 测试。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：10 条 migration 全部通过。
- `git diff --check`：通过。

### 结论

- Consumer Definition 是不可变版本对象；Binding 是当前激活指针，两者不能合并成一个可覆盖配置。
- Worker 不应把 Consumer 配置作为进程启动参数的唯一真相；至少需要从共享持久 Registry 解析当前 Binding。
- Binding 切换版本与 replay 是两个不同操作；切换配置不应隐式回退或重放已有 cursor/skipped delivery。

### 偏差与限制

- Registry 还没有 API、审计事件、并发激活 fencing、删除/retention 和权限模型。
- 当前 Definition 只保存事件类型过滤、lease 和 retry policy；lane、并发度、handler/action ref、外部 capability 尚未持久化。
- Workflow Run 尚未保存使用的 Consumer Definition/Binding 快照。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 为 Binding 增加激活操作的 Application Command、审计事件和并发版本条件。
- 明确 replay command：从哪个 event sequence 开始、是否新建 Consumer Group、如何避免重复外部副作用。
- 接入第一个真实 Trigger Consumer，并把 Definition/Binding 快照与 KnowledgeSignal/ResearchRequest 关联。

## Round 15 — Consumer Binding revision/CAS fencing

日期：2026-08-08

### 目标

验证 Consumer Binding 的激活不会被旧配置或并发管理动作静默覆盖；Binding 更新必须以 revision compare-and-set 作为 fencing。

### 已执行

- `WorkflowOutboxConsumerBinding` 增加 `revision`，初始 revision 为 `0`。
- `WorkflowOutboxConsumerRegistry.upsertBinding` 收紧为：
  - 首次创建；
  - 相同内容幂等重复写入；
  - 不同内容拒绝覆盖。
- 新增 `activateBinding`：
  - 接收 `expectedRevision`；
  - 校验 Definition 已存在；
  - 成功时 revision 自增；
  - stale expectedRevision 返回 `WorkflowConsumerBindingConflictError`。
- InMemory Registry 通过 Map 状态实现 CAS。
- Prisma Registry 使用 `updateMany(where: consumerId + revision)` 实现数据库条件更新。
- 新增 `20260808220000_workflow_consumer_binding_revision` migration。
- 拆分 Zod Binding input/output 类型，避免初始化输入被迫手写 revision。
- 增加 InMemory/Prisma 测试：v1 → v2、启用 → 禁用、stale revision rejection。

### 验证

- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck:packages`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：11 条 migration 全部通过。
- `git diff --check`：通过。

### 结论

- Binding 是一个需要 fencing 的持久指针，不应使用无条件覆盖表达激活。
- Definition 不可变、Binding CAS、Delivery lease 是三种不同层级的版本/租约边界，不能合并成一个状态字段。
- revision 只保护配置指针；它不等同于审计事件，也不自动影响已经运行的 Worker。

### 偏差与限制

- 尚未产生 Binding 激活 DomainEvent，也没有记录操作者、来源或 command idempotency。
- 正在运行的 Consumer Runner 不会因为 Binding revision 改变而自动停止；需要后续 definition snapshot/lease policy。
- 尚未实现 API、权限、审批、多用户或不可信插件隔离。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 把 Binding activation 收口为 Application Command + audit event，并增加 command idempotency。
- 明确旧 Definition 已被停用时，正在运行的 Runner 是完成当前 delivery、停止领取，还是等待 lease 自然失效。
- 接入第一个真实 Trigger Consumer，验证配置激活、事件过滤、retry 和 ResearchRequest 触发的完整链路。

## Round 16 — wait_signal StepRun 持久语义

日期：2026-08-08

### 目标

补齐非 Action StepRun 的第一个类型：Workflow 等待 Signal 时，StepRun、Signal 消费和 Run waiting/resume 必须形成可恢复边界。

### 已执行

- `WorkflowStore` 新增 `consumeSignalStep`：
  - 接收 `runId`、稳定 path、signalRef、leaseToken 和 now；
  - 先校验当前 Workflow Run lease；
  - 没有 Signal 时创建/更新 `wait_signal` StepRun 为 `waiting`；
  - 有 Signal 时在同一 Store transaction 内删除 Signal、写入 StepRun output 并置为 `succeeded`；
  - 已经 succeeded 的 StepRun replay 时直接返回保存的 output，不再次等待。
- InMemory Store 与 Prisma Store 实现同一语义。
- Runtime 的 `waitForSignal` 改为调用 `consumeSignalStep`，稳定 path 为 `wait_signal:<signalRef>`。
- InMemory/Prisma waiting workflow 测试增加 StepRun 状态断言。

### 验证

- 首次 focused test 失败：Prisma runtime 测试断言误用了未定义的 `store` 变量；补齐测试接线后重新运行。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 本轮没有新增 Prisma migration；使用既有 `WorkflowStepRun` 表。
- `git diff --check`：通过。

### 结论

- `wait_signal` 不能只是 Run 的 waitingSignal 字段；它需要自己的 StepRun 状态、输入和输出，才能在脚本 replay 时恢复已经完成的等待。
- Signal 消费与 StepRun 成功收口必须位于同一个持久事务边界，否则可能出现 Signal 已删除但 StepRun 仍 waiting 的不可恢复裂缝。
- Run waiting、Step waiting、Signal delivery 是三个不同层级，不能只用一个字段表达。

### 偏差与限制

- 当前只实现 `wait_signal` StepRun；checkpoint 和 child workflow 尚未有独立 StepRun。
- Signal 仍是 `(runId, signalRef)` 的单值 mailbox，后写覆盖前写；没有 history、排队、多次 signal、timeout 或 cancellation reason。
- Signal producer 尚未有来源、权限、审计和幂等合同。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 继续补 checkpoint StepRun 与 child workflow StepRun，明确 wait/child 的父子恢复语义。
- 将 Signal mailbox 升级为可追踪 Signal record/receipt，再接入 Trigger Consumer。
- 接入第一个真实 Knowledge/Research Workflow，验证 StepRun、Outbox、Definition/Binding 和 ResearchRequest 的组合边界。

## Round 17 — checkpoint StepRun 原子收口

日期：2026-08-08

### 目标

补齐第二类非 Action StepRun：checkpoint 的逻辑阶段状态和 Run 恢复 checkpoint 必须在同一持久边界内写入。

### 已执行

- `WorkflowStore` 新增 `recordCheckpoint`：
  - 校验 Run lease；
  - 创建或恢复 `checkpoint` StepRun；
  - 写入 StepRun output/status；
  - 同时写入 Workflow Run checkpoint。
- InMemory Store 和 Prisma Store 使用同一合同；Prisma 在一个 transaction 中更新 StepRun 与 WorkflowRun。
- `WorkflowContext.checkpoint` 增加可选 `{ key }`：
  - `checkpoint({ ... }, { key: "after-fetch" })` → 稳定 `checkpoint:after-fetch`；
  - 不提供 key 时使用 `checkpoint:<sequence>` fallback。
- waiting workflow 测试增加 `checkpoint:1` StepRun 的 kind/status/output 断言。

### 验证

- `bun run typecheck:packages`：通过。
- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：2 个测试文件、23 个测试通过。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：16 个测试文件、81 个测试通过。
- 本轮没有新增 Prisma migration；复用既有 `WorkflowStepRun` 表。
- `git diff --check`：通过。

### 结论

- Checkpoint 不应只是 Run 上的一个可覆盖 JSON 字段；它同时是脚本执行的逻辑阶段，应该有 StepRun provenance。
- Run checkpoint 与 StepRun output 必须在同一事务内收口，否则恢复游标和阶段事实可能分叉。
- 显式 checkpoint key 是 Graph/IR 编译到脚本 Workflow 时保持 replay 稳定的必要接口；顺序 fallback 只能作为 spike 便利。

### 偏差与限制

- 当前只实现 `wait_signal` 和 `checkpoint` 两类非 Action StepRun。
- Child Workflow 仍只创建子 Run，没有父 StepRun、等待结果、失败传播、取消和恢复。
- Run 只保存最新 checkpoint，没有历史版本和显式 replay command。
- Workflow Runtime 仍未接入 API/Worker；旧固定 Ingest Runtime 仍是实际生产执行入口。

### 下一步

- 实现 child workflow StepRun 的父子关系、wait/resume、结果引用和失败传播。
- 为 checkpoint 增加历史/快照查询和恢复 command。
- 接入第一个 Knowledge/Research Workflow，验证 Action、wait、checkpoint、Outbox 和 Trigger Consumer 的组合。

## Round 18 — child Workflow start-only StepRun

日期：2026-08-08

### 目标

验证脚本 Workflow 可以持久化启动一个子 Workflow，并在父 Workflow 因 Signal 等待而 replay 时复用同一个子 Run。当前只实现 `wait: false` 的 start-only 语义，不提前引入没有恢复合同的父子等待。

### 已执行

- 扩展 `WorkflowContext.startChildWorkflow()`：
  - 支持 `{ wait?: boolean; key?: string }`；
  - 默认 `wait: false`；
  - 通过 `WorkflowRuntime.getWorkflow()` 解析目标 Definition 并校验输入；
  - 使用 `child:<key>` 作为稳定 Step path，未提供 key 时使用当前执行序号 fallback。
- 扩展 `WorkflowStore`：
  - 新增 `startChildWorkflowStep()`；
  - 返回持久化的 child Run 和父级 StepRun。
- InMemory Store 实现：
  - 校验父 Run lease；
  - 首次调用原子创建 queued child Run 和 `child_workflow` StepRun；
  - StepRun output 保存 `{ runId }`；
  - 同一父 Run + path replay 时复用原 child Run。
- Prisma Store 实现：
  - 在同一 transaction 内校验父 Run lease；
  - 创建 child `WorkflowRun` 并写入 `parentRunId`；
  - 创建父级 `WorkflowStepRun`，避免父脚本 replay 产生重复 child Run；
  - replay 时按稳定 path 返回原 child Run。
- 明确拒绝 `wait: true`，错误为：

```text
Child Workflow wait=true is not implemented in this spike.
```

- 增加 InMemory focused test：
  - parent 首次执行进入 waiting；
  - child Run 的 kind、input、parentRunId 和 queued 状态；
  - 父级 `child_workflow` StepRun 的 running/output；
  - Signal resume 后两次调用得到同一个 child Run ID；
  - `wait: true` 进入明确 failed 终态。
- 增加 Prisma focused test，覆盖同一持久化与 replay 合同。

### 首次失败与修复

- 首次 Prisma focused test 失败，父 Run 为 `failed`。
- 读取持久化错误后确认根因：Prisma schema 中 `WorkflowRun.id` 是必填字段，child transaction 漏传 `id`。
- 在 Prisma child Run create 中补充 `randomUUID()`。
- 删除临时诊断输出，重新运行 focused tests 通过。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、26 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、84 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 18 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。
- 本轮没有新增 Prisma schema 或 migration。

### 结论

- start-only child Workflow 可以收敛到现有 `Run → StepRun` 持久模型，不需要在 Runtime 内另造一套内存 child task。
- 父 Run lease、child Run 创建和父级 StepRun 必须在同一个 Store/transaction 边界内，否则 replay 可能得到重复 child Run 或只有一半的父子关系。
- 稳定 Step path 是 child replay 去重的关键；Graph/IR 编译器必须为 child node 生成显式 key。
- `wait: true` 不能只在 API 层“返回 child ID 后假装等待”；在没有 child completion 事件、父级等待 StepRun 和结果引用合同前，明确拒绝更安全。

### 偏差与限制

- child Run 只被创建为 `queued`，尚未接入 Worker/Trigger 调度。
- 没有父级等待 child 完成、output 绑定、failure/cancel/timeout 传播或恢复。
- `child_workflow` StepRun 在 child 完成前保持 `running`；父 Run 可以先完成，完整生命周期尚未定义。
- 尚未实现递归深度、父子 budget 传播和 child result schema。

### 下一步

- 设计 child completion DomainEvent/Outbox、父级 wait StepRun 和结果引用。
- 决定父 Run 完成后 child failure 的处理方式，以及 parent/child cancel 与 timeout 的传播方向。
- 让 queued child Run 通过持久调度器领取，而不是由 parent Runtime 直接执行。

## Round 19 — durable Workflow Run dispatch tick

日期：2026-08-08

### 目标

验证已经持久化为 `queued` 的 Workflow Run 可以由共享 Store 驱动领取和执行，而不是只能依赖创建它的 Runtime 进程立即调用 `start()`。本轮只实现单次 dispatch tick，不提前实现 Worker 长循环或父子等待。

### 已执行

- `WorkflowStore` 新增 `claimNextRun()` 和 `ClaimWorkflowRunInput`：
  - 选择最早的 `queued` Run；
  - 选择 lease 已过期的 `running` Run 用于接管；
  - 排除 `waiting` 和终态 Run；
  - 以新 lease token 返回 `ClaimedWorkflowRun`。
- InMemory Store：
  - 按 `createdAt + id` 稳定排序；
  - 使用现有 `claimRun()` 完成单 Run lease fencing。
- Prisma Store：
  - 在 transaction 内查询 queued/expired running 候选；
  - 使用候选状态、旧 lease token 和过期时间条件更新；
  - 竞争失败返回 `null`，不会覆盖新 Worker 的 lease。
- `WorkflowRuntime` 新增 `runNext()`：
  - 无候选时返回 `null`；
  - 有候选时复用 `start()`/`resume()` 的 Definition 解析、Run heartbeat、Action/Signal 路径和 terminal close；
  - 将原执行逻辑抽取为 `executeClaimedRun()`，避免 `runNext()` 二次 claim。
- 增加 InMemory/Prisma focused tests：
  - 两个 queued Run 按稳定顺序各执行一次；
  - 第二个 Run 在第一 tick 后仍保持 queued；
  - 两个 Run 完成后下一次 tick 返回 `null`。

### 过程偏差与修复

- 第一次重构 `executeRun()` 时，抽出的 `executeClaimedRun()` 仍引用旧的 `runId` 局部变量；packages typecheck 捕获后改为使用 `run.id`。
- 本轮没有新增 Prisma schema 或 migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、28 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、86 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 19 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。

### 结论

- `WorkflowRun` 自身可以作为“脚本编排层的 durable runnable”，通过 Run orchestration lease 被外部 Worker 逐个领取。
- `runNext()` 与 `start()`/`resume()` 共享同一执行路径，避免为后台调度再造一套 Workflow 语义。
- `waiting` 不应被通用扫描器反复领取；Signal、Trigger 或 child completion 必须显式唤醒它。
- queued child Run 现在有了可被外部调度的接缝，但仍未获得父子完成语义。

### 偏差与限制

- 当前只是单次 tick，不是 `apps/worker` 长循环、并发池、优雅停机或持久 Worker heartbeat。
- 当前顺序为 `createdAt + id`，没有 priority、lane、fairness、budget admission 或 schedule time。
- Run orchestration lease 与 Action Job lease 仍是两个层次；本轮没有为 Workflow Run 额外创建 Job。
- `waiting` Run 的 Signal/Trigger 唤醒和 child completion consumer 尚未实现。
- `wait: true`、结果绑定、失败/取消/超时传播仍后置。

### 下一步

- 将 `runNext()` 接入 Worker loop，验证多个 Worker 竞争、进程中断、lease 接管和优雅停止。
- 设计 queued Run 的 priority/lane/admission 合同。
- 在 child completion event、父级 wait StepRun 和结果引用确定后，再实现父子等待。

## Round 20 — multi-Worker claim fencing

日期：2026-08-08

### 目标

验证多个 Runtime/Worker 共享同一个 Workflow Store 时，同一个 queued Run 只能被一个 Worker 领取和执行；其它 Worker 必须因为有效 lease 返回 `null`，不能重复执行 Workflow。

### 已执行

- InMemory 和 Prisma focused tests 各创建两个独立 `WorkflowRuntime`，共享同一个 Store。
- 测试 Workflow 在第一个 Worker 获得 Run lease 后暂停，第二个 Worker 随后调用 `runNext()`。
- 第二个 Worker 的 `claimNextRun()` 返回 `null`。
- 释放第一个 Workflow 后，第一个 Worker 成功完成 Run，最终状态和 output 正确。
- 本轮没有修改 Prisma schema 或 migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、30 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、88 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 20 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。
- InMemory/Prisma 都通过单有效 lease 的竞争测试。

### 结论

- `claimNextRun()` 不能只按 queued 状态读取后在进程内标记；领取必须返回持久 lease，并由状态、旧 token 和过期时间条件保护。
- `runNext()` 复用统一 `executeClaimedRun()` 后，竞争失败的 Worker 不会进入 Workflow Definition，也不会执行 Action 或外部副作用。
- Run orchestration lease 的竞争合同独立于 Action Job lease；两者不能用同一个 token 或内存锁替代。

### 偏差与限制

- 本轮验证的是“一个 Worker 已持有 lease 时的竞争”，还没有覆盖 SQLite 高并发锁冲突、lease 到期接管期间的旧 Worker 中途写入和网络分区。
- `runNext()` 仍是单次 tick，不是多 Worker 长循环、并发池或公平调度器。
- lease 竞争只保护 WorkflowRun orchestration；Action Job、外部副作用和 child completion 仍需要各自的 fencing/幂等合同。

### 下一步

- 增加 lease 到期接管的 runtime-level 测试：旧 Worker 执行中，新的 Worker 接管后旧 Worker 不能 terminal close。
- 将竞争测试接入实际 Worker loop 和 shutdown/heartbeat 生命周期。
- 再评估 SQLite 的 busy timeout、重试和调度公平性。

## Round 21 — runtime-level stale Worker takeover

日期：2026-08-08

### 目标

验证旧 Worker 在 Workflow 执行期间失去 Run lease 后，即使它随后恢复并返回结果，也不能覆盖新 Worker 接管后已经写入的 terminal state。

### 已执行

- InMemory 和 Prisma focused tests 各创建 stale/current 两个 Runtime。
- stale Worker 使用 40ms lease，测试临时让它的 `renewRun` 返回 `false`，并在第一次 Workflow execution 中暂停。
- lease 过期后，current Worker 调用 `runNext()` 接管同一个 `running` Run，第二次执行返回 `"current"` 并成功收口。
- 释放 stale Worker 后，它的 `executeClaimedRun()` 因 lease 已失效抛出 `WorkflowLeaseLostError`。
- 断言最终持久 Run 仍为 `succeeded`，output 为 `"current"`。
- 本轮没有新增 Prisma schema 或 migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、32 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、90 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 21 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。

### 结论

- lease fencing 必须覆盖 Runtime 的 terminal close，而不能只保护 `claimNextRun()`。
- “旧 Worker 已经开始执行”不是它继续写入的权限；每次 terminal close 前必须由持久 Store 使用当前 lease token 再次验证。
- 新 Worker 接管后，旧 Worker 返回的结果应被视为 stale/unknown，而不是失败一次后覆盖当前状态。

### 偏差与限制

- 本轮用受控 Store renew 失败模拟 lease 丢失，尚未覆盖真实进程 kill、网络分区、SQLite busy、系统时钟漂移和外部副作用未知结果。
- 旧 Worker 仍可能在 lease 失效后继续执行外部调用；Cosmos 只能保证领域持久状态不被旧 token 收口，不能撤销已经发出的外部副作用。
- Worker loop 尚未提供统一的 lease-lost/taken-over/unknown-result 结构化结果和 shutdown drain。

### 下一步

- 将 lease-lost、taken-over、unknown-result 接入 Worker tick 结果合同。
- 在真实 Worker loop 中验证进程中断、重启、heartbeat、停止领取和优雅退出。
- 为 Action/Connector 外部副作用补齐 receipt/idempotency 边界。

## Round 22 — 可停止的 Workflow Worker loop

日期：2026-08-08

### 目标

把 `WorkflowRuntime.runNext()` 包装成一个可单测、可停止、可观测的 Worker loop 接缝，同时不改变当前固定 Ingest Worker 的生产入口。

### 宿主审查

- `apps/worker/src/main.ts` 当前是固定 Ingest/Probe Worker：
  - `pollOnce()`；
  - `setInterval` 轮询；
  - `WorkerHeartbeat` starting/ready/stopped；
  - SIGINT/SIGTERM shutdown；
  - repository close 和 logger close。
- 它尚未注册 Workflow Definition，也没有 Workflow Store/Runtime wiring。
- 因此本轮只在 `packages/workflow-runtime` 验证 loop contract，不把新 Runtime 半接入现有生产入口。

### 已执行

- 新增 `WorkflowWorkerTickResult`：
  - `processed`：包含 Run ID 和最终 Run status；
  - `idle`：没有可运行 Run；
  - `lease_lost`：Run lease 丢失；
  - `error`：其它 tick/Store 错误。
- 新增 `WorkflowWorkerLoop`：
  - `tick()` 执行一次 Runtime `runNext()`；
  - `start()` 立即执行第一 tick，再按 `pollIntervalMs` 轮询；
  - `stop()` 设置停止标志并唤醒等待中的 timer；
  - 当前 tick 完成后 loop 退出；
  - `onTick` 提供最小观测回调。
- 增加 Workflow Runtime tests：
  - processed/idle；
  - stop 不等待完整 10 秒 poll interval；
  - lease loss 转换为结构化结果。

### 过程偏差与修复

- 本轮没有发现代码失败；先审查 `apps/worker` 后决定不修改其生产 wiring，避免没有 Definition Registry 的半接入。
- 本轮没有新增 Prisma schema 或 migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts`：通过，1 个测试文件、21 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、93 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 22 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。

### 结论

- `runNext()` 可以作为宿主 Worker loop 的单 tick，不需要在 loop 内复制 Workflow 执行语义。
- `idle`、`lease_lost` 和 `processed` 必须是可观测结果；不能让 lease loss 直接变成未分类的进程异常。
- stop 需要唤醒 poll timer，但不取消当前正在执行的 Workflow；取消和 drain 属于更高层 supervisor 合同。
- 当前固定 Ingest Worker 与 Workflow Worker loop 应保持两个明确的 wiring 边界，待 Definition 注册、lane/admission 和 heartbeat 统一后再合并宿主。

### 偏差与限制

- `WorkflowWorkerLoop` 尚未接入 `apps/worker`，没有真实进程启动、heartbeat、日志和 supervisor 验证。
- 每次只执行一个 Workflow Run；Outbox Consumer、Source Job 和未来 Action worker 没有统一调度。
- `onTick` 只是最小回调，不是完整 metrics/tracing/backpressure contract。
- `stop()` 不取消正在执行的 Action/Connector，外部副作用仍需要自身 timeout、receipt 和幂等。

### 下一步

- 设计宿主级 Worker supervisor：Workflow Run、Action Job、Outbox、Source Job 的 lane/admission/fairness。
- 将 `lease_lost/taken_over/unknown_result` 接入统一 heartbeat、日志和恢复指标。
- 在确认 Definition 注册和生产 wiring 后，再把 package loop 接入 `apps/worker`。

## Round 23 — child terminal close propagation

日期：2026-08-08

### 目标

补齐 child Workflow 的一个独立生命周期事实：child Run 进入 `succeeded/failed/cancelled` 后，父级 `child_workflow` StepRun 不能永远停留在 `running`。本轮只收口 StepRun，不实现父 Run 的 wait/resume。

### 已执行

- `WorkflowStore` 新增 `completeRun()`，输入当前 Run lease token、terminal status、output/error 和时间。
- InMemory Store 在同一状态边界内：
  - 写入 child Run terminal status/output/error；
  - 清除 child lease；
  - 根据 `parentRunId`、父 StepRun kind 和 output.runId 找到父级 StepRun；
  - 将父 StepRun 收口为 child status，并写入 `{ runId, status, result, error }`。
- Prisma Store 在同一 transaction 内执行同一传播：
  - child Run lease 条件校验；
  - child Run terminal update；
  - 查询父级 running/waiting child StepRun；
  - 更新父 StepRun status/output/error。
- `WorkflowRuntime` 的成功和业务失败 terminal close 改用 `completeRun()`；waiting 仍使用 `updateRun()`。
- 增加 InMemory/Prisma 测试，覆盖 child success 与 child failure。

### 过程偏差与修复

- 首次 packages typecheck 发现传播 helper 接收完整 `WorkflowRunStatus`，却只允许 terminal status。
- 改为显式判断 `succeeded/failed/cancelled`，对 queued/running/waiting 直接抛错，避免类型断言掩盖生命周期错误。
- 本轮没有新增 Prisma schema 或 migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、37 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、95 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，11 条 migration 全部应用。
- `git diff --check`：通过。
- Round 23 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。
- InMemory/Prisma 都验证 child success/failure 的父 StepRun terminal propagation。

### 结论

- child completion 是一个独立的持久事实，不应依赖父 Workflow 再次执行脚本才补写 StepRun。
- child Run terminal close、父 StepRun 状态和结果引用必须处于同一 Store/transaction 边界，避免出现 child 已完成但父 StepRun 永远 running 的裂缝。
- 本轮只传播 StepRun，不自动唤醒父 Run；parent wait/resume 需要另一个明确的事件和调度合同。

### 偏差与限制

- `wait: true` 仍未实现；父 Run 不会因 child 完成自动 requeue/resume。
- 当前通过 `parentRunId + output.runId` 定位关系，没有独立 parent-child relation 表或 completion event。
- 旧的 `updateRun(status=terminal)` 旁路不会触发 child propagation；所有 terminal close 还需要统一收口到 Application Command。
- child completion 尚未写入独立 DomainEvent/Outbox，没有 child result schema/version。

### 下一步

- 定义 child completion DomainEvent/Outbox、父级 wait StepRun 和唤醒/重排队合同。
- 决定 child success/failure/cancel/timeout 如何幂等地影响父 Run。
- 收紧 terminal close API，避免业务代码绕过 `completeRun()`。

## Round 24 — child wait/resume 最小合同

日期：2026-08-08

### 目标

实现 `startChildWorkflow(wait:true)` 的最小 durable 语义：父 Run 等待 child，child 完成后父 Run 被重新排队，下一次 `runNext()` replay 父脚本并取得 child result；timeout、取消传播和 completion consumer 后置。

### 已执行

- `WorkflowRunRecord` 增加 `waitingKind` 和 `waitingRef`：
  - `signal` + signal ref；
  - `child_workflow` + child Run ID；
  - `waitingSignal` 继续保留为 signal 兼容/UI 字段。
- Prisma schema 增加 `WorkflowRun.waitingKind`、`WorkflowRun.waitingRef`。
- 新增 migration：

```text
20260808230000_workflow_waiting_reason
```

- `WorkflowWaitingError` 改为 kind/ref 合同，并兼容旧 signal-only 构造。
- `startChildWorkflowStep` 增加 `wait`：
  - wait false → child StepRun running；
  - wait true → child StepRun waiting。
- `RuntimeContext.startChildWorkflow(wait:true)`：
  - 首次调用创建 queued child 并抛出 child waiting；
  - child StepRun succeeded 时返回保存的 result；
  - child StepRun failed/cancelled 时抛出业务错误。
- `completeRun` 的 InMemory/Prisma 实现：
  - child terminal close 与父 StepRun propagation 同一边界；
  - 父 Run 正等待同一 child 时清除 waiting fields 并置 queued。
- 父脚本通过 `runNext()` replay：
  - success child → parent succeeded；
  - failed child → parent failed；
  - 不重复创建 child Run。
- 原有 Signal wait 测试继续通过。

### 首次失败与修复

- 首次 focused test 发现 `updateRun(status=waiting)` 把 waiting 当 terminal，清除了新 waiting kind/ref。
- 修复为：
  - `waiting`：释放 Run lease，但保留 waiting kind/ref；
  - `succeeded/failed/cancelled`：释放 lease 并清除 waiting kind/ref。
- InMemory 还因保留旧 lease token，导致 requeued parent 被 `claimNextRun()` 排除；同步修复后 focused tests 通过。
- 原有“wait:true 必须失败”的旧测试已更新为 waiting 合同。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、39 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run test`：通过，16 个测试文件、97 个测试通过。
- 隔离 `COSMOS_DATA_ROOT` 下 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- Round 24 涉及的两个 Markdown 文件代码围栏、文件末尾换行和相对链接检查通过。

### 结论

- child wait 不应复用 signal 字段表达；至少需要 waiting kind/ref，才能区分 Signal、child completion 和未来其它等待来源。
- 父 Run 只有在等待 ref 精确匹配 child ID 时才可被 completion requeue，避免 child 完成误唤醒无关父 Run。
- child success/failure 的父脚本 replay 是同一个 Workflow Definition 的恢复，不需要第二套 child runtime。
- waiting Run 重新排队必须清除旧 Run lease，否则调度器会把它视为仍被旧 Worker 持有。

### 偏差与限制

- 当前 child completion 传播发生在 child terminal close transaction 内，还没有独立 DomainEvent/Outbox/consumer。
- 没有 timeout、parent/child cancel propagation、retry、budget/递归深度和死信合同。
- `updateRun(status=terminal)` 旁路仍可能绕过 child propagation，Application Command 收口后置。
- 生产 `apps/worker` 尚未注册 Workflow Definition 或接入 `WorkflowWorkerLoop`。

### 下一步

- 为 child completion 增加 DomainEvent/Outbox 和跨进程 consumer。
- 定义 timeout、cancel、retry、budget 和递归深度传播。
- 接入一个真实 Knowledge/Research Workflow，验证 wait child 与外部 Action 的组合。

## Round 25 — Workflow terminal DomainEvent/Outbox

日期：2026-08-09

### 目标

让每个 Workflow terminal close 都产生可持久观察的 `workflow.run.terminal` DomainEvent 和 Outbox message，为未来跨进程 child completion consumer、SSE 和审计提供事实来源。

### 已执行

- `completeRun()` 增加 terminal event：
  - type：`workflow.run.terminal`；
  - version：`v1`；
  - idempotency key：`workflow-run:<runId>:terminal`；
  - payload：Run ID、status、output、error、parentRunId。
- InMemory Store：
  - terminal Run、父 StepRun propagation 和 terminal event/outbox 同一状态边界；
  - event sequence 与 Outbox sequence 共享同一顺序源。
- Prisma Store：
  - terminal Run、父 StepRun propagation、DomainEvent 和 WorkflowOutboxMessage 同一 transaction；
  - 已存在 terminal event 时不重复创建。
- 更新既有 waiting workflow 断言：
  - 显式业务事件仍存在；
  - terminal 生命周期事件随后存在；
  - 两个 Outbox message 都是 pending。
- child wait 测试增加 terminal event/output 查询断言。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts`：通过，2 个测试文件、39 个测试通过。

### 结论

- Workflow terminal close 是领域可观察事实，不能只靠 Run.status 查询推断，否则跨进程 consumer 无法可靠恢复。
- 业务事件与生命周期事件是两种不同事实：业务事件表示 Workflow 内部 emit，terminal event 表示 Run 已收口；两者都需要持久 Outbox。
- terminal event 必须和 Run terminal close 在同一 transaction，否则会出现 Run 已 succeeded 但没有可消费终态事件的裂缝。
- 固定 idempotency key 能防止重试/恢复过程中产生重复 terminal event。

### 偏差与限制

- 当前还没有 terminal event consumer；跨进程父 Run 唤醒仍未验证。
- payload 是动态 JSON，没有 schema registry、retention、dead-letter、签名或敏感字段筛选。
- terminal event 不能表达外部 Action 的未知结果；外部副作用仍需要 receipt/幂等合同。
- direct `updateRun(status=terminal)` 旁路仍绕过 terminal event，需要统一 Application Command。

### 下一步

- 为 `workflow.run.terminal` 增加 Consumer Definition/Binding 和 parent wake consumer。
- 定义 event payload schema/version、retention、dead-letter 和 `snapshot_required`。
- 将 terminal event 接入 SSE/审计，但保持领域状态表为事实来源。

## Round 26 — 修正 terminal event 后的固定 Ingest 测试合同

日期：2026-08-09

### 目标

消除 Round 25 引入 terminal event 后遗留的旧测试假设，并重新取得完整验证证据。

### 发现

第一次执行：

```text
bun run test -- --reporter=dot
```

结果为 16 个测试文件中 15 个通过、96/97 个测试通过。失败位置是
`packages/application/src/workflow-ingest.test.ts`：测试仍把 Run 事件数量写死为 1。

Round 25 的 Runtime 语义已经要求成功 Run 同时产生：

1. `ingest.page.persisted` 业务事件；
2. `workflow.run.terminal` 生命周期事件。

因此问题是测试合同未同步，而不是 terminal event 被重复写入。

### 变更

- 更新固定 Ingest 测试，断言两个事件的顺序和类型。
- 更新 Outbox 断言，确认业务事件和 terminal event 均为 `pending`。
- 保留 replay 断言，确保修正测试没有改变 Action journal replay 行为。

### 验证

- `bun run test -- packages/application/src/workflow-ingest.test.ts packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：3 个测试文件、40 个测试通过。
- `bun run test -- --reporter=dot`：16 个测试文件、97 个测试通过。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

Workflow Run 的 terminal event 是独立的生命周期事实；固定 Ingest 只发一个业务事件的旧断言必须显式区分这两类事件。Round 25/26 的事件合同和现有 focused/full test 基线已重新对齐。

### 未完成

- 没有 terminal event consumer，跨进程 parent wake 仍未验证。
- 没有 timeout、cancel propagation、retry/dead-letter、budget 或递归深度合同。
- 生产 `apps/worker` 尚未注册 Workflow Definition 或接入 `WorkflowWorkerLoop`。

## Round 27 — Outbox 驱动的跨进程 parent wake

日期：2026-08-09

### 目标

把 child Workflow 完成后的父级传播从 `completeRun()` 的 child transaction 中拆出，验证 terminal Outbox 可以由独立进程消费，并在重试后安全恢复父 Run。

### 设计决定

本轮固定以下分层：

```text
WorkflowStore.completeRun()
  = child Run terminal close + terminal DomainEvent/Outbox

WorkflowTerminalParentWakeConsumer
  = terminal event handler + parent StepRun/Run projection
```

父级传播不再是 child `completeRun()` 的隐式副作用。这样 child Worker、Outbox Consumer 和 parent Worker 可以是不同进程；真实状态仍以 WorkflowRun/StepRun 表为准。

### 实现

- 在 `WorkflowStore` 增加 `propagateChildWorkflowTerminal()`：
  - 读取 child Run 的持久终态；
  - 校验 terminal event 声明的 child/parent 关系；
  - 按 child ID 找到父 `child_workflow` StepRun；
  - 收口 StepRun；
  - 父 Run 只有在 `waitingKind=child_workflow` 且 `waitingRef=childRunId` 时才 requeue。
- 增加 `workflowRunTerminalEventPayloadSchema`，固定 `workflow.run.terminal@v1` 的最小 payload。
- 增加 `handleWorkflowRunTerminalEvent()` 和 `WorkflowTerminalParentWakeConsumer`：
  - 只消费 terminal event；
  - 无父级 terminal event 只 ack；
  - payload run mismatch 作为 terminal consumer error；
  - handler 已提交后 ack 丢失时允许 Outbox retry。
- InMemory/Prisma 都实现同一幂等命令；第二次处理已收口的 child 不会重复修改父状态。
- 更新 InMemory/Prisma child completion 测试，显式先观察 parent 仍 waiting，再运行独立 consumer。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、40 个测试通过。
- `bun run test -- --reporter=dot`：16 个测试文件、98 个测试通过。
- `bun run typecheck:packages`：通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。
- retry 测试：第一次 handler 在父状态提交后抛出 `WorkflowOutboxRetryableError`，消息进入 `retry_wait`；第二次投递成功 ack，父状态保持单次收口。
- Prisma 幂等测试：重复调用 `propagateChildWorkflowTerminal()` 返回 `stepUpdated=false`、`parentRequeued=false`。

### 结论

- `workflow.run.terminal` 是 child terminal close 的 durable 事实；parent wake 是基于该事实的异步协调操作。
- Outbox delivery 的“业务状态提交”和“ack 成功”不是一个原子操作，必须接受重复投递并让 handler 幂等。
- Consumer 不应把 Event payload 当作唯一事实；payload 只提供路由和一致性校验，child Run 的 output/error/status 从 Store 读取。

### 未完成

- 尚未把 parent-wake consumer 接入 `apps/worker` supervisor、lane、heartbeat 和 registry binding。
- 尚未做真实跨进程 restart/reclaim smoke；当前是共享 Store 的独立 Consumer 实例测试。
- 尚未实现 timeout、cancel propagation、child retry/dead-letter、budget、递归深度、Fan-in/Join。
- terminal event payload 尚无正式 schema registry、retention、签名和敏感字段筛选。
- `updateRun(status=terminal)` 仍可绕过 terminal Event/Outbox，需后续统一 terminal Application Command。

## Round 28 — 统一 terminal Application Command 与取消 fencing

日期：2026-08-09

### 目标

消除 `updateRun(status=terminal)` 旁路，确保成功、失败和取消都经过明确的 terminal Application Command，并防止用户取消后旧 Worker 继续写入。

### 实现

- 新增 `WorkflowStore.cancelRun()`：
  - 取消 queued/running/waiting Run；
  - 清理 waiting 字段和 orchestration lease；
  - 写入 `workflow.run.terminal@v1` Event/Outbox；
  - 重复调用保持幂等。
- `WorkflowRuntime.cancel()` 改用 `cancelRun()`。
- InMemory/Prisma `updateRun()` 拒绝 terminal status patch，要求调用 `completeRun()` 或 `cancelRun()`。
- Prisma 把 terminal event/outbox 创建抽成 transaction helper，由 `completeRun()` 和 `cancelRun()` 共用。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、42 个测试通过。
- `bun run test -- --reporter=dot`：16 个测试文件、100 个测试通过。
- 取消后旧 lease 调用 `completeRun()`：InMemory/Prisma 均被 `WorkflowLeaseLostError` 拒绝。
- 重复取消：Event 数量保持为 1。
- terminal `updateRun()`：两种 Store 都拒绝并要求使用 terminal Application Command。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

terminal 状态变更会产生生命周期事件和外部可观察副作用，不能继续作为普通 `updateRun` patch。取消必须清理 lease，才能建立“用户取消后旧 Worker 不得覆盖结果”的 fencing 不变量。

### 未完成

- 尚未做 cancel 与 child wait、Action Job lease、Worker restart/reclaim 的组合测试。
- 尚未实现主动 parent/child cancel propagation。
- `WorkflowRuntime.cancelledRuns` 仍保留进程内快速提示，未抽象为持久 cancellation request。
- 生产 Worker 尚未接入 parent-wake Consumer 和统一 Run Control supervisor。

## Round 29 — child cancellation 的 parent wake 与 replay

日期：2026-08-09

### 目标

验证取消可以复用 terminal Event/Outbox 和 parent-wake Consumer 链路，驱动等待父 Workflow 恢复，并得到明确的父级终态。

### 已执行

- InMemory/Prisma 注册 `wait:true` parent 与 child。
- parent 首次执行进入 `waiting`，child 保持 `queued`。
- 调用 `runtime.cancel(childRunId)`，确认 child 通过 `cancelRun()` 进入 `cancelled`，写入 `workflow.run.terminal@v1`。
- 在 parent-wake Consumer 处理前，父 Run 仍是 `waiting`，父 `child_workflow` StepRun 仍是 `waiting`。
- Consumer 处理 child terminal event 后：
  - StepRun 变为 `cancelled`；
  - output/error 保留 child ID 和 `"Workflow cancelled."`；
  - 父 Run 变为 `queued`。
- 父 Runtime replay 读取已收口 StepRun，最终父 Run `failed`，错误为 child cancellation。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、43 个测试通过。
- `bun run test -- --reporter=dot`：16 个测试文件、101 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，12 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

child cancellation 不需要新的父子传播通道：它是 terminal Run 事实的一种状态，沿同一 Outbox parent-wake 机制传播。Store 只负责投影和 requeue，父 Workflow 如何解释取消由脚本 replay 决定。

### 未完成

- 尚未实现 parent → child 主动级联取消。
- 尚未定义立即取消、优雅停止、补偿、降级继续等 cancellation policy。
- Action Job 运行中被取消时，外部副作用停止/receipt/补偿仍未闭合。
- 尚未做真实跨进程 restart/reclaim smoke。

## Round 30 — durable Workflow deadline 与 timeout sweep

日期：2026-08-09

### 目标

验证 Workflow timeout 不依赖进程内 timer，而是由持久 deadline 和 Runtime/Worker tick 驱动；进程重启后仍能从 SQLite 识别并收口过期 Run。

### 审查结论

原有 `WorkflowRun` 只有 orchestration lease expiry，没有业务 deadline：

- `waiting` Run 没有任何自动终止条件；
- `runNext()` 只扫描 queued/expired running，不扫描业务过期；
- Action/Workflow 在 deadline 后仍可能通过 `completeRun()` 写成功。

本轮采用最小可逆语义：新增 `deadlineAt`，timeout 先以 `failed + "Workflow deadline exceeded."` 表达，不冻结新的 `timed_out` 状态。

### 实现

- `WorkflowRunRecord`/Prisma `WorkflowRun` 增加 `deadlineAt`。
- `CreateWorkflowRunInput` 增加 `deadlineAt`；`WorkflowRuntime.start()` 增加 `timeoutMs`。
- `WorkflowStore.expireDueRuns({now, limit})` 在 InMemory/Prisma 实现：
  - 扫描 queued/running/waiting 到期 Run；
  - 清理 waiting/lease；
  - 收口 failed；
  - 写 terminal Event/Outbox；
  - 使用状态 + deadline CAS，允许多个 Worker 安全竞争。
- `runNext()` 和 `executeRun()` tick 前执行 sweep。
- `completeRun()` 发现当前 Run deadline 已到时，拒绝迟到输出，返回 deadline failure。
- 添加 `20260809000000_workflow_run_deadline` migration 和索引。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、46 个测试通过。
- InMemory waiting deadline：到期后 `runNext()` 返回 idle，持久 Run 为 failed，terminal Event 存在。
- InMemory running deadline：迟到 `completeRun(status=succeeded)` 变为 deadline failure，Event 保持单条。
- Prisma waiting deadline：同一 Runtime tick 语义通过。
- `bun run test -- --reporter=dot`：16 个测试文件、104 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

deadline 是 Run Control 的持久事实；timeout sweep 是可重入 Store Command。清 lease 后，旧 Worker 的迟到结果不能覆盖 timeout terminal close。父级传播不新增通道，仍走 terminal Outbox/parent-wake。

### 未完成

- Action 过期后的外部副作用停止、receipt、补偿和 unknown-result 尚未实现。
- 尚无独立 timeout supervisor、指标和 dead-letter。
- deadline 不能动态修改，也未向 child Run 传播。
- timeout 暂用 failed 状态，没有 terminationReason/timed_out 查询合同。
- 尚未做真实 Worker restart/reclaim smoke。

## Round 31 — Workflow terminal 与 Action Job fencing

日期：2026-08-09

### 目标

验证 Run terminal close 后，Action Job 不会继续把迟到结果写入 Invocation/StepRun；同时让 cancel/timeout 统一清理 Cosmos 内部 Job 状态。

### 审查

原有 Job 有自己的 lease，但 `completeJob()`/`failJob()` 只检查 Job lease/token，不检查父 Run 是否已经 terminal。这样存在窗口：

```text
Action Job leased
→ cancelRun/timeout Run
→ 旧 Action 返回
→ completeJob 仍可能写 succeeded
```

### 实现

- InMemory/Prisma 的 terminal close 都取消本 Run 的 queued/leased/retry_wait Job。
- 同步收口关联 `WorkflowActionInvocation` 和 Action `WorkflowStepRun` 为 `cancelled`，清理 Job lease/retry 字段。
- `claimJob()` 对已知 terminal/deadline Run 返回 null。
- `completeJob()`/`failJob()` 对已知 terminal/deadline Run 返回 false。
- timeout sweep、`cancelRun()`、普通 terminal `completeRun()` 共用同一取消边界。

### 首次失败与修复

第一次 focused test 把 Job claim 限制为 `Run.status=running`，导致：

- Prisma 既有基础测试在 queued Run 上直接验证 Job 时 claim 失败；
- InMemory stale Job 历史 fixture 没有创建对应 Run 时 claim 失败。

修复为：对已知 Run 只拦截 terminal/deadline 状态；保留非 terminal Run 的低层 Job Port 合同。orphan InMemory fixture 仍是历史 spike 边界，Application 层尚需补存在性约束。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、48 个测试通过。
- 取消/timeout 后旧 `completeJob()`、`failJob()`：InMemory/Prisma 均返回 false。
- 取消/timeout 后新的 `claimJob()`：返回 null。
- Invocation/Action StepRun：保留 cancelled 状态和错误。
- `bun run test -- --reporter=dot`：16 个测试文件、106 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

Run lease fencing 不能单独保护 Action Job；Job 还必须看父 Run 的 durable terminal/deadline 状态。Cosmos 内部状态可以阻止迟到写入，但不能回滚已经发生的外部副作用，因此 receipt/补偿仍是后续边界。

### 未完成

- 没有 Action cancellation token/abort port，正在运行的用户代码只能在返回时被拒绝提交。
- 外部副作用 receipt、unknown-result、补偿和真正的幂等协议尚未实现。
- InMemory 仍允许历史 orphan Invocation/Job fixture。
- 尚未做 Job retry takeover、Worker restart/reclaim 和 cancellation 的组合 smoke。

## Round 32 — apps/worker 的 Workflow parent-wake wiring

日期：2026-08-09

### 目标

把已验证的 terminal Outbox/parent-wake Consumer 接入服务器 Worker 入口，同时不让未注册的 Workflow Definition 被生产 Worker 误领取。

### 审查结论

现有 `apps/worker` 只运行固定 `IngestionWorker`：

- 使用 `PrismaCosmosRepository` 的旧 `Run/Job` Application Port；
- 没有 `WorkflowRuntime`、Workflow Definition Registry 或 terminal Outbox Consumer；
- heartbeat 只表示整个进程 ready。

### 实现

- Application 层新增 `WorkflowParentWakeWorker`，只负责 poller 调用和结构化日志。
- `apps/worker` 复用 `repository.prisma` 创建 `PrismaWorkflowStore`，再创建 `WorkflowTerminalParentWakeConsumer`。
- parent-wake 使用独立 consumer ID 和 owner：
  - `COSMOS_WORKFLOW_PARENT_WAKE_CONSUMER_ID` 可配置；
  - owner 为 `<instanceId>:workflow-parent-wake`。
- 每个 poll 先跑 parent-wake，再跑固定 Ingest；parent-wake 失败只记录并继续 Ingest。
- 没有把 `WorkflowWorkerLoop.runNext()` 接入生产，因为当前没有真实 Definition/Action Registry。

### 验证

- `bun run test -- packages/application/src/index.test.ts --reporter=dot`：1 个测试文件、6 个测试通过。
- `bun run typecheck:apps`：API、Worker、Web 通过。
- 共享连接审查：Workflow Store 使用 `PrismaCosmosRepository.prisma`，没有第二个 Prisma/Data Root。
- `bun run test -- --reporter=dot`：16 个测试文件、107 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

terminal parent-wake 是可以先生产化的 durable projection consumer；完整 Workflow execution 仍需要 Definition/Action Registry、admission/lane、独立 heartbeat 和 supervisor 合同。

### 未完成

- 每个 poll 最多处理一个 terminal event，没有独立 consumer lane/backpressure。
- 没有 Consumer Registry binding/version 激活。
- 没有 Workflow Run worker heartbeat，也没有 timeout sweep 独立指标。
- 尚未做 Docker、restart/reclaim、真实 terminal event 的生产验收。

## Round 33 — parent-wake Definition/Binding Registry 激活

日期：2026-08-09

### 目标

把 `apps/worker` 的 parent-wake Consumer 从进程内硬编码配置提升为持久 Definition/Binding 合同，避免启动覆盖已持久的 lease/retry 配置，也避免 disabled binding 被自动恢复。

### 实现

- 新增 `workflow.parent-wake@1` 不可变 Definition：
  - 消费 `workflow.run.terminal`；
  - 固定 lease/retry policy；
  - 变更必须通过新 version。
- 新增 `createWorkflowTerminalParentWakeConsumerFromRegistry()`：
  - 读取 binding；
  - 拒绝 missing/disabled binding；
  - 解析 Definition version 后创建 specialized Consumer。
- `apps/worker` 启动时：
  - 注册 Definition；
  - 缺失 binding 时创建 enabled binding；
  - 已有 disabled binding 保持 disabled；
  - 不用旧 Ingest `leaseMs` 覆盖 Definition lease。

### 过程偏差与修复

第一次接线尝试把当前进程的 `COSMOS_WORKER_LEASE_MS` 写进 `workflow.parent-wake@1`，这会在重启时与已持久 Definition 内容冲突。修复为 Definition 内容不可变，运行时只使用 Registry 解析结果；配置变更改走新 Definition version。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`：1 个测试文件、30 个测试通过。
- enabled/disabled binding focused assertions：通过。
- `bun run typecheck:apps`：API、Worker、Web 通过。
- 本轮没有新增 Prisma migration。
- `bun run test -- --reporter=dot`：16 个测试文件、108 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

Definition 是不可变协议，Binding 是可变部署状态。Worker 可以初始化缺失 binding，但不应替用户启用 disabled binding；lease/retry 也不能由每次进程启动临时覆盖。

### 未完成

- 还没有其他 Consumer 的生产 binding/activation。
- 没有 activation audit、灰度、rollback 或 supervisor diagnostics。
- 未注册旧 Definition version 会使对应 binding 无法激活，启动诊断仍需补齐。
- 没有完整 Workflow Definition/Action Registry，`WorkflowWorkerLoop` 仍未接入 apps/worker。

## Round 34 — Action Invocation 的父 Run existence fencing

日期：2026-08-09

### 目标

消除 InMemory/Prisma 对 orphan Action Invocation/Job 的差异，确保 Action 只能绑定存在且仍可执行的 Workflow Run。

### 实现

- InMemory/Prisma `ensureActionInvocation()` 统一校验：
  - 父 Run 存在；
  - 父 Run 非 terminal；
  - 父 Run deadline 未到。
- 修正 stale Job 历史 fixture，显式创建 `run-1`。
- 非 terminal queued/waiting Run 的低层 Job Port 兼容保留；正常 Runtime 路径仍从 running Run 进入。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`：2 个测试文件、49 个测试通过。
- missing Run：InMemory/Prisma 均拒绝。
- cancelled Run：InMemory/Prisma 均拒绝新 Invocation。
- Action Job lease/retry/replay 既有测试通过。
- `bun run test -- --reporter=dot`：16 个测试文件、108 个测试通过。
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web。
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。
- `bun run db:validate`：通过。
- `bun run db:generate`：通过。
- 隔离 `COSMOS_DATA_ROOT` 执行 `bun run db:migrate`：通过，13 条 migration 全部应用。
- `git diff --check`：通过。
- 两个 Workflow Task Markdown 文件：代码围栏为偶数、末尾换行存在、相对链接无缺失。

### 结论

父关系必须在 Invocation 创建边界建立，不能等 Job claim 才校验。InMemory 与 Prisma focused store 必须保持相同存在性语义，否则测试会产生错误安全感。

### 未完成

- 没有历史 orphan 数据 repair/migration。
- 没有完整性扫描 orphan Invocation/Job/StepRun。
- Action receipt、cancellation port、unknown-result 仍未闭合。

## Round 35 — Workflow integrity audit

日期：2026-08-09

### 目标

在继续扩展 Workflow Runtime 之前，增加一个只读完整性审计，确认持久化关系损坏和 terminal Run 泄漏能够被发现，而不是只依赖正常 Application Command 路径维持一致性。

### 过程

1. 先核对上一轮留下的 Prisma corruption fixture，确认测试补丁已经落盘。
2. 比较 InMemory 与 Prisma Store 的审计输入，统一 issue kind、排序和 terminal/active 判定。
3. 明确 `child_workflow` 的异步等待例外：父 Run terminal 时，子 Run 可能尚未 terminal，父级 child StepRun 仍是合法的 parent-wake 中间状态。
4. 保持 audit 只读，不在扫描中删除、重建或推进任何实体。
5. 用测试专用 corruption fixture 分别制造 terminal active work 和 orphan 关系，验证两种 Store 都能报告。

### 实现

- `packages/workflow-runtime/src/index.ts`
  - 增加 `WorkflowIntegrityIssueKind`、`WorkflowIntegrityIssue` 和 `WorkflowIntegrityReport`。
  - InMemory `auditIntegrity()` 检查 Invocation、Job、StepRun、Run 的关系和终态。
  - 输出稳定排序的结构化 issue。
- `packages/storage-prisma/src/workflow-store.ts`
  - 批量读取 Run、Invocation、StepRun 和 Job。
  - 用与 InMemory 一致的规则检查孤儿关系、跨实体关联和 terminal active work。
- `packages/workflow-runtime/src/index.test.ts`
  - 正常状态报告零 issue。
  - terminal Run 保留 active Job/StepRun 时报告 `terminal_run_active_job` 和 `terminal_run_active_step`。
  - 删除内部 Run 后报告 orphan Invocation、Job、StepRun。
- `packages/storage-prisma/src/workflow-store.test.ts`
  - 使用 Prisma model 和受控 foreign-key 关闭 fixture 制造同类损坏状态。
  - 验证数据库 Store 的报告与 InMemory Store 一致。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`
  - 2 个测试文件、51 个测试通过。
- 本轮 focused test 已通过；full test、typecheck、build、migration 和 Markdown 检查待本轮后续完成。

### 设计结论

- integrity audit 是诊断能力，不是 repair policy。
- terminal Run 的非 child active StepRun 是异常；child Workflow 尚未完成造成的等待是合法状态。
- 新建 Invocation 的 fencing 只能阻止继续产生 orphan，不能替代历史数据审计。

### 未完成与风险

- 尚未定义历史 orphan 的自动修复安全边界。
- 尚未把 audit 接入启动诊断、维护 CLI、API 或指标。
- 当前是全表扫描，后续需要评估大数据量下的分页和索引策略。

## Round 36 — 父子 Workflow 的级联取消

日期：2026-08-09

### 目标

验证父 Run 的取消和 deadline timeout 是否会留下继续运行的子 Workflow。目标是让取消成为一条 durable Run Control 树级命令，同时保持正常的 fire-and-forget child 不因父级成功而被误取消。

### 合同决定

- `cancelRun(parent)` 递归取消所有非终态后代：`queued`、`running`、`waiting`。
- 后代已经 terminal 时保持原结果和错误，不被父取消覆盖。
- 父 deadline 根 Run 仍是 `failed`；后代是 `cancelled`，错误中保留父 Run 标识。
- 每个被取消的 Run 都写入自己的 terminal Event/Outbox；terminal idempotency key 防止重复取消重复发事件。
- 后代按深度优先处理，根 Run 最后写 terminal event。
- `completeRun(succeeded/failed)` 不做级联，保留非等待 child 的异步语义。

### 实现过程

1. 在 InMemory Store 中增加后代树索引构建、cycle guard、深度优先排序和后代 terminal close。
2. 在 Prisma Store 中增加同一 transaction 内的后代收口：
   - 先由状态条件更新根 Run；
   - 全量读取 lineage 后构建后代顺序；
   - 逐个 `updateMany` fencing 非终态后代；
   - 取消后代 Job/Invocation/Action StepRun；
   - 为每个成功更新的后代写 terminal Event/Outbox。
3. 将同一后代取消 helper 接入 deadline `completeRun` 和 `expireDueRuns`。
4. 增加 InMemory/Prisma 组合 fixture：
   - 父 → 子 → 孙三层；
   - 子有 leased Action Job；
   - 父取消后验证所有后代终态；
   - stale child completion 被拒绝；
   - 重复取消不增加 Event；
   - 父 deadline 失败、后代取消且各自有 terminal Event。

### 过程中发现的问题

第一次 focused test 使用 `now=100` 创建 InMemory lease，但 `updateRun()` 的既有低层合同用真实 `Date.now()` 判断 lease 是否过期，导致 fixture 立即触发 `WorkflowLeaseLostError`。这不是生产逻辑回归；修复测试统一使用 `Date.now()` 时间基准后通过。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`
  - 2 个测试文件、55 个测试通过。
- 本轮 focused test 已通过；full test、typecheck、build、migration 和 Markdown 检查待本轮后续完成。

### 设计结论

父子关系不是只有展示用途；它直接决定取消、deadline、资源回收和 parent-wake 的执行边界。Cosmos 应持有树级 durable truth，Action 自己仍需要提供外部取消、幂等或补偿能力。

### 未完成与风险

- 当前 Prisma lineage 收集是全表扫描，尚未做分页/递归查询/专门索引。
- 跨进程 Action 不能即时收到取消信号；旧 Worker 只能在提交时被 fencing。
- 已经 terminal 的父 Run 不会在 `cancelRun()` 中主动修复 active 后代，需由 integrity audit/后续 repair policy 处理。

## Round 37 — Action effect receipt 与 unknown-result

日期：2026-08-09

### 目标

把外部 Action 的“调用已经开始，但 Cosmos 不知道副作用是否发生”从普通 Job error 中分离出来，形成可持久、可重连、可供后续 reconciliation 使用的事实记录。

### 合同决定

- `ActionDefinition.effectMode` 目前只有 `"none"` 和 `"external"`。
- `external` Action 每次 Job attempt 自动写 `started` Receipt。
- Action 返回成功前必须写 `committed`，无法确定时写 `unknown`。
- `unknown` 和 `committed` 都阻止本次 Action 进入自动 retry；当前 Job 终态仍分别使用既有 `failed_terminal`/`cancelled`，不新增 Job status。
- Receipt 的唯一键是 `(jobId, attempt)`；stable business idempotency key 继续使用 `${runId}:${path}`。
- stale worker 不能把已 `committed` 的 Receipt 降级为 `unknown`。
- Run/Job cancellation 会把未收口的 `started` Receipt 转成 `unknown`。

### 实现

- `packages/workflow-runtime/src/index.ts`
  - 增加 Receipt status/type、Action effect mode 和 Store Port。
  - InMemory Store 实现 Receipt ownership 校验、单调迁移、查询和取消转换。
  - Runtime Action context 暴露 `jobId`、`idempotencyKey`、`attempt` 和 `recordReceipt()`。
  - effectful Action 成功未提供 terminal Receipt 时，Runtime 保守记录 `unknown` 并停止 retry。
  - effectful Action 抛错后，started Receipt 转 unknown，避免盲目重试外部副作用。
  - integrity audit 增加 Receipt orphan/mismatch 检查。
- `packages/storage-prisma/prisma/schema.prisma`
  - 新增 `WorkflowActionReceipt`，关联 Run/Invocation/Job。
- `packages/storage-prisma/prisma/migrations/20260809100000_workflow_action_receipts/migration.sql`
  - 新增 Receipt 表、唯一约束和查询索引。
- `packages/storage-prisma/src/workflow-store.ts`
  - Prisma Store 实现 Receipt 写入、单调迁移、查询、取消转换和完整性审计。
- 测试：
  - InMemory effectful Action 成功与 unknown timeout；
  - Prisma started → unknown → committed；
  - Prisma cancel 将 started 转 unknown；
  - stable key、attempt 和 stale completion/retry fencing。

### 过程中的断言修正

测试最初把显式 Action key `"publish"`误写成 `"action:publish"`，并把幂等键误写成 `${runId}:action:publish`。代码合同是：

```text
显式 path = "publish"
idempotencyKey = "${runId}:publish"
```

修正测试后 focused test 通过。这次修正也确认了内部默认 sequence 命名不能泄漏为显式业务 path 合同。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`
  - 2 个测试文件、57 个测试通过。
- 本轮 full test、typecheck、build、migration 和 Markdown 检查待本轮后续完成。

### 设计结论

Job 记录的是 Cosmos 对执行尝试的调度与收口；Receipt 记录的是外部副作用证据。两者必须关联但不能合并，否则未知外部结果会被普通 retry policy 错误地当作可安全重试。

### 未完成与风险

- committed Receipt 后 stale Job 不能自动将 result 重新绑定到 Invocation；需要外部查询或 reconciliation workflow。
- 没有真正的补偿执行器、abort signal、Receipt API/SSE projection。
- 当前 Prisma Store 的 receipt/lineage 审计仍是全表扫描。

## Round 38 — Committed Receipt reconciliation

日期：2026-08-09

### 目标

验证 committed Receipt 在旧 Worker 失去 Job lease后是否能安全恢复内部结果，同时阻止旧 attempt 覆盖新 Worker 已接管的 attempt。

### 合同决定

- 只接受 `committed` Receipt。
- Run terminal/deadline、Job cancelled、active Job lease 都拒绝 reconciliation。
- Receipt attempt 必须等于当前 Job `attempts`；不相等返回 `attempt_superseded`。
- 首次应用原子更新 Job、Invocation、Action StepRun；重复调用返回 `already_applied`。
- Reconciliation 不自动查询外部平台，也不重试外部副作用。

### 实现

- `packages/workflow-runtime/src/index.ts`
  - 新增 reconciliation reason schema、输入/结果类型和 Store Port。
  - InMemory Store 实现结果判断、attempt fencing 和内部状态收口。
- `packages/storage-prisma/src/workflow-store.ts`
  - 在单 transaction 内读取 Receipt/Job/Invocation/Run；
  - 用 `attempts + status + expired lease` 条件执行 `updateMany`；
  - CAS 失败返回明确 reason，不覆盖新 Worker。
- 测试：
  - InMemory expired lease → applied → already_applied；
  - InMemory attempt 1 Receipt 在 attempt 2 接管后被拒绝；
  - Prisma expired lease → applied → already_applied。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`
  - 2 个测试文件、58 个测试通过。
- 本轮 full test、typecheck、build、Markdown 检查待本轮后续完成。

### 设计结论

Receipt recovery 不能隐藏在 retry policy 里。它是一个带明确 attempt/lease/Run control 条件的维护命令，适合后续包装成 maintenance Workflow，并通过事件和审计留下人工/Agent 可追踪的记录。

### 未完成与风险

- 目前仍是 Store-level command，没有 maintenance Workflow、API、CLI 或结果事件。
- 外部查询得到 committed Receipt 的过程没有统一 Action/Connector 合同。
- 如果 attempt 已 supersede，系统只能进入新的查询/补偿流程，不能自动推断旧结果是否可复用。

## Round 39 — Action AbortSignal 与跨进程取消提示

日期：2026-08-09

### 目标

让正在执行的 Action 收到可组合的停止信号，并验证本进程取消与另一个 Runtime 取消的差异：前者可以直接通知，后者必须由 Job heartbeat 发现 durable lease 已失效。

### 合同决定

- `ActionExecutionContext.signal` 是标准 `AbortSignal`。
- `WorkflowRuntime.cancel(runId)` 立即 abort 本 Runtime 里该 Run 的 active Action。
- Job heartbeat 的 `renewJob=false` 或异常也会 abort signal，覆盖远程 Worker/Runtime 的取消。
- `isCancelled()` 与 signal 同步；signal 只提供 cooperative cancellation，不授予 durable commit 权限。
- 旧 Action 即使忽略 signal，`completeJob/failJob/completeRun` 仍会被 lease fencing 拒绝。

### 实现

- `WorkflowRuntime` 新增 `runId → AbortController[]` 注册表。
- `RuntimeContext.callAction()`：
  - 创建并注册 controller；
  - 将 signal 注入 Action；
  - heartbeat renew 失败时 abort；
  - finally 注销 controller。
- `WorkflowRuntime.cancel()` 在持久 cancel 前先 abort 本进程 Action。
- 没有新增 schema/migration。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`
  - 1 个测试文件、37 个测试通过。
- 覆盖同进程即时 abort、不同 Runtime 通过 heartbeat 传播 abort，以及 cancellation 后旧执行不能完成。
- full test、typecheck、build、Markdown 检查待本轮后续完成。

### 设计结论

AbortSignal 与 lease fencing 是两条互补链路：AbortSignal 负责尽快减少无效工作，lease fencing 负责最终正确性。任何 Connector/Adapter 都不能只依赖其中一条。

### 未完成与风险

- 父级级联取消不会主动跨进程枚举所有 descendant controller，后代依赖各自 heartbeat。
- 没有 abort reason、grace period、shutdown drain 或进程级强杀。
- Connector/Adapter 尚未有统一 abort port，也没有把 abort/lease_lost/unknown-result 接入 Worker Supervisor。

## Round 40 — Receipt reconciliation 的 maintenance Workflow 边界

日期：2026-08-09

### 目标

验证 Receipt reconciliation 不需要成为 API/Worker 的特殊数据库旁路，而可以作为普通的版本化 maintenance Workflow/Action 被其他 Workflow 组合。

### 合同决定

- Action：`cosmos.receipt.reconcile@1`。
- Workflow：`cosmos.maintenance.receipt-reconcile@1`。
- 输入为 `{ receiptId, result }`，输出为 `{ receiptId, invocationId, applied, reason }`。
- Registration helper 只负责将 Definition 放入当前 Runtime；不自动修改生产 Worker 的 Definition Registry/Binding。
- 上游外部查询、Receipt committed、reconcile、通知/审计可以拆成多个 Action/Workflow step。

### 实现

- `createWorkflowReceiptReconcileAction(store, now)`：
  - 调用 Store reconciliation command；
  - 将 durable result 映射为稳定 Workflow output。
- `createWorkflowReceiptReconciliationWorkflow()`：
  - 用显式 Action path `receipt.reconcile` 调用上述 Action；
  - 具备正常 Workflow replay/Job/Step 语义。
- `registerWorkflowReceiptReconciliation()`：
  - 宿主选择性注册 Action/Workflow；
  - 保持未来持久 Definition Registry/Binding 的接缝。
- 测试用真实 InMemory Runtime 启动 maintenance Workflow，并确认原 Invocation/StepRun 被恢复。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`
  - 1 个测试文件、38 个测试通过。
- 本轮 full test、typecheck、build、Markdown 检查待本轮后续完成。

### 设计结论

这验证了一个重要边界：Cosmos 不需要为每一种维护动作再造 API 特例；只要 Action 有明确输入输出和 Store/Application Port，reconciliation、compensation、notification 都能沿同一 Workflow Runtime 演进。

### 未完成与风险

- 当前 helper 还没有持久 Definition/Binding activation。
- 外部查询 Action、Receipt result schema、DomainEvent/Outbox 结果事件仍未实现。
- maintenance lane、预算、并发/背压和审计权限仍待 Worker Supervisor 阶段统一。

## Round 41 — Workflow lane/priority 调度接缝

日期：2026-08-09

### 目标

在 Run/Job durable runtime 上验证 lane admission 和 priority ordering，避免后续把 Ingest、Research、Knowledge、Maintenance 都塞进同一个 FIFO 队列后再返工。

### 合同决定

- `WorkflowRun.lane` 默认 `"default"`。
- `WorkflowRun.priority` 默认 `0`，是 lane 内排序信号。
- `claimNextRun({ lane })` 只领取指定 lane。
- 排序是 `priority DESC → createdAt ASC → id ASC`。
- Runtime Worker 的 `options.lane` 只影响领取，不自动改变 Run 创建 lane。
- parent Workflow 创建 child 时，child 继承父 lane/priority。
- 不做 wildcard lane、跨 lane steal、fairness/aging 或 capacity policy。

### 实现

- Runtime 增加：
  - `workflowLaneSchema`/`workflowPrioritySchema`；
  - Run record/input 字段；
  - Runtime worker lane；
  - start 的显式 lane/priority；
  - child lane/priority inheritance。
- InMemory Store：
  - create 默认值；
  - `claimNextRun()` lane filter；
  - priority 稳定排序。
- Prisma Store/schema/migration：
  - `WorkflowRun.lane`；
  - `WorkflowRun.priority`；
  - lane/status/priority/createdAt 索引；
  - mapping 和 claim query。
- 新 migration：
  - `20260809110000_workflow_run_lane_priority`；
  - 总 migration 从 14 增到 15。

### 过程中的修复

第一次实现把 lane/priority 补到了 Store child create，但 RuntimeContext 没把父字段传入；继承测试发现 child 仍为 `default/0`。补齐 RuntimeContext 后，父子 lane/priority 一致。

同一轮还发现既有 Prisma lease fencing fixture 的第二 Worker 只有 100ms lease，新增测试耗时后出现真实时间过期。将 fixture 扩大到 10s，仍保留第一 Worker 10ms 过期接管断言。

### 验证

- focused：`bun run test -- packages/workflow-runtime/src/index.test.ts packages/storage-prisma/src/workflow-store.test.ts --reporter=dot`
  - 2 个测试文件、64 个测试通过。
- `bun run db:validate`、Runtime/Storage typecheck：通过。
- full test、build、migration 和 Markdown 检查待本轮后续完成。

### 设计结论

Lane 是 admission boundary，priority 是 lane 内 ordering hint。真正生产调度还必须在 Supervisor 层补 capacity、fairness、backpressure、budget 和 drain，不应继续向 `WorkflowRun` 的 priority 字段堆叠语义。

### 未完成与风险

- 高优先级持续涌入会饿死低优先级 Run。
- 没有 lane capacity、rate limit、quota、aging 或 supervisor heartbeat。
- apps/worker 尚未按 lane 建立独立执行/维护/退出生命周期。

## Round 42 — Workflow lane supervisor 接缝

日期：2026-08-09

### 目标

验证 lane/priority 之后是否可以由 Supervisor 管理多个 Workflow Worker slot，并在 stop 时完成 drain，而不把宿主调度策略塞回脚本 Workflow Runtime。

### 合同决定

- `WorkflowLaneSupervisor` 以 lane definition 创建固定 concurrency 个 `WorkflowWorkerLoop`。
- lane definition 的 lane 必须与 Runtime lane 一致。
- `tick()` 并发执行 slot；`start()` 启动各 slot poll；`stop()` 停止新 tick 并等待退出。
- 业务失败是已处理的 Workflow Run：`processed/runStatus=failed`。
- 基础设施异常才是 slot-level `error`/`lease_lost`。
- 当前只管理 Workflow loop，不接 fixed Ingest、parent-wake、heartbeat。

### 实现

- `packages/workflow-runtime/src/index.ts`
  - 新增 Supervisor status；
  - lane definition/slot result；
  - lane id、Runtime lane、concurrency、poll interval 校验；
  - bounded concurrent tick；
  - start/stop/drain。
- 测试：
  - 3 个 Run、2 个 slot 分两轮处理；
  - slot 业务失败不影响另一个成功；
  - stop 唤醒长 poll interval 并完成退出；
  - tick 观测包含 lane/slot/result。
- 没有新增 migration。

### 过程中发现的问题

第一次错误隔离测试期待 missing Workflow Definition 返回 Supervisor `error`；实际 Runtime 会把普通执行异常通过 `completeRun(failed)` 收口，所以正确结果是两个 slot 都 `processed`，RunStatus 分别为 `failed` 和 `succeeded`。这确认了业务失败与基础设施失败的两级错误合同。

### 验证

- `bun run test -- packages/workflow-runtime/src/index.test.ts --reporter=dot`
  - 1 个测试文件、43 个测试通过。
- 本轮 full test、typecheck、build、Markdown 检查待本轮后续完成。

### 设计结论

Supervisor 不拥有 Workflow 业务语义，只负责 slot 生命周期和 admission。Worker tick 的 `processed/failed` 不能与 Supervisor 自身 `error/lease_lost` 混成一个状态，否则 heartbeat、告警和重试策略会误判。

### 未完成与风险

- Supervisor 还没有统一 PollerLane Port，无法同时托管 Ingest/Outbox。
- 没有 durable slot heartbeat、全局预算、backpressure、fairness 或 drain deadline。
- 多 slot identity 尚未与 WorkerHeartbeat/metrics 绑定，也没有接入 apps/worker。

## Round 43 — 通用 Poller Lane Supervisor

日期：2026-08-09

### 目标

将宿主层 poller 生命周期从 Workflow 专用 Supervisor 中抽出来，为 fixed Ingest、Outbox parent-wake 和未来 Workflow lane 提供共同接缝。

### 合同决定

- `WorkerPollerPort.pollOnce()` 是最小 Poller 能力。
- `WorkerPollerLaneDefinition.createPoller(slot)` 负责生成带独立 owner/consumer identity 的 slot poller。
- `WorkerPollerSupervisor` 提供：
  - bounded concurrency；
  - lane/slot tick result；
  - 单 slot error isolation；
  - start/stop/drain；
  - observation callback failure isolation。
- 业务 Poller 的返回值不被 Supervisor 解释；Supervisor 只负责状态和生命周期。

### 实现

- `packages/application/src/index.ts`
  - 新增通用 Poller Port、lane config、slot state；
  - 实现手动 `tick()`；
  - 实现 start loop/timer/wake；
  - stop 时设置 slot stopping、唤醒 timer、等待当前 poll。
- `packages/application/src/index.test.ts`
  - 2 个 Supervisor 测试；
  - poller slot 0/1 identity；
  - slot 1 抛错不影响 slot 0；
  - observation callback 抛错不停止；
  - duplicate lane、invalid concurrency；
  - stop/drain。
- 没有修改生产 Worker 入口，也没有新增 migration。

### 验证

- `bun run test -- packages/application/src/index.test.ts --reporter=dot`
  - 1 个测试文件、8 个测试通过。
- 本轮 full test、typecheck、build、Markdown 检查待本轮后续完成。

### 设计结论

WorkflowLaneSupervisor 是 Workflow 专用的 admission/lease adapter；WorkerPollerSupervisor 是宿主通用生命周期。两者暂时分层保留，后续可以通过 Poller Adapter 组合，而不是让通用层知道 Workflow 领域状态。

### 未完成与风险

- 仍未把 Ingest/parent-wake/apps/worker 接到 generic Supervisor。
- 没有 durable slot heartbeat、metrics、backpressure、circuit breaker 或 drain deadline。
- 当前通用 Poller 只提供 cooperative stop，不能强制结束阻塞的外部调用。

## Round 44 — 固定 Worker 的 Poller Adapter

日期：2026-08-09

### 目标

验证固定 Ingest/Probe Worker 和 terminal parent-wake Consumer 可以实例化为通用
`WorkerPollerSupervisor` 的 lane slot，同时不把领域状态机复制到宿主层。

### 实现

- `createIngestionWorkerPollerLane()`：
  - 每个 slot 创建独立 `IngestionWorker`；
  - owner identity 固定为 `<ownerPrefix>:<laneId>:<slot>`；
  - Job claim、lease、retry、checkpoint 和 completion 仍由 `IngestionWorker`
    负责。
- `createWorkflowParentWakeWorkerPollerLane()`：
  - 每个 slot 接收调用方已解析的 `WorkflowParentWakePoller`；
  - 只包装为 `WorkerPollerPort`；
  - Consumer 的 delivery lease、ack、cursor 和 Definition/Binding 解析仍留在
    parent-wake Consumer/宿主组合中。
- 没有修改 `apps/worker/src/main.ts`，没有新增 migration。

### 测试

- Application focused test 新增 2 个：
  - 两个 Ingest slot 生成独立 owner；
  - 两个 parent-wake slot 独立创建 Consumer，并保持 `idle` 结果。

### 设计结论

Adapter 的边界是“实例化领域 worker”，不是新建一个替代 Job/Outbox 的状态机：

```text
Supervisor → slot lifecycle / bounded concurrency / stop / observation
Ingest     → Job claim / lease / retry / checkpoint
ParentWake → Outbox delivery claim / ack / cursor
```

异步 Definition/Binding 解析暂时由宿主在创建 lane 前完成；下一轮用 bootstrap
spike 验证多 lane startup/shutdown 顺序，再决定是否引入 async lane materialization。

### 验证结果

- `bun run test -- packages/application/src/index.test.ts --reporter=dot`
  - 1 个测试文件、10 个测试通过。
- `bun run test -- --run`
  - 16 个测试文件、130 个测试通过。
- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run db:validate`
  - Prisma schema 通过。
- `bun run db:generate`
  - Prisma Client 生成通过。
- 隔离 `COSMOS_DATA_ROOT=.agent/tmp/round44-migrate`
  - 15 条 migration 全部应用；
  - Prisma 子命令真实退出码为 `0`。
- `git diff --check`
  - 通过。
- `README.md` 与 `walkthrough.md`
  - fenced code block、EOF newline、相对链接检查通过。

### 未验证

- `apps/worker` 生产 bootstrap 尚未改为 `WorkerPollerSupervisor`。
- 多 lane 的真实 shutdown、Docker、浏览器、真实来源、跨进程 restart/reclaim
  尚未验收。

## Round 45 — Worker bootstrap 的多 lane 接线

日期：2026-08-09

### 目标

验证生产 `apps/worker` 可以把固定 Ingest 和 terminal parent-wake Consumer
组合到通用 `WorkerPollerSupervisor`，并固定启动、heartbeat 和停机 drain 顺序。

### 实现

- `apps/worker/src/main.ts`
  - 删除手写 `poll()` + `setInterval`；
  - Ingest 通过 `createIngestionWorkerPollerLane()` 创建；
  - parent-wake 按 concurrency 预先解析独立 Consumer；
  - 每个 slot 的 owner 分别为：
    - Ingest：`<instanceId>:ingest:<slot>`
    - parent-wake：`<instanceId>:workflow-parent-wake:<slot>`
  - `WorkerPollerSupervisor.onTick` 统一观察 poller error，并触发进程级
    ready heartbeat；
  - shutdown 先 `supervisor.stop()` drain，再写 `stopped` heartbeat，随后关闭
    Repository 和 Logger。

### 设计结论

bootstrap 只做依赖组合和生命周期管理：

```text
Repository / Registry
→ Poller Adapter
→ WorkerPollerSupervisor
```

领域 Worker 继续持有 Job claim/lease/retry/checkpoint 或 Outbox
claim/ack/cursor；Supervisor 不建立替代状态机。

异步 Definition/Binding 解析暂时在 supervisor 构造前完成。这样同步
`WorkerPollerSupervisor` 不需要知道 Prisma 初始化、Consumer Registry 或外部
连接创建过程。

### 已验证

- `bun run --cwd apps/worker typecheck`
  - 通过。
- `pwsh -NoProfile -File scripts/smoke-node.ps1`
  - 通过；
  - `healthWorker=ready`；
  - 真实 Source/Run/Feed/Search/Story/SSE 链路通过；
  - 结构化日志完成 API request → Run/Probe → Worker/Connector 关联。
- 以 `COSMOS_WORKER_INGEST_CONCURRENCY=2`、
  `COSMOS_WORKER_PARENT_WAKE_CONCURRENCY=2` 重跑 Node smoke
  - 通过；
  - 多 slot bootstrap、共享 SQLite、Run/Probe/Feed/Search/Story/SSE 仍通过。

### 未验证

- Node Worker graceful shutdown/drain 的独立进程级验收；
- 多 slot 真实数据库 claim/ack/reclaim；
- Docker、浏览器、真实来源、跨进程 restart/reclaim。

### 兼容性记录

- Windows PowerShell 5.1 执行 `scripts/smoke-node.ps1` 会在既有的
  `Invoke-WebRequest -SkipHttpErrorCheck` 参数处失败；
- PowerShell 7.6.3 执行同一脚本通过；
- 这是 smoke 脚本宿主兼容性问题，不是本轮 Worker bootstrap 失败。

### Round 45 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 16 个测试文件、130 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 46 — Worker bootstrap 的可测试边界

日期：2026-08-09

### 目标

把 Worker 配置解析和 lane materialization 从 `apps/worker/src/main.ts` 抽出，
为 disabled binding、异步 parent-wake Consumer 创建和 slot owner identity
建立可直接测试的边界。

### 实现

- 新增 `apps/worker/src/bootstrap.ts`：
  - `readWorkerBootstrapConfig()` 统一解析并校验环境变量；
  - `createWorkerPollerLanes()` 总是创建 Ingest lane；
  - disabled parent-wake 不创建 Consumer；
  - enabled parent-wake 按 slot 异步 materialize Consumer；
  - owner 使用 `<ownerPrefix>:workflow-parent-wake:<slot>`。
- `apps/worker/src/main.ts` 只保留：
  - Repository/Connector/Registry 初始化；
  - bootstrap lane composition；
  - Supervisor 生命周期；
  - heartbeat、signal 和 close。
- 新增 `apps/worker/src/bootstrap.test.ts`：
  - 默认/显式配置；
  - 非法配置；
  - disabled binding；
  - 2+2 多 slot lane/owner 组合。

### 已验证

- `bun run test -- apps/worker/src/bootstrap.test.ts --reporter=dot`
  - 1 个测试文件、4 个测试通过。
- `bun run --cwd apps/worker typecheck`
  - 通过。
- `bun run --cwd apps/worker build`
  - 通过。

### 设计结论

bootstrap port 负责异步外部依赖的 materialization；Supervisor 只接收已经
构造好的 Poller，继续保持通用宿主层与 Registry/Prisma 细节隔离。

### 未完成

- graceful shutdown 的独立进程级验收；
- lane/slot durable heartbeat；
- Workflow Run execution lane 生产接入。

### Round 46 收口验证


## Round 47 — Poller graceful drain fencing

日期：2026-08-09

### 发现

对 `WorkerPollerSupervisor` 做 stop 路径审查时发现：`tick()` 原先只拒绝
`running` 和 `stopped`，在 `stopping` 期间仍可手动启动新 poll，和 graceful
drain 的 admission 合同不一致。

### 修复

- `stopping` 状态的 `tick()` 现在明确抛出：
  `Worker Poller Supervisor is stopping.`
- 保留当前 poll 的 cooperative drain：
  - stop 设置 `stopping`；
  - 不再接纳新 tick；
  - 等待当前 poll 返回；
  - Supervisor 进入 `stopped`。

### 测试

新增阻塞 poll 测试，验证：

- stop 后状态为 `stopping`；
- 新 tick 被拒绝；
- stop 不会绕过当前未完成 poll；
- 当前 poll 完成后才结束 drain。

### 设计结论

Supervisor 只做 admission fencing 和 graceful drain，不强杀外部调用。真正的
AbortSignal、lease fencing、drain deadline 和 degraded close 仍由领域 Worker/
宿主后续提供。

### Round 47 收口验证

- `bun run test -- packages/application/src/index.test.ts --reporter=dot`
  - 1 个测试文件、11 个测试通过。
- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、135 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 48 — 可注入的 Worker shutdown sequence

日期：2026-08-09

### 目标

把 `apps/worker` signal handler 的 shutdown 顺序抽成可测试 controller，覆盖
重复信号、阶段失败和 degraded close。

### 实现

- `apps/worker/src/bootstrap.ts`
  - 新增 `createWorkerShutdownController()`；
  - 阶段顺序固定为：

```text
stop supervisor
→ heartbeat(stopped)
→ repository.close
→ worker.stopped
→ logger.close
```

  - 每次 shutdown 调用复用同一个 Promise；
  - 任一阶段失败都会继续后续阶段；
  - 返回 `ok/0` 或 `degraded/1`。
- `apps/worker/src/main.ts`
  - signal handler 只负责调用 controller 并执行最终 `process.exit()`；
  - 不再直接管理每个清理阶段。
- `apps/worker/src/bootstrap.test.ts`
  - 新增成功顺序、重复 signal、失败继续清理三类测试。

### 已验证

- `bun run test -- apps/worker/src/bootstrap.test.ts --reporter=dot`
  - 1 个测试文件、6 个测试通过。
- `bun run --cwd apps/worker typecheck`
  - 通过。
- `bun run --cwd apps/worker build`
  - 通过。

### 设计结论

signal 是宿主输入；shutdown controller 只负责生命周期协调，不持有 Job、
Outbox 或 Workflow durable truth。

### 未完成

- 真实 OS signal + 独立 Worker 进程 graceful shutdown；
- drain deadline 和超时后的 degraded close；
- lane/slot durable heartbeat。

### Round 48 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、137 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 49 — Poller drain deadline 的显式结果

日期：2026-08-09

### 目标

为 Supervisor 增加 drain deadline，但不把 timeout 误报为 stopped，也不在有
活动 poll 时自动关闭 Repository。

### 实现

- `WorkerPollerSupervisor.stop({ deadlineMs })` 现在返回：

```ts
{
    status: "drained" | "timed_out";
    activeSlots: readonly { laneId: string; slot: number }[];
}
```

- `drained` 表示当前 poll 全部完成；
- `timed_out` 保持 Supervisor 为 `stopping`，并返回 active slots；
- timeout 后可再次调用无 deadline 的 `stop()` 完成最终 drain；
- 非法 deadline（负数、非有限数）在所有 Supervisor 状态下拒绝；
- `apps/worker` 当前仍用无 deadline 的 shutdown wrapper，生产行为保持
  cooperative drain。

### 测试

- 阻塞 poll 在 deadline 到达时返回 `timed_out`；
- timeout 后手动 `tick()` 仍被 stopping fencing 拒绝；
- 释放 poll 后可以完成最终 drain；
- 非法 deadline 被拒绝。

### 设计结论

`timed_out` 只是一个需要宿主决策的事实，不是强杀成功。活动 poll 可能仍在
使用 Repository；后续必须结合 AbortSignal、Job/Outbox lease fencing 和进程
终止策略，才能安全实现 degraded close。

### Round 49 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、138 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 50 — Drain timeout 的安全 shutdown 边界

日期：2026-08-09

### 目标

把 `WorkerPollerStopResult.timed_out` 接入 Worker shutdown controller，确保
活动 poll 存在时不关闭共享 Repository/Logger。

### 实现

- `WorkerShutdownHooks.stopPollers()` 接受 `WorkerPollerStopResult`；
- timeout 时 controller：
  - 返回 `degraded`、`exitCode=1`；
  - 返回 `resourcesClosed=false` 和 active slots；
  - 调用 `onDrainTimeout`；
  - 跳过 stopped heartbeat、Repository close、Logger close 和
    `worker.stopped`。
- drained/旧式 `void` 结果仍走正常完整清理；
- `apps/worker/src/main.ts` 记录 `worker.drain_timeout`，保持当前无 deadline
  配置，因此生产默认路径未改变。

### 测试

- bootstrap focused test 7 个通过；
- timeout 路径确认只执行 stop 和 timeout observation；
- 正常路径和阶段失败路径仍保持原有顺序/结果合同。

### 设计结论

timeout 不是 stopped。只要 active poll 仍可能访问 Repository，就不能直接
进入资源 close；最终只能由宿主执行 abort/fencing 后的进程终止或后续安全关闭。

### Round 50 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、139 个测试通过。
- `bun run db:validate`
  - 通过（Prisma 版本升级提示不影响本轮验证）。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 51 — Worker drain deadline 配置接线

日期：2026-08-09

### 目标

把 drain deadline 作为可选 Worker 配置接入生产 bootstrap，同时保持默认
cooperative drain 行为。

### 实现

- `WorkerBootstrapConfig` 新增 `drainDeadlineMs`；
- 解析 `COSMOS_WORKER_DRAIN_DEADLINE_MS`：
  - 未设置为 `undefined`；
  - 非负有限数可用；
  - 负数/非法值拒绝。
- `apps/worker/src/main.ts`：
  - started log 记录 deadline；
  - 配置存在时调用 `supervisor.stop({ deadlineMs })`；
  - 无配置时调用无 deadline 的 stop。
- timeout 仍走 Round 50 安全路径，不关闭 Repository/Logger。

### 测试

- bootstrap 配置默认值、显式 `1500` 和非法负值；
- Round 50 timeout controller；
- Worker 全量 typecheck 通过。

### 设计结论

deadline 是显式运维策略；未配置时生产行为不变。timeout 后仍需结合
AbortSignal、lease fencing 和重启接管，不能仅靠 `process.exit(1)` 解决外部调用。

### Round 51 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、139 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

### Windows signal 验证记录

- Node 子进程调用 `process.kill(childPid, "SIGTERM")`：
  - handler 未触发；
  - 子进程直接退出，`exitCode=1`。
- Node 子进程调用 `process.kill(childPid, "SIGINT")`：
  - handler 未触发；
  - 子进程直接退出，`exitCode=1`。

结论：当前 Windows 调用方式不能证明 graceful signal；Node smoke 的清理仍是
`Stop-Process -Force`。shutdown controller 的顺序和 timeout 只由 focused test
证明，进程级 SIGTERM 保持未验收。

## Round 52 — Poller AbortSignal 传播

日期：2026-08-09

### 目标

把 cooperative AbortSignal 从 Supervisor 传播到当前 Poller，为后续 Connector/
Consumer/Action 取消保留统一宿主接缝。

### 实现

- `WorkerPollerPort.pollOnce(signal?: AbortSignal)`；
- 每个 `WorkerPollerSupervisor` slot 持有独立 AbortController；
- `start()` 创建新生命周期 controller；
- `stop()` 先 abort active slot，再等待当前 poll；
- timeout 仍不强杀，只返回 active slots。

### 测试

- Application focused test 13 个通过；
- 阻塞 poll 在 stop 时收到 `signal.aborted=true`；
- abort 后 poll 返回并完成 drained；
- 既有 stopping fencing/timeout 测试保持通过。

### 设计结论

当前 signal 只属于宿主层 Port，不自动改变 Job retry 或 Connector error 语义。
后续适配器需要明确 abort、retry_wait、unknown result 和 effect receipt 的关系；
lease fencing 仍是最终 durable correctness 边界。

### Round 52 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、140 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 53 — AbortSignal 到 Ingest/Probe Connector

日期：2026-08-09

### 目标

把 Supervisor/Poller 的 cooperative signal 继续传递到 Ingest/Probe 的 Connector
fetch 边界，但暂不改变既有 Job retry/checkpoint 语义。

### 实现

- `IngestConnector.fetchItems` 输入增加可选 `signal`；
- `ConnectorProbeService.runSource(sourceId, signal?)` 传递 signal；
- `IngestionService` 的 manual/existing run 调用链传递 signal；
- `IngestionWorker.pollOnce(signal?)` 将 signal 传入 Probe 或 Ingest；
- 既有 connector 实现保持兼容，未强制要求消费 signal。

### 测试

- ConnectorProbe focused test 验证收到同一个 AbortSignal；
- Application focused test 14 个通过；
- 全量 typecheck 通过。

### 设计结论

当前链路只证明“取消意图可以到达外部来源边界”，不证明 Connector 一定中断
网络请求，也不自动决定 retry/unknown/checkpoint。后续必须把 AbortError、
lease fencing 和 effect receipt 一起定义。

### Round 53 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、141 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 54 — Abort 后的 Ingest/Job 收口语义

日期：2026-08-09

### 目标

当 Worker stop 中断 Connector fetch 时，避免把未完成事实写成 failed/terminal，
让 Job lease expiry/reclaim 负责后续恢复。

### 实现

- `IngestionService` 在 Connector fetch、每个 item 写入、checkpoint 和 Run
  success close 前检查 AbortSignal；
- signal 已 aborted 时：
  - 不完成 Run；
  - 不推进 checkpoint；
  - 不继续写新的 Ingest item；
  - 将 abort 重新抛给 Worker。
- `IngestionWorker` 收到 aborted signal 时不调用 `completeJob` 或
  `finishFailedJob`，保留 durable lease/reclaim 路径；
- 既有非 abort 错误的 retry/terminal 语义不变。

### 测试

- Connector fetch abort 后 `persistIngestItem`、checkpoint、`completeRun`
  均为 0 次；
- aborted Ingest Job 不调用 `completeJob`；
- Application focused test 16 个通过。

### 设计结论

```text
stop/abort
→ 不做伪造 terminal close
→ lease 到期
→ 新 Worker reclaim
→ 按 durable truth 决定 retry/恢复
```

本轮只证明 abort 前的收口保护；实际 lease expiry/reclaim 的 Prisma 组合仍需
独立测试，且 fetch 之后发生的极窄竞态仍由 lease fencing 最终兜底。

### Round 54 收口验证

- `bun run typecheck`
  - 通过。
- `bun run build`
  - API、Worker、Web production build 通过。
- `bun run test -- --run`
  - 17 个测试文件、143 个测试通过。
- `bun run db:validate`
  - 通过。
- `bun run db:generate`
  - 通过。
- `git diff --check`
  - 通过。
- Workflow Task Markdown 检查
  - 代码围栏平衡；
  - 文件末尾换行存在；
  - 相对链接可解析。

## Round 55 — 统一取消、重试和未知结果合同

日期：2026-08-09

### 发现

Round 52–54 已经把 `AbortSignal` 传到 Poller 和 Ingest Connector，但各层仍
分别解释取消：

- Ingest 主要检查 `signal.aborted`；
- Connector 自己抛出的原生 `AbortError` 可能被当成 retryable failure；
- Outbox Consumer 没有接收 signal，handler 失败只能二分为 retryable/terminal；
- 外部 delivery 的未知副作用没有和 retryable failure 区分。

这会导致停止期间的错误分类与 durable lease 收口不一致。

### 实现

- `packages/contracts`
  - 增加共享 `ExecutionFailureKind`：
    - `aborted`
    - `retryable`
    - `terminal`
    - `unknown`
  - 增加 `ExecutionAbortedError`、`isExecutionAbortedError()` 和
    `throwIfExecutionAborted()`。
- `packages/application`
  - Ingest/Probe 使用共享 abort helper；
  - Worker 在 signal 已中止时不再执行 schedule queue 或 Job claim；
  - Connector/Run 抛出 abort 后不完成 Run、不推进 checkpoint；
  - abort 不进入 `retry_wait` 或 `failed_terminal`。
- `packages/workflow-runtime`
  - `WorkflowOutboxConsumer.runOnce(handler, signal?)` 支持 signal；
  - handler 收到同一个 signal；
  - 新增 `aborted` 和 `unknown` Consumer 结果；
  - aborted/unknown 都不调用 `ackOutbox` 或 `failOutbox`，让 lease expiry/
    takeover 负责恢复；
  - 新增 `WorkflowOutboxUnknownError`；
  - Action lease renewal、Workflow cancel 使用带原因的
    `ExecutionAbortedError`，abort 不被标记为 retryable。

### 测试

- contracts：共享 abort helper 和原生 `AbortError` 识别；
- application：已中止的 Ingest Poll 不 queue schedule、不 claim Job；
- workflow-runtime：
  - abort 前不 claim；
  - in-flight abort 保留 lease 并可由新 Worker 接管；
  - unknown delivery 不安全重试，lease 到期后可恢复；
  - Action/Receipt 既有 cancellation 和 unknown-result 测试保持通过。

Focused 验证：

- `bun run test -- packages/contracts/src/index.test.ts packages/application/src/index.test.ts packages/workflow-runtime/src/index.test.ts --run`
  - 3 个测试文件、67 个测试通过；
- `bun run typecheck:contracts`
  - 通过；
- `bun run typecheck:workflow-runtime`
  - 通过；
- `bun run typecheck:application`
  - 通过。

### 设计结论

```text
Supervisor stop
→ shared ExecutionAbortedError / AbortSignal
→ Connector / Consumer / Action
→ aborted：不伪造 terminal、不安全 retry
→ lease expiry / fencing / reconciliation
```

`unknown` 不等于 `retryable`：当 handler 无法证明副作用是否发生时，必须保留
当前 lease，等待接管或专门 reconciliation；只有明确安全可重试的失败才进入
`retry_wait`。

### 未完成与下一步

- 尚未用 Prisma 组合验证：Connector abort → Job lease expiry → 新 Worker reclaim；
- 尚未验证 Docker/真实 RSS/真实平台；
- Outbox unknown 当前依赖 lease expiry 和 handler 幂等，尚无独立
  Outbox receipt reconciliation；
- 下一轮优先做 InMemory/Prisma 双存储的中断、租约到期和接管测试。

## Round 56 — Prisma Ingest abort 后的租约接管

日期：2026-08-09

### 目标

把 Round 55 的 InMemory 语义推进到真实 Prisma/SQLite Store，验证：

```text
Connector abort
→ Run 保持 running
→ Job 不 complete/fail
→ lease 到期
→ 新 Worker reclaim
→ Ingest 成功、checkpoint 推进
```

### 实现

新增 `packages/storage-prisma/src/index.test.ts` 行为测试：

- 使用隔离 Data Root 和真实 Prisma SQLite；
- 第一 Worker 领取 `source-ingest` Job；
- Connector 在第一次 fetch 中 abort 并抛错；
- 第一 Worker 不完成 Job，Run 仍为 `running`；
- Entry 和 checkpoint 均未写入；
- 等待短 lease 到期；
- 第二 Worker 以新 owner reclaim 同一 Job；
- 第二次 Connector fetch 成功，Entry、Run 和 checkpoint 正常收口。

### 验证

- `bun run test -- packages/storage-prisma/src/index.test.ts --run`
  - 1 个测试文件、10 个测试通过；
- 新增测试耗时约 1.7 秒，未引入全局超时；
- 既有 stale completion、retry 和 persistent worker 测试保持通过。

### 设计结论

当前 Ingest 的 durable 恢复链路已经由 Prisma 证实：

- cooperative abort 不等于失败；
- 不完成 Job 是为了保留 lease expiry/reclaim 事实；
- checkpoint 只在成功路径推进；
- 新 Worker 的 lease token 可以隔离旧 Worker 的迟到写入。

### 未完成与下一步

- 尚未验证 Connector 在已写入部分 Observation 后 abort 的重试去重组合；
- 尚未验证 Prisma Parent-wake 的 abort/unknown delivery takeover；
- 尚未验证 drain deadline 超时后宿主退出与新进程接管的完整链路。

## Round 57 — 部分 Observation 写入后的同 Run 重放去重

日期：2026-08-09

### 目标

验证 abort 发生在一页数据的中间位置时，第一条 Observation 已经提交、第二条
尚未处理；新 Worker 重放同一个 Run 时：

- 已有 Observation 不被覆盖或重复追加；
- 已有 Entry 不重复创建；
- 后续新 Entry 仍可创建；
- 成功后 checkpoint 正常推进。

### 实现

新增 Prisma/SQLite 行为测试：

```text
page[item-1, item-2]
→ persist item-1
→ abort
→ lease expiry
→ replay same Run/page
→ item-1 same-Run Observation no-op
→ item-2 creates one new Entry
→ checkpoint commit
```

测试通过真实 `persistIngestItem` 包装在第一条写入完成后触发 abort，随后由新
Worker 接管同一 Job。

### 验证

- `bun run test -- packages/storage-prisma/src/index.test.ts --run -t "deduplicates partial Observation"`
  - 通过；
- 同一测试文件完整 focused：
  - 11 个测试通过；
- 最终结果：
  - 2 个 Entry；
  - 2 个 Observation；
  - 1 个重放项被同 Run external key 去重；
  - checkpoint 为 `partial-cursor`；
  - Run 成功收口。

### 设计结论

同一个 durable Run 的重放不是一次新的 Observation 事实；它是对原 Run 未完成
页面的恢复尝试。`(sourceInstanceId, runId, externalKey)` 的 Observation
去重和 `(sourceInstanceId, canonicalExternalId)` 的 Entry 身份分别承担：

- 防止同一 Run 重复写入；
- 防止跨 Run 重复创建 Entry。

### 未完成与下一步

- 仍需验证同一外部条目在新的 Run 中内容修订时追加新 Revision；
- 仍需验证 Parent-wake 在 Prisma 上的 abort/unknown 接管；
- 仍需验证多 Worker 并行处理同一 Source 时的 connector/分页公平性。

## Round 58 — Prisma Outbox abort/unknown 接管

日期：2026-08-09

### 目标

把 Round 55 的 Outbox `aborted/unknown` 合同推进到真实 Prisma Store：

```text
claim
→ abort/unknown
→ 不 ack、不 fail
→ lease 未到期：新 Worker idle
→ lease 到期：新 Worker reclaim
→ handler 重放
→ cursor 推进
```

### 实现

新增 `packages/storage-prisma/src/workflow-store.test.ts` 行为测试，使用两个
按 sequence 排序的 Outbox event：

- 第一个 event 在 handler 中 abort；
- 新 Worker 在 lease 未到期时不能抢占；
- lease 到期后新 Worker 接管并 ack；
- 第二个 event 抛出 `WorkflowOutboxUnknownError`；
- unknown delivery 在 lease 未到期时保持阻塞；
- lease 到期后重放成功并推进同一 Consumer cursor。

### 验证

- `bun run test -- packages/storage-prisma/src/workflow-store.test.ts --run -t "keeps Prisma Outbox abort"`
  - 通过；
- Prisma Workflow Store focused 文件：
  - 25 个测试，其中新增 1 个通过；
- 已验证旧 lease token 无法 ack，新 lease token 可以推进 cursor。

### 设计结论

Prisma Store 与 InMemory Store 对 abort/unknown 的 durable 语义一致：

- abort 是宿主停止提示，不是 delivery failure；
- unknown 不是 retry_wait；
- 两者都让 delivery 保持 leased，最终由 lease expiry/reclaim 或专用
  reconciliation 收口；
- sequence cursor 只有在明确 ack 后推进。

### 未完成与下一步

- Parent-wake handler 自身的数据库更新中途 abort 尚未做事务级故障注入；
- unknown delivery 仍依赖 handler 幂等，尚无独立 Outbox receipt；
- 尚未验证多 Consumer Group 在 abort/unknown 后各自独立 takeover。

## Round 59 — Ingest Observation/Checkpoint lease fencing

日期：2026-08-09

### 发现

此前 `IngestionService` 只有 `startRun()` 和 `completeRun()` 携带 Job lease；
`persistIngestItem()` 与 checkpoint 写入没有携带 lease。旧 Worker 在 lease
失效后仍可能继续写 Observation、Entry 或 checkpoint，最终收口虽然会被拒绝，
中途领域事实却已经产生。

### 实现

- `CosmosRepository.persistIngestItem()` 增加可选 `JobLease`；
- `CosmosRepository.setCheckpoint()` 改为对象输入，可携带 `runId` 和 `JobLease`；
- `IngestionService` 将当前 Ingest Job lease 传递到每一条 item 写入和
  checkpoint；
- Prisma `persistIngestItem()`：
  - Blob 写入前做一次 lease preflight；
  - Observation/Entry/Revision transaction 内再次验证 lease；
- Prisma checkpoint upsert 在同一 transaction 内验证 lease；
- lease 缺失时保留手动 Ingest 的兼容路径；Job-backed Ingest 必须带 lease。

### 测试

新增 Prisma 行为测试：

- 原 Worker 领取 Job；
- lease 过期后新 Worker 接管；
- 原 Worker 使用旧 token 写 Observation/Entry：被拒绝；
- 原 Worker 使用旧 token 写 checkpoint：被拒绝；
- 数据库中没有 stale Entry 或 checkpoint；
- 当前 Worker 使用新 token 可以写入并推进 checkpoint。

验证：

- `bun run typecheck:application`
  - 通过；
- `bun run typecheck:storage`
  - 通过；
- `bun run test -- packages/storage-prisma/src/index.test.ts --run`
  - 1 个测试文件、12 个测试通过。

### 设计结论

```text
Job lease
→ Ingest item transaction
→ Observation / Entry / Revision
→ checkpoint
→ Run / Job terminal close
```

每个 durable 写入点都必须接受同一 lease fencing；只在最后
`completeRun()` fencing 会留下不可撤销的中途事实。

### 未完成与下一步

- Blob preflight 与 transaction recheck 之间仍存在极窄 race，需 Blob GC 或
  更强的 staged artifact 生命周期；
- 仍需验证旧 Worker 在 lease 丢失后收到 heartbeat abort，并停止 Connector
  fetch，而不只是由写入 transaction 拒绝；
- 需要把相同 fencing 规则扩展到未来 Asset/Knowledge/Research Workflow
  的领域 Command。

## Round 60 — Job lease heartbeat 驱动 Ingest abort

日期：2026-08-09

### 目标

把 Job lease 丢失从“最终提交时被拒绝”推进为“当前外部执行尽快收到
AbortSignal”：

```text
Job heartbeat renew=false/throws
→ ExecutionAbortedError
→ Connector/Probe/Ingest signal.aborted
→ 不 complete/fail Job
→ lease fencing 继续兜底
```

### 实现

- `IngestionWorker` 为每个已领取 Job 建立 execution-local
  `AbortController`；
- 宿主 stop signal 与 Job lease-loss signal 合并到同一个执行 signal；
- `renewJobLease()` 返回 false 或抛错时：
  - 记录 lease loss；
  - abort 当前 Connector/Probe/Ingest；
  - 不把 Job 标记为成功或 retry/terminal；
- 增加可测试的 `leaseHeartbeatMs`，默认生产 heartbeat 策略不变；
- source probe、unsupported job 和 source ingest 在领域写入前检查 signal。

### 测试

新增 Application focused 行为测试：

- heartbeat 返回 `false`；
- 当前 Ingest execution 收到同一个 aborted signal；
- Connector/服务返回后 Worker 不调用 `completeJob`。

验证：

- `bun run typecheck:application`
  - 通过；
- `bun run test -- packages/application/src/index.test.ts --run`
  - 1 个测试文件、17 个测试通过。

### 设计结论

取消分成两层：

- cooperative abort：尽快停止网络/子进程/Connector；
- durable lease fencing：即使外部代码没有及时停止，也拒绝迟到领域写入。

前者改善资源和停机行为，后者才决定数据库中的最终事实。

### 未完成与下一步

- 仍需在真实 Prisma Worker 中注入 heartbeat 失效并观察 Connector 中断；
- 仍需验证 heartbeat error 与 retry/unknown result 的组合；
- Action/Research/Knowledge Workflow 需要复用同一“heartbeat → execution abort
  → durable fencing”模式。

## Round 61 — Workflow Run 接入 Worker 可选 lane 与 stop abort

日期：2026-08-09

### 目标

把此前只存在于 `packages/workflow-runtime` 的单次 `WorkflowWorkerLoop` 接入
`apps/worker` 的统一 `WorkerPollerSupervisor`，但不把当前仅有少量内置
Workflow Definition 的 spike 误当成通用生产 Runtime：

```text
WorkerPollerSupervisor
├─ ingest
├─ workflow-run（可选，默认关闭）
└─ workflow-parent-wake
```

同时修复一个停机边界：宿主 supervisor 已经拥有每个 slot 的 `AbortSignal`，
Workflow Runtime 必须把它传给 Run/Action 执行；否则 drain deadline 只能等待
不可中断的 Workflow，或者把正常停机误报成运行失败。

### 发现

- `WorkflowRuntime.runNext()` 原来没有接收宿主停止信号；
- `WorkflowWorkerLoop.tick()` 会把所有异常都压成普通 `error`，正常 stop
  会被日志当成失败；
- `WorkerPollerSupervisor` 为每个 slot 提供独立 signal，但缺少 Workflow Run
  lane 适配；
- 生产 Worker 没有通用 Definition/Action Registry，所以 lane 不能默认开启，
  也不能在启动时假设插件 Workflow 已经可执行。

### 实现

#### 1. Runtime stop/lease abort 传播

- `WorkflowRuntime.runNext(signal?)` 在 claim 前检查 signal，并把 signal 传入
  已领取 Run；
- Run 执行建立 execution-local `AbortController`；
- 宿主 stop、Run lease heartbeat 失败或 lease renewal error 会 abort 当前
  execution 和 Action；
- `RuntimeContext` 把 Run signal 传给 Action，所有 context 操作在边界检查
  abort；
- abort 不调用 `completeRun`，也不把 Action Job 错误收口成 retry/terminal；
  lease 过期后由新 Worker reclaim；
- `WorkflowWorkerLoop` 将宿主 abort 返回为结构化 `aborted`，不再把正常停机
  当成普通 runtime failure。

#### 2. Application Worker lane

新增 `createWorkflowRunWorkerPollerLane()`：

- 每个 slot 通过 `createRuntime({ slot, owner })` 创建独立 Runtime；
- owner 固定为：

```text
<worker-instance>:workflow-run:<slot>
```

- 可校验 Runtime owner 与 lane，避免多个 slot 共用不可区分的 durable identity；
- 复用统一 Worker supervisor 的 polling、错误隔离、heartbeat 和 shutdown；
- Workflow tick 的 lease loss 与普通 error 分开记录。

#### 3. Worker bootstrap

增加配置：

```text
COSMOS_WORKER_WORKFLOW_CONCURRENCY=0
COSMOS_WORKER_WORKFLOW_LANE=default
```

- 并发为 `0` 时不创建 Workflow Run lane；
- 并发大于 `0` 但没有 Runtime factory 时启动组合失败，避免静默丢任务；
- `apps/worker` 使用与 Cosmos Repository 相同的 `PrismaWorkflowStore`；
- 每个 Runtime 注册当前唯一的内置
  `cosmos.maintenance.receipt-reconcile@1`；
- parent-wake Consumer 与 Workflow Run lane 共享同一 Prisma/Data Root，但仍
  通过独立 owner 和各自 Store/Application 合同隔离。

### 验证

- focused：
  - `bun run test -- --run packages/workflow-runtime/src/index.test.ts apps/worker/src/bootstrap.test.ts`
  - 2 个测试文件、56 个测试通过；
  - 覆盖宿主 stop abort、lease 到期接管、Workflow lane slot owner、lane
    配置和缺失 factory 拒绝。
- 全量：
  - `bun run test -- --run`
  - 17 个测试文件、155 个测试通过；
- `bun run typecheck`：通过，包含 packages、API、Worker 和 Web；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过。

### 设计结论

本轮完成的是“Worker 宿主接入”和“停止/接管语义”，不是通用 Workflow 平台
完成：

- 已有可选 Workflow Run execution lane；
- 默认仍关闭；
- 当前只具备内置 Definition 注册，没有插件/数据库 Definition Registry；
- Web/API 尚不能创建、配置、观察或取消通用 Workflow Run；
- graceful stop 中断的 Run 以 `running + lease` 留在持久层，后续依靠 lease
  expiry/reclaim 恢复，而不是伪造失败。

### 未完成与下一步

- 在真实 Prisma Worker 进程中做 SIGTERM、Connector/Action 中断和重启接管
  smoke；
- 定义持久 Workflow Definition/Action Registry 与插件 manifest 的加载边界；
- 将 `COSMOS_WORKER_WORKFLOW_CONCURRENCY` 的开启条件与 Registry/版本快照
  绑定；
- 增加 Workflow lane 独立 heartbeat、指标和 admission/fairness；
- 继续验证外部 Action unknown receipt、deadline、parent-wake 事务中途 abort
  的组合。

## Round 62 — 真实 Prisma/SQLite Store 经 Worker lane dispatch 与接管

日期：2026-08-09

### 目标

确认 Round 61 的 Worker lane 不是只在 `InMemoryWorkflowStore` 上成立，而是
使用真实 Prisma/SQLite 持久 Store 跑通：

```text
queued WorkflowRun
→ WorkerPollerSupervisor
→ Workflow Run lane
→ Prisma claim/lease
→ terminal close
```

并验证宿主停止后的 durable 恢复：

```text
active Action
→ host stop abort
→ Run/Job 保持 leased
→ lease expiry
→ 新 Worker lane reclaim
→ Workflow 成功收口
```

### 实现

在 `packages/storage-prisma/src/workflow-store.test.ts` 增加两条真实
Prisma/SQLite 行为测试：

1. **Host lane dispatch**
   - 使用 `createWorkflowRunWorkerPollerLane()` 和
     `WorkerPollerSupervisor`；
   - 创建两个独立 slot，owner 为：

     ```text
     prisma-host-worker:workflow-run:0
     prisma-host-worker:workflow-run:1
     ```

   - 从 Prisma Store 领取并执行 queued Run；
   - 终态检查确认 `status=succeeded`、output 持久化、lease 清空。

2. **Host abort/reclaim**
   - 第一个 lane 执行可取消 Action；
   - supervisor stop 触发同一个 `AbortSignal`；
   - Action 收到 abort，Run 保持 `running`，Action Job 保持 `leased`；
   - 等待短 lease 到期；
   - 第二个 lane 使用新 owner reclaim 同一个 Run/Job；
   - 新 Action 执行并将 Run 收口为 `succeeded`。

### 验证

- Prisma Workflow Store focused：
  - `bun run test -- --run packages/storage-prisma/src/workflow-store.test.ts`
  - 1 个测试文件、27 个测试通过；
- Round 62 新增 host lane 测试：
  - 2 个测试通过；
- 全量：
  - `bun run test -- --run`
  - 17 个测试文件、158 个测试通过。

### 设计结论

- Workflow Run lane 与 Prisma Store 的 owner、lease、terminal close 和
  takeover 语义已经有真实 SQLite 证据；
- Host stop 不等于业务失败；没有安全 terminal result 时保持 leased，由
  durable lease expiry/reclaim 决定后续执行；
- Worker lane 仍然只是执行宿主，不负责定义注册、用户配置、权限或 Workflow
  版本发现；
- 真实 Store 集成测试不能替代真实 `apps/worker` Node 进程的 SIGTERM、数据卷
  和跨进程重启验收。

### 未完成与下一步

- 运行真实 Node Worker 进程，打开可控 Workflow lane，做 SIGTERM/drain/
  restart/reclaim smoke；
- 把 Workflow Definition/Action Registry 从启动代码抽成持久版本化合同；
- 对 lane 增加独立 heartbeat、指标、admission、fairness 和 backpressure；
- 验证外部副作用 Action 在 host abort 后的 unknown receipt reconciliation；
- 继续保持 Docker、浏览器、真实来源、Harness/Agent 验收与本 spike 分开报告。

## Round 63 — Node production Worker bootstrap smoke

日期：2026-08-09

### 目标

把 Round 61/62 的测试证据推进到实际 Node production entry：

```text
db:migrate
→ node apps/worker/dist/main.js
→ Worker lane bootstrap
→ SQLite WorkerHeartbeat.ready
```

同时严格区分 Windows 下“进程收到终止信号”和真正执行完
`WorkerShutdownController` 的 graceful stop。

### 实施

- 创建隔离 Data Root：

  ```text
  .agent/tmp/worker-bootstrap-round63-<uuid>/
  ```

- 运行 `bun run db:migrate`，15 条 migration 全部应用；
- 使用生产构建产物 `apps/worker/dist/main.js` 启动 Node Worker；
- 设置：

  ```text
  COSMOS_WORKER_WORKFLOW_CONCURRENCY=1
  COSMOS_WORKER_WORKFLOW_LANE=default
  COSMOS_WORKER_INGEST_CONCURRENCY=1
  COSMOS_WORKER_PARENT_WAKE_CONCURRENCY=1
  COSMOS_WORKER_POLL_MS=50
  COSMOS_WORKER_LEASE_MS=500
  COSMOS_WORKER_DRAIN_DEADLINE_MS=2000
  COSMOS_LOG_OUTPUT=stdout
  ```

### 观察结果

Node Worker 真实输出包含：

```text
storage.initialize.started
storage.initialize.completed
worker.started
  workflowRun=true
  workflowRunConcurrency=1
  workflowLane=default
```

随后使用同一 Data Root 查询 SQLite `WorkerHeartbeat`，得到：

```text
status=ready
version=0.1.0
stoppedAt=null
lastSeenAt=<启动后的时间>
```

这证明生产 Node 入口能够初始化 Prisma、共享 Data Root，并建立已启用
Workflow lane 的进程 heartbeat。

### 信号边界与验证状态

测试父进程调用 Windows Node child process 的
`child.kill("SIGTERM")` 后，子进程以：

```text
code=null
signal=SIGTERM
```

退出；输出中没有观察到 `worker.stopped`。因此本轮只计入：

- Node production bootstrap：已验证；
- Workflow lane 配置实际生效：已验证；
- SQLite ready heartbeat：已验证；
- Windows child-process SIGTERM graceful shutdown：未验证；
- `worker.stopped` 持久 heartbeat：未验证；
- 真实进程 restart/reclaim：未验证。

不能把 Windows 的直接终止结果写成 graceful shutdown 成功。后续需要使用
可可靠传递控制信号的宿主测试方式，或在真实部署环境中验收 SIGTERM/SIGINT、
drain deadline、资源关闭和重启接管。

### 设计结论

- `apps/worker/dist/main.js` 已经能在 Node production path 启动可选
  Workflow Run lane；
- lane 的开关、lane 名称、owner 生成和 heartbeat 由持久 Data Root 外的配置
  与 Worker 组合层控制；
- graceful shutdown 仍是独立验收门槛，不能被 Store test、build 或“进程退出”
  替代；
- 当前临时 Data Root 仅用于隔离 smoke，不能当作用户真实数据验收。

### 未完成与下一步

- 设计可重复的跨平台 Worker process harness，可靠发送 graceful signal；
- 运行 Node Worker 进程级 Workflow Run dispatch/reclaim；
- 验证 stop 后 `status=stopped`、资源关闭和旧 lease 不再推进；
- 在 Docker/Compose 中重复同一 smoke，并分别报告 Node、Docker 和平台差异。

## Round 64 — IPC graceful shutdown process harness

日期：2026-08-09

### 背景

Round 63 证明了 Node production Worker 能启动并写入 `ready` heartbeat，但
Windows 下直接对 child process 调用 `child.kill("SIGTERM")` 只得到
`signal=SIGTERM` 退出，没有进入 Worker 内部的 shutdown controller。

为了继续验证进程级资源关闭，增加一个显式、默认关闭的测试控制通道；它不改变
正常生产启动路径，也不把 OS signal 的结果伪装成 graceful signal。

### 实现

- `apps/worker/src/bootstrap.ts` 新增
  `installWorkerTestControl()`；
- 只有满足以下条件才安装 IPC listener：

  ```text
  COSMOS_WORKER_TEST_CONTROL=ipc
  + process.send 可用
  + Worker 由 Node fork 启动
  ```

- 仅接受结构化消息：

  ```json
  { "type": "shutdown", "signal": "IPC_TEST" }
  ```

- 该控制通道默认不安装；`bootstrap.test.ts` 覆盖默认关闭；
- `apps/worker/src/main.ts` 将 IPC shutdown 复用现有
  `WorkerShutdownController`，不建立第二套清理路径。

### 真实 Node 验证

在隔离 Data Root 中：

1. `bun run db:migrate` 应用 15 条 migration；
2. 使用 `apps/worker/dist/main.js` 由 Node `fork` 启动；
3. 设置 `COSMOS_WORKER_TEST_CONTROL=ipc` 和
   `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`；
4. 观察 `worker.started`，确认 Workflow lane 生效；
5. 父进程发送 `{ type: "shutdown", signal: "IPC_TEST" }`；
6. 等待子进程退出并查询同一 SQLite。

观察到：

```text
workflowRun=true
workflowRunConcurrency=1
workflowLane=default
storage.close.started
storage.close.completed
worker.stopped { signal: "IPC_TEST", status: "ok" }
child exit { code: 0, signal: null }
WorkerHeartbeat.status = "stopped"
WorkerHeartbeat.stoppedAt != null
```

此外，停止时 parent-wake lane 返回结构化 `aborted`，随后正常 drain；这证明
abort 不被当成业务失败，也没有阻塞资源关闭。

### 验证边界

已验证：

- Node production dist 入口；
- 真实 Prisma/SQLite 初始化；
- Workflow lane bootstrap；
- IPC 触发的统一 shutdown controller；
- storage close；
- `worker.stopped`；
- `stopped` heartbeat；
- 退出码为 0。

仍未验证：

- Windows OS `SIGTERM`/`SIGINT` 能否可靠到达 Node signal handler；
- Docker stop signal；
- 多进程跨机器 stop、网络分区和 supervisor 重启；
- 正在执行真实 Workflow Run 时的进程级 graceful drain。

### 设计结论

进程级验收拆成两条独立证据链：

```text
IPC test control
→ 验证 Worker 内部 shutdown contract

OS/Docker signal
→ 验证部署环境到进程的信号传递
```

前者通过不代表后者通过。`COSMOS_WORKER_TEST_CONTROL` 只为测试 harness
显式开启，默认生产路径保持关闭。

### 下一步

- 在 Docker/Compose 中验证 `stop_grace_period`、SIGTERM 和资源关闭；
- 让真实 queued Workflow Run 在 graceful drain 期间可观测地中断、过期和
  reclaim；
- 增加 process harness 的跨平台输出格式，和 focused/full/browser/Docker
  验收分开报告。

## Round 65 — 真实 Node Worker dispatch 与 Job admission fencing

日期：2026-08-09

### 目标

使用当前 Worker 内置的
`cosmos.maintenance.receipt-reconcile@1`，从真实 Prisma/SQLite 中 seed 一个
queued Workflow Run，再由 Node production Worker 的 Workflow lane 执行：

```text
seed receipt + queued reconciliation Run
→ node apps/worker/dist/main.js
→ Workflow Run lane
→ receipt reconciliation Action Job
→ SQLite terminal state
→ IPC graceful shutdown
```

### 第一次 smoke 暴露的真实问题

第一次 seed 使用了一个仍处于 `queued` 的、未注册定义的 source Run 来承载
外部 receipt。Worker 的 Workflow lane 先领取了这个 Run，按预期将缺失定义收口
为失败；之后 reconciliation 只能得到 `run_terminal`。这说明测试数据的
receipt 所属 Run 不能留在可调度状态，已改为合法的 `waiting` Run。

更重要的是第一次真实 Worker 输出暴露了一个真正的生产竞态：

```text
Workflow Runtime 创建 workflow-action Job
→ fixed Ingest lane claimNextJob()
→ IngestionWorker 看到 workflow-action
→ unsupported_job
→ Action Job failed_terminal
```

原因是旧 `CosmosRepository.claimNextJob()` 没有 Job kind admission；固定
Ingest lane 可以看到所有 Job，而不是只看到 Source Job。

### 修复

- `CosmosRepository.claimNextJob()` 增加可选 `jobKinds`；
- `IngestionWorker` 明确请求：

  ```text
  source-ingest
  source-probe
  ```

- Prisma claim query 使用 `kind IN (...)`；
- 为了保护旧调用，未提供 `jobKinds` 时 Prisma 也默认只允许上述两类；
- Workflow Runtime 继续通过自己的 `WorkflowStore.claimJob()` 领取
  `workflow-action`，不复用旧 Source Job claimant；
- 新增 Prisma 行为测试：
  - Source claimant 看不到 `workflow-action`；
  - Workflow Store claimant 仍可领取同一 Action Job。

### 最终真实 Node 验证

使用隔离 Data Root 和 15 条 migration：

- seed：
  - receipt status：`committed`；
  - receipt 所属 source Run：`waiting`；
  - source workflow-action Job：`retry_wait`；
  - reconciliation Run：`queued`；
- Node Worker：
  - `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`；
  - `COSMOS_WORKER_WORKFLOW_LANE=default`；
  - 使用 `apps/worker/dist/main.js`；
- 通过 IPC test control graceful stop：
  - `worker.stopped status=ok`；
  - `storage.close.started/completed`；
  - exit `code=0`, `signal=null`；
- 关闭后查询 SQLite：

  ```text
  reconcile Run:
    status=succeeded
    output.applied=true
    output.reason=applied

  source workflow-action Job:
    status=succeeded
    result={recovered:true, round:65}
    leaseOwner=null
    leaseToken=null

  source Run:
    status=waiting
  ```

### 验证

- Job admission focused：
  - `bun run test -- --run packages/storage-prisma/src/index.test.ts -t "Source Job claimant"`
  - 1 个测试通过；
- Node production build：通过；
- 真实 Node Worker + SQLite dispatch：通过；
- 真实 IPC graceful shutdown + stopped heartbeat：通过；
- Round 65 发现的第一个 dispatch 失败被保留为负向证据，没有从报告中删除。

### 设计结论

`Job` 的持久表可以共享，但 claim admission 不能共享成“无条件领取”：

```text
Source Worker
  → claimNextJob(jobKinds=[source-ingest, source-probe])

Workflow Runtime
  → WorkflowStore.claimJob(workflow-action)
```

未来增加 Knowledge、Research、Delivery 或 Adapter Job 时，必须在
Application/Store Port 层定义明确的 kind/lane/capability admission；不能让
任意旧 Worker 通过一个宽泛的 `claimNextJob()` 抢走新 Job。

### 未完成与下一步

- 将 Job kind/lane admission 从字符串过滤进一步提升为版本化 Worker lane/
  capability 合同；
- 给 Workflow Run 未注册 Definition 增加启动前 registry/admission 校验，
  避免任务进入可执行状态后才失败；
- 在 Docker/Compose 中重复真实 Node dispatch、graceful stop 和 shared volume
  验证；
- 继续验证真实 Action unknown、Run deadline、lease takeover 与进程重启组合。

## Round 66 — Workflow enqueue admission boundary

日期：2026-08-09

### 发现

当前 `WorkflowRuntime.start()` 会先解析本地 Definition，再创建持久 Run；
但它同时承担“入队”和“立即执行”两个动作。未来 Trigger/API/CLI 需要只提交
queued Run 时，如果绕过 Runtime 直接调用 `WorkflowStore.createRun()`，就可能
把未注册的 `workflowRef` 写入持久队列，直到 Worker 领取后才失败。

本轮不提前实现完整持久 Definition Registry，而是先固定最小提交边界：

```text
WorkflowRuntime.enqueue()
  → resolve registered WorkflowDefinition
  → validate input schema
  → create durable queued WorkflowRun
```

### 实现

- 新增 `WorkflowRuntime.enqueue(workflowRef, input, options)`；
- `enqueue()` 复用与 `start()` 相同的：
  - Definition 解析；
  - input schema 校验；
  - `parentRunId`；
  - budget；
  - timeout/deadline；
  - lane；
  - priority；
  - input snapshot；
- `start()` 改为：

  ```text
  enqueue()
  → executeRun()
  ```

- 未注册 Definition 在任何 durable Run 创建前抛出
  `WorkflowDefinitionNotFoundError`；
- 新增行为测试确认：
  - unknown Definition 不入队；
  - registered Definition 能生成 `queued` Run；
  - 输入、lane 和 priority 快照持久化。

### 设计边界

这不是完整 Registry。当前仍然存在以下限制：

- `WorkflowStore.createRun()` 作为底层 Port 仍可被内部代码直接调用；
- Worker 每个 slot 仍通过启动代码注册 Definition/Action；
- Definition/Action 的持久版本、插件 manifest、激活 binding 和跨进程加载
  尚未实现；
- `enqueue()` 只能保证提交方 Runtime 已注册 Definition，不能保证未来另一个
  Worker 进程拥有同一版本；
- Action 引用是脚本执行时解析，尚未有静态 required-action manifest。

因此公开 Application Command/Trigger API 最终应调用一个带 Registry 的
Workflow Submission Service，而不是让 Web/API 直接依赖底层 Store。

### Worker claim admission

仅靠提交侧校验还不够，因为旧版本、迁移脚本或外部恢复操作仍可能把未知
`workflowRef` 写进 queued。于是本轮继续收紧 Worker 侧：

- `ClaimWorkflowRunInput` 增加可选 `workflowRefs`；
- `InMemoryWorkflowStore` 和 `PrismaWorkflowStore` 的 `claimNextRun()` 都按
  `workflowRef IN (...)` 过滤；
- `WorkflowRuntime.runNext()` 把当前 Runtime 已注册的 Definition refs 传给
  Store；
- Runtime 没有任何 Definition 时直接 idle；
- 未知 Definition Run 保持 `queued`，不会被当前 Worker 领取后错误收口。

这形成双层保护：

```text
enqueue validation
→ 防止新提交写入未知 Definition

claimNextRun(workflowRefs)
→ 防止历史/外部未知 Run 被错误 Worker 领取
```

这仍不是持久 Registry；它只是把“Worker 只能执行自己已加载的 Definition”
固定成 durable claim 合同。

### 验证

- Workflow enqueue focused：
  - `bun run test -- --run packages/workflow-runtime/src/index.test.ts -t "validates a Workflow Definition"`
  - 通过；
- Workflow claim admission focused：
  - InMemory 未注册 Definition 保持 queued；
  - Prisma `workflowRefs` 过滤测试通过；
- 全量 Round 65 基线：
  - 17 个测试文件、163 个测试通过；
- 本轮新增测试使 Workflow Runtime 文件达到 50 个测试，Prisma Workflow Store
  文件达到 28 个测试；
- `bun run typecheck`：通过；
- `bun run test -- --run`：17 个测试文件、163 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- 真实 Node dispatch、Job admission fencing 和 IPC graceful smoke 的已有证据
  继续有效。

### 结论

“能执行”与“能入队”必须是两个明确层次：

```text
Registry/Runtime validation
  → durable queued Run
      → Worker Runtime dispatch
```

当前先把边界固定在 `WorkflowRuntime.enqueue()`，下一阶段再把 Definition/
Action Registry 提升为持久、可版本激活、可跨 Worker 解析的合同。

### 下一步

- 设计 `WorkflowDefinitionRegistry` / `ActionDefinitionRegistry` 的持久 Port；
- 将 Definition version、manifest hash 和 activation snapshot 关联到 Run；
- 让 Trigger/Research/Knowledge submission 走统一 Application Command；
- 对未知 Definition 选择明确策略：提交时拒绝、进入 blocked 等待，或进入
  可观测 terminal `definition_unavailable`，不能静默反复失败。

## Round 67 — 持久 Definition/Action Registry 架构审查

日期：2026-08-09

### 审查结论

结论：**需决策，暂不直接增加 Registry 数据表**。

当前实现已经形成两层本地防线，但还不是跨 Worker 的 Definition/Action
Registry：

```text
WorkflowRuntime.enqueue()
  → 提交侧校验本进程已注册 WorkflowDefinition

WorkflowRuntime.runNext()
  → 把本进程已注册 workflowRefs 传给 claimNextRun()
  → 未知 Run 留在 queued
```

这两层解决了“错误 Worker 领取未知 Run”的直接风险，但不能回答：

- 哪个插件/manifest 提供了 `workflowId@version`；
- 多个 Worker 是否加载了同一个实现和同一个 manifest hash；
- 哪个版本当前处于 active；
- 已创建 Run 是否固定了当时的 Definition/Action 内容；
- Action 所需的 capability、effectMode、retry/timeout/unknown receipt 合同
  是否与提交时一致；
- 插件暂时未安装时，queued Run 应该等待、阻塞还是进入终态。

### 已验证的模块边界

#### 已验证

- `WorkflowRuntime` 持有进程内可执行 Definition/Action；
- `WorkflowStore` 持有 Run/Step/Job/lease 的 durable truth；
- `PrismaWorkflowStore.claimNextRun()` 支持 `workflowRefs` 过滤；
- fixed Ingest 通过 `jobKinds=[source-ingest, source-probe]` 与
  `workflow-action` 隔离；
- `apps/worker` 只在启动组合层注册当前内置
  `receipt-reconcile` Workflow；
- Web/API 没有直接依赖 Prisma、SQLite 或 Data Root。

#### 基线/后续债务

- `PROJECT-STATUS.md` 仍按 master 基线描述“通用 Workflow Runtime 尚未实现”，
  与本 dirty spike worktree 的新实现不一致；这属于未合并状态差异，不应被
  当作 master 已完成；
- `WorkflowRun` 当前保存 `workflowRef`/version 和 input，但没有
  `definitionSnapshot`、manifest hash 或 Action dependency snapshot；
- `ActionDefinition` 没有持久 catalog，Action Job 只有 `actionRef`，没有
  提交时的 Action manifest/version hash；
- Worker lane 启动成功不代表全部 queued Definition 可执行；未知 Run 目前会
  保持 queued，但还没有 blocked/unavailable projection、告警或 API 状态；
- `claimNextRun(workflowRefs)` 是运行时 admission 防线，不是 Registry、
  activation 或 capability authorization。

### 建议的持久 Registry 分层

不把“可执行代码”和“持久 catalog”混为一个对象，建议拆成四层：

```text
Plugin/Adapter manifest
  → Durable Definition/Action Catalog
      → Activation Binding / revision
          → Run submission snapshot
              → Worker local executable registry
```

#### 1. Manifest

由插件或内置包提供，声明：

- `id`、`version`、provider/plugin；
- kind、capability、输入/输出 schema 引用；
- required Action refs；
- effectMode、retry、timeout、cancel、恢复能力；
- `manifestHash` 和兼容的 Cosmos SDK 版本。

Manifest 不保存 Secret，也不直接成为可执行代码。

#### 2. Durable Catalog

建议后续持久化不可变的：

- `WorkflowDefinitionCatalog(id, version, manifestHash, kind, metadata)`；
- `ActionDefinitionCatalog(id, version, manifestHash, effectMode, metadata)`；
- 同一 `(id, version)` 内容不允许原地覆盖；
- 缺失 catalog 不应被当作普通业务失败。

#### 3. Activation Binding

可变的是激活关系，而不是 Definition 内容：

- active/inactive；
- lane/capability 允许范围；
- revision/CAS；
- 新 Run 使用的默认版本；
- 已有 Run 不因激活切换而改变。

当前单用户阶段不需要审批 UI，但仍需要 revision 和可追溯激活记录。

#### 4. Run Snapshot

提交 Run 时至少固定：

- `workflowRef`、workflow version；
- Definition manifest hash；
- 输入 snapshot；
- required Action refs 或 Action manifest snapshot；
- Trigger/Connection/Source 配置引用及其版本；
- lane、priority、budget、deadline。

Worker 本地代码加载后必须与 snapshot/catalog hash 一致；不一致时不能静默
执行旧或未知实现。

### 未决策略

需要后续明确一个 durable 状态策略：

| 情况 | 当前行为 | 建议候选 |
| --- | --- | --- |
| 提交方没有 Definition | `enqueue()` 拒绝 | 保持拒绝 |
| 历史 Run 没有本地 Definition | 保持 `queued` | 增加 `definition_unavailable`/blocked projection |
| Definition manifest hash 不一致 | 当前无检查 | 不 claim，记录可观测不可执行原因 |
| Action manifest 缺失 | 执行时失败 | 提交/claim 前校验 required Action |
| 激活版本被撤销 | 当前无 catalog | 已有 Run 按 snapshot 继续或显式迁移，不能静默改版本 |

### 审查验证

- 已读取并对照：
  - `AGENTS.md`；
  - `CONTRIBUTING.md`；
  - `README.md`；
  - `PROJECT-STATUS.md`；
  - 总体架构、Durable Workflow ADR；
  - `docs/tasks/04-workflow-runtime/README.md`；
  - Worker/Application/Runtime/Prisma Store 入口和测试。
- `bun run typecheck`：通过；
- `bun run test -- --run`：17 个测试文件、163 个测试通过；
- `bun run build`：通过；
- `git diff --check`：通过；
- Docker/Compose：未运行，当前环境没有 Docker CLI；
- 真实 Node Worker、Prisma/SQLite dispatch、IPC graceful 和 Job admission：
  已在前序 Round 记录，不能替代持久 Registry 验收。

### 审查后的下一步

- 先把 Registry 的公共 schema 和 immutable/CAS 行为写成 ADR/Task 合同；
- 再增加 Prisma catalog migration，不直接把运行时代码序列化进 SQLite；
- 增加 Worker startup diagnostic：本地 executable refs、catalog refs、
  manifest hash、activation revision 的差异；
- Registry 稳定前，继续保持自定义 Workflow lane 默认关闭；
- 内置 `receipt-reconcile` 作为受控例外，不代表插件 Workflow 已开放。

## Round 68 — 持久 Definition/Action metadata catalog spike

日期：2026-08-09

### 本轮目标

把 Round 67 的建议落成最小可执行合同，验证：

```text
Plugin/Adapter manifest metadata
  → durable catalog
      → activation binding / revision
          → worker-local executable registry
```

本轮只把前三层做成可持久化 Port；最后一层仍由
`WorkflowRuntime.registerWorkflow()`/`registerAction()` 在进程内持有。
不把 TypeScript 函数、闭包或运行时代码序列化进 SQLite。

### 设计决定

#### 1. Definition 与 Action catalog 分开

新增两个不可变 metadata 对象：

- `WorkflowDefinitionCatalog`
  - `id`、`version`、`kind`、`provider`；
  - `manifestHash`；
  - `capabilities`；
  - `requiredActionRefs`；
  - 可展示/诊断的 `metadata`。
- `ActionDefinitionCatalog`
  - `id`、`version`、`provider`；
  - `manifestHash`；
  - `capabilities`；
  - `effectMode`、`retryable`、`maxAttempts`；
  - 可展示/诊断的 `metadata`。

两者以 `(id, version)` 为 immutable identity。相同内容重复注册是幂等；
数组会去重排序，metadata 按 key 规范化后比较；同版本不同内容返回 conflict，
不执行原地覆盖。

#### 2. 本轮只做 Workflow activation binding

`WorkflowDefinitionBinding` 以 `workflowId` 为逻辑绑定，保存：

- 选中的 `definitionVersion`；
- `enabled`；
- `revision`。

Binding 必须引用已存在的 Workflow catalog。首次 `upsert` 使用 revision `0`；
重复提交必须完全相同；版本切换和启停使用 `expectedRevision` CAS，成功后
revision 加一。disabled binding 解析为 `null`。

Action 本轮不另建 active pointer。Workflow catalog 通过精确的
`requiredActionRefs` 声明依赖；Action 的可执行实现和 manifest hash 一致性
检查留到 Run snapshot/Worker admission 接入。

#### 3. InMemory 与 Prisma 共用一个公共 Port

`packages/workflow-runtime/src/index.ts` 新增：

- catalog/binding Zod schema；
- conflict/not-found/binding CAS error；
- `WorkflowDefinitionRegistry`；
- `InMemoryWorkflowDefinitionRegistry`。

`packages/storage-prisma/src/definition-registry.ts` 新增：

- `PrismaWorkflowDefinitionRegistry`；
- SQLite 对 catalog/binding 的读取、写入、激活和解析。

新增 migration：

`packages/storage-prisma/prisma/migrations/20260809120000_workflow_definition_catalog/`

新增 Prisma 模型：

- `WorkflowDefinitionCatalog`；
- `ActionDefinitionCatalog`；
- `WorkflowDefinitionBinding`。

### 行为验证

#### InMemory

- 同一 Definition 版本的规范化重复注册不会产生冲突；
- manifest/content 改变会拒绝注册；
- 缺少 catalog 时不能创建 binding；
- binding 可通过 revision CAS 启停；
- Action catalog 与 executable code 分开保存；
- 返回对象为隔离副本，调用者修改不会污染 registry。

#### Prisma/SQLite

- catalog 和 binding 可以在隔离 SQLite 中持久化并重新读取；
- Workflow/Action catalog 内容冲突会被拒绝；
- active binding 可以解析到持久 Workflow metadata；
- stale revision activation 会被拒绝。

已验证命令：

- `bun run db:validate`：通过；
- `bun run db:generate`：通过；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bun run --cwd packages/storage-prisma typecheck`：通过；
- `bun run test -- --run packages/workflow-runtime/src/definition-registry.test.ts packages/workflow-runtime/src/index.test.ts`：
  2 个文件、53 个测试通过；
- `bun run test -- --run packages/storage-prisma/src/definition-registry.test.ts`：
  1 个测试通过。

### 偏差与发现

1. 本轮没有把 catalog 自动接入 `WorkflowRuntime.enqueue()`。提交侧仍只验证
   本进程 executable registry 中的 Workflow Definition。
2. `runNext()` 仍只按本地 executable `workflowRefs` claim；持久 catalog
   还没有参与 Worker 的 manifest hash admission。
3. `WorkflowRun`/Action Job 尚未保存 definition snapshot、manifest hash 或
   required Action snapshot，因此激活切换不会改变旧 Run，但旧 Run 也还没有
   可验证的 catalog 绑定事实。
4. catalog 缺失/manifest 不一致目前没有 `blocked` 或
   `definition_unavailable` durable projection；继续保持自定义 Workflow lane
   默认关闭。
5. Prisma registry 的 migration 和行为测试已加入，但尚未做多进程并发注册、
   Worker startup diagnostics、API/审计和真实插件加载验收。

### 本轮结论

当前形成了清晰的分层：

```text
持久 catalog = “系统知道有哪些定义、版本和能力”
本地 executable registry = “这个进程实际能执行什么”
Workflow Run snapshot = 后续要补的“这次执行当时依赖什么”
```

这一步可以支持后续跨 Worker 的版本/Hash admission，但还不能宣称
自定义插件 Workflow 已生产可用。

### Round 68 收口补充

代码复核又补了两项 durable registry 细节：

- Prisma 首次注册遇到并发唯一键竞争时，会重读并按内容比较，保持
  “相同内容幂等、不同内容 conflict”的公共合同；
- Prisma 读取 catalog 时重新经过 schema 和规范化路径，避免旧数据的
  JSON key 顺序影响 immutable 比较。

最终验证：

- `bun run db:validate`：通过；
- `bun run db:generate`：通过；
- 隔离 Data Root `bun run db:migrate`：16 条 migration 全部通过；
- `bun run typecheck`：通过；
- `bun run test -- --run`：19 个测试文件、167 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过；
- Repository Markdown 结构检查：35 个仓库 Markdown 文件的代码围栏、
  EOF newline 和相对链接通过；
- walkthrough Round `0..68` 连续；
- PRD 需求编号 157 个，重复检查通过；
- 原始需求文件在本轮未修改。

本轮仍未运行 Docker、浏览器、真实 RSS/平台来源、真实插件加载、
Worker 重启恢复和跨平台 OS signal 验收。

### 下一轮建议

- 给 `WorkflowRun` 增加 Definition manifest hash 和 Action dependency
  snapshot；
- 让 enqueue/claim 按 catalog + local executable hash 做一致性检查；
- 明确 catalog 缺失时的 `definition_unavailable` durable 状态和诊断；
- 再把 Trigger/Connection/采集计划的 Workflow Binding 接入同一套 binding
  与 Application Command。

## Round 69 — Workflow Run definition/action snapshot admission

日期：2026-08-09

### 本轮目标

继续收口 Round 68 留下的关键缺口：

```text
Workflow/Action executable metadata
  → Run definition snapshot
      → Worker claim admission
          → execute only matching local code
```

目标不是把 Runtime code 写进 SQLite，而是让 Run 固定“这次执行依赖的
Workflow/Action metadata”，避免不同 Worker 仅凭同一个 `workflowRef` 就执行
不同版本的本地实现。

### 设计决定

#### 1. Snapshot 是 Run 的不可变输入合同

新增：

```ts
type WorkflowRunDefinitionSnapshot = {
    workflowRef: string;
    manifestHash: string | null;
    actionDependencies: Array<{
        actionRef: string;
        manifestHash: string | null;
    }>;
};
```

`WorkflowDefinitionMetadata` 和 `ActionDefinitionMetadata` 增加可选的
`manifestHash`；Workflow 另可声明静态 `requiredActionRefs`。

`WorkflowRuntime.enqueue()`/child Workflow 创建时：

1. 解析并规范化 Workflow ref；
2. 校验声明的 required Action 已在本进程 executable registry 注册；
3. 读取这些 Action 的 manifest hash；
4. 把 Workflow 和 Action dependency snapshot 作为 Run 输入的一部分持久化。

缺少 required Action 时，提交直接拒绝，不创建 queued Run。

#### 2. Worker admission 比对 snapshot

`ClaimWorkflowRunInput` 新增 `workflowAdmissions`。`WorkflowRuntime.runNext()`
根据当前本地已注册且依赖完整的 Workflow 生成 admissions，并同时传给
InMemory/Prisma Store。

- Run snapshot 非空时，`workflowRef + snapshot JSON` 必须完全匹配；
- Workflow ref 存在但 required Action 缺失的本地 Worker 不会 claim；
- 旧 Run 的 `definitionSnapshot = null` 允许按已注册 Workflow ref 领取，
  以保持已有数据库和旧测试数据的恢复兼容；
- direct `resume()` 在 claim 前验证 snapshot，hash 不一致时抛出
  `WorkflowDefinitionAdmissionMismatchError`，不执行本地代码。

Prisma claim 使用可查询的 canonical snapshot JSON；InMemory 使用同一公共
比较语义。snapshot 匹配后才进入原有 Run lease/heartbeat/Action Job 路径。

#### 3. 数据库只保存 metadata snapshot

`WorkflowRun` 新增 `definitionSnapshotJson`，migration：

`20260809130000_workflow_run_definition_snapshot`

这列只保存 ref/hash/Action dependency metadata，不保存函数、闭包、模块路径
或其它可执行代码。Catalog 仍是持久 metadata 层，Worker executable registry
仍是进程本地实现层。

### 实现文件

- `packages/workflow-runtime/src/index.ts`
  - snapshot schema/type；
  - `WorkflowDefinitionMetadata`/`ActionDefinitionMetadata` 扩展；
  - enqueue、child、runNext 和 direct resume admission；
  - InMemory Store snapshot persistence/claim filtering。
- `packages/storage-prisma/prisma/schema.prisma`
  - `WorkflowRun.definitionSnapshotJson`。
- `packages/storage-prisma/prisma/migrations/20260809130000_workflow_run_definition_snapshot/`
  - SQLite 增量 migration。
- `packages/storage-prisma/src/workflow-store.ts`
  - Prisma snapshot JSON 读写；
  - snapshot-aware claim query。
- `packages/workflow-runtime/src/workflow-snapshot.test.ts`
  - enqueue capture、required Action admission、hash mismatch 和旧 null
    snapshot 兼容。
- `packages/storage-prisma/src/workflow-snapshot.test.ts`
  - SQLite persistence 和 snapshot claim filtering。

### 测试过程与修复

第一次 focused test 有 1 个夹具错误：

```text
Action definition not found: fixture.snapshot-action@1
```

原因是 mismatch admission 测试只注册了 Workflow，没有注册其声明的 required
Action。补齐测试夹具后重新运行：

- Workflow snapshot focused：3 个测试通过；
- Prisma snapshot focused：1 个测试通过；
- Workflow Runtime/Prisma Storage typecheck：通过；
- `git diff --check`：通过。

最终 Round 69 验证：

- 隔离 Data Root `bun run db:migrate`：17 条 migration 成功应用；
- `bun run typecheck`：通过；
- `bun run test -- --run`：21 个测试文件、171 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web。

本轮未运行 Docker、浏览器、真实平台来源、真实插件加载、跨进程 Worker
restart/reclaim 和 OS-level signal；这些仍与 focused/full package 验证分开。

### 本轮边界

当前 snapshot 只覆盖 Workflow manifest 显式声明的
`requiredActionRefs`。脚本中动态拼接、动态选择的 `callAction()` 不会自动
追加到 snapshot；否则会把“不可变提交 snapshot”和“运行中发现依赖”混为一层。
后续需要通过显式 manifest、编译期依赖提取，或受 lease fencing 保护的追加式
dependency command 解决。

另外，本轮还没有把持久 Definition/Action catalog 接入 snapshot 创建：
snapshot 目前来自提交进程的 executable registry。Catalog hash 与本地实现的
跨进程一致性诊断仍是下一步。

### 下一轮建议

- 在 Application Command 层将持久 catalog activation 与 Run snapshot 创建
  合并；
- 对 catalog hash、本地 executable hash 和 Run snapshot hash 生成 Worker
  startup diagnostic；
- 为 snapshot mismatch 增加可观测的 `definition_unavailable`/blocked
  durable projection，而不是仅依赖 queued + admission filter；
- 再设计动态 Action dependency 的显式声明/编译合同。

## Round 70 — 持久 catalog 接入 Runtime admission

日期：2026-08-09

### 本轮目标

将 Round 68 的持久 Definition/Action catalog 接到 Runtime 的两个关键边界：

```text
active catalog binding
  → new Run submission snapshot

exact catalog + local executable metadata
  → Worker claim admission
```

同时保留旧内置路径：没有注入 Registry 的 `WorkflowRuntime` 仍使用本地
Definition/Action metadata 和 Round 69 的 snapshot 语义。

### 设计决定

#### 1. Registry 是可选 Runtime Port

`WorkflowRuntimeOptions` 新增：

```ts
definitionRegistry?: WorkflowDefinitionRegistry;
```

这避免立即要求所有现有内置 Workflow 都有 catalog binding，也避免把
`PrismaClient` 传进 workflow-runtime。

#### 2. Active binding 只控制新提交

当 Runtime 注入 Registry 时，`enqueue()`/child Workflow 创建必须：

1. 按 Workflow ID 解析 active binding；
2. 校验 active catalog 的 `(id, version)` 与本地 Definition 一致；
3. 校验 Workflow manifest hash；
4. 校验 catalog `requiredActionRefs` 与本地静态依赖一致；
5. 对每个 required Action 校验本地实现和持久 Action catalog 的 manifest hash；
6. 使用 catalog metadata 生成 Run snapshot。

没有 active binding、catalog 不存在、required Action 缺失或 hash 不一致时，
提交失败，不创建 queued Run。

binding 后续被禁用或切换，不会改变已经创建的 Run。Worker 使用 Run 自己的
exact snapshot 和 exact catalog version 检查；因此旧 Run 仍可恢复，新提交则
停止。这是“activation 控制入口、snapshot 固定执行含义”的边界。

#### 3. Worker admission 不强制当前 active 版本

`runNext()` 的 admission 使用：

```text
local executable Workflow@version
  ↔ persistent Workflow catalog@same version
      ↔ local required Action metadata
          ↔ persistent Action catalog@same version
```

它调用 `getWorkflowDefinition(id, version)`，而不是
`resolveActiveWorkflow(id)`，避免历史 Run 因后来停用 binding 而无法恢复。

catalog mismatch、缺少 Action catalog 或本地 Action 缺失时，该 Worker 不会
claim；其它 Worker 或后续安装正确实现后可以继续尝试。当前仍没有
`definition_unavailable` durable projection，所以不可执行 Run 会留在 queued。

### 实现

`packages/workflow-runtime/src/index.ts` 新增：

- `WorkflowRuntimeOptions.definitionRegistry`；
- `WorkflowDefinitionCatalogInactiveError`；
- `WorkflowDefinitionCatalogMismatchError`；
- active catalog → Run snapshot 的异步 resolver；
- exact catalog/local executable admission；
- child Workflow 使用 durable snapshot；
- 旧无 Registry 路径保持兼容。

Run 提交和 Worker 行为已经覆盖：

```text
active binding
  → enqueue succeeds with catalog hashes
  → binding disabled
  → new enqueue rejected
  → existing snapshot Run succeeds
```

### 测试

#### InMemory Runtime

新增/扩展测试验证：

- active catalog 生成 Workflow/Action snapshot；
- disabled binding 拒绝新 Run；
- 已有 snapshot Run 不受 disabled binding 影响；
- local executable 和 catalog hash/required refs 不一致时不进入 admission。

#### Prisma/SQLite

新增真实 Prisma 组合测试验证：

- Prisma catalog/binding + Prisma Workflow Store + Runtime 可以共同提交 Run；
- snapshot 持久化使用 catalog hash；
- disabled binding 后新提交被拒绝；
- 旧 Run 仍通过 exact catalog version admission 并成功执行。

### 本轮偏差与限制

1. Catalog metadata 的一致性依赖 `manifestHash`；本轮不解析 manifest 文件，
   也不在数据库中保存可执行模块路径或函数。
2. 动态 `callAction()` 如果没有预先声明在 `requiredActionRefs` 中，仍不进入
   snapshot；这是脚本 Workflow 的显式依赖合同缺口，不用隐式扫描掩盖。
3. `apps/worker` 尚未把通用 Registry 注入默认 Workflow lane；当前通用 lane
   仍默认关闭，内置受控 Workflow 仍是例外。
4. Binding activation 尚无 Application Command、audit event、API 或
   blocked/unavailable projection。

### 下一轮建议

- 在 Application 层包装 catalog activation、Run enqueue 和审计事件；
- 增加 Worker startup diagnostics：catalog、本地 executable、Action hash
  和 binding revision 差异；
- 把 `definition_unavailable` 从“queued + filter”提升为可观测 durable 状态；
- 设计 Graph/IR/Adapter manifest 到 `requiredActionRefs` 的静态依赖提取。

### Round 70 收口验证

- 隔离 Data Root `bun run db:migrate`：17 条 migration 全部成功应用；
- `bun run typecheck`：通过；
- `bun run test -- --run`：21 个测试文件、173 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过。

第一次全量测试调用因工具超时没有返回断言结果；检查确认其子进程随后退出，
第二次以更长上限重跑并明确通过。第一次只记录为 timeout，不能当作测试成功
或失败。

## Round 71 — Workflow admission diagnostics

日期：2026-08-09

### 本轮目标

Round 70 已经让 Worker 在 claim 前过滤不可执行 Definition，但“为什么被过滤”
仍不可见。本轮增加只读 diagnostics，不改变 Run 的 durable status：

```text
local executable registry
  + persistent catalog
  + activation binding
  → WorkflowAdmissionDiagnostic[]
```

### 设计决定

#### 1. Diagnostics 与 durable state 分离

新增 `WorkflowAdmissionDiagnostic` 和：

```ts
runtime.inspectWorkflowAdmissions(): Promise<
    readonly WorkflowAdmissionDiagnostic[]
>;
```

它报告每个本地 Workflow Definition 的：

- `workflowRef`；
- `ready`/不可执行原因；
- 本地和 catalog manifest hash；
- catalog version；
- binding enabled/revision；
- 缺失的 Action refs；
- 检查时间。

当前 status：

```text
ready
action_not_registered
catalog_not_found
catalog_mismatch
action_catalog_not_found
invalid_definition
```

#### 2. exact executable admission，不把 disabled 当成运行时错误

Diagnostics 查询 exact `(workflowId, version)` catalog，而不是只查询 active
binding。这样：

- 新提交仍由 active binding 控制；
- 历史 snapshot Run 的 executable admission 仍可在 binding disabled 时为
  `ready`；
- Worker 可以明确展示“代码和 catalog 一致，但当前 binding 已停用”；
- catalog 缺失/Action 缺失/hash 不一致可以在 startup 或管理界面展示，而不是
  只看到 queued Run 没有变化。

#### 3. 诊断是只读的

本轮不修改：

- `WorkflowRun` status；
- Job lease；
- checkpoint；
- binding revision；
- DomainEvent/Outbox。

因此不会因为一次诊断调用给运行时引入新的写入竞态。

### 实现与测试

`packages/workflow-runtime/src/index.ts` 新增 diagnostics contract 和
`inspectWorkflowAdmissions()`。它复用 Round 70 的本地/catalog/hash 检查：

- 没有 Registry：检查本地 Definition 和 required Action；
- 有 Registry：检查 exact Workflow catalog、Action catalog、manifest hash
  和 binding revision；
- 已禁用 binding 在 executable metadata 一致时仍报告 `ready`，但带有
  disabled detail。

测试覆盖：

- 本地 required Action 未注册；
- 持久 Workflow catalog 缺失；
- active binding；
- disabled binding；
- Prisma catalog + Prisma Workflow Store + Runtime 的组合诊断。

Focused 验证：

- `packages/workflow-runtime/src/workflow-snapshot.test.ts`：5 个测试通过；
- `packages/storage-prisma/src/workflow-snapshot.test.ts`：2 个测试通过；
- `bun run typecheck:workflow-runtime`：通过；
- `bun run typecheck:storage`：通过；
- `git diff --check`：通过。

### 本轮边界

Diagnostics 目前仍是 Runtime Port，尚未接入 `apps/worker` 启动日志、API 或
Web。`catalog_not_found` 也仍不会自动变成 `definition_unavailable` durable
projection；后续需要定义重试、恢复、告警和清理策略后再写状态表。

### 下一轮建议

- 在 Worker bootstrap 中输出一次结构化 admission diagnostics；
- 为不可执行 Run 设计 durable projection、重试和恢复语义；
- 将 Binding activation 包装为 Application Command + audit event；
- 继续保持 diagnostics 不直接持有 Prisma/SQLite 依赖。

### Round 71 收口验证

- Round 70 已验证的隔离 Data Root migration：17 条 migration 全部成功应用；
- `bun run typecheck`：通过；
- `bun run test -- --run`：21 个测试文件、174 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过。

全量并行测试第一次出现测试基础设施问题：既有
`packages/storage-prisma/src/index.test.ts` 在多个 Prisma/SQLite 文件并行时
超过 Vitest 默认 5 秒 timeout，随后 cleanup 遇到 SQLite `EBUSY`。单独运行该
文件 13 个测试通过；将 `vitest.config.ts` 的 test/hook timeout 调整为 15 秒
后重跑全量测试通过。该调整不改变产品运行时，只修正并行集成测试的资源成本
边界。

## Round 72 — Worker bootstrap diagnostics 接线

日期：2026-08-09

### 本轮目标

把 Runtime 的只读 `inspectWorkflowAdmissions()` 接到真实 Worker bootstrap：

```text
WorkerPollerSupervisor 创建 Workflow slot
  → Runtime 实例已完成注册
      → inspectWorkflowAdmissions()
          → structured admission logs
```

本轮不改变 claim、Run 状态、Job lease、checkpoint 或 shutdown 语义。

### 设计决定

#### 1. 诊断发生在 Runtime 创建之后

`WorkerPollerSupervisor` 的构造阶段会为每个 lane slot 创建 poller，因此
Workflow lane 增加 `onRuntimeCreated` 回调，bootstrap 收集实际创建的 Runtime。
Supervisor 创建完成后，Worker 调用：

```ts
reportWorkflowAdmissionDiagnostics(runtimes, logger);
```

这样诊断看到的是已经注册内置 Workflow/Action 的真实 Runtime，而不是一个
脱离 Worker 组合的临时实例。

#### 2. 诊断失败不阻断启动

每个 Runtime 独立执行诊断：

- `ready` 输出 `info`；
- 非 ready 输出 `warn`；
- Registry/存储诊断抛错输出
  `worker.workflow_admission_diagnostic_failed`；
- 某个 Runtime 诊断失败不会阻止其它 Runtime、心跳或 poller 启动。

日志事件 `worker.workflow_admission_diagnostic` 携带：

- worker/slot 对应的 `workerId`、lane；
- `workflowRef`、status、detail；
- local/catalog hash 和 catalog version；
- binding enabled/revision；
- missing Action refs；
- checkedAt。

当 `COSMOS_WORKER_WORKFLOW_CONCURRENCY=0` 时没有 Workflow Runtime，也不会
伪造“全局 ready”日志。

### 实现文件

- `packages/application/src/index.ts`
  - `WorkflowRunWorkerPollerLaneOptions.onRuntimeCreated`；
  - Workflow slot 创建后的 Runtime 回调。
- `apps/worker/src/bootstrap.ts`
  - `WorkerPollerLaneCompositionOptions.onWorkflowRuntimeCreated`；
  - `reportWorkflowAdmissionDiagnostics()`。
- `apps/worker/src/main.ts`
  - 收集真实 Runtime；
  - Supervisor 创建后输出 diagnostics。
- `apps/worker/src/bootstrap.test.ts`
  - ready diagnostics；
  - 诊断存储失败隔离；
  - 既有 lane/owner 行为保持。

### focused 验证

- `apps/worker/src/bootstrap.test.ts`：11 个测试通过；
- `bun run --cwd apps/worker typecheck`：通过；
- `git diff --check`：通过。

### 本轮边界

1. 生产 Worker 当前仍没有默认注入 `PrismaWorkflowDefinitionRegistry`，所以
   现有生产日志主要反映本地 executable registry；catalog-backed diagnostics
   需要显式启用/独立配置。
2. diagnostics 仍然只读，不会把不可执行 Run 自动标记为 blocked，也不会发
   DomainEvent/Outbox。
3. Web/API 尚未展示 diagnostics；后续需要决定 startup 日志、管理 API 和
   durable projection 的职责边界。

### 下一轮建议

- 为 Worker 增加显式 `COSMOS_WORKER_WORKFLOW_REGISTRY` 配置和持久 Registry
  组合；
- 启动时输出 catalog/local implementation/binding revision 差异；
- 再设计 `definition_unavailable` 的 durable 状态和恢复策略。

### Round 72 收口验证

- `bun run typecheck`：通过；
- `bun run test -- --run`：21 个测试文件、175 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过；
- Markdown 结构、相对链接和 walkthrough 连续性检查将在本轮最终文档收口时
  一并复核。

## Round 73 — Worker opt-in catalog-backed Runtime

日期：2026-08-09

### 本轮目标

把持久 Definition/Action Registry 以显式开关接入真实 Worker，同时保留安全的
默认兼容路径：

```text
COSMOS_WORKER_WORKFLOW_REGISTRY=disabled
  → 旧本地 executable Runtime

COSMOS_WORKER_WORKFLOW_REGISTRY=prisma
  → Prisma catalog/binding
      → catalog-backed Workflow Runtime admission
```

### 设计决定

#### 1. Registry opt-in，默认不改变 Worker

`readWorkerBootstrapConfig()` 新增：

```text
workflowDefinitionRegistry: "disabled" | "prisma"
```

默认 `disabled`。非法值在 bootstrap config 读取阶段拒绝。

`prisma` 模式下，`apps/worker/src/main.ts`：

1. 初始化 `PrismaWorkflowDefinitionRegistry`；
2. 注册内置 receipt reconciliation Action/Workflow catalog；
3. 缺少 Workflow binding 时创建 enabled revision `0`；
4. 已有 binding 原样保留，不把 disabled binding 自动重新启用；
5. 每个 Workflow Runtime 注入同一 Registry；
6. Worker bootstrap diagnostics 读取真实 catalog/local executable 状态。

#### 2. 内置定义拥有稳定 manifest metadata

内置 Action/Workflow 增加：

```text
Action:   builtin:cosmos.receipt.reconcile@1
Workflow: builtin:cosmos.maintenance.receipt-reconcile@1
```

Workflow 声明 required Action：

```text
cosmos.receipt.reconcile@1
```

注册 helper 是幂等的；如果管理员此前将 binding disabled，再次启动不会偷偷
恢复 enabled。

### 实现文件

- `packages/workflow-runtime/src/index.ts`
  - 内置 manifest hash；
  - receipt catalog 注册 helper；
  - 内置 Workflow/Action required metadata。
- `apps/worker/src/bootstrap.ts`
  - `COSMOS_WORKER_WORKFLOW_REGISTRY` 配置；
  - enum validation。
- `apps/worker/src/main.ts`
  - Prisma Registry 初始化；
  - catalog 注册；
  - Runtime 注入。
- `packages/workflow-runtime/src/definition-registry.test.ts`
  - built-in catalog 注册；
  - disabled binding 不被重新启用。
- `apps/worker/src/bootstrap.test.ts`
  - 默认/`prisma` 配置和非法值。

### Node production smoke

在隔离 Data Root 中：

1. `bun run db:migrate` 成功应用 17 条 migration；
2. 使用已构建的 `node apps/worker/dist/main.js`；
3. 设置：

```text
NODE_ENV=production
COSMOS_WORKER_WORKFLOW_REGISTRY=prisma
COSMOS_WORKER_WORKFLOW_CONCURRENCY=1
COSMOS_WORKER_TEST_CONTROL=ipc
```

观察结果：

- Node Worker 正常启动；
- 同一 SQLite 中有 1 条内置 Action catalog；
- 有 1 条内置 Workflow catalog；
- 有 1 条 enabled Workflow binding，revision `0`；
- 输出：
  `worker.workflow_admission_diagnostic`
  - `workflowRef=cosmos.maintenance.receipt-reconcile@1`
  - `status=ready`
  - local/catalog manifest hash 相同；
  - `bindingEnabled=true`、`bindingRevision=0`；
- 通过 IPC graceful shutdown，exit code `0`。

另以 `COSMOS_WORKER_WORKFLOW_CONCURRENCY=0` 验证：即使 Registry 为 prisma，
没有 Workflow Runtime 时不输出虚假的 Workflow ready。

### 验证

- `bun run typecheck`：通过；
- `bun run test -- --run`：21 个测试文件、176 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `git diff --check`：通过；
- Node production opt-in smoke：通过。

### 本轮边界

1. 只有内置 receipt Workflow 自动注册；插件 manifest 的安装、catalog 导入、
   activation API 和版本迁移仍未实现。
2. `prisma` 开关只解决本地可信 Worker 的持久 metadata admission，不是远端
   Worker、认证、多用户或权限隔离。
3. disabled binding 的已有 snapshot Run 仍按 exact version 恢复，新提交被
   active binding 拒绝。
4. Docker、浏览器、真实平台来源和 OS-level signal 仍未验收。

### 下一轮建议

- 将插件 manifest 导入、catalog 注册和 binding activation 包装为 Application
  Command + audit event；
- 增加 Worker startup catalog/local/binding revision diagnostics 的 API；
- 设计 `definition_unavailable` durable projection 和恢复触发器；
- 继续保持默认 Registry disabled，直到插件加载和回滚合同稳定。

## Round 74 — Application Command 与 durable Definition admission

日期：2026-08-09

### 本轮目标

把 Round 73 留下的两个控制面缺口做成可验证的 Runtime 接缝：

```text
Transport / CLI / Adapter
  → WorkflowCommandService
      → Registry / Runtime / WorkflowStore
          → catalog state + command audit event

queued Run
  → admission refresh
      → unknown / ready / definition_unavailable
          → recovery 后重新 claim
```

### 设计决定

#### 1. `WorkflowCommandService` 是应用层控制面 façade

新增 `packages/application/src/workflow-commands.ts`，统一包装：

- Workflow Definition catalog 注册；
- Action Definition catalog 注册；
- Workflow Binding upsert；
- Binding activation/disable 的 revision/CAS；
- Workflow Run enqueue。

每个命令都需要稳定 `commandId`。接受后写入 system-scoped：

```text
workflow.command.action_definition_registered
workflow.command.workflow_definition_registered
workflow.command.workflow_binding_upserted
workflow.command.workflow_binding_activated
workflow.command.run_enqueued
```

这些事件的 `runId` 可以为 `null`，但仍进入同一 DomainEvent/Outbox 顺序和
Consumer cursor；它们不伪造一个 Workflow Run。Run enqueue 同时把 command id
作为 durable idempotency key，重复请求返回原 Run。Binding command 在已有
成功事件时重放原结果，不再次绕过 CAS。

本轮没有把完整输入复制到审计 payload；Run 自己保存输入快照，事件只保存
command、actor、目标、定义 snapshot 和 Run 摘要，避免把未来 Secret/敏感输入
扩散到事件流。

#### 2. Definition admission 是 Run 的 durable projection，不是 terminal failure

`WorkflowRun` 新增：

```text
idempotencyKey
admissionStatus: unknown | ready | definition_unavailable
admissionError
admissionCheckedAt
```

Worker 每次 dispatch 前，对当前 Runtime 已知的 Workflow refs 刷新 admission：

- 本地 Definition、Action、catalog 和 snapshot 一致：`ready`；
- 缺少 catalog/Action 或 snapshot 不可执行：`definition_unavailable`；
- `definition_unavailable` 的 Run 不参与 claim；
- catalog/代码恢复后变回 `ready`，随后同一 Run 可被新 Worker claim。

初始 `unknown → ready` 只更新 projection，不制造噪声事件；实际阻塞和恢复才
追加：

```text
workflow.run.definition_unavailable
workflow.run.definition_available
```

这样不会改变既有 child Workflow 的 terminal event 顺序，也不会把暂时缺少
插件的 Run 误报成业务失败。

#### 3. Workflow Outbox 支持 aggregate-only event

`WorkflowOutboxMessage.workflowRunId` 改为可空。原有 Workflow terminal 事件仍
必须有 Run scope；control-plane event 可以只有 `aggregateType/aggregateId`。
父唤醒 Consumer 对缺少 Run scope 的 terminal event 明确拒绝，不把 null 当成
合法父子关系。

#### 4. 当前仍保留的事务边界

`WorkflowCommandService` 已统一入口和幂等事件合同，但当前 Registry mutation
和审计 append 仍是两个 Port 调用；应用崩溃可能留下“catalog 已变、audit 尚未
写入”的窄窗口。下一轮应实现 transaction-aware command repository，把两者在
Prisma 同一 transaction 中收口；本轮不伪装成已解决。

### 实现文件

- `packages/application/src/workflow-commands.ts`
  - Command façade、command id、catalog/binding/Run 命令；
  - audit event；
  - binding/Run 命令重试重放。
- `packages/workflow-runtime/src/index.ts`
  - Run idempotency；
  - admission projection；
  - aggregate-only event/outbox；
  - unavailable/available 恢复事件。
- `packages/storage-prisma/src/workflow-store.ts`
  - Prisma Run idempotency；
  - admission refresh；
  - nullable Workflow Outbox scope；
  - system-scoped event persistence。
- `packages/storage-prisma/prisma/schema.prisma`
  - `WorkflowRun` admission/idempotency 字段；
  - nullable `WorkflowOutboxMessage.workflowRunId`。
- `packages/storage-prisma/prisma/migrations/20260809140000_workflow_admission_and_control_events/migration.sql`
- `packages/application/src/workflow-commands.test.ts`
- `packages/workflow-runtime/src/workflow-admission.test.ts`
- `packages/storage-prisma/src/workflow-control.test.ts`

### 验证

已验证：

- Application command focused：2 个测试通过；
- Workflow admission focused：1 个测试通过；
- Prisma control/admission focused：2 个测试通过；
- 既有 Workflow Runtime：50 个测试通过；
- 既有 Prisma Workflow Store：28 个测试通过；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bun run --cwd packages/application typecheck`：通过；
- `bun run --cwd packages/storage-prisma typecheck`：通过；
- `bun run db:generate`：通过；
- `bun run db:validate`：通过；
- 隔离 Data Root `bun run db:migrate`：18 条 migration 全部成功应用；
- `git diff --check`：通过。

未验证：

- 全量测试、全量 build；
- Docker、浏览器、真实插件和真实外部来源；
- 多进程并发 command audit race；
- transaction-aware command repository；
- API/Web 暴露 admission projection。

### 本轮偏差与下一步

1. 本轮把 audit 和 Outbox scope 扩成可空，解决了“catalog event 伪造 Run”的
   建模问题，但还没有把 catalog mutation + audit 写入收口到一个 Prisma transaction。
2. admission refresh 只处理当前 Worker 已注册的 Workflow refs；未知插件的
   Run 仍保持 queued，避免一个能力不完整的 Worker 把其它 Worker 的 Run 错误
   标成 unavailable。后续需要能力路由/Worker lane 合同。
3. migration smoke 使用的临时 Data Root 位于 `.agent/tmp`；清理命令受当前
   PowerShell 安全策略拦截，未删除该明确的测试目录，不影响仓库文件。
4. 下一轮优先实现 transaction-aware command repository 和多进程 command
   idempotency race，再接 Worker/API 的 admission snapshot 查询。

## Round 75 — Transaction-aware command repository 与 atomic enqueue

日期：2026-08-09

### 本轮目标

把 Round 74 留下的控制面窄窗口收口为可复用的 Application Port：

```text
Application Command
  → WorkflowCommandRepository
      → Prisma transaction
          → catalog / binding / WorkflowRun
          → DomainEvent
          → WorkflowOutboxMessage
```

本轮不把测试接入误认为全应用生产 wiring；API、Worker 和 Transport 的实际
组装仍待后续验收。

### 设计决定

#### 1. Application 只依赖 command repository Port

`packages/application/src/workflow-commands.ts` 新增：

- `WorkflowCommandAudit`；
- `WorkflowCommandRepository`；
- `WorkflowCommandServiceOptions.commandRepository`。

`WorkflowCommandService` 仍是 Transport/CLI/Adapter 的公共 façade。配置了
repository 时，catalog、Binding 和 enqueue 命令由 atomic port 执行；没有配置
时保留原有 InMemory/legacy fallback，方便当前 spike 和渐进迁移。

#### 2. Prisma command repository 负责一次事务内的状态与审计

新增：

```text
packages/storage-prisma/src/workflow-command-repository.ts
```

实现：

- Workflow Definition catalog 注册；
- Action Definition catalog 注册；
- Workflow Binding upsert；
- Binding activation/disable 的 revision/CAS；
- Workflow Run enqueue。

每个操作使用稳定的：

```text
workflow-command:<operation>:<commandId>
```

作为 DomainEvent `eventId` 和 command idempotency key。事务内同时写入：

- catalog/binding/WorkflowRun；
- system-scoped DomainEvent；
- `WorkflowOutboxMessage`。

控制面事件的 `workflowRunId` 继续为 `null`，不伪造 Workflow Run。

#### 3. Runtime 先准备不可变 Run 输入

`packages/workflow-runtime/src/index.ts` 新增
`WorkflowRuntime.prepareEnqueue()`，负责：

- 校验 Workflow、输入、timeout、lane、priority；
- 解析 durable Definition snapshot；
- 生成 `CreateWorkflowRunInput`。

Prisma repository 再把这个输入与 `run_enqueued` audit/outbox 一起持久化。
这样 Runtime 保留执行 Definition 的知识，Storage 不需要反向依赖脚本
Workflow，而数据库事务仍能覆盖 Run 创建和控制面审计。

`PrismaWorkflowStore` 抽出 `createWorkflowRunTx()` 供普通 Store 和 command
repository 共享，避免两套 Run 持久化字段漂移。

### 实现文件

- `packages/application/src/workflow-commands.ts`
  - atomic command repository Port；
  - repository 分支；
  - enqueue 使用 `prepareEnqueue()`。
- `packages/workflow-runtime/src/index.ts`
  - `prepareEnqueue()`；
  - `enqueue()` 复用准备结果。
- `packages/storage-prisma/src/workflow-command-repository.ts`
  - Prisma atomic command repository；
  - command event replay、unique race recovery；
  - Definition/Binding/Run result reconstruction。
- `packages/storage-prisma/src/workflow-store.ts`
  - `createWorkflowRunTx()`；
  - 导出 `toWorkflowRunRecord()` 供事务 repository 重建结果。
- `packages/storage-prisma/src/definition-registry.ts`
  - 支持 Prisma `TransactionClient` scope。
- `packages/storage-prisma/src/index.ts`
  - 导出 `PrismaWorkflowCommandRepository`。
- `packages/storage-prisma/src/workflow-control.test.ts`
  - audit 失败时 catalog rollback；
  - 两个 Prisma Client 并发 catalog command；
  - atomic Run + enqueue audit；
  - 两个 Prisma Client 并发 enqueue command；
  - command façade 与 Prisma repository 集成。
- `docs/tasks/04-workflow-runtime/README.md`
  - 更新当前实现和生产 wiring 缺口。

### 验证

已验证：

- `bunx vitest run packages/storage-prisma/src/workflow-control.test.ts`
  - 6 tests passed；
- `bunx vitest run packages/workflow-runtime/src/index.test.ts
  packages/application/src/workflow-commands.test.ts
  packages/storage-prisma/src/workflow-control.test.ts`
  - 57 tests passed；
- `bun run typecheck:packages`
  - 通过；
- concurrent catalog command：
  - 1 catalog row；
  - 1 DomainEvent；
  - 1 Outbox message；
- concurrent enqueue command：
  - 1 WorkflowRun；
  - 1 `run_enqueued` DomainEvent；
  - 1 Outbox message；
- audit 时间非法时，catalog、DomainEvent 和 Outbox 均未留下部分提交。

未验证：

- `typecheck:apps` 在本轮新变更后的再次运行；
- 全量测试、全量 build；
- API/Worker 生产 wiring 是否已经注入 atomic repository；
- Docker、浏览器、真实来源、远程 Worker、多进程长时间恢复；
- command event 的跨进程 transient SQLite busy/retry policy；
- Graph/IR、Adapter manifest、Connection/Secret/State 和 Knowledge/Research。

### 偏差与后续事项

1. 当前 atomic repository 是显式 Application Port，不强行让 Prisma Store
   了解全部 Workflow Runtime；但 API/Worker 尚未统一组装该 Port，legacy
   fallback 仍可能绕过 atomic boundary。
2. `prepareEnqueue()` 暂时把 durable snapshot preparation 与持久提交分开；
   snapshot 生成不产生外部副作用。后续需要补 Run input snapshot 与
   Definition/Binding revision 的 Transport 查询合同。
3. system-scoped DomainEvent 的数据库唯一性仍主要依赖显式 `eventId`；后续
   应把 control event 的全局幂等约束和 event schema 一起稳定下来。
4. 下一轮优先检查全量 build、apps typecheck 和真实启动 wiring，然后再补
   worker ownership/unknown Workflow routing 与 API admission snapshot。

## Round 76 — idempotent replay 回归与 command audit repair

日期：2026-08-09

### 触发原因

Round 75 引入 `WorkflowRuntime.prepareEnqueue()` 后，质量审查发现
`WorkflowRuntime.enqueue()` 的执行顺序发生了变化：

```text
旧行为：
解析 Definition / 输入
→ 先查已有 idempotency Run
→ 已有同请求直接返回
→ 新 Run 才做 durable Definition admission
```

重构后的错误顺序是先做 durable snapshot，再查已有 Run。这样会让一个已经
成功入队的 Run 在当前 Binding 被禁用后无法幂等重放，错误地抛出
`WorkflowDefinitionCatalogInactiveError`。

### 修复

`packages/workflow-runtime/src/index.ts` 现在拆分为：

- `resolveEnqueueInput()`：校验 timeout、解析 Workflow 和输入；
- `prepareEnqueueFromResolved()`：只为新提交生成 durable Definition snapshot；
- `prepareEnqueue()`：供 Application atomic enqueue 使用；
- `enqueue()`：恢复“先检查已有 idempotency Run，再生成 snapshot”的既有语义。

这样：

- 已有同 key、同输入 Run 不会因为当前 Binding 暂时不可用而重新 admission；
- 新 Run 仍必须拥有可持久的 Definition snapshot；
- Application atomic enqueue 可以继续复用 Runtime 的 snapshot preparation，
  而不让 Storage 反向依赖脚本 Workflow。

新增测试：

```text
WorkflowRuntime spike
  replays an idempotent enqueue without re-admitting an existing Run
```

### Command audit repair

质量审查同时发现：如果一个旧路径已经创建了 `WorkflowRun`，但还没有
`run_enqueued` audit，Prisma repository 原本会直接返回已有 Run，继续保留
“Run 无控制面审计”的缺口。

`PrismaWorkflowCommandRepository.enqueueWorkflow()` 现在在发现已有同 key、
同输入 Run 时，仍会在同一个 transaction 内追加：

- `workflow.command.run_enqueued` DomainEvent；
- 对应 `WorkflowOutboxMessage`。

这只修复缺少 audit 的 legacy 状态；已有成功 command event 仍通过 event replay
直接返回，不能重复推进业务 CAS。

新增 Prisma 测试：

```text
repairs a missing enqueue audit when an idempotent Run already exists
```

同时把 command event/outbox 的底层写入复用
`PrismaWorkflowStore.appendWorkflowEventTx()`，避免 command repository 和
Workflow Store 各自维护一套 DomainEvent/Outbox canonical persistence。

### 只读架构审查结论

结论：当前 spike 可以继续，尚不具备合并/生产完成证据。

已确认：

- Application → `WorkflowCommandRepository` Port 方向正确；
- Prisma transaction 覆盖 catalog、Binding、Run、DomainEvent 和 Outbox；
- 两个 Prisma Client 的并发 command 只产生一个 durable 结果；
- API/Worker 当前没有实际创建 `WorkflowCommandService`，因此 atomic repository
  目前是可调用的 storage adapter 和 focused integration，不是完整 Transport
  wiring。

后续需要：

- API/CLI 的 Workflow catalog/binding/run command endpoint；
- 生产启动时显式组装 `WorkflowCommandService + PrismaWorkflowCommandRepository`；
- 未知 Workflow ref 的 Worker ownership/capability routing；
- SQLite transient busy/retry policy；
- Docker、浏览器、OS-level restart 和真实来源验收。

### 验证

已验证：

- `bunx vitest run packages/workflow-runtime/src/index.test.ts
  -t "replays an idempotent enqueue"`：通过；
- `bunx vitest run packages/storage-prisma/src/workflow-control.test.ts
  -t "repairs a missing enqueue audit"`：通过；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bun run --cwd packages/storage-prisma typecheck`：通过；
- 全量测试：24 个测试文件、187 个测试通过。

本轮尚未重新运行：

- 全量 `typecheck:packages` / `typecheck:apps`；
- 全量 build；
- Docker、浏览器、真实来源和生产 wiring smoke。

## Round 77 — Worker capability descriptor 与未知 Workflow 接管

日期：2026-08-09

### 审查结论

当前 `WorkflowRuntime.runNext()` 的 `workflowRefs` 过滤已经提供了一个安全的
本地 capability 边界：

```text
Worker A 只注册 A@1
  → 只能 refresh/claim A@1
  → B@1 保持 queued

Worker B 后续注册 B@1
  → B@1 才能被 B claim
```

这解决的是“错误 Worker 不要执行未知 Workflow”，不是完整的持久 ownership。
当前没有 Worker Registry，所以未知 ref 可能长期保持：

```text
Run.status = queued
Run.admissionStatus = unknown
```

这在单用户/可信扩展阶段是保守且可恢复的结果；不能把它改成
`definition_unavailable`，否则一个没有插件的 Worker 可能阻塞另一个拥有插件
的 Worker。

### 实现

`packages/workflow-runtime/src/index.ts` 新增：

```ts
type WorkflowWorkerCapabilitySnapshot = {
    workerId: string;
    lane: string;
    workflowRefs: readonly string[];
    actionRefs: readonly string[];
};
```

`WorkflowRuntime.describeWorkerCapabilities()` 返回排序后的本地 descriptor。
它表达：

- 当前 Runtime 的 Worker identity；
- 当前 lane；
- 当前进程实际注册的 Workflow refs；
- 当前进程实际注册的 Action refs。

`apps/worker/src/bootstrap.ts` 的 admission diagnostic 日志带上
`workflowRefs/actionRefs`，让启动诊断能回答“这个 Worker 能执行什么”。

新增测试：

- Runtime capability snapshot 字段稳定且排序；
- Worker A 不领取 B 的 Run；
- Worker B 后续出现后可以接管 B 的 queued Run；
- Bootstrap admission diagnostic 携带本地 capability refs。

### 边界

本轮明确不做：

- 持久 Worker Registry 或 per-slot heartbeat；
- 基于 capability 的全局 scheduler/owner assignment；
- Run 的 `no_capable_worker` 状态；
- 远程 Worker、插件 manifest 自动加载或跨进程 capability handshake。

下一步若要做跨 Worker 路由，应新增独立的 Worker Registration/Capability
projection，而不是把 `WorkerHeartbeat.status` 或 Run lease 伪装成 ownership：

```text
Worker Registration
  → advertised Workflow/Action/Capability
  → routing diagnostic / eligible worker set
  → Run lease claim
```

Run lease 仍是最终执行 ownership；Registration 只能用于发现和路由，不能替代
claim CAS 或 lease fencing。

### 验证

已验证：

- `bunx vitest run packages/workflow-runtime/src/index.test.ts
  -t "describes local capabilities"`：通过；
- `bunx vitest run apps/worker/src/bootstrap.test.ts
  -t "reports Workflow admission diagnostics"`：通过。

本轮代码变更后的全量 `typecheck`、test、build 和 Markdown 门禁待下一次
集中验证。

## Round 78 — 持久 Worker Registry 生命周期接入与 ready heartbeat fencing

日期：2026-08-09

### 目标

把 Round 77 的本地 `WorkerCapabilitySnapshot` 推进到真实 Worker slot 生命周期：

```text
Workflow Runtime slot
  → register(ready, capability refs, TTL, token)
  → heartbeat(timer + poll tick)
  → token/TTL 失效后重新 register
  → Supervisor drain
  → stop(registration token)
```

同时保持一条硬边界：

```text
WorkflowWorkerRegistration = discovery/routing projection
Run lease = execution ownership
```

Registry 不得成为 Workflow Run 的第二套 durable truth，也不能替代
`claimNextRun()` 的 lease CAS 和 fencing。

### 实施

#### 1. Supervisor 增加 slot lifecycle seam

`packages/application/src/index.ts` 的 `WorkerPollerPort` 现在可以实现：

```ts
start(signal: AbortSignal): Promise<void> | void
stop(): Promise<void> | void
```

`WorkerPollerSupervisor` 保证：

- 每个 slot 只初始化一次；
- `tick()` 和长循环共用初始化路径；
- stop/drain 等待当前 poll 和异步 observation；
- one-shot `tick()` 后调用 `stop()` 也会释放已初始化的 slot 资源。

这让 Registry 生命周期不需要依赖 `apps/worker` 的私有全局 Map。

#### 2. Workflow Worker registration slot

`packages/workflow-runtime/src/index.ts` 新增
`WorkflowWorkerRegistrationSlot`：

- 使用 `workerId = instanceId:lane:slot`；
- 注册 `instanceId`、版本、lane、Workflow refs、Action refs 和 capability；
- 默认以 `ready` 写入 Registry；
- 使用串行 operation tail，避免 timer、poll tick 和 shutdown 并发更新同一 token；
- TTL timer 覆盖长时间 Workflow 执行和长时间空闲 poll interval；
- 每次 Workflow poll 前再次 heartbeat；
- `heartbeat()` 返回 `null` 时认为 token 已被 fencing 或 registration 已过期，重新注册；
- Registry 临时不可用时 fail-open，记录错误但不阻断 Runtime 继续通过 Run lease 执行；
- stop 清理 timer，并尽力使用当前 token 写入 stopped。

这不是 Run lease：旧 registration token 被拒绝不会自动取消当前 Run，当前 Run
仍由自身 Job/Run heartbeat 和 lease fencing 决定。

#### 3. 真实 Worker wiring

`apps/worker/src/main.ts` 增加显式 Prisma wiring：

```text
COSMOS_WORKFLOW_WORKER_REGISTRY=disabled | prisma
COSMOS_WORKFLOW_WORKER_REGISTRATION_TTL_MS=120000
COSMOS_WORKFLOW_WORKER_HEARTBEAT_MS=30000
```

默认仍为 `disabled`，以保持已有 Worker 行为；`prisma` 模式下，每个 Workflow
Run lane slot 注入 `PrismaWorkflowWorkerRegistry`。`heartbeatMs` 必须严格小于
`ttlMs`。

新增 migration：

```text
20260809150000_workflow_worker_registry
```

新增的 `WorkflowWorkerRegistration` 持久模型包含 registration token、状态、
TTL、lastSeen、lane、Workflow/Action refs 和 capabilities，并按 status/lane
建立 active 查询索引。

#### 4. 修复进程 heartbeat 的真实竞态

Node/IPC smoke 发现原来的 `onTick` 使用 fire-and-forget：

```text
poll tick
  → void heartbeat(ready)
  → shutdown heartbeat(stopped)
  → late ready 覆盖 stopped
```

`apps/worker/src/bootstrap.ts` 新增
`createWorkerTickObserver()`，主进程现在 `await heartbeat(ready)`；Supervisor
drain 会等待这个 observation 完成后才进入 stopped heartbeat 阶段。
这不是测试放宽，而是修复持久状态写入顺序的真实生产竞态。

### 测试与验证

新增/更新测试覆盖：

- Supervisor slot lifecycle 只初始化/停止一次；
- registration 当前 token heartbeat；
- token 被 fencing 后重新注册；
- Registry 暂时不可用不阻断 Runtime；
- 空闲 poll loop 的独立 TTL heartbeat；
- heartbeat interval 不得大于等于 TTL；
- Worker bootstrap config 和 observer 等待语义；
- Workflow Run lane 的 Prisma/InMemory registration 接线。

已通过：

- `bunx vitest run packages/workflow-runtime/src/workflow-worker-registration.test.ts`；
- `bunx vitest run apps/worker/src/bootstrap.test.ts packages/workflow-runtime/src/workflow-worker-registration.test.ts`；
- `bun run typecheck:packages`；
- `bun run typecheck:apps`；
- `bunx vitest run --reporter=dot`：27 个测试文件、197 个测试通过；
- `bun run build`；
- `git diff --check`；
- 隔离 Data Root 上 `db:validate`、`db:migrate`、`db:status`，19 条 migration
  全部应用且数据库 up to date。

真实 Node/IPC smoke 使用 production `apps/worker/dist/main.js`，并打开：

```text
COSMOS_WORKER_WORKFLOW_CONCURRENCY=1
COSMOS_WORKER_WORKFLOW_REGISTRY=prisma
COSMOS_WORKFLOW_WORKER_REGISTRY=prisma
COSMOS_WORKER_TEST_CONTROL=ipc
```

已观察到：

- `worker.started`，Workflow lane concurrency=1；
- IPC shutdown 后 `worker.stopped`，exit code 为 0；
- `WorkflowWorkerRegistration.status = stopped` 且 `stoppedAt` 非空；
- `WorkerHeartbeat.status = stopped` 且 `stoppedAt` 非空；
- registration 中保存了内置 receipt Workflow/Action refs。

### 当前边界

本轮没有实现：

- active Worker/capability 的 API 查询或管理页面；
- 全局 owner assignment、scheduler、capacity、fairness 或 lane backpressure；
- `no_capable_worker` durable 状态和 snapshot projection；
- 远程 Worker、插件 manifest handshake、Connection/Secret/State；
- Docker signal、OS-level SIGTERM、长时间网络分区和多进程 restart/reclaim。

当前 Registry 只能回答“哪些 slot 最近声明自己 ready、能执行哪些 refs”，不能
回答“哪个 Worker 已经拥有某个 Run”；后者仍只由 Run lease 表达。

### 下一步

先增加一个只读的 active Worker capability 查询 Port/diagnostic projection，明确
其与 Run admission 的关系；在此基础上再讨论 owner assignment 和未知 Workflow
的 `no_capable_worker` 状态。不要在本轮直接引入 scheduler 或第二套 ownership。

## Round 79 — active Worker capability 只读查询链路

日期：2026-08-09

### 目标

把上一轮已经持久化的 `WorkflowWorkerRegistration` 变成一个可由管理端和未来
Web/CLI 使用的只读 Service Query：

```text
PrismaWorkflowWorkerRegistry
  → WorkflowWorkerDiscoveryService
  → GET /api/v1/workflow-workers
  → HttpCosmosClient.listWorkflowWorkers()
```

此查询只表达“最近仍然 active 的 capability 声明”，不表达 Run owner，不改变
`queued` Run 的 admission，也不自动生成 `no_capable_worker` 状态。
registration token 永远留在 Runtime/Storage 边界内。

### 实施

#### 1. Public contract

`packages/contracts/src/index.ts` 增加：

- `workflowWorkerQuerySchema`
  - `lane`
  - `workflowRef`
  - 可重复/逗号分隔的 `capability`
  - 有界 `staleAfterMs`，默认 90 秒；
- `workflowWorkerSnapshotSchema`
  - worker/instance/version/lane/status；
  - Workflow refs、Action refs、capabilities；
  - `registeredAt`、`lastSeenAt`、`expiresAt`、`stoppedAt`；
  - 不包含 `registrationToken`。

时间在 HTTP DTO 中统一为 ISO 字符串；Registry 内部仍可使用 timestamp number
做 TTL 比较。

#### 2. Application Query boundary

`packages/application/src/workflow-workers.ts` 新增
`WorkflowWorkerDiscoveryService`：

- 通过 `Pick<WorkflowWorkerRegistry, "listActive">` 接收查询 Port；
- 每次查询使用服务端当前时间，不接受客户端伪造 `now`；
- 默认/调用方提供 bounded stale window；
- 将 Runtime registration 映射成无 token 的 public snapshot。

这使 Nest Controller 不直接依赖 Runtime registration token，也不把 Prisma 查询
细节复制到 API。

#### 3. API 与 HTTP Client

Nest API 新增：

```text
GET /api/v1/workflow-workers
```

API Module 使用 API 自己的 `PrismaWorkflowWorkerRegistry` 实例读取与 Worker
共享 Data Root 的 registration projection，再交给
`WorkflowWorkerDiscoveryService`。

`packages/transport-http` 新增：

```ts
client.listWorkflowWorkers({
    lane,
    workflowRef,
    capability,
    staleAfterMs,
});
```

Web 仍然只能通过这个 Service Endpoint 访问，不能读取 Prisma、SQLite 或 Data
Root。

#### 4. Smoke harness

扩展 `scripts/smoke-node.ps1`：当
`COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 时，额外轮询
`/api/v1/workflow-workers`，检查至少一个 active Worker，并显式断言响应没有
`registrationToken`。默认 Registry disabled 的基础 smoke 行为不改变。

### 验证

已通过：

- contracts/Application/API/Transport focused tests：17 个测试通过；
- 全量 `bunx vitest run --reporter=dot`：28 个测试文件、203 个测试通过；
- `bun run typecheck:packages`；
- `bun run typecheck:apps`；
- `bun run build`；
- `git diff --check`；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，Registry=prisma、Workflow
  concurrency=1：
  - health worker=`ready`；
  - `workflowWorkers=1`；
  - `workflowWorkerTokenExposed=false`；
  - 原有 queued Run、fixture Feed、Search、Story、SSE 链路继续通过。

### 当前边界

本轮没有实现：

- API 根据 active Worker 自动分配 Run owner；
- capacity、fairness、backpressure、priority routing 或 lane scheduler；
- capability 变化事件、历史 registration 查询和 durable no-owner projection；
- 远程 Worker、跨机器 registry、插件 manifest handshake；
- API 认证/多用户隔离。

`GET /api/v1/workflow-workers` 是诊断/发现查询，不是调度 API。下一步若设计
`no_capable_worker`，必须先定义 active snapshot 的时间语义、capability 版本和
“暂时没有 Worker”与“定义本身不存在”的区分。

### 下一步

继续审查 `unknown Workflow Run` 的恢复链路：先设计
`no_capable_worker` 是否需要持久 projection、何时进入/退出、如何避免一个没有
插件的 Worker 把其它 Worker 的 Run 误判为永久不可用；在没有明确状态机前不接
owner scheduler。

## Round 80 — 多 Worker admission 负面证据审查与正向收口

日期：2026-08-09

### 审查结论

结论：`需修改`。当前 `WorkflowRun.admissionStatus` 是全局字段，但此前由
任意 Worker 按自己的本地 Definition/Action/catalog 视角刷新。具体链路是：

```text
Worker A 本地有 Workflow ref
  → Action/catalog/snapshot 暂时不匹配
  → refreshWorkflowAdmissions()
  → 全局 Run = definition_unavailable

Worker B 本地有同一 ref 且可执行
  → 之后才能把 Run 改回 ready
```

这会产生两个问题：

1. 一个能力不完整或暂时故障的 Worker 可以覆盖全局状态；
2. `definition_unavailable` 被误用来同时表达“这个 Worker 不能执行”和
   “系统没有任何 Worker 能执行”。

代码证据：

- `WorkflowRuntime.runNext()` 只把当前 Runtime 的 `workflowRefs` 和
  `workflowAdmissions` 传给 Store；
- InMemory/Prisma `refreshWorkflowAdmissions()` 只处理当前 Worker 已知的 refs；
- `claimNextRun()` 使用本地 refs 和 admissions 做 claim filter；
- `WorkflowWorkerRegistration.listActive()` 只是 TTL discovery projection，
  没有参与 Run admission 或 ownership。

### 决定

当前先采用“负面本地证据不升级为全局状态”的最小安全合同：

```text
本地 Definition/Action/catalog/snapshot 精确匹配
  → 可以写 admissionStatus=ready

本地缺 Action、catalog 缺失或 snapshot mismatch
  → 不写 definition_unavailable
  → Run 保持原状态，通常仍为 unknown
  → 只进入 Worker diagnostics
```

`definition_unavailable` 保留给未来具有权威输入的独立 projector；它不能由
任意 Worker 的本地 refresh 直接覆盖。`no_capable_worker` 也不加入当前
`admissionStatus`，而是未来单独的 availability/routing projection。

### 实施

修改：

- `packages/workflow-runtime/src/index.ts`
  - InMemory `refreshWorkflowAdmissions()` 只接受正向 `ready`；
  - 不再因负面本地观察写入 `definition_unavailable` 或事件；
  - 已由权威 projector 写入的 `definition_unavailable`，仍可被精确匹配的
    Worker 正向恢复为 `ready`。
- `packages/storage-prisma/src/workflow-store.ts`
  - Prisma refresh 使用同一正向收口语义；
  - 负面本地观察不会更新 `admissionCheckedAt` 或全局 error。
- `packages/workflow-runtime/src/workflow-admission.test.ts`
  - 缺 catalog 的本地 Worker 保持 `unknown`；
  - 不产生错误的 `definition_unavailable` event；
  - catalog 恢复后仍能 claim 并成功收口。
- `packages/storage-prisma/src/workflow-control.test.ts`
  - Prisma/SQLite 链路同步验证。

本轮没有新增数据库字段或 migration；这是对已有 projection 写入边界的收紧，
不是新增另一套状态表。

### 未来状态模型

后续若实现 `no_capable_worker`，建议不要继续扩大单个
`WorkflowRun.admissionStatus`，而是增加独立的 routing observation/projection，
至少保存：

```text
runId
workflowRef
lane
checkedAt
registryAuthority
staleAfterMs
activeWorkerIds
capabilityEvidence
status: unknown | capable_worker_seen | no_capable_worker | registry_unavailable
```

必须区分：

- Definition/catalog 不存在；
- 当前没有 active registration；
- Registry disabled/unavailable；
- 有 Worker 声明 ref，但其 manifest/action 仍不匹配；
- Worker 已出现但还没有完成 heartbeat。

这个 projection 只能用于诊断、排序和未来 scheduler 输入；Run lease 仍是
最终 claim/ownership 边界。

### 验证

已通过：

- `bunx vitest run packages/workflow-runtime/src/workflow-admission.test.ts`；
- `bunx vitest run packages/workflow-runtime/src/workflow-admission.test.ts packages/storage-prisma/src/workflow-control.test.ts -t "admission|unavailable"`；
- Application/API/Transport focused tests 仍保持通过。
- `bun run typecheck:packages`；
- `bun run typecheck:apps`；
- `bunx vitest run --reporter=dot`：28 个测试文件、203 个测试通过；
- `bun run build`；
- `git diff --check`。

Docker 和浏览器验收仍未运行；当前仍没有实现 `no_capable_worker` projector 或
owner scheduler。

### 审查状态

本轮按 `project-quality-audit` 的 architecture/code 模式执行，只读追踪了
Worker Runtime、Store、Registry、API Query 和测试 seam；结论是当前正向收口修复
可以继续，但完整多 Worker routing 仍需独立 Task/ADR 设计和恢复验收。

## Round 81 — Worker discovery envelope 与可观测状态

日期：2026-08-09

### 目标

修复 `GET /api/v1/workflow-workers` 只返回数组造成的可观测性缺口。空数组
无法区分 Registry 被关闭、Registry 查询失败和 Registry 正常但当前没有
active slot。

### 决定

对外查询统一返回：

```text
{
  status: enabled | disabled | unavailable,
  checkedAt,
  staleAfterMs,
  items: WorkflowWorkerSnapshot[]
}
```

- `enabled`：Registry 查询成功；`items` 为空是合法状态；
- `disabled`：配置关闭，Application 不查询 Registry；
- `unavailable`：Registry 查询失败，Application 返回空 `items` 并通过
  diagnostics callback 记录错误；
- envelope 不暴露 registration token，也不把 `unavailable` 或空结果推断为
  `definition_unavailable` / `no_capable_worker`。

Application 仍保留 `listActive()`，它只是返回 envelope 的 `items` 便利方法；
API 和 HTTP Service Client 使用完整 envelope。

### 实施

- `packages/contracts`
  - 新增 `workflowWorkerDiscoverySchema` 和 `WorkflowWorkerDiscovery`；
  - 固定 status、检查时间、stale window 和公开 Worker snapshot。
- `packages/application/src/workflow-workers.ts`
  - 新增 `enabled`、`onError` 和 `discover()`；
  - disabled 路径不触碰 Registry；
  - Registry 异常转为 `unavailable`，diagnostics callback 异常不会遮蔽原始
    查询结果。
- `apps/api`
  - `/api/v1/workflow-workers` 返回并校验 discovery envelope；
  - `COSMOS_WORKFLOW_WORKER_REGISTRY=disabled` 时查询显式返回 disabled；
  - API 侧 Registry 异常进入结构化日志。
- `packages/transport-http`
  - `HttpCosmosClient.listWorkflowWorkers()` 校验并返回 envelope。
- `scripts/smoke-node.ps1`
  - 改为检查 envelope 的 `status` 和 `items`，继续断言 token 不泄露。

### TDD 验证

先运行新增 Application 测试，确认旧实现以
`disabled.discover is not a function` 失败；补齐合同和实现后：

- `bunx vitest run packages/application/src/workflow-workers.test.ts packages/contracts/src/index.test.ts`：通过，11 个测试；
- `bunx vitest run apps/api/src/app.controller.test.ts packages/transport-http/src/index.test.ts`：通过，8 个测试；
- `bun run typecheck:packages`：通过。
- `bun run typecheck:apps`：通过；
- `bunx vitest run --reporter=dot`：通过，28 个测试文件、205 个测试；
- `bun run build`：通过；
- `git diff --check`：通过；
- 首次 Node smoke 使用 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 但未启用
  Workflow lane，按既有默认 `COSMOS_WORKER_WORKFLOW_CONCURRENCY=0` 得到空
  active set；显式补充 `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1` 后 smoke 通过，
  说明这是调用配置不完整，不是 envelope 或 Registry 查询回归；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`（Registry=prisma、
  Workflow concurrency=1）：通过，`workflowWorkers=1`，
  `workflowWorkerTokenExposed=false`，原有 API/Feed/Search/Story/SSE 链路继续
  通过。

Markdown 结构、链接和术语检查在本轮后续验证阶段继续执行。

### 当前边界

本轮只改善 discovery 的观察合同，没有实现：

- owner assignment、scheduler、capacity/fairness/backpressure；
- `no_capable_worker` durable projection；
- capability 变化事件、历史 registration 查询或远程 Registry；
- API 认证和多用户隔离。

## Round 82 — unknown Workflow Run 恢复链路审查

日期：2026-08-09

### 审查结论

结论：`需后续设计`，当前 Run claim 链路没有发现因 Worker Registry 状态导致的
安全回归；但“长期没有可执行 Worker”目前只有 `queued + admissionStatus=unknown`
这一种持久表现，缺少可供用户和运维区分的诊断投影。

### 真实执行链路

当前脚本式 Runtime 的 claim 输入是本地可执行能力，而不是 Worker Registry：

```text
WorkflowRuntime.runNext()
  → executableWorkflowAdmissions()
  → refreshWorkflowAdmissions(只写正向 ready)
  → expireDueRuns()
  → claimNextRun(本地 workflowRefs + admission snapshot)
  → Run lease
  → executeClaimedRun()
```

因此：

| Registry 观察 | Run claim 语义 | 结论 |
| --- | --- | --- |
| `disabled` | 不查询 Registry；本地拥有 Definition 的 Runtime 仍可 claim | 正确 |
| `unavailable` | 注册/心跳 fail-open；本地 Runtime 仍可 claim | 正确 |
| `enabled + items=[]` | 没有 Worker 能在此刻被发现，但不写 `definition_unavailable` | 正确且不能自动推断定义不存在 |
| `enabled + capable Worker` | 只是外部 capability evidence；最终仍由本地 admission 和 Run lease claim | 正确 |

未知 Workflow Run 的恢复链路已由现有行为测试覆盖：

```text
Worker A 没有该 Workflow ref
  → Run 保持 queued / admissionStatus=unknown
Worker B 后续注册同一 ref 且 Definition/Action/catalog/snapshot 匹配
  → 正向 admission ready
  → Worker B 获取 Run lease
  → Workflow 成功收口
```

`definition_unavailable` 如果未来由权威 projector 写入，仍只能由精确匹配的
Worker 正向证据恢复；单个 Worker 的负面本地观察不会覆盖全局状态。

### 新发现与修复

发现 API/Worker 的 Registry 默认值存在语义漂移：

- Worker bootstrap 的默认值是 `disabled`；
- API 之前只判断“不等于 disabled”，未设置环境变量时会查询 Prisma 并返回
  `enabled + 空 items`；
- 这会把“整个 Worker Registry 功能未启用”误报成“Registry 已启用但没有
  active slot”。

修复：

- 新增 `apps/api/src/workflow-worker-config.ts`；
- 只有显式 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 才启用 API discovery；
- 新增配置行为测试，覆盖未设置、`disabled` 和 `prisma` 三种输入。

### 后续设计边界

本轮不新增 `WorkflowRun.admissionStatus` 枚举，也不新增 `no_capable_worker`
migration。未来需要独立的 routing/availability projection，至少保存：

```text
runId
workflowRef
lane
checkedAt
registryAuthority
registryStatus
staleAfterMs
activeWorkerIds
capabilityEvidence
status: unknown | capable_worker_seen | no_capable_worker | registry_unavailable
```

它只能用于诊断、排序和未来 scheduler 输入，不能取得 Run ownership；当 Registry
disabled、unavailable 或 observation 过期时，必须保持 unknown/不可判定，而不是
自动终止或阻塞 Run。

### 验证

- `bunx vitest run ...`：unknown Run、不具备 ref 的 Worker、后续 Worker 接管、
  admission 恢复和 Registry fail-open focused tests 通过；
- 配置 seam 初始测试先以缺少模块失败，补实现后通过；
- `bunx vitest run apps/api/src/workflow-worker-config.test.ts apps/api/src/app.controller.test.ts`：通过，5 个测试；
- `bun run typecheck:apps`：通过；
- `bunx vitest run --reporter=dot`：通过，29 个测试文件、206 个测试；
- `bun run build`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`（显式
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma` 和
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`）：通过，`workflowWorkers=1`，
  `workflowWorkerTokenExposed=false`，Node API/Worker、fixture、Feed/Search/
  Story、SSE 和结构化日志链路继续通过；
- `git diff --check` 和 Markdown 结构/链接检查：通过。

### 当前边界

仍未实现：

- durable availability/routing projection；
- `no_capable_worker` 的进入、退出、过期和重算状态机；
- owner scheduler、capacity/fairness/backpressure；
- Registry 与 Definition/Action manifest hash 的完整能力证据。

## Round 83 — Worker capability evidence 边界审查

日期：2026-08-09

### 审查结论

结论：`需后续设计`。当前 Worker Registry 的 capability advertisement 足够做
粗粒度发现和候选过滤，但不足以单独支持某个 Run 的
`capable_worker_seen` 或 `no_capable_worker` 权威判断。

### 证据对照

| 来源 | 当前提供 | 能否证明精确执行 |
| --- | --- | --- |
| `WorkflowWorkerRegistration` | `workflowRefs`、`actionRefs`、generic `capabilities`、Worker version、TTL | 不能；这是 Worker 自报的 ref-level hint |
| `WorkflowRun.definitionSnapshot` | Workflow manifest hash、Action dependency refs/hash | 是 Run 需要的精确要求 |
| `WorkflowRuntime.inspectWorkflowAdmissions()` | local/catalog manifest hash、catalog version、binding revision、缺失 Action 和 mismatch 原因 | 是本地正向/负向 admission evidence，但当前只输出诊断 |
| Run lease claim | CAS、lease token、过期接管和 fencing | 是最终 execution ownership，不是 discovery evidence |

因此当前链路只能安全地表达：

```text
Registry ref 命中
  → candidate / advertised capability

local Definition + Action + catalog + Run snapshot 精确匹配
  → positive admission evidence

Run lease CAS
  → actual owner
```

不能把第一步直接升级成第三步。

### 决定

本轮不扩展 `WorkflowWorkerRegistration` 数据库字段，也不新增 migration。未来
若实现 availability projector，应新增版本化 capability evidence，至少包含：

```text
workerId
workflowRef
workflowManifestHash
actionDependencies: [{ actionRef, manifestHash }]
capabilities
observedAt
expiresAt
```

判断规则：

- 精确匹配 Run snapshot 且 observation 未过期，才能标记
  `capable_worker_seen`；
- 只有 Registry 明确 enabled、snapshot 在 stale window 内、候选 evidence 已
  评估且没有精确匹配时，才允许生成 `no_capable_worker` 诊断；
- disabled、unavailable、旧版 registration、证据缺失或 manifest mismatch
  都只能保持 unknown/局部 `worker_ineligible`，不能自动改变 Run claim；
- capability evidence 只能服务诊断、排序和未来 scheduler，Run lease 仍是唯一
  ownership。

旧 Worker 继续只发送 refs/capabilities 是有意的向后兼容状态；它们不能成为
availability projector 的权威输入，直到完成带版本的 manifest handshake。

### 代码与文档变更

- 保持 `WorkflowWorkerRegistration` 的持久 schema 不变；
- 补充 `CONTEXT.md`、总体架构、Durable Workflow ADR 和 Task 当前边界；
- 明确 `WorkflowWorkerCapabilitySnapshot`、Run snapshot、admission diagnostic
  和 Run lease 的层级；
- 没有把第二套 Runtime、scheduler 或 availability 状态混入当前 claim path。

### 验证

- 已审查 `WorkflowRuntime.runNext()`、InMemory/Prisma
  `refreshWorkflowAdmissions()`、`claimNextRun()`、Worker registration slot、
  `inspectWorkflowAdmissions()` 和 Prisma schema；
- unknown Run、后续 Worker 接管、负面 admission 不升级和 Registry fail-open
  focused tests 已通过；
- Round 82 的全量 29 个测试文件、206 个测试、apps typecheck、build 和
  explicit Registry Node smoke 继续作为本轮基线；
- 本轮未新增代码或数据库变更，因此不重新宣称 Docker、浏览器、远程 Worker
  或真实插件验收。

### 下一步

先为 capability evidence 写一个不落库的纯评估 spike，验证
`RunDefinitionSnapshot × WorkerEvidence → capable / ineligible / unknown` 的
状态语义；评估通过后再决定是否增加 Registration manifest version 和 Prisma
projection。

## Round 84 — WorkerEvidence × RunSnapshot 纯评估 spike

日期：2026-08-09

### 目标

在不改变 Run claim、Worker Registry schema 或 Prisma migration 的前提下，先把
未来 availability projector 的最小判断函数跑通：

```text
WorkerEvidence × RunDefinitionSnapshot
  → capable | ineligible | unknown
```

### 实施

`packages/workflow-runtime/src/index.ts` 新增：

- `WorkflowWorkerWorkflowEvidence`：Workflow ref + manifest hash；
- `WorkflowWorkerActionEvidence`：Action ref + manifest hash；
- `WorkflowWorkerCapabilityEvidence`：Worker/lane、旧 ref advertisement、
  Workflow/Action evidence、capability hint、观察时间和过期时间；
- `assessWorkflowWorkerCapability()`：纯函数，不读 Store、不读 Registry、不
  写 Run，也不持有 lease；
- `capable` 只在 lane、Workflow ref、Workflow manifest 和全部 Action
  dependency manifest 精确匹配且 evidence 未过期时产生；
- `ineligible` 只表示已知的 lane/ref/manifest mismatch；
- `unknown` 表示 Run snapshot 缺失、evidence 缺失或过期，禁止据此生成
  `no_capable_worker`。

generic `capabilities` 有意不参与精确比较；它仍然只是 coarse routing hint，
直到未来有版本化 manifest handshake。

### TDD 验证

先运行新增测试，旧实现以 `assessWorkflowWorkerCapability is not a function`
失败；实现后：

- `bunx vitest run packages/workflow-runtime/src/workflow-capability.test.ts`：
  通过，5 个测试；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bunx vitest run --reporter=dot`：通过，30 个测试文件、211 个测试；
- apps typecheck、Node production build 和 Round 82 的 explicit Registry smoke
  作为整体验证基线继续通过。

### 边界

本轮没有：

- 将 evidence 加入 `WorkflowWorkerRegistration` 或 Prisma；
- 将 evaluator 接入 `WorkflowRuntime.runNext()`、`claimNextRun()` 或 scheduler；
- 生成 durable `no_capable_worker`；
- 处理远程 Worker 的 evidence 签名、版本协商或不可信插件。

下一步需要用多 Worker、旧版 evidence、binding revision 和 stale window 的组合
场景审查 evaluator 是否足以进入版本化 Registration contract；在此之前保持
当前 claim path 不变。

## Round 85 — 多 Worker availability aggregate 纯评估

日期：2026-08-09

### 目标

验证多个 Worker assessment 聚合成 availability 状态时，不会把局部样本、旧
evidence 或 Registry 故障误报成 `no_capable_worker`。

### 状态机

```text
disabled
  → unknown / registry_disabled

unavailable
  → registry_unavailable

enabled + stale discovery
  → unknown / discovery_stale

enabled + fresh + capable Worker
  → capable_worker_seen

enabled + fresh + assessmentComplete=true + empty set
  → no_capable_worker / no_active_worker

enabled + fresh + assessmentComplete=true + all ineligible
  → no_capable_worker / all_workers_ineligible

enabled + partial set or any unknown evidence
  → unknown / worker_evidence_incomplete
```

`no_capable_worker` 在这里仍然只是只读诊断结果，不表示 Definition 不存在，
不终止 Run，不阻塞 Run lease，也不触发 owner scheduler。

### 实施

`packages/workflow-runtime/src/index.ts` 新增：

- `WorkflowWorkerAvailabilityAggregate`；
- `aggregateWorkflowWorkerAvailability()`；
- `assessmentComplete` 明确表示输入是否覆盖了 Registry 本次完整 active
  snapshot；
- `workerIds`、`capableWorkerIds` 作为未来 projection 的最小可追溯输出。

聚合 evaluator 只接受合格的单 Worker assessment；它不读取
`WorkflowWorkerRegistration`，不调用 Prisma，不创建 DomainEvent。

### TDD 验证

先补 partial assessment 测试，旧实现错误地产生
`no_capable_worker / all_workers_ineligible`；加入 `assessmentComplete` 后：

- `bunx vitest run packages/workflow-runtime/src/workflow-capability.test.ts`：
  通过，10 个测试；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- 全量 tests、全仓 typecheck、build、Node smoke 和文档检查在本轮后续验证。

### 决定与边界

- `assessmentComplete` 是进入 `no_capable_worker` 的必要条件；
- 任意 capable evidence 优先于其它 ineligible/unknown assessment；
- 任意 unknown evidence 会阻止 no-capable 聚合；
- disabled/unavailable/stale 永远不能生成 no-capable；
- 本轮仍不新增 Registration evidence 字段、Prisma migration、API endpoint 或
  scheduler。

下一步可以用这个纯 evaluator 反推版本化 Registration evidence 的最小字段；
在确定旧 Worker/旧 registration 的兼容语义前，不进入持久化。

## Round 86 — 版本化 Worker capability evidence 的兼容持久化

日期：2026-08-10

### 目标

把 Round 84/85 的纯 capability evaluator 结果，以向后兼容方式接入 Worker
descriptor、Registration、Application snapshot 和 Prisma persistence，同时不改动
Run claim、lease ownership 或 scheduler。

### 实施

- `WorkflowWorkerCapabilitySnapshot`、register/heartbeat input 和 registration
  fields 增加：

  ```text
  evidenceVersion
  evidenceAuthority
  workflowEvidence[]
  actionEvidence[]
  ```

- 旧调用方可以省略这些字段；统一默认：

  ```text
  evidenceVersion=0
  evidenceAuthority=legacy
  workflowEvidence=[]
  actionEvidence=[]
  ```

- 当前 `WorkflowRuntime.describeWorkerCapabilities()` 生成：

  ```text
  evidenceVersion=1
  evidenceAuthority=local-executable
  ```

  并附带本地 Workflow/Action manifest hash。`local-executable` 只说明本地
  Runtime 能执行，不能被 availability evaluator 当成 `catalog-admitted` 证明。

- `WorkflowWorkerRegistration` 持久化新增四列，旧行使用数据库默认值：

  ```text
  evidenceVersion INTEGER NOT NULL DEFAULT 0
  evidenceAuthority TEXT NOT NULL DEFAULT 'legacy'
  workflowEvidenceJson TEXT NOT NULL DEFAULT '[]'
  actionEvidenceJson TEXT NOT NULL DEFAULT '[]'
  ```

- Prisma storage read boundary 对 authority、Workflow evidence 和 Action evidence
  分别使用 Zod schema 解析；不再直接把数据库 JSON 字符串强转为领域类型。
- Application discovery snapshot 公开 evidence，但仍不公开 registration token。
- InMemory Registry 与 Prisma Registry 共享相同的 normalization：去重、排序和
  受限字段校验。

新增 migration：

```text
packages/storage-prisma/prisma/migrations/
└── 20260809160000_workflow_worker_evidence/migration.sql
```

### 保持不变的边界

- Worker Registry 仍只是 discovery/routing projection，不是 Run owner。
- Run lease 仍是唯一执行 ownership；没有把 capability evidence 接入
  `runNext()`、`claimNextRun()` 或 `scheduler`。
- 旧 Worker/旧 registration 可以继续注册和心跳，但只能被 evaluator 判为
  `unknown`，不能凭 ref-only 或 legacy evidence 生成 `capable`。
- 只有后续带 `catalog-admitted`、新版本、fresh 且完整 manifest 的 evidence，
  才有资格进入 `capable_worker_seen`。
- 未新增 `WorkflowRun.admissionStatus` 值，也没有把 `no_capable_worker` 变成
  Run 的失败或阻塞状态。

### TDD 与验证

Focused 验证：

- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bunx vitest run packages/workflow-runtime/src/workflow-capability.test.ts`：
  通过，11 个测试；
- `bunx vitest run packages/workflow-runtime/src/index.test.ts packages/workflow-runtime/src/workflow-worker-registration.test.ts`：
  通过，2 个文件、56 个测试；
- `bunx vitest run packages/storage-prisma/src/workflow-worker-registry.test.ts`：
  通过，1 个测试；
- `bunx vitest run packages/application/src/workflow-workers.test.ts packages/contracts/src/index.test.ts`：
  通过，2 个文件、11 个测试；
- `bun run --cwd packages/storage-prisma typecheck`：通过。

全量验证：

- `bunx vitest run --reporter=dot`：通过，30 个测试文件、217 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `git diff --check`：通过。

生产迁移与 Node smoke：

- `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`；
- `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`；
- `scripts/smoke-node.ps1`：通过；
- 空 SQLite 实际应用 20 个 migration，包含
  `20260809160000_workflow_worker_evidence`；
- smoke 关键结果：

  ```json
  {
    "healthWorker": "ready",
    "feedItems": 3,
    "searchItems": 1,
    "sseHasRunEvent": true,
    "sseHasFeedEvent": true,
    "workflowWorkers": 1,
    "workflowWorkerTokenExposed": false
  }
  ```

### 验证口径偏差

曾误运行 `bun test --reporter=dot`。Bun 原生测试器扫描了 build 生成的
`dist` 测试，并出现 20 个与测试运行器不兼容的失败/错误，例如
`vi.hoisted is not a function`、Nest decorator 元数据错误和
`Expected promise / Received PrismaPromise`。这不是仓库的 Vitest 基线，未作为
本轮产品回归结论；随后使用仓库实际的 `bunx vitest run --reporter=dot`，
30 个文件、217 个测试全部通过。

### 当前边界与下一步

本轮仍未实现：

- catalog-admitted evidence 的签发、校验和跨进程信任链；
- durable availability/routing projection；
- scheduler 对 capability/capacity/fairness/backpressure 的消费；
- 远程 Worker 的 evidence 版本协商；
- Docker、浏览器、真实插件和远程 Worker 验收。

下一轮应优先验证“catalog-admitted evidence 从 Definition/Action catalog 到
Worker registration 的完整生成与拒绝路径”，仍保持 capability discovery 不
拥有 Run lease，避免把自报 evidence 误当成可执行性事实。

## Round 87 — catalog-admitted evidence 纯合同

日期：2026-08-10

### 目标

在不接入 Registry 查询、Worker registration、Run claim 或 scheduler 的前提
下，先验证本地 Worker capability snapshot 如何根据持久 Definition/Action
catalog 生成可追踪的 `catalog-admitted` 子集。

### 新增纯函数

`packages/workflow-runtime/src/index.ts` 新增：

```ts
createCatalogAdmittedWorkflowWorkerEvidence({
    local,
    workflowCatalogs,
    actionCatalogs,
})
```

输出：

```text
admitted
partial
rejected
```

以及：

- `snapshot`：只包含完整匹配的 Workflow 和其 Action dependencies；
- `rejections[]`：按 Workflow/Action/ref 稳定排序的拒绝记录。

当前拒绝原因：

```text
workflow_catalog_missing
workflow_evidence_missing
workflow_manifest_mismatch
action_ref_not_advertised
action_evidence_missing
action_catalog_missing
action_manifest_mismatch
```

判断链路为：

```text
local workflow ref
→ Workflow catalog 存在且 manifest 匹配
→ catalog requiredActionRefs 逐个检查
→ local Action ref/evidence 存在
→ Action catalog 存在且 manifest 匹配
→ Workflow + dependencies 进入 catalog-admitted snapshot
```

一个 Worker 可以同时包含有效和无效的本地 capability：

- 所有 advertised Workflow 都通过：`admitted`；
- 至少一个完整 Workflow 通过、另有拒绝：`partial`；
- 没有完整 Workflow 通过：`rejected`，`snapshot=null`。

### 重要边界

- 这是内容一致性检查，不是签名、远程认证或信任根；
- 不检查 Workflow activation binding 是否 enabled；binding 决定新 Run 是否能
  创建，catalog evidence 只回答“本地 executable 与 catalog 内容是否精确一致”；
- 不把 `generic capabilities` 当作精确 evidence；
- 不写 Registry、DomainEvent、Outbox 或 Prisma，不改变
  `WorkflowRun.admissionStatus`；
- 不取得、不刷新、不替代 Run lease；
- 当前 `WorkflowWorkerRegistrationSlot` 仍注册 Runtime 的
  `local-executable` snapshot。后续若接入 catalog admission，应新增显式的
  async Application/Storage adapter，不能在同步 descriptor 中偷偷读取数据库。

### TDD 验证

先新增：

```text
packages/workflow-runtime/src/workflow-worker-catalog-evidence.test.ts
```

当前实现从 `createCatalogAdmittedWorkflowWorkerEvidence is not a function`
开始，随后补最小纯函数。覆盖：

- exact Workflow + Action admitted；
- 一个有效 Workflow 与一个缺失 Action catalog 的 partial；
- Workflow catalog 缺失与 Workflow manifest mismatch；
- Action catalog manifest mismatch；
- admitted snapshot 不包含未通过完整链路的 ref。

验证结果：

- `bunx vitest run packages/workflow-runtime/src/workflow-worker-catalog-evidence.test.ts`：
  通过，4 个测试；
- `bun run --cwd packages/workflow-runtime typecheck`：通过；
- `bunx vitest run --reporter=dot`：通过，31 个测试文件、221 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `scripts/smoke-node.ps1`（显式 Prisma Worker Registry）：通过；
- 空 SQLite 实际应用 20 个 migration，包含
  `20260809160000_workflow_worker_evidence`；
- Node smoke 继续验证 `workflowWorkers=1`、
  `workflowWorkerTokenExposed=false`、fixture Feed/Search/Story/SSE。

### 下一步

需要再做一个独立 seam：把这个纯函数接到一个显式的
`CatalogAdmissionPort`/Application adapter，验证：

1. Worker 只能从 Application/Storage 读取 catalog，不直接依赖 Prisma；
2. adapter 可以返回 catalog 不可用、binding 不可用和内容 mismatch 的不同
   诊断；
3. catalog admission 失败时，Worker 仍可继续 Runtime poll/Run lease；
4. catalog-admitted snapshot 只有在显式调用后才进入 registration，而不是
   自动改变当前同步 registration contract。

## Round 88 — Application CatalogAdmissionPort 与 Prisma 边界

日期：2026-08-10

### 目标

把 Round 87 的纯函数放到明确的 Application/Storage seam 上，验证 catalog 读取
失败、内容拒绝和 Runtime 执行之间的隔离；不把 Prisma client 穿透到
Workflow Runtime、Web 或 registration slot。

### 实施

`packages/application/src/workflow-worker-admission.ts` 新增：

- `WorkflowWorkerCatalogAdmissionSource`：Application/Storage loader port；
- `WorkflowWorkerCatalogAdmissionService`：只在显式调用
  `admit(localSnapshot)` 时读取 catalog，然后调用
  `createCatalogAdmittedWorkflowWorkerEvidence()`；
- `createWorkflowWorkerCatalogAdmissionSource()`：把稳定的 `id@version` ref
  转换成已有 `WorkflowDefinitionRegistry` 的
  `getWorkflowDefinition()` / `getActionDefinition()` 调用；
- `WorkflowWorkerCatalogAdmissionSourceError`：
  `catalog_unavailable` 与 `binding_unavailable` 诊断码预留。

服务返回两层状态：

```text
sourceStatus=available
  → admission=admitted | partial | rejected

sourceStatus=unavailable
  → admission=null
  → catalog_unavailable | binding_unavailable
```

这保证：

- catalog 缺失和 manifest mismatch 是“读到了 catalog，但内容不满足”的
  rejection；
- loader 抛错是“数据源不可用”，不会伪装成 `no_capable_worker`；
- `onError` 只能记录诊断，诊断 callback 自身抛错也不会破坏返回合同；
- 服务没有 `WorkflowStore`、Prisma、Job 或 lease 依赖；
- 服务不会自动修改 `WorkflowWorkerRegistrationSlot`，也不会阻止 Runtime
  poll/Run claim。

`parseDefinitionReference()` 作为 Workflow Runtime 的公共稳定 ref parser
导出，避免 Application/Storage 各自复制 `id@version` 解析逻辑。

### Prisma 接入验证

在现有 `PrismaWorkflowDefinitionRegistry` 隔离 SQLite 测试中，使用同一个
Application factory 读取真实持久 catalog：

```text
PrismaWorkflowDefinitionRegistry
  → WorkflowWorkerCatalogAdmissionSource
  → Application CatalogAdmissionService
  → pure catalog evidence admission
```

Application 没有导入 `@prisma/client`；Prisma 只停留在 Storage Registry
实现边界。

### TDD 与验证

- 新增 Application service 测试：4 个通过；
- Prisma Definition Registry + Application source bridge：通过；
- `bunx vitest run --reporter=dot`：通过，32 个测试文件、225 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `scripts/smoke-node.ps1`（显式 Prisma Worker Registry）：通过；
- 空 SQLite 实际应用 20 个 migration，包含
  `20260809160000_workflow_worker_evidence`；
- `git diff --check`：通过。

### 尚未接入的边界

- 当前 source adapter 不读取 binding；binding 仍由新 Run admission 控制，
  不影响历史 snapshot Run 的恢复；
- `binding_unavailable` 只作为 source error code 预留，尚未有 binding-aware
  loader；
- catalog-admitted snapshot 仍未自动写入 Worker registration；
- 没有签名/远程信任根，catalog-admitted 目前是同一 Cosmos Application 内的
  内容一致性结论，不是安全认证；
- availability projection、scheduler、capacity/fairness/backpressure 仍未
  实现。

### 下一步

下一轮应测试“显式 admission 结果如何被一个 registration projection 消费”：

1. local snapshot 始终保留；
2. catalog-admitted 只作为独立 projection 写入；
3. source unavailable 时不覆盖上一次有效 projection，也不改变 Run claim；
4. 旧 Worker 的 legacy/local evidence 继续兼容；
5. projection 的 lease/token 与 Run lease 完全分离。

### 文档同步与最终检查

- `CONTEXT.md`、`PROJECT-STATUS.md`、总体架构、ADR 和本 Task 当前状态已更新：
  raw evidence 已持久化，catalog admission/availability projection 仍标记为
  未完成；
- Markdown 37 个文件检查通过：无尾随空白、未闭合代码围栏、缺失末尾换行或
  仓库相对断链；
- 旧的“evidence 尚未持久化”现行表述扫描为 0；
- `git diff --check`：通过。

## Round 92 — 跨 runner / 共享 SQLite projection lease 验收

日期：2026-08-10

### 目标

把 Round 90 的 durable capability projection store 与 Round 91 的 runner
放进真实共享 SQLite 边界，验证两个独立 Prisma client/runner 在同一个
`WorkflowWorkerCapabilityProjection` 上不会同时提交 projection；同时验证
旧 runner 在 lease 被接管后不能覆盖新 runner 的结果。

### 场景

```text
Prisma client A / runner A
  → claim projection lease
  → apply revision=1

Prisma client B / runner B
  → lease 未过期时 skip
  → lease 过期后接管
  → apply revision=2

runner A 再 tick
  → 旧 owner 不能覆盖 runner B
```

新增的 Prisma focused test 使用两个独立 `PrismaClient`，而不是在单个
in-memory store 中模拟竞争。结果证明：

- projection lease 的 owner/token 与 Workflow Run、Action Job 和 Worker
  registration lease 分离；
- 未过期 lease 由第二个 runner 跳过；
- 过期后第二个 runner 可以通过 SQLite CAS 接管；
- 接管后旧 runner 的 renew/apply 都不能继续写入；
- projection revision 只能沿着当前 owner 的 CAS 路径前进；
- SQLite 重启/重新连接后的 projection 状态仍可查询。

### 验证

- `bunx vitest run --reporter=dot`：通过，36 个测试文件、239 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma COSMOS_WORKER_WORKFLOW_CONCURRENCY=1
  scripts/smoke-node.ps1`：通过；
- 隔离 SQLite 实际应用 21 条 migration，包含
  `20260809160000_workflow_worker_evidence` 和
  `20260809170000_workflow_worker_capability_projection`；
- `git diff --check`：通过。

### 结论与边界

本轮只证明了 projection consumer 的跨 client lease fencing；它没有把
capability projection 提升为 scheduler 的权威 admission，也没有改变
`WorkflowRun.admissionStatus`、Run claim 或 Job claim。

以下内容仍未验证：

- 长时间运行中的真实 Node 进程崩溃、重启和自动接管；
- registration 消失后的 stale projection 清理；
- registry unavailable、enabled 但 active set 为空、registration stopped/
  expired 三种状态的持久区分；
- API 对 projection 的授权查询快照；
- scheduler/capacity/fairness/backpressure 消费 projection 的行为。

### 下一步

下一轮先收紧 registration 消失语义：`listActive()` 返回空不能直接等价于
“删除 projection”。需要区分 registry 不可用、registry 可用但 active set
为空、registration 明确 stopped/expired，并为 stale/expired projection
提供安全查询或 cleanup grace period；清理不能转换成 Run lease，也不能在
来源不可用时抹掉 last-known admitted snapshot。

## Round 93 — registration observation 与安全 cleanup candidate seam

日期：2026-08-10

### 目标

收紧 Worker registration 消失后的语义：`listActive()` 返回空只能说明当前
没有可路由的 active slot，不能直接推导“删除 capability projection”。本轮
增加只读 inventory、过期候选查询和 grace-period 判定，但不执行删除或
tombstone。

### 实施

#### 1. 独立 registration observation source

`packages/workflow-runtime` 增加独立的
`WorkflowWorkerRegistryObservationSource` seam：

```text
listObserved({ now })
  → public registration inventory
  → no registrationToken
  → observationState: live | stopped | expired
  → terminalAt
```

它与原有 `WorkflowWorkerRegistry.listActive()` 分开：

- `listActive()` 继续只返回 ready、未过期且未超过 stale window 的 slot；
- `listObserved()` 读取持久 registration，包括 stopped 和已过期但仍保留的行；
- `status` 是持久 slot 状态，`observationState` 是基于 `now` 的只读时间判断；
- Registry 的 execution/heartbeat token 不穿过 observation source。

因此可以区分：

```text
registry unavailable
registry available + activeSetEmpty
registration observed as stopped
registration observed as expired
registration not observed
```

#### 2. Projection stale query 与 grace 判定

`WorkflowWorkerCapabilityProjectionStore` 增加有界只读：

```ts
listStale({ now, limit })
```

它只查询 `expiresAt <= now` 且已经完成写入的 projection，不删除记录；仍处于
claim 但尚未 apply 的空 projection 不会被错误读取为完整状态。Prisma adapter
和 InMemory store 都实现了该 Port。

Runner 每个 tick 先同时读取 `listActive()` 与 `listObserved()`，再处理 active
projection。随后只对 stale candidates 做纯判定：

```text
Registry unavailable
  → retain

activeSetEmpty / registration not observed
  → retain

stopped or expired + terminalAt + grace period reached
  → cleanupEligibleWorkerIds
```

`cleanupEligibleWorkerIds` 只是后续 cleanup command 的输入，不会删除
projection、清除 last-known admitted snapshot、取得 Run/Job lease 或改变
`WorkflowRun.admissionStatus`。如果同一个 `workerId` 重新注册为 live，
inventory 会使 candidate 保留。

#### 3. Projection store 的未提交行边界

Prisma `get()` 对仅由 projection lease claim 创建、尚未写入
`localSnapshotJson` 的行返回 `null`，而不是把半初始化行解析成已提交状态。
这使 query/cleanup consumer 不会把 lease reservation 当成 projection truth。

### TDD 验证

- 先写失败测试，覆盖：
  - available empty active set 不产生删除；
  - stopped registration 在 grace period 内保留，过期后只产生 candidate；
  - expired registration 在 grace period 内保留，过期后只产生 candidate；
  - stale query 返回候选但 projection 仍然存在；
  - InMemory/Prisma inventory 保留 stopped/expired 状态且不暴露 token；
- focused：5 个测试文件、13 个测试通过；
- `bunx vitest run --reporter=dot`：通过，36 个测试文件、242 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，并设置
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`、
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`：通过；
  21 条 migration、API/Worker、Feed/Search/Story/SSE、结构化日志关联和
  token 不暴露均通过；
- `git diff --check`：通过。

### 结论与边界

本轮形成的是“观察 + 候选”边界，不是 cleanup executor：

- 仍没有 projection tombstone/delete schema；
- 仍没有 cleanup Job、审计事件或恢复失败处理；
- 仍没有 API projection snapshot/query DTO；
- `listObserved()` 与 `listActive()` 目前是两个读取，长时间运行时还需要
  一个带 `checkedAt` 的原子 registry snapshot，避免跨查询时序差异；
- cleanup candidate 仍不能升级为权威 availability 或 `no_capable_worker`；
- 没有进行真实长时间 Node 崩溃、registry 数据删除、cleanup 重启接管或
  scheduler 消费验收。

### 下一步

下一轮优先设计带 `checkedAt` 的 registry inventory snapshot，并决定
registration 消失后的持久表达是保留 tombstone、设置 `retiredAt`，还是只依赖
有界 stale query；随后再把 cleanup candidate 映射为独立 Maintenance Workflow，
仍保持它不拥有 Run lease。

## Round 94 — checkedAt Registry observation snapshot

日期：2026-08-10

### 目标

修复 Round 93 留下的时序摩擦：Runner 之前分别读取 `listActive()` 和
`listObserved()`。即使两个调用使用同一个 `now`，它们仍可能在 registration
heartbeat、stop 或 replacement 之间看到不同的状态。本轮把 Runner 的输入收敛
为单次带 `checkedAt` 的 observation snapshot。

### 实施

新增 `WorkflowWorkerRegistryObservationSnapshotSource`：

```ts
observe({
    now,
    staleAfterMs,
}) -> {
    checkedAt,
    staleAfterMs,
    active,
    observed,
}
```

其中：

- `checkedAt` 必须回显调用方提供的时间；
- `observed` 是不含 registration token 的完整 durable registration inventory；
- `active` 是同一批 registration 按 ready、TTL 和 stale window 计算出的可路由
  子集；
- `active` 与 `observed` 共享同一个 source read，不允许 Runner 再次调用
  `listActive/listObserved`；
- `listActive()` 与 `listObserved()` 保留为兼容读取，不作为 Runner 的双读路径。

InMemory Registry 在同一个内存快照上计算两个集合；Prisma Registry 在一次
`findMany` 结果上计算两个集合。没有新增 migration，也没有把 snapshot 变成
Run/Job/registration lease。

Runner 增加 checkedAt/输入一致性校验：

```text
snapshot.checkedAt !== tick.now
  → registry_unavailable result

snapshot.staleAfterMs !== runner.staleAfterMs
  → registry_unavailable result
```

这样 mismatch 不会把一个未知时点的 capability observation 当成当前状态。

### TDD 验证

- 先写失败测试，要求 Runner 使用一次 `observe()`，并锁定
  `checkedAt/staleAfterMs/active/observed` 合同；
- InMemory Registry 验证 draining/empty active set 仍能从同一 snapshot 看到
  durable observed registration；
- Prisma Registry 验证共享 SQLite 上 `checkedAt`、空 active set 和 stopped
  observed registration 一致；
- focused：3 个测试文件、7 个测试通过；
- `bunx vitest run --reporter=dot`：通过，36 个测试文件、243 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，设置
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`、
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`：通过；
  21 条 migration、Node API/Worker、Feed/Search/Story/SSE、日志关联和
  registration token 不暴露均通过；
- `git diff --check`：通过。

### 结论与边界

本轮只统一了 Registry observation 的读取时点：

- 它不是跨写事务的全局 MVCC snapshot；
- 它不阻止 heartbeat 在 snapshot 返回后立即发生；
- 它不实现 registration tombstone、retiredAt、cleanup executor 或 API DTO；
- cleanup candidate 仍是只读候选，不改变 projection、Run/Job 或 scheduler；
- `no_capable_worker` 仍不能由该 snapshot 单独推导。

### 下一步

继续设计 registration 生命周期的持久表达：优先比较
`retiredAt + tombstone` 与“保留 projection、只按 freshness 查询”两种方案，
并验证 cleanup candidate 如何通过 Maintenance Workflow 获得独立 Job lease、
幂等键和恢复语义。

## Round 95 — cleanup candidate 到 Maintenance Workflow command

日期：2026-08-10

### 目标

把 Round 94 产生的只读 cleanup candidate 收敛为可持久调度的
Maintenance Workflow command 合同，同时保持 observation、projection lease 和
Run/Job lease 的边界不被混淆。

### 实施

新增 `workflow-worker-projection-cleanup.ts`，将每个 cleanup candidate 映射为：

- `cosmos.maintenance.worker-capability-projection-cleanup@1`；
- `lane=maintenance`；
- 由 policy version、`workerId`、projection revision、registration terminal
  state/time 计算的稳定 command id；
- 只携带 `expectedProjectionRevision` 和业务时间等执行输入；
- 不携带 registration token、projection lease token、Run lease token 或完整
  local/admitted snapshot。

同一个 candidate 重放会生成相同 command id；projection revision 变化会生成
新的 command id。这样 command 可以作为后续 Workflow admission/dispatch 的
幂等输入，而不会把一次 observation 中的租约凭证升级成业务状态。

本轮只实现 command builder 和 Runner 输出的结构化 candidate，尚未注册或执行
Cleanup Workflow。执行阶段仍需要在独立 Maintenance Workflow 中完成
`expectedProjectionRevision` 的 CAS 校验，并决定以 `retiredAt/tombstone` 还是
其他持久表达收口 projection。

### TDD 与验证

- 先写测试锁定 cleanup candidate 的字段、稳定 command id、revision 变化后的
  id 变化，以及租约凭证不进入 Workflow input；
- `bunx vitest run --reporter=dot`：通过，37 个测试文件、246 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，设置
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`、
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`：通过；验证 21 条 migration、
  Node API/Worker、Feed/Search/Story/SSE、结构化日志关联、Workflow Worker
  discovery 和 registration token 不暴露；
- `git diff --check`：通过。

### 结论与边界

本轮形成的是“cleanup candidate → Maintenance Workflow command”的稳定边界，
不是 cleanup executor：

- 尚无 projection tombstone/delete schema；
- 尚无 `retiredAt` 写入、cleanup Job、审计事件或失败恢复处理；
- 尚无 scheduler/Outbox consumer 对该 command 的实际消费；
- command builder 不能单独证明 projection 已经安全清理；
- 没有进行真实长时间 Worker 崩溃、cleanup 重启接管或 scheduler 消费验收。

### 下一步

下一轮优先比较并 spike 两种 cleanup 收口：

1. Maintenance Workflow 按 `expectedProjectionRevision` CAS 写入
   `retiredAt/tombstone`，保留 last-known snapshot；
2. 不增加 tombstone，只保留 projection 并依赖 freshness query 定期重建。

优先实现方案一的最小合同，验证 cleanup Workflow 的 Action Job lease、幂等、
重启恢复和旧 projection revision 拒绝写入；继续保持 cleanup 不拥有 Run 以外的
额外 owner truth。

## Round 96 — retiredAt/tombstone 与可执行 Cleanup Workflow

日期：2026-08-10

### 目标

在 Round 95 的 command builder 之后，验证 registration 消失后的第一种持久
表达：projection 行不删除，保留 last-known capability evidence，以
`retiredAt`/tombstone 标记当前 projection 已退出 active availability。清理操作
必须通过普通 Workflow 的 Action Job 执行，并同时满足幂等、revision CAS、旧
projection writer fencing 和 Worker 重新出现后的恢复。

### 设计决定

本轮选择方案一：

```text
cleanup candidate
→ Maintenance Workflow Run
→ Action Invocation / Action Job lease
→ Registry terminal observation re-check
→ expectedProjectionRevision CAS
→ retiredAt/tombstone
```

不选择“只依赖 freshness query 定期重建”作为当前收口，因为它无法明确表达
“该 projection 已经被观察到 terminal registration 并处理过”，也会让重复
candidate 与 last-known snapshot 的生命周期交给隐式查询规则。

Tombstone 是 capability projection 的当前生命周期状态，不是新的 owner truth：

- `revision` 成功 retire 时加一；
- 写入 `retiredAt`、`retirementReason`、`retirementCommandId` 和
  `retirementRegistrationTerminalAt`；
- 保留 `localSnapshot`、admission evidence、rejections 和历史时间；
- 清空 projection lease；不复制 Run lease、Job lease 或 registration token；
- active projection 必须持有完整 projection lease，retired projection 必须不持有
  projection lease；
- 新 registration 经过普通 claim/apply 后可以清除 tombstone并以更高 revision
  恢复为 active projection。

### 实施

新增 Prisma migration：

```text
20260810100000_workflow_worker_capability_projection_retirement
```

在 `WorkflowWorkerCapabilityProjectionStore` 增加 `retire()` 合同和纯 reducer：

- 预期 revision 不匹配返回 `revision_conflict`；
- 同一 `commandId` 重放返回 `already_retired`；
- 其它 command 试图处理已 retired projection 返回
  `retirement_conflict`；
- projection 不存在或只存在未提交的 reservation row 时返回 `not_found`；
- CAS 成功后 Revision 加一，并清除 projection lease；
- `listStale()` 不再重复返回已 retired projection。

新增 Cleanup Workflow/Action 定义：

- Workflow：`cosmos.maintenance.worker-capability-projection-cleanup@1`；
- Action：`cosmos.maintenance.worker-capability-projection-retire@1`；
- Application 提供运行时注册和 Definition/Action catalog 注册 seam；
- Action 在写入前通过同一个 `checkedAt/staleAfterMs` Registry observation
  snapshot 重新确认 worker、`stopped/expired` 状态和 `terminalAt`；
- registration 已复活或 terminal observation 变化时返回
  `registration_changed`，不写 projection；
- Registry 读取失败或 observation contract 不一致时抛出可由 Action Job retry
  接管的错误；
- Action 使用自身稳定的 `runId:path` idempotency key 作为 projection retirement
  command key；同一 Workflow Run 恢复时不会生成新的 retirement command。

本轮没有把 scheduler、Projection Runner 的 candidate consumer 或 `apps/worker`
默认 wiring 接入生产入口。Cleanup Workflow/Action 是可测试、可注册的应用边界，
但还不是自动运行的 production cleanup subsystem。

### TDD 与验证

- 先写 reducer/store 测试，再实现 InMemory/Prisma retirement；
- 再写 Action/Workflow 测试，验证 Registry re-check、registration changed、
  catalog registration 和真实 `WorkflowRuntime.runNext()` 的 Action Job 执行；
- focused：4 个测试文件、23 个测试通过；
- `bunx vitest run --reporter=dot`：通过，37 个测试文件、253 个测试；
- `bun run typecheck`：通过；
- `bun run build`：通过；
- `bun run db:validate`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，设置
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`、
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`：通过；隔离 SQLite 应用 22 条
  migration，Node API/Worker、Feed/Search/Story/SSE、结构化日志关联、
  Workflow Worker discovery 和 registration token 不暴露均通过；
- `git diff --check`：通过。

### 结论与边界

本轮已经从“candidate command”推进到“可执行但未自动接入的 Cleanup
Workflow”：

- durable `retiredAt`/tombstone 与 last-known snapshot 已有 InMemory/Prisma
  行为合同；
- Action Job lease、Action retry seam、同一 invocation 幂等和旧 revision 拒绝
  已由 Runtime focused test 覆盖；
- 真实 Prisma migration 和 Node API/Worker smoke 通过，但 Node smoke 尚未实际
  调度 Cleanup candidate；
- Registry re-check 与 projection CAS 仍是跨两个读取/写入边界的非全局事务；若
  registration 在 re-check 返回后、CAS 写入前再次替换，仍需后续统一 Data Root
  transaction 或持久 registration generation/fingerprint 来消除这个窗口；
- 尚无 DomainEvent/Outbox 审计、candidate consumer、scheduler、cleanup API、
  tombstone retention/purge 和 authority availability projection；
- `retiredAt` 只表达 capability projection 生命周期，不得被解释为
  `no_capable_worker` 或 Run admission 结论。

### 下一步

优先 spike registration generation/fingerprint 的原子校验：比较把
`registeredAt`/registration generation 与 projection retire CAS 放入同一 Prisma
transaction，和把 generation 持久进 projection 后由 Application Command
统一校验两种方案。随后再实现 candidate → enqueue 的 Outbox/consumer，验证
重复 dispatch、Worker 重启接管、失败终态和 cleanup 审计事件。

## Round 97 — registration generation 与 atomic retirement guard

日期：2026-08-10

### 背景

Round 96 已经把 stale capability projection 转换成可执行的 Cleanup
Workflow/Action，并在 Action 执行前重新观察 Registry。继续沿用“两次读取再
写入”的方式仍然存在一个竞态：

```text
Action 重新观察 registration
→ 同一个 workerId 被新 registration 替换
→ 旧 cleanup 继续按旧 terminal observation retire projection
```

如果只比较 `workerId`、terminal state/time 和 projection revision，旧 cleanup
仍可能在新 registration 出现后写入 tombstone。因此本轮只收口这个具体的
registration replacement 窗口，不把它扩大解释成整个 Ingest 或所有领域写入的
lease fencing。

### 实施

`WorkflowWorkerRegistration` 增加持久的 `registrationGeneration`：

- 同一个 `workerId` 首次注册从 `1` 开始；
- 同一个 `workerId` 被重新注册时 generation 加一；
- heartbeat 不改变 generation；
- registration token 仍然每次重新注册生成，不能被 projection cleanup 输入或
  command 复用。

新增 Prisma migration：

```text
20260810110000_workflow_worker_registration_generation
```

Cleanup candidate、Workflow input 和稳定 command id 都携带 generation。这样
同一个 worker 的旧 candidate 不会与新 registration 共用同一个业务幂等键。

`PrismaWorkflowWorkerCapabilityProjectionStore.retire()` 现在使用同一条条件
`UPDATE` 完成 retirement CAS。除了 projection revision、`retiredAt IS NULL`
之外，它还要求同一 Data Root 中存在满足以下条件的 registration：

- `workerId` 相同；
- `registrationGeneration` 相同；
- `registration_stopped` 时 status 和 `stoppedAt` 相同；
- `registration_expired` 时 expiresAt 与 terminal time 相同。

因此，如果 registration 在 Action re-check 之后、retirement CAS 之前被替换，
这条 SQL 不会更新 projection；调用方得到 `registration_conflict`，projection
保持 active，revision 不推进。正常 stopped registration 则可以完成
`retiredAt`/tombstone 写入，并清空 projection lease。

本轮还修正了一个 SQLite/Prisma raw SQL 细节：SQLite 中 Prisma DateTime 按
毫秒数存储，条件比较必须使用数值时间；此前尝试 `julianday()` 会造成错误，
最终改为直接比较毫秒值。

### TDD 与验证

- Prisma projection/registry focused：2 个测试文件、6 个测试通过；
- Application cleanup/projection/command/ingest focused：5 个测试文件、22 个
  测试通过；
- 覆盖首次 generation 为 `1`、replacement generation 递增、heartbeat 不改变
  generation、正常 stopped retirement、旧 generation 在 replacement 后被拒绝、
  projection 保持 active 且 revision 不变，以及 Cleanup Workflow 通过 Action
  Job 执行；
- `bun run typecheck`：通过；
- `bunx vitest run --reporter=dot`：通过，37 个测试文件、254 个测试通过；
- `bun run build`：通过，包含 packages、API、Worker 和 Next Web；
- `bun run db:validate`：通过；
- `pwsh -NoProfile -File scripts/smoke-node.ps1`，设置
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`、
  `COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`：通过；隔离 SQLite 实际应用 23 条
  migration，Node API/Worker、Feed/Search/Story/SSE、结构化日志关联、
  Workflow Worker discovery 和 registration token 不暴露均通过；
- `git diff --check`：通过。

### 结论与边界

本轮把 Round 96 中“registration re-check 与 projection CAS 之间的
replacement 窗口”收口到了 Prisma capability projection retirement 的单条
条件 SQL 内：

- InMemory reducer/store 仍用于验证运行语义，但不能模拟跨 Registry/Projection
  的数据库原子性；
- Prisma store 在同一个 SQLite Data Root 内验证了 generation 与 terminal
  observation 的原子条件；
- 这只保护 capability projection retirement，不代表 Observation、Entry、
  Asset、FTS、checkpoint 或整个 Workflow Run 已完成统一 lease fencing；
- Cleanup Workflow/Action 仍未接入 `apps/worker` 默认 production wiring、
  scheduler、candidate consumer 或 Outbox；
- 仍没有 cleanup audit DomainEvent、自动重复 dispatch recovery、
  tombstone retention/purge 或 authority availability projection；
- `retiredAt` 仍只表达 capability projection 生命周期，不代表
  `no_capable_worker`、Run admission 或 owner assignment。

### 本轮停止点

Round 97 已完成实现、验证和文档同步。本次用户要求在当前 round 后暂停，
因此不开始 Round 98，也不执行 commit、push、merge 或 PR 操作。

## Round 98 — 最新主线收敛基线与 Ingest production wiring 决策

日期：2026-08-10

### 目标

从已经合并 Task 05 的最新 `master` 重新建立 T04 收敛分支，保留
`NormalizedIngestItem`、Publisher、ContentKind、TemporalValue、metrics 和
URL-free stable identity，不直接覆盖旧 spike，也不把两套 Run 模型伪装成已经
统一。

### 基线与迁移

- 最新 `master`/`origin/master` 为 `45ae918`，包含 Task 05；
- 原 T04 worktree 保持在 `chore/t04-workflow-runtime-spike@9fe84f2`，其
  6260 行 tracked 增量和 65 个 untracked 文件未被 stash、reset 或覆盖；
- 新建 `feat/t04-ingest-workflow-convergence` worktree，基于
  `origin/master`；
- tracked 增量通过三方补丁迁移，冲突仅出现在：
  - `PROJECT-STATUS.md`
  - `packages/contracts/src/index.ts`
  - `packages/contracts/src/index.test.ts`
  - `packages/storage-prisma/src/index.ts`
- 四处冲突均按“保留 Task 05 内容合同，再叠加 T04 Runtime 合同”逐块解决；
  新 worktree 当前没有 conflict marker，也没有暂存文件。

### 已验证基线

- `bun install --frozen-lockfile`：通过；
- `bun run db:generate`：通过；
- `bun run db:validate`：通过；
- `bunx vitest run --reporter=dot`：通过，37 个测试文件、260 个测试；
- `bun run typecheck`：只剩一个预期错误：
  `workflow-ingest.test.ts` 仍使用 Task 05 前的 `sourcePublishedAt` 字段。

测试能运行但类型检查失败，说明机械收敛已经完成；剩余问题是旧 Workflow
fixture 与最新领域合同不一致，而不是 Prisma migration 或 Runtime 基线损坏。

### production wiring 审查

当前真实调用链仍是：

```text
POST /sources/:sourceId/runs
→ PrismaCosmosRepository.createQueuedRun()
→ legacy Run / Step / source-ingest Job
→ IngestionWorker
→ IngestionService
→ PrismaCosmosRepository.persistIngestItem()
```

`cosmos.ingest@1` 目前只在 Application focused test 中注册。生产 Worker 只自动
注册 receipt reconciliation Workflow；Workflow lane 默认 concurrency 为 `0`。

旧 `Run` 与新 `WorkflowRun` 不能互换：

- `Observation.runId` 是 legacy `Run` 外键；
- `WorkflowRun` 拥有独立的 orchestration lease；
- `workflow-action` Job 拥有独立 Action lease；
- 把 `WorkflowRun.id` 直接传给旧 `persistIngestItem(runId)` 会破坏外键和
  durable ownership。

### 本轮决定

第一条 production Ingest Workflow 使用以下边界：

```text
API / schedule command
→ WorkflowCommandService
→ versioned cosmos.ingest@1 + definition/input snapshot
→ WorkflowRun
→ source.fetch Action Job
→ library.ingest Action Job(s)
→ source.checkpoint Action Job
→ Workflow checkpoint / event / terminal close
```

领域写入新增 Workflow 专用 Ingest Application Command。每次写入携带：

- Workflow Run ID 与 Run lease token；
- Action Job ID 与 Job lease token；
- Action invocation 的稳定 idempotency key。

Prisma transaction 必须同时验证 Run/Job lease，再写
Observation、Entry/EntryRevision、Asset、最小 Story、FTS、DomainEvent/Outbox。
旧 Worker 在任一 lease 失效后不得产生可见领域事实或推进 Source checkpoint。
Blob 是内容寻址文件，事务前写入仍可能留下不可见 orphan bytes；这由后续 Blob
GC 处理，不能把 orphan 文件误报为领域提交成功。

Workflow Observation 将使用独立 `workflowRunId` 和稳定 ingest command key，
而不是伪造 legacy Run。legacy fixed Ingest/Probe 路径暂时保留用于兼容和分阶段
迁移，但 API 手动触发与生产 schedule 必须改走同一个 Workflow command。

### 下一步

1. 更新 Action execution fence 和 Prisma JSON codec，确保 Action journal 能恢复
   `Uint8Array` asset；
2. 以 focused tests 固定 Workflow Ingest command 的幂等和双 lease fencing；
3. 接入 API、Worker、schedule 和版本化 built-in catalog；
4. 用两个 Prisma Runtime 验证 stale Worker、lease expiry、reclaim、journal
   replay 和 checkpoint；
5. 再运行 full typecheck/test/build、migration、Node production、浏览器和文档
   验收。

## Round 99 — 固定 Ingest Workflow production wiring

日期：2026-08-10

### 目标

把 Round 98 已确认的 `cosmos.ingest@1` 从 Application focused seam 接入真实
API、schedule 和 Node Worker，同时保留 Task 05 的
`NormalizedIngestItem`、`Publisher`、`ContentKind`、`TemporalValue`、metrics
和 URL-free identity 合同。

本轮不迁移 Probe，不实现 Connection/Secret/State，也不把固定定义误称为用户
自定义 Workflow 平台。

### 生产链路

接线后的真实路径为：

```text
POST /api/v1/sources/:sourceId/runs
或 schedule bucket
→ WorkflowCommandService
→ Prisma WorkflowCommandRepository
→ cosmos.ingest@1 WorkflowRun
→ source.fetch@1 Action Job
→ library.ingest@1 Action Job(s)
→ source.checkpoint@1 Action Job
→ Workflow checkpoint / DomainEvent / terminal close
```

API 与 schedule 都只创建持久 Workflow Run，不执行 Connector。Worker 默认
`COSMOS_WORKER_WORKFLOW_CONCURRENCY=1`，同时继续运行 legacy Source claimant，
但后者按 Job kind 隔离，只处理 Probe 与兼容 Job，不会领取
`workflow-action`。

### 双 lease 写入边界

新增 Workflow 专用 Ingest Application Command。每次领域提交携带并验证：

- `WorkflowRun.id` 与当前 Run lease token；
- `WorkflowActionJob.id` 与当前 Action Job lease token；
- 稳定 Action invocation / ingest command idempotency key。

Prisma 在同一个事务内完成两层 fencing 后，才允许写入：

- 不可变 Observation；
- Entry 与追加式 EntryRevision；
- Asset metadata；
- 最小 Story projection；
- FTS5 projection；
- DomainEvent 与 Outbox。

因此旧 Worker 无论丢失 Run lease 还是 Action Job lease，都不能在接管者之后追加
可见领域事实。Workflow Observation 使用独立 `workflowRunId`，没有把新 Run ID
伪装成 legacy `Run` 外键。

Blob 仍在数据库事务前按内容地址写入。极端中断可能留下没有 Asset/Observation
引用的 orphan bytes；这不构成领域提交，后续需要 Blob GC。

### durable Action journal

`source.fetch@1` 的输出会进入 Action journal，并可能包含媒体
`Uint8Array`。本轮为 Prisma JSON codec 增加显式二进制编码/解码，确保：

```text
fetch 已完成
→ Worker 中断
→ Run/Job 被接管
→ replay 已保存 fetch output
→ 不重复访问来源
→ 继续 ingest/checkpoint
```

未知对象没有通过 `any` 或静默 JSON 降级掩盖；二进制值以带类型标记的稳定结构
持久化并恢复。

### Ingest identity 与 provenance

- 外部稳定 ID 优先；
- 无 URL、无 external ID 时使用规范化 `sourceLocator` 生成来源内稳定 key；
- Observation 保存 `manual` 或 `schedule` discovery kind；
- 同时保存 Workflow ref、Action command key 和来源定位；
- 重复执行不会产生重复 Entry；
- 内容变化追加 Revision，旧 Observation 永不覆盖。

### 组装改动

- API 手动 Run 入口改为调用 `enqueueIngestWorkflow()`；
- Worker schedule callback 使用同一个 Application command；
- Worker 注册内置 fetch/ingest/checkpoint Action 与
  `cosmos.ingest@1` Definition；
- Prisma atomic command repository 同时负责 catalog/binding、Run enqueue、
  DomainEvent 与 Outbox；
- API/Worker 都使用共享 Data Root 中的 Prisma durable truth。

Probe 与 legacy 查询兼容仍保留，作为后续单独迁移边界。

### 恢复与行为验证

focused 测试覆盖：

- 同一 command id 并发/重复 enqueue 只创建一个 Run；
- 同一 item 重放不重复 Entry；
- Action journal 恢复 `Uint8Array`；
- Run lease 丢失时领域写入被拒绝；
- Action Job lease 丢失时领域写入被拒绝；
- 两个 Prisma Runtime 共享 SQLite 时，lease expiry 后新 Worker 接管；
- 旧 Worker 在接管后不能写 Observation、FTS、Event 或 checkpoint；
- API 手动入口和 schedule callback 都创建固定 Workflow，而不是 legacy
  Ingest Job。

### 本轮结论

第一条生产 Workflow 已不再只是 focused spike。API、schedule、Worker、Prisma
和信息库领域写入共享同一条 durable 路径；不过这只证明固定
`cosmos.ingest@1`，不代表插件加载、用户自定义 Workflow 管理、Connection、
Knowledge 或 Research 已完成。

## Round 100 — Windows standalone 失败、修复与浏览器闭环

日期：2026-08-10

### 目标

使用 Node production build 和真实浏览器，从用户界面验证：

```text
创建 Source
→ 手动运行固定 Ingest Workflow
→ SSE 刷新 Feed
→ Search
→ Story / Entry / Source / Revision / Observation
→ 再运行一次验证幂等
```

本轮使用独立端口和隔离 Data Root，不接管用户已经占用的
`127.0.0.1:4310`。

### 第一次真实失败

Next standalone 由 Bun 构建后，在 Windows 生成了“文件型 symlink 指向目录”的
内部链接。Node 24 启动时报：

```text
EPERM: operation not permitted, stat
...\apps\web\.next\standalone\node_modules\react
```

这不是 React 缺失，也不是用户权限配置问题。读取 reparse point 后确认：目标是
standalone root 内的目录，但链接类型被创建为 file symlink，Node 对该路径执行
`stat` 时失败。

### 错误尝试与为何撤销

第一次修复尝试把 symlink 目标完整复制为真实目录。它消除了 `EPERM`，却改变了
Next standalone 的 realpath/module resolution 语义，随后启动失败：

```text
Cannot find module '@swc/helpers/_/_interop_require_default'
```

这说明“物化目录”不是等价修复：Next tracing 依赖原来的链接拓扑，复制部分目录
会让模块从错误的 realpath 寻找依赖。本轮撤销该方向，没有用继续复制缺失包的
方式堆叠兼容层。

### 最终修复

新增：

- `scripts/prepare-web-standalone-lib.ts`
- `scripts/prepare-web-standalone.test.ts`
- 更新 `scripts/prepare-web-standalone.ts`

构建后处理只修复这一种情况：

1. 读取 standalone 内部 symlink；
2. 解析目标并确认目标仍位于 standalone root；
3. 目标是目录但链接类型不正确时，重建为 Windows directory symlink；
4. 越界目标明确拒绝，不跟随或复制到仓库外；
5. 保留链接语义，不物化 Next dependency tree。

focused 测试覆盖正常目录链接、越界拒绝和 Windows file-typed directory link
回归。最终 standalone 中 26 个链接都能由 Node `stat`，Next 16.3.0 可用
Node 24 启动。

### 浏览器验收

使用独立 `playwright-cli` session `cosmos-t04` 完成：

- standalone Web 正常显示标题、布局、Tailwind 与 shadcn 样式；
- 创建默认 fixture Source；
- 手动触发 `cosmos.ingest@1`；
- SSE 自动刷新出 3 条 Feed；
- 搜索 `Cosmos` 返回 1 条；
- 打开 Story → Entry → Source/Revision/Observation；
- URL-free Story 显示 `Observation · 无网页 URL`；
- 健康检查显示 API/storage ready；
- 第二次 Run 成功，Feed 仍为 3 条且 `createdEntryCount=0`；
- 浏览器 console：0 error、0 warning；
- CSS、JavaScript、字体、API 与 SSE 请求均为 200。

截图保存在被忽略的临时目录：

```text
.agent/tmp/browser-workflow-ingest-019fdc6f/browser-feed.png
```

本轮专用 API、Worker、Web 和浏览器 session 已停止；用户原有 4310 进程未终止、
未接管。

### 边界

- 这是 Windows + Node standalone 浏览器验收，不是 Docker 或跨平台验收；
- 使用 fixture，不是实时 RSS/RSSHub；
- 浏览器证明用户链路和 SSE 状态，不替代 lease/CAS 的 Prisma 行为测试；
- Source correlation/checkpoint CAS/真实 timestamps 的后续修正发生在本轮浏览器
  验收之后，因此最终收口还需用新 Data Root 做一次轻量复验。

## Round 101 — Source correlation、checkpoint CAS 与真实运行时间

日期：2026-08-10

### 触发原因

Round 100 的端到端链路可用，但继续从用户查询和并发来源状态检查后发现四个需要
在收口前修正的合同：

1. Source 详情的 `lastRunAt/lastError` 仍只投影 legacy `Run`；
2. 两个同源 Workflow Run 可以从同一个 cursor 启动，后完成的旧结果可能回滚
   checkpoint；
3. Workflow Run 没有独立 `startedAt/finishedAt`，公共 Run 查询会用
   `updatedAt` 伪造两个时间；
4. retryable Action 未到 `nextAttemptAt` 时，父 Run 仍可能被高频领取后立即释放。

### Workflow correlation

`WorkflowRun` 增加可选：

```ts
correlation: {
    type: string;
    id: string;
} | null
```

Prisma 持久化 `correlationType`、`correlationId` 和组合索引。固定 Ingest 创建：

```ts
{
    type: "SourceInstance",
    id: sourceId,
}
```

Source 查询现在能把固定 Workflow Run 与来源关联，`lastRunAt/lastError` 不再只看
legacy Run。correlation 是通用业务关联，不把 Source 字段写入 Runtime 核心。

### checkpoint revision/CAS

`Checkpoint` 增加从 `0` 开始的单调 `revision`。Ingest Run 输入快照保存：

```text
cursor
checkpointRevision
```

`source.checkpoint@1` 提交时执行 compare-and-set：

- expected revision 匹配：写入新 cursor，revision 加一，记录
  `source.checkpoint.committed.v1`；
- revision 已由其它 Run 推进：不覆盖当前 cursor，记录
  `source.checkpoint.superseded.v1`；
- Action replay 从稳定 Event 恢复同一结果，不重复推进 revision。

并发旧 Run 已经写入的 Observation/Entry 不回滚或删除，因为它们是实际看到的
来源事实；CAS 只防止旧 cursor 覆盖新状态。

真实 Prisma 测试创建两个同 Source、同 expected revision 的 Run：

```text
Run B 先提交 cursor-B → revision 1
Run A 后提交 cursor-A → checkpointCommitted=false
最终 cursor=cursor-B，revision=1
```

### 真实时间

`WorkflowRun` 增加：

- `startedAt`
- `finishedAt`

更新覆盖 claim、成功、失败、取消、deadline expiry 和 descendant cancellation。
公共 Ingest `RunSnapshot` 直接投影真实字段，不再用一次 `updatedAt` 同时表示开始和
结束。

### retry_wait claim 去抖

`WorkflowJobRecord` 增加 `nextAttemptAt` 投影。InMemory/Prisma
`claimNextRun()` 在子 Action retry 尚未到期时跳过父 Run；到期后恢复正常 claim。
这不改变 retry 终态，只消除默认 200 ms poll 下无意义的 claim/lease churn。

### migration

新增：

```text
20260810160000_workflow_correlation_checkpoint_cas
```

包括：

- `Checkpoint.revision`
- `WorkflowRun.correlationType`
- `WorkflowRun.correlationId`
- `WorkflowRun.startedAt`
- `WorkflowRun.finishedAt`
- correlation 组合索引

### focused 验证

- Source Workflow projection 与 checkpoint CAS：通过；
- schedule callback 确认走 Workflow enqueue：通过；
- InMemory Action retry 到期前不 claim：通过；
- Prisma Action retry 到期前不 claim：通过；
- runtime/application/storage 核心组合：7 个测试文件、131 个测试通过。

### 仍保留的边界

- Run input 有 checkpoint revision，但还没有 Source 配置快照；排队后修改 Source
  可能改变未开始 Run 的 fetch 配置；
- checkpoint 仍属于 Source，而不是未来采集计划 StateStore；
- correlation 只提供关联和查询，不替代 Connection/Trigger Binding；
- CAS 防止 cursor 回滚，不提供多个同源 Run 的 single-flight 或合并策略。

## Round 102 — 全量、migration 与 Node production 收口检查点

日期：2026-08-10

### 全量验证

执行：

```text
bunx vitest run --reporter=dot
```

结果：

- 38 个测试文件；
- 271 个测试；
- 全部通过。

执行：

```text
bun run build
```

结果：通过，包含所有 packages、Nest API、Worker、Next Web 和 standalone
post-processing。

### 隔离 migration

使用隔离 Data Root：

```text
.agent/tmp/migration-workflow-ingest-7f1d239502e54380be28f3563dcd82d2
```

结果：

- 26 条 migration 全部应用；
- `db:status` 返回 up to date。

### Registry-enabled Node production smoke

显式启用：

```text
COSMOS_WORKFLOW_WORKER_REGISTRY=prisma
COSMOS_WORKER_WORKFLOW_REGISTRY=prisma
```

Node production smoke 结果：

```json
{
  "healthWorker": "ready",
  "queuedStatus": "queued",
  "feedItems": 3,
  "searchItems": 1,
  "storyTitle": "Fixture media metadata",
  "sseHasRunEvent": true,
  "sseHasWorkflowTerminal": true,
  "sseHasFeedEvent": true,
  "apiStructuredRecords": 17,
  "workerStructuredRecords": 21,
  "correlatedWorkerRecords": 5,
  "correlatedConnectorRecords": 2,
  "requestIdBridgedToRun": 1,
  "requestIdBridgedToProbe": 1,
  "probeWorkerRecords": 6,
  "notFoundStatus": 404,
  "validationStatus": 400,
  "workflowWorkers": 1,
  "workflowWorkerTokenExposed": false
}
```

这项验证覆盖 Node API/Worker、真实 SQLite、固定 Ingest、legacy Probe、
Feed/Search/Story、SSE、结构化日志关联和 Worker Registry；它不等于浏览器、
Docker 或真实 RSS 验收。

### Docker

当前环境没有 `docker` 命令，因此没有运行镜像构建、Compose、容器 healthcheck
或共享 volume 验收。Docker 只能做静态配置审查，最终状态必须明确为“未验证”，
不能用 production build 或 Node smoke 替代。

### 文档同步

已开始更新：

- `CONTEXT.md`
- `docs/architecture/0001-cosmos-foundation.md` 至 Draft v0.17
- `docs/adr/0001-durable-workflow-runtime.md`
- `docs/tasks/04-workflow-runtime/README.md`

文档区分：

- 固定 Ingest production wiring 已实现；
- 通用自定义 Workflow 产品平台仍未完成；
- Connection/多计划、Knowledge/Research、Blob GC、Source 删除、外部 Outbox
  发布仍是后续边界。

### 本轮检查点

代码、focused/full tests、build、migration、Node production 和第一轮浏览器链路
已有证据。最终 Goal 收口前仍需：

1. 更新 `PROJECT-STATUS.md`、根 README 和贡献指南；
2. 用最终构建与新 Data Root 做一次轻量 standalone/browser 复验；
3. 运行 Markdown/link/fence/EOF/旧术语检查；
4. 从 merge-base 对 4.5 万行 spike 做 project-level architecture/structure
   审查；
5. 把最终验证与审查结论追加到后续 Round。

本轮没有 commit、push、merge、PR 或发布。

## Round 103 — 收口审查、幂等边界与 Source execution snapshot

日期：2026-08-10

### 目标

在不扩展 Knowledge、Research、Connection、Secret 或 Harness 的前提下，重新从
API command、持久 Run、Action replay、legacy 兼容和来源配置变更五条路径审查
固定 Ingest，关闭会改变业务含义的正确性缺口。

### Run 与 Probe 幂等冲突

此前同一 `Idempotency-Key` 如果被另一个 Source 或 Job kind 复用，部分入口会
静默返回旧对象。现在：

- Workflow Run 重放同时比较 Workflow ref、schema 解析后的 input 和 correlation；
- Source Probe 重放比较 Source、Job kind 和 payload；
- 相同请求返回原 Run/Job；
- 不同请求返回 HTTP `409` / `code=conflict`；
- 超过 300 字符的 key 在存储访问前返回 HTTP `400`；
- 首次 Run 完成并推进 checkpoint 后，相同 key 仍复用首次 cursor/input，不把
  当前 checkpoint 误当成重放输入；
- binding 后来 disabled 只阻止新 Run，不阻止已接受 command 的合法重放。

### Durable budget 与 legacy checkpoint

Action/child budget 过去只按单次脚本重放的内存计数，分支变化后可能绕过 Run
累计上限。`WorkflowStore.getRunUsage()` 现在从持久 Action Invocation 和 child
Step 计算使用量；重放旧 path 不重复计费，新 path 按 Run 累计额度拒绝。

兼容 `source-ingest` Job 过去可以无条件覆盖固定 Workflow 的新 cursor。legacy
路径现在也读取 checkpoint revision，并通过 CAS 提交；旧 revision 不会回滚新
cursor。legacy Job 仍可兼容执行，但不再绕过 Workflow checkpoint 单调性。

### Workflow journal value codec

旧 JSON reviver 会把用户提供的 marker-shaped object：

```json
{
  "__cosmosType": "Uint8Array",
  "base64": "..."
}
```

误转换成二进制。新版本使用 typed-tree envelope：

- marker-shaped 用户对象保持普通对象；
- `Uint8Array`、Date、undefined、非有限数字和 BigInt 可恢复；
- 旧 `__cosmosType` 数据保持向后读取；
- 循环引用明确拒绝；
- Run input、Action Job、Step、Invocation、Signal 和 checkpoint 使用该 codec；
- DomainEvent/Outbox payload 继续保持普通 JSON。

### Source execution snapshot

最终审查发现 `WorkflowRun.input` 虽保存 `sourceId`、cursor 和 checkpoint revision，
但 `source.fetch@1` 在 Action 执行时重新调用 `repository.getSource()`。这会导致：

```text
Run 已排队
→ Source.config 被修改
→ Worker 开始 fetch
→ 旧 Run 使用新配置
```

修复后新增独立 `SourceExecutionSnapshot`：

```text
id
name
kind
config
enabled
createdAt
updatedAt
```

查询态 `lastRunAt/lastError` 不进入执行快照。固定 Ingest input 保存该快照、
cursor、checkpoint revision 和 trigger；`source.fetch@1` 只消费快照，不再读取
Source 表。相同幂等键先读取原 Run，因此不会重新读取当前 Source。

两个层次的行为测试均通过：

1. InMemory：入队后替换当前 Source 配置，fetch 仍收到旧配置；
2. Prisma：原子 enqueue 后直接更新 SQLite `SourceInstance.configJson`，执行端仍
   使用 Run 中的旧配置；当前 Source 查询同时确认数据库已是新配置。

`cosmos.ingest@1` 和 `source.fetch@1` 的 manifest hash 随未发布合同更新。该
Definition 尚未进入 `origin/master`，因此本轮继续收敛 `@1`，不为临时 WIP 数据
建立虚假兼容层。

### Focused 验证

- contracts/application/storage Source snapshot：3 个测试文件、32 个测试通过；
- 相关 contracts/application/RSS/collectors/API：5 个测试文件、31 个测试通过；
- application/storage/RSS/collectors/API/Worker focused typecheck：通过；
- `git diff --check`：通过。

本轮没有 commit、push、merge、PR 或发布。

## Round 104 — Migration squash、最终生产验证与部署脚本修正

日期：2026-08-10

### Migration squash

Workflow spike 曾在未进入 master 的分支内累积 23 条增量 migration。最终树压缩为：

```text
20260808003247_phase1_foundation
20260808150000_collector_jobs
20260810020829_normalized_content_model
20260810170000_workflow_runtime
```

支持的升级基线是 `origin/master`。压缩前的临时 spike Data Root 不属于发布数据，
不承诺携带旧 8–26 条 migration history 继续升级；它们应重建。验证分两条：

1. 全新 Data Root：4 条 migration 全部应用，`db:status` up to date；
2. 真实 master 升级：
   - 从 `origin/master` 归档并应用 3 条 migration；
   - 预置 Source、Checkpoint、Run、Job、DomainEvent 和 Observation；
   - 使用当前第 4 条 migration 升级；
   - 6 类记录全部保留；
   - `Checkpoint.revision=0`；
   - 新 `workflowRunId`/command 字段为 `null`；
   - `PRAGMA foreign_key_check` 返回 0 条错误。

升级 harness 的第一次通用 `bunx prisma` 调用了 Prisma 7.9.1，因 v7 不再接受
schema 内 datasource URL 而失败；随后固定使用仓库已安装的 Prisma 6.19.3 CLI。
SQLite 绝对路径还要求测试先创建空文件，这与仓库 `scripts/prisma.ts` 的行为一致。
这些是 harness 问题，迁移 SQL 本身没有失败。

### 全量与构建

最终代码状态通过：

```text
bun run db:validate
bun run db:generate
bun run typecheck
bun run lint:web
bunx vitest run --reporter=dot
bun run build
```

结果：

- Prisma Client 6.19.3；
- 39 个测试文件、285 个测试；
- Next.js 16.3.0 production build；
- standalone `server.js` 存在；
- 26 个内部链接全部是合法目录 symlink，没有 file symlink。

### Registry-enabled Node production smoke

最终 build、全新 4-migration Data Root 和 Node API/Worker 输出：

```json
{
  "healthWorker": "ready",
  "queuedStatus": "queued",
  "feedItems": 3,
  "searchItems": 1,
  "storyTitle": "Fixture media metadata",
  "sseHasRunEvent": true,
  "sseHasWorkflowTerminal": true,
  "sseHasFeedEvent": true,
  "apiStructuredRecords": 27,
  "workerStructuredRecords": 21,
  "correlatedWorkerRecords": 5,
  "correlatedConnectorRecords": 2,
  "requestIdBridgedToRun": 1,
  "requestIdBridgedToProbe": 1,
  "probeWorkerRecords": 6,
  "notFoundStatus": 404,
  "validationStatus": 400,
  "idempotentRunReplay": true,
  "idempotentProbeReplay": true,
  "runConflictStatus": 409,
  "probeConflictStatus": 409,
  "oversizedKeyStatus": 400,
  "workflowWorkers": 1,
  "workflowWorkerTokenExposed": false
}
```

第一次 smoke 的所有断言已通过，但 `curl --max-time 2` 用于截断 SSE 时产生预期
exit code `28`，被脚本误留成整个进程退出码。脚本现在只接受 `0/28`，其它 curl
错误失败，并在正常 SSE 采样后清零 native exit code。测试临时根也从系统 `%TEMP%`
移到仓库 `.agent/tmp`，并在递归清理前验证 containment。复跑后命令 exit code
为 `0`。

静态 Compose 审查还发现 discovery 查询开关误放在 Web service。现在：

- API 使用 `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`；
- Worker 使用 `COSMOS_WORKER_WORKFLOW_REGISTRY=prisma` 和
  `COSMOS_WORKFLOW_WORKER_REGISTRY=prisma`；
- Web 不再持有无效的 Registry 环境变量。

### 浏览器与 Docker 边界

最终 UI 浏览器证据来自命名 session `cosmos-t04-hardening`，使用 production
standalone Web 和全新 4-migration Data Root：

- 创建 fixture Source；
- 固定 Ingest 产出 3 条 Feed；
- 搜索 `Cosmos` 返回 1 条；
- 打开 URL-free Story → Entry → Source/Revision/Observation；
- 第二次 Run 成功且不新增 Entry/Revision；
- console 0 error / 0 warning。

截图：

```text
.agent/tmp/browser-hardening-final-9c574662ad22495f9415ae10209ec7c1/final-feed.png
```

Source execution snapshot 收口没有改动 Web/Transport；其后的最终 Node smoke 已
覆盖当前 API/Worker/SQLite 链路，因此本轮没有重复浏览器点击。浏览器证据与最终
后端证据分开记录，不能合并成一次未发生的验收。

当前系统仍无 `docker` 命令。镜像构建、Compose 启动、容器 healthcheck 和共享
volume 均未运行、未验证；静态配置修正和 Node build/smoke 不能替代 Docker 验收。

本轮没有 commit、push、merge、PR 或发布。

## Round 105 — Project quality audit 与 Goal completion matrix

日期：2026-08-10

### 结论

审查结论：**需修改**。

固定 `cosmos.ingest@1` 已达到本 Goal 要求的“可审查状态”：生产链、输入快照、
幂等、双 lease fencing、接管、migration、Node、浏览器和文档证据齐全。当前没有
发现需要回滚该链路的正确性阻断项。

“可审查”不等于“可直接合并”。本分支新增 Runtime/Store 的物理结构过大，下一轮
应先讨论并完成第一轮模块拆分，再决定 merge。Docker、真实 RSS/RSSHub、跨平台
Node 和长时间故障演练继续保持未验证，不能由本 Goal 的绿灯替代。

### 项目合同

- `AGENTS.md`：Accepted，要求扩展通过 Service/Command/Query/Event，持久与恢复
  行为有测试，focused/full/browser/Docker/真实来源分开报告。
- `ADR-0001`：Accepted design contract，固定 Job + Workflow、脚本优先、Cosmos
  持有 durable truth、双 lease fencing 和输入快照。
- 总体架构 v0.18：Draft，描述当前实现与后续 identity/journal/Connection 边界，
  不是把未来能力伪装成现状。
- Task 04：In progress；固定 Ingest slice converged，通用 Workflow 平台仍继续。
- 审查基线：`origin/master` 与 merge-base
  `45ae918bfcfcf5dfaf90480183608007a48ee170`。

### 变更量

相对基线：

```text
89 changed files
+46,301 / -334 lines
0 staged files
1 local WIP commit
```

当前 worktree 的 14 个 `.playwright-cli/page-*.yml` 删除是从 WIP commit 移除误提交
的生成物；`.playwright-cli/` 与 `.worktree/` 已加入 ignore。最终树没有冲突标记，
没有 staged 内容，也没有 commit/push/merge/PR。

### 发现 1：Workflow Runtime 单文件拥有过多职责

- 严重度：合并前修复。
- 位置：`packages/workflow-runtime/src/index.ts`。
- 证据：基线不存在，当前 7,400 物理行、272 个 top-level 声明；远超项目没有
  自定义阈值时采用的 500 行检查线。
- 职责：schema/error、Store Port、InMemory Store、Outbox、Definition Registry、
  Worker Registry、capability assessment/projection、RuntimeContext、receipt 和
  Worker loop 同处一文件；`RuntimeContext.callAction()` 为 286 行。
- 影响：公共合同、恢复 reducer 和执行副作用难以独立审查；继续增加
  Knowledge/Research 会扩大变更扩散和 invariant 分叉风险。
- 方向：保留现有 package/public barrel，先按 `contracts`、`store/in-memory`、
  `runtime/context`、`outbox`、`definition-registry`、`worker-registry/capability`
  和 `worker-loop` 拆文件；第一轮只移动职责并保持行为测试不变。
- 置信度：高，直接代码和行数证据。

### 发现 2：Prisma Workflow Store 是 2,971 行单类适配器

- 严重度：合并前修复。
- 位置：`packages/storage-prisma/src/workflow-store.ts`。
- 证据：基线不存在，当前 2,971 物理行；单类同时实现 Run、Action/Receipt、Job、
  Signal/checkpoint、child、Event 和 Outbox 的约 40 个异步操作。
- 影响：不同聚合的 transaction/fencing 更改会集中冲突，Store 很难按恢复场景
  做局部 review。
- 方向：保持一个 `WorkflowStore` Port 和 Prisma transaction truth，按
  Run/Job、Action/Receipt、Signal/child、Event/Outbox 拆内部 repository/helper；
  不复制 lease 或 terminal canonical logic。
- 置信度：高。

### 发现 3：Ingest canonical transaction 继续膨胀

- 严重度：合并前修复。
- 位置：`packages/storage-prisma/src/index.ts`。
- 证据：文件从基线 1,859 行增至 2,426 行；`persistIngestItemInternal()` 从约
  325 行增长为 426 行，并同时负责 Blob preflight、identity、Observation、
  Revision、Asset、Story、FTS、Event/Outbox 和 dual lease fencing。
- 影响：该函数目前正确地保持一个 canonical ingest transaction，但任何新增
  tombstone、identity strength 或 Knowledge hook 都会进一步提高回归风险。
- 方向：抽出独立 ingest repository/transaction module，保留单一 canonical
  command 和同一 Prisma transaction，不按 legacy/Workflow 复制两套实现。
- 置信度：高。

### 发现 4：URL-free fallback 仍是弱身份

- 严重度：需架构决策。
- 当前实现：fallback 已包含规范化 `sourceLocator`，不同来源位置不易误合并。
- 缺口：如果 Connector 没有 external ID、稳定 URL 或条目级稳定 locator，正文
  修改会改变包含内容的 key，可能创建新 Entry 而不是 EntryRevision。
- 方向：讨论 `externalKey/identityKey`、`identityStrength`、
  `identityVersion`、`identityBasis` 和迁移/回放语义。
- 置信度：高。

### 发现 5：Workflow journal 有值复制放大

- 严重度：需架构决策。
- 当前实现：fetch page、Job result、Invocation result、Step output 和逐条 ingest
  input 可能重复保存 raw payload/二进制。
- 影响：fixture 正常，但大 Feed、媒体或 Agent 产物会快速放大 SQLite 与恢复扫描
  成本。
- 方向：定义 value/reference 阈值、Blob/Artifact reference、journal retention
  和删除后恢复语义。
- 置信度：高。

### 后续债务

- Source 查询当前 `1 + 2N`；
- Blob preflight orphan GC；
- generic catalog/binding command 对同 command id、不同 payload 的冲突检查；
- Runtime/Application/Worker 其它大文件继续拆分。

这些不阻断本 Goal 的固定 Ingest 可审查结论，但扩展更多来源或进入 merge 前不能
继续忽略前三个结构发现。

### 妥协与决策

- 接受 `cosmos.ingest@1`/`source.fetch@1` 在未发布分支内更新 manifest；因为它们
  尚未进入 master，不额外维护 WIP `@1` 兼容实现。
- migration squash 只承诺 fresh 与 `origin/master` 三条 migration 的升级；旧
  spike 临时 Data Root 可丢弃。
- 不在本 Goal 内实现 Knowledge、Research、Connection、Secret、Harness、Graph UI
  或推荐；这些没有被固定 Ingest 的成功暗示为已完成。
- 不为达到“可合并”而在没有用户参与架构讨论前一次性重写 7,400 行 Runtime。

### Goal completion matrix

| Goal 条件 | 状态 | 证据 |
| --- | --- | --- |
| 保留 Task 05 内容合同 | 完成 | full 39 files / 285 tests；Publisher、ContentKind、TemporalValue 仍通过 |
| API/Trigger 创建版本化固定 Ingest Run | 完成 | API、schedule、Prisma atomic command repository |
| Run 保存定义与业务输入快照 | 完成 | definition/correlation/Source/cursor/checkpoint/trigger；Source 修改行为测试 |
| Worker 通过 Action Job 调用 Connector 与统一 Ingest Command | 完成 | fetch → ingest[] → checkpoint；Node production |
| Observation/Revision/Asset/Story/FTS/checkpoint | 完成 | Prisma focused、Node Feed/Search/Story |
| 业务幂等与冲突 | 完成 | Run/Probe replay、409 conflict、超长 key 400 |
| 双 lease fencing 与旧 Worker拒写 | 完成 | Run + Action Job stale takeover Prisma tests |
| Worker 接管与 checkpoint 单调 | 完成 | reclaim、legacy CAS、并发 Workflow CAS |
| Bun 开发与 Node 生产 | 完成 | typecheck/test/build；Registry-enabled Node smoke exit 0 |
| 浏览器最小用户链路 | 完成 | production standalone、Feed/Search/详情、二次幂等、console clean |
| migration | 完成 | fresh 4 migrations；master 3 → 4 携带数据升级 |
| 文档与 walkthrough | 完成 | v0.18、PROJECT-STATUS、README、ADR、Task Round 103–105 |
| Docker/真实 RSS/跨平台/长时间恢复 | 未验证 | 明确保留，不由其它检查替代 |
| Knowledge/Research/Connection/Secret/Harness | 不在范围 | 未实现，文档未过度宣称 |

### 本轮最终状态

- Goal 已达到“固定 Ingest 生产链收敛并可审查”的完成条件；
- 分支结论仍为“需修改”，不是 merge approval；
- task ports `4321/3333/4333` 无监听，Node smoke 临时根已清理；
- 用户已有 `4310` 服务未触碰；
- Docker CLI 不存在；
- 没有 commit、push、merge、PR 或发布。

## Round 106 — `nb-workflow` Kernel、TaskStore/WakeupBus 与宿主架构纠偏

日期：2026-08-11

### 触发原因

Round 105 的质量审查已经证明固定 `cosmos.ingest@1` 可运行，但也发现 Cosmos
独立 Runtime 和 Prisma Store 体积过大。随后从 Web/API/Worker 多宿主和
`nb-workflow` 的关系继续审查，确认当前代码与早期“Worker 基于
`nb-workflow`”的方向发生了偏移：

- Cosmos Spike 没有依赖 `nb-workflow`，而是独立实现了脚本 path、replay、
  wait/signal 和 Child Workflow；
- `nb-workflow` 已探索 `path + seq + kind + fingerprint`、稳定 map/all、等待和
  Agent Session 语义；
- 两套内核继续平行演进会让 Query journal、fingerprint、并发和恢复规则分叉。

用户允许直接读取本地 session 文件恢复上一轮原文。复核来源：

```text
C:\Users\notnotype\.codex\sessions\2026\08\07\
rollout-2026-08-07T21-35-13-019fdc6f-5aed-76a3-8182-03eb3fc3ffe7.jsonl
```

从用户/assistant 原始消息恢复并再次确认：

1. `nb-workflow` 应像 LangChain 一样提供可组合组件，持久化可选；
2. Cosmos Worker 基于 `nb-workflow` 的规范脚本 Kernel 构建；
3. 队列拆为 SQL TaskStore 与可选 WakeupBus，Redis Streams 不成为任务权威；
4. Worker 并发需要区分 slot、多进程、Workflow 内并发、资源限流和采集计划重叠；
5. `wf.agents.invoke` 属于可选 Agent Extension，具体 Harness Adapter 等文档稳定；
6. `nb-workflow` 当前包结构只是初步草案，实际调整另开 Task。

### 新的所有权边界

```text
nb-workflow
  -> Workflow 脚本、Activity identity/fingerprint、replay、map/all、wait/cancel

Cosmos Workflow Backend/Host
  -> Run/Journal、TaskStore、Job/Attempt/Lease、Outbox、Worker、领域事务

neuro-agent-harness
  -> Agent Invocation、Session、Profile、Model Runtime

nb-memory
  -> 知识管理者共享长期记忆
```

执行词汇重新划分为：

```text
WorkflowRun
  -> Journal / Activity
      -> ActionDefinition
          -> Job
              -> Attempt + Lease
  -> Step projection (optional)
```

Step 不再是 replay 必需原语。当前 `WorkflowStepRun` 可以作为现有实现和 UI/trace
投影保留，但不能要求每个 Activity 复制一份相同输入输出。

### 队列与并发

可靠队列合同固定为：

```text
TaskStore
= Job/status/retry/Attempt/lease/fencing 的唯一真相

WakeupBus
= 可选通知；Worker 被唤醒后仍回 TaskStore claim
```

Local Durable 默认 SQLite + 自适应 polling，不要求 Redis。Redis 可以实现
Streams wakeup、rate limit、cache 和非权威 presence，但不能持有 Workflow/Job
终态、checkpoint 或唯一 lease，也不使用 BullMQ 替代 Cosmos Job。

并发分为：

1. Worker slot；
2. 多 Worker 进程；
3. `wf.map/wf.all`；
4. Provider/Connection/Source/域名/模型资源级限制；
5. CollectionPlan `forbid/queue/replace/allow/merge` overlap policy。

当前只具备前两层基础；完整资源调度、公平性和 overlap policy 未实现。

### 多宿主与 Agent

- Web 当前可以通过 HTTP/SSE 与 API 分主机。
- API/Worker 虽为独立进程，仍共享 SQLite/Data Root/Blob Root，只适合同机或
  共享卷。
- 目标 API 为 manifest-only 控制面，Worker 独占 executable，migration 由独立
  Migrator 完成。
- 真正多主机目标是 PostgreSQL + S3/MinIO + 可选 Redis；远程 Worker 通过
  Gateway 主动连接。
- `nb-workflow` Core 不依赖 Harness；`wf.agents.invoke` 映射到
  `agent.invoke@1`，Harness 负责 Invocation/Session，Cosmos 继续拥有 Job truth。

上述均是目标架构，不是当前已实现能力。

### 文档修改

本轮只修改文档：

- `CONTEXT.md`
  - 增加 Activity、ActionDefinition、Job、Attempt、Step、TaskStore、
    WakeupBus 和 CollectionPlan；
  - 更新 `nb-workflow`/Cosmos/Harness 所有权。
- `docs/architecture/0001-cosmos-foundation.md`
  - 更新为 Draft v0.19；
  - 增加可选 Backend 能力、TaskStore/WakeupBus、五层并发、多宿主、
    manifest-only API、Worker、Migrator 和 Agent Extension；
  - 把 WAL 从“已实现基线”修正为待显式配置和验证的 Local Durable 目标；
  - 增加 Phase 1C convergence gate。
- `docs/adr/0001-durable-workflow-runtime.md`
  - 保留历史，只标记被 ADR-0002 取代的具体范围。
- `docs/adr/0002-nb-workflow-kernel-cosmos-host.md`
  - 固定规范 Kernel、Cosmos Durable Host、可选 Backend、TaskStore/WakeupBus、
    多宿主、并发和 Agent Extension 决定。
- `docs/tasks/06-nb-workflow-kernel-convergence/README.md`
  - 新增独立实施入口；
  - 明确 `nb-workflow` 包结构仍是草案，必须另开分支/worktree；
  - 固定 Ingest parity、conformance、停止/回滚条件和非目标。
- `docs/tasks/04-workflow-runtime/README.md`
  - 将当前 Spike 定位为 parity/回滚证据；
  - 不在 Task 04 继续扩展平行 Runtime。
- `docs/requirements/0002-product-requirements.md`
  - 只修正 Activity/Attempt/可选 Step 术语，不新增一批技术型需求 ID。
- `README.md`、`PROJECT-STATUS.md`、`docs/README.md`、`docs/adr/README.md`
  - 更新项目入口、当前/目标边界和下一步。

原始需求文件保持 append-only，没有修改。

### 文档验证

首轮验证结果：

- `git diff --check`：通过；
- 39 个 Markdown 文件：
  - 代码围栏数量均为偶数；
  - 文件末尾换行全部存在；
  - 无 merge conflict marker；
- Markdown 相对链接：
  - 本轮修改/新增文档的相对链接全部存在；
  - 全仓仅命中原始需求中用户原话引用的本机
    `C:\Users\notnotype\.agents\skills\grilling\SKILL.md`；原始需求是
    append-only，不为修复本机链接而改写；
- PRD：158 个定义型需求 ID，无重复；
- 原始需求当前/HEAD SHA-1 均为
  `c94f7a89f97640dbde5a9bffeee948d6a04a1aec`；
- 旧“语义参考”只保留在 ADR-0001 的明确 supersession 历史和 v0.19 changelog；
- Redis 均被描述为非权威 WakeupBus，Harness 均被描述为可选 Extension；
- WAL 不再被误报为当前已验证能力。

追加本 Round 后还需重新运行同一组文档检查，最终结果以本 Round 后续补充和交付
报告为准。

### 未运行边界

本轮没有运行：

- typecheck、Vitest、build；
- Node production、migration smoke；
- 浏览器、Docker、真实 RSS/Bilibili/AI HOT；
- Worker restart/long-running；
- Redis、PostgreSQL、远程 Worker；
- Harness 或真实 Agent。

本轮也没有修改 `nb-workflow` 或 Cosmos 运行时代码，没有 stage、commit、push、
merge、PR 或发布。

### 最终复验

追加 Round 106 后重新执行同一组检查：

- 本轮 12 个修改/新增 Markdown：相对链接 0 个错误、围栏 0 个错误、EOF 0 个
  错误；
- 全仓 39 个 Markdown：除原始需求中的本机 skill 路径外无其它坏链接，围栏和
  EOF 全部通过；
- `git diff --check`：通过；
- merge conflict marker：0；
- PRD 定义型需求 ID：158 个，重复 0；
- 原始需求 SHA-1 仍为
  `c94f7a89f97640dbde5a9bffeee948d6a04a1aec`；
- Redis 正向任务权威表述：0；
- WAL 已实现过度表述：0；
- `nb-workflow` “语义参考”只存在于 ADR-0001 的 supersession 历史和 v0.19
  changelog；
- staged 文件：0。

分支仍为 `feat/t04-ingest-workflow-convergence`，HEAD 仍为
`dc78f0519e0320afbb27191b0d573be6cd62aedd`。本轮没有改变代码验证边界。

## Round 107 — Product Service、Worker Admin、Worker Gateway 与 DTO 草案

日期：2026-08-11

### 目标

用户确认：

1. 远程 Worker v1 使用 HTTPS request/response + bounded long-poll；
2. `ActionDefinition.executionPlacement` 使用
   `host`、`trusted_worker`、`remote_worker`；
3. 下一步深入检查原始需求和系统能力，单独形成完整 API/DTO 草案；
4. 草案允许后续实现调整；
5. 草案完成后派发多个子代理从不同链路审查和查漏补缺。

本 Round 只修改文档，不修改代码、Prisma schema、migration 或测试。目标不是把
所有 Planned API 一次实现，而是让后续 schema、Nest Controller、Worker Admin、
Gateway fake 和 conformance 有一套可审查输入。

### 工作区基线

```text
worktree:
C:\Users\notnotype\Documents\CodeRepository\GithubProjects\cosmos\
  .worktree\t04-ingest-workflow-convergence

branch: feat/t04-ingest-workflow-convergence
HEAD: dc78f0519e0320afbb27191b0d573be6cd62aedd
merge-base origin/master: 45ae918bfcfcf5dfaf90480183608007a48ee170
staged files: 0
```

开始时 worktree 已有前序 Spike 的 87 个 dirty 文件，涉及代码、migration squash、
文档和 Playwright 文件。本 Round 没有清理、覆盖或暂存这些用户/前序改动；只编辑
API 及其同步文档。

### 原始需求与能力调查

重新对照：

- `docs/requirements/0001-original-requirements.md`；
- `docs/requirements/0002-product-requirements.md`；
- 两份总体/信息模型架构；
- ADR-0001/0002；
- Task 04/05/06；
- 当前 contracts、Transport、Nest Controller、Worker Runtime、Prisma schema、
  Docker/Compose 和环境配置。

从用户场景反推的公共能力不只包括当前 Source/Feed 路由，而是：

```text
System / Capability / Protocol
Catalog / Plugin / SourceDefinition / ActionDefinition / WorkflowDefinition
Connection / Source / CollectionPlan / Trigger
WorkflowRun / Activity / Step / Job / Attempt / Receipt / Signal
Observation / Entry / Revision / Asset / Blob
Story / Topic / Entity / Relation / Proposal
KnowledgeSignal / ResearchRequest
Feed / Related / Interaction / ReadState / Spotlight
Workspace / Artifact / Agent Conversation
Board
Publication / Subscription / Delivery
Storage / Backup / Restore / Export / Delete / Integrity
```

同时确认三个 API 面：

```text
Product Service API
  -> Web / CLI / Desktop / Knowledge Manager tools

Worker Admin API
  -> health / readiness / status / capability / metrics / drain

Worker Gateway API
  -> Session / long-poll claim / Attempt heartbeat / Receipt / Result
```

Product Service 与 Gateway 初期可由同一 NestJS 宿主承载，但模块、路径和版本独立；
Worker Admin 使用单独内部端口。Admin 不提供同步 Job execute，Gateway 不持有第二
份 Job terminal。

### v0.1 独立草案

新增：

```text
docs/api/README.md
docs/api/0001-common-contracts.md
docs/api/0002-product-service-api.md
docs/api/0003-product-dtos.md
docs/api/0004-worker-admin-api.md
docs/api/0005-worker-gateway-api.md
docs/api/0006-scenarios-and-conformance.md
docs/api/0007-review-findings.md
```

v0.1 约 3,800 行，覆盖 Header、Page、ServiceError、Idempotency、ETag、SSE、
ValueRef、全部 Product 资源、Worker Admin、Gateway Session/claim/lease/
Receipt/Value/Secret/result/replacement/drain，以及产品、故障和 Transport 场景。

同步新增：

- ADR-0003：固定三个 API 面、long-poll、Direct/Gateway 混合和 placement；
- PRD v0.16：增加 Product/Admin/Gateway、remote Worker 和 placement 需求；
- 总体架构 v0.20；
- Task 06 Step 5 的 API/Host convergence 边界；
- 原始需求 append-only 追加本轮用户原话；
- `CONTEXT.md`、文档索引、项目状态和 README 入口。

### 五个隔离只读审查代理

先前一次前台尝试因单次命令 60 秒上限未产出，已清理且不计入结果。随后使用五个
隐藏、ephemeral、read-only `codex exec`，分别读取限定文件并写独立结果：

| 范围 | 结果 | 状态 |
| --- | --- | --- |
| 产品需求覆盖 | `product.final.md` | 成功 |
| Workflow/恢复 | `runtime.final.md` | 成功 |
| Gateway/分布式 | `gateway.final.md` | 成功 |
| 运维/安全/隐私 | `operations.final.md` | 成功 |
| DTO/Zod/兼容 | `dto.final.md` | 成功 |

实际成功数：5/5。代理均未修改仓库文件。结果文件和 SHA-256 记录在
[`docs/api/0007-review-findings.md`](../../api/0007-review-findings.md)。

### 主审与 v0.2 修订

主代理没有直接接受代理结论，而是逐条回查 PRD、架构和代码。主要修订：

#### 1. 实现成熟度与产品 Phase 分离

`Current/Convergence/Planned/Reserved` 是实现成熟度，不是产品 Phase。Phase 1
最小闭环已完成，但完整 Phase 1 仍缺 Source 删除、默认定时 CollectionPlan、
Source health/checkpoint、完整 Run/Step、真实 RSS/Docker/长时间恢复。

这些项目标为 `Planned · Phase 1 remainder`，不因此全部扩进 Task 06。

#### 2. Product DTO 补齐

- 最小 Story Current 与完整 Story/Topic Planned 分开；
- Run 增加不可变 Trigger reason/input/fingerprint/definition/mapping/evidence；
- CollectionPlan 增加 discovery context；
- KnowledgeSignal 使用 append-only disposition，不增加可变 status；
- ResearchRequest 增加 trigger input/depth，运行细节通过 runId 查询 Runtime；
- 协作修改统一 `MutationAuditSnapshot`；
- Story merge/split 增加用户状态 migration preview/apply/revert；
- Ranking/Spotlight 增加 policy/version/signal/adjustment/threshold；
- Workspace 增加 maintenance binding、current Step、recent result、input/budget；
- Artifact 使用严格 sandbox render profile，不再用 `executable: boolean`；
- Subscription 增加 schedule/timezone/misfire/channel capability；
- Detail 的集合改为有界 preview，完整历史走分页子资源；
- 删除会退化为纯 `unknown` 的 `ValueEnvelope | unknown`。
- 主审补充 Search/Feed/Run/List Query DTO，以及 Connection/Plan/Trigger、
  Story/Topic、Workspace/Board、Publication/Delivery 和数据运维 mutation Command
  基线，避免只靠自然语言生成 Zod/OpenAPI。

#### 3. Gateway owner 与恢复收口

v0.1 存在真实双 owner 矛盾：旧 Session 可继续 Attempt，新 Session 又可用同 token
resume。v0.2 固定：

```text
Attempt owner
= (attemptId, ownerSessionId, ownerEpoch, leaseToken, leaseExpiresAt)
```

- replacement 只停止旧 Session 新 claim；
- resume 通过 TaskStore CAS 转移 owner、递增 epoch、轮换 token；
- 旧 owner 立即失去 heartbeat/Receipt/Result 权限；
- 没有 resume 时，旧 Session 仍只能完成自己的原 owner tuple。

#### 4. external late evidence

lease 丢失后不能再使用 lease Receipt API。external claim 获得短期、
Attempt-scoped late-evidence capability；它只能追加 `external_effect_unknown`
并触发 reconcile，不能续租、提交 Result、恢复 Secret、写 checkpoint/Event 或
领域状态。

#### 5. 容量、backpressure 与 Receipt CAS

- TaskStore 原子保留 Session/lane slot；Worker `available` 只是提示；
- long-poll 有每 Session in-flight 上限；
- claim 使用 Idempotency-Key 保存 batch replay，响应丢失不再领取第二批；
- Receipt 使用 revision/baseRevision、submission fingerprint 和 server receivedAt；
- heartbeat expiry 被 Run/Action/drain deadline 截断；
- draining Session 继续 heartbeat，但不能 claim。

#### 6. Value、Secret 和身份

- JSON hash 使用 RFC 8785 canonical UTF-8；
- text/blob 使用实际原始字节；
- body limit 在 JSON 解析前执行；
- upload 增加 finalize/abort/hash/size；
- Secret material 不使用可持久化 ValueEnvelope；
- Secret resolution 保持 Reserved；
- Gateway bootstrap 固定 provider-neutral identity claims，具体 mTLS/OIDC/token
  provider 后置。

#### 7. 部署和实现 gate

审查确认当前实现有以下真实风险：

- Product API 无认证并可绑定 `0.0.0.0`，Compose 发布 4310；
- CORS 不能作为认证；
- fixture `fixturePath` 可读取绝对路径；
- Source/Job/Asset public projection 尚未证明移除内部 config/result/storageKey；
- 还没有 `/healthz`/`readyz` 分离、Worker Admin 或真实 Gateway。

v0.2 明确当前未认证模式只适用于本机/受信网络；公网、远程 Product API、Admin、
Gateway、Secret 和文件 transfer 都需要独立 release gate。本 Round 不扩张到实现
完整认证平台。

### 调整或未采纳的建议

- 不把全部 Phase 1 项标成 Task 06 `Convergence`；
- 不把 KnowledgeSignal 改成可变 status；
- 不因 DTO 有 Attempt 就提前强制独立 Prisma Attempt 表；先要求独立语义、
  projection 和 conformance，无法证明再迁移；
- 不在 ResearchRequest 复制第二份 Activity/Job 状态；
- 不把当前代码单 Entry Story projection 误报成 v0.1 草案错误；草案已有多成员
  Membership，当前代码属于实现迁移；
- 不在本轮实现完整公网认证、Secret 平台或不可信插件沙箱。

### 同步文件

v0.2 修订同步到：

- `docs/api/` 全部草案与审查记录；
- ADR-0003；
- 总体架构 v0.21；
- Task 06 fake Gateway/conformance gate；
- `PROJECT-STATUS.md`；
- 根 `README.md`。

PRD 已有 Trigger/Research/Story/推荐/Artifact/运行恢复需求，不为每个协议字段再
制造一批重复技术型 ID。原始需求文件只保留此前 append-only 追加。

### 当前未实现

- v0.2 Zod schema 和 package 拆分；
- Product Controller/Application Port/HTTP Client 迁移；
- canonical route、Header、Page、ETag、ServiceError 和 SSE wire 收敛；
- Worker Admin HTTP Server；
- Gateway fake、owner CAS、late evidence、Receipt CAS、slot reservation、
  backpressure 和 claim replay；
- bootstrap provider、Secret Broker、PostgreSQL/S3 多主机；
- Connection/CollectionPlan/Knowledge/Research/Workspace/Publication 产品实现；
- 公网认证、Docker 生产安全模板和完整数据生命周期。

### 验证

已运行：

- `git diff --check`：通过；
- 全仓 48 个 Markdown：相对链接错误 0、未闭合围栏 0、EOF 缺失 0、尾随空白
  0、conflict marker 0；
- PRD 定义型需求 ID：164 个、重复 0；
- 原始需求相对 HEAD：新增 22 行、删除 0 行；当前 SHA-1
  `74f785a572ecedf150e2ad12ecf0f758f7278671`，HEAD SHA-1
  `c94f7a89f97640dbde5a9bffeee948d6a04a1aec`；
- 8 份 API 文档共 5,158 行，37 个 TypeScript 围栏合并后以 strict/noEmit 做
  syntax + semantic 检查：0 diagnostics；
- Product DTO TypeScript：敏感 lease/session/storage/path 字段 0，
  `ValueEnvelope | unknown` 退化联合 0，mutation Command 无 owner `unknown` 0；
- Product API 自动提取 185 个 method/path key，文件内重复 0；Worker Admin
  9 个，重复 0；
- 旧 `Flow` 只保留在总体架构 3 处明确迁移/历史说明；
- staged files 0，五个审查进程均已退出；
- branch/HEAD/merge-base 仍分别为
  `feat/t04-ingest-workflow-convergence`、
  `dc78f0519e0320afbb27191b0d573be6cd62aedd`、
  `45ae918bfcfcf5dfaf90480183608007a48ee170`。

本轮没有运行代码测试、typecheck、build、Node production、migration、browser、
Docker、真实来源、长时间恢复、Gateway 多主机、真实认证、Secret Broker 或
Harness/Agent。既有 Spike 证据仍是历史基线，不能替代 API v0.2 后续实现的
schema/Transport/conformance 验收。
