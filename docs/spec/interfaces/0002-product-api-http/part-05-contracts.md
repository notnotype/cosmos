---
parent: docs/spec/interfaces/0002-product-api-http.md
range: 输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点
sealed_at: 2026-10-26
tags: [spec, api-http, contracts]
tokens_est: 4114
---

## 输入

所有 body/query 以 `unknown`/Nest query 输入后在 Controller 边界用 contracts Zod schema
解析。path id 当前不额外做格式 schema。JSON body 只在 POST/PATCH 资源需要时发送；
`Idempotency-Key` header 是大小写不敏感的 HTTP header，Controller 读取 Nest 的
`idempotency-key` 值并 trim。SSE 同时支持标准 `Last-Event-ID` 和 query `after`。

## 输出

JSON DTO 的 canonical shape、枚举和序列化规则只见 [Public Contracts](../../contracts/0001-public-contracts.md)。错误由全局 filter 规范化为 `ServiceError`，通常包括
`code`、`message`、`requestId`、可选 details 和 retryable；细节见
[API Observability](../0003-api-observability.md)。本文件拥有前文明确的 Catalog/Capabilities/
Attempt HTTP 局部投影，因为 contracts 当前没有它们的 schema。

成功响应不返回 Controller 内部的 workflow input snapshot、Kernel journal、lease
identity、lease token、Connector executable、Secret 或文件系统绝对路径。**Feed、Search、
Entry 和 Revision/Story 内部 revision 的 Asset 投影不含 `storageKey`**：六条公开读路由在
返回前经 `apps/api/src/app.controller/public-projection.ts` 的 `toPublicAsset` 逐个挑字段，
公开读 DTO 由 contracts 的 `publicAssetSnapshotSchema` 描述（从 `assetSnapshotSchema` 省略
`storageKey`）。仓储内部的 `AssetSnapshot`（`PrismaCosmosRepository.toAssetSnapshot`）仍保留
该字段，只服务 Blob 读写与内部用例；回归锚点是
`apps/api/src/app.controller.public-projection.test.ts`。
`GET /assets/:assetId` 不返回 JSON Asset DTO，也不回显 storage key：Controller 调用
`readAsset`，成功时返回 `StreamableFile` 的原始 bytes 和保存的 `mimeType`（缺失 mime 时
repository 使用 `application/octet-stream`）；Asset 没有 storageKey 或 Blob 读取失败/不可读
时返回 404 或由全局 filter 映射为 500，具体取决于失败发生在 repository 查找还是 Blob 读取。
## 状态与持久化

Controller 本身无持久状态；SSE 的 cursor、poll timer 和 keepalive 时间戳仅存在于一次
连接的内存 Observable。权威状态在 repository、Workflow Host store、manifest catalog
（进程内只读）和 Domain Event 存储中：

- Source CRUD 写 SourceInstance；
- probe/run 命令创建 Job 或 Workflow envelope，并由 Worker/Host 推进；
- Feed/Search/Story/Entry/Revision/Asset 只读领域投影；
- SSE 从 Domain Event sequence replay，不在内存建立第二账本。

进程重启会丢失 SSE 连接，客户端可用 Last-Event-ID/after 重新 replay；replay 窗口不足
时必须按 `snapshot_required` 重读。

## 状态转换

- Source：`POST` 创建 enabled/disabled 快照 → `PATCH` 只改变 enabled；创建失败不写入。
- Probe：请求 → `source-probe` queued Job → Worker 后续推进；API 只返回 queued snapshot，
  不在本进程执行 probe。
- Workflow Run：`POST /sources/:id/runs` → queued envelope/legacy Run；Host 后续可
  变为 running（waiting 也公开 running）→ succeeded/failed/cancelled。重复 idempotency
  key 复用同一 workflow envelope；冲突由 Application 抛错。
- SSE：`connected(cursor)` → replay/keepalive 或 `snapshot_required` → 等待下一轮；
  unsubscribe → closed。发送 headers 后的流异常不回写第二个 JSON response。
- Query：读取已持久化 projection；不存在资源是 404，不会隐式创建。

## 副作用

- Source POST/PATCH 写 Source；probe/run POST 写 Job/Workflow envelope，并记录 `job.queued`
  或 `workflow.run.queued` 结构化日志。
- Feed/content 查询访问 Prisma/SQLite/Blob；Asset GET 读取受控 Blob store 并将 bytes
  流出。
- SSE 查询 Domain Event 并保留一个 500ms timer；连接关闭清理 timer。
- HTTP 请求、错误和 SSE 生命周期由 request logging interceptor/filter 记录；日志
  脱敏规则不由 Controller 重复实现。

## 错误与降级
### 400

- Create/Update Source body、Source kind/config、Search/Entries query 违反 Zod 合同；
- Workflow/Action manifest `version` 不是正的安全整数；
- Source catalog 不可用或配置不合法；
- repository/Application 把 Source enqueue 的普通错误映射为 `BadRequestException` 时，
  返回 `validation_failed`、`retryable: false`。

`feed.limit` 是兼容性 clamp，不因超出 1–100 抛 400；Search/Entries 的 schema limit
越界则是 400。未知资源不会以 400 伪装。

### 404

Source、Source definition、Workflow/Action definition、Run、Job、Attempt、Story、Entry、
Revision、Asset 查询找不到目标时返回 `NotFoundException`，错误码 `not_found`、
`retryable: false`。`workflow-runs/:id` 与 `runs/:id` 共享该语义。

### 409

同一 `Idempotency-Key` 绑定不同 Source、trigger 或 Workflow 输入快照时，Application 抛出
`WorkflowHostConflictError`，Controller 返回 HTTP `409`，body 为 `{ code: "conflict", retryable: false, ... }`。
同一 key 与同一 identity 的重放仍返回原 Workflow Run，不创建第二个 durable envelope。

模型配置另有三类 409，都由业务状态而非载荷冲突产生，重试都不会成功：

- `already_exists`：同一 Provider 下已有同一个 `modelId`（`@@unique([providerId, modelId])`）。
- `in_use`：要删的模型或 Provider 仍被 Connection 引用（外键 RESTRICT / 事务内引用计数）。
- `version_conflict` / `operation_in_progress`：`expectedVersion` 已过期，或该 Provider 正有写操作持锁。

模型配置写入还有两道 Code 之外的拒绝：`403 forbidden_origin`（Origin 或 Host 不在启动时写定的信任集合里）与 `413 payload_too_large`（超过 32 KiB）。两者都不重试，界面按固定原因提示；把 `forbidden_origin` 报成网络故障会让人一直重试同一个坏配置。

### 其它错误

Repository、catalog、SSE polling 或 Blob 读取异常上抛到全局 filter，通常转 500/
`service_unavailable`；已发送 SSE headers 后只能结束流并记录失败。API 没有为客户端
提供 Worker lease 竞争、claim 或 completion 的重试端点。

## 依赖

- Nest decorators/HTTP adapter 与 RxJS Observable；
- `@cosmos/contracts` 的 Source、Health、Run、Job、Feed/Search/Entry/Story/Revision、SSE schema；
- `@cosmos/application` 的 repository、CatalogPort、IngestWorkflowControlService 和 WorkflowHostStore；
- `@cosmos/storage-prisma` 的查询/写入实现；
- `SourceProbeService` 的 manifest-only kind/config 校验；
- [Product API Runtime](../0001-product-api-runtime.md) 的 global prefix、启动依赖；
- [API Observability](../0003-api-observability.md) 的 request id、错误和日志投影。

## 配置

- 全局 prefix 由 runtime 固定为 `api/v1`；HTTP host/port/CORS 见 [Product API Runtime](../0001-product-api-runtime.md)。
- `COSMOS_SSE_REPLAY_LIMIT` 在 SSE handler 中默认 100，解析后 clamp 到 1–1000；`/capabilities` 直接返回 `Number.parseInt` 结果（默认字符串为 `"100"`），不共享该 clamp。
- Catalog 来源为 builtin static catalog；当前没有 HTTP 上传/安装 manifest 的端点，且 `/connectors` 兼容路径仍存在。

## 重建验收

1. `GET /api/v1/connectors` 返回四个 builtin descriptor，并确认没有执行 Connector 或
   返回 executable path；`GET /api/v1/source-definitions` 返回 `items`、`nextCursor=null`
   和 ISO `snapshotAt`，且没有 page `version`。
2. 对 `GET /api/v1/workflow-definitions` 与 `/action-definitions`，确认 page item 字段
   是 CatalogPort manifest metadata，schema ref 不含 executable Zod 对象；对 `/capabilities`
   确认 `features`、`limits.maxPageSize=100`、`maxInlineValueBytes=65536`、
   `maxUploadBytes=null`、`serverTime` 和当前 env 数值均出现。
3. 对 `POST /api/v1/sources` 提交合法 fixture-rss command，观察 HTTP 201 和白名单
   SourceSnapshot；提交未知 kind 或非法 config，观察 HTTP 400 `validation_failed`。
4. 对不存在 Source 请求 GET/PATCH/test/run，观察 HTTP 404 `not_found`；对已存在 Source
   的 test 请求，观察 HTTP 202 queued `source-probe` Job 且 API 未调用 Connector。
5. 使用同一个 `Idempotency-Key` 两次触发同一 Source run，观察同一 Workflow identity
   被复用；把该 key 用于另一 Source，观察冲突错误而不是第二个不同快照。
6. 让 Workflow envelope 状态为 waiting/completed，分别请求 `/runs/:id`，观察公开状态为
   `running`/`succeeded`；响应中不存在 lease token、Secret、Kernel payload 或绝对路径。
7. 用 lifecycle Domain Events 请求 `/jobs/:id/attempts`，确认只产生按 number 升序的
   `AttemptPage`，字段没有 leaseToken；请求 malformed/unknown `/attempts/:id` 观察 404，
   并记录当前 `Number.parseInt` 对带数字前缀脏后缀的未严格拒绝缺口。
8. 请求 `/api/v1/feed?limit=0`、超大 limit、非法 limit，分别观察 clamp 到 1、100、20；
   请求非法 Search/Entries query，观察 HTTP 400。检查 Feed/Entry/Revision 资产投影不含
   `storageKey`（整份响应 JSON 都搜不到该字段名），并确认 Asset download 返回 bytes/mime 而非 JSON。
9. 用 `after=0` 建立 SSE，观察持久事件按 id 升序到达；设置 replay limit 为 1 并使窗口
   超过上限，观察一条 `snapshot_required` 且 `latestEventId` 等于存储最新序号。
10. 在无新事件连接保持至少 10 秒，观察 `keepalive.v1`；取消连接后观察不再新增 poll；
    查询不存在 Story/Entry/Revision/Asset，观察 HTTP 404。
11. 对一条 Story 提交带 `timeRange`（开始为准确时刻、结束留空）与两条有序 `keyFacts` 的
    revision 命令，观察返回的 `StoryDetail` 带这两项且 `revisionId` 前进；原样重复提交一次，
    观察 `revisionId` 不变（no-op）；不带这两项提交，观察两项清空且 `revisionId` 再次前进；
    用 `end` 早于 `start` 或 21 条事实提交，观察 HTTP 400 且 Story 保持上一次保存的状态。
12. 先建一个 Label 并挂到一个 Story 上，再请求 `GET /api/v1/exports/user-data`：观察响应带
    `Content-Disposition: attachment` 与 `cosmos-user-data-<exportedAt>.json` 文件名，body 通过
    `userDataExportSchema`，`data.labels` 含该 Label 且 `data.targets` 含被引用的 Story（标题来自
    当前 revision）；整份响应 JSON 搜不到 `secretRef`、`storageKey`、连接名或来源名。

## 实现与测试锚点

- 全部路由、投影、SSE poll/keepalive/replay：[`apps/api/src/app.controller.ts`](../../../../apps/api/src/app.controller.ts) 门面与 [`apps/api/src/app.controller/`](../../../../apps/api/src/app.controller) 下的资源分册（继承链）。
- Source catalog 校验：[`apps/api/src/source-probe.service.ts`](../../../../apps/api/src/source-probe.service.ts)。
- Nest prefix/CORS/filter 安装：[`apps/api/src/main.ts`](../../../../apps/api/src/main.ts)。
- Product DTO schemas：[`packages/contracts/src/index.ts`](../../../../packages/contracts/src/index.ts) 与 [`packages/contracts/src/base.ts`](../../../../packages/contracts/src/base.ts)。
- Catalog manifest port/builtin entries：[`packages/application/src/catalog.ts`](../../../../packages/application/src/catalog.ts)。
- Workflow enqueue and `cosmos.ingest@1` snapshot：[`packages/application/src/workflow-control.ts`](../../../../packages/application/src/workflow-control.ts)。
- Domain query/projection/event sequence：[`packages/storage-prisma/src/index.ts`](../../../../packages/storage-prisma/src/index.ts)。
- SSE snapshot fallback、probe queue、Run mapping、Attempt projection：[`apps/api/src/app.controller.runs.test.ts`](../../../../apps/api/src/app.controller.runs.test.ts)、[`apps/api/src/app.controller.sources.test.ts`](../../../../apps/api/src/app.controller.sources.test.ts)。
- 模型配置路由在四个独立控制器里，不经 `app.controller.ts` 门面：[`apps/api/src/model-provider.controller.ts`](../../../../apps/api/src/model-provider.controller.ts)（读）、[`apps/api/src/model-provider-write.controller.ts`](../../../../apps/api/src/model-provider-write.controller.ts)（写与删除）、[`apps/api/src/configured-model.controller.ts`](../../../../apps/api/src/configured-model.controller.ts)（模型 CRUD）、[`apps/api/src/provider-model-discovery.controller.ts`](../../../../apps/api/src/provider-model-discovery.controller.ts)（同步发现）。
- 模型配置的本机信任门与原始 body 读取：[`apps/api/src/model-configuration-trust.ts`](../../../../apps/api/src/model-configuration-trust.ts)、[`apps/api/src/model-configuration-write-policy.ts`](../../../../apps/api/src/model-configuration-write-policy.ts)、[`apps/api/src/model-configuration-body-parser.ts`](../../../../apps/api/src/model-configuration-body-parser.ts)、[`apps/api/src/model-configuration-body-reader.ts`](../../../../apps/api/src/model-configuration-body-reader.ts)；装配在 [`apps/api/src/model-configuration.module.ts`](../../../../apps/api/src/model-configuration.module.ts)。
- 对应测试：`model-provider-write.controller.test.ts`（含 DELETE 204、`in_use` 409、越权 Origin 403、缺幂等键与多余字段 400）、`configured-model.controller.test.ts`、`provider-model-discovery.controller.test.ts`、`model-configuration-body-parser.test.ts`、`model-configuration-trust.test.ts`、`model-provider-storage-integration.test.ts`（隔离 Prisma + FileSecretStore 的真实 HTTP 验证）。
