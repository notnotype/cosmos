import { describe, expect, it, vi } from "vitest";
import { CosmosTransportError } from "@cosmos/transport-http";
import type { ConfiguredModelSnapshot, ModelProviderSnapshot } from "@cosmos/contracts";

import { defaultModelErrorMessage, loadDefaultModelSettings, type ModelSettingsClient } from "./default-model-settings";

const date = "2026-11-10T00:00:00.000Z";
const provider: ModelProviderSnapshot = {
    id: "provider-one", name: "Provider One", api: "openai-completions", baseUrl: "https://example.com/v1",
    state: "active", credentialState: "configured", version: 1, createdAt: date, updatedAt: date,
};
const model: ConfiguredModelSnapshot = {
    id: "model-one", providerId: provider.id, modelId: "upstream-model", name: "Model One",
    contextWindow: 128000, maxOutputTokens: 4096, inputPricePerMillion: 0, outputPricePerMillion: 2,
    version: 2, createdAt: date, updatedAt: date,
};

function client(overrides: Partial<ModelSettingsClient> = {}): ModelSettingsClient {
    return {
        getSystemConfig: async () => ({ defaultModelId: model.id, defaultModel: model }),
        updateSystemConfig: async (input) => input,
        listModelProviders: async () => ({ items: [provider], nextCursor: null }),
        listConfiguredModels: async () => ({ items: [model], nextCursor: null }),
        ...overrides,
    };
}

describe("default model settings data", () => {
    it("loads current details including zero pricing and version metadata", async () => {
        const result = await loadDefaultModelSettings(client());
        expect(result.config).toEqual({ defaultModelId: model.id, defaultModel: model });
        expect(result.options).toEqual([{ model, provider }]);
    });

    it("follows provider pages and excludes providers being deleted", async () => {
        const listModelProviders = vi.fn().mockResolvedValueOnce({
            items: [{ ...provider, id: "deleting", state: "deleting" }], nextCursor: "page-two",
        }).mockResolvedValueOnce({ items: [provider], nextCursor: null });
        const listConfiguredModels = vi.fn(async () => ({ items: [model], nextCursor: null }));
        const result = await loadDefaultModelSettings(client({ listModelProviders, listConfiguredModels }));
        expect(listModelProviders).toHaveBeenNthCalledWith(2, { cursor: "page-two" });
        expect(listConfiguredModels).toHaveBeenCalledExactlyOnceWith(provider.id);
        expect(result.options).toHaveLength(1);
    });

    it("preserves missing model IDs so deleted defaults can be explained and cleared", async () => {
        const result = await loadDefaultModelSettings(client({
            getSystemConfig: async () => ({ defaultModelId: "deleted", defaultModel: null }),
        }));
        expect(result.config).toEqual({ defaultModelId: "deleted", defaultModel: null });
    });

    it("does not turn a failed provider model load into an empty success", async () => {
        await expect(loadDefaultModelSettings(client({ listConfiguredModels: async () => {
            throw new Error("offline");
        } }))).rejects.toThrow("offline");
    });
});

describe("default model errors", () => {
    it.each([
        [404, "模型已不存在"], [409, "服务商"], [503, "暂时不可用"],
    ])("explains HTTP %s without exposing raw server text", (status, expected) => {
        const message = defaultModelErrorMessage(new CosmosTransportError(status, { message: "private internal details" }));
        expect(message).toContain(expected);
        expect(message).not.toContain("private internal details");
    });

    it("has a safe fallback for network failures", () => {
        expect(defaultModelErrorMessage(new Error("network"))).toContain("重试");
    });
});
