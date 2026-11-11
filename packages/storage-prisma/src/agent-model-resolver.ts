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
                cacheWritePricePerMillion: true, cacheReadPricePerMillion: true,
                currency: true, tieredPricingEnabled: true, tieredPricingThreshold: true,
                highInputPricePerMillion: true, highOutputPricePerMillion: true,
                highCacheWritePricePerMillion: true, highCacheReadPricePerMillion: true,
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
            cacheWritePricePerMillion: model.cacheWritePricePerMillion === null ? null : Number(model.cacheWritePricePerMillion),
            cacheReadPricePerMillion: model.cacheReadPricePerMillion === null ? null : Number(model.cacheReadPricePerMillion),
            currency: model.currency === "CNY" ? "CNY" : "USD",
            tieredPricingEnabled: model.tieredPricingEnabled,
            tieredPricingThreshold: model.tieredPricingThreshold === null ? null : Number(model.tieredPricingThreshold),
            highInputPricePerMillion: model.highInputPricePerMillion === null ? null : Number(model.highInputPricePerMillion),
            highOutputPricePerMillion: model.highOutputPricePerMillion === null ? null : Number(model.highOutputPricePerMillion),
            highCacheWritePricePerMillion: model.highCacheWritePricePerMillion === null ? null : Number(model.highCacheWritePricePerMillion),
            highCacheReadPricePerMillion: model.highCacheReadPricePerMillion === null ? null : Number(model.highCacheReadPricePerMillion),
        };
    }
}
