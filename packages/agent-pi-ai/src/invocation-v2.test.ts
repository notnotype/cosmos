import { ActionExecutionError, type AgentModelSnapshot } from "@cosmos/application";
import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage, ProviderStreamOptions } from "@mariozechner/pi-ai";

import { PiAiAgentInvocationV2Adapter, type PiAiSecretReader } from "./invocation-v2.js";

const input = {
    modelId: "configured-model-agent",
    messages: [
        { role: "system" as const, content: "Be concise." },
        { role: "user" as const, content: "Hello" },
    ],
    tools: [],
    budget: { maxDurationMs: 1_000, maxToolCalls: 0, maxOutputTokens: 4_096 },
    metadata: {},
};

const context = { idempotencyKey: "agent-v2-1", signal: new AbortController().signal };

function connection(overrides: Partial<AgentModelSnapshot> = {}): AgentModelSnapshot {
    return {
        modelId: "namespace/agent-model",
        providerId: "provider-agent",
        api: "openai-completions",
        baseUrl: "https://agent.example.invalid/v1",
        modelName: "Synthetic Agent Model",
        contextWindow: 8_192,
        maxOutputTokens: 1_024,
        secretRef: "secret:provider-agent",
        inputPricePerMillion: 2,
        outputPricePerMillion: 10,
        ...overrides,
    };
}

function response(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
    return {
        role: "assistant",
        content: [{ type: "text", text: "Hello back" }],
        api: "openai-completions",
        provider: "provider-agent",
        model: "namespace/agent-model",
        usage: {
            input: 4,
            output: 3,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 7,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
        ...overrides,
    };
}

function adapter(options: {
    resolved?: AgentModelSnapshot | null;
    resolve?: (modelId: string | null) => Promise<AgentModelSnapshot | null>;
    secret?: string | null;
    complete?: (model: never, context: never, options: ProviderStreamOptions) => Promise<AssistantMessage>;
}) {
    const complete = vi.fn(options.complete ?? (async () => response()));
    const secrets: PiAiSecretReader = { read: async () => (options.secret === undefined ? "sk-test" : options.secret) };
    return {
        complete,
        instance: new PiAiAgentInvocationV2Adapter({
            models: {
                resolve: options.resolve ?? (async () => (options.resolved === undefined ? connection() : options.resolved)),
            },
            secrets,
            client: { complete: complete as never },
        }),
    };
}

describe("PiAiAgentInvocationV2Adapter", () => {
    it("publishes all normalized token classes and rebuilds their total independently of the SDK total", async () => {
        const { instance } = adapter({
            complete: async () => response({ usage: {
                input: 11, output: 5, cacheRead: 7, cacheWrite: 3, totalTokens: 999,
                cost: { input: 99, output: 99, cacheRead: 99, cacheWrite: 99, total: 396 },
            } }),
        });
        const output = await instance.invoke(input, context);
        expect(output.usage).toEqual({
            inputTokens: 11, outputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 3, totalTokens: 26,
        });
    });

    it.each(["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const)(
        "rejects non-finite, negative, fractional or unsafe SDK %s counts",
        async (field) => {
            for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
                const usage = { ...response().usage, [field]: value };
                const { instance } = adapter({ complete: async () => response({ usage }) });
                await expect(instance.invoke(input, context)).rejects.toMatchObject({ code: "malformed_payload" });
            }
        },
    );

    it("rejects an unsafe sum even when every token class is individually safe", async () => {
        const { instance } = adapter({ complete: async () => response({ usage: {
            ...response().usage, input: Number.MAX_SAFE_INTEGER, output: 1, totalTokens: 1,
        } }) });
        await expect(instance.invoke(input, context)).rejects.toMatchObject({ code: "malformed_payload" });
    });

    it("calculates USD cost from usage and configured per-million prices", async () => {
        const { instance } = adapter({});
        await expect(instance.invoke(input, context)).resolves.toMatchObject({
            usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
            cost: { input: 0.000008, output: 0.00003, total: 0.000038, currency: "USD" },
        });
    });

    it("calculates four disjoint CNY costs from the configured snapshot instead of SDK costs", async () => {
        const { instance } = adapter({
            resolved: connection({ currency: "CNY", inputPricePerMillion: 2, outputPricePerMillion: 4,
                cacheWritePricePerMillion: 8, cacheReadPricePerMillion: 12 }),
            complete: async () => response({ usage: {
                input: 1_000_000, output: 500_000, cacheWrite: 250_000, cacheRead: 250_000, totalTokens: 2_000_000,
                cost: { input: 99, output: 99, cacheRead: 99, cacheWrite: 99, total: 396 },
            } }),
        });
        const output = await instance.invoke(input, context);
        expect(output.cost).toEqual({ input: 2, output: 2, cacheWrite: 2, cacheRead: 3, total: 9, currency: "CNY" });
    });

    it("omits the entire cost only when an unknown cache rate has nonzero usage", async () => {
        for (const cacheField of ["cacheRead", "cacheWrite"] as const) {
            const { instance } = adapter({ complete: async () => response({ usage: {
                ...response().usage, [cacheField]: 1,
            } }) });
            const output = await instance.invoke(input, context);
            expect(output).not.toHaveProperty("cost");
        }
        const { instance } = adapter({});
        expect((await instance.invoke(input, context)).cost).toEqual({
            input: 0.000008, output: 0.00003, cacheRead: 0, cacheWrite: 0, total: 0.000038, currency: "USD",
        });
    });

    it.each([
        { ordinaryInput: 271_000, outputTokens: 5, inputCost: 0.271, outputCost: 0.00001, readCost: 0.004, totalCost: 0.27501 },
        { ordinaryInput: 271_001, outputTokens: 5, inputCost: 2.71001, outputCost: 0.0001, readCost: 0.04, totalCost: 2.75011 },
        { ordinaryInput: 271_000, outputTokens: 1_000_000, inputCost: 0.271, outputCost: 2, readCost: 0.004, totalCost: 2.275 },
    ])("selects one tier from prompt input $ordinaryInput plus caches, independently of $outputTokens output tokens",
        async ({ ordinaryInput, outputTokens, inputCost, outputCost, readCost, totalCost }) => {
            const { instance } = adapter({
                resolved: connection({ inputPricePerMillion: 1, outputPricePerMillion: 2,
                    cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
                    tieredPricingEnabled: true, tieredPricingThreshold: 272_000,
                    highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
                    highCacheWritePricePerMillion: 30, highCacheReadPricePerMillion: 40 }),
                complete: async () => response({ usage: { ...response().usage,
                    input: ordinaryInput, output: outputTokens, cacheRead: 1_000, cacheWrite: 0, totalTokens: 1,
                } }),
            });
            const { cost } = await instance.invoke(input, context);
            expect(cost).toMatchObject({ cacheWrite: 0, currency: "USD" });
            expect(cost?.input).toBeCloseTo(inputCost, 12);
            expect(cost?.output).toBeCloseTo(outputCost, 12);
            expect(cost?.cacheRead).toBeCloseTo(readCost, 12);
            expect(cost?.total).toBeCloseTo(totalCost, 12);
        },
    );

    it("omits cost for invalid ordinary rates even when the affected token count is zero", async () => {
        for (const field of ["inputPricePerMillion", "outputPricePerMillion", "cacheReadPricePerMillion", "cacheWritePricePerMillion"] as const) {
            for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
                const { instance } = adapter({ resolved: connection({ [field]: value }) });
                expect(await instance.invoke(input, context)).not.toHaveProperty("cost");
            }
        }
    });

    it("requires a valid complete tier configuration even below its threshold", async () => {
        const tier = { tieredPricingEnabled: true, tieredPricingThreshold: 272_000,
            highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
            highCacheWritePricePerMillion: 30, highCacheReadPricePerMillion: 40 };
        const invalid: Partial<AgentModelSnapshot>[] = [
            ...[null, undefined, 0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
                .map((value) => ({ tieredPricingThreshold: value })),
        ];
        for (const field of ["highInputPricePerMillion", "highOutputPricePerMillion", "highCacheWritePricePerMillion", "highCacheReadPricePerMillion"] as const) {
            for (const value of [null, undefined, -1, Number.NaN, Infinity]) invalid.push({ [field]: value });
        }
        for (const overrides of invalid) {
            const { instance } = adapter({ resolved: connection({ ...tier, ...overrides }) });
            expect(await instance.invoke(input, context)).not.toHaveProperty("cost");
        }
    });

    it("keeps fully known zero prices and charges cache writes with the selected high tier", async () => {
        const settings = { tieredPricingEnabled: true, tieredPricingThreshold: 1,
            inputPricePerMillion: 0, outputPricePerMillion: 0, cacheReadPricePerMillion: 0, cacheWritePricePerMillion: 0,
            highInputPricePerMillion: 0, highOutputPricePerMillion: 0, highCacheReadPricePerMillion: 0, highCacheWritePricePerMillion: 0 };
        const usage = { ...response().usage, input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000, totalTokens: 1 };
        const free = adapter({ resolved: connection(settings), complete: async () => response({ usage }) });
        expect((await free.instance.invoke(input, context)).cost).toEqual({
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, currency: "USD",
        });
        const paid = adapter({ resolved: connection({ ...settings, highCacheWritePricePerMillion: 3 }),
            complete: async () => response({ usage }) });
        expect((await paid.instance.invoke(input, context)).cost).toEqual({
            input: 0, output: 0, cacheRead: 0, cacheWrite: 3, total: 3, currency: "USD",
        });
    });

    it("omits an overflowing monetary result instead of publishing a partial or invalid cost", async () => {
        const { instance } = adapter({ resolved: connection({ inputPricePerMillion: Number.MAX_VALUE }),
            complete: async () => response({ usage: { ...response().usage, input: Number.MAX_SAFE_INTEGER - 3 } }) });
        expect(await instance.invoke(input, context)).not.toHaveProperty("cost");
    });

    it("omits cost for unknown base rates even with zero usage and a fully priced high tier", async () => {
        for (const field of ["inputPricePerMillion", "outputPricePerMillion"] as const) {
            const { instance } = adapter({ resolved: connection({ [field]: null,
                cacheReadPricePerMillion: 0, cacheWritePricePerMillion: 0,
                tieredPricingEnabled: true, tieredPricingThreshold: 1,
                highInputPricePerMillion: 10, highOutputPricePerMillion: 20,
                highCacheReadPricePerMillion: 30, highCacheWritePricePerMillion: 40 }),
                complete: async () => response({ usage: { ...response().usage, input: 0, output: 0,
                    cacheRead: 2, cacheWrite: 0, totalTokens: 2 } }),
            });
            expect(await instance.invoke(input, context)).not.toHaveProperty("cost");
        }
    });

    it("builds the model from the resolved model instead of the call", async () => {
        const { instance, complete } = adapter({
            resolved: connection({ api: "openai-responses", modelId: "namespace/other" }),
        });

        await expect(instance.invoke(input, context)).resolves.toMatchObject({
            content: "Hello back",
            provider: "provider-agent",
            model: "namespace/other",
        });
        expect(complete.mock.calls[0]?.[0]).toMatchObject({
            id: "namespace/other",
            api: "openai-responses",
            baseUrl: "https://agent.example.invalid/v1",
        });
        expect(complete.mock.calls[0]?.[2]).toMatchObject({ apiKey: "sk-test" });
    });

    it("caps the output budget at the model limit but never raises it", async () => {
        const { instance, complete } = adapter({ resolved: connection({ maxOutputTokens: 256 }) });

        await instance.invoke(input, context);
        expect(complete.mock.calls[0]?.[2]).toMatchObject({ maxTokens: 256 });
    });

    it("refuses an unavailable connection or a missing credential without calling the provider", async () => {
        const unavailable = adapter({ resolved: null });
        await expect(unavailable.instance.invoke(input, context))
            .rejects.toMatchObject({ code: "authentication_required" });

        const noSecret = adapter({ secret: "   " });
        await expect(noSecret.instance.invoke(input, context))
            .rejects.toMatchObject({ code: "authentication_required" });

        expect(unavailable.complete).not.toHaveBeenCalled();
        expect(noSecret.complete).not.toHaveBeenCalled();
    });

    it("resolves the connection on every call so a switch takes effect immediately", async () => {
        let current = connection();
        const resolve = vi.fn(async () => current);
        const { instance } = adapter({ resolve });

        await instance.invoke(input, context);
        current = connection({ modelId: "namespace/switched" });
        await expect(instance.invoke(input, context)).resolves.toMatchObject({ model: "namespace/switched" });
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    it("maps a provider failure to a controlled error and honours cancellation", async () => {
        const failing = adapter({ complete: async () => { throw new Error("Provider returned 500"); } });
        await expect(failing.instance.invoke(input, context))
            .rejects.toBeInstanceOf(ActionExecutionError);

        const controller = new AbortController();
        controller.abort();
        const cancelled = adapter({});
        await expect(cancelled.instance.invoke(input, { ...context, signal: controller.signal }))
            .rejects.toMatchObject({ code: "cancelled" });
        expect(cancelled.complete).not.toHaveBeenCalled();
    });

    it("keeps the provider's rejection reason instead of calling it a malformed response", async () => {
        // pi-ai 把非 2xx 作为 `stopReason: "error"` 的普通响应返回；400 说明请求本身被拒，
        // 归类成 malformed_payload 会让诊断失去「是凭证、限流还是参数」的区别。
        const rejected = adapter({
            complete: async () => response({
                content: [], stopReason: "error", errorMessage: "400 Unsupported model: gpt-6-luna",
            }),
        });
        await expect(rejected.instance.invoke(input, context)).rejects.toMatchObject({
            code: "invalid_configuration", retryable: false,
        });

        const throttled = adapter({
            complete: async () => response({ content: [], stopReason: "error", errorMessage: "429 slow down" }),
        });
        await expect(throttled.instance.invoke(input, context)).rejects.toMatchObject({
            code: "rate_limited", retryable: true,
        });

        const unavailable = adapter({
            complete: async () => response({ content: [], stopReason: "error", errorMessage: "503 upstream" }),
        });
        await expect(unavailable.instance.invoke(input, context)).rejects.toMatchObject({
            code: "dependency_unavailable", retryable: true,
        });
    });
});
