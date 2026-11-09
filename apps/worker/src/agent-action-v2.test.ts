import { ActionRegistry, type AgentModelSnapshot, type SecretStorePort } from "@cosmos/application";
import type { PiAiClient } from "@cosmos/agent-pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createWorkerAgentInvocationV2Action } from "./agent-action-v2.js";

const input = {
    modelId: "configured-model-id",
    messages: [{ role: "user" as const, content: "Say hello in one word." }],
    tools: [],
    budget: { maxDurationMs: 30_000, maxToolCalls: 0, maxOutputTokens: 64 },
    metadata: {},
};

const context = { idempotencyKey: "agent-v2-smoke", signal: new AbortController().signal };

const model: AgentModelSnapshot = {
    modelId: "namespace/model",
    modelName: "Synthetic Model",
    providerId: "provider-1",
    api: "openai-completions",
    baseUrl: "https://api.example.invalid/v1",
    contextWindow: 4_096,
    maxOutputTokens: 256,
    secretRef: "opaque-secret-ref",
    inputPricePerMillion: null,
    outputPricePerMillion: null,
};

function client(complete: PiAiClient["complete"]): PiAiClient {
    return { getModel: () => ({}) as never, complete };
}

/** 只实现读取；写入路径不在这条 Action 里，测试不需要可用的 put/delete。 */
function secrets(read: SecretStorePort["read"]): SecretStorePort {
    return {
        read,
        put: async () => { throw new Error("not used"); },
        delete: async () => { throw new Error("not used"); },
    };
}

function response(): Awaited<ReturnType<PiAiClient["complete"]>> {
    return {
        role: "assistant",
        content: [{ type: "text", text: "Hello." }],
        api: "openai-completions",
        provider: "provider-1",
        model: "namespace/model",
        usage: {
            input: 10,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 12,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
    };
}

/**
 * Worker 侧的 @2 装配：Action 必须始终可注册（没有启动期 Agent 配置），凭证只在
 * 调用真的要用它时才读——否则一个没配 Provider 的 Worker 会在启动时就失败。
 */
describe("worker agent.invoke@2 action", () => {
    it("registers even when the worker has no agent configuration", () => {
        const action = createWorkerAgentInvocationV2Action({
            models: { resolve: async () => null },
            secrets: secrets(async () => null),
        });

        expect(action.definition.ref).toBe("agent.invoke@2");
    });

    it("reads the credential by reference and invokes the model", async () => {
        const read = vi.fn(async () => "sk-test");
        const complete = vi.fn<PiAiClient["complete"]>(async () => response());
        const registry = new ActionRegistry([createWorkerAgentInvocationV2Action({
            models: { resolve: async () => model },
            secrets: secrets(read),
            client: client(complete),
        })]);

        await expect(registry.dispatch("agent.invoke@2", input, context)).resolves.toMatchObject({
            content: "Hello.",
            provider: "provider-1",
            model: "namespace/model",
        });
        expect(read).toHaveBeenCalledWith("opaque-secret-ref");
        expect(complete.mock.calls[0]?.[2]).toMatchObject({ apiKey: "sk-test" });
    });

    it("maps a credential read failure to authentication_required instead of leaking storage errors", async () => {
        const complete = vi.fn<PiAiClient["complete"]>(async () => response());
        const registry = new ActionRegistry([createWorkerAgentInvocationV2Action({
            models: { resolve: async () => model },
            secrets: secrets(async () => { throw new Error("EACCES: secret file unreadable"); }),
            client: client(complete),
        })]);

        await expect(registry.dispatch("agent.invoke@2", input, context))
            .rejects.toMatchObject({ code: "authentication_required" });
        expect(complete).not.toHaveBeenCalled();
    });
});
