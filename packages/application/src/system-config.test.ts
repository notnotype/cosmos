import { describe, expect, it, vi } from "vitest";
import { SystemConfigService } from "./index.js";
import type { ConfiguredModelSnapshot } from "@cosmos/contracts";

const model: ConfiguredModelSnapshot = {
    id: "model-1", providerId: "provider-a", modelId: "gpt-4", name: "GPT-4",
    contextWindow: 128000, maxOutputTokens: 4096, version: 1,
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
    inputPricePerMillion: 30, outputPricePerMillion: 60,
    currency: "USD", tieredPricingEnabled: false, tieredPricingThreshold: null,
    highInputPricePerMillion: null, highOutputPricePerMillion: null,
    highCacheWritePricePerMillion: null, highCacheReadPricePerMillion: null,
};

function serviceWith(initialModelId: string | null = null) {
    let modelId = initialModelId;
    let timeoutSeconds = 300;
    const getModelSelection = vi.fn(async (id: string): Promise<{ model: ConfiguredModelSnapshot; providerState: string | null } | null> =>
        ({ model: { ...model, id }, providerState: "active" }));
    const setDefaultModelId = vi.fn(async (value: string | null) => { modelId = value; });
    const repository = {
        getStoryAgentTimeoutSeconds: vi.fn(async () => 300),
        updateConfig: vi.fn(async (command, validate) => {
            if (command.defaultModelId !== undefined && command.defaultModelId !== null) validate(await getModelSelection(command.defaultModelId));
            if (command.storyAgentTimeoutSeconds !== undefined) timeoutSeconds = command.storyAgentTimeoutSeconds;
            if (command.defaultModelId !== undefined) await setDefaultModelId(command.defaultModelId);
        }),
        getDefaultModelId: vi.fn(async () => modelId),
        setDefaultModelId,
        getSystemConfigWithModel: vi.fn(async () => ({ defaultModelId: modelId,
            defaultModel: modelId === null ? null : { ...model, id: modelId }, storyAgentTimeoutSeconds: timeoutSeconds })),
        getModelSelection,
        setDefaultModelWithValidation: vi.fn(async (id: string, validate: (selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null) => void) => {
            validate(await getModelSelection(id));
            await setDefaultModelId(id);
        }),
    };
    return { service: new SystemConfigService(repository), repository };
}

describe("SystemConfigService", () => {
    it("reads the complete configuration with prices", async () => {
        const { service } = serviceWith("model-1");
        await expect(service.getConfig()).resolves.toEqual({ defaultModelId: "model-1", defaultModel: model, storyAgentTimeoutSeconds: 300 });
        await expect(service.getSystemConfigWithModel()).resolves.toEqual({ defaultModelId: "model-1", defaultModel: model, storyAgentTimeoutSeconds: 300 });
    });

    it("updates only the requested timeout field", async () => {
        const { service, repository } = serviceWith("model-1");
        await expect(service.getStoryAgentTimeoutSeconds()).resolves.toBe(300);
        await service.updateConfig({ storyAgentTimeoutSeconds: 900 });
        expect(repository.updateConfig).toHaveBeenCalledWith({ storyAgentTimeoutSeconds: 900 }, expect.any(Function));
        await expect(service.updateConfig({ storyAgentTimeoutSeconds: 29 })).rejects.toMatchObject({ code: "invalid_input" });
        expect(repository.updateConfig).toHaveBeenCalledOnce();
    });
    it("sets a valid active model through the new service method", async () => {
        const { service, repository } = serviceWith();
        await service.setDefaultModel("model-1");
        expect(repository.getModelSelection).toHaveBeenCalledWith("model-1");
        expect(repository.setDefaultModelId).toHaveBeenCalledWith("model-1");
    });

    it.each(["model-missing", "model-deleted"])("rejects absent or deleted model %s without writing", async (id) => {
        const { service, repository } = serviceWith("model-1");
        repository.getModelSelection.mockResolvedValueOnce(null);
        await expect(service.setDefaultModelId(id)).rejects.toMatchObject({ code: "invalid_model_selection", reason: "not_found" });
        expect(repository.setDefaultModelId).not.toHaveBeenCalled();
    });

    it.each([null, "deleting", "inactive"])("rejects missing or non-active Provider %s", async (providerState) => {
        const { service, repository } = serviceWith();
        repository.getModelSelection.mockResolvedValueOnce({ model, providerState });
        await expect(service.setDefaultModelId("model-1")).rejects.toMatchObject({ code: "invalid_model_selection", reason: "inactive_provider" });
        expect(repository.setDefaultModelId).not.toHaveBeenCalled();
    });

    it("clears a stale default without looking up the model", async () => {
        const { service, repository } = serviceWith("deleted-model");
        await service.setDefaultModel(null);
        expect(repository.getModelSelection).not.toHaveBeenCalled();
        expect(repository.setDefaultModelId).toHaveBeenCalledWith(null);
    });

    it("does not persist selection after a dependency lookup failure", async () => {
        const { service, repository } = serviceWith();
        repository.getModelSelection.mockRejectedValueOnce(new Error("database unavailable"));
        await expect(service.setDefaultModelId("model-1")).rejects.toThrow("database unavailable");
        expect(repository.setDefaultModelId).not.toHaveBeenCalled();
    });

    it.each(["model-1", null])("reads the current default model %s", async (modelId) => {
        const { service } = serviceWith(modelId);
        await expect(service.getDefaultModelId()).resolves.toBe(modelId);
    });

    it("sets and clears the default model", async () => {
        const { service, repository } = serviceWith();
        await service.setDefaultModelId("model-2");
        await expect(service.getDefaultModelId()).resolves.toBe("model-2");
        await service.setDefaultModelId(null);
        await expect(service.getDefaultModelId()).resolves.toBeNull();
        expect(repository.setDefaultModelId.mock.calls).toEqual([["model-2"], [null]]);
    });

    it.each(["", "   ", "x".repeat(201)])("rejects invalid model IDs without writing", async (modelId) => {
        const { service, repository } = serviceWith("model-1");
        await expect(service.setDefaultModelId(modelId)).rejects.toMatchObject({ code: "invalid_input" });
        expect(repository.setDefaultModelId).not.toHaveBeenCalled();
        await expect(service.getDefaultModelId()).resolves.toBe("model-1");
    });

    it("accepts an ID at the length limit", async () => {
        const { service } = serviceWith();
        const modelId = "x".repeat(200);
        await service.setDefaultModelId(modelId);
        await expect(service.getDefaultModelId()).resolves.toBe(modelId);
    });
});
