import { describe, expect, it } from "vitest";

import {
    agentInvocationInputSchema,
    agentInvocationOutputSchema,
    agentInvocationV2InputSchema,
} from "./index.js";

const input = {
    provider: "fake",
    model: "test-model",
    messages: [{ role: "user" as const, content: "Summarize this." }],
    budget: {
        maxDurationMs: 5_000,
        maxToolCalls: 2,
        maxOutputTokens: 128,
    },
};

const output = {
    content: "A short result.",
    toolCalls: [],
    usage: {
        inputTokens: 4,
        outputTokens: 3,
        totalTokens: 7,
    },
    provider: "fake",
    model: "test-model",
    finishReason: "stop" as const,
};

describe("Agent Invocation contracts", () => {
    it("parses JSON-safe input and applies empty defaults", () => {
        expect(agentInvocationInputSchema.parse(input)).toEqual({
            ...input,
            tools: [],
            metadata: {},
        });
    });

    it("rejects non-JSON values in metadata and tool arguments", () => {
        expect(() => agentInvocationInputSchema.parse({
            ...input,
            metadata: { signal: new AbortController().signal },
        })).toThrow(/JSON-safe/);
        expect(() => agentInvocationOutputSchema.parse({
            ...output,
            toolCalls: [{ name: "lookup", arguments: new Uint8Array([1]) }],
        })).toThrow(/JSON-safe/);
    });

    it("requires positive budgets and bounded usage counters", () => {
        expect(() => agentInvocationInputSchema.parse({
            ...input,
            budget: { ...input.budget, maxDurationMs: 0 },
        })).toThrow();
        expect(() => agentInvocationOutputSchema.parse({
            ...output,
            usage: { ...output.usage, outputTokens: -1 },
        })).toThrow();
    });

    it("accepts optional costs and defaults their currency", () => {
        expect(agentInvocationOutputSchema.parse({
            ...output,
            cost: { input: 0.1, output: 0.2, total: 0.3 },
        })).toMatchObject({
            cost: { input: 0.1, output: 0.2, total: 0.3, currency: "USD" },
        });
        expect(agentInvocationOutputSchema.parse(output)).not.toHaveProperty("cost");
        expect(agentInvocationOutputSchema.safeParse({
            ...output,
            cost: { input: -0.1, output: 0, total: 0 },
        }).success).toBe(false);
    });

    it("accepts cache usage and four-part costs while retaining strict legacy JSON", () => {
        const legacy = agentInvocationOutputSchema.parse(output);
        expect(legacy.usage).toEqual(output.usage);
        expect(legacy.usage).not.toHaveProperty("cacheReadTokens");
        const current = {
            ...output,
            usage: { inputTokens: 11, outputTokens: 5, cacheWriteTokens: 3, cacheReadTokens: 7, totalTokens: 26 },
            cost: { input: 1, output: 2, cacheWrite: 0, cacheRead: 4, total: 7, currency: "CNY" },
        };
        expect(agentInvocationOutputSchema.parse(current)).toEqual({ ...current, metadata: {} });
        for (const usage of [
            { ...current.usage, cacheReadTokens: -1 },
            { ...current.usage, cacheWriteTokens: 0.5 },
            { ...current.usage, unrecognizedTokens: 1 },
        ]) expect(agentInvocationOutputSchema.safeParse({ ...current, usage }).success).toBe(false);
        expect(agentInvocationOutputSchema.safeParse({
            ...current, cost: { ...current.cost, cacheWrite: -1 },
        }).success).toBe(false);
    });

    it("keeps output provider metadata and finish reason explicit", () => {
        expect(agentInvocationOutputSchema.parse(output)).toEqual({
            ...output,
            metadata: {},
        });
        expect(() => agentInvocationOutputSchema.parse({
            ...output,
            finishReason: "unknown",
        })).toThrow();
    });
});

/** @2 callers may optionally select a configured model; otherwise the system default applies. */
describe("Agent Invocation v2 contracts", () => {
    const v2Input = {
        messages: [{ role: "user" as const, content: "Summarize this." }],
        tools: [],
        budget: { maxDurationMs: 5_000, maxToolCalls: 2, maxOutputTokens: 128 },
        metadata: { trace: "t1" },
    };

    it("accepts an optional model id and applies defaults", () => {
        expect(agentInvocationV2InputSchema.parse({
            ...v2Input,
            modelId: " model-1 ",
        })).toEqual({ ...v2Input, modelId: "model-1" });
        expect(agentInvocationV2InputSchema.parse({
            messages: v2Input.messages,
            budget: v2Input.budget,
        })).toEqual({
            messages: v2Input.messages,
            tools: [],
            budget: v2Input.budget,
            metadata: {},
        });
    });

    it("rejects connection id, provider and credential fields", () => {
        for (const extra of [{ connectionId: "connection-1" }, { provider: "fake" }, { model: "test-model" },
            { baseUrl: "https://example.invalid/v1" }, { apiKey: "sk-x" }, { secretRef: "secret:1" }]) {
            expect(() => agentInvocationV2InputSchema.parse({ ...v2Input, ...extra })).toThrow();
        }
    });
});
