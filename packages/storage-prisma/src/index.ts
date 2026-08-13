import { randomUUID } from "node:crypto";
import {
    join,
    relative,
    resolve,
} from "node:path";

import {
    contentKindSchema,
    jobKindSchema,
    sourceKindSchema,
    sourceConfigSchema,
    type CreateSourceCommand,
    type ContentMetrics,
    type EntryDetail,
    type EntryPage,
    type FeedItem,
    type FeedPage,
    type HealthResponse,
    type JobSnapshot,
    type SearchPage,
    type SearchQuery,
    type RevisionDetail,
    type SourceSnapshot,
    type StoryDetail,
    type TemporalValue,
    type Publisher,
} from "@cosmos/contracts";
import {
    deriveExternalKey,
    fingerprintEntryRevision,
    projectEntryToStory,
    temporalProjection,
    type NormalizedIngestItem,
} from "@cosmos/domain";
import type {
    CosmosRepository,
    JobLease,
    LoggerPort,
    PersistIngestItemResult,
    RepositoryHealth,
} from "@cosmos/application";
import { FileBlobStore } from "@cosmos/blob-store";
import {
    PrismaClient,
    type Prisma,
} from "@prisma/client";

export interface StorageRoots {
    dataRoot: string;
    databasePath: string;
    databaseUrl: string;
    blobRoot: string;
    artifactRoot: string;
    cacheRoot: string;
    logRoot: string;
    secretRoot: string;
}

export function resolveStorageRoots(
    dataRoot = process.env.COSMOS_DATA_ROOT?.trim() || ".cosmos",
    workspaceRoot = process.env.COSMOS_WORKSPACE_ROOT ?? process.cwd(),
): StorageRoots {
    const root = resolve(workspaceRoot, dataRoot);
    const databasePath = join(root, "cosmos.sqlite");

    return {
        dataRoot: root,
        databasePath,
        databaseUrl: `file:${databasePath.replaceAll("\\", "/")}`,
        blobRoot: join(root, "blobs"),
        artifactRoot: join(root, "artifacts"),
        cacheRoot: join(root, "cache"),
        logRoot: join(root, "logs"),
        secretRoot: join(root, "secrets"),
    };
}

export function createPrismaClient(
    dataRoot = process.env.COSMOS_DATA_ROOT?.trim() || ".cosmos",
): PrismaClient {
    const roots = resolveStorageRoots(dataRoot);

    return new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL || roots.databaseUrl,
            },
        },
    });
}

export function resolveContainedPath(root: string, child: string): string {
    const resolvedRoot = resolve(root);
    const resolvedChild = resolve(resolvedRoot, child);
    const childRelativeToRoot = relative(resolvedRoot, resolvedChild);

    if (
        childRelativeToRoot.startsWith("..") ||
        childRelativeToRoot.includes(":") ||
        resolve(resolvedRoot, childRelativeToRoot) !== resolvedChild
    ) {
        throw new Error("Path escapes the configured storage root.");
    }

    return resolvedChild;
}

export class PrismaCosmosRepository implements CosmosRepository {
    readonly roots: StorageRoots;
    readonly prisma: PrismaClient;
    readonly blobs: FileBlobStore;
    private readonly logger?: LoggerPort;

    constructor(options: {
        dataRoot?: string;
        prisma?: PrismaClient;
        blobs?: FileBlobStore;
        logger?: LoggerPort;
    } = {}) {
        this.roots = resolveStorageRoots(options.dataRoot);
        this.prisma = options.prisma ?? createPrismaClient(this.roots.dataRoot);
        this.blobs = options.blobs ?? new FileBlobStore({
            root: this.roots.blobRoot,
        });
        this.logger = options.logger;
    }

    async initialize(): Promise<void> {
        const startedAt = Date.now();
        this.logger?.info("storage.initialize.started");
        try {
            await this.prisma.$connect();
            await this.prisma.$executeRawUnsafe(`
                CREATE VIRTUAL TABLE IF NOT EXISTS entry_search USING fts5(
                    entry_id UNINDEXED,
                    title,
                    content_text,
                    tokenize = 'unicode61'
                )
            `);
            this.logger?.info("storage.initialize.completed", {
                durationMs: Date.now() - startedAt,
            });
        } catch (error) {
            this.logger?.error("storage.initialize.failed", {
                durationMs: Date.now() - startedAt,
            }, error);
            throw error;
        }
    }

    async close(): Promise<void> {
        this.logger?.debug("storage.close.started");
        try {
            await this.prisma.$disconnect();
            this.logger?.debug("storage.close.completed");
        } catch (error) {
            this.logger?.error("storage.close.failed", {}, error);
            throw error;
        }
    }

    async createSource(input: CreateSourceCommand): Promise<SourceSnapshot> {
        const source = await this.prisma.sourceInstance.create({
            data: {
                name: input.name,
                kind: input.kind,
                configJson: JSON.stringify(input.config),
                enabled: input.enabled ?? true,
            },
        });
        return this.toSourceSnapshot(source);
    }

    async listSources(): Promise<readonly SourceSnapshot[]> {
        const sources = await this.prisma.sourceInstance.findMany({
            orderBy: { createdAt: "asc" },
        });
        return Promise.all(sources.map((source) => this.toSourceSnapshot(source)));
    }

    async getSource(sourceId: string): Promise<SourceSnapshot | null> {
        const source = await this.prisma.sourceInstance.findUnique({
            where: { id: sourceId },
        });
        return source ? this.toSourceSnapshot(source) : null;
    }

    async setSourceEnabled(
        sourceId: string,
        enabled: boolean,
    ): Promise<SourceSnapshot> {
        const source = await this.prisma.sourceInstance.update({
            where: { id: sourceId },
            data: { enabled },
        });
        return this.toSourceSnapshot(source);
    }

    async createRun(input: {
        sourceId: string;
        triggerKind: "manual" | "schedule";
    }): Promise<Awaited<ReturnType<CosmosRepository["getRun"]>> extends infer T
        ? Exclude<T, null>
        : never> {
        const now = new Date();
        try {
            const run = await this.prisma.$transaction(async (tx) => {
            const created = await tx.run.create({
                data: {
                    sourceInstanceId: input.sourceId,
                    triggerKind: input.triggerKind,
                    status: "running",
                    startedAt: now,
                },
            });
            const step = await tx.step.create({
                data: {
                    runId: created.id,
                    position: 0,
                    kind: "ingest",
                    status: "running",
                    startedAt: now,
                },
            });
            await tx.job.create({
                data: {
                    runId: created.id,
                    stepId: step.id,
                    kind: "source-ingest",
                    status: "leased",
                    payloadJson: JSON.stringify({ sourceId: input.sourceId }),
                    idempotencyKey: `run:${created.id}:ingest`,
                    attempts: 1,
                    leaseOwner: "synchronous-ingest",
                    leaseToken: randomUUID(),
                    leaseExpiresAt: new Date(now.getTime() + 5 * 60_000),
                },
            });
            await appendDomainEvent(tx, {
                type: "run.queued.v1",
                aggregateType: "Run",
                aggregateId: created.id,
                runId: created.id,
                payload: { runId: created.id, sourceId: input.sourceId },
            });
            return created;
            });
            return this.toRunSnapshot(run);
        } catch (error) {
            this.logger?.error("storage.run.create.failed", {
                sourceId: input.sourceId,
                triggerKind: input.triggerKind,
            }, error);
            throw error;
        }
    }

    async createQueuedRun(input: {
        sourceId: string;
        triggerKind: "manual" | "schedule";
        idempotencyKey?: string;
    }) {
        try {
            const run = await this.prisma.$transaction(async (tx) => {
            if (input.idempotencyKey) {
                const existingJob = await tx.job.findUnique({
                    where: { idempotencyKey: input.idempotencyKey },
                    include: { run: true },
                });
                if (existingJob?.run) {
                    return existingJob.run;
                }
            }

            const created = await tx.run.create({
                data: {
                    sourceInstanceId: input.sourceId,
                    triggerKind: input.triggerKind,
                    status: "queued",
                },
            });
            const step = await tx.step.create({
                data: {
                    runId: created.id,
                    position: 0,
                    kind: "ingest",
                    status: "queued",
                },
            });
            await tx.job.create({
                data: {
                    runId: created.id,
                    stepId: step.id,
                    kind: "source-ingest",
                    status: "queued",
                    payloadJson: JSON.stringify({ sourceId: input.sourceId }),
                    idempotencyKey: input.idempotencyKey ?? `run:${created.id}:ingest`,
                },
            });
            await appendDomainEvent(tx, {
                type: "run.queued.v1",
                aggregateType: "Run",
                aggregateId: created.id,
                runId: created.id,
                payload: { runId: created.id, sourceId: input.sourceId },
            });
            return created;
            });
            return this.toRunSnapshot(run);
        } catch (error) {
            this.logger?.error("storage.run.queue.failed", {
                sourceId: input.sourceId,
                triggerKind: input.triggerKind,
            }, error);
            throw error;
        }
    }

    async createProbeJob(input: {
        sourceId: string;
        idempotencyKey?: string;
    }): Promise<JobSnapshot> {
        try {
            const job = await this.prisma.$transaction(async (tx) => {
            if (input.idempotencyKey) {
                const existing = await tx.job.findUnique({
                    where: { idempotencyKey: input.idempotencyKey },
                });
                if (existing) {
                    return existing;
                }
            }

            const created = await tx.job.create({
                data: {
                    kind: "source-probe",
                    status: "queued",
                    payloadJson: JSON.stringify({ sourceId: input.sourceId }),
                    idempotencyKey: input.idempotencyKey
                        ?? `probe:${input.sourceId}:${randomUUID()}`,
                },
            });
            await appendDomainEvent(tx, {
                type: "job.queued.v1",
                aggregateType: "Job",
                aggregateId: created.id,
                payload: {
                    jobId: created.id,
                    kind: created.kind,
                    sourceId: input.sourceId,
                },
            });
            return created;
            });
            return this.toJobSnapshot(job);
        } catch (error) {
            this.logger?.error("storage.job.queue.failed", {
                sourceId: input.sourceId,
                kind: "source-probe",
            }, error);
            throw error;
        }
    }

    async startRun(runId: string, lease?: JobLease) {
        const now = new Date();
        let run: Prisma.RunGetPayload<{}>;
        try {
            run = await this.prisma.$transaction(async (tx) => {
                if (lease) {
                    await assertJobLease(tx, runId, lease);
                }
                const updated = await tx.run.update({
                    where: { id: runId },
                    data: {
                        status: "running",
                        startedAt: now,
                        finishedAt: null,
                    },
                });
                await tx.step.updateMany({
                    where: { runId },
                    data: {
                        status: "running",
                        attempts: { increment: 1 },
                        startedAt: now,
                        finishedAt: null,
                    },
                });
                await appendDomainEvent(tx, {
                    type: "run.started.v1",
                    aggregateType: "Run",
                    aggregateId: runId,
                    runId,
                    payload: { runId },
                });
                return updated;
            });
        } catch (error) {
            this.logger?.error("storage.run.start.failed", {
                runId,
                ...(lease ? { jobId: lease.jobId } : {}),
            }, error);
            throw error;
        }
        return this.toRunSnapshot(run);
    }

    async getRun(runId: string) {
        const run = await this.prisma.run.findUnique({
            where: { id: runId },
        });
        return run ? this.toRunSnapshot(run) : null;
    }

    async getJob(jobId: string): Promise<JobSnapshot | null> {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId },
        });
        return job ? this.toJobSnapshot(job) : null;
    }

    async getCheckpoint(sourceId: string): Promise<string | null> {
        const checkpoint = await this.prisma.checkpoint.findUnique({
            where: { sourceInstanceId: sourceId },
        });
        return checkpoint?.cursor ?? null;
    }

    async claimNextJob(input: {
        owner: string;
        leaseMs: number;
    }) {
        const now = new Date();
        try {
            return await this.prisma.$transaction(async (tx) => {
            const candidate = await tx.job.findFirst({
                where: {
                    OR: [
                        {
                            status: { in: ["queued", "retry_wait"] },
                            OR: [
                                { nextAttemptAt: null },
                                { nextAttemptAt: { lte: now } },
                            ],
                        },
                        {
                            status: "leased",
                            leaseExpiresAt: { lte: now },
                        },
                    ],
                },
                orderBy: { createdAt: "asc" },
            });
            if (!candidate) {
                return null;
            }

            if (candidate.attempts >= candidate.maxAttempts) {
                const sourceId = readPayloadSourceId(candidate.payloadJson);
                await tx.job.update({
                    where: { id: candidate.id },
                    data: {
                        status: "failed_terminal",
                        errorMessage: "Job exceeded its maximum attempts.",
                        leaseOwner: null,
                        leaseToken: null,
                        leaseExpiresAt: null,
                    },
                });
                if (candidate.runId) {
                    await tx.run.update({
                        where: { id: candidate.runId },
                        data: {
                            status: "failed",
                            finishedAt: now,
                            errorMessage: "Job exceeded its maximum attempts.",
                        },
                    });
                }
                await appendDomainEvent(tx, {
                    type: "job.failed_terminal.v1",
                    aggregateType: "Job",
                    aggregateId: candidate.id,
                    runId: candidate.runId,
                    payload: {
                        jobId: candidate.id,
                        runId: candidate.runId,
                        reason: "max_attempts",
                    },
                });
                this.logger?.error("job.failed_terminal", {
                    jobId: candidate.id,
                    runId: candidate.runId,
                    ...(sourceId ? { sourceId } : {}),
                    attempts: candidate.attempts,
                    maxAttempts: candidate.maxAttempts,
                    errorCode: "max_attempts",
                });
                return null;
            }

            const leaseToken = randomUUID();
            const leaseGuard = candidate.status === "leased"
                ? {
                    leaseToken: candidate.leaseToken,
                    leaseExpiresAt: candidate.leaseExpiresAt,
                }
                : {};
            const updated = await tx.job.updateMany({
                where: {
                    id: candidate.id,
                    status: candidate.status,
                    ...leaseGuard,
                },
                data: {
                    status: "leased",
                    attempts: { increment: 1 },
                    leaseOwner: input.owner,
                    leaseToken,
                    leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
                    nextAttemptAt: null,
                },
            });
            if (updated.count !== 1) {
                const sourceId = readPayloadSourceId(candidate.payloadJson);
                this.logger?.debug("job.claim_rejected", {
                    jobId: candidate.id,
                    ...(candidate.runId ? { runId: candidate.runId } : {}),
                    ...(sourceId ? { sourceId } : {}),
                    owner: input.owner,
                    status: candidate.status,
                    reason: "lease_competition",
                });
                return null;
            }
            await appendDomainEvent(tx, {
                type: "job.leased.v1",
                aggregateType: "Job",
                aggregateId: candidate.id,
                runId: candidate.runId,
                payload: {
                    jobId: candidate.id,
                    runId: candidate.runId,
                    owner: input.owner,
                    attempts: candidate.attempts + 1,
                },
            });
            return {
                id: candidate.id,
                runId: candidate.runId,
                kind: candidate.kind,
                leaseToken,
                attempts: candidate.attempts + 1,
                maxAttempts: candidate.maxAttempts,
                payload: candidate.payloadJson
                    ? JSON.parse(candidate.payloadJson) as unknown
                    : null,
            };
            });
        } catch (error) {
            this.logger?.error("storage.job.claim.failed", {
                owner: input.owner,
            }, error);
            throw error;
        }
    }

    async renewJobLease(input: {
        jobId: string;
        leaseToken: string;
        leaseMs: number;
    }): Promise<boolean> {
        try {
            const result = await this.prisma.job.updateMany({
                where: {
                    id: input.jobId,
                    leaseToken: input.leaseToken,
                    status: "leased",
                },
                data: {
                    leaseExpiresAt: new Date(Date.now() + input.leaseMs),
                },
            });
            return result.count === 1;
        } catch (error) {
            this.logger?.error("storage.job.lease_renew.failed", {
                jobId: input.jobId,
            }, error);
            throw error;
        }
    }

    async completeJob(input: {
        jobId: string;
        leaseToken: string;
        status: "succeeded" | "retry_wait" | "failed_terminal";
        error?: string | null;
        errorCode?: string | null;
        result?: unknown;
        retryDelayMs?: number;
    }): Promise<boolean> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const job = await tx.job.findFirst({
                    where: {
                        id: input.jobId,
                        leaseToken: input.leaseToken,
                        status: "leased",
                    },
                });
                if (!job) {
                    return false;
                }
                await tx.job.update({
                    where: { id: input.jobId },
                    data: {
                        status: input.status,
                        errorMessage: input.error ?? null,
                        errorCode: input.errorCode ?? null,
                        resultJson: input.result === undefined
                            ? undefined
                            : JSON.stringify(input.result),
                        leaseExpiresAt: null,
                        leaseOwner: null,
                        leaseToken: null,
                        nextAttemptAt: input.status === "retry_wait"
                            ? new Date(Date.now() + (input.retryDelayMs ?? 30_000))
                            : null,
                    },
                });
                await appendDomainEvent(tx, {
                    type: `job.${input.status}.v1`,
                    aggregateType: "Job",
                    aggregateId: input.jobId,
                    runId: job.runId,
                    payload: {
                        jobId: input.jobId,
                        runId: job.runId,
                        status: input.status,
                        error: input.error ?? null,
                        errorCode: input.errorCode ?? null,
                        result: input.result ?? null,
                    },
                });
                return true;
            });
        } catch (error) {
            this.logger?.error("storage.job.complete.failed", {
                jobId: input.jobId,
                status: input.status,
                errorCode: input.errorCode ?? null,
            }, error);
            throw error;
        }
    }

    async resetRunForRetry(input: {
        runId: string;
        error?: string | null;
        lease?: JobLease;
    }) {
        const now = new Date();
        let run: Prisma.RunGetPayload<{}>;
        try {
            run = await this.prisma.$transaction(async (tx) => {
                if (input.lease) {
                    await assertJobLease(tx, input.runId, input.lease);
                }
                const updated = await tx.run.update({
                    where: { id: input.runId },
                    data: {
                        status: "queued",
                        startedAt: null,
                        finishedAt: null,
                        errorMessage: input.error ?? null,
                    },
                });
                await tx.step.updateMany({
                    where: { runId: input.runId },
                    data: {
                        status: "queued",
                        startedAt: null,
                        finishedAt: null,
                        errorMessage: input.error ?? null,
                    },
                });
                await appendDomainEvent(tx, {
                    type: "run.retry_wait.v1",
                    aggregateType: "Run",
                    aggregateId: input.runId,
                    runId: input.runId,
                    payload: {
                        runId: input.runId,
                        error: input.error ?? null,
                        at: now.toISOString(),
                    },
                });
                return updated;
            });
        } catch (error) {
            this.logger?.error("storage.run.retry_reset.failed", {
                runId: input.runId,
                ...(input.lease ? { jobId: input.lease.jobId } : {}),
            }, error);
            throw error;
        }
        return this.toRunSnapshot(run);
    }

    async persistIngestItem(input: {
        sourceId: string;
        runId: string;
        item: NormalizedIngestItem;
    }): Promise<PersistIngestItemResult> {
        const startedAt = Date.now();
        try {
            const result = await this.persistIngestItemInternal(input);
            this.logger?.debug("storage.persist_ingest.completed", {
                sourceId: input.sourceId,
                runId: input.runId,
                createdEntry: result.createdEntry,
                revisedEntry: result.revisedEntry,
                duplicateObservation: result.duplicateObservation,
                durationMs: Date.now() - startedAt,
            });
            return result;
        } catch (error) {
            this.logger?.error("storage.persist_ingest.failed", {
                sourceId: input.sourceId,
                runId: input.runId,
                durationMs: Date.now() - startedAt,
            }, error);
            throw error;
        }
    }

    private async persistIngestItemInternal(input: {
        sourceId: string;
        runId: string;
        item: NormalizedIngestItem;
    }): Promise<PersistIngestItemResult> {
        const externalKey = deriveExternalKey(input.item);
        const contentFingerprint = fingerprintEntryRevision({
            title: input.item.title,
            summary: input.item.summary,
            contentText: input.item.contentText,
            webUrl: input.item.webUrl,
            kind: input.item.kind,
            publisher: input.item.publisher,
        });
        const publishedAtJson = input.item.publishedAt
            ? JSON.stringify(input.item.publishedAt)
            : null;
        const updatedAtJson = input.item.updatedAt
            ? JSON.stringify(input.item.updatedAt)
            : null;
        const sourcePublishedAt = temporalProjection(input.item.publishedAt);
        const sourcePublishedAtDate = sourcePublishedAt
            ? new Date(sourcePublishedAt)
            : null;
        const publisherJson = input.item.publisher
            ? JSON.stringify(input.item.publisher)
            : null;
        const metricsJson = input.item.metrics
            ? JSON.stringify(input.item.metrics)
            : null;
        let rawPayload: Awaited<ReturnType<FileBlobStore["put"]>>;
        try {
            rawPayload = await this.blobs.put(
                new TextEncoder().encode(input.item.rawPayload),
                {
                    mimeType: input.item.rawPayloadMimeType
                        ?? "application/octet-stream",
                },
            );
        } catch (error) {
            this.logger?.error("storage.blob.put.failed", {
                sourceId: input.sourceId,
                runId: input.runId,
                kind: "raw_payload",
                byteSize: Buffer.byteLength(input.item.rawPayload, "utf8"),
            }, error);
            throw error;
        }
        const storedAssets = await Promise.all(input.item.assets.map(async (asset, index) => {
            if (!asset.content || asset.status !== "saved") {
                return {
                    ...asset,
                    storageKey: null,
                };
            }
            let stored: Awaited<ReturnType<FileBlobStore["put"]>>;
            try {
                stored = await this.blobs.put(asset.content, {
                    mimeType: asset.mimeType,
                });
            } catch (error) {
                this.logger?.error("storage.blob.put.failed", {
                    sourceId: input.sourceId,
                    runId: input.runId,
                    kind: "asset",
                    assetKind: asset.kind,
                    assetIndex: index,
                    byteSize: asset.content.byteLength,
                }, error);
                throw error;
            }
            return {
                ...asset,
                storageKey: stored.key,
                byteSize: stored.byteSize,
            };
        }));

        return this.prisma.$transaction(async (tx) => {
            const existingObservation = await tx.observation.findFirst({
                where: {
                    sourceInstanceId: input.sourceId,
                    runId: input.runId,
                    externalKey,
                },
            });
            if (existingObservation) {
                return {
                    createdEntry: false,
                    revisedEntry: false,
                    duplicateObservation: true,
                };
            }

            const existingEntry = await tx.entry.findUnique({
                where: {
                    sourceInstanceId_canonicalExternalId: {
                        sourceInstanceId: input.sourceId,
                        canonicalExternalId: externalKey,
                    },
                },
                include: {
                    currentRevision: true,
                },
            });
            const observation = await tx.observation.create({
                data: {
                    sourceInstanceId: input.sourceId,
                    runId: input.runId,
                    entryId: existingEntry?.id,
                    externalId: input.item.externalId ?? null,
                    externalKey,
                    externalRevision: contentFingerprint,
                    eventKind: existingEntry ? "update" : "create",
                    sourceLocatorJson: JSON.stringify(input.item.sourceLocator),
                    discoveryContextJson: JSON.stringify({
                        kind: "manual",
                    }),
                    webUrl: input.item.webUrl,
                    payloadBlobKey: rawPayload.key,
                    title: input.item.title,
                    contentText: input.item.contentText,
                    contentFingerprint,
                    contentKind: input.item.kind,
                    publisherJson,
                    metricsJson,
                    publishedAtJson,
                    updatedAtJson,
                    sourcePublishedAt: sourcePublishedAtDate,
                },
            });

            if (
                existingEntry?.currentRevision?.contentFingerprint === contentFingerprint
            ) {
                const revisionUpdate: {
                    publishedAtJson?: string;
                    updatedAtJson?: string;
                    sourcePublishedAt?: Date;
                } = {};
                if (
                    sourcePublishedAtDate
                    && existingEntry.currentRevision.sourcePublishedAt?.getTime()
                        !== sourcePublishedAtDate.getTime()
                ) {
                    revisionUpdate.publishedAtJson = publishedAtJson ?? undefined;
                    revisionUpdate.sourcePublishedAt = sourcePublishedAtDate;
                }
                if (
                    updatedAtJson
                    && existingEntry.currentRevision.updatedAtJson !== updatedAtJson
                ) {
                    revisionUpdate.updatedAtJson = updatedAtJson;
                }
                if (Object.keys(revisionUpdate).length > 0) {
                    await tx.entryRevision.update({
                        where: { id: existingEntry.currentRevision.id },
                        data: revisionUpdate,
                    });
                }
                if (metricsJson) {
                    await tx.entry.update({
                        where: { id: existingEntry.id },
                        data: { metricsJson },
                    });
                }
                await tx.run.update({
                    where: { id: input.runId },
                    data: {
                        itemCount: { increment: 1 },
                        duplicateObservationCount: { increment: 1 },
                    },
                });
                return {
                    createdEntry: false,
                    revisedEntry: false,
                    duplicateObservation: true,
                };
            }

            const entry = existingEntry ?? await tx.entry.create({
                data: {
                    sourceInstanceId: input.sourceId,
                    canonicalExternalId: externalKey,
                },
            });
            if (!existingEntry) {
                await tx.observation.update({
                    where: { id: observation.id },
                    data: { entryId: entry.id },
                });
            }
            const revisionNumber = (existingEntry?.currentRevision?.revision ?? 0) + 1;
            const revision = await tx.entryRevision.create({
                data: {
                    entryId: entry.id,
                    revision: revisionNumber,
                    title: input.item.title,
                    summary: input.item.summary,
                    contentText: input.item.contentText,
                    contentFingerprint,
                    contentKind: input.item.kind,
                    publisherJson,
                    publishedAtJson,
                    updatedAtJson,
                    webUrl: input.item.webUrl,
                    sourcePublishedAt: sourcePublishedAtDate,
                },
            });

            const storyProjection = projectEntryToStory({
                entryId: entry.id,
                revisionId: revision.id,
                title: input.item.title,
                summary: input.item.summary,
                contentKind: input.item.kind,
            });
            const storyId = existingEntry?.storyId ?? storyProjection.id;
            await tx.story.upsert({
                where: { id: storyId },
                create: {
                    id: storyId,
                    kind: storyProjection.kind,
                },
                update: {
                    kind: storyProjection.kind,
                },
            });
            const storyRevision = await tx.storyRevision.create({
                data: {
                    story: {
                        connect: { id: storyId },
                    },
                    title: input.item.title,
                    summary: input.item.summary,
                },
            });

            await tx.entry.update({
                where: { id: entry.id },
                data: {
                    storyId,
                    currentRevisionId: revision.id,
                    ...(metricsJson ? { metricsJson } : {}),
                },
            });
            await tx.story.update({
                where: { id: storyId },
                data: {
                    currentRevisionId: storyRevision.id,
                },
            });

            for (const asset of storedAssets) {
                await tx.asset.create({
                    data: {
                        entryRevisionId: revision.id,
                        kind: asset.kind,
                        status: asset.status,
                        sourceUrl: asset.sourceUrl,
                        storageKey: asset.storageKey,
                        mimeType: asset.mimeType,
                        byteSize: asset.byteSize,
                    },
                });
            }

            await tx.$executeRawUnsafe(
                "DELETE FROM entry_search WHERE entry_id = ?",
                entry.id,
            );
            await tx.$executeRawUnsafe(
                "INSERT INTO entry_search (entry_id, title, content_text) VALUES (?, ?, ?)",
                entry.id,
                input.item.title,
                input.item.contentText,
            );
            await tx.domainEvent.create({
                data: {
                    eventId: randomUUID(),
                    type: existingEntry ? "entry.revised.v1" : "entry.created.v1",
                    version: "v1",
                    payloadJson: JSON.stringify({
                        observationId: observation.id,
                        entryId: entry.id,
                        revisionId: revision.id,
                        storyId,
                    }),
                    aggregateType: "Entry",
                    aggregateId: entry.id,
                    runId: input.runId,
                },
            });
            await appendDomainEvent(tx, {
                type: "feed.updated.v1",
                aggregateType: "Feed",
                aggregateId: storyId,
                runId: input.runId,
                payload: {
                    storyId,
                    entryId: entry.id,
                    revisionId: revision.id,
                },
            });
            await tx.run.update({
                where: { id: input.runId },
                data: {
                    itemCount: { increment: 1 },
                    createdEntryCount: existingEntry
                        ? undefined
                        : { increment: 1 },
                    revisedEntryCount: existingEntry
                        ? { increment: 1 }
                        : undefined,
                },
            });

            return {
                createdEntry: !existingEntry,
                revisedEntry: Boolean(existingEntry),
                duplicateObservation: false,
            };
        });
    }

    async setCheckpoint(sourceId: string, cursor: string | null): Promise<void> {
        try {
            await this.prisma.checkpoint.upsert({
                where: { sourceInstanceId: sourceId },
                create: {
                    sourceInstanceId: sourceId,
                    cursor,
                },
                update: { cursor },
            });
        } catch (error) {
            this.logger?.error("storage.checkpoint.failed", {
                sourceId,
            }, error);
            throw error;
        }
    }

    async completeRun(input: {
        runId: string;
        status: "succeeded" | "failed" | "cancelled";
        error?: string | null;
        lease?: JobLease;
    }) {
        const now = new Date();
        let run: Prisma.RunGetPayload<{}>;
        try {
            run = await this.prisma.$transaction(async (tx) => {
                if (input.lease) {
                    await assertJobLease(tx, input.runId, input.lease);
                }
                const updated = await tx.run.update({
                    where: { id: input.runId },
                    data: {
                        status: input.status,
                        finishedAt: now,
                        errorMessage: input.error ?? null,
                    },
                });
                await tx.step.updateMany({
                    where: { runId: input.runId },
                    data: {
                        status: input.status,
                        finishedAt: now,
                        errorMessage: input.error ?? null,
                    },
                });
                if (!input.lease) {
                    await tx.job.updateMany({
                        where: { runId: input.runId },
                        data: {
                            status: input.status === "succeeded"
                                ? "succeeded"
                                : input.status === "cancelled"
                                    ? "cancelled"
                                    : "failed_terminal",
                            leaseExpiresAt: null,
                            leaseOwner: null,
                            leaseToken: null,
                        },
                    });
                }
                await appendDomainEvent(tx, {
                    type: `run.${input.status}.v1`,
                    aggregateType: "Run",
                    aggregateId: input.runId,
                    runId: input.runId,
                    payload: {
                        runId: input.runId,
                        status: input.status,
                        error: input.error ?? null,
                    },
                });
                return updated;
            });
        } catch (error) {
            this.logger?.error("storage.run.complete.failed", {
                runId: input.runId,
                status: input.status,
                ...(input.lease ? { jobId: input.lease.jobId } : {}),
            }, error);
            throw error;
        }
        return this.toRunSnapshot(run);
    }

    async feed(input: {
        cursor?: string;
        limit: number;
    }): Promise<FeedPage> {
        const offset = parseCursor(input.cursor);
        const entries = await this.prisma.entry.findMany({
            orderBy: { updatedAt: "desc" },
            skip: offset,
            take: input.limit + 1,
            include: this.entryInclude(),
        });
        const hasNext = entries.length > input.limit;
        const items = entries.slice(0, input.limit).map((entry) => this.toFeedItem(entry));

        return {
            items,
            nextCursor: hasNext ? String(offset + input.limit) : null,
        };
    }

    async search(input: SearchQuery): Promise<SearchPage> {
        const parsed = {
            text: input.text?.trim() ?? "",
            sourceId: input.sourceId,
            publishedAfter: input.publishedAfter
                ? new Date(input.publishedAfter)
                : null,
            publishedBefore: input.publishedBefore
                ? new Date(input.publishedBefore)
                : null,
            cursor: parseCursor(input.cursor),
            limit: Number(input.limit ?? 20),
        };
        if (
            (parsed.publishedAfter && Number.isNaN(parsed.publishedAfter.getTime()))
            || (parsed.publishedBefore && Number.isNaN(parsed.publishedBefore.getTime()))
        ) {
            throw new Error("Search date filters must be valid ISO timestamps.");
        }

        const conditions: string[] = [];
        const parameters: unknown[] = [];
        if (parsed.text) {
            conditions.push("entry_search MATCH ?");
            parameters.push(parsed.text);
        }
        if (parsed.sourceId) {
            conditions.push("e.sourceInstanceId = ?");
            parameters.push(parsed.sourceId);
        }
        if (parsed.publishedAfter) {
            conditions.push("r.sourcePublishedAt >= ?");
            parameters.push(parsed.publishedAfter.getTime());
        }
        if (parsed.publishedBefore) {
            conditions.push("r.sourcePublishedAt <= ?");
            parameters.push(parsed.publishedBefore.getTime());
        }
        const fromClause = parsed.text
            ? "FROM entry_search JOIN Entry e ON e.id = entry_search.entry_id"
            : "FROM Entry e";
        const rankSelect = parsed.text ? "bm25(entry_search)" : "0.0";
        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";
        const orderClause = parsed.text
            ? "ORDER BY rank ASC, e.updatedAt DESC"
            : "ORDER BY e.updatedAt DESC";
        parameters.push(parsed.limit + 1, parsed.cursor);
        const rows = await this.prisma.$queryRawUnsafe<Array<{
            entryId: string;
            storyId: string;
            storyKind: string;
            title: string;
            summary: string | null;
            sourceId: string;
            sourceName: string;
            sourceKind: string;
            revisionId: string;
            publishedAt: string | null;
            rank: number;
        }>>(
            `
                SELECT
                    e.id AS entryId,
                    e.storyId AS storyId,
                    story.kind AS storyKind,
                    r.title AS title,
                    r.summary AS summary,
                    s.id AS sourceId,
                    s.name AS sourceName,
                    s.kind AS sourceKind,
                    r.id AS revisionId,
                    r.sourcePublishedAt AS publishedAt,
                    ${rankSelect} AS rank
                ${fromClause}
                JOIN EntryRevision r ON r.id = e.currentRevisionId
                JOIN SourceInstance s ON s.id = e.sourceInstanceId
                JOIN Story story ON story.id = e.storyId
                ${whereClause}
                ${orderClause}
                LIMIT ? OFFSET ?
            `,
            ...parameters,
        );
        const hasNext = rows.length > parsed.limit;
        const items = await Promise.all(
            rows.slice(0, parsed.limit).map(async (row) => ({
                ...this.toFeedItemFromSearchRow(row),
                assets: await this.assetsForRevision(row.revisionId),
                rank: row.rank,
            })),
        );

        return {
            items,
            nextCursor: hasNext ? String(parsed.cursor + parsed.limit) : null,
        };
    }

    async entries(input: {
        sourceId?: string;
        cursor?: string;
        limit: number;
    }): Promise<EntryPage> {
        const offset = parseCursor(input.cursor);
        const entries = await this.prisma.entry.findMany({
            where: {
                currentRevisionId: { not: null },
                sourceInstanceId: input.sourceId,
            },
            orderBy: { updatedAt: "desc" },
            skip: offset,
            take: input.limit + 1,
            include: {
                sourceInstance: true,
                currentRevision: {
                    include: { assets: true },
                },
                _count: {
                    select: {
                        observations: true,
                        revisions: true,
                    },
                },
            },
        });
        const hasNext = entries.length > input.limit;
        const items = entries.slice(0, input.limit).flatMap((entry) => {
            if (!entry.currentRevision) {
                return [];
            }
            return [{
                id: entry.id,
                sourceId: entry.sourceInstance.id,
                sourceName: entry.sourceInstance.name,
                sourceKind: sourceKindSchema.parse(entry.sourceInstance.kind),
                storyId: entry.storyId,
                currentRevisionId: entry.currentRevision.id,
                title: entry.currentRevision.title,
                summary: entry.currentRevision.summary,
                webUrl: entry.currentRevision.webUrl,
                contentKind: contentKindSchema.parse(entry.currentRevision.contentKind),
                publisher: parseJson<Publisher>(entry.currentRevision.publisherJson),
                metrics: parseJson<ContentMetrics>(entry.metricsJson),
                publishedAt: entry.currentRevision.sourcePublishedAt?.toISOString() ?? null,
                updatedAt: entry.updatedAt.toISOString(),
                revisionCount: entry._count.revisions,
                observationCount: entry._count.observations,
                assets: entry.currentRevision.assets.map((asset) => this.toAssetSnapshot(asset)),
            }];
        });

        return {
            items,
            nextCursor: hasNext ? String(offset + input.limit) : null,
        };
    }

    async story(storyId: string): Promise<StoryDetail | null> {
        const story = await this.prisma.story.findUnique({
            where: { id: storyId },
            include: {
                currentRevision: true,
                entries: {
                    orderBy: { updatedAt: "desc" },
                    take: 1,
                    include: {
                        sourceInstance: true,
                        currentRevision: {
                            include: { assets: true },
                        },
                        revisions: {
                            orderBy: { revision: "desc" },
                            include: { assets: true },
                        },
                        observations: {
                            orderBy: { capturedAt: "desc" },
                        },
                    },
                },
            },
        });
        const entry = story?.entries[0];
        if (!story || !story.currentRevision || !entry || !entry.currentRevision) {
            return null;
        }

        return {
            story: {
                id: story.id,
                kind: story.kind as "event" | "document" | "media" | "thread",
                subtype: story.subtype,
                revisionId: story.currentRevision.id,
                title: story.currentRevision.title,
                summary: story.currentRevision.summary,
            },
            entry: {
                id: entry.id,
                sourceId: entry.sourceInstance.id,
                sourceName: entry.sourceInstance.name,
                sourceKind: sourceKindSchema.parse(entry.sourceInstance.kind),
                currentRevisionId: entry.currentRevision.id,
                metrics: parseJson<ContentMetrics>(entry.metricsJson),
                revisions: entry.revisions.map((revision) => ({
                    id: revision.id,
                    revision: revision.revision,
                    title: revision.title,
                    summary: revision.summary,
                    contentText: revision.contentText,
                    webUrl: revision.webUrl,
                    contentKind: contentKindSchema.parse(revision.contentKind),
                    publisher: parseJson<Publisher>(revision.publisherJson),
                    publishedAt: parseJson<TemporalValue>(revision.publishedAtJson)
                        ?? exactTemporalValue(revision.sourcePublishedAt),
                    updatedAt: parseJson<TemporalValue>(revision.updatedAtJson),
                    sourcePublishedAt: revision.sourcePublishedAt?.toISOString() ?? null,
                    createdAt: revision.createdAt.toISOString(),
                    assets: revision.assets.map((asset) => this.toAssetSnapshot(asset)),
                })),
                observations: entry.observations.map((observation) => ({
                    id: observation.id,
                    externalId: observation.externalId,
                    externalKey: observation.externalKey,
                    eventKind: observation.eventKind as "create" | "update" | "delete" | "snapshot",
                    webUrl: observation.webUrl,
                    capturedAt: observation.capturedAt.toISOString(),
                    sourcePublishedAt: observation.sourcePublishedAt?.toISOString() ?? null,
                })),
            },
        };
    }

    async entry(entryId: string): Promise<EntryDetail | null> {
        const entry = await this.prisma.entry.findUnique({
            where: { id: entryId },
            include: {
                sourceInstance: true,
                currentRevision: {
                    include: { assets: true },
                },
                revisions: {
                    orderBy: { revision: "desc" },
                    include: { assets: true },
                },
                observations: {
                    orderBy: { capturedAt: "desc" },
                },
            },
        });
        if (!entry || !entry.currentRevision) {
            return null;
        }
        return {
            id: entry.id,
            sourceId: entry.sourceInstance.id,
            sourceName: entry.sourceInstance.name,
            sourceKind: sourceKindSchema.parse(entry.sourceInstance.kind),
            currentRevisionId: entry.currentRevision.id,
            metrics: parseJson<ContentMetrics>(entry.metricsJson),
            revisions: entry.revisions.map((revision) => ({
                id: revision.id,
                revision: revision.revision,
                title: revision.title,
                summary: revision.summary,
                contentText: revision.contentText,
                webUrl: revision.webUrl,
                contentKind: contentKindSchema.parse(revision.contentKind),
                publisher: parseJson<Publisher>(revision.publisherJson),
                publishedAt: parseJson<TemporalValue>(revision.publishedAtJson)
                    ?? exactTemporalValue(revision.sourcePublishedAt),
                updatedAt: parseJson<TemporalValue>(revision.updatedAtJson),
                sourcePublishedAt: revision.sourcePublishedAt?.toISOString() ?? null,
                createdAt: revision.createdAt.toISOString(),
                assets: revision.assets.map((asset) => this.toAssetSnapshot(asset)),
            })),
            observations: entry.observations.map((observation) => ({
                id: observation.id,
                externalId: observation.externalId,
                externalKey: observation.externalKey,
                eventKind: observation.eventKind as "create" | "update" | "delete" | "snapshot",
                webUrl: observation.webUrl,
                capturedAt: observation.capturedAt.toISOString(),
                sourcePublishedAt: observation.sourcePublishedAt?.toISOString() ?? null,
            })),
        };
    }

    async revision(revisionId: string): Promise<RevisionDetail | null> {
        const revision = await this.prisma.entryRevision.findUnique({
            where: { id: revisionId },
            include: {
                entry: {
                    include: {
                        sourceInstance: true,
                    },
                },
                assets: true,
            },
        });
        if (!revision) {
            return null;
        }
        return {
            id: revision.id,
            entryId: revision.entryId,
            sourceId: revision.entry.sourceInstance.id,
            sourceName: revision.entry.sourceInstance.name,
            sourceKind: sourceKindSchema.parse(revision.entry.sourceInstance.kind),
            revision: revision.revision,
            title: revision.title,
            summary: revision.summary,
            contentText: revision.contentText,
            webUrl: revision.webUrl,
            contentKind: contentKindSchema.parse(revision.contentKind),
            publisher: parseJson<Publisher>(revision.publisherJson),
            publishedAt: parseJson<TemporalValue>(revision.publishedAtJson)
                ?? exactTemporalValue(revision.sourcePublishedAt),
            updatedAt: parseJson<TemporalValue>(revision.updatedAtJson),
            sourcePublishedAt: revision.sourcePublishedAt?.toISOString() ?? null,
            createdAt: revision.createdAt.toISOString(),
            assets: revision.assets.map((asset) => this.toAssetSnapshot(asset)),
        };
    }

    async events(input: {
        afterSequence: number;
        limit: number;
    }) {
        const events = await this.prisma.domainEvent.findMany({
            where: {
                sequence: {
                    gt: input.afterSequence,
                },
            },
            orderBy: { sequence: "asc" },
            take: input.limit,
        });
        return events.map((event) => ({
            id: String(event.sequence),
            type: event.type,
            version: event.version,
            occurredAt: event.occurredAt.toISOString(),
            payload: JSON.parse(event.payloadJson) as unknown,
        }));
    }

    async latestEventSequence(): Promise<number> {
        const result = await this.prisma.domainEvent.aggregate({
            _max: { sequence: true },
        });
        return result._max.sequence ?? 0;
    }

    async readAsset(assetId: string): Promise<{
        content: Uint8Array;
        mimeType: string;
    } | null> {
        try {
            const asset = await this.prisma.asset.findUnique({
                where: { id: assetId },
            });
            if (!asset?.storageKey) {
                return null;
            }
            return {
                content: await this.blobs.read(asset.storageKey),
                mimeType: asset.mimeType ?? "application/octet-stream",
            };
        } catch (error) {
            this.logger?.error("storage.asset_read.failed", {
                assetId,
            }, error);
            throw error;
        }
    }

    async touchWorkerHeartbeat(input: {
        instanceId: string;
        status: "starting" | "ready" | "stopped";
        version: string;
    }): Promise<void> {
        try {
            await this.prisma.workerHeartbeat.upsert({
                where: { instanceId: input.instanceId },
                create: {
                    instanceId: input.instanceId,
                    status: input.status,
                    version: input.version,
                    lastSeenAt: new Date(),
                    stoppedAt: input.status === "stopped" ? new Date() : null,
                },
                update: {
                    status: input.status,
                    version: input.version,
                    lastSeenAt: new Date(),
                    stoppedAt: input.status === "stopped" ? new Date() : null,
                },
            });
        } catch (error) {
            this.logger?.error("storage.worker_heartbeat.failed", {
                instanceId: input.instanceId,
                status: input.status,
            }, error);
            throw error;
        }
    }

    async health(): Promise<RepositoryHealth> {
        try {
            await this.prisma.$queryRawUnsafe("SELECT 1");
        } catch (error) {
            this.logger?.error("storage.health.failed", {
                stage: "query",
            }, error);
            return {
                storageStatus: "failed",
                migrationStatus: "failed",
                workerStatus: "unknown",
            };
        }

        let heartbeat;
        try {
            heartbeat = await this.prisma.workerHeartbeat.findFirst({
                orderBy: { lastSeenAt: "desc" },
            });
        } catch (error) {
            this.logger?.error("storage.health.failed", {
                stage: "worker_heartbeat",
            }, error);
            return {
                storageStatus: "failed",
                migrationStatus: "ready",
                workerStatus: "unknown",
            };
        }
        const workerStatus: HealthResponse["workerStatus"] = !heartbeat
            ? "unknown"
            : heartbeat.status === "stopped"
                ? "stopped"
                : heartbeat.lastSeenAt.getTime() > Date.now() - 90_000
                    ? heartbeat.status as HealthResponse["workerStatus"]
                    : "stopped";

        return {
            storageStatus: "ready",
            migrationStatus: "ready",
            workerStatus,
        };
    }

    private async toSourceSnapshot(
        source: Prisma.SourceInstanceGetPayload<{}>,
    ): Promise<SourceSnapshot> {
        const latestRun = await this.prisma.run.findFirst({
            where: { sourceInstanceId: source.id },
            orderBy: { createdAt: "desc" },
        });
        return {
            id: source.id,
            name: source.name,
            kind: sourceKindSchema.parse(source.kind),
            config: sourceConfigSchema.parse(JSON.parse(source.configJson)),
            enabled: source.enabled,
            createdAt: source.createdAt.toISOString(),
            updatedAt: source.updatedAt.toISOString(),
            lastRunAt: latestRun?.finishedAt?.toISOString()
                ?? latestRun?.createdAt.toISOString()
                ?? null,
            lastError: latestRun?.errorMessage ?? null,
        };
    }

    private toRunSnapshot(run: Prisma.RunGetPayload<{}>) {
        return {
            id: run.id,
            sourceId: run.sourceInstanceId,
            triggerKind: run.triggerKind as "manual" | "schedule",
            status: run.status as "queued" | "running" | "succeeded" | "failed" | "cancelled",
            createdAt: run.createdAt.toISOString(),
            startedAt: run.startedAt?.toISOString() ?? null,
            finishedAt: run.finishedAt?.toISOString() ?? null,
            itemCount: run.itemCount,
            createdEntryCount: run.createdEntryCount,
            revisedEntryCount: run.revisedEntryCount,
            error: run.errorMessage,
        };
    }

    private toJobSnapshot(job: Prisma.JobGetPayload<{}>): JobSnapshot {
        const payload = job.payloadJson
            ? JSON.parse(job.payloadJson) as { sourceId?: unknown }
            : null;
        const sourceId = typeof payload?.sourceId === "string"
            ? payload.sourceId
            : null;

        return {
            id: job.id,
            kind: jobKindSchema.parse(job.kind),
            sourceId,
            runId: job.runId,
            status: job.status as JobSnapshot["status"],
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            errorCode: job.errorCode,
            error: job.errorMessage,
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
            result: job.resultJson
                ? JSON.parse(job.resultJson) as unknown
                : null,
        };
    }

    private entryInclude() {
        return {
            sourceInstance: true,
            story: {
                include: {
                    currentRevision: true,
                },
            },
            currentRevision: {
                include: { assets: true },
            },
        } satisfies Prisma.EntryInclude;
    }

    private toFeedItem(
        entry: Prisma.EntryGetPayload<{ include: ReturnType<PrismaCosmosRepository["entryInclude"]> }>,
    ): FeedItem {
        if (!entry.currentRevision || !entry.story?.currentRevision) {
            throw new Error(`Entry ${entry.id} is missing its current projection.`);
        }
        return {
            storyId: entry.story.id,
            storyKind: entry.story.kind as "event" | "document" | "media" | "thread",
            title: entry.story.currentRevision.title,
            summary: entry.story.currentRevision.summary,
            entryId: entry.id,
            sourceId: entry.sourceInstance.id,
            sourceName: entry.sourceInstance.name,
            sourceKind: sourceKindSchema.parse(entry.sourceInstance.kind),
            revisionId: entry.currentRevision.id,
            publishedAt: entry.currentRevision.sourcePublishedAt?.toISOString() ?? null,
            assets: entry.currentRevision.assets.map((asset) => this.toAssetSnapshot(asset)),
        };
    }

    private toFeedItemFromSearchRow(row: {
        entryId: string;
        storyId: string;
        storyKind: string;
        title: string;
        summary: string | null;
        sourceId: string;
        sourceName: string;
        sourceKind: string;
        revisionId: string;
        publishedAt: string | null;
    }): Omit<FeedItem, "assets"> {
        return {
            storyId: row.storyId,
            storyKind: row.storyKind as "event" | "document" | "media" | "thread",
            title: row.title,
            summary: row.summary,
            entryId: row.entryId,
            sourceId: row.sourceId,
            sourceName: row.sourceName,
            sourceKind: sourceKindSchema.parse(row.sourceKind),
            revisionId: row.revisionId,
            publishedAt: row.publishedAt
                ? new Date(row.publishedAt).toISOString()
                : null,
        };
    }

    private async assetsForRevision(revisionId: string) {
        const assets = await this.prisma.asset.findMany({
            where: { entryRevisionId: revisionId },
        });
        return assets.map((asset) => this.toAssetSnapshot(asset));
    }

    private toAssetSnapshot(asset: {
        id: string;
        kind: string;
        status: string;
        sourceUrl: string | null;
        storageKey: string | null;
        mimeType: string | null;
        byteSize: number | null;
    }) {
        return {
            id: asset.id,
            kind: asset.kind,
            status: asset.status as "saved" | "metadata_only" | "skipped" | "failed",
            sourceUrl: asset.sourceUrl,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
        };
    }
}

export { PrismaWorkflowBackend } from "./workflow-backend.js";

async function assertJobLease(
    tx: Prisma.TransactionClient,
    runId: string,
    lease: JobLease,
): Promise<void> {
    const job = await tx.job.findFirst({
        where: {
            id: lease.jobId,
            runId,
            leaseToken: lease.leaseToken,
            status: "leased",
        },
    });
    if (!job) {
        throw new Error("Job lease lost.");
    }
}

async function appendDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
        type: string;
        aggregateType?: string;
        aggregateId?: string;
        runId?: string | null;
        payload: unknown;
    },
): Promise<void> {
    await tx.domainEvent.create({
        data: {
            eventId: randomUUID(),
            type: input.type,
            version: "v1",
            payloadJson: JSON.stringify(input.payload),
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            runId: input.runId ?? null,
        },
    });
}

function parseJson<T>(value: string | null): T | null {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function exactTemporalValue(date: Date | null): TemporalValue | null {
    return date
        ? {
            exact: date.toISOString(),
            exactPrecision: "second",
            fallback: null,
        }
        : null;
}

function parseCursor(cursor: string | undefined): number {
    const value = Number.parseInt(cursor ?? "0", 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readPayloadSourceId(payloadJson: string | null): string | null {
    if (!payloadJson) {
        return null;
    }
    try {
        const payload = JSON.parse(payloadJson) as {
            sourceId?: unknown;
        };
        return typeof payload.sourceId === "string" && payload.sourceId
            ? payload.sourceId
            : null;
    } catch {
        return null;
    }
}
