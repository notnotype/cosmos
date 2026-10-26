# Product API HTTP

## 状态

当前实现规格；后续代码变化应同步更新本文。本文是当前
`AppController` 的 HTTP/SSE 重建合同，不是 `docs/api/` 中 Draft、Planned 或 Reserved
路由的实现声明。

## 最后更新

2026-10-23（Task 39：Provider/model 配置端点段与新增 409 冲突码）。

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
