import { describe, expect, it, vi } from "vitest";
import { SystemConfigService } from "./index.js";

function serviceWith(initialModelId: string | null = null) {
    let modelId = initialModelId;
    const repository = {
        getDefaultModelId: vi.fn(async () => modelId),
        setDefaultModelId: vi.fn(async (value: string | null) => { modelId = value; }),
    };
    return { service: new SystemConfigService(repository), repository };
}

describe("SystemConfigService", () => {
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
