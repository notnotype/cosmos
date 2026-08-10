# Action 合同与注册 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 ActionDefinition 合同（contracts 包）、ActionRegistry 与统一调用签名（application 包），并把现有 IngestConnector 包装为 `{kind}.poll` connector Action 作为验证试点。

**Architecture:** 规格见 `docs/superpowers/specs/2026-08-10-action-contract-design.md`。合同 schema 进 `packages/contracts/src/action.ts`（与现有 zod schema 合同同层）；`ActionRegistry`/`ActionHandler`/`ActionExecutionError` 进 `packages/application/src/action.ts`，`IngestConnectorActionAdapter` 进 `packages/application/src/action-adapter.ts`。现有 Ingest/Probe Job 路径、`apps/*`、`plugins/*` 零改动；`ConnectorErrorCode` 迁移为 `ActionErrorCode` 的兼容别名。不建 Job/Workflow 执行路径。

**Tech Stack:** Bun + TypeScript（workspace），zod v4（contracts），vitest（根配置）。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `packages/contracts/src/action.ts`（新） | actionKindSchema、actionRefSchema、actionErrorCodeSchema、actionDefinitionSchema、actionDescriptorSchema 及类型 |
| `packages/contracts/src/index.ts`（修改） | 末尾 `export * from "./action.js"` |
| `packages/contracts/src/action.test.ts`（新） | 合同 schema 行为测试 |
| `packages/application/src/action.ts`（新） | ActionExecutionContext、ActionHandler、RegisteredAction、ActionExecutionError、ActionRegistry |
| `packages/application/src/action-adapter.ts`（新） | connectorPollInputSchema/OutputSchema、IngestConnectorActionAdapter |
| `packages/application/src/index.ts`（修改） | `ConnectorErrorCode` 改为 `ActionErrorCode` 兼容别名；末尾 re-export action 文件 |
| `packages/application/src/action-registry.test.ts`（新） | Registry 注册/解析/调用/错误测试 |
| `packages/application/src/action-adapter.test.ts`（新） | 适配器包装与错误映射测试 |

依赖方向（已核实）：`@cosmos/application → @cosmos/contracts、@cosmos/domain`；`@cosmos/plugin-rss → @cosmos/application`。因此 application 的测试**不得** import plugins（会成循环依赖），适配器测试用 stub connector。

---

## Task 0：准备 worktree 与分支

**Files:** 无

- [ ] **Step 1: 从本地 master 创建 worktree 与任务分支**

```bash
git fetch origin
git worktree add .worktree/action-contract -b feat/t04-action-contract master
cd .worktree/action-contract
bun install
```

Expected: worktree 创建成功，分支 `feat/t04-action-contract` 基于本地 master（含已提交的设计规格 3e41220）。

---

## Task 1：ActionDefinition 合同（contracts 包）

**Files:**
- Create: `packages/contracts/src/action.ts`
- Modify: `packages/contracts/src/index.ts`（末尾追加一行）
- Test: `packages/contracts/src/action.test.ts`

- [ ] **Step 1: 写 failing test**

Create `packages/contracts/src/action.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
    actionDefinitionSchema,
    actionDescriptorSchema,
    actionErrorCodeSchema,
    actionKindSchema,
    actionRefSchema,
} from "./index.js";

describe("action contracts", () => {
    it("accepts valid {namespace}.{verb} action refs", () => {
        for (const ref of ["rss.poll", "http.fetch", "agent.run", "artifact.publish"]) {
            expect(actionRefSchema.parse(ref)).toBe(ref);
        }
    });

    it("rejects malformed action refs", () => {
        for (const ref of ["rss", "Rss.poll", "rss.poll.extra", "rss..poll", "rss.pol l", "-rss.poll"]) {
            expect(() => actionRefSchema.parse(ref)).toThrow();
        }
    });

    it("covers the ten action kinds from the architecture", () => {
        expect(actionKindSchema.options).toEqual([
            "connector", "transform", "library", "query", "control",
            "script", "agent", "artifact", "render", "delivery",
        ]);
    });

    it("covers the connector error codes and the new registry errors", () => {
        expect(actionErrorCodeSchema.options).toEqual([
            "dependency_unavailable", "authentication_required", "timeout",
            "rate_limited", "malformed_payload", "unsupported_version",
            "invalid_configuration", "invalid_input", "unknown_action",
            "internal_error",
        ]);
    });

    it("accepts a full definition with declared execution contract", () => {
        const inputSchema = z.object({ cursor: z.string().nullable() });
        const outputSchema = z.object({ items: z.array(z.unknown()) });

        const definition = actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            inputSchema,
            outputSchema,
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        });

        expect(definition.execution).toEqual({
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });
    });

    it("accepts a declared retry policy with retryable error codes", () => {
        expect(actionDefinitionSchema.parse({
            ref: "http.fetch",
            kind: "connector",
            description: "Fetch a URL.",
            version: "v1",
            capabilities: ["network:http"],
            inputSchema: z.unknown(),
            outputSchema: z.unknown(),
            execution: {
                idempotent: false,
                supportsCancellation: true,
                timeoutMs: 30_000,
                retryPolicy: {
                    maxAttempts: 3,
                    backoffMs: 1_000,
                    retryableErrors: ["timeout", "rate_limited"],
                },
            },
        })).toMatchObject({ ref: "http.fetch" });
    });

    it("requires the execution contract fields", () => {
        expect(() => actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: [],
            inputSchema: z.unknown(),
            outputSchema: z.unknown(),
        })).toThrow();
    });

    it("rejects inputSchema values that are not zod schemas", () => {
        expect(() => actionDefinitionSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: [],
            inputSchema: { not: "a schema" },
            outputSchema: z.unknown(),
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        })).toThrow();
    });

    it("serializes a descriptor without schema objects", () => {
        const descriptor = actionDescriptorSchema.parse({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });

        expect(descriptor).toEqual({
            ref: "rss.poll",
            kind: "connector",
            description: "Poll an RSS source.",
            version: "v1",
            capabilities: ["source:rss.read"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bunx vitest run packages/contracts/src/action.test.ts`
Expected: FAIL——`Cannot find module './index.js'` 或 import 解析失败（`action.ts` 尚不存在）。

- [ ] **Step 3: 实现合同 schema**

Create `packages/contracts/src/action.ts`:

```ts
import { z, type ZodType } from "zod";

/** 十种 Action 类型，对应总体架构 0001 §4.2。 */
export const actionKindSchema = z.enum([
    "connector",
    "transform",
    "library",
    "query",
    "control",
    "script",
    "agent",
    "artifact",
    "render",
    "delivery",
]);
export type ActionKind = z.infer<typeof actionKindSchema>;

/** Action 唯一标识，"{namespace}.{verb}"，例如 rss.poll、agent.run。 */
export const actionRefSchema = z
    .string()
    .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
export type ActionRef = z.infer<typeof actionRefSchema>;

/** 执行错误码：复用 ConnectorErrorCode 七种并新增注册/校验错误。 */
export const actionErrorCodeSchema = z.enum([
    "dependency_unavailable",
    "authentication_required",
    "timeout",
    "rate_limited",
    "malformed_payload",
    "unsupported_version",
    "invalid_configuration",
    "invalid_input",
    "unknown_action",
    "internal_error",
]);
export type ActionErrorCode = z.infer<typeof actionErrorCodeSchema>;

/** 输入/输出 schema 必须是可调用的 zod schema（含 parse）。 */
const zodTypeSchema = z.custom<ZodType<unknown>>(
    (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { parse?: unknown }).parse === "function",
    { message: "expected a zod schema" },
);

/** ActionDefinition 是能力合同，不是任务实例（0001 §4.2）。 */
export const actionDefinitionSchema = z.object({
    ref: actionRefSchema,
    kind: actionKindSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    inputSchema: zodTypeSchema,
    outputSchema: zodTypeSchema,
    execution: z.object({
        idempotent: z.boolean(),
        supportsCancellation: z.boolean(),
        timeoutMs: z.number().int().positive().nullable(),
        retryPolicy: z
            .object({
                maxAttempts: z.number().int().positive(),
                backoffMs: z.number().int().nonnegative(),
                retryableErrors: z.array(actionErrorCodeSchema).optional(),
            })
            .nullable(),
    }),
});
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;

/** 可序列化描述（不含 schema 对象），沿用 ConnectorDescriptor 模式。 */
export const actionDescriptorSchema = z.object({
    ref: actionRefSchema,
    kind: actionKindSchema,
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    idempotent: z.boolean(),
    supportsCancellation: z.boolean(),
    timeoutMs: z.number().int().positive().nullable(),
    retryPolicy: z
        .object({
            maxAttempts: z.number().int().positive(),
            backoffMs: z.number().int().nonnegative(),
            retryableErrors: z.array(actionErrorCodeSchema).optional(),
        })
        .nullable(),
});
export type ActionDescriptor = z.infer<typeof actionDescriptorSchema>;
```

Modify `packages/contracts/src/index.ts`——在文件**末尾**追加：

```ts
export * from "./action.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bunx vitest run packages/contracts/src/action.test.ts`
Expected: PASS（10 个断言全部通过）。

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/action.ts packages/contracts/src/action.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add action definition contracts"
```

---

## Task 2：ActionRegistry 与统一调用签名（application 包）

**Files:**
- Create: `packages/application/src/action.ts`
- Modify: `packages/application/src/index.ts`（末尾 re-export）
- Test: `packages/application/src/action-registry.test.ts`

- [ ] **Step 1: 写 failing test**

Create `packages/application/src/action-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ActionDefinition } from "@cosmos/contracts";

import { ActionExecutionError, ActionRegistry } from "./index.js";

function definition(input: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        ref: "demo.echo",
        kind: "transform",
        description: "Echo input.",
        version: "v1",
        capabilities: [],
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ echoed: z.string() }),
        execution: {
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        },
        ...input,
    };
}

describe("ActionRegistry", () => {
    it("registers, resolves and lists actions", () => {
        const registry = new ActionRegistry();
        const def = definition();
        const handler = async () => ({ echoed: "hi" });

        registry.register(def, handler);

        expect(registry.resolve("demo.echo")).toEqual({ definition: def, handler });
        expect(registry.descriptors()).toEqual([{
            ref: "demo.echo",
            kind: "transform",
            description: "Echo input.",
            version: "v1",
            capabilities: [],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        }]);
    });

    it("rejects duplicate action refs", () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({}));

        expect(() => registry.register(definition(), async () => ({}))).toThrow(
            /Duplicate action ref/,
        );
    });

    it("throws unknown_action for an unregistered ref", () => {
        const registry = new ActionRegistry();

        expect(() => registry.resolve("missing.action")).toThrowError(
            new ActionExecutionError("unknown_action", "Unknown action ref: missing.action", false),
        );
    });

    it("validates input and returns the parsed output", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async (input) => ({ echoed: (input as { value: string }).value }));

        await expect(registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" }))
            .resolves.toEqual({ echoed: "ok" });
    });

    it("rejects invalid input with invalid_input and retryable=false", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({ echoed: "" }));

        const error = await registry.call("demo.echo", { value: 42 }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_input");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("rejects malformed output with malformed_payload", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => ({ unexpected: true }));

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("malformed_payload");
    });

    it("passes through ActionExecutionError thrown by the handler", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw new ActionExecutionError("rate_limited", "slow down", true);
        });

        await expect(registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" }))
            .rejects.toEqual(new ActionExecutionError("rate_limited", "slow down", true));
    });

    it("wraps unexpected handler errors as internal_error", async () => {
        const registry = new ActionRegistry();
        registry.register(definition(), async () => {
            throw new Error("boom");
        });

        const error = await registry.call("demo.echo", { value: "ok" }, { idempotencyKey: "k" })
            .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("internal_error");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bunx vitest run packages/application/src/action-registry.test.ts`
Expected: FAIL——import 解析失败（`./index.js` 尚无 ActionRegistry 导出）。

- [ ] **Step 3: 实现 ActionRegistry**

Create `packages/application/src/action.ts`:

```ts
import type {
    ActionDefinition,
    ActionDescriptor,
    ActionErrorCode,
} from "@cosmos/contracts";

/** 一次 Action 调用的执行上下文；idempotencyKey 由调用方生成。 */
export interface ActionExecutionContext {
    idempotencyKey: string;
    signal?: AbortSignal;
}

/** Action 实现签名：输入/输出在边界处校验，不做持久化或 Job 包装。 */
export type ActionHandler = (
    input: unknown,
    context: ActionExecutionContext,
) => Promise<unknown>;

export interface RegisteredAction {
    definition: ActionDefinition;
    handler: ActionHandler;
}

export class ActionExecutionError extends Error {
    constructor(
        readonly code: ActionErrorCode,
        message: string,
        readonly retryable = true,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = "ActionExecutionError";
    }
}

/**
 * 进程内 Action 注册与调用入口。
 *
 * call() 只做校验 + 调用 + 错误包装，不是执行路径：不做 Job、lease、
 * 重试或持久化。Job 化由 Workflow Runtime（04 Task）在 callAction 之上完成。
 */
export class ActionRegistry {
    private readonly actions = new Map<string, RegisteredAction>();

    constructor(actions: readonly RegisteredAction[] = []) {
        for (const action of actions) {
            this.register(action.definition, action.handler);
        }
    }

    register(definition: ActionDefinition, handler: ActionHandler): this {
        if (this.actions.has(definition.ref)) {
            throw new Error(`Duplicate action ref: ${definition.ref}`);
        }
        this.actions.set(definition.ref, { definition, handler });
        return this;
    }

    resolve(ref: string): RegisteredAction {
        const action = this.actions.get(ref);
        if (!action) {
            throw new ActionExecutionError(
                "unknown_action",
                `Unknown action ref: ${ref}`,
                false,
            );
        }
        return action;
    }

    async call(
        ref: string,
        input: unknown,
        context: ActionExecutionContext,
    ): Promise<unknown> {
        const { definition, handler } = this.resolve(ref);

        let parsedInput: unknown;
        try {
            parsedInput = definition.inputSchema.parse(input);
        } catch (cause) {
            throw new ActionExecutionError(
                "invalid_input",
                `Invalid input for action ${ref}`,
                false,
                { cause },
            );
        }

        let output: unknown;
        try {
            output = await handler(parsedInput, context);
        } catch (err) {
            if (err instanceof ActionExecutionError) {
                throw err;
            }
            throw new ActionExecutionError(
                "internal_error",
                `Action ${ref} failed`,
                false,
                { cause: err },
            );
        }

        try {
            return definition.outputSchema.parse(output);
        } catch (cause) {
            throw new ActionExecutionError(
                "malformed_payload",
                `Invalid output for action ${ref}`,
                false,
                { cause },
            );
        }
    }

    descriptors(): readonly ActionDescriptor[] {
        return [...this.actions.values()].map(({ definition }) => ({
            ref: definition.ref,
            kind: definition.kind,
            description: definition.description,
            version: definition.version,
            capabilities: [...definition.capabilities],
            idempotent: definition.execution.idempotent,
            supportsCancellation: definition.execution.supportsCancellation,
            timeoutMs: definition.execution.timeoutMs,
            retryPolicy: definition.execution.retryPolicy,
        }));
    }
}
```

Modify `packages/application/src/index.ts`——在文件**末尾**追加：

```ts
export * from "./action.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bunx vitest run packages/application/src/action-registry.test.ts`
Expected: PASS（8 个测试全部通过）。

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/action.ts packages/application/src/action-registry.test.ts packages/application/src/index.ts
git commit -m "feat(application): add action registry and execution contract"
```

---

## Task 3：ConnectorErrorCode 迁移为 ActionErrorCode 兼容别名

**Files:**
- Modify: `packages/application/src/index.ts:200-207`（删除本地 union，替换为别名）
- Test: 现有 `packages/application/src/index.test.ts`（保持通过，无新增测试）

- [ ] **Step 1: 迁移错误码定义**

在 `packages/application/src/index.ts`：

1. 文件顶部 import 区（`@cosmos/contracts` 的 import 块内）增加：

```ts
    type ActionErrorCode,
```

2. 删除第 200-207 行的本地 union 定义：

```ts
export type ConnectorErrorCode =
    | "dependency_unavailable"
    | "authentication_required"
    | "timeout"
    | "rate_limited"
    | "malformed_payload"
    | "unsupported_version"
    | "invalid_configuration";
```

3. 在相同位置替换为兼容别名：

```ts
/** Connector 错误码已并入 Action 错误合同；保留别名避免破坏现有调用方。 */
export type ConnectorErrorCode = ActionErrorCode;
```

`ConnectorExecutionError` 及其余代码**不改**（`code: ConnectorErrorCode` 现在解析到别名，旧七种码全部在 `ActionErrorCode` 内）。

- [ ] **Step 2: 运行现有测试确认无回归**

Run: `bunx vitest run packages/application/src/index.test.ts`
Expected: PASS（行为无变化，类型变宽）。

- [ ] **Step 3: 类型检查确认别名兼容**

Run: `bunx tsc --noEmit -p packages/application`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/index.ts
git commit -m "refactor(application): migrate connector error codes to action contract"
```

---

## Task 4：IngestConnectorActionAdapter 适配器试点

**Files:**
- Create: `packages/application/src/action-adapter.ts`
- Modify: `packages/application/src/index.ts`（末尾追加 re-export）
- Test: `packages/application/src/action-adapter.test.ts`

- [ ] **Step 1: 写 failing test**

Create `packages/application/src/action-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SourceSnapshot } from "@cosmos/contracts";

import {
    ActionExecutionError,
    ActionRegistry,
    ConnectorExecutionError,
    IngestConnectorActionAdapter,
    type IngestConnector,
} from "./index.js";

function source(input: Partial<SourceSnapshot> = {}): SourceSnapshot {
    return {
        id: "source-1",
        name: "Fixture RSS",
        kind: "fixture-rss",
        config: {},
        enabled: true,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        lastRunAt: null,
        lastError: null,
        ...input,
    };
}

function item(externalId: string) {
    return {
        externalId,
        title: "Title",
        summary: null,
        contentText: "Content",
        webUrl: null,
        kind: "post" as const,
        publisher: null,
        metrics: null,
        publishedAt: null,
        sourceLocator: { provider: "fixture", id: externalId },
        rawPayload: "{}",
        assets: [],
    };
}

function stubConnector(overrides: Partial<IngestConnector> = {}): IngestConnector {
    return {
        id: "fixture-rss",
        description: "Replay a local RSS fixture deterministically.",
        configVersion: "v1",
        capabilities: ["fixture", "rss"],
        validate: () => undefined,
        async fetchItems(input) {
            return input.cursor === null
                ? { items: [item("a"), item("b")], nextCursor: "next" }
                : { items: [], nextCursor: null };
        },
        ...overrides,
    };
}

describe("IngestConnectorActionAdapter", () => {
    it("registers the connector as a connector-kind {id}.poll action", () => {
        const adapter = new IngestConnectorActionAdapter(stubConnector());

        expect(adapter.definition()).toMatchObject({
            ref: "fixture-rss.poll",
            kind: "connector",
            description: "Replay a local RSS fixture deterministically.",
            version: "v1",
            capabilities: ["fixture", "rss"],
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        });
    });

    it("calls fetchItems through the registry and returns normalized items", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const output = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-1" },
        );

        expect(output).toEqual({
            items: [item("a"), item("b")],
            nextCursor: "next",
        });
    });

    it("passes the cursor through for paged polling", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const output = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: "next" },
            { idempotencyKey: "run-2" },
        );

        expect(output).toEqual({ items: [], nextCursor: null });
    });

    it("rejects a missing source with invalid_input", async () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { cursor: null },
            { idempotencyKey: "run-3" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_input");
    });

    it("maps connector validation failures to invalid_configuration", async () => {
        const connector = stubConnector({
            validate() {
                throw new ConnectorExecutionError(
                    "invalid_configuration",
                    "bad config",
                    false,
                );
            },
        });
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(connector);
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-4" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("invalid_configuration");
        expect((error as ActionExecutionError).retryable).toBe(false);
    });

    it("maps connector execution errors preserving code and retryable", async () => {
        const connector = stubConnector({
            async fetchItems() {
                throw new ConnectorExecutionError("rate_limited", "slow down", true);
            },
        });
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(connector);
        registry.register(adapter.definition(), adapter.handler());

        const error = await registry.call(
            "fixture-rss.poll",
            { source: source(), cursor: null },
            { idempotencyKey: "run-5" },
        ).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(ActionExecutionError);
        expect((error as ActionExecutionError).code).toBe("rate_limited");
        expect((error as ActionExecutionError).retryable).toBe(true);
    });

    it("describes the registered action through the registry", () => {
        const registry = new ActionRegistry();
        const adapter = new IngestConnectorActionAdapter(stubConnector());
        registry.register(adapter.definition(), adapter.handler());

        expect(registry.descriptors()).toEqual([{
            ref: "fixture-rss.poll",
            kind: "connector",
            description: "Replay a local RSS fixture deterministically.",
            version: "v1",
            capabilities: ["fixture", "rss"],
            idempotent: true,
            supportsCancellation: false,
            timeoutMs: null,
            retryPolicy: null,
        }]);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bunx vitest run packages/application/src/action-adapter.test.ts`
Expected: FAIL——`IngestConnectorActionAdapter` 不存在。

- [ ] **Step 3: 实现适配器**

Create `packages/application/src/action-adapter.ts`:

```ts
import { z } from "zod";

import { sourceSnapshotSchema, type ActionDefinition } from "@cosmos/contracts";

import {
    ActionExecutionError,
    type ActionExecutionContext,
    type ActionHandler,
} from "./action.js";
import {
    ConnectorExecutionError,
    type IngestConnector,
} from "./index.js";

/** connector Action 的输入：一个已配置的 SourceSnapshot 与可选游标。 */
export const connectorPollInputSchema = z.object({
    source: sourceSnapshotSchema,
    cursor: z.string().nullable(),
});
export type ConnectorPollInput = z.infer<typeof connectorPollInputSchema>;

/**
 * connector Action 的输出。
 *
 * items 使用宽松结构：NormalizedIngestItem 目前是 @cosmos/domain 的
 * TypeScript interface（无 zod schema），结构校验由 Ingest Command 层负责。
 */
export const connectorPollOutputSchema = z.object({
    items: z.array(z.unknown()),
    nextCursor: z.string().nullable(),
});
export type ConnectorPollOutput = z.infer<typeof connectorPollOutputSchema>;

/**
 * 把现有 IngestConnector 包装为 "{id}.poll" 的 connector Action。
 *
 * 适配器只做包装，不改动现有 Ingest/Probe Job 路径；connector 本身不
 * 直接写数据库（Phase 1B 运行时边界）。
 */
export class IngestConnectorActionAdapter {
    constructor(private readonly connector: IngestConnector) {}

    definition(): ActionDefinition {
        return {
            ref: `${this.connector.id}.poll`,
            kind: "connector",
            description: this.connector.description,
            version: this.connector.configVersion,
            capabilities: [...this.connector.capabilities],
            inputSchema: connectorPollInputSchema,
            outputSchema: connectorPollOutputSchema,
            execution: {
                idempotent: true,
                supportsCancellation: false,
                timeoutMs: null,
                retryPolicy: null,
            },
        };
    }

    handler(): ActionHandler {
        return async (input: unknown, _context: ActionExecutionContext) => {
            const { source, cursor } = connectorPollInputSchema.parse(input);
            this.connector.validate(source);
            try {
                const result = await this.connector.fetchItems({ source, cursor });
                return { items: result.items, nextCursor: result.nextCursor };
            } catch (err) {
                if (err instanceof ConnectorExecutionError) {
                    throw new ActionExecutionError(
                        err.code,
                        err.message,
                        err.retryable,
                        { cause: err },
                    );
                }
                throw new ActionExecutionError(
                    "internal_error",
                    `Connector action ${this.connector.id}.poll failed`,
                    false,
                    { cause: err },
                );
            }
        };
    }
}
```

Modify `packages/application/src/index.ts`——在文件**末尾**（`export * from "./action.js"` 之后）追加：

```ts
export * from "./action-adapter.js";
```

注意：`action-adapter.ts` 从 `./index.js` 运行时导入 `ConnectorExecutionError` 并延迟到 handler 调用时使用；`index.ts` 顶部完成定义后末尾才 re-export，因此循环引用在加载期安全（ESM 延迟绑定）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bunx vitest run packages/application/src/action-adapter.test.ts`
Expected: PASS（7 个测试全部通过）。

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/action-adapter.ts packages/application/src/action-adapter.test.ts packages/application/src/index.ts
git commit -m "feat(application): adapt ingest connectors as connector actions"
```

---

## Task 5：全量验证与收尾

**Files:** 无（只运行命令）

- [ ] **Step 1: 全量测试**

Run: `bun run test`
Expected: 现有 63 个测试 + 新增 focused 测试全部 PASS（预计 88 个左右：新增 contracts 10 个断言、registry 8 个、adapter 7 个测试）。

- [ ] **Step 2: 类型检查**

Run: `bun run typecheck`
Expected: 无错误。

- [ ] **Step 3: 包构建**

Run: `bun run build:packages`
Expected: contracts、application 等全部构建成功。

- [ ] **Step 4: 仓库卫生检查**

Run: `git diff --check && git status --short`
Expected: 无空白错误；仅任务范围内文件有改动。

- [ ] **Step 5: 更新 Task 变更记录**

Modify `docs/tasks/04-workflow-runtime/README.md` 的 2026-08-10 变更记录条目，把"Action 合同切片完成（由独立 PR 交付）"更新为注明已实现的文件与测试数量（精确数字以实际运行结果为准）。

- [ ] **Step 6: Commit**

```bash
git add docs/tasks/04-workflow-runtime/README.md
git commit -m "docs(t04): mark action contract slice implemented"
```

---

## 自检记录

- **规格覆盖**：§3 合同 → Task 1；§4 调用签名/Registry/错误 → Task 2；§4.3 错误映射 → Task 2 测试 + Task 4 测试；§5 适配器 → Task 4；§6 边界 → 各 Task 实现均不触碰 `apps/*`、`plugins/*`；§7 测试计划 → Task 1/2/4；§8 验收 → Task 5；§9 衔接 → Task 5 变更记录。无缺口。
- **占位符扫描**：无 TODO/“适当处理”类占位；每个代码步骤含完整代码与命令。
- **类型一致性**：`ActionDefinition.ref`、`ActionExecutionError.code`、`connectorPollInputSchema/OutputSchema` 在 Task 1-4 中命名一致；`descriptors()` 输出与 `actionDescriptorSchema` 字段一一对应。
- **实现时注意**：Task 3 的 `ActionErrorCode` 需加入 `packages/application/src/index.ts` 顶部 `@cosmos/contracts` 类型 import 块；zod v4 的 `z.custom` 与 `z.enum().options` 若与本地版本行为不符，以本地 zod 版本实际 API 为准并保持测试断言不变。
