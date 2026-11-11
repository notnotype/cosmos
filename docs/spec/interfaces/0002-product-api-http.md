# Product API HTTP

## 状态

当前实现规格；后续代码变化应同步更新本文。本文是当前
`AppController` 的 HTTP/SSE 重建合同，不是 `docs/api/` 中 Draft、Planned 或 Reserved
路由的实现声明。

## 最后更新

2026-11-11（Task 42：SystemConfig 与 Story 当前合同补充；封口分册按本页补充更正）。

## 组件定位

Product API HTTP 是 Nest `AppController` 对外的产品查询、Source 控制、Workflow Run
投影、诊断和 Server-Sent Events（SSE）适配层。全局 prefix 由 runtime 设置为
`/api/v1`；除根 `/healthz` 和 `/readyz` 外，本文的相对路径都拼在该 prefix 后。

Controller 调用 Application/Repository/Catalog port，不直接让客户端访问 Prisma、Blob
Root 或 Worker claim/complete 接口。Source、Run、Job、Feed、Entry、Revision、Asset 和
SSE 的共享 DTO、枚举和 Zod schema 由 [`@cosmos/contracts` 公共合同](../contracts/0001-public-contracts.md)
拥有；但本 Controller 当前还返回三类没有 contracts schema 的 HTTP 局部投影：Catalog page、
CapabilitiesResponse 和 AttemptSnapshot/AttemptPage。本文件是这些 HTTP 投影的唯一字段定义，
它们不是 `@cosmos/contracts` DTO，也没有被 `HttpCosmosClient` 封装。

### 在系统中的位置与作用
它是面向产品客户端的 HTTP/SSE 边界，位于 `AppController` 与 Application、Repository、Catalog port 之间。

### 解决的问题
它把查询、Source 控制、Run 投影、诊断和 SSE 统一投影为公开路径与状态，隔离客户端与 Prisma、Blob 及 Worker claim/complete 细节。

### 使用方式
客户端请求 `/api/v1` 下的已实现路由（健康根路径除外）；Controller 调用注入的 port，响应字段和错误按本文件及公共 contracts 解析，SSE 使用对应 event envelope。

### 典型情景
读取 Feed/Search/Story、创建或触发 Source、查询 Run/Job，或订阅 SSE 刷新页面时选择该 HTTP 接口；Draft/Planned/Reserved 路由不从本文推导为已实现。

## 分册索引

本文件是当前实现规格的参考型清单,按章节拆分为分册(每册 ≤30 KB 且 ≤9k token,封口后只读);主文档只保留状态、组件定位、非目标/边界与下方索引,行为细节按章节查阅分册。

| 分册 | 范围 | 大小 |
|---|---|---|
| [part-01](0002-product-api-http/part-01-catalog.md) | 概念与定义、外部行为、System 与 manifest catalog | 6.5 KB |
| [part-02](0002-product-api-http/part-02-sources-and-runs.md) | Source 资源、Run、Job、Attempt | 16.0 KB |
| [part-03](0002-product-api-http/part-03-content-query.md) | Content query | 14.6 KB |
| [part-04](0002-product-api-http/part-04-events-and-providers.md) | SSE events、Model provider 配置 | 4.7 KB |
| [part-05](0002-product-api-http/part-05-contracts.md) | 输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点 | 13.6 KB |

→ 概念与定义、外部行为、System 与 manifest catalog 已归档:[part-01-catalog.md](0002-product-api-http/part-01-catalog.md)
→ Source 资源、Run、Job、Attempt 已归档:[part-02-sources-and-runs.md](0002-product-api-http/part-02-sources-and-runs.md)
→ Content query 已归档:[part-03-content-query.md](0002-product-api-http/part-03-content-query.md)
→ SSE events、Model provider 配置 已归档:[part-04-events-and-providers.md](0002-product-api-http/part-04-events-and-providers.md)
→ 输入、输出、状态与持久化、状态转换、副作用、错误与降级、依赖、配置、重建验收、实现与测试锚点 已归档:[part-05-contracts.md](0002-product-api-http/part-05-contracts.md)

## Task 42 当前合同补充

本节与 [公共 DTO 补充](../contracts/0001-public-contracts.md#task-42-当前合同补充)取代封口分册中与其冲突的默认模型、模型 Connection、Story 请求/响应说明；历史正文保留，不作为当前调用依据。以下从当前源码核对，运行验收状态见 [Task 42 本轮过程](../../../.agents/tasks/42-default-model-ui-api/walkthrough.md)。

| 方法与路径 | 当前输入与成功响应 |
| --- | --- |
| `GET /api/v1/system/config` | 200 完整 `{defaultModelId, defaultModel}`；未设置为双 null；模型已删除时保留原默认 ID、`defaultModel:null`。模型快照不含凭证，未知价格字段省略。 |
| `PUT /api/v1/system/config` | strict `{defaultModelId:string\|null}`；非空 ID 长 1–200，不接受前后空白及合同禁止的控制字符；null 清除。200 仅 `{defaultModelId}`，不返回完整模型。 |
| `GET /api/v1/config/default-model` | 旧端点保留，200 `{modelId:string\|null}`。 |
| `PUT /api/v1/config/default-model` | 旧输入 `{modelId:string\|null}`、200 `{modelId}`；与新端点共用模型存在性与 Provider active 校验，旧入口不升级为新 strict DTO。 |
| `POST /api/v1/stories/:storyId/agent-candidates` | strict `{task,sources?,modelId?}` 与必需 Idempotency-Key；不再接收 connectionId，省略 modelId 使用系统默认。202 `StoryAgentGeneration`。 |
| `GET /api/v1/stories/:storyId/agent-generations/:runId` | `runId/storyId/task/status/candidateId/errorCode`，无 connectionId；状态与候选费用补充见 [费用合同](../../../docs/api/0008-story-content-representation.md#task-42-费用合同已冻结目标实施与验收进行中)。 |

配置四条路由均 no-store。新输入非法为 400 `invalid_input`，选中模型不存在为 404 `not_found`，Provider 缺失或非 active 为 409 `invalid_model_selection`，未知依赖异常为 503 `dependency_unavailable`；错误只带安全 code/message，不回显底层异常。非空模型选择、Provider 检查与 singleton upsert 在同一写事务内，删除先完成则后续设置拒绝；设置先完成后仍允许删除，读取保留悬空 ID 并返回 null 模型，不承诺永不失效。清除用 upsert 写 null，不触发生成或外呼。

当前 Story 费用投影：Candidate 与 Generation 的 `cost?` 复用 invocation 费用，完成提案时原值进入既有 `candidateJson`；候选读取和重启后读取不重新计价。Generation 只在 completed，候选 ID 等于 `story-candidate-${runId}`，且候选 Story ID、Story Revision ID、proposal.task 都匹配冻结输入时读取该费用。queued/running/failed/cancelled、无候选、身份不匹配或旧候选缺费用均省略字段；0 保留。候选列表的已持久化费用独立于 generation 状态，失败后孤儿候选不能归为成功 Run 费用。同一有效 fence、同一候选可幂等回放，费用变更的回放拒绝；这不承诺提交后异常的自动重试最终成功。Story 费用持久化不新增账单表、不回填旧数据；模型定价配置的新增列迁移另见下节。生产锚点：[候选完成](../../../packages/application/src/story-agent.ts)、[生成查询](../../../packages/application/src/story-agent-workflow-control.ts)、[候选持久化](../../../packages/storage-prisma/src/repository/story-agent-candidates.ts)；重建须覆盖身份不匹配、缺失/零、失败/取消、重启读回及幂等回放。

实现与验收锚点：[Controller](../../../apps/api/src/system-config.controller.ts)、[Application](../../../packages/application/src/system-config.ts)、[Prisma Repository](../../../packages/storage-prisma/src/system-config.ts)、[API 行为测试](../../../apps/api/src/system-config-api.test.ts)、[存储行为测试](../../../packages/storage-prisma/src/system-config-model.test.ts)。重建时须覆盖空配置、设定/清除、未知价格省略、删除时序、400/404/409/503 及错误脱敏。

## 模型定价配置当前合同

本节取代封口 Provider 分册中旧两价配置说明；精确字段、创建默认值、完整组 PATCH、快照兼容与 invocation 费用规则由 [公共合同](../contracts/0001-public-contracts.md#模型定价与调用费用当前合同)拥有。实现已落地，整体验证进行中。

| 方法与路径（均在 /api/v1 下） | 当前行为 |
| --- | --- |
| `POST /model-providers/:providerId/models` | strict 创建命令，普通四价必填，201 模型快照；缺项/非法组合为 400 invalid_input。 |
| `PATCH /model-providers/:providerId/models/:modelId` | strict expectedVersion + metadata 或完整价格组，200 模型快照；版本冲突 409 version_conflict，metadata-only 不覆盖旧价。 |
| `GET /model-providers/:providerId/models`、`GET /model-providers/:providerId/models/:modelId` | 返回同一模型配置快照，未知普通/缓存价格省略，0 保留；默认模型 GET 投影携带同一价格配置。 |

模型写请求沿用 Provider 配置的本机信任门、JSON 大小限制、Idempotency-Key 和 no-store，不因保存价格而调用 Provider。数据库新增 [独立 additive SQL](../../../packages/storage-prisma/prisma/migrations/20261111080000_task_42_cache_tiered_pricing/migration.sql) 的九列，旧两价与历史候选 cost JSON 原值保留；旧模型缓存价 NULL、币种 USD、阶梯关闭，阈值/高档 null。应用服务、Repository、默认模型和 Worker resolver 均传递配置。隔离迁移与 CRUD 的证据不代表用户数据库已迁移或已部署。

重建至少验证 POST/PATCH/list/get 和 SystemConfig 投影一致、零价与未知、metadata-only 保留、部分价格组拒绝及版本冲突；实现锚点：[模型 Controller](../../../apps/api/src/configured-model.controller.ts)、[模型仓储](../../../packages/storage-prisma/src/configured-model-repository.ts)、[默认配置仓储](../../../packages/storage-prisma/src/system-config.ts)、[Worker 模型解析](../../../packages/storage-prisma/src/agent-model-resolver.ts)。调用缓存/阈值边界、完整浏览器和全仓验收需分别记录，不能用局部合同检查代替。

## 非目标/边界

- `docs/api/0002-product-service-api.md` 与 `0003-product-dtos.md` 中标为 Draft/Planned/
  Reserved 的 routes、plugins、connections、settings、workflow cancellation/signals、
  Gateway、Worker discovery 和远程执行均不是本文实现。
- 模型配置的 Provider 删除没有采用 `docs/api/0009-provider-model-configuration.md` 原设计的 202 OperationSnapshot，而是同步 `DELETE` + 204；`GET /model-providers/:id/connections`（编辑前受影响连接查询）明确不实现，改由 Web 用连接列表与模型列表自行聚合。
- 当前没有 Product API 的认证/授权、用户会话、CSRF、HTTPS、Range/ETag 目标合同或
  upload endpoint。
- Controller 不提供 Job claim/renew/complete、lease token 管理、Kernel journal 或
  arbitrary Workflow input API。
- 浏览器/e2e、Docker、真实 RSS/Bilibili/OpenCLI、跨进程 recovery 和多主机行为未由
  本文宣称已验证。
