import type { ModelProviderRemovalRepository } from "@cosmos/application";

function refuse(code: "not_found" | "in_use" | "version_conflict" | "operation_in_progress"): never {
    throw Object.assign(new Error("Model provider removal refused."), { code });
}

/**
 * 只声明用到的那几个操作：调用方传真的 Prisma client 或隔离测试生成的 client 都能满足，
 * 不需要绑死 @prisma/client 的生成类型。
 */
type RemovalTransaction = {
    modelProvider: {
        findUnique(input: { where: { id: string }; select: {
            id: true; version: true; state: true; pendingOperationId: true; secretRef: true;
        } }): Promise<{ id: string; version: number; state: string; pendingOperationId: string | null; secretRef: string | null } | null>;
        delete(input: { where: { id: string } }): Promise<unknown>;
    };
    configuredModel: {
        findMany(input: { where: { providerId: string }; select: { id: true } }): Promise<{ id: string }[]>;
        deleteMany(input: { where: { providerId: string } }): Promise<{ count: number }>;
    };
};

type RemovalClient = {
    $transaction<T>(run: (transaction: RemovalTransaction) => Promise<T>): Promise<T>;
};

/**
 * 删除 Provider 的最小形态：一个事务里判定能否删除并执行删除，凭证文件在事务外单独清理。
 *
 * Task 41 后连接不再引用模型；provider 下仍有子模型时视为 in_use，拒绝删除。
 * 检查和删除在同一事务内，防止并发建模型后悄悄删 provider。
 */
export class PrismaModelProviderRemovalRepository implements ModelProviderRemovalRepository {
    constructor(private readonly client: RemovalClient) {}

    remove(input: { id: string; expectedVersion: number }): Promise<string | null> {
        return this.client.$transaction(async (transaction) => {
            const provider = await transaction.modelProvider.findUnique({
                where: { id: input.id },
                select: { id: true, version: true, state: true, pendingOperationId: true, secretRef: true },
            });
            if (provider === null) refuse("not_found");
            if (provider.version !== input.expectedVersion) refuse("version_conflict");
            if (provider.state !== "active" || provider.pendingOperationId !== null) refuse("operation_in_progress");
            const models = await transaction.configuredModel.findMany({
                where: { providerId: input.id }, select: { id: true },
            });
            // Task 41: ConnectionInstance.modelId 已删除，不再检查模型被连接引用。
            // provider 有子模型本身就是 in_use（子模型引用此 provider）。
            if (models.length > 0) refuse("in_use");
            await transaction.configuredModel.deleteMany({ where: { providerId: input.id } });
            await transaction.modelProvider.delete({ where: { id: input.id } });
            return provider.secretRef;
        });
    }
}
