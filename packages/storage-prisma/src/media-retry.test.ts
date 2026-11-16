import type { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PrismaCosmosRepository } from "./index.js";
import { withRepository } from "./index.fixtures.js";

type MediaRetryFence = {
    workflowRunId: string;
    context: {
        workflowRunId: string;
        kernelRevision: number;
        activity: {
            key: string;
            path: string;
            seq: number;
            kind: string;
            fingerprint: string;
        };
        jobId: string;
        attempt: number;
        jobLeaseToken: string;
        runLeaseToken: string;
    };
};

describe("media retry storage (ADR-0015)", () => {
    it("lists only retryable degraded assets of the source's current revision", async () => {
        await withRepositoryFixture(async ({ repository }) => {
            const candidates = await repository.listRetryableMediaAssets({
                sourceId: "source-a",
                maxAttempts: 3,
            });
            expect(candidates.map((candidate) => candidate.assetId)).toEqual([
                "asset-network",
                "asset-budget",
            ]);
            expect(candidates[0]).toMatchObject({
                sourceUrl: "https://media.example.test/asset-network.png",
                kind: "image",
                attemptCount: 1,
            });

            // maxAttempts 0 disables the whole pass.
            expect(await repository.listRetryableMediaAssets({
                sourceId: "source-a",
                maxAttempts: 0,
            })).toEqual([]);
            // attemptCount 1 is already at the ceiling when maxAttempts is 1.
            expect(await repository.listRetryableMediaAssets({
                sourceId: "source-a",
                maxAttempts: 1,
            })).toEqual([]);
            // Other sources are never included.
            expect(await repository.listRetryableMediaAssets({
                sourceId: "source-b",
                maxAttempts: 3,
            })).toEqual([]);
        });
    });

    it("rewrites the asset in place without creating a new EntryRevision", async () => {
        await withRepositoryFixture(async ({ repository, prisma, fence }) => {
            const content = new TextEncoder().encode("image-bytes");
            const applied = await repository.applyMediaRetryOutcome({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                expectedAttemptCount: 1,
                outcome: {
                    assetId: "asset-network",
                    status: "saved",
                    content,
                    mimeType: "image/png",
                },
            });
            expect(applied).toBe(true);

            const asset = await prisma.asset.findUnique({ where: { id: "asset-network" } });
            expect(asset).toMatchObject({
                status: "saved",
                mimeType: "image/png",
                byteSize: content.byteLength,
                errorMessage: null,
                errorCode: null,
                attemptCount: 2,
            });
            expect(asset?.storageKey).toMatch(/^sha256\//);
            expect(asset?.lastAttemptAt).not.toBeNull();
            // The Entry still has exactly the one revision it had before.
            expect(await prisma.entryRevision.count({ where: { entryId: "entry-a" } })).toBe(1);
            expect(await prisma.entry.findUnique({
                where: { id: "entry-a" },
                select: { currentRevisionId: true },
            })).toEqual({ currentRevisionId: "er-a-1" });
            expect(await prisma.domainEvent.count({
                where: { type: "media.retry.attempted.v1" },
            })).toBe(1);
        });
    });

    it("records a degraded outcome without touching bytes", async () => {
        await withRepositoryFixture(async ({ repository, prisma, fence }) => {
            const applied = await repository.applyMediaRetryOutcome({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                expectedAttemptCount: 1,
                outcome: {
                    assetId: "asset-budget",
                    status: "skipped",
                    errorCode: "budget_run",
                    errorMessage: "单次运行媒体预算已用尽",
                },
            });
            expect(applied).toBe(true);
            expect(await prisma.asset.findUnique({ where: { id: "asset-budget" } }))
                .toMatchObject({
                    status: "skipped",
                    storageKey: null,
                    errorCode: "budget_run",
                    attemptCount: 2,
                });
        });
    });

    it("rejects a stale attempt count without writing", async () => {
        await withRepositoryFixture(async ({ repository, prisma, fence }) => {
            const stale = await repository.applyMediaRetryOutcome({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                expectedAttemptCount: 5,
                outcome: {
                    assetId: "asset-network",
                    status: "failed",
                    errorCode: "timeout",
                    errorMessage: "图片下载超时",
                },
            });
            expect(stale).toBe(false);
            expect(await prisma.asset.findUnique({ where: { id: "asset-network" } }))
                .toMatchObject({ status: "failed", errorCode: "network", attemptCount: 1 });
            expect(await prisma.domainEvent.count({
                where: { type: "media.retry.attempted.v1" },
            })).toBe(0);
        });
    });

    it("writes the retry outcome through a conditional statement on attemptCount", async () => {
        // 「并发重试只落一次」靠的是 `WHERE id AND attemptCount` 这一条原子条件更新。
        // 光靠 Promise.all 咬不住它：SQLite 的交互式事务在两个并发调用之间会被串行化，
        // 先读后写的实现照样让第二条调用读到已经 +1 的值。所以这里观测落库语句本身——
        // 换成等价的条件更新（含 raw SQL）仍然过，去掉 attemptCount 谓词就会红。
        await withRepository("media-retry-cas-guard", async (repository, prisma) => {
            const events: Array<{ query: string; params: string }> = [];
            // `$on("query")` 的重载由客户端构造参数里的 log 推出，夹具按普适的 PrismaClient
            // 交出来时拿不到那个字面量；本用例在第三参打开了 query 事件，故按该事实收窄一次。
            const client: PrismaClient<Prisma.PrismaClientOptions, "query"> = prisma as PrismaClient<
                Prisma.PrismaClientOptions,
                "query"
            >;
            client.$on("query", (event) => {
                events.push({ query: event.query, params: event.params });
            });
            const fence = await seedFixture(prisma);
            events.length = 0;

            const applied = await repository.applyMediaRetryOutcome({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                expectedAttemptCount: 1,
                outcome: {
                    assetId: "asset-network",
                    status: "failed",
                    errorCode: "timeout",
                    errorMessage: "图片下载超时",
                },
            });

            expect(applied).toBe(true);
            const updates = events.filter((event) => /^\s*UPDATE\s/.test(event.query.replace(/[`"]/g, "")));
            expect(updates).toHaveLength(1);
            expect(updates[0]?.query.replace(/[`"]/g, "")).toMatch(/WHERE\b.*\battemptCount\b/);
        }, { clientOptions: { log: [{ emit: "event", level: "query" }] } });
    });
});

describe("media retention cleanup (ADR-0015)", () => {
    it("cleans only expired media of sources with a retention window", async () => {
        await withRepositoryFixture(async ({ repository, prisma, fence }) => {
            const expiredBytes = new TextEncoder().encode("expired-image");
            const sharedBytes = new TextEncoder().encode("shared-image");
            const freshBytes = new TextEncoder().encode("fresh-image");
            const expiredBlob = await repository.blobs.put(expiredBytes, { mimeType: "image/png" });
            const sharedBlob = await repository.blobs.put(sharedBytes, { mimeType: "image/png" });
            const freshBlob = await repository.blobs.put(freshBytes, { mimeType: "image/png" });
            const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000);
            await prisma.asset.createMany({
                data: [
                    {
                        id: "asset-expired",
                        entryRevisionId: "er-c-1",
                        kind: "image",
                        status: "saved",
                        sourceUrl: "https://media.example.test/expired.png",
                        storageKey: expiredBlob.key,
                        mimeType: "image/png",
                        byteSize: expiredBytes.byteLength,
                        createdAt: tenDaysAgo,
                    },
                    {
                        id: "asset-shared-a",
                        entryRevisionId: "er-c-1",
                        kind: "image",
                        status: "saved",
                        sourceUrl: "https://media.example.test/shared.png",
                        storageKey: sharedBlob.key,
                        mimeType: "image/png",
                        byteSize: sharedBytes.byteLength,
                        createdAt: tenDaysAgo,
                    },
                    {
                        id: "asset-shared-b",
                        entryRevisionId: "er-c-1",
                        kind: "image",
                        status: "saved",
                        sourceUrl: "https://media.example.test/shared.png",
                        storageKey: sharedBlob.key,
                        mimeType: "image/png",
                        byteSize: sharedBytes.byteLength,
                        createdAt: tenDaysAgo,
                    },
                    {
                        id: "asset-fresh",
                        entryRevisionId: "er-c-1",
                        kind: "image",
                        status: "saved",
                        sourceUrl: "https://media.example.test/fresh.png",
                        storageKey: freshBlob.key,
                        mimeType: "image/png",
                        byteSize: freshBytes.byteLength,
                    },
                ],
            });

            const candidates = await repository.listRetentionCleanupCandidates({
                sourceId: "source-c",
            });
            expect(candidates.map((candidate) => candidate.assetId).sort())
                .toEqual(["asset-expired", "asset-shared-a", "asset-shared-b"]);
            // A source without a retention window never contributes candidates.
            expect(await repository.listRetentionCleanupCandidates({ sourceId: "source-a" }))
                .toEqual([]);

            const preview = await repository.runMediaCleanup({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                sourceId: "source-c",
                dryRun: true,
            });
            expect(preview).toMatchObject({
                dryRun: true,
                candidateCount: 3,
                cleanedCount: 0,
                cleanedBytes: 0,
            });
            expect(await prisma.asset.count({
                where: { id: { in: ["asset-expired", "asset-shared-a"] }, status: "saved" },
            })).toBe(2);

            const report = await repository.runMediaCleanup({
                workflowRunId: fence.workflowRunId,
                fence: fence.context,
                sourceId: "source-c",
                dryRun: false,
            });
            expect(report).toMatchObject({
                dryRun: false,
                candidateCount: 3,
                cleanedCount: 3,
                // Only the last referencing Asset of a shared key removes the bytes,
                // so the shared blob is deleted exactly once (13 + 12 bytes).
                cleanedBytes: expiredBytes.byteLength + sharedBytes.byteLength,
                sharedKeyCount: 1,
            });
            const degraded = await prisma.asset.findUniqueOrThrow({
                where: { id: "asset-expired" },
            });
            expect(degraded).toMatchObject({
                status: "metadata_only",
                storageKey: null,
                byteSize: null,
                errorCode: "retention_expired",
            });
            expect(degraded.errorMessage).toContain("已按保留期清理");
            expect(degraded.sourceUrl).toBe("https://media.example.test/expired.png");
            expect(await repository.blobs.exists(expiredBlob.key)).toBe(false);
            expect(await repository.blobs.exists(sharedBlob.key)).toBe(false);
            expect(await prisma.asset.findUniqueOrThrow({ where: { id: "asset-fresh" } }))
                .toMatchObject({ status: "saved", storageKey: freshBlob.key });
            expect(await repository.getMediaCleanupReport(fence.workflowRunId))
                .toMatchObject({ dryRun: false, cleanedCount: 3 });
            expect(await prisma.entryRevision.count({ where: { entryId: "entry-c" } })).toBe(1);
        });
    });
});

/** 本文件的场景包装：共享生命周期之上补一份媒体重试栅栏。 */
async function withRepositoryFixture(
    body: (context: {
        repository: PrismaCosmosRepository;
        prisma: PrismaClient;
        fence: MediaRetryFence;
    }) => Promise<void>,
): Promise<void> {
    await withRepository("media-retry", async (repository, prisma) => {
        await body({ repository, prisma, fence: await seedFixture(prisma) });
    });
}

async function seedFixture(prisma: PrismaClient): Promise<MediaRetryFence> {
    for (const id of ["source-a", "source-b"]) {
        await prisma.sourceInstance.create({
            data: {
                id,
                name: id,
                kind: "rss",
                sourceDefinitionRef: "source.rss@1",
                operationId: "fetch",
                configJson: "{}",
                enabled: true,
                revision: 1,
            },
        });
        await prisma.collectionPlan.create({
            data: {
                id: `plan:${id}`,
                name: id,
                sourceId: id,
                mediaPolicyJson: null,
                revision: 1,
            },
        });
    }
    await prisma.sourceInstance.create({
        data: {
            id: "source-c",
            name: "source-c",
            kind: "rss",
            sourceDefinitionRef: "source.rss@1",
            operationId: "fetch",
            configJson: "{}",
            enabled: true,
            revision: 1,
        },
    });
    // 保留期归采集计划（ADR-0023 决策 2）：清理窗口读的是计划的 mediaPolicy，
    // 来源配置里已经不再有 media 字段。
    await prisma.collectionPlan.create({
        data: {
            id: "plan:source-c",
            name: "source-c",
            sourceId: "source-c",
            mediaPolicyJson: JSON.stringify({ retentionDays: 1 }),
            revision: 1,
        },
    });
    await prisma.entry.create({
        data: {
            id: "entry-c",
            sourceInstanceId: "source-c",
            canonicalExternalId: "external:entry-c",
        },
    });
    await prisma.entryRevision.create({
        data: {
            id: "er-c-1",
            entryId: "entry-c",
            revision: 1,
            title: "entry-c",
            contentText: "body",
            contentFingerprint: "fp-c",
        },
    });
    await prisma.entry.update({
        where: { id: "entry-c" },
        data: { currentRevisionId: "er-c-1" },
    });
    await prisma.entry.create({
        data: {
            id: "entry-a",
            sourceInstanceId: "source-a",
            canonicalExternalId: "external:entry-a",
        },
    });
    await prisma.entryRevision.create({
        data: {
            id: "er-a-1",
            entryId: "entry-a",
            revision: 1,
            title: "entry-a",
            contentText: "body",
            contentFingerprint: "fp-a",
        },
    });
    await prisma.entry.update({
        where: { id: "entry-a" },
        data: { currentRevisionId: "er-a-1" },
    });
    for (const asset of [
        {
            id: "asset-network",
            status: "failed",
            errorCode: "network",
            errorMessage: "图片下载失败",
        },
        {
            id: "asset-budget",
            status: "skipped",
            errorCode: "budget_run",
            errorMessage: "单次运行媒体预算已用尽",
        },
        {
            id: "asset-blocked",
            status: "skipped",
            errorCode: "security_blocked",
            errorMessage: "图片服务器位于内网或本机地址，已拦截",
        },
        {
            id: "asset-legacy",
            status: "failed",
            errorCode: null,
            errorMessage: "历史降级，没有原因码",
        },
        {
            id: "asset-exhausted",
            status: "failed",
            errorCode: "timeout",
            errorMessage: "图片下载超时",
        },
    ]) {
        await prisma.asset.create({
            data: {
                id: asset.id,
                entryRevisionId: "er-a-1",
                kind: "image",
                status: asset.status,
                sourceUrl: `https://media.example.test/${asset.id}.png`,
                mimeType: "image/png",
                byteSize: null,
                errorMessage: asset.errorMessage,
                errorCode: asset.errorCode,
                attemptCount: asset.id === "asset-exhausted" ? 3 : 1,
            },
        });
    }

    const workflowRunId = "media-retry-run";
    const jobId = "media-retry-job";
    const activity = {
        key: "media.retry.apply",
        path: "root",
        seq: 0,
        kind: "action",
        fingerprint: "sha256:media-retry",
    };
    await prisma.workflowRun.create({
        data: {
            id: workflowRunId,
            stateJson: JSON.stringify({ runId: workflowRunId, status: "running", revision: 1 }),
            kernelRevision: 1,
            status: "running",
            resumeRequired: false,
            definitionKey: "cosmos.ingest",
            definitionVersion: "1",
            manifestHash: "builtin:cosmos.ingest@1:source-snapshot-v2",
            idempotencyKey: "media-retry-command",
            inputSnapshotJson: "{}",
            productRunJson: "{}",
            runLeaseOwner: "worker-media-retry",
            runLeaseToken: "run-fence",
            runLeaseExpiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
    await prisma.job.create({
        data: {
            id: jobId,
            workflowRunId,
            kind: "workflow-activity",
            status: "leased",
            idempotencyKey: "media-retry-job-key",
            attempts: 1,
            maxAttempts: 3,
            payloadJson: JSON.stringify({ activity }),
            leaseOwner: "worker-media-retry",
            leaseToken: "job-fence",
            leaseExpiresAt: new Date(Date.now() + 60_000),
            workflowKernelRevision: 1,
        },
    });
    return {
        workflowRunId,
        context: {
            workflowRunId,
            kernelRevision: 1,
            activity,
            jobId,
            attempt: 1,
            jobLeaseToken: "job-fence",
            runLeaseToken: "run-fence",
        },
    };
}
