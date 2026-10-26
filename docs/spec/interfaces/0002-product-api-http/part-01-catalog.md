---
parent: docs/spec/interfaces/0002-product-api-http.md
range: 概念与定义、外部行为、System 与 manifest catalog
sealed_at: 2026-10-26
tags: [spec, api-http, catalog]
tokens_est: 1915
---

## 概念与定义

- **Product Run**：面向产品客户端的 Run 投影。Legacy `RunSnapshot` 和 Workflow
  envelope 都可以成为来源；Workflow envelope 的内部 `waiting` 公开为 `running`，
  `completed` 公开为 `succeeded`。
- **CatalogPage<T>**：Controller 为三个 manifest 列表和 Attempt 列表生成的 HTTP 局部页，
  唯一字段为 `items: T[]`、`nextCursor: null`、`snapshotAt: string`。`snapshotAt` 是该次
  响应生成时的 ISO 时间；当前没有 page `version` 字段，manifest 自身的 `version` 仍是
  manifest item 字段。
- **CapabilitiesResponse**：Controller 内联返回的 HTTP 局部对象，字段为
  `productProtocolVersion: "1"`、`workerProtocolVersions: ["1"]`、`features`、`limits`
  和 `serverTime`。它不是 contracts schema；字段详见“System 与 manifest catalog”。
- **AttemptSnapshot**：从持久 Domain Event 按一个 Workflow Activity Job 聚合出的公开尝试
  投影，不是 contracts DTO。它只含下文列出的 worker/时间/状态/error 字段，不含 lease token。
- **AttemptPage**：`CatalogPage<AttemptSnapshot>` 的 HTTP 形状；当前按 attempt number 升序、
  固定 `nextCursor: null` 返回。
- **公开投影**：由 Controller 或 Repository 当前返回的 DTO。Source 会白名单选择配置展示
  字段；Run、Job、Attempt 和内容查询不把 Worker lease token、Secret、Blob Root、绝对文件
  路径或任意内部执行 payload 作为 HTTP 控制输入。Asset 的 `storageKey` 也不再外发：六条公开
  读路由在返回前经 `toPublicAsset` 逐个挑字段，公开读 DTO 用 `publicAssetSnapshotSchema`
  描述；仓储内部的 `AssetSnapshot` 仍带该字段，见 Asset 小节。
- **SSE cursor**：客户端通过 `Last-Event-ID` header 或 `after` query 指定的非负事件序号；
  事件 id 是持久 Domain Event 的 sequence 字符串。

详细 Source、Run、Feed、Entry、Revision、Asset、SSE 字段必须回看公共合同；本文件只在
没有 contracts owner 的地方定义 HTTP 局部投影。

## 外部行为
成功的 JSON Controller 响应由 Nest 默认序列化；正常 GET/PATCH 为 HTTP 200。创建
Source 和手动 Run 是 HTTP 201；Source probe 是显式 HTTP 202。SSE 是长连接 HTTP 200，
响应带 `Cache-Control: no-cache` 和 `Connection: keep-alive`。


### System 与 manifest catalog

| Method/path（`/api/v1` 下） | 输入 | 成功输出与副作用 |
| --- | --- | --- |
| `GET /health` | 无 | `HealthResponse`；调用 repository health，读取数据库探针/Worker heartbeat。 |
| `GET /connectors` | 无 | `ConnectorDescriptor[]`；只读 builtin catalog，不执行 Connector。该兼容路径当前仍保留。 |
| `GET /source-definitions` | 无 | `CatalogPage<SourceDefinitionManifest>`；页字段为 `items`、`nextCursor: null`、`snapshotAt`。 |
| `GET /source-definitions/:id` | path `id` | 单个 Source definition manifest；不存在返回 404。 |
| `GET /workflow-definitions` | 无 | `CatalogPage<WorkflowDefinitionManifest>`；只读 Workflow manifest。 |
| `GET /workflow-definitions/:id/versions/:version` | path `id`、`version` | 指定版本 Workflow manifest；不存在返回 404，版本非法 400。 |
| `GET /action-definitions` | 无 | `CatalogPage<ActionDefinitionManifest>`；只读 Action manifest。 |
| `GET /action-definitions/:id/versions/:version` | path `id`、`version` | 指定版本 Action manifest；不存在返回 404，版本非法 400。 |
| `GET /capabilities` | 无 | `CapabilitiesResponse`；读取 `COSMOS_SSE_REPLAY_LIMIT` 的数值并返回当前功能/限制/serverTime，无业务写副作用。 |

三个 manifest page 的 item 字段来自 Application `CatalogPort`，不是 contracts DTO：

- `SourceDefinitionManifest`：`id`、正整数 `version`、`ref`、`provider`、`displayName`、可空
  `description`、`manifestHash: { algorithm, value }`、`status`、`operationIds[]`、
  `capabilities[]`、`configurationSchema: { id, version, hash: { algorithm, value }, schema? }`
  和 `operations[]`（每项：`operationId`、`inputSchema`/`outputSchema`、可空
  `configurationSchema`——这个 operation 的用户可填配置，`null` 表示沿用定义级那份，
  `externalKey`、`discoveryContext`、`media`、可空 `stateStoreNamespace`）与 `auth`
  （认证方式 + `secretRefRequired` + `probeSupported`）。Bilibili 是当前唯一声明两个
  operation 的定义（`fetch` 沿用定义级 schema，`search` 自带 `query`/`limit`）。
- `WorkflowDefinitionManifest`：`id`、`version`、`ref`、`kind`、`provider`、`manifestHash`、
  `status`、`requiredActionRefs[]`、`requiredBackendCapabilities`（字符串到 boolean 的对象）、
  `inputSchema` 和 `outputSchema`（均为上述 JsonSchemaRef）。
- `ActionDefinitionManifest`：`id`、`version`、`ref`、`provider`、`manifestHash`、
  `effectMode`、`executionPlacement`、`requiredCapabilities[]`、`status`、`inputSchema` 和
  `outputSchema`。这些 schema ref 是 manifest metadata；Controller 不加载 executable Zod
  schema、Connector 或 Action。

`CapabilitiesResponse` 的真实内联字段为：

```text
{
  productProtocolVersion: "1",
  workerProtocolVersions: ["1"],
  features: {
    sourceDefinitions: { status: "enabled", version: "1" },
    workflowDefinitions: { status: "enabled", version: "1" },
    actionDefinitions: { status: "enabled", version: "1" },
    workflowIngest: { status: "enabled", version: "1" }
  },
  limits: {
    maxPageSize: 100,
    maxInlineValueBytes: 65536,
    maxUploadBytes: null,
    sseReplayLimit: Number(COSMOS_SSE_REPLAY_LIMIT ?? "100")
  },
  serverTime: <ISO string>
}
```

The controller does not apply the 1–1000 clamp used by the SSE polling path when it constructs
`limits.sseReplayLimit`; a nonnumeric environment value therefore is not repaired by this
endpoint (and may serialize as `null` through JSON). Catalog pages currently always use
`nextCursor: null` and a newly generated `snapshotAt`; the page has no `version` field.
Builtin catalog contains `rss`, `fixture-rss`, `bilibili`, `aihot`, Workflow `cosmos.ingest@1`,
and Actions `source.fetch@1`, `library.ingest@1`, `source.checkpoint@1`. These are readable
manifest entries, not an executable command allow-list.

`/connectors` remains a compatibility path while the manifest-only clean cutover is incomplete;
the current code has not removed it or replaced it with a permanent redirect.
