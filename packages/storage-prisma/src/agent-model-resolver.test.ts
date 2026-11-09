import { describe, expect, it } from "vitest";

import { PrismaAgentModelResolver } from "./agent-model-resolver.js";
import { PrismaSystemConfigRepository } from "./system-config.js";
import { withRepository } from "./index.fixtures.js";
import type { PrismaCosmosRepository } from "./index.js";

describe("PrismaAgentModelResolver", () => {
    async function seed(prisma: PrismaCosmosRepository["prisma"]): Promise<{ modelId: string; providerId: string }> {
        const provider = await prisma.modelProvider.create({
            data: {
                id: "provider-agent",
                name: "Synthetic Agent Provider",
                api: "openai-responses",
                baseUrl: "https://agent.example.invalid/v1",
                secretRef: "secret:provider-agent",
            },
        });
        const model = await prisma.configuredModel.create({
            data: {
                id: "configured-model-agent",
                providerId: provider.id,
                modelId: "namespace/agent-model",
                name: "Synthetic Agent Model",
                contextWindow: 8_192,
                maxOutputTokens: 1_024,
                inputPricePerMillion: 0.25,
                outputPricePerMillion: 1.5,
            },
        });
        return { modelId: model.id, providerId: provider.id };
    }

    it("resolves a configured model and maps provider configuration and prices", async () => {
        await withRepository("agent-model-resolve", async (repository) => {
            const { modelId } = await seed(repository.prisma);
            const resolver = new PrismaAgentModelResolver(
                repository.prisma,
                new PrismaSystemConfigRepository(repository.prisma),
            );

            await expect(resolver.resolve(modelId)).resolves.toEqual({
                modelId: "namespace/agent-model",
                modelName: "Synthetic Agent Model",
                providerId: "provider-agent",
                api: "openai-responses",
                baseUrl: "https://agent.example.invalid/v1",
                contextWindow: 8_192,
                maxOutputTokens: 1_024,
                secretRef: "secret:provider-agent",
                inputPricePerMillion: 0.25,
                outputPricePerMillion: 1.5,
            });
        });
    });

    it("uses the system default when modelId is null and returns null when no default exists", async () => {
        await withRepository("agent-model-default", async (repository) => {
            const { modelId } = await seed(repository.prisma);
            const systemConfig = new PrismaSystemConfigRepository(repository.prisma);
            const resolver = new PrismaAgentModelResolver(repository.prisma, systemConfig);

            await expect(resolver.resolve(null)).resolves.toBeNull();
            await systemConfig.setDefaultModelId(modelId);
            await expect(resolver.resolve(null)).resolves.toMatchObject({ modelId: "namespace/agent-model" });
        });
    });

    it("returns null for unavailable models, inactive providers, and missing credentials", async () => {
        await withRepository("agent-model-unavailable", async (repository) => {
            const { modelId, providerId } = await seed(repository.prisma);
            const resolver = new PrismaAgentModelResolver(
                repository.prisma,
                new PrismaSystemConfigRepository(repository.prisma),
            );

            await expect(resolver.resolve("missing-model")).resolves.toBeNull();
            await repository.prisma.modelProvider.update({ where: { id: providerId }, data: { state: "deleting" } });
            await expect(resolver.resolve(modelId)).resolves.toBeNull();
            await repository.prisma.modelProvider.update({ where: { id: providerId }, data: { state: "active", secretRef: null } });
            await expect(resolver.resolve(modelId)).resolves.toBeNull();
        });
    });
});
