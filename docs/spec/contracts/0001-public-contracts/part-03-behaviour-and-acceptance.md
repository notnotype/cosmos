---
parent: docs/spec/contracts/0001-public-contracts.md
range: 外部行为、输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点
sealed_at: 2026-10-26
tags: [spec, contracts, behaviour]
tokens_est: 4266
---

## 外部行为

边界调用者向 schema 传入 `unknown`，或先以 `Record<string, unknown>` 接收 HTTP/query，再调用对应的 `.parse`。成功时得到 schema 推导的 DTO；默认 `z.object` 会剔除未声明字段，显式 `passthrough` 的 `sourceConfigSchema` 会保留未知配置，内置 Source config 的 strict schema 会拒绝未知字段。带默认值的字段在 parse 后才出现默认值。

Action 的 executable 定义可以携带运行时 Zod schema，但公共 Descriptor/Manifest 只投影元数据。Workflow JSON 的 normalized asset 只能携带 BlobRef 等 JSON 值，不能携带 `Uint8Array`。SSE/事件 DTO 保留未知 payload，由使用方决定具体事件语义；当前 Product API 将投影 JSON 字符串化后发送。

## 输入

输入入口包括 Source 创建/更新、Source probe、ingest 命令、查询参数、Job/Run/Entry/Story/事件投影，以及 Action/Workflow 的 schema 输入。所有字段、空值和默认值以“概念与定义”中的对应 schema 为准：

1. 外部未知值必须在边界解析；不能把未经 parse 的对象当作公共 DTO。
2. `sourceConfigSchema` 是唯一会保留未声明配置字段的基础 Source config；内置 config 必须使用其各自 strict schema。
3. ActionRef、RetryPolicy、BlobRef、normalized asset/item 和 Source snapshot 的相互约束必须在 parse 时检查。
4. `unknown` payload/result 不做结构假设；需要业务含义的消费者另行校验。

## 输出

- 输出是 Zod parse 后的结构化 DTO 或 manifest-safe 投影。状态数组和 enum 只返回列出的值；分页 DTO 的 nextCursor 可空。Asset 输出走 `publicAssetSnapshotSchema`（不含 `storageKey`）：仓储内部的 `AssetSnapshot` 带该字段，Product API 在返回前剥离，因此客户端拿到的公开读 DTO 与 `AssetSnapshot` 不是同一个形状。Action Descriptor/Manifest 可被 `JSON.stringify` 后再次解析为同值，且不包含 executable Zod schema。BlobRef/ValueRef 只代表受控内容或 Workflow JSON 的引用，不代表内联 bytes。

并非所有 DTO 字段都由本包深度验证：`JobSnapshot.result`、`EventSnapshot.payload` 和 `SseEvent.payload` 明确为 `unknown`。因此“schema parse 成功”不等于这些字段的业务内容或 JSON 编码已经通过校验。

## 状态与持久化

本组件无持久状态。schema、enum、parseActionRef 和类型定义在进程内由源码重新生成；重启不会恢复 Source、Run、Job、Entry、Blob、Workflow 或 SSE 游标。Source/Run/Job/Entry/Observation/Revision/Story 的 durable truth 由相应 application/storage 组件持有，本文件只定义公共投影形状。

## 状态转换

本组件没有业务状态机。可观察的转换只有：

- `unknown` 输入经 schema parse 成功后成为合同 DTO；失败则抛出 ZodError，不产生部分 DTO 或持久写入。
- 带默认值的输入字段在 parse 中从缺失变为默认值，例如 CreateSource `enabled=true`、ingest `triggerKind=manual`、Bilibili `schemaVersion=1`/`limit=20`、AI HOT `schemaVersion=1` 和查询 limit。
- Source execution snapshot 与 Source snapshot 是两个不同投影；后者增加可变诊断字段，前者不因当前诊断变化。
- ActionDefinition 经 application 的 descriptor 投影后丢弃 executable schema；若 ref/version 不一致，descriptor parse 不成功。

## 副作用

`@cosmos/contracts` 的 schema parse、类型投影和 `parseActionRef` 不访问数据库、Blob Root、网络、文件、日志或领域事件，也不触发 Action、Connector、重试、SSE 推送或业务写入。应用层将 bytes 写 Blob、将 ValueRef 解引用、将 DTO 映射为数据库记录的副作用不属于本组件。

## 错误与降级

- schema 约束不满足时抛出 ZodError；本包不把失败转换为 HTTP 状态码、不自动重试、不写错误记录。
- ActionRef 不合法时 `parseActionRef` 的 schema parse 失败；ActionErrorCode 的分类只描述公共错误代码集合，具体异常由 application ActionRegistry 产生。
- RetryPolicy 仅声明 allow-list、最大次数和退避值，不自行执行重试。
- `unknown` result/payload 不会被本包降级为 `{}` 或 `null`。
- 严格 Source config 的未知字段、非 JSON-safe sourceLocator/asset、非 saved 状态的 BlobRef 和不满足身份证据的 normalized item 都 fail closed。
- Story 表示扩展：`storyTimeRangeSchema` 在两端都有 `exact` 时按时刻比较（不按字符串），`end` 早于 `start` 时 parse 失败；写入命令的 `keyFacts` 超过 20 条、单条 `text` 超过 500 字符或去空白后为空同样失败（读取侧数组不设条数上限，旧 payload 始终可解析）。`entryId` 只限制 trim 后长度不超过 300（空串合法，归一化时变 null），**不校验**目标条目是否存在、也不要求它属于本 Story——悬空出处由读取侧降级（见 [Web Client](../../interfaces/0005-web-client.md)）。这些失败都是 ZodError，HTTP 状态码映射由 API 拥有。

## 依赖

- 运行时依赖 `zod`。
- `packages/contracts/src/base.ts`、`action.ts`、`index.ts` 是实现锚点；`index.ts` re-export base/action。
- domain 规范引用[规范化内容](../../domain/0001-normalized-content.md)。ContentKind、Publisher、Temporal、Metrics 的领域算法由 domain 拥有；本包只拥有其 wire schema。
- `ValueRef` 的运行时类型和 Store 接口来自 `@notnotype/nb-workflow`；本包记录其跨边界 JSON shape，[Workflow Value Store](../../storage/0006-workflow-value-store.md)拥有 canonical 编码和四重读取校验。[FileBlobStore](../../storage/0005-file-blob-store.md)拥有 BlobRefLike 的 bytes/hash/key/containment 校验。
- application ActionRegistry、Workflow ingest、API Controller 和 storage repository 是消费者，不是本组件的持久化实现。

## 配置

本组件没有环境变量、文件根目录、端口或运行时可变配置。schema 中的范围和默认值是源码常量：调度间隔 1,000 至 31 天毫秒、Bilibili limit 1 至 100 默认 20、查询 limit 1 至 100 默认 20 或 50、Source name 1 至 200、幂等键 1 至 300。Source 的未知 config 仅因 `sourceConfigSchema.passthrough()` 保留；这不改变内置 strict config 的边界。

## 重建验收

1. **协议与基础枚举**：给定 `protocolVersion`，观察其值为 `v1`；给定不在列举集合内的 ContentKind、PublisherKind、Run/Step/Job/Asset status 或 JobKind，观察 schema parse 失败，且没有文件、数据库或网络副作用。
2. **Source config 边界**：给定带额外键的基础 `sourceConfigSchema`，观察额外键保留；给定同样额外键给内置 strict config，观察 parse 失败；给定 Bilibili `feed` 且无 profile，观察 parse 成功（profile 已归连接，登录态由连接器在执行时判定）；给定缺省 Bilibili limit/schemaVersion 和 AI HOT schemaVersion，观察 parse 后分别为 20、1、1；给定 `("source.bilibili@1", "search")` 且缺 `query`，观察失败，给定 `("source.bilibili@1", "fetch")`，观察回退到定义级那份。
3. **输入默认值**：给定缺少 CreateSource `enabled` 或 IngestCommand `triggerKind` 的有效对象，观察 parse 后分别为 `true` 和 `manual`；给定超长名称、空 sourceId 或超过 300 个字符的幂等键，观察失败，且不创建 Source/Run。
4. **Temporal 证据**：给定 exact、fallback 都为 null 的 TemporalValue，观察 parse 失败；给定合法 exact 或 fallback，观察 parse 成功；不允许以空对象替代时间证据。
5. **ActionRef**：逐一给定 `source.fetch`、`source.fetch@0`、`source.fetch@01`、`Source.fetch@1`、带空格 ref 和超过安全整数的版本，观察 parse 失败；给定 `connector.imap.poll@7`，观察 `parseActionRef` 返回 `{baseRef:"connector.imap.poll",version:7}`。
6. **Descriptor 安全边界**：给定包含 Zod input/output schema 的 ActionDefinition，构造并 parse Descriptor，观察 JSON 序列化结果不含 `inputSchema`/`outputSchema`；给定 ref 版本与 Descriptor version 不同，观察失败。
7. **JSON 与 BlobRef**：给定包含 `Uint8Array`、函数、NaN 或额外 key 的 Blob/asset/sourceLocator，观察相应 JSON-safe/strict schema 失败；给定非 saved asset 携带非空 BlobRef，观察失败；不允许把 raw bytes 写入 Workflow JSON DTO。
8. **Normalized item 边界**：给定无 externalId、无 webUrl 且 sourceLocator 为空的 item，观察失败；给定其中任一身份依据，观察 parse 成功；不允许 contracts 包写入领域或 Blob。
9. **事件 unknown 边界**：给定任意值作为 Event/SSE payload，观察 schema 只按 `unknown` 字段接受而不推断业务结构；调用方若不能 JSON.stringify，失败应发生在调用方，不由本包伪造 payload。
10. **无持久状态**：重启或重新导入 contracts 模块后，观察无 Source/Run/Job/SSE 游标等状态被恢复；唯一可重复结果来自源码中的 schema、枚举和默认值。
11. **用户组织枚举与回执**：给定 `targetType: "workspace"` 的 Label 附加命令或 `targetType: "topic"` 的收藏命令，观察 parse 失败；给定缺 `title` 的 `LabelDetail` 分组项或 `ok: false` 的回执，观察失败；不允许把未知 targetType 当作已支持能力。
12. **看板区块类型与 config 白名单**：给定 `type: "gadget"` 的创建命令，观察 parse 失败；给定 `feed`/`collection` config 含白名单外键或 `collectionId: ""`，观察对应 schema parse 失败；给定 `feed`/`collection` 空 config，观察 parse 成功（未绑定态）；给定未知 type，观察 `blockConfigSchemaFor` 返回 null；给定 `BoardBlock.type` 为未知字符串，观察读取侧 DTO 仍 parse 成功（降级由客户端处理）。
13. **Spotlight 目标枚举与读取降级**：给定 `targetType: "workspace"` 的 pin 命令，观察 parse 失败；给定 `targetType` 为未知字符串的 placement DTO，观察读取侧仍 parse 成功。
14. **Story 表示扩展**：给定缺 `start` 的时间范围、`end` 早于 `start`、命令里带 21 条事实或 501 字的单条事实，观察对应 schema parse 失败；给定 `end` 为 null、或两端都有 `exact` 且顺序正确的范围，观察 parse 成功；给定省略两项与带两项的 `UpdateStoryRevisionCommand`、以及不带扩展字段的 `StoryDetail` payload，观察都 parse 成功（省略由 API/storage 解释为清空，读取侧兼容旧 payload）。`entryId` 指向的条目是否存在不由本包判断。

## 实现与测试锚点

- `packages/contracts/src/base.ts`：`protocolVersion`、内容/Publisher/Temporal/metrics schema、Source config/command、`sourceExecutionSnapshotSchema` 与 `sourceSnapshotSchema`。
- `packages/contracts/src/index.ts`：ConnectorDescriptor、Run/Step/Job/Asset/Health/Error DTO、Feed/Search、Entry/Observation/Story/Revision、Topic/Entity、用户组织（Label/Collection/Favorite）DTO 与命令、看板（Board/Section/Block）DTO 与命令、Ingest 与 Event/SSE schema。
- `packages/contracts/src/story.ts`：Story 表示扩展 schema（`storyTimeRangeSchema`/`storyKeyFactSchema`，两个上限常量与 domain 各钉一份）、`StoryDetail`、Story 编排命令（含 `UpdateStoryRevisionCommand` 与 split 后继）及 Entry↔Story 关系 DTO。
- `packages/contracts/src/action.ts`：`actionRefSchema`、`parseActionRef`、ActionKind/placement/error、`retryPolicySchema`、`actionDefinitionSchema`、`actionDescriptorSchema`/`actionManifestSchema`、JsonValue/BlobRef/normalized asset/item 与三个 ingest Action DTO。
- `packages/contracts/src/index.test.ts`：Bilibili mode/profile 和 strict unknown、AI HOT 默认值和 strict unknown、可扩展 CreateSource、probe/job snapshot、Publisher 空白归一化、TemporalValue 证据约束、topic/entity/用户组织三类 DTO 与命令的枚举校验与读取侧降级。
- `packages/contracts/src/action.test.ts`：ActionRef bare/zero/leading-zero/uppercase/space/unsafe 拒绝、版本解析、固定枚举、Descriptor 去 executable schema、版本一致性、Retry/Execution 约束、错误代码与 `workflow-activity`、Source snapshot 分离、JSON-safe asset/manifest、Uint8Array 与额外 BlobRef 拒绝。
- 消费边界：`packages/application/src/action.ts` 对 unknown input/output parse；`packages/application/src/workflow-ingest.ts` 使用 normalized item 合同；`apps/api/src/app.controller.ts` 对 HTTP body/query parse 并 JSON.stringify SSE。
- `packages/contracts/src/provider-model.ts`：Provider/model 配置的全部 schema——`createModelProviderCommandSchema`、`updateModelProviderCommandSchema`、`modelProviderSnapshotSchema`、`modelProviderOperationSnapshotSchema`、`modelProviderPageSchema`、`createConfiguredModelCommandSchema`、`updateConfiguredModelCommandSchema`、`configuredModelSnapshotSchema`、`configuredModelPageSchema`、`createProviderModelDiscoveryCommandSchema`、`providerModelDiscoveryCandidateSchema`、`providerModelDiscoveryErrorCodeSchema`、`providerModelDiscoverySnapshotSchema`。同目录 `provider-model.test.ts` 覆盖 URL 语法拒绝、`modelId` 不得是 URL、预算跨字段 refine、`superRefine` 的三条发现不变式。服务端错误码枚举在 `packages/contracts/src/platform.ts` 的 `serviceErrorCodeSchema`。
