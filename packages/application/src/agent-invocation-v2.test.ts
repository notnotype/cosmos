import { describe, expect, it, vi } from "vitest";

import {
    ActionRegistry,
    createAgentInvocationV2Action,
    getAgentInvocationV2Definition,
    type AgentInvocationV2Port,
} from "./index.js";

const input = {
    modelId: "configured-model-1",
    messages: [{ role: "user" as const, content: "Summarize this." }],
    tools: [],
    budget: { maxDurationMs: 5_000, maxToolCalls: 0, maxOutputTokens: 128 },
    metadata: {},
};

const output = {
    content: "A short result.",
    toolCalls: [],
    usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
    provider: "provider-a",
    model: "namespace/synthetic",
    finishReason: "stop" as const,
    metadata: {},
};

const context = { idempotencyKey: "agent-v2-1", signal: new AbortController().signal };

/**
 * `agent.invoke@2` 的边界：调用方可选给模型 ID，省略时由服务端使用系统默认。
 * 这里固定的是「多余字段必须被拒绝」——静默忽略会让调用方以为自己指定的模型生效了。
 */
describe("Agent Invocation Action v2", () => {
    it("exposes the connection-scoped trusted-worker definition", () => {
        expect(getAgentInvocationV2Definition()).toMatchObject({
            ref: "agent.invoke@2",
            kind: "agent",
            executionPlacement: "trusted_worker",
            capabilities: ["agent:invoke"],
        });
    });

    it("dispatches the port with the parsed model-scoped input", async () => {
        const invoke = vi.fn<AgentInvocationV2Port["invoke"]>(async () => output);
        const registry = new ActionRegistry([createAgentInvocationV2Action({ invoke })]);

        await expect(registry.dispatch("agent.invoke@2", input, context)).resolves.toEqual(output);
        expect(invoke).toHaveBeenCalledWith({ ...input, metadata: {} }, context);
    });

    it("rejects provider or model fields instead of ignoring them", async () => {
        const invoke = vi.fn<AgentInvocationV2Port["invoke"]>(async () => output);
        const registry = new ActionRegistry([createAgentInvocationV2Action({ invoke })]);

        await expect(registry.dispatch("agent.invoke@2", { ...input, model: "other/model" }, context))
            .rejects.toMatchObject({ code: "invalid_input" });
        expect(invoke).not.toHaveBeenCalled();
    });
});
