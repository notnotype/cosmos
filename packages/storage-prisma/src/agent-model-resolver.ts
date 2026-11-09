import type { PrismaClient } from "@prisma/client";
import type { AgentModelResolver, AgentModelSnapshot } from "@cosmos/application";
import type { SystemConfigRepository } from "./system-config.js";

export class PrismaAgentModelResolver implements AgentModelResolver {
    constructor(
        private readonly client: PrismaClient,
        private readonly systemConfig: SystemConfigRepository,
    ) {}

    async resolve(modelId: string | null): Promise<AgentModelSnapshot | null> {
        const targetModelId = modelId ?? await this.systemConfig.getDefaultModelId();
        if (targetModelId === null) return null;

        const model = await this.client.configuredModel.findUnique({
            where: { id: targetModelId },
            select: {
                modelId: true,
                name: true,
                contextWindow: true,
                maxOutputTokens: true,
                inputPricePerMillion: true,
                outputPricePerMillion: true,
                provider: { select: { id: true, api: true, baseUrl: true, state: true, secretRef: true } },
            },
        });
        if (model === null) return null;
        const provider = model.provider;
        if (provider.state !== "active" || provider.secretRef === null) return null;
        if (provider.api !== "openai-completions" && provider.api !== "openai-responses") return null;
        return {
            modelId: model.modelId,
            modelName: model.name,
            providerId: provider.id,
            api: provider.api,
            baseUrl: provider.baseUrl,
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxOutputTokens,
            secretRef: provider.secretRef,
            inputPricePerMillion: model.inputPricePerMillion === null ? null : Number(model.inputPricePerMillion),
            outputPricePerMillion: model.outputPricePerMillion === null ? null : Number(model.outputPricePerMillion),
        };
    }
}
