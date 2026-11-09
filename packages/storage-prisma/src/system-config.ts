import type { PrismaClient } from "@prisma/client";

export interface SystemConfigRepository {
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
        await this.ensureSingleton();
        await this.prisma.systemConfig.update({
            where: { id: this.SINGLETON_ID },
            data: { defaultModelId: modelId },
        });
    }

    async ensureSingleton(): Promise<void> {
        await this.prisma.systemConfig.upsert({
            where: { id: this.SINGLETON_ID },
            create: { id: this.SINGLETON_ID, defaultModelId: null },
            update: {},
        });
    }
}
