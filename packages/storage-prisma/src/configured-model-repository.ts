import type { ConfiguredModelRepository } from "@cosmos/application";
import type { CreateConfiguredModelCommand, UpdateConfiguredModelCommand } from "@cosmos/contracts";

const select = {
    id: true, providerId: true, modelId: true, name: true,
    contextWindow: true, maxOutputTokens: true, version: true,
    inputPricePerMillion: true, outputPricePerMillion: true,
    cacheWritePricePerMillion: true, cacheReadPricePerMillion: true,
    currency: true, tieredPricingEnabled: true, tieredPricingThreshold: true,
    highInputPricePerMillion: true, highOutputPricePerMillion: true,
    highCacheWritePricePerMillion: true, highCacheReadPricePerMillion: true,
    createdAt: true, updatedAt: true,
} as const;

type DecimalValue = number | string | { toString(): string };

type ModelRow = {
    id: string; providerId: string; modelId: string; name: string;
    contextWindow: number; maxOutputTokens: number; version: number;
    inputPricePerMillion?: DecimalValue | null; outputPricePerMillion?: DecimalValue | null;
    cacheWritePricePerMillion?: DecimalValue | null; cacheReadPricePerMillion?: DecimalValue | null;
    currency?: string; tieredPricingEnabled?: boolean; tieredPricingThreshold?: bigint | number | null;
    highInputPricePerMillion?: DecimalValue | null; highOutputPricePerMillion?: DecimalValue | null;
    highCacheWritePricePerMillion?: DecimalValue | null; highCacheReadPricePerMillion?: DecimalValue | null;
    createdAt: Date; updatedAt: Date;
};

type ModelClient = {
    configuredModel: {
        findMany(input: { where: { providerId: string }; orderBy: { id: "asc" }; select: typeof select }): Promise<ModelRow[]>;
        findFirst(input: { where: { id: string; providerId: string }; select: typeof select }): Promise<ModelRow | null>;
        create(input: { data: { id: string; providerId: string } & Omit<CreateConfiguredModelCommand, "tieredPricingThreshold"> & {
            tieredPricingThreshold?: bigint | null;
        }; select: typeof select }): Promise<ModelRow>;
        updateMany(input: { where: { id: string; providerId: string; version: number }; data:
            Omit<UpdateConfiguredModelCommand, "expectedVersion" | "tieredPricingThreshold"> & {
                tieredPricingThreshold?: bigint | null; version: { increment: 1 };
            };
        }): Promise<{ count: number }>;
        deleteMany(input: { where: { id: string; providerId: string; version: number } }): Promise<{ count: number }>;
    };
};

function conflict(): never {
    throw Object.assign(new Error("Configured model version conflict."), { code: "version_conflict" });
}

/**
 * `@@unique([providerId, modelId])` 是「同一服务商不能重复录入同一模型」的唯一权威判据。
 * 不在这里翻译成 already_exists，界面只能拿到兜底的 dependency_unavailable 并提示「稍后重试」，
 * 而重试永远不会成功。
 */
function isDuplicateModel(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * Task 41 后 ConnectionInstance.modelId 已删除，ConfiguredModel 不再被连接引用。
 * 保留 P2003 翻译作为防御：若未来再有表引用 ConfiguredModel，`in_use` 而非原始 Prisma 错误。
 */
function isReferencedModel(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

function snapshot(row: ModelRow): Record<string, unknown> {
    return {
        id: row.id, providerId: row.providerId, modelId: row.modelId, name: row.name,
        contextWindow: row.contextWindow, maxOutputTokens: row.maxOutputTokens, version: row.version,
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        ...(row.inputPricePerMillion == null ? {} : { inputPricePerMillion: Number(row.inputPricePerMillion) }),
        ...(row.outputPricePerMillion == null ? {} : { outputPricePerMillion: Number(row.outputPricePerMillion) }),
        ...(row.cacheWritePricePerMillion == null ? {} : { cacheWritePricePerMillion: Number(row.cacheWritePricePerMillion) }),
        ...(row.cacheReadPricePerMillion == null ? {} : { cacheReadPricePerMillion: Number(row.cacheReadPricePerMillion) }),
        currency: row.currency ?? "USD", tieredPricingEnabled: row.tieredPricingEnabled ?? false,
        tieredPricingThreshold: row.tieredPricingThreshold == null ? null : Number(row.tieredPricingThreshold),
        highInputPricePerMillion: row.highInputPricePerMillion == null ? null : Number(row.highInputPricePerMillion),
        highOutputPricePerMillion: row.highOutputPricePerMillion == null ? null : Number(row.highOutputPricePerMillion),
        highCacheWritePricePerMillion: row.highCacheWritePricePerMillion == null ? null : Number(row.highCacheWritePricePerMillion),
        highCacheReadPricePerMillion: row.highCacheReadPricePerMillion == null ? null : Number(row.highCacheReadPricePerMillion),
    };
}

export class PrismaConfiguredModelRepository implements ConfiguredModelRepository {
    constructor(private readonly client: ModelClient) {}

    async list(providerId: string): Promise<unknown[]> {
        const rows = await this.client.configuredModel.findMany({ where: { providerId }, orderBy: { id: "asc" }, select });
        return rows.map(snapshot);
    }

    async get(providerId: string, id: string): Promise<unknown | null> {
        const row = await this.client.configuredModel.findFirst({ where: { id, providerId }, select });
        return row === null ? null : snapshot(row);
    }

    async create(input: { id: string; providerId: string; fields: CreateConfiguredModelCommand }): Promise<unknown> {
        try {
            const { tieredPricingThreshold, ...fields } = input.fields;
            return snapshot(await this.client.configuredModel.create({
                data: { id: input.id, providerId: input.providerId, ...fields,
                    ...(tieredPricingThreshold === undefined ? {} : {
                        tieredPricingThreshold: tieredPricingThreshold === null ? null : BigInt(tieredPricingThreshold),
                    }),
                }, select,
            }));
        } catch (error) {
            if (isDuplicateModel(error)) {
                throw Object.assign(new Error("Configured model already exists."), { code: "already_exists" });
            }
            throw error;
        }
    }

    async update(input: { id: string; providerId: string; expectedVersion: number; fields: Omit<UpdateConfiguredModelCommand, "expectedVersion"> }): Promise<unknown> {
        const { tieredPricingThreshold, ...fields } = input.fields;
        const changed = await this.client.configuredModel.updateMany({
            where: { id: input.id, providerId: input.providerId, version: input.expectedVersion },
            data: { ...fields, version: { increment: 1 },
                ...(tieredPricingThreshold === undefined ? {} : {
                    tieredPricingThreshold: tieredPricingThreshold === null ? null : BigInt(tieredPricingThreshold),
                }),
            },
        });
        if (changed.count !== 1) return conflict();
        const row = await this.get(input.providerId, input.id);
        return row ?? conflict();
    }

    async delete(input: { id: string; providerId: string; expectedVersion: number }): Promise<void> {
        try {
            const deleted = await this.client.configuredModel.deleteMany({
                where: { id: input.id, providerId: input.providerId, version: input.expectedVersion },
            });
            if (deleted.count !== 1) conflict();
        } catch (error) {
            if (isReferencedModel(error)) {
                throw Object.assign(new Error("Configured model is still in use."), { code: "in_use" });
            }
            throw error;
        }
    }
}
