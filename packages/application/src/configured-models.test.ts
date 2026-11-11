import { describe, expect, it, vi } from "vitest";
import type { ConfiguredModelSnapshot } from "@cosmos/contracts";
import { ConfiguredModels, type ConfiguredModelRepository } from "./configured-models.js";

const pricing = {
    inputPricePerMillion: 1, outputPricePerMillion: 2,
    cacheWritePricePerMillion: 3, cacheReadPricePerMillion: 4,
    currency: "CNY" as const, tieredPricingEnabled: true, tieredPricingThreshold: 100,
    highInputPricePerMillion: 5, highOutputPricePerMillion: 6,
    highCacheWritePricePerMillion: 7, highCacheReadPricePerMillion: 8,
};
const snapshot: ConfiguredModelSnapshot = {
    ...pricing,
    id: "model-1", providerId: "provider-1", modelId: "text-model", name: "Text model",
    contextWindow: 8192, maxOutputTokens: 256, version: 1,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
};

function repository(overrides: Partial<ConfiguredModelRepository> = {}): ConfiguredModelRepository {
    return {
        list: vi.fn(async () => [snapshot]),
        get: vi.fn(async () => snapshot),
        create: vi.fn(async (input) => ({ ...snapshot, ...input.fields, id: input.id, providerId: input.providerId })),
        update: vi.fn(async (input) => ({ ...snapshot, ...input.fields, id: input.id, providerId: input.providerId, version: 2 })),
        delete: vi.fn(async () => undefined),
        ...overrides,
    };
}

describe("ConfiguredModels", () => {
    it("lists and reads strict credential-free model snapshots", async () => {
        const repo = repository();
        const service = new ConfiguredModels(repo);
        expect(await service.list("provider-1")).toEqual([snapshot]);
        expect(await service.get("provider-1", "model-1")).toEqual(snapshot);
        expect(repo.list).toHaveBeenCalledWith("provider-1");
        expect(repo.get).toHaveBeenCalledWith("provider-1", "model-1");
    });

    it("creates with a generated id and passes only model fields", async () => {
        const repo = repository();
        const service = new ConfiguredModels(repo, () => "model-new");
        await expect(service.create("provider-1", {
            modelId: "text-model", name: "Text model", contextWindow: 8192, maxOutputTokens: 256,
            ...pricing,
        })).resolves.toMatchObject({ id: "model-new", providerId: "provider-1" });
        expect(repo.create).toHaveBeenCalledWith({
            id: "model-new", providerId: "provider-1",
            fields: { modelId: "text-model", name: "Text model", contextWindow: 8192, maxOutputTokens: 256, ...pricing },
        });
    });

    it("updates with a version fence and rejects a budget above the persisted context", async () => {
        const repo = repository();
        const service = new ConfiguredModels(repo);
        await expect(service.update("provider-1", "model-1", { expectedVersion: 1, maxOutputTokens: 512 }))
            .resolves.toMatchObject({ version: 2, maxOutputTokens: 512 });
        expect(repo.update).toHaveBeenCalledWith({
            id: "model-1", providerId: "provider-1", expectedVersion: 1,
            fields: { maxOutputTokens: 512 },
        });
        await expect(service.update("provider-1", "model-1", { expectedVersion: 1, contextWindow: 128, maxOutputTokens: 256 }))
            .rejects.toMatchObject({ code: "invalid_input" });
    });

    it("maps missing rows and dependency errors without exposing raw errors", async () => {
        const missing = repository({ get: vi.fn(async () => null) });
        await expect(new ConfiguredModels(missing).get("provider-1", "model-1"))
            .rejects.toMatchObject({ code: "not_found" });
        const failure = repository({ delete: vi.fn(async () => { throw new Error("database secret"); }) });
        await expect(new ConfiguredModels(failure).delete("provider-1", "model-1", 1))
            .rejects.toMatchObject({ code: "dependency_unavailable" });
    });

    it("keeps a duplicate model distinguishable from a retryable dependency failure", async () => {
        const duplicate = repository({
            create: vi.fn(async (_input) => { throw Object.assign(new Error("unique"), { code: "already_exists" }); }),
        });
        await expect(new ConfiguredModels(duplicate).create("provider-1", {
            modelId: "text-model", name: "Text model", contextWindow: 8192, maxOutputTokens: 256,
            ...pricing,
        })).rejects.toMatchObject({ code: "already_exists" });
    });

    it("keeps metadata patches free of pricing defaults and replaces pricing only as one group", async () => {
        const repo = repository();
        const service = new ConfiguredModels(repo);
        await service.update("provider-1", "model-1", { expectedVersion: 1, name: "Renamed" });
        expect(repo.update).toHaveBeenLastCalledWith({
            id: "model-1", providerId: "provider-1", expectedVersion: 1, fields: { name: "Renamed" },
        });
        await expect(service.update("provider-1", "model-1", {
            expectedVersion: 1, inputPricePerMillion: 99,
        })).rejects.toMatchObject({ code: "invalid_input" });
        expect(repo.update).toHaveBeenCalledTimes(1);
        await expect(service.update("provider-1", "model-1", { expectedVersion: 1, ...pricing }))
            .resolves.toMatchObject(pricing);
        expect(repo.update).toHaveBeenLastCalledWith({
            id: "model-1", providerId: "provider-1", expectedVersion: 1, fields: pricing,
        });
    });

    it("deletes with a version fence and rejects malformed identifiers", async () => {
        const repo = repository();
        const service = new ConfiguredModels(repo);
        await expect(service.delete("provider-1", "model-1", 1)).resolves.toBeUndefined();
        expect(repo.delete).toHaveBeenCalledWith({ providerId: "provider-1", id: "model-1", expectedVersion: 1 });
        await expect(service.list(" ")).rejects.toMatchObject({ code: "invalid_input" });
    });
});
