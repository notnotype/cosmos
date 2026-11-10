import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConfiguredModelSnapshot, SystemConfigDto } from "@cosmos/contracts";

export interface SystemConfigRepository {
    getSystemConfigWithModel(): Promise<SystemConfigDto>;
    setDefaultModelWithValidation(modelId: string, validate: (selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null) => void): Promise<void>;
    getModelSelection(modelId: string): Promise<{ model: ConfiguredModelSnapshot; providerState: string | null } | null>;

    /**
     * 获取默认模型 ID。
     * 返回 null 表示未设置默认模型。
     */
    getDefaultModelId(): Promise<string | null>;

    /**
     * 设置默认模型 ID。
     * 传入 null 表示清除默认模型。
     */
    setDefaultModelId(modelId: string | null): Promise<void>;

    /**
     * 确保 singleton 记录存在（用于初始化）。
     */
    ensureSingleton(): Promise<void>;
}

export interface SystemConfigSnapshot {
    id: string;
    defaultModelId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export class PrismaSystemConfigRepository implements SystemConfigRepository {
    private readonly SINGLETON_ID = "singleton";

    constructor(private readonly prisma: PrismaClient) {}

    async getDefaultModelId(): Promise<string | null> {
        await this.ensureSingleton();
        const config = await this.prisma.systemConfig.findUnique({
            where: { id: this.SINGLETON_ID },
            select: { defaultModelId: true },
        });
        return config?.defaultModelId ?? null;
    }

    async setDefaultModelId(modelId: string | null): Promise<void> {
        await this.prisma.systemConfig.upsert({
            where: { id: this.SINGLETON_ID },
            create: { id: this.SINGLETON_ID, defaultModelId: modelId },
            update: { defaultModelId: modelId },
        });
    }

    async getSystemConfigWithModel(): Promise<SystemConfigDto> {
        const config = await this.prisma.systemConfig.findUnique({
            where: { id: this.SINGLETON_ID }, select: { defaultModelId: true },
        });
        const defaultModelId = config?.defaultModelId ?? null;
        const selection = defaultModelId === null ? null : await this.getModelSelection(defaultModelId);
        return { defaultModelId, defaultModel: selection?.model ?? null };
    }

    async setDefaultModelWithValidation(modelId: string, validate: (selection: { model: ConfiguredModelSnapshot; providerState: string | null } | null) => void): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const selection = await this.readModelSelection(tx, modelId);
            validate(selection);
            await tx.systemConfig.upsert({
                where: { id: this.SINGLETON_ID },
                create: { id: this.SINGLETON_ID, defaultModelId: modelId },
                update: { defaultModelId: modelId },
            });
        });
    }

    async getModelSelection(modelId: string): Promise<{ model: ConfiguredModelSnapshot; providerState: string | null } | null> {
        return await this.readModelSelection(this.prisma, modelId);
    }

    private async readModelSelection(client: Prisma.TransactionClient, modelId: string): Promise<{ model: ConfiguredModelSnapshot; providerState: string | null } | null> {
        const row = await client.configuredModel.findUnique({
            where: { id: modelId },
            select: {
                id: true, providerId: true, modelId: true, name: true,
                contextWindow: true, maxOutputTokens: true, version: true,
                inputPricePerMillion: true, outputPricePerMillion: true,
                createdAt: true, updatedAt: true,
            },
        });
        if (row === null) return null;
        const provider = await client.modelProvider.findUnique({
            where: { id: row.providerId }, select: { state: true },
        });
        return {
            model: {
                id: row.id, providerId: row.providerId, modelId: row.modelId, name: row.name,
                contextWindow: row.contextWindow, maxOutputTokens: row.maxOutputTokens, version: row.version,
                createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
                ...(row.inputPricePerMillion === null ? {} : { inputPricePerMillion: Number(row.inputPricePerMillion) }),
                ...(row.outputPricePerMillion === null ? {} : { outputPricePerMillion: Number(row.outputPricePerMillion) }),
            },
            providerState: provider?.state ?? null,
        };
    }

    async ensureSingleton(): Promise<void> {
        await this.prisma.systemConfig.upsert({
            where: { id: this.SINGLETON_ID },
            create: { id: this.SINGLETON_ID, defaultModelId: null },
            update: {},
        });
    }
}
