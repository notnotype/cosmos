# Cosmos 架构入口

本页是 `docs/architecture/` 的导航和边界说明。它帮助读者先建立模块关系，再进入架构主文、分册、实现规格和 ADR；不替代这些文档的详细合同，也不记录变更日志。

## 责任与阅读顺序

- **当前架构决策人：Otirik。** 本仓库的架构取舍、边界和最终接受状态以 Otirik 当前确认的文档与代码为准。
- **历史设计依据提供者：Notype。** Notype 是历史架构顾问和设计依据的提供者，不是当前架构最终决策人；相关设计只有在当前架构文档、ADR 和实现中被接受并得到证据后，才可作为当前结论使用。
- 先读本入口，再读[总体架构主文](0001-cosmos-foundation.md)和[信息模型主文](0002-information-model.md)；需要章节细节时进入两份主文各自的分册索引。
- 需要区分“设计目标”和“当前行为”时，以[当前实现规格入口](../spec/README.md)为准；需要了解已接受的长期取舍时，以[ADR 入口](../adr/README.md)为准。

## 架构主文与分册

### 总体架构

- [0001 Cosmos 总体架构设计](0001-cosmos-foundation.md)：系统分层、运行边界、持久化、Workflow、Connector、API/Worker 和架构不变量。
- 分册入口见主文的[分册索引](0001-cosmos-foundation.md#分册索引)：
  - [§1–3：结论、目标与边界、架构原则](0001-cosmos-foundation/part-01-03.md)
  - [§4：Source、Trigger、Workflow 与 Action](0001-cosmos-foundation/part-04.md)
  - [§5–6：持久化事件、任务运行时与采集层](0001-cosmos-foundation/part-05-06.md)
  - [§7–12：信息库、检索、推荐、Agent、Artifact、Workspace、看板与 Pub](0001-cosmos-foundation/part-07-12.md)
  - [§13–17：数据所有权、模块布局、公开合同、安全与平台边界](0001-cosmos-foundation/part-13-17.md)
  - [§18–20：实施路线与后置决定](0001-cosmos-foundation/part-18-20.md)
  - [§22：历史变更记录](0001-cosmos-foundation/part-22.md)

### 信息模型

- [0002 Cosmos 信息模型、相关推荐与持续工作区](0002-information-model.md)：Entry、Story、Topic、Relationship、Workspace、Artifact 和展示决策的语义边界。
- 分册入口见主文的[分册索引](0002-information-model.md#分册索引)：
  - [§2–4：概念校准与基础信息层](0002-information-model/part-02-04.md)
  - [§5–10：Topic、推荐、热度、Workspace 与关系模型](0002-information-model/part-05-10.md)
  - [§12–14：迁移、后置问题与历史变更](0002-information-model/part-12-14.md)

## 已核实的模块边界与关键数据流

以下结论由当前入口代码、包依赖和实现规格交叉核对得出；这里只保留边界和方向，不展开实现细节。

### 产品读写路径

```text
Web → HTTP Transport → API → Application → Prisma / Blob
```

- Web 通过 [`apps/web/package.json`](../../apps/web/package.json) 声明使用 `@cosmos/transport-http`，不以数据库或 Blob 根目录作为产品客户端边界。
- HTTP 客户端门面由 [`packages/transport-http/src/index.ts`](../../packages/transport-http/src/index.ts) 提供；资源域客户端在其下层组合，调用方不需要知道内部拆分。
- API 进程由 [`apps/api/src/main.ts`](../../apps/api/src/main.ts) 启动，负责 HTTP 生命周期、版本化产品 API 前缀、健康探针和仓储生命周期；产品能力继续向 Application 边界下沉。
- Application 是用例和 Workflow 的组合边界；其包依赖 [`packages/application/package.json`](../../packages/application/package.json) 指向 domain、contracts 和 Blob 能力，而不是让 Web 或 Connector 直接拥有持久化。
- Prisma 与 Blob 的持久化事实由存储实现拥有；对应的当前行为说明见 [Prisma Repository spec](../spec/storage/0001-prisma-repository.md) 和 [File Blob Store spec](../spec/storage/0005-file-blob-store.md)。

### 外部采集与后台执行路径

```text
Worker → Connector / Workflow → 持久化数据
```

- Worker 入口 [`apps/worker/src/main.ts`](../../apps/worker/src/main.ts) 装配 Connector Registry、Application 服务、Workflow Host、Action、Prisma Repository 和 Blob 能力。
- Connector 负责来源交互边界；Workflow 负责可恢复的后台执行边界；持久化结果回到 Application/存储所有者，不由 Web 或 Connector 直接写核心数据库。
- 当前 Worker 运行与组合边界见 [Worker process spec](../spec/runtime/0001-worker-process.md)、[Workflow Host composition spec](../spec/runtime/0002-workflow-host-composition.md)、[Connector runtime spec](../spec/application/0001-connector-runtime.md) 和 [Ingest Workflow spec](../spec/application/0006-ingest-workflow.md)。
- API 不直接执行外部采集；采集任务由持久化的 Job/Workflow 交给 Worker 执行。这一边界同时由[总体架构不变量](0001-cosmos-foundation.md#21-架构不变量)和 [ADR-0003](../adr/0003-service-worker-api-boundaries.md) 约束。

## 当前已实现

当前代码和规格已能支持以下边界（具体字段、状态和验收仍以对应 spec 为准）：

- Web 通过版本化 HTTP Transport 使用产品 API；API 与 Worker 是分开的运行入口。
- API 负责产品 HTTP 面和仓储生命周期；Worker 负责 Connector、采集、Workflow/Action 执行及后台持久化。
- Application 提供 Connector、采集 Workflow、Workflow Host、媒体处理和 Agent Invocation 等用例边界；Prisma Repository 与本地 Blob Store 承担持久化事实。
- 当前默认产品路径以本地 SQLite、数据根和 Blob 根为基础；Workflow 的 Job、Run、lease 和恢复语义由 Cosmos Host 与持久化存储共同承担。
- 当前已有 Product API、Worker Admin、RSS/受管采集、媒体边界、Provider/model 配置和 Agent Invocation 的实现规格；是否覆盖某一行为，以 [`docs/spec/`](../spec/) 中对应组件正文的实现与测试锚点为准。

## 已接受但尚未实现的目标

下面是已进入架构或 ADR、但不能从当前实现推断为可用能力的目标：

- Worker Gateway、远程 Worker、远程执行协议和多主机执行；当前先保持 Product API、Worker Admin 与 Gateway 的边界设计。
- PostgreSQL + S3/MinIO 等分布式持久化路径、Redis/WakeupBus 适配和多主机部署；当前本地路径仍以 SQLite/Data Root/Blob Root 为基础。
- 完整的 Harness、长期记忆、Artifact、Workspace、Knowledge、Research、Delivery 等产品能力；当前 Agent Invocation/适配器不能代表这些完整能力已经交付。
- 信息模型中自动聚类、Knowledge Workflow、Story split 的自动化、复杂推荐/Spotlight 策略及其它明确后置的产品切片。
- 细粒度权限、多人同步、多租户和不可信扩展沙箱；当前单用户、可信本地扩展边界仍是既定前提。

这些目标的接受状态来自架构主文和 ADR，不是当前实现证明；对应实现完成后必须补充独立规格和验证。

## 未验证边界

以下边界不能因配置文件、设计文档或局部测试存在而视为已验证：

- Docker/Compose 的实际启动和容器验收；当前环境未完成 Docker CLI 验证。
- 指向真实外网的 RSS 长期采集；fixture 或受控来源通过不等于真实来源稳定性已验证。
- 长时双 Worker 接管、压力、时钟漂移，以及特定 SIGTERM 活跃 Attempt deadline 场景。
- 真实平台的限流、长期稳定性、跨环境登录态和完整 Ingest parity。
- Gateway/远程 Worker、Redis、PostgreSQL、S3/MinIO 和多主机部署；这些同时属于后置实现目标，不能把设计边界当作运行证据。
- 浏览器、真实来源、Docker、跨进程和生产压力验收之间不能互相替代；应按 [spec 的非目标与未验证边界](../spec/README.md#5-当前非目标与未验证边界) 分别报告。

## ADR 与实现规格导航

- [ADR 入口](../adr/README.md)：稳定的架构决定、后果和 Revisit Gate；尤其参阅 [ADR-0002](../adr/0002-nb-workflow-kernel-cosmos-host.md)、[ADR-0003](../adr/0003-service-worker-api-boundaries.md)、[ADR-0005](../adr/0005-media-boundary-v1.md)、[ADR-0023](../adr/0023-collection-plan-v1.md) 和 [ADR-0030](../adr/0030-agent-invocation-v1.md)。
- [spec 入口](../spec/README.md)：当前组件行为、输入输出、状态、持久化、副作用、错误与重建验收；按 [application](../spec/application/)、[storage](../spec/storage/)、[interfaces](../spec/interfaces/)、[runtime](../spec/runtime/) 和 [connectors](../spec/connectors/) 分类。
- [Product API HTTP spec](../spec/interfaces/0002-product-api-http.md)、[HTTP client spec](../spec/interfaces/0004-http-client.md) 和 [Web client spec](../spec/interfaces/0005-web-client.md) 描述产品访问边界；[Worker Admin spec](../spec/runtime/0003-worker-admin.md) 描述运维边界。

## 证据与边界规则

- 架构文档说明设计方向、跨模块取舍和演进边界；ADR 说明稳定决定；spec 说明当前可观察行为。三者职责不同，不能互相替代。
- 源码链接是边界证据，不是把入口文件当作完整合同；具体行为应回到对应 spec 和测试锚点核对。
- 当文档、代码和验证结果不一致时，不把未来目标或历史设计升级为当前能力；应明确标注“已接受但未实现”或“未验证”，由 Otirik 决定后续架构调整。
