import { randomUUID } from "node:crypto";
import { jobKindSchema, sourceKindSchema, type ConnectionInstance, type FeedItem, type JobSnapshot, type IngestTriggerKind, type SourceSnapshot, type Annotation } from "@cosmos/contracts";
import { deriveExternalKey, fingerprintEntryRevision, fingerprintStoryRevision, projectEntryToStory, temporalProjection, type FavoriteTargetType, type NormalizedIngestItem, type TargetType } from "@cosmos/domain";
import { EntryNotFoundError, StoryNotFoundError, TopicNotFoundError, type HostActionExecutionFence, type PersistIngestItemResult, type ContentAssetBinding, type ContentDraft, type StagedIngestBlobs, stageIngestBlobs } from "@cosmos/application";
import { type Prisma } from "@prisma/client";
import { appendDomainEvent, assertWorkflowActionFence, parseJson } from "./repository-internals.js";
import { PrismaCosmosRepositoryHelpers3 } from "./helpers-3.js";
import { persistInitialContentRepresentation } from "./content-representation.js";
import { mergeRunDiagnostics, projectSourceSnapshot, requireSourceManifest, type SourceRunDiagnostics } from "./source-projection.js";

/** `PrismaClient` 与事务客户端都能满足的读模型：只读 Run／WorkflowRun。 */
type RunDiagnosticsReader = Pick<Prisma.TransactionClient, "run" | "workflowRun">;

type ContentAssetKind = "image" | "video" | "audio";

function isContentAssetKind(kind: string): kind is ContentAssetKind {
    return kind === "image" || kind === "video" || kind === "audio";
}

export class PrismaCosmosRepositoryHelpers4 extends PrismaCosmosRepositoryHelpers3 {
    protected async persistIngestItemInternal(input: {
        sourceId: string;
        runId: string | null;
        workflowRunId?: string;
        triggerKind?: IngestTriggerKind;
        fence?: HostActionExecutionFence;
        ingestCommandId?: string;
        item: NormalizedIngestItem;
        contentDraft?: ContentDraft;
        stagedBlobs?: StagedIngestBlobs;
    }): Promise<PersistIngestItemResult> {
        const externalKey = deriveExternalKey(input.item);
        const contentFingerprint = fingerprintEntryRevision({
            title: input.item.title,
            summary: input.item.summary,
            contentText: input.item.contentText,
            webUrl: input.item.webUrl,
            kind: input.item.kind,
            publisher: input.item.publisher,
            contentSource: input.item.contentSource,
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
        const { rawPayload, contentSource, assets: storedAssets } = input.stagedBlobs ?? await stageIngestBlobs(input.item, {
            put: async (bytes, options) => {
                try {
                    return await this.blobs.put(bytes, options);
                } catch (error) {
                    this.logger?.error("storage.blob.put.failed", {
                        sourceId: input.sourceId,
                        runId: input.runId,
                        byteSize: bytes.byteLength,
                    }, error);
                    throw error;
                }
            },
        });

        return this.prisma.$transaction(async (tx) => {
            if (input.fence && input.workflowRunId) {
                await assertWorkflowActionFence(tx, input.fence, input.workflowRunId);
            }
            const existingByCommand = input.ingestCommandId
                ? await tx.observation.findUnique({
                    where: { ingestCommandId: input.ingestCommandId },
                })
                : null;
            if (existingByCommand) {
                const savedResult = parseJson<PersistIngestItemResult>(existingByCommand.ingestResultJson);
                return savedResult ?? {
                    createdEntry: false,
                    revisedEntry: false,
                    duplicateObservation: true,
                };
            }
            const existingObservation = input.runId === null
                ? null
                : await tx.observation.findFirst({
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
                    workflowRunId: input.workflowRunId ?? null,
                    ingestCommandId: input.ingestCommandId ?? null,
                    ingestResultJson: null,
                    entryId: existingEntry?.id,
                    externalId: input.item.externalId ?? null,
                    externalKey: externalKey,
                    externalRevision: contentFingerprint,
                    eventKind: existingEntry ? "update" : "create",
                    sourceLocatorJson: JSON.stringify(input.item.sourceLocator),
                    discoveryContextJson: JSON.stringify({
                        kind: input.triggerKind ?? "manual",
                        channel: input.item.discoveryChannel ?? "unknown",
                    }),
                    webUrl: input.item.webUrl,
                    payloadBlobKey: rawPayload.key,
                    contentSourceBlobKey: contentSource?.key ?? null,
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
                if (input.runId) {
                    await tx.run.update({
                        where: { id: input.runId },
                        data: {
                            itemCount: { increment: 1 },
                            duplicateObservationCount: { increment: 1 },
                        },
                    });
                }
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
                    evidenceObservationId: observation.id,
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
            const storyWithCurrent = await tx.story.findUnique({
                where: { id: storyId },
                include: { currentRevision: true },
            });
            const storyFingerprint = fingerprintStoryRevision({
                title: input.item.title,
                summary: input.item.summary,
                kind: storyProjection.kind,
                subtype: storyProjection.subtype,
            });
            // This projection is a deterministic writer, not a derived analysis:
            // when the current Revision is human-written it must neither replace
            // it nor be silently dropped, so the would-be write is recorded as a
            // skip event instead (ADR-0028). `kind` is a human-editable display
            // field, so it is frozen with the rest of the representation.
            const humanProtected = storyWithCurrent?.currentRevision?.producer === "human";
            const wouldWrite = (storyWithCurrent?.currentRevision?.fingerprint ?? null)
                    !== storyFingerprint
                || storyWithCurrent?.kind !== storyProjection.kind;
            if (humanProtected) {
                if (wouldWrite) {
                    await appendDomainEvent(tx, {
                        type: "story.representation_projection_skipped.v1",
                        aggregateType: "Story",
                        aggregateId: storyId,
                        runId: input.runId,
                        workflowRunId: input.workflowRunId ?? null,
                        payload: {
                            storyId,
                            entryId: entry.id,
                            currentRevisionId: storyWithCurrent?.currentRevision?.id ?? null,
                            reason: "human_protected",
                        },
                    });
                }
            } else {
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
                if (wouldWrite) {
                    const latestStoryRevision = await tx.storyRevision.findFirst({
                        where: { storyId },
                        orderBy: { revision: "desc" },
                        select: { revision: true },
                    });
                    const storyRevision = await tx.storyRevision.create({
                        data: {
                            story: {
                                connect: { id: storyId },
                            },
                            revision: (latestStoryRevision?.revision ?? 0) + 1,
                            fingerprint: storyFingerprint,
                            producer: "system",
                            title: input.item.title,
                            summary: input.item.summary,
                        },
                    });
                    await tx.story.update({
                        where: { id: storyId },
                        data: {
                            currentRevisionId: storyRevision.id,
                        },
                    });
                }
            }

            await tx.entry.update({
                where: { id: entry.id },
                data: {
                    storyId,
                    currentRevisionId: revision.id,
                    ...(metricsJson ? { metricsJson } : {}),
                },
            });

            const contentAssets: ContentAssetBinding[] = [];
            for (const asset of storedAssets) {
                const savedAsset = await tx.asset.create({
                    data: {
                        entryRevisionId: revision.id,
                        kind: asset.kind,
                        status: asset.status,
                        sourceUrl: asset.sourceUrl,
                        storageKey: asset.storageKey,
                        mimeType: asset.mimeType,
                        byteSize: asset.byteSize,
                        errorMessage: asset.errorMessage ?? null,
                        errorCode: asset.errorCode ?? null,
                        attemptCount: asset.attemptCount ?? 0,
                    },
                });
                if (isContentAssetKind(asset.kind) && asset.sourceUrl !== null) {
                    contentAssets.push({ id: savedAsset.id, kind: asset.kind, sourceUrl: asset.sourceUrl });
                }
            }
            if (input.contentDraft) {
                await persistInitialContentRepresentation(tx, revision.id, input.contentDraft, contentAssets);
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
                    workflowRunId: input.workflowRunId ?? null,
                },
            });
            await appendDomainEvent(tx, {
                type: "feed.updated.v1",
                aggregateType: "Feed",
                aggregateId: storyId,
                runId: input.runId,
                workflowRunId: input.workflowRunId,
                payload: {
                    storyId,
                    entryId: entry.id,
                    revisionId: revision.id,
                },
            });
            const result: PersistIngestItemResult = {
                createdEntry: !existingEntry,
                revisedEntry: Boolean(existingEntry),
                duplicateObservation: false,
            };
            if (input.ingestCommandId) {
                await tx.observation.update({
                    where: { id: observation.id },
                    data: { ingestResultJson: JSON.stringify(result) },
                });
            }
            if (input.runId) {
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
            }
            return result;
        });
    }

    protected toAnnotation(row: {
        id: string;
        targetType: string;
        targetId: string;
        targetRevisionId: string | null;
        quote: string | null;
        body: string;
        evidence: string | null;
        actorJson: string | null;
        createdAt: Date;
        updatedAt: Date;
    }, targetTitle: string | null = null): Annotation {
        return {
            id: row.id,
            targetType: row.targetType,
            targetId: row.targetId,
            targetRevisionId: row.targetRevisionId,
            quote: row.quote,
            body: row.body,
            evidence: row.evidence,
            actor: row.actorJson == null ? null : parseJson<string>(row.actorJson),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            targetTitle,
        };
    }

    /**
     * 批量把「目标」解析成显示标题，键是 `${targetType}:${targetId}`。
     *
     * 收藏列表与「我写过哪些批注」都要它，所以只留一个所有者。目标记录可能已被删除：那时标题为
     * null，界面按「已不可读」处理，而不是把裸 ID 当标题显示。按类型各查一次，避免 N+1。
     */
    protected async resolveTargetTitles(
        rows: readonly { targetType: string; targetId: string }[],
    ): Promise<Map<string, string | null>> {
        const idsOf = (targetType: string): string[] => [
            ...new Set(rows.filter((row) => row.targetType === targetType).map((row) => row.targetId)),
        ];
        const storyIds = idsOf("story");
        const entryIds = idsOf("entry");
        const topicIds = idsOf("topic");
        const [stories, entries, topics] = await Promise.all([
            storyIds.length === 0
                ? Promise.resolve([])
                : this.prisma.story.findMany({
                    where: { id: { in: storyIds } },
                    select: { id: true, currentRevision: { select: { title: true } } },
                }),
            entryIds.length === 0
                ? Promise.resolve([])
                : this.prisma.entry.findMany({
                    where: { id: { in: entryIds } },
                    select: { id: true, currentRevision: { select: { title: true } } },
                }),
            topicIds.length === 0
                ? Promise.resolve([])
                : this.prisma.topic.findMany({
                    where: { id: { in: topicIds } },
                    select: { id: true, currentRevision: { select: { title: true } } },
                }),
        ]);
        return new Map<string, string | null>([
            ...stories.map((row): [string, string | null] => [
                `story:${row.id}`,
                row.currentRevision?.title ?? null,
            ]),
            ...entries.map((row): [string, string | null] => [
                `entry:${row.id}`,
                row.currentRevision?.title ?? null,
            ]),
            ...topics.map((row): [string, string | null] => [
                `topic:${row.id}`,
                row.currentRevision?.title ?? null,
            ]),
        ]);
    }

    protected async resolveTargetTargetId(
        targetType: TargetType | FavoriteTargetType,
        targetId: string,
    ): Promise<string> {
        switch (targetType) {
            case "story": {
                const canonical = await this.resolveCanonicalStoryId(targetId);
                if (!canonical) {
                    throw new StoryNotFoundError(targetId);
                }
                return canonical;
            }
            case "entry": {
                const entry = await this.prisma.entry.findUnique({
                    where: { id: targetId },
                    select: { id: true },
                });
                if (!entry) {
                    throw new EntryNotFoundError(targetId);
                }
                return targetId;
            }
            case "topic": {
                const topic = await this.prisma.topic.findUnique({
                    where: { id: targetId },
                    select: { id: true },
                });
                if (!topic) {
                    throw new TopicNotFoundError(targetId);
                }
                return targetId;
            }
        }
        throw new Error(`Unknown target type: ${String(targetType)}`);
    }

    /**
     * 最近一次运行的诊断（时间 + 错误），取 legacy Run 与 durable WorkflowRun 里更近的一条。
     * 归属方由 `where` 决定：来源读投影按 `sourceInstanceId`，计划读投影按 `planId`
     * （ADR-0023 决策 2 把运行归属计划，两处必须用同一套口径，否则同一事实两个答案）。
     */
    protected async latestRunDiagnostics(
        db: RunDiagnosticsReader,
        where: { sourceInstanceId: string } | { planId: string },
    ): Promise<SourceRunDiagnostics | null> {
        const [latestRun, latestWorkflowRun] = await Promise.all([
            db.run.findFirst({ where, orderBy: { createdAt: "desc" } }),
            db.workflowRun.findFirst({ where, orderBy: { createdAt: "desc" } }),
        ]);
        return mergeRunDiagnostics(latestRun, latestWorkflowRun);
    }

    protected async toSourceSnapshot(
        source: Prisma.SourceInstanceGetPayload<{}>,
        db: Prisma.TransactionClient = this.prisma,
    ): Promise<SourceSnapshot> {
        const latest = await this.latestRunDiagnostics(db, { sourceInstanceId: source.id });
        const manifest = requireSourceManifest(this.catalog, source);
        // 计划自有字段（连接、调度、启用状态）一律从计划取（ADR-0023 决策 2）：
        // 来源侧的同名列在读取切换后不再被读，也不再被写。
        const plan = await db.collectionPlan.findUnique({
            where: { sourceId: source.id },
            include: { triggerBindings: true, connection: true },
        });
        if (!plan) {
            throw new Error(`Source has no collection plan: ${source.id}`);
        }
        return projectSourceSnapshot({ source, manifest, plan, latest });
    }

    protected toConnectionSnapshot(connection: Prisma.ConnectionInstanceGetPayload<{}>): ConnectionInstance {
        return {
            id: connection.id,
            name: connection.name,
            connectorId: connection.connectorId,
            account: connection.account,
            scopeJson: connection.scopeJson,
            configJson: connection.configJson,
            status: connection.status as ConnectionInstance["status"],
            secretRef: connection.secretRef,
            lastError: connection.lastError,
            lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
            modelId: null,
            version: connection.version,
            createdAt: connection.createdAt.toISOString(),
            updatedAt: connection.updatedAt.toISOString(),
        };
    }

    protected toJobSnapshot(job: Prisma.JobGetPayload<{}>): JobSnapshot {
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

    protected toFeedItemFromSearchRow(row: {
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
        producer: string | null;
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
            // 历史壳可能没有当前 Revision，此时 producer 按 null 投影。
            producer: row.producer ?? null,
        };
    }

}
