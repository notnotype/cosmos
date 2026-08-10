# Cosmos Action 合同与注册：设计文档

> 日期：2026-08-10
>
> 状态：已批准（分节确认）
>
> 总体架构：[`docs/architecture/0001-cosmos-foundation.md`](../../architecture/0001-cosmos-foundation.md)
>
> Durable Workflow ADR：[`docs/adr/0001-durable-workflow-runtime.md`](../../adr/0001-durable-workflow-runtime.md)
>
> Workflow Runtime Task：[`docs/tasks/04-workflow-runtime/README.md`](../../tasks/04-workflow-runtime/README.md)

## 1. 背景与目标

主仓开发者在并行建设自动化四概念之一的 Workflow（`WorkflowDefinition`、`WorkflowRun`、`StepRun`、`Job`、`callAction`），Action 部分由本贡献者交付。两份工作并行，Action 侧必须先交付稳定的合同，Workflow 侧才能编写 `callAction(actionRef, …)`。

依据：`0001` §4.2 定义 `ActionDefinition` 为"能力合同，不是任务实例"，声明版本化的输入/输出 schema、Capability、幂等、超时、取消、重试和恢复语义；一次实际调用由 Workflow 创建 Run/Step 并落成可领取的 Job（`0001:224`）。ADR-0001:37、53 给出同样定义与"所有外部访问必须通过注册的 ActionDefinition/Connector"约束。

本次交付边界（已与用户确认）：

1. `ActionDefinition` 合同（schema 进 `packages/contracts`）；
2. `ActionRegistry` 与统一调用签名（进 `packages/application`）；
3. 适配器试点：把现有 `IngestConnector` 包装为 `{kind}.poll` 的 connector Action，作为合同的首个真实消费者；
4. focused 行为测试。

不交付（主仓开发者 Workflow Runtime 的边界）：Job/Workflow 执行路径、`callAction` 到 Job 的落成、API endpoint、manifest 解析、幂等/重试的实际执行逻辑。

## 2. 与现有代码的关系

- 现有 `IngestConnector` 接口（`packages/application/src/index.ts:177`）与 `ConnectorRegistry`（`packages/application/src/index.ts:239`）是 Phase 1B 简化运行时边界，按 `Source.kind` 解析单个 connector。
- 新 `ActionDefinition` 合同与 `ActionRegistry` 与现有形态**并存**，通过适配器包装复用现有 connector 实现；**不改动** `apps/worker`、`apps/api`、`apps/web`、`plugins/*` 与现有 Ingest/Probe Job 路径。
- 长期方向是 Action 合同统一；现有路径迁移到 Action 语义由主仓开发者 Workflow Runtime 落地时推进，不在本次范围。

## 3. 合同设计（`packages/contracts` 新增 `src/action.ts`）

### 3.1 ActionDefinition

```ts
export const actionKindSchema = z.enum([
    "connector", "transform", "library", "query", "control",
    "script", "agent", "artifact", "render", "delivery",
]);   // 十种类型，对应 0001 §4.2

export const actionRefSchema = z.string()
    .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);   // "{namespace}.{verb}"，如 rss.poll

export const actionDefinitionSchema = z.object({
    ref: actionRefSchema,                  // 唯一标识
    kind: actionKindSchema,                // 分类，不改变执行语义
    description: z.string(),
    version: z.string(),                   // 合同版本，架构示例用 "1"
    capabilities: z.array(z.string()),     // 能力声明，示例 "source:rss.read"
    inputSchema: z.lazy(() => z.unknown()),   // 版本化输入校验（ZodType，运行期可用）
    outputSchema: z.lazy(() => z.unknown()),  // 版本化输出校验
    execution: z.object({
        idempotent: z.boolean(),           // at-least-once → Action 必须声明幂等（0001:414）
        supportsCancellation: z.boolean(),
        timeoutMs: z.number().int().positive().nullable(),  // null = 未声明，调用方决定
        retryPolicy: z.object({
            maxAttempts: z.number().int().positive(),
            backoffMs: z.number().int().nonnegative(),
            retryableErrors: z.array(actionErrorCodeSchema).optional(),
        }).nullable(),                     // null = 由调用方决定重试
    }),
});

export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
```

### 3.2 错误码与可序列化描述

```ts
export const actionErrorCodeSchema = z.enum([
    // 复用现有 ConnectorErrorCode 的七种（从 application 包迁移到 contracts，避免重复定义）
    "dependency_unavailable", "authentication_required", "timeout",
    "rate_limited", "malformed_payload", "unsupported_version", "invalid_configuration",
    "invalid_input",        // 新增：输入校验失败（调用方错误，不重试）
    "unknown_action",       // 新增：Registry 解析不到 actionRef（调用方错误，不重试）
    "internal_error",       // 新增：未预期异常（不伪装可重试）
]);
export type ActionErrorCode = z.infer<typeof actionErrorCodeSchema>;

// 可序列化描述（API/健康检查用，不含 schema 对象，沿用 ConnectorDescriptor 模式）
export const actionDescriptorSchema = z.object({
    ref: actionRefSchema,
    kind: actionKindSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    idempotent: z.boolean(),
    supportsCancellation: z.boolean(),
    timeoutMs: z.number().int().positive().nullable(),
    retryPolicy: z.object({
        maxAttempts: z.number().int().positive(),
        backoffMs: z.number().int().nonnegative(),
        retryableErrors: z.array(actionErrorCodeSchema).optional(),
    }).nullable(),
});
export type ActionDescriptor = z.infer<typeof actionDescriptorSchema>;
```

设计点：

- `actionRef` 使用 `{namespace}.{verb}`，按架构示例 `rss.poll`、`http.fetch`、`agent.run`、`artifact.publish`（`0001:187`）。
- 输入/输出 schema 存 ZodType 对象：编译期与运行期双校验，Workflow 侧 `callAction` 可直接复用；可序列化 DTO 不含 schema 对象。
- `execution` 字段全部必填但允许"未声明"（`null`）：§4.2 明确列出的合同项不能省略；`IngestConnector` 未声明的能力用 `null`/显式值表达，不伪造。

## 4. 调用签名与注册（`packages/application` 新增 `src/action.ts`）

### 4.1 统一调用签名

```ts
export interface ActionExecutionContext {
    idempotencyKey: string;     // 调用方生成；未来由 Workflow Run/Step 派生
    signal?: AbortSignal;       // 取消信号，本期可选
}

export type ActionHandler = (
    input: unknown,             // 边界处 unknown 接收，由 inputSchema 校验
    context: ActionExecutionContext,
) => Promise<unknown>;          // 输出同样经 outputSchema 校验

export interface RegisteredAction {
    definition: ActionDefinition;
    handler: ActionHandler;
}
```

### 4.2 ActionRegistry

```ts
export class ActionRegistry {
    register(def: ActionDefinition, handler: ActionHandler): this;  // 重复 ref 抛错
    resolve(ref: string): RegisteredAction;                        // 未知 ref 抛 unknown_action
    call(ref: string, input: unknown, context: ActionExecutionContext): Promise<unknown>;
        // 内部：resolve → inputSchema.parse(input)（失败 → invalid_input）
        //      → handler → outputSchema.parse(output)（失败 → malformed_payload）→ 返回
    descriptors(): readonly ActionDescriptor[];
}
```

`call()` 是**进程内统一调用入口**（校验 + 调用 + 错误包装），不是执行路径：**不做 Job、lease、重试、持久化**。该边界写入本设计，Workflow Runtime 在 `callAction` 之上再落成 Job。

### 4.3 错误处理

```ts
export class ActionExecutionError extends Error {
    readonly code: ActionErrorCode;
    readonly retryable: boolean;
}
```

映射规则：

- `ConnectorExecutionError` → `ActionExecutionError`，保留 code/retryable；
- `invalid_input` 与 `unknown_action` 恒为 retryable=false（调用方错误）；
- 其余来源错误保留原 retryable；
- 未预期异常 → `internal_error`（retryable=false，不伪装可重试）。

## 5. 适配器试点：IngestConnectorActionAdapter

把现有 `IngestConnector` 包装为 `{kind}.poll` 的 connector Action：

| ActionDefinition 字段 | 适配器取值 | 依据 |
| --- | --- | --- |
| ref | `${connector.id}.poll`（如 `fixture-rss.poll`） | 架构命名 `namespace.verb` |
| kind | `connector` | 十种类型之一 |
| description | `connector.description` | 透传 |
| version | `connector.configVersion` | 现有版本号 |
| capabilities | 透传 `connector.capabilities` | 不新造 |
| inputSchema | `{ source: SourceSnapshot, cursor: string \| null }` | 对应 `fetchItems` 输入 |
| outputSchema | `{ items: NormalizedIngestItem[], nextCursor: string \| null }` | 对应 `fetchItems` 输出 |
| idempotent | `true` | 抓取本身只读，重复调用不产生重复领域写入 |
| supportsCancellation | `false` | IngestConnector 无取消能力，不伪造 |
| timeoutMs / retryPolicy | `null` | 未声明，调用方决定 |

handler 行为：先 `connector.validate(source)`（与现有 Ingest 路径一致，失败映射 `invalid_configuration`），再 `fetchItems`；错误按 4.3 映射。

## 6. 数据流与边界

- 组装：`ActionRegistry` 实例由测试（本期）与 Worker 装配处（未来，主仓开发者侧）创建；本期不改任何现有装配文件。
- 消费方：本期只有 focused tests 直接 `registry.call("rss.poll", …)`；该调用形态即 Workflow 侧将来调用方式的参考。
- 不交付（重复强调，作为验收边界）：Job/Workflow 执行路径、API endpoint、manifest 解析、幂等/重试的实际执行逻辑、现有路径迁移。

## 7. 测试计划

| 测试文件 | 覆盖 |
| --- | --- |
| `packages/contracts/src/action.test.ts` | actionRef 校验（合法 `rss.poll`/`agent.run`，非法：无点、大写、空）、十种 kind 枚举、execution 字段必填与 null 语义、descriptor 序列化不含 schema 对象 |
| `packages/application/src/action-registry.test.ts` | 注册成功、重复 ref 抛错、未知 ref 抛 `unknown_action`、`call` 输入校验失败 → `invalid_input`（retryable=false）、输出校验失败 → `malformed_payload`、`ActionExecutionError` 透传、descriptors 列表 |
| `packages/application/src/action-adapter.test.ts` | 用现有 fixture connector 注册为 `fixture-rss.poll` 并 `call` 返回 items；`validate` 失败 → `invalid_configuration`；`ConnectorExecutionError` → `ActionExecutionError` 保留 code/retryable |

## 8. 验收标准

- `bun run test`：现有 63 个测试保持通过 + 新增 focused 全绿；
- `bun run typecheck`、`bun run build:packages` 通过；
- 不改 `apps/worker`、`apps/api`、`apps/web`、`plugins/*`；现有 Ingest/Probe 路径零改动；
- 不运行：Docker、浏览器、真实来源验收（与本次变更无关）。

## 9. 与主仓开发者的衔接

- Workflow 侧依赖 `packages/contracts` 的 `actionDefinitionSchema` / `actionDescriptorSchema` 编写 `callAction(actionRef, input, options)`；
- `ActionRegistry.call` 的校验+调用+错误包装语义即 `callAction` 的进程内参考实现；
- Action 合同切片完成后，追加记录到 `docs/tasks/04-workflow-runtime/README.md` 变更记录，标注"由独立 PR 交付"（不新建碎片 Task）。

## 10. 决策记录

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 交付边界 | 合同 + 注册 + connector 适配器试点 | Workflow 并行建设，Action 侧先交付稳定合同；不建执行路径避免越界 |
| 与现有 IngestConnector 关系 | 通用合同 + 适配器试点，现有路径不动 | 改动隔离、风险最小；长期统一由 Workflow 落地时推进 |
| 存放位置 | schema 进 contracts，Registry/Handler/Error/Adapter 进 application | 贴合现有分层惯例；主仓开发者只依赖 contracts 即可并行 |
| 合同字段粒度 | 全字段（幂等/超时/取消/重试必填、允许 null） | §4.2 明确列出的合同项不能省略，避免 `callAction` 合同先定后改 |
| `ActionRegistry.call` | 本期提供进程内统一调用入口 | 校验+调用+错误包装的参考实现；Job 化留给 Workflow 侧 |
| Task 归属 | 追加 04 Task 变更记录 | 符合"同一功能持续更新原 Task"约定，不新建碎片 Task |
