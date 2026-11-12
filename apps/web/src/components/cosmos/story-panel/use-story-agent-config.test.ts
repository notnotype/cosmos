import type { SystemConfigDto } from "@cosmos/contracts";
import { describe, expect, it } from "vitest";

import { getStoryAgentConfigState } from "./use-story-agent-config";

const model = {
    id: "model-1",
    providerId: "provider-1",
    modelId: "model-name",
    name: "Test model",
    contextWindow: 8192,
    maxOutputTokens: 1024,
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    cacheWritePricePerMillion: 0,
    cacheReadPricePerMillion: 0,
    currency: "USD" as const,
    tieredPricingEnabled: false,
    tieredPricingThreshold: null,
    highInputPricePerMillion: null,
    highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null,
    highCacheReadPricePerMillion: null,
    version: 1,
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
};

const config = (defaultModelId: string | null, defaultModel: typeof model | null): SystemConfigDto => ({
    defaultModelId,
    defaultModel,
    storyAgentTimeoutSeconds: 300,
});

describe("story agent default model state", () => {
    it("distinguishes an unconfigured default from a dangling model reference", () => {
        expect(getStoryAgentConfigState({ config: config(null, null), loading: false, failed: false })).toBe("unconfigured");
        expect(getStoryAgentConfigState({ config: config("deleted-model", null), loading: false, failed: false })).toBe("unavailable");
    });

    it("only allows generation when the configured model matches the saved id", () => {
        expect(getStoryAgentConfigState({ config: config("model-1", model), loading: false, failed: false })).toBe("ready");
        expect(getStoryAgentConfigState({ config: config("model-2", model), loading: false, failed: false })).toBe("unavailable");
    });

    it("keeps loading and failed reads separate from missing configuration", () => {
        expect(getStoryAgentConfigState({ config: null, loading: true, failed: false })).toBe("loading");
        expect(getStoryAgentConfigState({ config: null, loading: false, failed: true })).toBe("failed");
    });
});
