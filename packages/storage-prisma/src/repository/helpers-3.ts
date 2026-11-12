import { sourceKindSchema, sourceConfigSchema, sourceMediaPolicySchema, type FeedItem, type FeedPage, type HealthResponse, type CollectionDetail, type CollectionSummary, type BoardBlock, type BoardDetail, type IngestTriggerKind } from "@cosmos/contracts";
import { BoardBlockNotFoundError, BoardNotFoundError, BoardSectionNotFoundError, type MediaCleanupCandidate, type RepositoryHealth, type WorkflowAttemptSnapshot } from "@cosmos/application";
import { type Prisma } from "@prisma/client";
import { appendDomainEvent, parseCursor, parseJson, projectWorkflowAttempts, toBoardBlock } from "./repository-internals.js";
import { storyAgentPublicFailure } from "./story-agent-public-projection.js";
import { PrismaCosmosRepositoryHelpers2 } from "./helpers-2.js";

export class PrismaCosmosRepositoryHelpers3 extends PrismaCosmosRepositoryHelpers2 {
    async getRun(runId: string) {
        const run = await this.prisma.run.findUnique({
            where: { id: runId },
        });
        return run ? this.toRunSnapshot(run) : null;
    }

    async listWorkflowAttempts(jobId: string): Promise<readonly WorkflowAttemptSnapshot[]> {
        const normalizedJobId = jobId.trim();
        if (!normalizedJobId) return [];
        const [job, events] = await Promise.all([
            this.prisma.job.findUnique({
                where: { id: normalizedJobId },
                select: { status: true, attempts: true, errorCode: true, workflowRun: { select: { definitionKey: true } } },
            }),
            this.prisma.domainEvent.findMany({
                where: { aggregateType: "WorkflowActivityJob", aggregateId: normalizedJobId },
                orderBy: { sequence: "asc" },
                take: 1_000,
            }),
        ]);
        if (!job) return [];
        if (!job.workflowRun) return [];
        const attempts = projectWorkflowAttempts(normalizedJobId, events);
        if (job.workflowRun.definitionKey !== "cosmos.story-agent") return attempts;
        return attempts.map((attempt) => {
            if (attempt.status === "cancelled") return { ...attempt, error: null };
            if (!attempt.error) return attempt;
            const failure = storyAgentPublicFailure(attempt.number === job.attempts ? job.errorCode : null);
            return { ...attempt, error: { ...attempt.error, code: failure.errorCode, message: failure.message } };
        });
    }

    async listRetentionCleanupCandidates(input: {
        sourceId?: string | null;
        now?: Date;
        limit?: number;
    }): Promise<readonly MediaCleanupCandidate[]> {
        const now = input.now ?? new Date();
        const limit = input.limit ?? 200;
        const sources = await this.prisma.sourceInstance.findMany({
            where: input.sourceId ? { id: input.sourceId } : {},
            select: { id: true, name: true, plan: { select: { mediaPolicyJson: true } } },
        });
        const candidates: MediaCleanupCandidate[] = [];
        for (const source of sources) {
            // 保留期归采集计划（ADR-0023 决策 2）：来源配置里的 media 在读取切换后已移除，
            // 清理窗口必须读计划那份，否则所有来源都会被当成「没有保留期」而永不清理。
            const policyJson = source.plan?.mediaPolicyJson;
            const policy = policyJson ? sourceMediaPolicySchema.safeParse(parseJson(policyJson)) : null;
            const retentionDays = policy?.success ? policy.data.retentionDays ?? 0 : 0;
            if (retentionDays <= 0) {
                continue;
            }
            const windowMs = retentionDays * 24 * 60 * 60 * 1_000;
            const cutoff = new Date(now.getTime() - windowMs);
            const assets = await this.prisma.asset.findMany({
                where: {
                    status: "saved",
                    storageKey: { not: null },
                    createdAt: { lt: cutoff },
                    entryRevision: { entry: { sourceInstanceId: source.id } },
                },
                select: {
                    id: true,
                    storageKey: true,
                    byteSize: true,
                    createdAt: true,
                    entryRevision: { select: { title: true } },
                },
                orderBy: { createdAt: "asc" },
                take: Math.max(0, limit - candidates.length),
            });
            for (const asset of assets) {
                if (!asset.storageKey) {
                    continue;
                }
                candidates.push({
                    assetId: asset.id,
                    storageKey: asset.storageKey,
                    byteSize: asset.byteSize,
                    sourceId: source.id,
                    sourceName: source.name,
                    title: asset.entryRevision.title,
                    createdAt: asset.createdAt.toISOString(),
                    expiredAt: new Date(asset.createdAt.getTime() + windowMs).toISOString(),
                    retentionDays,
                });
                if (candidates.length >= limit) {
                    break;
                }
            }
            if (candidates.length >= limit) {
                break;
            }
        }
        return candidates;
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

    protected async isStoryShell(storyId: string): Promise<boolean> {
        const replacement = await this.prisma.storyReplacement.findFirst({
            where: { storyId },
            select: { id: true },
        });
        return replacement !== null;
    }

    protected findTopicMembership(
        tx: Prisma.TransactionClient,
        topicId: string,
        storyId: string,
    ) {
        return tx.topicMembership.findUnique({
            where: { topicId_storyId: { topicId, storyId } },
            include: { currentRevision: true },
        });
    }

    async collection(collectionId: string): Promise<CollectionDetail | null> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });
        if (!collection) {
            return null;
        }
        const items = await this.prisma.collectionItem.findMany({
            where: { collectionId },
            orderBy: { createdAt: "asc" },
            include: {
                story: {
                    include: { currentRevision: { select: { title: true } } },
                },
            },
        });
        return {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            createdAt: collection.createdAt.toISOString(),
            updatedAt: collection.updatedAt.toISOString(),
            stories: items.map((item) => ({
                storyId: item.storyId,
                title: item.story.currentRevision?.title ?? "",
                addedAt: item.createdAt.toISOString(),
            })),
        };
    }

    async moveBlock(input: {
        blockId: string;
        sectionId?: string | null;
        position: number;
    }): Promise<BoardDetail> {
        const boardId = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.boardBlock.findUnique({
                where: { id: input.blockId },
                select: { sectionId: true, section: { select: { boardId: true } } },
            });
            if (!existing) {
                throw new BoardBlockNotFoundError(input.blockId);
            }
            const targetSectionId = input.sectionId ?? existing.sectionId;
            if (input.sectionId != null && input.sectionId !== existing.sectionId) {
                const targetSection = await tx.boardSection.findUnique({
                    where: { id: input.sectionId },
                    select: { id: true },
                });
                if (!targetSection) {
                    throw new BoardSectionNotFoundError(input.sectionId);
                }
            }
            // Re-sequence the target section in memory (boards are small) and
            // write back only changed positions.
            const targetBlocks = await tx.boardBlock.findMany({
                where: { sectionId: targetSectionId },
                orderBy: { position: "asc" },
            });
            const others = targetBlocks.filter((block) => block.id !== input.blockId);
            const insertAt = Math.min(Math.max(input.position, 0), others.length);
            const positionById = new Map(others.map((block) => [block.id, block.position]));
            const orderedIds = others.map((block) => block.id);
            orderedIds.splice(insertAt, 0, input.blockId);
            for (const [index, id] of orderedIds.entries()) {
                if (id === input.blockId) {
                    await tx.boardBlock.update({
                        where: { id },
                        data: { sectionId: targetSectionId, position: index },
                    });
                    continue;
                }
                if (positionById.get(id) !== index) {
                    await tx.boardBlock.update({
                        where: { id },
                        data: { position: index },
                    });
                }
            }
            if (existing.sectionId !== targetSectionId) {
                const remaining = await tx.boardBlock.findMany({
                    where: { sectionId: existing.sectionId },
                    orderBy: { position: "asc" },
                });
                for (const [index, block] of remaining.entries()) {
                    if (block.position !== index) {
                        await tx.boardBlock.update({
                            where: { id: block.id },
                            data: { position: index },
                        });
                    }
                }
            }
            await appendDomainEvent(tx, {
                type: "board.block.moved.v1",
                aggregateType: "BoardBlock",
                aggregateId: input.blockId,
                payload: {
                    blockId: input.blockId,
                    sectionId: targetSectionId,
                    position: insertAt,
                },
            });
            return existing.section.boardId;
        });
        return this.requireBoardDetail(boardId);
    }

    protected async loadSpotlightTargetTitle(
        targetType: string,
        targetId: string,
    ): Promise<string | null> {
        if (targetType === "story") {
            const story = await this.prisma.story.findUnique({
                where: { id: targetId },
                include: { currentRevision: { select: { title: true } } },
            });
            return story?.currentRevision?.title ?? null;
        }
        if (targetType === "topic") {
            const topic = await this.prisma.topic.findUnique({
                where: { id: targetId },
                include: { currentRevision: { select: { title: true } } },
            });
            return topic?.currentRevision?.title ?? null;
        }
        return null;
    }

    protected async loadBoardDetail(boardId: string): Promise<BoardDetail | null> {
        const board = await this.prisma.board.findUnique({
            where: { id: boardId },
            include: {
                sections: {
                    orderBy: { position: "asc" },
                    include: {
                        blocks: { orderBy: { position: "asc" } },
                    },
                },
            },
        });
        if (!board) {
            return null;
        }
        return {
            id: board.id,
            name: board.name,
            description: board.description,
            sections: board.sections.map((section) => ({
                id: section.id,
                boardId: section.boardId,
                title: section.title,
                position: section.position,
                blocks: section.blocks.map(toBoardBlock),
                createdAt: section.createdAt.toISOString(),
                updatedAt: section.updatedAt.toISOString(),
            })),
            createdAt: board.createdAt.toISOString(),
            updatedAt: board.updatedAt.toISOString(),
        };
    }

    protected async requireBoardDetail(boardId: string): Promise<BoardDetail> {
        const detail = await this.loadBoardDetail(boardId);
        if (!detail) {
            throw new BoardNotFoundError(boardId);
        }
        return detail;
    }

    protected async loadCollectionSummary(collectionId: string): Promise<CollectionSummary | null> {        const row = await this.prisma.collection.findUnique({
            where: { id: collectionId },
            include: {
                _count: { select: { items: true } },
            },
        });
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            itemCount: row._count.items,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
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

    protected toRunSnapshot(run: Prisma.RunGetPayload<{}>) {
        return {
            id: run.id,
            sourceId: run.sourceInstanceId,
            triggerKind: run.triggerKind as IngestTriggerKind,
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

    protected entryInclude() {
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

    protected toFeedItem(
        entry: Prisma.EntryGetPayload<{ include: ReturnType<PrismaCosmosRepositoryHelpers3["entryInclude"]> }>,
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
            // Story 当前 Revision 的写入者，与 search 路径同义（ADR-0028）。
            producer: entry.story.currentRevision.producer,
            assets: entry.currentRevision.assets.map((asset) => this.toAssetSnapshot(asset)),
        };
    }

    protected async assetsForRevision(revisionId: string) {
        const assets = await this.prisma.asset.findMany({
            where: { entryRevisionId: revisionId },
        });
        return assets.map((asset) => this.toAssetSnapshot(asset));
    }

}
