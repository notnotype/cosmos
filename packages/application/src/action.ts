import type {
    ActionDefinition,
    ActionDescriptor,
    ActionErrorCode,
} from "@cosmos/contracts";

import { ConnectorExecutionError } from "./index.js";

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
 *
 * 错误映射：ActionExecutionError 原样透传；application 层已知的
 * ConnectorExecutionError 统一映射为 ActionExecutionError（保留 code 与
 * retryable）；其它异常包装为 internal_error。
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
