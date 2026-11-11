# HTTP Client

## 状态

当前实现规格；后续代码变化应同步更新本文。本文记录
`@cosmos/transport-http` 的当前无状态 HTTP/SSE 适配行为；服务端路由和 DTO 的 canonical
定义分别见 [Product API HTTP](0002-product-api-http.md) 与 [Public Contracts](../contracts/0001-public-contracts.md)。

## 最后更新

2026-11-11（Task 42：新增系统配置读写方法及新旧响应边界）。

## 组件定位

`HttpCosmosClient` 是面向 Web/Node 客户端的轻量 Product API transport。它负责拼接
`baseUrl` 与 `/api/v1` 路径、序列化 POST/PATCH body、设置 JSON/Idempotency-Key header、
读取 JSON、用 contracts schema 验证成功响应，并把非 2xx 映射为 `CosmosTransportError`。

它不缓存数据、不重试、不实现认证、不访问 Prisma/Blob、不执行 Connector/Workflow；SSE
只包装可注入的 EventSource-like 对象并校验收到的 event envelope。

### 在系统中的位置与作用
它是 Web/Node 调用 Product API 的无状态 transport，位于页面或其他客户端与 Product API HTTP 之间。

### 解决的问题
它集中处理路径拼接、请求 body/header、成功响应 schema 校验、非 2xx 错误和 SSE envelope，避免每个客户端重复实现边界转换。

### 使用方式
创建 `HttpCosmosClient` 时提供 base URL、fetcher 和 EventSource factory，再调用已封装的 API 方法；响应先经 contracts schema，失败通过 `CosmosTransportError` 处理。

### 典型情景
Web 页面读取 Feed/Source/Health、触发 Source 操作或订阅 SSE，或 Node 客户端需要同样的 DTO 校验时，选择本 transport。

## Task 42 系统配置方法

以下是 `HttpCosmosClient` 经 `SystemConfigClient` 继承提供的当前方法；DTO 与服务端语义分别以 [contracts](../contracts/0001-public-contracts.md#task-42-当前合同补充)和 [Product API](0002-product-api-http.md#task-42-当前合同补充)为准。

| 方法 | HTTP 与校验 |
| --- | --- |
| `getSystemConfig()` | GET `/api/v1/system/config`；完整响应经 `systemConfigDtoSchema` strict 解析。 |
| `updateSystemConfig(input)` | 先用 `updateSystemConfigCommandSchema` strict 解析 `{defaultModelId}`，PUT 同路径；响应只 strict 解析 `{defaultModelId:string|null}`。 |
| `getDefaultModel()` | 旧 GET `/api/v1/config/default-model`；strict `{modelId:string|null}`。 |
| `setDefaultModel(modelId)` | 旧 PUT 同旧路径，发送 `{modelId}`；解析旧形状确认响应。 |

这些方法不使用 Provider 配置操作的 Idempotency-Key，不发起模型调用，不维护持久状态、不缓存或重试。非 2xx 延续 `CosmosTransportError`；成功响应格式错误仍抛 schema error。重建须覆盖新旧路径/字段名、null 清除、PUT 额外字段在发送前拒绝与响应 shape 不混用；源码及测试见[系统配置客户端](../../../packages/transport-http/src/client-system-config.ts)与[测试](../../../packages/transport-http/src/client-system-config.test.ts)。

## 概念与定义

- **HttpCosmosClient**：构造时固定 base URL、fetcher 和 EventSource factory 的客户端实例。
- **CosmosTransportError**：非 2xx HTTP 响应错误，保留 `status` 和可解析 response
  `body`，message 固定为 `Cosmos service request failed with HTTP <status>.`。
- **CosmosEventSource**：最小 EventSource-like port：`onmessage`、`onerror` 和 `close()`；
  可用浏览器原生 EventSource 或测试替身。
- **成功校验**：每个方法使用对应 contracts Zod schema 的 `.parse`；HTTP 200 即使 JSON
  shape 错误也会抛 schema error，而不是返回未验证对象。

## 外部行为

构造函数把 `baseUrl` 的末尾 `/` 全部移除；每次 request 直接使用
`${baseUrl}${path}`。fetcher 默认是 `globalThis.fetch` 并 bind 到 globalThis，也可通过
options 注入。EventSource 默认从 globalThis 读取；运行时没有 EventSource 时，打开 SSE
会抛 `Error("EventSource is not available in this runtime.")`。

### JSON 方法

| Client method | HTTP method/path | 输入与 header | 成功 schema/输出 |
| --- | --- | --- | --- |
| `health()` | `GET /api/v1/health` | 无 | `HealthResponse` |
| `listConnectors()` | `GET /api/v1/connectors` | 无 | `ConnectorDescriptor[]` |
| `listSources()` | `GET /api/v1/sources` | 无 | `SourceSnapshot[]` |
| `getSource(sourceId)` | `GET /api/v1/sources/:encodedId` | path 用 `encodeURIComponent` | `SourceSnapshot` |
| `createSource(input)` | `POST /api/v1/sources` | 先 parse `CreateSourceCommand`；JSON body/header | `SourceSnapshot` |
| `updateSource(sourceId,input)` | `PATCH /api/v1/sources/:encodedId` | `UpdateSourceCommand` JSON body；path encoded | `SourceSnapshot` |
| `activateSource(sourceId,input,idempotencyKey)` | `POST /api/v1/sources/:encodedId/activation-commands` | 必需非空且 ≤300 字符的 `idempotency-key` header；JSON body 为 `SourceActivationCommand` | `SourceSnapshot` |
| `testSource(sourceId,idempotencyKey?)` | `POST /api/v1/sources/:encodedId/test` | 可选 `idempotency-key`（≤300 字符） | `JobSnapshot` |
| `triggerSource(sourceId,{idempotencyKey?})` | `POST /api/v1/sources/:encodedId/runs` | 可选 `idempotency-key`（≤300 字符）；未启用 Source 返回 409 | `RunSnapshot` |
| `getJob(jobId)` | `GET /api/v1/jobs/:encodedId` | path encoded | `JobSnapshot` |
| `feed({cursor?,limit?})` | `GET /api/v1/feed` | URLSearchParams；只在 truthy 时发送 cursor/limit | `FeedPage` |
| `search(query)` | `GET /api/v1/search` | text/sourceId/date/cursor/limit 按 truthy 发送 | `SearchPage` |
| `story(storyId)` | `GET /api/v1/stories/:encodedId` | path encoded | `StoryDetail` |
| `entries(query?)` | `GET /api/v1/entries` | sourceId/cursor/limit 按 truthy 发送 | `EntryPage` |
| `entry(entryId)` | `GET /api/v1/entries/:encodedId` | path encoded | `EntryDetail` |
| `revision(revisionId)` | `GET /api/v1/revisions/:encodedId` | path encoded | `RevisionDetail` |

Phase 2 编排方法（同一 transport 形态：先 parse 命令 schema，再 POST/PATCH，成功响应经对应 schema）：

| Client method | HTTP method/path | 成功 schema/输出 |
| --- | --- | --- |
| `moveEntryToStory(storyId,input)` / `updateStoryRevision(storyId,input)` | `POST /api/v1/stories/:encodedId/entry-moves`、`/revisions` | `StoryDetail` |
| `mergeStories(input)` | `POST /api/v1/stories/merges` | `StoryDetail` |
| `splitStory(storyId,input)` | `POST /api/v1/stories/:encodedId/splits` | `StoryDetail`（历史壳） |
| `migrateStoryUserState(sourceStoryId,input)` | `POST /api/v1/stories/:encodedId/user-state-migrations` | `StoryUserStateMigrationResult`（每类 `moved`/`deduped`） |
| `listStorySubtypes({kind?})` | `GET /api/v1/story-subtypes` | `StorySubtypePage` 的 `items`（`readonly StorySubtype[]`）；kind 按 truthy 发送 |
| `listTopics(query?)` / `topic(topicId)` | `GET /api/v1/topics`、`/topics/:encodedId` | `TopicPage`、`TopicDetail` |
| `createTopic(input)` / `updateTopic(topicId,input)` / `mergeTopics(input)` | `POST /api/v1/topics`、`/topics/:encodedId/revisions`、`/topics/merges` | `TopicDetail` |
| `addTopicMember` / `updateTopicMemberRole` / `removeTopicMember` / `restoreTopicMember` | `POST /api/v1/topics/:encodedId/members`、`/member-role-updates`、`/member-removals`、`/member-restorations` | `TopicDetail` |
| `listEntities(query?)` / `entity(entityId)` | `GET /api/v1/entities`、`/entities/:encodedId` | `EntityPage`、`EntityDetail` |
| `createEntity(input)` / `updateEntity(entityId,input)` | `POST /api/v1/entities`、`/entities/:encodedId/revisions` | `EntityDetail` |
| `addEntityAlias` / `removeEntityAlias` | `POST /api/v1/entities/:encodedId/aliases`、`/alias-removals` | `EntityDetail` |
| `linkStoryEntity` / `unlinkStoryEntity` | `POST /api/v1/story-entity-links`、`/story-entity-links/removals` | `EntityDetail` |
| `linkEntryStory` / `unlinkEntryStory` | `POST /api/v1/entry-story-links`、`/entry-story-links/removals` | `StoryDetail` |
| `createEntityRelation` / `removeEntityRelation` | `POST /api/v1/entity-relations`、`/entity-relations/removals` | `EntityDetail` |
| `listLabels` / `label(labelId)` | `GET /api/v1/labels`、`/labels/:encodedId` | `LabelList`、`LabelDetail` |
| `createLabel` / `updateLabel` / `deleteLabel` | `POST /api/v1/labels`、`PATCH /labels/:encodedId`、`/labels/:encodedId/removals` | `LabelItem`、`UserOrganizationAck` |
| `attachLabel` / `detachLabel` | `POST /api/v1/label-assignments`、`/label-assignments/removals` | `UserOrganizationAck` |
| `listCollections(query?)` / `collection(collectionId)` | `GET /api/v1/collections`、`/collections/:encodedId` | `CollectionList`、`CollectionDetail` |
| `createCollection` / `updateCollection` / `deleteCollection` | `POST /api/v1/collections`、`PATCH /collections/:encodedId`、`POST /collections/:encodedId/removals` | `CollectionSummary`、`UserOrganizationAck` |
| `addCollectionItem` / `removeCollectionItem` | `POST /api/v1/collections/:encodedId/items`、`/items/removals` | `UserOrganizationAck` |
| `listFavorites` / `setFavorite` / `unsetFavorite` | `GET /api/v1/favorites`、`POST /favorites`、`/favorites/removals` | `FavoriteList`、`UserOrganizationAck` |
| `listAnnotations(query)` / `createAnnotation` / `updateAnnotation` / `deleteAnnotation` | `GET /api/v1/annotations`、`POST /annotations`、`PATCH /annotations/:encodedId`、`POST /annotations/:encodedId/removals` | `AnnotationList`、`Annotation`、`UserOrganizationAck` |
| `listSavedViews` / `createSavedView` / `updateSavedView` / `deleteSavedView` | `GET /api/v1/saved-views`、`POST /saved-views`、`PATCH /saved-views/:encodedId`、`POST /saved-views/:encodedId/removals` | `SavedViewList`、`SavedView`、`UserOrganizationAck` |
| `listBoards` / `getBoard` / `ensureDefaultBoard` | `GET /api/v1/boards`、`/boards/:encodedId`、`POST /boards/ensure-default` | `BoardList`、`BoardDetail` |
| `createBoard` / `updateBoard` / `deleteBoard` | `POST /api/v1/boards`、`PATCH /boards/:encodedId`、`POST /boards/:encodedId/removals` | `BoardDetail`、`BoardCommandAck` |
| `createBoardSection` / `updateBoardSection` / `deleteBoardSection` | `POST /api/v1/board-sections`、`PATCH /board-sections/:encodedId`、`POST /board-sections/:encodedId/removals` | `BoardDetail`、`BoardCommandAck` |
| `createBoardBlock` / `updateBoardBlockConfig` / `moveBoardBlock` / `setBoardBlockVisibility` / `duplicateBoardBlock` / `deleteBoardBlock` | `POST /api/v1/board-blocks`、`PATCH /board-blocks/:encodedId`、`POST /board-blocks/:encodedId/moves`、`/visibility`、`/duplications`、`/removals` | `BoardDetail`、`BoardCommandAck` |
| `listSpotlightPlacements(query?)` / `pinSpotlight` / `unpinSpotlight` | `GET /api/v1/spotlight-placements`、`POST /spotlight-placements`、`POST /spotlight-placements/:encodedId/removals` | `SpotlightPlacementList`、`SpotlightPlacement`、`BoardCommandAck` |
| `listSourceDefinitions` / `createSourceConfigProbe` / `getSourceConfigProbe` | `GET /api/v1/source-definitions`、`POST /api/v1/source-config-probes`、`GET /api/v1/source-config-probes/:encodedId` | `SourceDefinitionPage`、`SourceConfigProbeJobSnapshot` |
| `storageStats()` / `listBackups()` / `createBackup()` / `restoreBackup(backupId)` | `GET /api/v1/storage-stats`、`GET /api/v1/backups`、`POST /api/v1/backups`、`POST /api/v1/backups/:encodedId/restores` | `StorageStats`、`BackupSnapshot[]`、`BackupSnapshot`、`UserOrganizationAck` |
| `exportUserData()` | `GET /api/v1/exports/user-data` | `UserDataExport`（响应是附件下载，客户端仍按 JSON 校验） |
| `listConnectorStateNamespaces()` / `exportConnectorState(scope?)` / `importConnectorState(input)` | `GET /api/v1/connector-state/namespaces`、`GET /api/v1/exports/connector-state`（范围参数由 `scope` 生成，缺省不带查询参数）、`POST /api/v1/imports/connector-state` | `ConnectorStateNamespaceSummary[]`、`ConnectorStateExport`、`ConnectorStateImportResult` |

Provider/model 配置方法（`ProviderModelsClient` 与它的子类 `ConfiguredModelsClient`；读方法只带 schema，写方法先 `parse` 命令、再带 `idempotency-key` header）：

| Client method | HTTP method/path | 输入与 header | 成功 schema/输出 |
| --- | --- | --- | --- |
| `listModelProviders({limit?,cursor?})` | `GET /api/v1/model-providers` | 只在非 `undefined` 时发 limit/cursor | `ModelProviderPage` |
| `getModelProvider(providerId)` | `GET /api/v1/model-providers/:encodedId` | path encoded | `ModelProviderSnapshot` |
| `createModelProvider(input,idempotencyKey)` | `POST /api/v1/model-providers` | `CreateModelProviderCommand`；必需 `idempotency-key` | 201 `ModelProviderSnapshot`，或 202 `ModelProviderOperationSnapshot`（凭证清理残留时按 status 分流） |
| `updateModelProvider(providerId,input,idempotencyKey)` | `PATCH /api/v1/model-providers/:encodedId` | `UpdateModelProviderCommand`；必需 `idempotency-key` | 同上 |
| `deleteModelProvider(providerId,expectedVersion,idempotencyKey)` | `DELETE /api/v1/model-providers/:encodedId` | body `{expectedVersion}`；必需 `idempotency-key` | 204，无响应体（同步删除；凭证清理失败不影响结果） |
| `getModelConfigurationOperation(operationId)` | `GET /api/v1/model-configuration-operations/:encodedId` | path encoded | `ModelProviderOperationSnapshot` |
| `getModelConfigurationOperationByKey(idempotencyKey)` | `GET /api/v1/model-configuration-operations/by-key/:encodedKey` | path encoded；用于首次响应丢失后按 key 查状态 | `ModelProviderOperationSnapshot` |
| `retryModelConfigurationOperation(operationId)` | `POST /api/v1/model-configuration-operations/:encodedId/retries` | body `{}` | `ModelProviderOperationSnapshot` |
| `discoverProviderModels(providerId,expectedProviderVersion)` | `POST /api/v1/model-providers/:encodedId/discoveries` | body `{expectedProviderVersion}` | `ProviderModelDiscoverySnapshot`（失败也返回已完成快照，调用方只看 `status`/`errorCode`，不重试） |
| `listConfiguredModels(providerId)` | `GET /api/v1/model-providers/:encodedId/models` | path encoded | `ConfiguredModelPage` |
| `getConfiguredModel(providerId,modelId)` | `GET /api/v1/model-providers/:encodedId/models/:encodedModelId` | 两段 path encoded | `ConfiguredModelSnapshot` |
| `createConfiguredModel(providerId,input,idempotencyKey)` | `POST /api/v1/model-providers/:encodedId/models` | `CreateConfiguredModelCommand`；必需 `idempotency-key` | `ConfiguredModelSnapshot` |
| `updateConfiguredModel(providerId,modelId,input,idempotencyKey)` | `PATCH /api/v1/model-providers/:encodedId/models/:encodedModelId` | `UpdateConfiguredModelCommand`；必需 `idempotency-key` | `ConfiguredModelSnapshot` |
| `deleteConfiguredModel(providerId,modelId,expectedVersion,idempotencyKey)` | `DELETE /api/v1/model-providers/:encodedId/models/:encodedModelId` | body `{expectedVersion}`；必需 `idempotency-key` | 204，无响应体；被 Connection 引用时 409 `in_use` |

模型配置的写入同时受本机信任门限制（精确 Origin + 受信 Host + `application/json` + 32 KiB），拒绝时返回 403 `forbidden_origin`；这不是客户端能重试解决的错误，客户端只把它翻成固定的失败提示。

`feed`、`search`、`entries` 即使没有 query 也会生成带 `?` 的 path（例如
`/api/v1/feed?`）；这是当前实现的 URL 结果，不影响服务器解析。Fetch options 默认
method GET；有 body 时加入 `content-type: application/json` 并以 `JSON.stringify` 发送。
请求不会自动加入 `X-Request-Id` 或其它认证 header。

### SSE 方法

`openEventStream({ afterEventId?, onEvent, onError? })` 构造
`GET /api/v1/events`，可选 `after=<afterEventId>`，通过 factory 创建 source。收到
`message.data` 时先 `JSON.parse` 再用 `sseEventSchema.parse`，成功调用 `onEvent`；JSON
解析或 schema 失败时调用 `onError`（如果提供）且吞掉该消息错误。底层 `source.onerror`
同样调用 `onError`。方法返回无参数 close callback，调用 `source.close()`。

客户端不解析 SSE comments、retry、`last-event-id` 或 `snapshot_required` 的特殊语义；
该事件作为普通 `SseEvent` 交给上层。服务端 keepalive 也通过普通 envelope 传递。

## 输入

`HttpCosmosClientOptions`：

- `baseUrl: string` 必填，可带尾部 `/`；不会自动补协议、host 或 `/api`。
- `fetch?: typeof globalThis.fetch` 可注入测试/运行时 fetch；默认 global fetch。
- `eventSourceFactory?: (url: string) => CosmosEventSource` 可注入 EventSource-like
  实现；默认构造全局 EventSource。

Resource id 作为 string 传入并 path encode；query value 通过 `URLSearchParams` 编码。
`createSource` 在发请求前以 `createSourceCommandSchema.parse` 校验；其它 update/query
输入是 TypeScript 类型，服务端仍是最终校验边界。可选 idempotency key 只有 truthy
字符串才设置 header；空字符串不发送。

## 输出

Fetch response 先执行 `response.json().catch(() => null)`。非 2xx（`response.ok === false`）
不解析 schema，而是抛出 `CosmosTransportError(response.status, body)`；body 可以是 JSON
值或 null。2xx 则对 body 执行对应 schema parse 并返回 parse 后值。

`CosmosTransportError` 是 `Error` 子类，`name` 为 `CosmosTransportError`，只保留
`status:number`、`body:unknown` 和固定 message。网络错误、JSON schema parse error、
EventSource factory error 不会被包成 `CosmosTransportError`，会以原始错误传播；调用方需自行分类。

## 状态与持久化

客户端无持久状态、缓存、重试队列或本地账本。每个 JSON request 的 response body 仅在
该 await 调用内存在；SSE source、callbacks 和 close 生命周期是内存状态。刷新页面或
进程重启会丢失 SSE 连接，客户端需由上层重新建立并决定 cursor。

## 状态转换

### JSON request

`created → requesting → response-read → parsed-success`；成功 parse 后 Promise resolve。
`requesting → transport-failed`（fetch rejection）、`response-read → http-failed`（非
2xx，抛 CosmosTransportError）或 `response-read → schema-failed`（2xx shape 不符合 schema）。
这些失败都不自动 retry。

### SSE

`created → opened`（factory 返回 source）→ `message-validated`（onEvent）或
`message-invalid`（onError）/`source-error`（onError）；调用 close callback 进入 `closed`。
`onError` 未提供时，消息解析失败与底层 error 都被静默忽略；客户端不会自动重连。

## 副作用

- 每次 JSON 方法调用一次注入 fetcher；POST/PATCH 可能改变服务端 Source、Job 或 Run。
- 每次 openEventStream 创建一个 EventSource-like source；close callback 关闭它。
- 客户端本身不写数据库、Blob、日志或浏览器 storage。

## 错误与降级

- 非 2xx：始终 `CosmosTransportError`，保留 status/body；不按 400/404/500 再分类，调用
  方依据 status/body 处理。
- 2xx invalid JSON：body 变为 null 后 schema parse 抛错；不会返回 null 作为成功。
- 2xx invalid DTO：Zod parse error 原样传播。
- fetch network/rejection、EventSource unavailable、factory throw：原始 Error 传播。
- SSE malformed event 或 source error：调用可选 `onError`，不会关闭 source 或抛出到
  `openEventStream` caller；上层必须决定是否重连/刷新。
- 不自动重试、退避、断路器、request id propagation、认证、timeout 或 AbortSignal。

## 依赖

- `@cosmos/contracts` 的 connector/health/job/run/source/feed/search/story/entry/revision/provider/model/operation/SSE schema 与 TypeScript types；
- Web/Node global `fetch` 和可选 global `EventSource`；
- 使用方自行管理 React state、retry 和 authentication；当前 Web UI 见 [Web Client](0005-web-client.md)。

## 配置

客户端只有 `baseUrl` 配置。当前 Web 通过 `process.env.NEXT_PUBLIC_COSMOS_API_URL ?? ""`
传入；空值意味着使用相对 `/api/v1/...` URL，配合 Next rewrite。Next rewrite 的服务端
目标读取 `COSMOS_API_URL`，默认 `http://localhost:14310`，只重写 `/api/:path*` 到 API
的同名 `/api/:path*`，不会改变客户端的 `/api/v1` prefix。

没有当前配置项用于 timeout、retry、TLS、auth、custom headers 或 SSE replay limit；这些
属于客户端上层或 API runtime。

## 重建验收

1. 用 `baseUrl="http://localhost:14310/"` 和注入 fetch 调用 `health()`，观察请求精确为
   `http://localhost:14310/api/v1/health`，并观察返回 DTO 通过 health schema。
2. 调用 `getSource("a/b")`、`triggerSource("source-1",{idempotencyKey:"run-1"})`，
   观察 path segment 被 `encodeURIComponent`，POST header 为 `idempotency-key`，body 只有
   需要时才发送 JSON。
3. 让 fetch 返回 status 404 与 JSON body，观察抛出 `CosmosTransportError`，其 status=404、
   body 保持该值、message 含 HTTP 404；让 response.json 失败，观察 body=null。
4. 让 fetch 返回 200 但 health shape 缺字段，观察 Zod parse error 而不是成功返回；让
   fetch rejection，观察原 rejection 未包装。
5. 注入 EventSource factory，调用 `openEventStream({afterEventId:"12"})`，观察 URL 为
   `/api/v1/events?after=12`；发送合法 `feed.updated.v1` envelope，观察 onEvent 收到；
   发送 malformed JSON/schema，观察 onError 被调用而不抛出；调用 close callback，观察
   source.close 被调用。
6. 在没有全局 EventSource 且未注入 factory 的运行时打开 SSE，观察明确的 unavailable
   Error；确认客户端不暗中使用 Node HTTP stream 替代 EventSource。
7. 注入 fetch，调用 `createModelProvider` 与 `deleteModelProvider`，观察 path 段被
   `encodeURIComponent`、`idempotency-key` header 存在、DELETE body 只有
   `{expectedVersion}`；让 POST 返回 202 与 operation snapshot，观察按 status 返回
   operation 而不是 provider snapshot；让 DELETE 返回 409 `in_use`，观察抛出
   `CosmosTransportError` 且 body 保留 `code`。

## 实现与测试锚点

- Client、CosmosTransportError、EventSource port 和所有方法：[`packages/transport-http/src/index.ts`](../../../packages/transport-http/src/index.ts)。
- URL、health schema、connector catalog、SSE parse/close 测试：[`packages/transport-http/src/client-platform.test.ts`](../../../packages/transport-http/src/client-platform.test.ts)。
- DTO/Zod owner：[`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts)、[`packages/contracts/src/base.ts`](../../../packages/contracts/src/base.ts)、[`packages/contracts/src/provider-model.ts`](../../../packages/contracts/src/provider-model.ts)。
- Provider/model 客户端：[`packages/transport-http/src/client-provider-models.ts`](../../../packages/transport-http/src/client-provider-models.ts)（`ProviderModelsClient`，含 `deleteModelProvider` 与 `discoverProviderModels`）与它的子类 [`packages/transport-http/src/client-configured-models.ts`](../../../packages/transport-http/src/client-configured-models.ts)（`ConfiguredModelsClient`）；对应测试同目录 `client-provider-models.test.ts`、`client-configured-models.test.ts`。
- 当前调用方与 error display：[`apps/web/src/app/(shell)/page.tsx`](../../../apps/web/src/app/%28shell%29/page.tsx)（2026-09-24 Task 35 切片 1 由 `apps/web/src/app/page.tsx` 移入路由组 `(shell)`）。
- 同源 rewrite：[`apps/web/next.config.ts`](../../../apps/web/next.config.ts)。

## 非目标/边界

- 不实现当前 Controller 尚未提供的 catalog detail、capabilities、workflow-run detail、
  attempts、asset download 或 healthz/readyz client method；调用方如需这些路径要自行
  使用合适的 transport 合同。
- 不把客户端 schema 校验当作服务端授权或安全边界；不暴露 lease/Secret/storage path。
- 不支持自动重连、SSE Last-Event-ID 持久化、AbortSignal、timeout、retry/backoff、分页
  预取或缓存。
- 浏览器/E2E 与真实网络失败场景未在当前 transport test 中覆盖；现有测试使用注入 fetch/
  EventSource 替身。
