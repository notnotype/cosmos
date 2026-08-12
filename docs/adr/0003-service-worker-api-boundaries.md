# ADR-0003：Product Service、Worker Admin 与 Worker Gateway 边界

> 状态：Accepted design contract
>
> 日期：2026-08-11
>
> API/DTO 草案：[`../api/README.md`](../api/README.md)
>
> 依赖决定：[`0002-nb-workflow-kernel-cosmos-host.md`](0002-nb-workflow-kernel-cosmos-host.md)

## Context

Cosmos 需要同时支持服务器、嵌入式客户端和客户端/服务分离模式。当前 Web 通过
HTTP/SSE 访问 NestJS；API 与 Worker 虽然分进程，仍共享 SQLite/Data Root；
Worker 没有 HTTP Server。未来既需要本地可信 Worker 保持领域事务和 lease fencing，
也需要无数据库权限的远程 Worker 执行可移植 Action。

如果把产品客户端、运维和任务执行混在一套 API 中，Worker 很容易出现同步
`execute Job` 旁路，或让 Redis/Gateway 与 SQL 各自持有一份 owner/终态。反过来，
如果所有 Worker 都强制经过 Gateway，会破坏当前 SQLite 单机路径，并把 Host
领域 Action 远程化。

## Decision

### 1. 三个独立 API 面

- **Product Service API** 面向 Web、CLI、Desktop、知识管理者工具和受控扩展，
  提供 Product Command、Query、SSE 和受控文件读取。
- **Worker Admin API** 由每个 Worker 提供，只负责 health、readiness、status、
  capability、metrics 和 drain。
- **Worker Gateway API** 面向主动连接的远程 Worker，提供 Session、claim、
  Attempt heartbeat、Receipt、Value transfer 和 Result。

Product Service 与 Worker Gateway 初期可以由同一个 NestJS 宿主承载，但使用独立
模块、路径和协议版本。Worker Admin 使用独立内部端口。

### 2. 不提供同步 Job execute

Worker Admin 不接受 `POST /jobs/{id}/execute`、任意 Connector command、shell 或
领域写入。可靠任务只从 TaskStore claim；API/Gateway 不能形成第二套调度。

### 3. Gateway v1 使用 HTTPS long-poll

远程 Worker 主动创建 Session，并用 bounded HTTPS long-poll 请求可领取 Job。
Gateway 在 SQL TaskStore 中完成原子 claim 后才返回 Attempt lease。Result、
heartbeat 和 Receipt 使用幂等 request/response。

WebSocket 可以作为未来 Transport Adapter，但不能改变 Session/Claim/Attempt
语义，也不能以连接状态持有 durable truth。

### 4. 混合 Direct/Gateway Worker

- 本地或同一信任边界内的核心 Worker 可以直接使用 Cosmos Backend/TaskStore，
  以保持领域事务和 SQL lease fencing。
- 无数据库/Data Root 权限的远程 Worker 必须通过 Gateway。
- 真正多主机 Direct Worker 使用 PostgreSQL/S3 等共享 Backend，不使用共享 SQLite
  网络盘。

### 5. Action 声明执行位置

ActionDefinition 增加稳定 `executionPlacement`：

```text
host
trusted_worker
remote_worker
```

- `host` 用于领域 Command、checkpoint 和靠近数据库事务的操作，不经 Gateway。
- `trusted_worker` 用于 Browser Bridge、本机 profile 或其它受信任资源。
- `remote_worker` 可以发给满足精确 manifest/schema/capability 的 Gateway Worker。

Direct/Trusted Worker 可以执行 remote-capable Action；普通远程 Worker 不能执行
host/trusted-only Action。

### 6. TaskStore 与领域真相不变

SQL TaskStore 是 Job/Attempt/lease/retry 的唯一权威。Session heartbeat 不替代
Attempt heartbeat；Gateway/WakeupBus 不持有 Job terminal。旧 lease 的迟到结果
不能写领域状态、checkpoint、Event/Outbox 或 terminal result。

远程 Worker 只返回 Action output/ValueRef/Receipt。领域写入由 Cosmos Host 通过
Application Command 和当前 fence 提交。

Gateway Attempt ownership 使用持久
`(attemptId, ownerSessionId, ownerEpoch, leaseToken, leaseExpiresAt)`。Session
replacement 只关闭旧 Session 的新 claim；显式 resume 必须在 TaskStore 中 CAS
转移 owner、递增 epoch 并轮换 token，旧 Session 立即失去该 Attempt 的写权限。
Gateway 多副本还必须在同一 TaskStore 合同中原子保留 Session/lane slot，不能只
相信 Worker 上报的 `freeSlots`。

### 7. 外部副作用与大值

外部 Action 使用 at-least-once、Idempotency-Key 和
`started/committed/unknown/compensated` Receipt。不能确认的外部结果进入
reconcile，不自动伪装成失败重试。

大值使用内容寻址 ValueRef 和短期 transfer capability，不通过 Gateway JSON
重复传输，也不暴露绝对文件路径。

lease 丢失后如外部副作用可能已经发生，Worker 只能使用短期、
Attempt-scoped late-evidence capability 追加 `unknown` 证据。该 capability 不能
续租、完成 Job、恢复 Secret 或写领域状态。Receipt transition 使用 revision/CAS，
claim 使用幂等 batch replay；HTTP 连接、Session presence 和 Worker 本地时钟都不
拥有状态顺序。

### 8. 实施顺序

本 ADR 固定协议责任，不要求三个 API 面在同一轮落地。先稳定 `nb-workflow`
Kernel，再参考 Cosmos Task 04 Spike 和 API/DTO Draft v0.2 实现本地
Worker/Durable Host；Worker Admin 随本地 Worker 的运维边界实现。远程 Worker
Gateway 在本地 Direct Worker conformance 稳定后单独实施，不进入下一轮
Kernel/本地 Worker 收敛。

## Consequences

### Positive

- Web/CLI、运维和远程执行不会互相获得不需要的能力。
- Local SQLite 保持简单，未来 PostgreSQL/远程 Worker 仍有清晰迁移路径。
- Gateway 可以无 sticky session、多副本运行，Redis 仍只是可选唤醒。
- Action manifest 明确哪些任务能远程化，领域写入继续受 SQL fence 保护。
- Direct/Gateway 可以共享同一 conformance suite，避免两套 Job 状态机。
- replacement/resume、并发 long-poll 和失租后的外部证据都有单一持久裁决点。

### Costs and risks

- 需要三个 Transport client/module，而不是一个万能 Controller。
- 当前 API 直接依赖 Prisma、加载 executable，需要 convergence。
- 当前 Job attempt 主要由计数/lease 表达；Gateway 落地前需确认独立 Attempt
  projection 和审计是否足够。
- 远程 Secret 需要独立 bootstrap identity、Session token 和 Secret Broker
  设计。
- Gateway 需要持久 slot reservation、claim replay、owner epoch、late-evidence
  token 和 Receipt CAS，协议实现成本高于简单 HTTP polling。
- long-poll 的即时取消依赖 Attempt heartbeat；如未来需要更低延迟，可以增加
  WebSocket Adapter。

## Alternatives considered

### NestJS 同步调用 Worker HTTP execute

拒绝。请求超时无法证明 Action 未执行，会与 TaskStore retry/lease 形成两套 owner
和 unknown-result 路径。

### 所有 Worker 都直连数据库

拒绝。第三方/远程 Worker 会获得过大的数据和 Secret 权限，也无法适配客户端与
服务分离模式。

### 所有 Worker 都强制经过 Gateway

拒绝。Local SQLite 和可信领域事务会增加无必要网络跳转，host-only Action 的
atomic fencing 更复杂。

### WebSocket 作为唯一 v1 Transport

暂不采用。它增加连接归属、负载均衡和 Gateway 多副本复杂度；语义稳定后仍可作为
可选 Adapter。

### Redis/BullMQ 持有远程 Job owner

拒绝。它无法与 SQL 中的领域写入、checkpoint 和 Outbox 保持同一 fencing truth。

## Revisit Gate

仅在以下情况重新评估：

1. HTTPS long-poll 无法满足经测量的延迟/流量要求，且 WebSocket Adapter 可以保持
   相同 durable 语义；
2. Cosmos Host 无法在不把数据库暴露给远程 Worker 的情况下应用 Action output；
3. Direct/Gateway conformance 证明混合模式不可避免地产生两套状态机；
4. Secret Broker 无法在目标部署中安全提供短期、Attempt-scoped credential；
5. PostgreSQL/S3 多主机部署证明另一种 Transport 明显更简单且不破坏 TaskStore
   authority。

## Verification requirements

- Product API、Worker Admin 和 Worker Gateway schema/Transport 分包测试。
- API build 不加载 executable；Worker build 独占 executable。
- Direct/Gateway 跑同一 claim/renew/complete/fail/cancel/Receipt suite。
- Session generation、Attempt lease、replacement、resume、drain 和迟到结果。
- owner handoff CAS、claim response 丢失重放、并发 Gateway slot reservation 和
  long-poll backpressure。
- 外部 committed/unknown/reconcile。
- late-evidence capability 不能取得 owner/terminal/Secret 权限。
- ValueRef hash、上传中断、orphan GC 和 retired value。
- API ready + Worker unavailable 时离线内容仍可查询。
- Gateway 多副本、断线、丢失/重复 Wakeup 和无 Redis。
- Node production、Docker、PostgreSQL/S3、多主机与真实外部 Action 分别验收。
