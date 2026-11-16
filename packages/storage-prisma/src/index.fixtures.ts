import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { type LoggerPort } from "@cosmos/application";
import type { SourceSnapshot } from "@cosmos/contracts";
import { PrismaCosmosRepository } from "./index.js";
import {
    deploySchema,
    materializeDatabase,
    releaseSchemaTemplates,
    sqliteUrl,
} from "./schema-template.js";

// 升级类用例与 e2e 播种脚本按既有路径从这里导入这两个原语。
export { deploySchema, sqliteUrl };














export const temporaryRoots: string[] = [];

/** 还开着的测试仓储；`afterEach` 用它兜底断开被中断用例留下的句柄。 */
const openRepositories = new Set<PrismaCosmosRepository>();

/** 还开着的裸客户端（迁移/升级用例分步开关的那种）；同样要兜底断开。 */
const openClients = new Set<PrismaClient>();

export function captureLogger(): {
    logger: LoggerPort;
    records: Array<Record<string, unknown>>;
} {
    const records: Array<Record<string, unknown>> = [];
    const logger: LoggerPort = {
        child: () => logger,
        withContext: (_context, callback) => callback(),
        debug: (event, fields = {}) => {
            records.push({ ...fields, event, level: "debug" });
        },
        info: (event, fields = {}) => {
            records.push({ ...fields, event, level: "info" });
        },
        warn: (event, fields = {}) => {
            records.push({ ...fields, event, level: "warn" });
        },
        error: (event, fields = {}) => {
            records.push({ ...fields, event, level: "error" });
        },
    };
    return { logger, records };
}

/**
 * 测试仓储的唯一生命周期实现：建隔离根 → 铺出已迁移的库 → 打开 → 交给用例 → 无论成败都关闭。
 *
 * 库来自 schema 模板的拷贝（见 `schema-template.ts`）：逐用例跑 `migrate deploy` 要 4~6 秒，
 * 一条用例的成本几乎全在那里；拷贝一份模板是毫秒级，用例拿到的仍然是逐用例全新的库。
 *
 * 关闭要**登记**而不是只写在用例的 `finally` 里：vitest 因超时中断用例时，被中断的
 * async 函数不会继续执行，`finally` 不跑，Prisma 客户端就把 sqlite 文件句柄留着；
 * 紧接着 `afterEach` 删临时根会撞 `EBUSY`，而那条 EBUSY 会把真正的中断报错盖住，
 * 失败点还会漂到同文件后面某个用例的清理上。
 *
 * 裸 `prisma` 一并交给用例：不少用例要绕过仓储直查落库行。它与仓储用的是同一个
 * 客户端实例，所以 `close()` 的 `$disconnect()` 就是它的释放。
 */
export async function withRepository(
    name: string,
    body: (repository: PrismaCosmosRepository, prisma: PrismaClient) => Promise<void>,
    /**
     * `clientOptions` 只给需要观测客户端行为的用例：客户端由本夹具独占创建，
     * 事件订阅（例如统计 query 次数）只能通过构造参数打开，事后挂不上。
     */
    options: { schemaPath?: string; clientOptions?: Prisma.PrismaClientOptions } = {},
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), `cosmos-${name}-`));
    temporaryRoots.push(root);
    const databasePath = await materializeDatabase(root, options.schemaPath);

    const prisma = new PrismaClient({
        ...options.clientOptions,
        datasources: { db: { url: sqliteUrl(databasePath) } },
    });
    const repository = new PrismaCosmosRepository({ dataRoot: root, prisma });
    openRepositories.add(repository);
    await repository.initialize();
    try {
        await body(repository, prisma);
    } finally {
        await releaseRepository(repository);
    }
}

/** 只有数据库、没有仓储的用例（迁移升级、backend 一致性）用的上下文。 */
export type TestDatabase = {
    root: string;
    databasePath: string;
    url: string;
    /** 部署指定 schema；可重复调用，不截断已有数据。 */
    deploy: (schemaPath?: string) => void;
    /** 建一个**已登记**的客户端；用例没关的话清理时会断开。 */
    openClient: () => PrismaClient;
};

/**
 * 数据库层原语：给「要自己控制 schema 部署、并分步开关多个裸客户端」的用例用。
 * 仓储层原语见 `withRepository`；两者共用同一套根登记与清理，所以被中断的用例
 * 留下的句柄一样会被兜底断开。
 */
export async function withTestDatabase(
    name: string,
    body: (database: TestDatabase) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), `cosmos-${name}-`));
    temporaryRoots.push(root);
    const databasePath = join(root, "cosmos.sqlite");
    writeFileSync(databasePath, new Uint8Array());
    await body({
        root,
        databasePath,
        url: sqliteUrl(databasePath),
        deploy: (schemaPath) => deploySchema(databasePath, schemaPath),
        openClient: () => {
            const client = new PrismaClient({
                datasources: { db: { url: sqliteUrl(databasePath) } },
            });
            openClients.add(client);
            return client;
        },
    });
}

/** 幂等释放：登记表里已经没有了就什么都不做。 */
async function releaseRepository(repository: PrismaCosmosRepository): Promise<void> {
    if (!openRepositories.delete(repository)) {
        return;
    }
    await repository.close();
}

/**
 * 清理：先兜底断开还开着的仓储，再删临时根。
 *
 * 被中断的用例跑不到自己的 `finally`，Prisma 客户端会把 sqlite 文件句柄留着；
 * 直接 `rm` 会撞 `EBUSY`，而那条 EBUSY 会把真正的中断报错盖住，失败点还会漂到
 * 同文件后面某个用例的清理上。
 */
export async function cleanupTemporaryRoots(): Promise<void> {
    await Promise.all([...openRepositories].map((repository) => releaseRepository(repository)));
    await Promise.all([...openClients].map(async (client) => {
        openClients.delete(client);
        await client.$disconnect();
    }));
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
}

afterEach(cleanupTemporaryRoots);
// schema 模板要活过整个文件的用例，所以是 afterAll 而不是 afterEach。
afterAll(releaseSchemaTemplates);

export async function createFixtureSource(
    repository: PrismaCosmosRepository,
    input: { name: string; config: unknown; scheduleIntervalMs?: number },
): Promise<SourceSnapshot> {
    const created = await repository.createSource({
        name: input.name,
        sourceDefinitionRef: "source.fixture-rss@1",
        operationId: "fetch",
        config: input.config,
        ...(input.scheduleIntervalMs !== undefined ? { scheduleIntervalMs: input.scheduleIntervalMs } : {}),
    });
    // 启用状态归计划（ADR-0023 决策 2）：夹具也走计划端点，不再有来源激活路径。
    await repository.updateCollectionPlan(created.planId, {
        enabled: true,
        baseRevisionId: created.planRevisionId,
    });
    return repository.getSource(created.id) as Promise<SourceSnapshot>;
}
