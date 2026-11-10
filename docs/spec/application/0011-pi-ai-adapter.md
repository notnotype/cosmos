# pi-ai Agent Adapter

## 状态

当前实现规格；描述独立 `@cosmos/agent-pi-ai` package 的真实 `pi-ai` Adapter（固定的 `agent.invoke@1` 与按模型配置解析的 `agent.invoke@2`），以及 Worker 无条件注册的 `agent.invoke@2` Action 组合。Worker 没有 Agent 部署 profile；每次调用校验配置模型 active 与 Provider 的 SecretRef，并通过 callback 读取 SecretStore；不把 connectorId 当模型 Provider。凭证回调不是强 lease 或内存擦除保证。@1 与 @2 均已通过真实最小 Provider 请求（HTTP 200，两次都走 Chat Completions）；这些 smoke 只证明单次链路可用，不覆盖生产可靠性或完整 Provider 行为。

## 最后更新

2026-11-10（Task 41：模型配置与 Connection 分离）。

## 组件定位

`@cosmos/agent-pi-ai` 是具体模型 SDK 与 Cosmos provider-neutral Agent Invocation Port 之间的适配层。它把 `AgentInvocationInput` 转换为 `@mariozechner/pi-ai` 的 `Context`，通过注入凭证解析器获得本次调用凭证，调用 SDK 的一次性 `complete()`，再把 SDK 响应转换为 `AgentInvocationOutput`。

上层 Action、Workflow Host、Job、Attempt、Lease、取消、重试和 completion 仍由 `@cosmos/application` 与 Workflow Host 所有。该组件不访问 Prisma、SQLite、Data Root、Blob/Artifact Root，不持有 Job 终态，不执行工具，也不把 secret 放进 JSON-safe input/output。

## 概念与定义

- **pi-ai Agent Adapter（`PiAiAgentInvocationAdapter`）**：实现 `AgentInvocationPort` 的真实 SDK 适配器。
- **Credential Resolver（`PiAiCredentialResolver`）**：按 provider 和调用上下文进入短时 `withCredential` callback；Worker 在 callback 内从绑定 Connection 的 SecretRef 读取凭证，Adapter 不拥有凭证存储。
- **SDK Facade（`PiAiClient`）**：隔离 `getModel`/`complete` 的可注入边界；生产实现调用 `@mariozechner/pi-ai`，测试实现不联网。

## 外部行为

1. Adapter 先拒绝已经取消的调用。
2. Worker 通过显式配置的 Connection ID 读取 Connection；必须存在、active 且包含 SecretRef，再在 callback 内向 SecretStore 读取凭证；缺失/读取失败时返回 `authentication_required`。`connectorId` 不代表模型 Provider，所选连接是否为目标 Provider 凭证由部署者负责。
3. Adapter 把 system 消息合并为 `systemPrompt`，把 user/assistant/tool 消息转换为 pi-ai 消息，把工具描述转换为 SDK tool 描述。
4. Adapter 以 input budget 设置 `maxTokens`，使用调用 AbortSignal 和 deadline 调用 `complete()`；凭证只放在 SDK options 中。
5. Adapter 从 assistant message 提取文本、工具调用、usage、provider/model 和 stop reason，并通过 Cosmos output schema 校验。
6. Adapter 不执行工具调用；工具调用只作为结果请求返回给上层。

## 输入

输入使用既有 `AgentInvocationInput`：provider、model、消息、工具描述、单次预算和 JSON-safe metadata。Adapter 构造时注入 `PiAiCredentialResolver`，可选 opaque `secretRef` 只作为 resolver 输入，不进入 SDK response 或 output。调用上下文使用既有 `AgentInvocationContext` 的 idempotency key 与 AbortSignal。

## 输出

成功返回既有 `AgentInvocationOutput`：

- 文本 content 由 SDK text content 合并；
- tool call 只保留 Cosmos 合同需要的 name 与 JSON-safe arguments；
- usage 映射为 input/output/total token；
- provider/model 优先使用 SDK 返回值，缺失时使用请求值；
- stop 映射为 `stop`、`tool_call`、`length` 或 `cancelled`；
- metadata 当前为空对象，不复制 SDK 原始 payload。

凭证、SDK message 原文、cost、时间戳、请求 headers 和错误原文不进入输出。

## 状态与持久化

无持久状态。Adapter、resolver 和 SDK facade 是进程内依赖；重启后由调用方重新组装。Credential resolver 的存储实现不属于本组件。Workflow Run、Activity、Job、Attempt、Lease、completion 和恢复状态仍由 Workflow Host/TaskStore 持有。

## 状态转换

组件自身无持久状态转换。一次调用的可观察结果为成功 output 或受管 Action error：

- 已取消：`cancelled`，不可重试；
- deadline/Abort：`timeout`，可重试；
- 无 credential 或 provider 拒绝认证：`authentication_required`，不可重试；
- provider 429/限流：`rate_limited`，可重试；
- provider 网络/5xx/其它依赖异常：`dependency_unavailable`，可重试；
- provider 预算/上下文限制：`budget_exhausted`，不可重试；
- unsupported stop reason、非法 usage 或 output schema 失败：`malformed_payload`，不可重试。

## 副作用

- 生产 SDK 产生一次外部模型网络调用。
- resolver 可能读取一次短生命周期 credential；Adapter 不保存或记录 credential。
- 测试 SDK facade 不联网。
- 日志、Job 状态、Lease、completion 和重试副作用由调用方/Workflow Host 所有。

## 错误与降级

Adapter 不生成规则摘要、空成功结果或其它 fallback。未知 SDK 异常统一映射为可重试 `dependency_unavailable`，错误消息只使用 provider 类别，不回传 API key 或完整 provider payload。真实 SDK 未配置时，调用方不应注册该 Adapter，也不应自动切换 Fake Adapter。

## 依赖

- `@cosmos/application`：`AgentInvocationPort`、`AgentInvocationContext`、`ActionExecutionError`；
- `@cosmos/contracts`：Agent input/output schema；
- `@mariozechner/pi-ai`：生产模型发现与 completion API；
- 外部 `PiAiCredentialResolver`：凭证获取，不由本组件持久化。

## 配置

Worker 没有 Agent 部署 profile：`COSMOS_AGENT_*` 已随 `agent.invoke@1` 退出，Worker 不再读取这些变量，升级后的部署即使还留着它们也照常启动。模型、地址与凭证都来自调用时那条使用 `cosmos.agent` 连接器、已选模型的 Connection；凭证由该连接所属 Provider 的 `secretRef` 指向 SecretStore。Worker 必须依赖应用的 SecretStore，不能回退到环境变量或 Fake Adapter。

## Worker 接线与受控真实验收

Worker 无条件把 `agent.invoke@2` 注册到 Workflow Host，因为它的模型与凭证在调用时才解析，没有「启动期配置完整才可注册」的形态。每次调用重新读取指定 Connection 与 SecretStore；取消检查、状态非 active、没有选模型、Provider 非 active、无 SecretRef、读取异常或空值都阻止 SDK 调用。

`agent.invoke@1` 的契约（`AgentInvocationPort`、输入输出 schema、`FakeAgentInvocationAdapter` 与 catalog 条目）仍然保留，但 Worker 不再注册该 Action，因此 catalog 里该条目是 `status: "disabled"`（@2 是 `enabled`）。Story 生成消费连接作用域 @2，产品接线边界见 [Invocation 规格](0010-agent-invocation.md#story-候选消费者产品接线)。那次真实验收用的装配留在 `.agents/tasks/39-pi-ai-adapter/connection-smoke.ts`，只为让证据可复现，不是生产注册路径。

已执行一次真实文本 smoke：provider `jijiapi`、model `gpt-6-luna`、OpenAI Chat Completions、`https://api-slb.jiji.cc/v1`，提示要求只回复 `READY`，调用 budget 的 `maxOutputTokens=64`。调用成功且输出未含 credential。SDK 返回 usage 报告 input 555、output 5、total 4400；其中 total 不等于 input+output，需视作 provider 计量语义未核实。该 smoke 不覆盖可靠性、生产部署、错误矩阵、工具执行、OAuth 或长时任务。它走的是已退役的环境变量凭证链路，只作为历史记录保留；`@1` 与 `@2` 各一次按 Connection/SecretRef 解析的真实请求见 [Task 39 第九册](../../../.agents/tasks/39-pi-ai-adapter/walkthrough-provider-model-09.md)。

## 连接作用域适配器（`agent.invoke@2`）

`PiAiAgentInvocationV2Adapter`（`packages/agent-pi-ai/src/invocation-v2.ts`）实现 `AgentInvocationV2Port`，与 `@1` 端口相比，模型不再由调用方声明、也不来自任何部署 profile：

1. 每次调用先通过注入的 `AgentModelConnectionResolver` 解析 `connectionId`，得到连接、模型与 Provider 的同一次读取快照；
2. 解析结果为 `null`（连接不存在/已撤销、`connectorId` 不是 `cosmos.agent`、没有选模型、Provider 非 `active` 或没有 SecretRef）时抛出不可重试 `authentication_required`，不读凭证、不调用 SDK；
3. 按快照里的 `api` 构造 `openai-completions` 或 `openai-responses` 模型，地址取 Provider 的 `baseUrl`，预算取 `min(调用方 maxOutputTokens, 模型 maxOutputTokens)`；
4. 通过 `PiAiSecretReader` 按 `secretRef` 读一次凭证，取消后不再读、也不调用 SDK；
5. 输出里的 `provider`/`model` 回填实际使用的配置，而不是调用方声明的值。

模型构造与协议错误映射由 `pi-models.ts` 拥有，`index.ts` 与 `invocation-v2.ts` 都从那里导入：若 @2 的适配器反过来从包入口 `index.ts` 导入，而入口又导出 @2 的适配器，ESM 循环会让类在求值前为 `undefined`，失败点是运行时的 `not a constructor`。

## 重建验收

1. 给定注入式 fake client 与 credential resolver，调用 Adapter 可观察到 system/user/tool 请求映射，且 SDK options 含 maxTokens、AbortSignal 和 credential。本次真实调用结果记录于 `.agents/tasks/39-pi-ai-adapter/walkthrough.md`。
2. SDK 返回 text/tool call/usage/stop reason 时，Adapter 返回通过 `AgentInvocationOutput` schema 的 provider-neutral 结果。
3. resolver 返回 null 时，SDK client 不被调用，结果为不可重试 `authentication_required`。
4. SDK status 401/403、429、5xx 分别映射到认证、限流、依赖错误；不产生 fallback output。
5. 外部 AbortSignal 与 deadline 分别产生 `cancelled` 与 `timeout`，且不会把 SDK 原始错误直接写入 output。
6. 不把 credential、SDK payload、cost 或 headers 放入 Agent output、metadata 或 durable input。
7. `bun run --cwd packages/agent-pi-ai typecheck` 与 build 通过；focused adapter tests 全部通过。
8. 未配置真实 Adapter 时，现有 Worker 默认组合不发生变化。

## 实现与测试锚点

- 实现：`packages/agent-pi-ai/src/index.ts`（@1）、`packages/agent-pi-ai/src/invocation-v2.ts`（@2）、共享模型构造 `packages/agent-pi-ai/src/pi-models.ts`；
- 行为测试：`packages/agent-pi-ai/src/index.test.ts`、`packages/agent-pi-ai/src/invocation-v2.test.ts`；
- Provider-neutral Port：`packages/application/src/agent-invocation.ts`、`packages/application/src/agent-invocation-v2.ts`；
- 共享 input/output：`packages/contracts/src/agent.ts`。

## 未验证边界

已通过真实 API 最小 smoke；Worker 侧只注册连接作用域的 `agent.invoke@2`，旧的部署 profile 与 `Connection.secretRef` 提供模型凭证的路径已退出，mock/集成链路已经实现并本地验证。这不提供 SecretStore 强租约或内存擦除保证。未验证多 Worker、OAuth、provider matrix、工具执行、流式输出、长时间 Agent 运行或生产部署。

`agent.invoke@2` 已通过一次真实 Provider 请求（连接作用域解析：模型、地址与凭证全部由 Connection → Model → Provider → SecretStore 在服务端取得，`secretReads: 1`、凭证未出现在输出中），另有隔离测试覆盖合同、连接解析、适配器与 Worker 注册。仍然是未验证的：真实服务商对 Responses 协议的行为差异（两次 smoke 都走 Chat Completions）、多 Provider、OAuth、工具执行、流式输出、常驻 Worker/Workflow 调度与生产部署。
