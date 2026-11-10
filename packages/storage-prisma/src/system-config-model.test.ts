import { describe, expect, it } from "vitest";
import { SystemConfigService } from "@cosmos/application";
import { configuredModelSnapshotSchema } from "@cosmos/contracts";
import { PrismaSystemConfigRepository } from "./system-config.js";
import { withRepository } from "./index.fixtures.js";

describe("SystemConfig model projection", () => {
    it("rejects a selection when concurrent deletion commits before its transaction", async () => {
        await withRepository("system-config-delete-race", async (_repository, prisma) => {
            await prisma.modelProvider.create({ data: {
                id: "provider-a", name: "Provider", api: "openai-responses",
                baseUrl: "https://provider.example.invalid/v1",
            } });
            await prisma.configuredModel.create({ data: {
                id: "model-a", providerId: "provider-a", modelId: "gpt-4", name: "GPT-4",
                contextWindow: 8192, maxOutputTokens: 1024,
            } });
            const repository = new PrismaSystemConfigRepository(prisma);
            const service = new SystemConfigService(repository);
            expect(await repository.getModelSelection("model-a")).not.toBeNull();
            let signalDeleted!: () => void;
            let releaseDeletion!: () => void;
            const deleted = new Promise<void>((resolve) => { signalDeleted = resolve; });
            const release = new Promise<void>((resolve) => { releaseDeletion = resolve; });
            const deletion = prisma.$transaction(async (tx) => {
                await tx.configuredModel.delete({ where: { id: "model-a" } });
                signalDeleted();
                await release;
            });
            await deleted;
            const selection = service.setDefaultModel("model-a");
            const rejection = expect(selection).rejects.toMatchObject({ code: "invalid_model_selection", reason: "not_found" });
            releaseDeletion();
            await deletion;
            await rejection;
            expect(await prisma.systemConfig.count()).toBe(0);
        });
    });
    it("validates and writes within a transaction, rolling back failed validation", async () => {
        await withRepository("system-config-transaction", async (_repository, prisma) => {
            await prisma.modelProvider.create({ data: {
                id: "provider-a", name: "Provider", api: "openai-responses",
                baseUrl: "https://provider.example.invalid/v1",
            } });
            await prisma.configuredModel.create({ data: {
                id: "model-a", providerId: "provider-a", modelId: "gpt-4", name: "GPT-4",
                contextWindow: 8192, maxOutputTokens: 1024,
            } });
            const repository = new PrismaSystemConfigRepository(prisma);
            await expect(repository.setDefaultModelWithValidation("model-a", (selection) => {
                expect(selection?.providerState).toBe("active");
                throw new Error("rejected selection");
            })).rejects.toThrow("rejected selection");
            expect(await prisma.systemConfig.findUnique({ where: { id: "singleton" } })).toBeNull();
            const service = new SystemConfigService(repository);
            await Promise.all([service.setDefaultModel("model-a"), service.setDefaultModel("model-a")]);
            expect(await prisma.systemConfig.count()).toBe(1);
            expect(await repository.getDefaultModelId()).toBe("model-a");
            await prisma.systemConfig.delete({ where: { id: "singleton" } });
            await prisma.configuredModel.delete({ where: { id: "model-a" } });
            await expect(repository.setDefaultModelWithValidation("model-a", (selection) => {
                if (selection === null) throw Object.assign(new Error("missing"), { code: "invalid_model_selection", reason: "not_found" });
            })).rejects.toMatchObject({ code: "invalid_model_selection", reason: "not_found" });
            expect(await prisma.systemConfig.count()).toBe(0);
        });
    });
    it("reads full non-secret model details and decimal prices", async () => {
        await withRepository("system-config-model", async (_repository, prisma) => {
            await prisma.modelProvider.create({ data: {
                id: "provider-a", name: "Provider", api: "openai-responses",
                baseUrl: "https://provider.example.invalid/v1", secretRef: "secret:private",
            } });
            await prisma.configuredModel.create({ data: {
                id: "model-a", providerId: "provider-a", modelId: "gpt-4", name: "GPT-4",
                contextWindow: 128000, maxOutputTokens: 4096,
                inputPricePerMillion: 30.25, outputPricePerMillion: 60,
            } });
            const repository = new PrismaSystemConfigRepository(prisma);
            await repository.setDefaultModelId("model-a");
            const config = await repository.getSystemConfigWithModel();
            expect(config).toEqual({ defaultModelId: "model-a", defaultModel: expect.objectContaining({
                id: "model-a", providerId: "provider-a", modelId: "gpt-4", name: "GPT-4",
                contextWindow: 128000, maxOutputTokens: 4096,
                inputPricePerMillion: 30.25, outputPricePerMillion: 60,
            }) });
            expect(configuredModelSnapshotSchema.safeParse(config.defaultModel).success).toBe(true);
            expect(JSON.stringify(config)).not.toContain("secret:private");
            expect(JSON.stringify(config)).not.toContain("baseUrl");
            expect(await repository.getModelSelection("model-a")).toEqual({
                model: config.defaultModel, providerState: "active",
            });

            await prisma.configuredModel.update({ where: { id: "model-a" }, data: {
                inputPricePerMillion: null, outputPricePerMillion: null,
            } });
            const unknownPrices = (await repository.getSystemConfigWithModel()).defaultModel;
            expect(unknownPrices).not.toHaveProperty("inputPricePerMillion");
            expect(unknownPrices).not.toHaveProperty("outputPricePerMillion");
            expect(configuredModelSnapshotSchema.safeParse(unknownPrices).success).toBe(true);

            await prisma.modelProvider.update({ where: { id: "provider-a" }, data: { state: "deleting" } });
            expect(await repository.getModelSelection("model-a")).toMatchObject({ providerState: "deleting" });
            await prisma.configuredModel.delete({ where: { id: "model-a" } });
            expect(await repository.getSystemConfigWithModel()).toEqual({ defaultModelId: "model-a", defaultModel: null });
            expect(await repository.getModelSelection("model-a")).toBeNull();
            await repository.setDefaultModelId(null);
            expect(await repository.getSystemConfigWithModel()).toEqual({ defaultModelId: null, defaultModel: null });
        });
    });
});
