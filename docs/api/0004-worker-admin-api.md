# Worker Admin API 草案

> 状态：Draft v0.2；本地 Worker 稳定后的实现参考，当前未实现
>
> 基础路径：`/admin/v1`
>
> 公共约定：[`0001-common-contracts.md`](0001-common-contracts.md)

## 1. 责任

Worker Admin API 是单个 Worker 进程的内部运维面，供容器探针、编排器和运维工具
使用。它不属于 Web/CLI 的 Product API，也不是任务 Transport。

它负责：

- process liveness；
- execution readiness；
- 当前 mode、lane、slot、manifest 和 Backend/Gateway 状态；
- 指标；
- graceful drain。

它不负责：

- 通过 HTTP 指定某个 Job 立即执行；
- 暴露 Job input/output、Secret、session token 或 lease token；
- 调用任意 Connector、脚本、shell 或 Agent；
- 修改 Cosmos 领域对象；
- 取代 TaskStore claim。

## 2. 暴露方式

- Worker Admin 使用独立端口，不能与 Product API 共用 Router。
- 默认绑定 loopback；容器模式可显式绑定 pod/container 内部地址。
- `/healthz` 和 `/readyz` 可以供探针访问。
- `/admin/v1/*` 和 `/metrics` 的远程认证策略后置，但实现时必须保留独立 middleware
  边界，不能假定它们永远暴露公网。
- 非 loopback/container-internal 绑定必须显式配置认证和网络策略；Product API 的
  身份不能自动获得 Admin drain 权限。
- 配置关闭 Admin Server 时，Worker 执行能力不受影响；但生产编排必须使用其它可
  验证的探针。

## 3. 端点

| 成熟度 | Method | Path | 结果 |
| --- | --- | --- | --- |
| Convergence | `GET` | `/healthz` | `WorkerLivenessSnapshot` |
| Convergence | `GET` | `/readyz` | `WorkerReadinessSnapshot`；未 ready 返回 `503` |
| Convergence | `GET` | `/admin/v1/status` | `WorkerStatusSnapshot` |
| Convergence | `GET` | `/admin/v1/capabilities` | `WorkerCapabilitySnapshot` |
| Convergence | `GET` | `/admin/v1/drains` | 当前/近期 drain page |
| Convergence | `POST` | `/admin/v1/drains` | `202 WorkerDrainSnapshot` |
| Convergence | `GET` | `/admin/v1/drains/{id}` | drain 进度 |
| Reserved | `POST` | `/admin/v1/drains/{id}/deadline-extensions` | 受控延长期限 |
| Convergence | `GET` | `/metrics` | Prometheus text exposition |

不提供 `resume`。默认 drain 成功后 Worker 退出，由服务管理器重新启动；如果未来
需要不退出的 pause/resume，应建立独立状态机和决定，不能把 drain 语义改掉。

## 4. DTO

```ts
type WorkerMode = "direct" | "gateway";

type WorkerLivenessSnapshot = {
    status: "alive";
    service: "cosmos-worker";
    workerId: string;
    instanceId: string;
    version: string;
    processStartedAt: string;
    timestamp: string;
};

type WorkerReadinessSnapshot = {
    ready: boolean;
    workerId: string;
    instanceId: string;
    mode: WorkerMode;
    acceptingWork: boolean;
    draining: boolean;
    components: {
        migration: ComponentHealth;
        taskStore?: ComponentHealth;
        gatewaySession?: ComponentHealth;
        definitionCatalog: ComponentHealth;
        actionRegistry: ComponentHealth;
        connectorRegistry: ComponentHealth;
        valueStore: ComponentHealth;
    };
    checkedAt: string;
};

type WorkerLaneStatus = {
    lane: string;
    enabled: boolean;
    configuredSlots: number;
    acceptingSlots: number;
    activeSlots: number;
    idleSlots: number;
    lastClaimAt: string | null;
    lastPollAt: string | null;
    lastError: FailureSnapshot | null;
};

type WorkerActiveAttemptSummary = {
    attemptId: string;
    jobId: string;
    runId: string;
    actionRef: string;
    lane: string;
    slot: number;
    startedAt: string;
    leaseExpiresAt: string;
    cancellationRequested: boolean;
};

type WorkerStatusSnapshot = {
    workerId: string;
    instanceId: string;
    registrationGeneration: number | null;
    version: string;
    mode: WorkerMode;
    status: "starting" | "ready" | "draining" | "stopped" | "degraded";
    processStartedAt: string;
    registeredAt: string | null;
    lastHeartbeatAt: string | null;
    lanes: WorkerLaneStatus[];
    activeAttempts: WorkerActiveAttemptSummary[];
    activeAttemptCount: number;
    recentErrors: FailureSnapshot[];
    drain: WorkerDrainSnapshot | null;
    timestamp: string;
};

type WorkerManifestEvidence = {
    ref: string;
    manifestHash: HashRef;
};

type WorkerCapabilitySnapshot = {
    workerId: string;
    instanceId: string;
    version: string;
    mode: WorkerMode;
    evidenceVersion: number;
    evidenceAuthority: "local_executable" | "catalog_admitted";
    lanes: string[];
    genericCapabilities: string[];
    workflowEvidence: WorkerManifestEvidence[];
    actionEvidence: (WorkerManifestEvidence & {
        executionPlacements: ("host" | "trusted_worker" | "remote_worker")[];
    })[];
    connectorEvidence: WorkerManifestEvidence[];
    limits: {
        maxConcurrency: number;
        maxInlineValueBytes: number;
        maxJobRuntimeMs: number | null;
    };
    generatedAt: string;
};

type CreateWorkerDrainCommand = {
    reason: string;
    deadlineMs?: number | null;
    exitAfterDrain?: true;
};

type WorkerDrainSnapshot = {
    id: string;
    workerId: string;
    instanceId: string;
    idempotencyKey: string;
    status:
        | "accepted"
        | "draining"
        | "succeeded"
        | "timed_out"
        | "failed";
    reason: string;
    activeAttemptIds: string[];
    acceptedAt: string;
    deadlineAt: string | null;
    finishedAt: string | null;
    exitAfterDrain: true;
    resourcesClosed: boolean;
    error: FailureSnapshot | null;
};
```

`ComponentHealth`、`FailureSnapshot` 和 `HashRef` 从无 Product 依赖的 common
contracts 复用；Worker Admin 放在独立 package，不能因此依赖 Product DTO、Web 或
NestJS。

## 5. Readiness 语义

### 5.1 Direct mode

ready 必须满足：

- migration/schema compatible；
- TaskStore/Application/ValueStore 可用；
- executable manifests 已加载并完成本地校验；
- 至少一个 lane 启用；
- 未进入 drain；
- Supervisor 可以启动或继续 claim。

Redis/WakeupBus 不可用不能单独让 Direct Worker not ready；fallback polling 仍能
保证执行。它可以让状态 degraded 并暴露指标。

### 5.2 Gateway mode

ready 必须满足：

- Worker Gateway 协议协商成功；
- Session 未 fenced/expired；
- manifest evidence 已被接受或明确处于可 claim 状态；
- 至少一个 lane 有可用 slot；
- 未进入 drain。

短暂没有 Job 不是 not ready。没有 capable Definition 可以显示 degraded/idle，
但只有配置错误或 catalog incompatibility 才阻止对应 lane。

## 6. Drain 状态机

```text
accepted
  -> draining
      -> succeeded -> process exit 0
      -> timed_out -> process remains for explicit termination / exit 1
      -> failed    -> process exit 1 or operator action
```

执行顺序：

1. 原子切换 `acceptingWork=false`。
2. Direct mode 停止新 claim；Gateway mode 向 Session 报告 draining。
3. 继续为当前 Attempt 和 Gateway Session heartbeat，等待其成功、失败、取消或
   主动释放；draining Session 保持可验证，但不能 claim 新 Job。
4. deadline 到达时向可取消 Action 发出 cooperative abort。
5. 仍有活跃 Attempt 时不得假装 resources closed。
6. 全部 slot 收口后停止 registration heartbeat，记录 stopped，关闭
   Backend/HTTP/logger，并退出。

Attempt heartbeat 的新 expiry 不得超过 Run/Action/drain deadline。deadline 到达后
仍无法停止的 external Action 进入 lease-lost/late-evidence/reconcile，不能靠延长
Session TTL 假装 drain 成功。

重复相同 `Idempotency-Key` 返回同一个 Drain；不同 payload 冲突。

Drain 不主动把外部副作用伪装成失败。若 Action 已开始外部操作而无法确认结果，
必须留下 `unknown` Receipt/Attempt 状态供 reconcile。

## 7. Metrics 基线

至少预留：

```text
cosmos_worker_ready
cosmos_worker_accepting_work
cosmos_worker_active_attempts{lane,action_ref}
cosmos_worker_claim_total{lane,result}
cosmos_worker_attempt_total{action_ref,status}
cosmos_worker_attempt_duration_seconds{action_ref,status}
cosmos_worker_lease_renew_total{result}
cosmos_worker_gateway_request_total{operation,result}
cosmos_worker_poll_duration_seconds{lane}
cosmos_worker_drain_total{status}
```

标签不能包含 Source 名称、用户输入、URL、SecretRef、Job ID 或其它高基数/敏感值。
Job/Run 精确关联留在结构化日志和 Product Query。

## 8. 错误与幂等

- Admin 写操作使用 `Idempotency-Key`。
- `409 drain_in_progress`：已有不同 drain 正在执行。
- `409 already_stopped`：进程已进入不可逆 stop。
- `503 not_ready`：状态可查询，但当前不能承担执行。
- `503 backend_unavailable` / `gateway_unavailable`：按 mode 区分。
- `504 drain_timeout`：返回持久/内存 DrainSnapshot，不只返回字符串。

Admin Error 不回传 stack、token、Action input 或上游正文。

## 9. 当前实现差距

当前 Worker 已有 Supervisor、slot、heartbeat、registration 和 shutdown/drain
Controller，但没有 HTTP Server。现有 shutdown 主要由 SIGINT/SIGTERM 和测试 IPC
触发。实现顺序应是：

1. 抽出只读 `WorkerStatusProvider` 和 `DrainApplicationService`；
2. 行为测试状态快照与重复 drain；
3. 增加可关闭的轻量 HTTP Admin host；
4. 接入容器探针；
5. 单独验证 Node production、SIGTERM、deadline 和有活跃 Attempt 的 drain。
