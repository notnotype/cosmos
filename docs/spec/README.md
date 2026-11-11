# Cosmos 当前实现规格入口

> `docs/spec/` 默认随仓库当前实现保持最新。这里描述已经存在、可从外部观察或为重建所必需的行为，并给出可判定的重建验收；它不是未来设计、需求清单或实施日志，也不以固定提交、文档状态或实现状态作为元数据。

## Task 42 当前规格导航与历史勘误

SystemConfig 与默认模型设置的当前合同由 [公共 DTO 补充](contracts/0001-public-contracts.md#task-42-当前合同补充)、[Product API 补充](interfaces/0002-product-api-http.md#task-42-当前合同补充)、[HTTP Client 方法](interfaces/0004-http-client.md#task-42-系统配置方法)和 [Web 行为](interfaces/0005-web-client.md#task-42-当前合同补充)分别拥有。相关封口分册中模型 Connection、旧默认模型路径或旧 Story 形状与补充冲突的内容已被替代，重建时先读入口补充，不修改历史册。Connection 仅管理外部账号；模型与默认选择分别由模型目录及系统设置承担。

Story 调用费用的已接受目标与 conformance 留在 [API Draft](../api/0008-story-content-representation.md#task-42-费用合同已冻结目标实施与验收进行中)，本轮已经从源码核对的持久候选费用、generation 成功与身份约束、Web 候选消费见上述 canonical 补充；未宣称自动重试最终成功或真实 Provider 结算准确。当前完成状态及各层运行证据由 [Task 42](../../.agents/tasks/42-default-model-ui-api/README.md)与 [项目状态](../../PROJECT-STATUS.md)记录，源码存在不等于验收全部通过。

## 1. 职责、事实来源与阅读方法

### 1.1 spec 负责什么

`docs/spec/` 只回答一个问题：陌生 Agent 能否依据当前仓库实现，重建一个组件对外可观察的职责、输入、输出、状态、持久化、副作用、错误/降级、依赖、配置和验收。每个组件正文只写一个组件；跨组件语义只在唯一 canonical owner 定义，其他正文链接引用。

规格正文不得把以下内容推断成当前能力：

- 需求、PRD、架构图或 ADR 中尚未进入当前实现的目标设计；
- `Draft`、`Planned`、`Reserved` API、Gateway、远程 Worker、Redis、PostgreSQL/S3 或多主机部署；
- 已接受但尚未实现的 Agent 后续能力：真实 Harness、产品 Artifact、Workspace、Knowledge 和 Research（`agent.invoke@1`／`@2` 与 fake adapter 已落地，属于当前实现，以 [`ADR-0030`](../adr/0030-agent-invocation-v1.md)、[`Task 38`](../../.agents/tasks/38-agent-invocation/README.md) 与 [`Task 39`](../../.agents/tasks/39-pi-ai-adapter/README.md) 为准；两个版本各通过一次真实 Provider 最小请求，多 Provider、OAuth、工具、流式与常驻调度仍未验证）；
- 历史 Task Spike、dirty worktree、保护区分支、旧草稿或没有在当前实现中重新验证的行为；
- 只存在于测试替身、fixture 或构建产物中的额外行为。

代码标识首次出现时写成“中文名（`CodeIdentifier`）”。自然语言先描述外部行为；源码符号、表名和内部算法只在重建需要时作为锚点。未实现或未验证的内容必须单独放在“非目标/未验证边界”，不得混进当前行为合同。

### 1.2 文档体系的职责分工

| 文档 | 真相范围 | 不能替代什么 |
| --- | --- | --- |
| [`docs/requirements/`](../requirements/) | 用户想要什么、原话、产品阶段和验收意图 | 不能证明代码已实现 |
| [`docs/architecture/`](../architecture/) | 系统分层、设计方向、跨模块取舍和演进边界 | 不能替代当前组件输入/错误/状态合同 |
| [`docs/adr/`](../adr/) | 已接受且改回成本高的架构决定 | 不能把未来决定升级成实现证据 |
| [`docs/api/`](../api/) | Product API、Worker Admin、Gateway、DTO 的目标草案和 conformance 场景 | Draft 字段/路径不是当前 API |
| [`.agents/tasks/`](../../.agents/tasks/) | 实施过程、决定、偏差、验证记录和后续工作 | Task 叙述不是组件运行时合同 |
| `docs/spec/` | 当前实现的组件外部行为及可重建验收 | 不拥有新需求、不设计未来 API、不记录实施日记 |

相关入口：[`docs/README.md`](../README.md)、[`docs/api/README.md`](../api/README.md)、[`.agents/tasks/07-deferred-workflow-host/README.md`](../../.agents/tasks/07-deferred-workflow-host/README.md)、[`docs/architecture/0001-cosmos-foundation.md`](../architecture/0001-cosmos-foundation.md)、[`docs/adr/0002-nb-workflow-kernel-cosmos-host.md`](../adr/0002-nb-workflow-kernel-cosmos-host.md) 和 [`docs/adr/0003-service-worker-api-boundaries.md`](../adr/0003-service-worker-api-boundaries.md)。

### 1.3 对陌生 Agent 的阅读顺序

1. 先读本入口，确定事实来源、canonical owner、重建规则和未验证边界。
2. 读 [`contracts/0001-public-contracts.md`](contracts/0001-public-contracts.md)，了解共享 DTO、Zod 输入边界、状态枚举、Action 引用和可序列化投影。
3. 读取与当前任务直接相关的需求、架构和 ADR 背景，但不把它们当作实现证据。
4. 打开目标组件正文；遇到共享术语时沿术语表只进入 canonical owner，不复制定义。
5. 按组件正文的“重建验收”执行，并以该正文的实现与测试锚点核对行为。
6. 若验收超出已有证据或落入未验证边界，标记未验证而不是放宽合同。

### 1.4 从规格重建的方法

先画组件边界，再按“输入 → 状态/持久化 → 外部副作用 → 输出/错误”的顺序实现。对每个输入：

- 在边界立即把 `unknown` 校验成共享合同；不得用内部对象直接当公共 DTO。
- 记录默认值、空值、版本、幂等键、游标、lease/fence 和时间语义；这些跨组件约束不能靠调用者猜。
- 先实现正常路径，再实现可观察失败、重试/降级、旧 owner 拒写和幂等重放。
- 持久状态只由其 owner 写入；通知、SSE、日志和内存索引不能成为第二份 durable truth。
- 任何公开投影都使用白名单。API/存储投影已排除 lease token、Secret、绝对路径和内部 Blob key（`storageKey`）：公开读路由在 API 边界剥离，公开读 DTO 用 `publicAssetSnapshotSchema` 校验（见第 4 节）。仓储内部的 Asset snapshot 仍可携带 `storageKey`，那不是公开面。
- 测试锚点验证行为边界，不用源码字符串匹配代替合同；没有现成测试的行为必须在规格中明确验收办法。

### 1.5 统一组件模板

每个组件文件按以下标题完整书写，标题不能因组件“简单”而省略。`组件定位` 是硬性验收约束，必须用人话让第一次阅读的人一眼理解以下四件事：

1. 该组件在整个系统中的位置和作用；
2. 它解决什么问题；
3. 调用方如何使用它；
4. 典型使用情景是什么。

随后按以下顺序书写：

1. `组件定位`：除上述四件事外，说明与相邻组件的边界和消费者；不得只列源码符号或包名。
2. `概念与定义`：只定义本组件拥有的概念；共享概念链接 canonical owner。
3. `外部行为`：按正常调用顺序描述可观察效果，不逐函数复述实现。
4. `输入`：类型/字段、版本、默认值、空值、校验、幂等和前置条件。
5. `输出`：成功投影、顺序、游标、事件或下载结果；公共输出是可序列化白名单。
6. `状态与持久化`：状态集合、权威存储、生命周期、恢复；无状态组件必须明写“无持久状态”。
7. `状态转换`：每个合法转换、触发条件、不可逆终态和旧 owner 行为。
8. `副作用`：数据库、Blob、外部网络、领域事件、日志和进程资源；说明事务/幂等边界。
9. `错误与降级`：可分类错误、HTTP/异常映射、重试 allow-list、降级和 fail-closed 条件。
10. `依赖`：端口/合同/实现依赖，说明谁拥有 durable truth。
11. `配置`：环境变量、默认值、范围、路径 containment、启动守卫和安全边界。
12. `重建验收`：每一条必须是可判定条件，例如“给定 X，观察到 Y，且 Z 不发生”。
13. `实现与测试锚点`：组件正文指出对应的生产实现与行为测试；这不是本 README 的源码或测试台账。

无持久状态的 Registry、Catalog、Transport 适配器、组合根等，仍须在第 6 节写出“无持久状态”，并说明进程重启后哪些值由配置或 manifest 重新生成。

## 2. 术语注册表：唯一 canonical owner

以下定义是导航性短释义，不是第二套合同；细节、字段、状态转换和例外只在链接的 owner spec 中维护。后续组件正文引用术语时必须链接这里的 owner，不能复制一份不同定义。本表是语义导航，不是组件完成清单。

| 术语 | 导航性短释义 | canonical owner |
| --- | --- | --- |
| Source | 可被采集的来源实例及其执行快照；`kind` 指向 Connector 家族 | [`contracts/0001-public-contracts.md`](contracts/0001-public-contracts.md) |
| Connector | 针对 Source kind 的 validate/fetch 能力边界 | [`application/0001-connector-runtime.md`](application/0001-connector-runtime.md) |
| Trigger | 产生 Workflow 入队请求的触发类型；当前 ingest 有 manual/schedule/webhook（webhook 必须带触发证据，ADR-0024） | [`application/0005-ingest-workflow-control.md`](application/0005-ingest-workflow-control.md) |
| Workflow Definition | 带版本和 manifest hash 的可执行 Workflow 合同 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Workflow Run | 某 Definition 对一份不可变输入快照的一次 durable 执行 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Kernel | `@notnotype/nb-workflow` 负责脚本、Activity identity、journal replay、waiting/resume 的规范执行内核 | [`application/0008-workflow-host-runtime.md`](application/0008-workflow-host-runtime.md) |
| Durable Host | 将 Kernel、SQL TaskStore、Action、ValueStore、EventSink 和领域端口接成可恢复执行边界的 Cosmos 宿主 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Action | 带版本 ref、schema、placement 和 retry policy 的一次可调用能力 | [`application/0003-action-registry.md`](application/0003-action-registry.md) |
| Activity | Workflow journal 中一次需要稳定 identity、结果或恢复的交互 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Job | Host 为一个 Activity 创建、可被 worker claim 的 durable 任务 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Attempt | Worker 对 Job 的一次实际执行；拥有 lease 和 fencing 身份 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Lease | 有 owner、token、过期时间的有限执行权；不是公共 payload | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Fencing | 以 owner/token/revision/expiry 原子拒绝旧执行者写入的保护规则 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Completion | Activity 结果的 durable、单消费者投递记录 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Envelope | 保存 Run identity、Definition、idempotency、输入快照和产品投影的 Host 外壳 | [`application/0007-workflow-host-contract.md`](application/0007-workflow-host-contract.md) |
| Checkpoint | Source 游标及其 revision 的 CAS 进度记录 | [`application/0006-ingest-workflow.md`](application/0006-ingest-workflow.md) |
| Observation | 外部来源捕获的不可变证据及其 provenance | [身份、观察、修订与 Story](domain/0001-normalized-content/01-concepts.md#身份观察entry修订与-story) |
| Entry | 由稳定 external key 归并的本地内容身份 | [身份、观察、修订与 Story](domain/0001-normalized-content/01-concepts.md#身份观察entry修订与-story) |
| Entry Revision | Entry 内容变更的追加式、带 fingerprint 的修订 | [身份、观察、修订与 Story](domain/0001-normalized-content/01-concepts.md#身份观察entry修订与-story) |
| Asset | 与 Entry Revision 关联的媒体/附件及其保存状态 | [身份、观察、修订与 Story](domain/0001-normalized-content/01-concepts.md#身份观察entry修订与-story) |
| Story | 当前实现中的最小 Entry 上层内容投影 | [身份、观察、修订与 Story](domain/0001-normalized-content/01-concepts.md#身份观察entry修订与-story) |
| Blob | 受控 Blob Root 中按内容寻址保存的字节 | [`storage/0005-file-blob-store.md`](storage/0005-file-blob-store.md) |
| BlobRef | Workflow JSON 中的 strict 内容引用；contracts 唯一拥有 JSON wire shape，FileBlobStore 负责实际 bytes 的 SHA-256/hash 和 Blob Root containment verification | [`contracts/0001-public-contracts.md`](contracts/0001-public-contracts.md) |
| ValueRef | 只引用外置的 JSON Workflow value（固定 `application/json`）；由 ValueStore 负责 canonical JSON 与四重完整性读取，不代表媒体 bytes | [`storage/0006-workflow-value-store.md`](storage/0006-workflow-value-store.md) |
| Domain Event | 具备 type/version/payload/idempotency 的持久领域事件 | [`storage/0004-workflow-event-sink.md`](storage/0004-workflow-event-sink.md) |
| AttemptSnapshot | `WorkflowAttemptSnapshot` 的 Attempt 公开投影；由 Host 的 DomainEvent 生命周期重建，不是独立 Attempt 表 | [`storage/0003-workflow-host-store.md`](storage/0003-workflow-host-store.md) |
| CatalogPage | Product API 当前使用的 `{ items, nextCursor, snapshotAt }` 页面包装；不是独立 contracts DTO | [`interfaces/0002-product-api-http.md`](interfaces/0002-product-api-http.md) |
| CapabilitiesResponse | `GET /capabilities` 当前 Controller 内联生成的能力/限制/时间投影；不是独立 contracts DTO | [`interfaces/0002-product-api-http.md`](interfaces/0002-product-api-http.md) |
| IngestConnector | Application 的 validate/fetch 连接器端口；不直接拥有领域持久化 | [`application/0001-connector-runtime.md`](application/0001-connector-runtime.md) |
| WorkflowBlobStore | Ingest Workflow 把领域 bytes 转为 JSON BlobRef，并提供 verified read 所需的 Blob 端口 | [`application/0006-ingest-workflow.md`](application/0006-ingest-workflow.md) |
| WorkflowIngestDomainPort | Ingest Workflow 向领域/仓储提交 item 与 checkpoint 的 fence/idempotency 端口 | [`application/0006-ingest-workflow.md`](application/0006-ingest-workflow.md) |
| SSE | 带 event id、协议版本、replay cursor 和 `snapshot_required` 语义的 Server-Sent Events | [`interfaces/0002-product-api-http.md`](interfaces/0002-product-api-http.md) |
| Product API | 面向产品客户端的 Command、Query、Run 控制、查询和 SSE HTTP 面 | [`interfaces/0002-product-api-http.md`](interfaces/0002-product-api-http.md) |
| Webhook 入口 | 外部自动化触发某个采集计划的入口；不在 `/api/v1` 下，鉴权、限流与幂等自成一面对外合同 | [`interfaces/0006-webhook-entry-http.md`](interfaces/0006-webhook-entry-http.md) |
| Worker Admin | Worker 的 loopback 运维面：liveness/readiness/status/capability/metrics/drain | [`runtime/0003-worker-admin.md`](runtime/0003-worker-admin.md) |
| Drain | 停止新 poll、等待已登记资源并按 deadline 给出终态的运维操作 | [`runtime/0003-worker-admin.md`](runtime/0003-worker-admin.md) |
| Manifest | 不含 executable 的可序列化 Definition/Action/Source 描述及稳定 hash | [`application/0004-manifest-catalog.md`](application/0004-manifest-catalog.md) |
| Capability | Manifest/Worker 可公开声明的能力布尔值或 capability 名称 | [`application/0004-manifest-catalog.md`](application/0004-manifest-catalog.md) |
| Agent Invocation | `agent.invoke@1` 的 Action/Port/Fake Adapter 行为，以及 `agent.invoke@2` 按连接选模型的作用域链路；真实 Harness、长期记忆和产品 Artifact 能力后置 | [`application/0010-agent-invocation.md`](application/0010-agent-invocation.md) |
| Pi-ai Adapter | 真实 `pi-ai` SDK 适配：@1 的部署 profile 解析与 @2 的按次读取快照、错误映射、预算收紧；Harness/长期记忆不在范围 | [`application/0011-pi-ai-adapter.md`](application/0011-pi-ai-adapter.md) |
| Model Provider 配置 | 服务商与模型的写入信任门、凭证协调、同步发现、模型型连接与删除引用检查；合同逐条实现状态见 API Draft | [`interfaces/0002-product-api-http.md`](interfaces/0002-product-api-http.md)、[`interfaces/0004-http-client.md`](interfaces/0004-http-client.md)、[`storage/0001-prisma-repository.md`](storage/0001-prisma-repository.md) |

### 2.1 Wire shape 与 semantic owner 分工

- **Wire shape owner：** [`@cosmos/contracts` 公共合同](contracts/0001-public-contracts.md) 负责跨 HTTP、Workflow JSON、事件和 manifest 边界的 Zod schema、字段/版本/JSON-safe 约束。`BlobRef` 的 JSON 形状由此唯一拥有；`ValueRef` 是另一种 JSON value 引用，不能与媒体 BlobRef 混用。
- **Domain semantic owner：** [`@cosmos/domain` 规范化内容](domain/0001-normalized-content.md) 负责 `NormalizedIngestItem` 的领域含义、Publisher/Temporal 语义、external key、revision fingerprint 和 Story projection。contracts 只规定这些对象过边界时的 wire shape，不拥有上述算法或业务语义。
- **Application mapping owner：** Connector/Workflow application spec 负责从 Connector/domain runtime 值映射到 contracts wire shape；其中 `WorkflowBlobStore` 将 `Uint8Array` 外置为 BlobRef，`WorkflowIngestDomainPort` 把带 fence/idempotency 的结果交给 durable owner。
- **Storage owner：** Prisma/Blob Store specs 负责 durable bytes、SQL 事实和投影读取；它们不得反向产生第二套公共 DTO 定义。`CatalogPage`、`CapabilitiesResponse` 和 `AttemptSnapshot` 是组件正文 owner 的局部投影名，不是未链接的新 contracts 定义。

## 3. 组件正文导航

组件正文按以下目录分类；目录本身只用于定位，不表示完成度、覆盖率或测试状态：

- [`contracts/`](contracts/)：公共 wire contracts 与边界 schema。
- [`domain/`](domain/)：规范化内容和领域语义。
- [`application/`](application/)：Connector、Action、Catalog、Ingest 与 Workflow Host。
- [`storage/`](storage/)：Prisma、Workflow backend/host/event、Blob 和 Value 持久化。
- [`interfaces/`](interfaces/)：Product API、HTTP client、可观测性和 Web client。
- [`runtime/`](runtime/)：API/Worker 进程、Host 组合、Worker Admin 和结构化日志。
- [`connectors/`](connectors/)：RSS 与 managed collector 连接器。
- [`operations/`](operations/)：部署和开发运行时。

## 4. 跨组件重建约束

这些约束是当前实现中重建时不能遗漏的语义；字段和完整错误分类仍由组件 owner spec 负责。

- **固定 Workflow：** 入队创建 `cosmos.ingest@1` 的 Definition、Source execution snapshot、checkpoint cursor/revision、`triggerKind`、可选的触发证据（`triggerEvidence`，webhook 必填，ADR-0024）和 idempotency key；执行顺序是 `source.fetch@1 → media.retry.fetch@1 → [media.retry.apply@1] → library.ingest@1[] → source.checkpoint@1`（重试两步只在来源 `media.retry.maxAttempts > 0` 且存在早先 Run 已存的降级媒体时出现）。排队后修改 Source 不改变既有 Run 的 fetch 输入；相同 idempotency key 必须复用相同快照，冲突必须拒绝。保留期清理是独立维护 Workflow `cosmos.media-cleanup@1`（单 Action `media.cleanup@1`），只由显式命令入队。
- **Host 权威：** Kernel 只拥有脚本/journal 语义；SQL TaskStore 拥有 Run/Job/lease/retry/Completion 状态。Wakeup、HTTP 连接、内存 Registry、SSE 和日志都不能另立终态。
- **双 fencing：** 写领域数据或 Domain Event 前同时验证 Workflow Run lease、Activity Job lease 和所需 kernel revision；token 仅用于内部校验，不能进入 Job payload、Kernel state、Manifest、Product API 或 Worker Admin 投影。旧 owner 的 heartbeat/complete/write 必须 fail closed。
- **幂等与 at-least-once：** Envelope、Activity、Completion、Observation、Domain Event 和外部 Action 都以显式 idempotency key/receipt 或 CAS 处理重复；不能宣称 exactly-once。
- **Projection：** Product Run 将内部 `waiting` 映射为公开 `running`，`completed` 映射为公开 `succeeded`；Source 公开配置由 Controller 白名单化。Asset 的公开投影在 API 边界剥离内部 Blob key：feed、search、entries、story、entry、revision 六条读路由都经 `toPublicAsset` 逐个挑字段（`apps/api/src/app.controller/public-projection.ts`），公开读 DTO 由 contracts 的 `publicAssetSnapshotSchema` 校验，该 schema 从 `assetSnapshotSchema` 省略 `storageKey`。仓储内部的 Asset snapshot（`PrismaCosmosRepository.toAssetSnapshot`）仍带 `storageKey`，只服务 Blob 读写与内部用例，不是公开面。其余 lease token、Secret、绝对路径和任意 payload 的边界仍以对应组件正文与实际投影为准。
- **Blob/Value：** Blob Root 和 Data Root 必须 containment；Blob key 为 SHA-256 内容寻址。Workflow Value 使用 canonical JSON 和 `application/json`，读取时同时验证 key、hash、byteSize、mediaType，再返回 structured clone。
- **默认运行路径：** Worker 默认启用 Durable Host；只有显式 `COSMOS_WORKFLOW_HOST_ENABLED=false` 才回退 legacy path。空 definitions 或 actions 的 Host 组合必须拒绝启动，不能以“空目录”伪装成功。
- **本地默认值：** `COSMOS_DATA_ROOT` 默认 `.cosmos`，Blob Root 默认 `.cosmos/blobs`；API 默认 `127.0.0.1:14310`，Worker Admin 默认 `127.0.0.1:9091`；Worker poll 默认 30,000 ms、lease 默认 120,000 ms。环境覆盖、取值范围和安全约束由相应组件 spec 详述。
- **Catalog 边界：** Product API 只读取 manifest、schema 和 capability；executable Action/Connector 由 Worker 执行面加载。Source probe 可校验 manifest 与 config，但不能因为 probe 改写领域数据。
- **日志边界：** `log.v1` 结构化记录传递 request/run/job/activity context；Secret、token、query、payload、正文和外部输出必须脱敏/截断。日志不是 Domain Event，也不是业务账本。
- **Migration 顺序：** 当前 SQLite 路径按 `20260808003247_phase1_foundation`、`20260808150000_collector_jobs`、`20260810020829_normalized_content_model`、`20260813160000_workflow_run_backend`、`20260814090000_workflow_activity_host`、`20260815090000_workflow_ingest`、`20260818000000_workflow_run_source_projection`、`20260824000000_source_identity_revision`、`20260824100000_source_activation_result_snapshot`、`20260907120000_story_revision_versioning`、`20260907130000_story_merge_alias`、`20260908000000_topic_domain_v1`、`20260908120000_entity_relation_v1`、`20260908140000_user_organization_v1`、`20260908160000_annotation_v1`、`20260908180000_saved_view_v1`、`20260909100000_board_section_block_v1`、`20260909120000_spotlight_placement_v1`、`20260909140000_entry_story_evidence_v1`、`20260909160000_story_split_v1`、`20260909200000_media_retry_retention_v1`、`20260910120000_connection_state_store_v1`、`20260910140000_trigger_binding_v1`、`20260916120000_story_representation_v1`、`20260916140000_entry_relation_v1`、`20260918120000_source_soft_delete_v1`、`20261015000000_provider_model_configuration`、`20261018160000_workflow_activity_dispatch_fence` 顺序应用；组件 spec 只说明其拥有的模型和转移，不复制完整 SQL。

### 4.1 当前公开投影安全验收事实

`storageKey` 由 contracts 的 `assetSnapshotSchema` 定义、由 repository mapper 填充，公开面已剥离：六条公开读路由经 `toPublicAsset` 挑字段后返回，公开读 DTO 使用 `publicAssetSnapshotSchema`，因此该字段不出现在这些 HTTP 响应里。回归锚点是 [`apps/api/src/app.controller.public-projection.test.ts`](../../apps/api/src/app.controller.public-projection.test.ts)——逐路由断言整份响应 JSON 不含该字段名。仓储内部的 Asset snapshot 仍携带它，属内部投影，不是公开泄露。这一条成立不代表其它未验证边界（Docker、browser/e2e、真实来源、跨进程 recovery 等）已验证。

## 5. 当前非目标与未验证边界

以下内容必须明确写成“未验证/未实现”，不能作为当前能力或重建验收通过条件：

### 部署与端到端

- **Docker 容器/Compose 实际启动：** Dockerfile/Compose 配置存在；本轮 `bun run test:docker` 因当前机器缺少 Docker CLI 未运行，配置检查不等于容器通过。
- **browser/e2e：** 本轮 Playwright 浏览器流程和四个 Node 进程 E2E 已通过；它们不替代 Docker、真实来源或长时生产压力验收。

### 真实来源与完整产品范围

- **真实 RSS：** fixture/controlled RSS 行为已通过；本轮未运行 `COSMOS_REAL_RSS_URL` 指向的真实外网采集。
- **真实 Bilibili/OpenCLI：** 2026-09-04 Bilibili hot/feed real-source E2E 已通过（隔离栈实测，Run 成功且 `itemCount=20`；feed 在已验证登录态下运行）；限流、长期稳定性和跨环境登录态不能从该结果推断。
- **完整 Ingest parity/产品全量范围：** 固定 Workflow 主链已接线；完整 parity、Source 删除、完整计划/诊断、全部未来 Knowledge/Research/Delivery 仍不能从规格索引推断。

### Recovery、fencing 与进程生命周期

- **跨进程 recovery：** 受控 RSS 的 Worker A 强停、lease expiry、Worker B 接管和最终 Feed 已由 Node E2E 通过；长时双 Worker takeover、时钟漂移和压力验收未覆盖。
- **长时双 Worker fencing：** focused 双客户端/租约属性证据和 recovery E2E 不等于长时双 Worker 压力验收。
- **Worker Admin SIGTERM + 活跃 Attempt deadline：** Drain 状态、active poll/Attempt 区分和 Windows smoke 已验证；特定 SIGTERM 活跃 Attempt deadline 的长时场景未单独运行。

### 分布式与外部基础设施

- **Worker Gateway/远程 Worker：** Gateway Session、long-poll、owner epoch、late evidence 和远程 Secret 仍是边界设计，不是实现。
- **Redis/WakeupBus：** 当前本地路径不以 Redis 持有 Job truth；Redis adapter 未实现/未验证。
- **PostgreSQL/S3/多主机：** 目标架构保留替换路径；SQLite/Data/Blob Root 的多主机部署不是当前能力。

任何组件重建若需要上述边界以外的行为，必须先补充实现和独立验证，再更新对应组件 spec；不能把 `Draft`、`Planned` 或历史 Spike 当作当前实现证据。

组件目录按 `contracts/`、`domain/`、`application/`、`storage/`、`interfaces/`、`runtime/`、`connectors/`、`operations/` 分类；需要行为细节时直接打开对应组件正文。组件正文各自拥有实现与测试锚点，Task walkthrough 保存实施过程和验证记录即可。README 是入口和方法说明，不再复制组件路径、源码覆盖或测试台账。
