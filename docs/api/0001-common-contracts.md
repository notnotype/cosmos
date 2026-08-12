# API 公共合同

> 状态：Draft v0.2
>
> 入口：[`README.md`](README.md)

## 1. 协议命名空间

| API 面 | 基础路径 | 版本所有权 |
| --- | --- | --- |
| Product Service | `/api/v1` | 产品 Command、Query、Snapshot 和 Event |
| Worker Gateway | `/api/worker/v1` | Worker Session、Claim、Attempt 和结果协议 |
| Worker Admin | `/admin/v1` | 单个 Worker 的运维协议 |
| 基础探针 | `/healthz`、`/readyz`、`/metrics` | 宿主和容器生命周期，不跟随产品资源版本 |

Product Service 与 Worker Gateway 的版本独立。升级 Worker 协议不要求 Web 客户端
同时升级；升级 Feed DTO 也不应迫使 Worker 重新握手。

## 2. 编码与基本类型

- JSON 使用 UTF-8，`Content-Type: application/json`。
- SSE 使用 `text/event-stream`。
- Blob/Artifact 文件使用实际媒体类型，不先编码为 JSON/base64。
- HTTP Server 在 JSON 解析和对象物化前执行 `Content-Length`/流式字节上限；请求
  声明的 `byteSize` 不能替代实际读取上限。
- 时间使用带时区的 ISO 8601 UTC 字符串，例如
  `2026-08-11T12:34:56.789Z`。
- 持续时长和窗口使用非负整数毫秒，并在字段名中包含 `Ms`。
- ID 是不透明字符串。客户端不能解析 CUID/UUID、依赖排序或拼接文件路径。
- hash 使用 `{ algorithm, value }`，当前推荐 `sha256`，不把算法隐含在裸字符串。
- 枚举使用稳定小写 snake_case；新增值必须让旧客户端可以按 unknown/default
  路径降级。
- 金额和模型成本不得使用二进制浮点隐含币种；后续成本 DTO 显式声明 currency
  和字符串 decimal。

需要跨宿主核验的值使用稳定字节定义：

- `application/json` inline value 先按 RFC 8785 JSON Canonicalization Scheme
  生成 UTF-8 字节，再计算 `byteSize` 和 hash；
- `text/plain` 使用传输后的原始 UTF-8 字节，不做换行或 Unicode 规范化；
- Blob/Artifact/upload 对实际原始字节计算 hash；
- JSON 不接受 `NaN`、`Infinity`、`undefined`、循环引用或重复对象键；
- `byteSize`、数组长度、字符串长度和对象深度的上限由 capability 返回并由 schema
  再次约束。

## 3. 公共 Header

| Header | 方向 | 语义 |
| --- | --- | --- |
| `X-Cosmos-Protocol-Version` | 双向 | 请求期望和响应实际协议版本 |
| `X-Request-ID` | 双向 | 请求关联；客户端可提供，服务端校验后接受或生成 |
| `Idempotency-Key` | Command 请求 | 业务幂等键；同 key 不同规范化 payload 返回冲突 |
| `If-Match` | 修改现有用户真相 | 基于 ETag/revision 的乐观并发控制 |
| `ETag` | Query 响应 | 资源当前 revision/hash |
| `Last-Event-ID` | SSE 请求 | 最后已应用 Event ID |
| `Retry-After` | 限流/暂不可用响应 | 客户端可再次请求的建议时间 |
| `Authorization` | 预留 | 未来远端服务和 Worker bootstrap/session 认证 |

日志可以记录 Header 是否存在和安全的关联 ID，不记录 Authorization、
Worker session token、lease token 或 Secret。

## 4. 成功响应

单个资源直接返回 Snapshot，不增加无语义的 `{ data }` 包装。列表统一返回：

```ts
type Page<T> = {
    items: T[];
    nextCursor: string | null;
    snapshotAt?: string;
};
```

异步 Command 返回 `202 Accepted` 和：

```ts
type CommandReceipt<TTarget = ResourceRef> = {
    commandId: string;
    idempotencyKey: string;
    status: "accepted" | "already_applied";
    target: TTarget;
    runRef?: ResourceRef | null;
    createdAt: string;
};
```

如果创建的资源已经足以表示进度，也可以直接返回对应 Snapshot，但必须包含
`commandId`/`idempotencyKey` 或可稳定查询的 Run/Job ID。

同步创建普通配置资源使用 `201 Created`；读取使用 `200 OK`；无响应体的幂等删除
使用 `204 No Content`。删除有异步数据影响时必须创建 DeletionPlan/Run，不能返回
一个伪同步 `204`。

## 5. 公共引用 DTO

```ts
type ResourceRef = {
    type: string;
    id: string;
    revisionId?: string | null;
};

type ActorRef = {
    kind: "user" | "agent" | "system" | "plugin";
    id: string;
    displayName?: string | null;
};

type ProducerRef = {
    kind: "rule" | "model" | "agent" | "plugin" | "user" | "system";
    id: string;
    version: string;
};

type EvidenceRef = {
    target: ResourceRef;
    role?: string | null;
    fragment?: {
        selector: string;
        start?: number;
        end?: number;
    } | null;
};

type CorrelationRef = {
    type: string;
    id: string;
};

type HashRef = {
    algorithm: "sha256" | string;
    value: string;
};
```

`ResourceRef` 是 API 引用，不是多态数据库外键承诺。服务端仍通过 Application
Query/Command 校验目标类型和 revision。

## 6. ValueRef 与大值

```ts
type ValueEnvelope =
    | {
        kind: "inline";
        mediaType: "application/json" | "text/plain";
        value: unknown;
        byteSize: number;
        hash: HashRef;
    }
    | {
        kind: "blob";
        ref: string;
        mediaType: string;
        byteSize: number;
        hash: HashRef;
    }
    | {
        kind: "artifact";
        artifactRevisionId: string;
        path?: string | null;
        mediaType: string;
        byteSize: number;
        hash: HashRef;
    };
```

- inline 阈值由服务 capability 返回，不写死在客户端。
- 服务端必须根据上述 canonical bytes 重新计算 inline `byteSize` 和 hash；不能信任
  调用方声明值。
- Gateway claim、Job result、Activity journal 和 Child Workflow input 可以共享同一
  ValueRef，避免重复物化。
- `ref` 不是绝对文件路径。外部客户端通过受控下载端点或短期 transfer capability
  访问。
- 删除 Value 前必须检查 Run、Artifact、Publication 和审计保留要求。
- 引用已被合法清理且无法恢复时，Snapshot 明确返回
  独立的 `valueStatus="retired"` 引用状态，不能伪装为空值或构造一个不可下载的
  `ValueEnvelope`。

### 6.1 公共诊断 DTO

```ts
type ComponentHealth = {
    status: "ready" | "degraded" | "unavailable" | "disabled" | "unknown";
    checkedAt: string;
    code?: string | null;
    message?: string | null;
};

type FailureSnapshot = {
    kind: "aborted" | "retryable" | "terminal" | "unknown";
    code: string | null;
    message: string;
    retryable: boolean;
    occurredAt?: string | null;
    detailsRef?: ValueEnvelope | null;
};
```

它们属于 common contracts，不属于 Product、Worker Admin 或 Gateway 任一消费面。
`FailureSnapshot.message` 只提供脱敏摘要，完整诊断通过受控引用读取。

## 7. 幂等与乐观并发

### 7.1 创建和执行 Command

- 触发 Run、Probe、Research、Publication、Delivery、backup、export、delete 和
  drain 必须使用 `Idempotency-Key`。
- 服务保存规范化 payload fingerprint。
- 同 key + 同 fingerprint 返回原结果或 `already_applied`。
- 同 key + 不同 fingerprint 返回 `409 idempotency_conflict`。
- 服务端自动生成 key 只适用于无法安全重试的交互式客户端；官方 Web/CLI 应生成并
  在重试中复用 key。

高风险 Command 使用独立资源和审计，不使用普通 PATCH：

- `restore`、`delete`、`repair`、checkpoint reset、cleanup、drain 和 delivery
  至少保存 preview/target、幂等范围、actor、确认输入、Run 和最终结果；
- 预览本身不能产生删除、发送或 checkpoint 推进；
- 已过期的 preview/confirmation 不能静默用于后来改变过的 target revision；
- 外部副作用结果未知时返回持久 Intent/Receipt/Run，不以 HTTP 500 丢失状态。

### 7.2 修改现有资源

Story、Topic、Workspace、Board、Annotation、SavedView 等用户真相使用
`If-Match` 或命令中的 `baseRevisionId`：

- 匹配：创建新 Revision 或应用关系变更；
- 不匹配：返回 `409 revision_conflict` 和当前 revision 引用；
- Agent 不因冲突静默覆盖人类版本；
- merge/split、删除和外部发送不自动重放到新 revision。

## 8. 分页、过滤与排序

```ts
type CursorPageQuery = {
    cursor?: string | null;
    limit?: number;
};

type TimeRangeQuery = {
    from?: string | null;
    to?: string | null;
};
```

- cursor 不透明，并绑定 query fingerprint、排序和 snapshot boundary。
- 改变过滤器后不能复用旧 cursor；返回 `400 cursor_invalid`。
- 默认稳定排序必须包含唯一 ID 作为最后 tie-breaker。
- 时间范围使用 `from` inclusive、`to` exclusive。
- 多值过滤器重复 query parameter，例如 `status=queued&status=running`。
- 全文搜索、Feed 和相关推荐可以返回 `explanation`，但不能泄露内部 Secret、
  私有 payload 或未经授权的其它对象。
- offset 分页只用于小型管理列表；信息库、Event、Run 和 Job 默认 cursor。

## 9. Service Error

```ts
type ServiceError = {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    commandId?: string | null;
    target?: ResourceRef | null;
    details?: Record<string, unknown>;
};
```

公共错误码：

| HTTP | code | 语义 |
| --- | --- | --- |
| 400 | `validation_failed` | payload、query 或 header 校验失败 |
| 400 | `cursor_invalid` | cursor 与当前查询不兼容、损坏或过期 |
| 401 | `authentication_required` | 未来远端模式缺少有效身份 |
| 403 | `capability_denied` | 身份存在但当前操作不允许 |
| 404 | `not_found` | 资源不存在或不可见 |
| 409 | `idempotency_conflict` | 同幂等键用于不同 Command |
| 409 | `revision_conflict` | base revision/ETag 已过期 |
| 409 | `state_conflict` | 当前生命周期不允许该操作 |
| 410 | `retired` | 历史引用存在，但值或能力已按策略退役 |
| 413 | `payload_too_large` | 应改用 ValueRef/transfer |
| 422 | `capability_mismatch` | Definition、Action 或 Worker 能力不匹配 |
| 426 | `protocol_mismatch` | 协议版本无法协商 |
| 429 | `rate_limited` | 超过资源/服务限流 |
| 503 | `service_unavailable` | 依赖暂时不可用 |
| 503 | `not_ready` | 宿主存活但尚不能接受该类请求 |
| 504 | `upstream_timeout` | 上游超时；是否可重试由 details 表达 |
| 202/409 | `uncertain` | 外部结果无法确认；返回持久 Intent/Receipt/Run，不以裸 500 丢失状态 |

Worker Gateway 另有 `session_fenced`、`lease_lost` 等协议错误，见
[`0005-worker-gateway-api.md`](0005-worker-gateway-api.md)。

错误 `details` 必须按 code 使用版本化、可校验形状；不能把任意 Error stack、
SQL 错误或上游完整正文直接返回。

## 10. Event 与 SSE

```ts
type EventEnvelope<T> = {
    id: string;
    sequence?: string;
    type: string;
    version: number;
    occurredAt: string;
    aggregate?: ResourceRef | null;
    correlation?: CorrelationRef | null;
    actor?: ActorRef | null;
    payload: T;
};
```

Product SSE：

```text
GET /api/v1/events
Last-Event-ID: <id>
```

可选过滤：

- `type`：重复参数；
- `aggregateType`、`aggregateId`；
- `runId`；
- `after`：只作为不支持自定义 Header 的客户端 fallback。

恢复规则：

1. 服务从已持久 Event/Outbox cursor 之后回放。
2. 超过 replay window 时发送 `snapshot_required.v1`，包含最新 cursor 和建议重新
   查询的资源类型。
3. 客户端先获取授权 Snapshot，再以新 cursor 重连。
4. keepalive 不推动业务 cursor。
5. Event 可能重复，客户端按 Event ID 幂等应用。
6. Event 只表示发生的事实或投影变化，不携带 Secret、完整私信/邮件正文或大值。

SSE 不是 Worker Gateway 的任务 Transport，也不作为 Publication/Delivery 的成功
凭据。

## 11. 文件读取与下载

- Asset、Artifact 和 export 使用受控服务地址。
- 支持 `ETag`、`If-None-Match`、`Content-Length` 和适用时的 byte range。
- 未保存媒体返回元数据 Snapshot，不返回永远 pending 的空流。
- 文件名通过 `Content-Disposition` 提供并清理控制字符。
- 下载端点重新检查当前引用和未来授权，不让客户端凭 storage key 旁路。
- HTML/Agent 可视化默认按不可信内容下载或在隔离 origin/sandbox 中展示。

## 12. 健康与 readiness

`/healthz` 只回答进程是否能响应，不访问数据库。

`/readyz` 回答当前宿主是否能承担自己的职责：

- Product API：数据库 schema 兼容且 Query/Command 依赖可用；不要求 Worker 在线，
  因为已保存内容仍应可读。
- Direct Worker：Backend、manifest 和至少一个启用 lane 可用，且未 draining。
- Gateway Worker：Gateway Session 可用、manifest 已接受，且未 draining。
- Worker Gateway：TaskStore/Application Port 可用；不要求当前存在远程 Worker。

`/api/v1/health` 是产品诊断 Snapshot，可以显示 Worker unavailable，但不因此把
API process readiness 伪装成失败。

## 13. 兼容规则

- URL major version 表示 Transport 破坏性变化。
- DTO 增加可选字段、增加未知可降级枚举值通常兼容。
- 删除字段、改变字段含义、改变默认排序或幂等范围属于破坏性变化。
- Workflow/Action/Plugin 使用独立 definition version + manifest hash。
- Event `type + version` 独立升级。
- Worker 握手协商协议版本、最大 inline bytes、ValueRef 类型和 receipt 能力。
- 服务保留历史对象引用，但不承诺无限期保留所有大值 payload。

## 14. 安全与隐私边界

当前单用户阶段不建设权限 UI，但合同仍遵守：

- 未认证 Product API 只允许绑定 loopback 或部署在明确受信的本地网络；不得把
  “单用户”当作公网认证；
- CORS 只是浏览器来源限制，不是身份认证或授权；
- Secret 只通过 `SecretRef` 或短期 `SecretLeaseRef` 表达；
- 普通 Query 不返回 Cookie、Token、密码、session token 或 lease token；
- 私信、群聊和邮件详情默认视为敏感内容；
- 日志、Event、错误和 metrics 不包含完整敏感正文；
- Worker Admin 默认内部绑定；
- 远程 Worker 只获得 Action 所需的最小输入和短期能力；
- 插件/Agent/Worker 不直接获得 Prisma Client、Data Root 或任意文件路径。
