import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
    createMediaAcquirer,
    mediaDownloadCapability,
    type IngestConnector,
} from "../../../packages/application/src/index.js";
import type { NormalizedIngestItem } from "../../../packages/domain/src/index.js";

import {
    createIngestActions,
    createIngestWorkflowDefinition,
} from "../../../packages/application/src/workflow-ingest.js";
import { IngestWorkflowControlService } from "../../../packages/application/src/workflow-control.js";
import { PrismaCosmosRepository } from "@cosmos/storage-prisma";
import {
    materializeDatabase,
    releaseSchemaTemplates,
} from "../../../packages/storage-prisma/src/schema-template.js";

import { createWorkflowHost } from "./workflow-host.js";

export const temporaryRoots: string[] = [];

/** 还开着的测试仓储；清理时先兜底断开，再删根（见 `cleanupTemporaryRoots`）。 */
const openRepositories = new Set<PrismaCosmosRepository>();

/**
 * 每个测试文件各自注册 `afterEach(cleanupTemporaryRoots)`——装置模块不注册钩子，
 * 否则被导入时会重复注册清理。
 *
 * 删根之前先断开还开着的仓储：用例被 vitest 超时中断时它的 `finally` 不会跑到，
 * Prisma 客户端会把 sqlite 文件句柄留着，`rm` 就会撞 `EBUSY`，而那条 EBUSY 会把
 * 真正的中断报错盖住，失败点还会漂到同文件后面某个用例的清理上。
 */
export async function cleanupTemporaryRoots(): Promise<void> {
    await Promise.all([...openRepositories].map((repository) => releaseRepository(repository)));
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
}

// 唯一在装置模块里注册的钩子，而且必须是 afterAll：schema 模板要活过整个文件的用例，
// 放进逐用例清理会把后面用例要用的模板删掉。逐用例的临时根仍由各测试文件自己注册的
// afterEach(cleanupTemporaryRoots) 负责。
afterAll(releaseSchemaTemplates);

/** 测试仓储的唯一生命周期实现：建隔离根 → 铺出已迁移的库 → 打开 → 交给用例 → 无论成败都关闭。 */
export async function withRepository(
    name: string,
    body: (repository: PrismaCosmosRepository) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), `cosmos-${name}-`));
    temporaryRoots.push(root);
    await materializeDatabase(root);

    const repository = new PrismaCosmosRepository({ dataRoot: root });
    openRepositories.add(repository);
    await repository.initialize();
    try {
        await body(repository);
    } finally {
        await releaseRepository(repository);
    }
}

/** 幂等释放：登记表里已经没有了就什么都不做。 */
async function releaseRepository(repository: PrismaCosmosRepository): Promise<void> {
    if (!openRepositories.delete(repository)) {
        return;
    }
    await repository.close();
}


export async function drainWorkflow(
    composition: ReturnType<typeof createWorkflowHost>,
    runId: string,
) {
    for (let index = 0; index < 60; index += 1) {
        await composition.runLane.pollOnce();
        await composition.activityWorker.pollOnce();
        await composition.completionDispatcher.pollOnce();
        const current = await composition.store.loadWorkflowEnvelope(runId);
        if (!current) continue;
        if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
            return current;
        }
    }
    throw new Error(`Workflow ${runId} did not reach a terminal state.`);
}

export async function createFixtureSource(
    repository: PrismaCosmosRepository,
    name: string,
) {
    const created = await repository.createSource({
        name,
        sourceDefinitionRef: "source.fixture-rss@1",
        operationId: "fetch",
        config: {},
    });
    await repository.updateCollectionPlan(created.planId, {
        enabled: true,
        baseRevisionId: created.planRevisionId,
    });
    const source = await repository.getSource(created.id);
    if (!source) throw new Error(`Fixture source missing: ${created.id}`);
    return source;
}
