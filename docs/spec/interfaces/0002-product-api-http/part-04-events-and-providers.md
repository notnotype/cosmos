---
parent: docs/spec/interfaces/0002-product-api-http.md
range: SSE events、Model provider 配置
sealed_at: 2026-10-26
tags: [spec, api-http, events]
tokens_est: 1386
---

### SSE events

| Method/path | 输入 | 成功输出与生命周期 |
| --- | --- | --- |
| `GET /events` | `Last-Event-ID` header 或 `after` query，二者同时存在时 header 优先 | HTTP 200 SSE；按事件序号增量 replay，并每 500ms 轮询。响应 headers 为 no-cache/keep-alive。断开时清理 timer。 |

cursor 会以非负整数解析；缺失、负数或无法解析时从 0 开始。`COSMOS_SSE_REPLAY_LIMIT`
默认 100，解析后限制在 1–1000。每次向 repository 请求 `replayLimit + 1` 条以判定
replay window：

1. 如果超过上限，Controller 查询最新 sequence，发一条 envelope `type: "snapshot_required"`、
   `version: "v1"`、`payload: { reason: "replay_limit", latestEventId }`，并把 cursor
   前移到 latestEventId；客户端必须重新读取 Feed/Source 等快照。
2. 如果窗口可覆盖，按 sequence 升序逐条发送 repository event。每条 SSE frame 的 Nest
   message `type` 是 `message`，`id` 为 sequence，`data` 是 JSON event envelope。
3. 如果本轮无事件且距上一次 keepalive 至少 10 秒，发送 `keepalive.v1` envelope，id
   保持当前 cursor，payload 为空。
4. repository 抛错会让 Observable error，由全局错误/日志管线记录；Controller 不
   把错误伪装成业务事件。客户端关闭订阅后不会再 poll。

SSE 数据可以包含当前持久 Domain Event 的业务 payload；HTTP Controller 不接受客户端
写入 payload。公开事件仍不得把 lease token、Secret、绝对路径放入 payload；事件内容
由持久化边界负责。

### Model provider 配置

这组端点由独立控制器提供（`model-provider.controller.ts`、`model-provider-write.controller.ts`、`configured-model.controller.ts`、`provider-model-discovery.controller.ts`），装配在 `ModelConfigurationModule` 里。完整合同、字段与错误语义见 [Provider/model 配置](../../../api/0009-provider-model-configuration.md)；本节只记录 HTTP 层的行为。

| Method/path | 输入 | 成功输出 |
| --- | --- | --- |
| `GET /model-providers` | `limit`/`cursor` query | `ModelProviderPage` |
| `GET /model-providers/:providerId` | path | `ModelProviderSnapshot`；不存在 404 |
| `POST /model-providers` | `CreateModelProviderCommand` + 必需 `Idempotency-Key` | 201 `ModelProviderSnapshot`，凭证清理未完成时 202 `ModelProviderOperationSnapshot` |
| `PATCH /model-providers/:providerId` | `UpdateModelProviderCommand` + 必需 `Idempotency-Key` | 200 或 202，同上 |
| `DELETE /model-providers/:providerId` | body `{expectedVersion}` + 必需 `Idempotency-Key` | 204 空响应体；同步删除，同一事务内检查引用，被引用 409 `in_use` |
| `GET /model-configuration-operations/:operationId` | path | `ModelProviderOperationSnapshot` |
| `GET /model-configuration-operations/by-key/:idempotencyKey` | path | `ModelProviderOperationSnapshot`；键没登记过 404 |
| `POST /model-configuration-operations/:operationId/retries` | body `{}` | 202 `ModelProviderOperationSnapshot`；锁被占用 409 `operation_in_progress` |
| `POST /model-providers/:providerId/discoveries` | body `{expectedProviderVersion}` | 200 `ProviderModelDiscoverySnapshot`；发现失败也是 200，错误在 `status`/`errorCode` 里 |
| `GET /model-providers/:providerId/models` | `limit`/`cursor` query | `ConfiguredModelPage` |
| `GET /model-providers/:providerId/models/:modelId` | path | `ConfiguredModelSnapshot`；不存在 404 |
| `POST /model-providers/:providerId/models` | `CreateConfiguredModelCommand` + 必需 `Idempotency-Key` | 201 `ConfiguredModelSnapshot`；同 Provider 下重复 `modelId` 409 `already_exists` |
| `PATCH /model-providers/:providerId/models/:modelId` | `UpdateConfiguredModelCommand` + 必需 `Idempotency-Key` | 200 `ConfiguredModelSnapshot` |
| `DELETE /model-providers/:providerId/models/:modelId` | body `{expectedVersion}` + 必需 `Idempotency-Key` | 204 空响应体；被 Connection 引用 409 `in_use` |

这组端点在读普通 body 之前先过本机信任门：精确 Origin、受信 Host、`application/json`、32 KiB 上限，不满足即 403 `forbidden_origin` 或 400 `invalid_input`。写请求的原始 body 由 `configureModelConfigurationBodyParsers` 单独登记（`model-configuration-body-parser.ts`），漏登记的路径会被通用 JSON 解析器提前消费，控制器只能报 `invalid_input`——新增写路由必须同时登记。

`Idempotency-Key` 必须是恰好一个、匹配 `^[A-Za-z0-9._:-]{1,200}$` 的 header；同一键重放返回既有操作状态，不会再次执行。
