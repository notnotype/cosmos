# Proposal：Story Agent 超时与错误展示 v1

> 状态：accepted
>
> 日期：2026-11-12
>
> 决策者：Otirik（维护者）
>
> 关联需求：[2026-11 原始需求活跃分册](../requirements/0001-original-requirements-active-2026-11.md)
>
> 关联实现：Task 42，本轮新增切片记录于 [walkthrough](../../.agents/tasks/42-default-model-ui-api/walkthrough.md#story-agent-超时与错误展示2026-11-12)

## 1. 问题

Story Agent 生成当前由服务端固定设置 60 秒调用预算。用户无法从设置页面调整它。某些模型响应超过该时长后会被中断，生成查询接口目前把终态失败统一投影为 `generation_failed`，Web 因此无法给用户提供与鉴权、限流、超时、无效响应等故障相匹配的提示。

Activity Job 已把结构化 `errorCode` 作为独立字段持久保存；Story Generation 的 API 投影没有读取它。最近一次故障记录显示调用约 60 秒后以 cancelled finish reason 返回，后续保存动作立即失败，并仅对用户呈现通用失败信息。代码和运行记录支持“超过现有调用预算”这一判断，但不证明上游服务的所有超时原因。

## 2. 目标与非目标

### 目标

1. 系统设置持久保存 Story Agent 调用超时，单位为秒，默认 `300`，允许 `30` 到 `1800` 秒（含边界）。新建生成任务在准备 Agent Invocation 时，将当前配置转换为毫秒写入不可变请求快照。
2. 设置接口支持只更新超时或只更新默认模型，更新一个字段不得覆写另一个字段；Web 提供约束范围的整数输入和保存状态。
3. Story Generation 对终态失败公开有限、稳定的分类码：`timeout`、`authentication_required`、`rate_limited`、`budget_exhausted`、`invalid_configuration`、`dependency_unavailable`、`malformed_payload`。未知错误使用 `generation_failed`；用户取消仍使用 `cancelled` 状态，不将其显示为失败。
4. Web 将错误码翻译为固定、可操作的简体中文文案。不得显示 provider/HTTP 原文、凭据、内部异常文本或 Workflow lastError。
5. 增加合同、业务、持久层、API、Web 与浏览器行为测试，证明有效设置进入请求快照且失败分类能跨任务重启被读取。

### 非目标

- 不改变非 Story Agent 的模型调用预算，不增加用户级或单模型级设置。
- 不让用户配置重试次数；timeout 配置约束每次调用尝试，任务自动重试会增加总墙钟时长。
- 不保证超时可以终止不响应取消信号的外部服务端任务。
- 不将服务商自由文本透传到 UI，不建立一般用途的全局错误消息本地化框架。
- 不迁移或清理用户数据库，不运行真实 Provider 调用，不部署。

## 3. 当前行为与证据

- `packages/application/src/story-agent-workflow-control.ts` 在新建 Story Agent Workflow 前构造 Agent Invocation 预算；固定预算由 `packages/agent-pi-ai/src/invocation-v2.ts` 用于终止单次请求。
- `packages/contracts/src/system-config.ts` 的 SystemConfig DTO/命令当前只有默认模型字段；`SystemConfig` 是 SQLite singleton 记录。
- `packages/contracts/src/story-agent.ts` 当前 Generation 失败码只包括 `generation_failed`。
- `packages/application/src/workflow-activity-worker.ts` 将识别到的错误码写入 terminal ActivityJobResult；`packages/storage-prisma/src/workflow-host-store/activity-store.ts` 持久化到关联 Job 行的 `errorCode`。
- `packages/application/src/story-agent-workflow-control.ts` 的 Generation 投影没有查询 Activity Job 错误码，因此所有 Workflow failed 状态都变成 `generation_failed`。Activity completion JSON 本身不携带独立 errorCode；本方案不改外部 `@notnotype/nb-workflow` 的 completion 契约。

## 4. 决策

### 4.1 超时配置

将整数 `storyAgentTimeoutSeconds` 加入 SystemConfig 持久记录和公共 DTO，默认值为 300、范围为 30–1800。schema 与 SQLite 使用 additive 迁移和数据库默认值，旧单例行升级后取得 300。更新命令允许字段级更新，并至少要求一个字段；边界校验在合同和应用服务均执行。

Story enqueue 在完成幂等键查找、且确认需要创建新 Run 后读取超时设置，秒转毫秒后通过 Agent Invocation budget 进入 Workflow input snapshot。相同幂等键的旧 Run 仍返回它创建时的快照，设置更改不重写历史 Run。每次可重试调用都有各自预算；最终总用时可超过设置值。当前 30 秒 heartbeat/120 秒默认 Worker lease 是可续租租约，不是 Story 生成总时间硬上限。

### 4.2 失败分类及读取

在 Agent/Story 领域边界将已识别失败归入以下公开白名单：

| code | 用户提示方向 |
| --- | --- |
| `timeout` | 本次生成超过设置的时限；可检查模型响应情况、增加时限后重试 |
| `authentication_required` | 模型凭据或提供商访问不可用；前往模型设置检查连接 |
| `rate_limited` | 服务商限制请求频率；等待后重试 |
| `budget_exhausted` | 响应达到本次输出/上下文预算；检查模型与请求规模 |
| `invalid_configuration` | 模型、endpoint 或请求配置无效；检查模型设置 |
| `dependency_unavailable` | 网络或模型服务暂不可用；稍后重试 |
| `malformed_payload` | 模型响应不完整或不符合生成格式；可以重新生成 |

已知错误码由现有 Activity Job `errorCode` durable 字段提供。Story Generation 增加窄只读查询边界，按 Workflow Run ID 查询最终 failed Story Activity 的机器码并校验白名单后投影；不依赖 `lastError`、message、错误字符串前缀或模型输出内容。未知/旧数据缺少分类时投影为 `generation_failed`。用户取消按既有 cancelled 状态保留。

相比修改公共 nb-workflow completion 格式，本地读取选择复用已持久化的 Job 字段，降低跨 Workflow、外部依赖版本和恢复路径的扩展风险；查询限制在 Story Generation 投影，不更改其它 Workflow API。

### 4.3 Web 交互

设置页用带明确秒单位的整数输入配置时间，展示允许范围、保存/失败状态，并在加载旧/缺失配置时按 300 秒缺省。Story 候选页只根据 DTO 错误码显示固定文案；未知值显示通用提示。页面不显示自由错误文本。超时提示允许用户打开设置并在修改后重试；鉴权/配置提示指向模型设置；限流/依赖不可用提示建议稍后重试；取消提示保持中性。

## 5. 取舍

- 选系统级 SystemConfig 而不是环境变量或每个 Agent 调用参数：用户可在同一设置界面调整且能立即影响新建任务，仍由服务端在入队时控制。
- 选每次尝试的预算而不是整条 Workflow 的总截止时间：保持现有 Agent Invocation contract 和 Activity 重试语义；代价是一次任务可用时长乘以 attempts 并叠加退避。
- 选公开固定错误码而不是原始异常 message：恢复操作更明确，同时避免泄漏 endpoint、服务端响应或凭据相关细节。
- 选读取 Cosmos 已有 durable Job 记录而不修改外部 completion 协议：不引入第二份错误状态；Story 投影需要一个受限的持久层查询。

## 6. 数据、接口、安全、迁移、回滚与发布

- **数据：** 在 singleton SystemConfig 增加 `storyAgentTimeoutSeconds` integer，迁移默认值 300，不新增错误数据表。
- **API：** GET `/api/v1/system/config` 返回超时值；PUT 支持单字段更新及既有默认模型更新。Story Generation DTO 的 `errorCode` 扩展为有限枚举加 null。HTTP/Web transport 的运行时 schema 同步更新。
- **安全：** 只公开稳定错误码；Provider body、异常 message、secret reference 和 Workflow `lastError` 均不进产品 DTO/页面。数据库错误查询按 runId 和 Story Activity 范围限制。
- **兼容：** additive 列默认 300；历史 Workflow 输入快照不变。没有分类的历史 terminal Run 仍展示 `generation_failed`。
- **回滚：** 旧应用不读取新列；保留已迁移列和设置值，不做破坏性回退。回滚代码后原 Story Workflow 仍使用旧 60 秒常量。
- **发布：** 新包版本和迁移部署不属于本 Task；交付只验证隔离数据库，不执行用户数据迁移或部署。

## 7. 预期同步文档

- 原始需求活跃分册（保持维护者原话）。
- 本 Proposal 与 Cosmos 总体架构中 SystemConfig/Agent budget/Job 错误投影的当前决定。
- 当前 Public Contract、Product API HTTP、HTTP Client 和 Web Client 实现规格。
- Task 42 walkthrough 记录合同、实施、验证、偏差、未运行项；实现通过后更新 `PROJECT-STATUS.md`。

## 8. 决策记录

- **2026-11-12，Otirik（维护者）：accepted。** 确认 Story Agent 专用范围、300 秒默认值、30–1800 秒有效范围、用户取消独立处理、七类稳定错误码及 Web 使用安全固定提示。接受在本切片落地设置持久化与错误分类投影。
