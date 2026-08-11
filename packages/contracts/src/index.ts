import { z } from "zod";

export const protocolVersion = "v1" as const;

export const contentKindSchema = z.enum([
    "post",
    "article",
    "video",
    "audio",
    "image",
    "comment",
    "listing",
]);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const publisherKindSchema = z.enum([
    "user",
    "channel",
    "subreddit",
    "official-account",
    "org",
    "unknown",
]);
export type PublisherKind = z.infer<typeof publisherKindSchema>;

const nullableTrimmedStringSchema = z.preprocess(
    (value) => typeof value === "string" ? value.trim() || null : value,
    z.string().min(1).nullable(),
);

export const publisherMetricsSchema = z.object({
    followers: z.number().finite().nullable().optional(),
    following: z.number().finite().nullable().optional(),
    statuses: z.number().finite().nullable().optional(),
    voteup: z.number().finite().nullable().optional(),
    reliable: z.enum(["high", "low", "unknown"]).optional(),
});
export type PublisherMetrics = z.infer<typeof publisherMetricsSchema>;

export const publisherSchema = z.object({
    platformId: nullableTrimmedStringSchema,
    name: z.string().trim().min(1),
    handle: nullableTrimmedStringSchema,
    profileUrl: nullableTrimmedStringSchema,
    kind: publisherKindSchema,
    metrics: publisherMetricsSchema.nullable().optional(),
});
export type Publisher = z.infer<typeof publisherSchema>;

export const temporalPrecisionSchema = z.enum([
    "second",
    "minute",
    "hour",
    "day",
    "week",
    "month",
    "year",
    "unknown",
]);
export type TemporalPrecision = z.infer<typeof temporalPrecisionSchema>;

export const temporalFallbackSchema = z.object({
    raw: z.string().min(1),
    lowerBound: z.string().datetime({ offset: true }),
    precision: temporalPrecisionSchema,
    timezone: z.string().nullable(),
    confidence: z.enum(["high", "inferred", "uncertain"]),
});
export type TemporalFallback = z.infer<typeof temporalFallbackSchema>;

export const temporalValueSchema = z.object({
    exact: z.string().datetime({ offset: true }).nullable(),
    exactPrecision: z.literal("second").nullable(),
    fallback: temporalFallbackSchema.nullable(),
}).refine((value) => {
    return value.exact !== null || value.fallback !== null;
}, "TemporalValue must contain exact or fallback time data.");
export type TemporalValue = z.infer<typeof temporalValueSchema>;

export const contentMetricsSchema = z.object({
    values: z.object({
        likes: z.number().finite().nullable().optional(),
        views: z.number().finite().nullable().optional(),
        reposts: z.number().finite().nullable().optional(),
        comments: z.number().finite().nullable().optional(),
        collects: z.number().finite().nullable().optional(),
        score: z.number().finite().nullable().optional(),
    }),
    raw: z.record(z.string(), z.string()),
    reliability: z.enum(["high", "low", "unknown"]),
    capturedAt: z.string().datetime({ offset: true }),
});
export type ContentMetrics = z.infer<typeof contentMetricsSchema>;

/**
 * A source kind is a stable connector family identifier.
 *
 * The core intentionally accepts plugin-defined values so adding a new
 * collector does not require changing the persistence model or the API
 * envelope. Built-in values are documented by the connector registry.
 */
export const sourceKindSchema = z.string().trim().min(1).max(100);
export type SourceKind = z.infer<typeof sourceKindSchema>;

const scheduleConfigShape = {
    scheduleIntervalMs: z.coerce.number().int().min(1_000).max(31 * 24 * 60 * 60 * 1_000).optional(),
};

export const sourceConfigSchema = z.object({
    feedUrl: z.string().url().optional(),
    fixturePath: z.string().min(1).optional(),
    ...scheduleConfigShape,
}).passthrough();
export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const rssSourceConfigSchema = z.object({
    feedUrl: z.string().url(),
    ...scheduleConfigShape,
}).strict();
export type RssSourceConfig = z.infer<typeof rssSourceConfigSchema>;

export const fixtureRssSourceConfigSchema = z.object({
    fixturePath: z.string().min(1).optional(),
    ...scheduleConfigShape,
}).strict();
export type FixtureRssSourceConfig = z.infer<typeof fixtureRssSourceConfigSchema>;

const safeProfileSchema = z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/);

export const bilibiliSourceConfigSchema = z.object({
    schemaVersion: z.coerce.number().int().positive().default(1),
    mode: z.enum(["hot", "feed"]),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    profile: safeProfileSchema.optional(),
    ...scheduleConfigShape,
}).strict().superRefine((value, context) => {
    if (value.mode === "feed" && !value.profile) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["profile"],
            message: "Bilibili feed requires an OpenCLI profile.",
        });
    }
});
export type BilibiliSourceConfig = z.infer<typeof bilibiliSourceConfigSchema>;

export const aiHotSourceConfigSchema = z.object({
    schemaVersion: z.coerce.number().int().positive().default(1),
    ...scheduleConfigShape,
}).strict();
export type AiHotSourceConfig = z.infer<typeof aiHotSourceConfigSchema>;

export const createSourceCommandSchema = z.object({
    name: z.string().trim().min(1).max(200),
    kind: sourceKindSchema,
    config: sourceConfigSchema,
    enabled: z.boolean().default(true),
});
export type CreateSourceCommand = z.input<typeof createSourceCommandSchema>;

export const updateSourceCommandSchema = z.object({
    enabled: z.boolean(),
});
export type UpdateSourceCommand = z.infer<typeof updateSourceCommandSchema>;

export const sourceProbeResultSchema = z.object({
    sourceId: z.string(),
    connectorId: z.string(),
    itemCount: z.number().int().nonnegative(),
    nextCursorAvailable: z.boolean(),
    checkedAt: z.string(),
});
export type SourceProbeResult = z.infer<typeof sourceProbeResultSchema>;

export const sourceTestResultSchema = sourceProbeResultSchema;
export type SourceTestResult = SourceProbeResult;

export const ingestCommandSchema = z.object({
    sourceId: z.string().min(1),
    triggerKind: z.enum(["manual", "schedule"]).default("manual"),
    idempotencyKey: z.string().trim().min(1).max(300).optional(),
});
export type IngestCommand = z.input<typeof ingestCommandSchema>;

export const sourceSnapshotSchema = z.object({
    id: z.string(),
    name: z.string(),
    kind: sourceKindSchema,
    config: sourceConfigSchema,
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastRunAt: z.string().nullable(),
    lastError: z.string().nullable(),
});
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

export const connectorDescriptorSchema = z.object({
    id: z.string().trim().min(1),
    description: z.string().trim().min(1),
    capabilities: z.string().array(),
    configVersion: z.string().trim().min(1),
});
export type ConnectorDescriptor = z.infer<typeof connectorDescriptorSchema>;

export const runStatusSchema = z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const stepStatusSchema = z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const jobStatusSchema = z.enum([
    "queued",
    "leased",
    "retry_wait",
    "succeeded",
    "failed_terminal",
    "cancelled",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobKindSchema = z.enum([
    "source-ingest",
    "source-probe",
]);
export type JobKind = z.infer<typeof jobKindSchema>;

export const jobSnapshotSchema = z.object({
    id: z.string(),
    kind: jobKindSchema,
    sourceId: z.string().nullable(),
    runId: z.string().nullable(),
    status: jobStatusSchema,
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    errorCode: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    result: z.unknown().nullable(),
});
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;

export const assetStatusSchema = z.enum([
    "saved",
    "metadata_only",
    "skipped",
    "failed",
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetSnapshotSchema = z.object({
    id: z.string(),
    kind: z.string(),
    status: assetStatusSchema,
    sourceUrl: z.string().nullable(),
    storageKey: z.string().nullable(),
    mimeType: z.string().nullable(),
    byteSize: z.number().nullable(),
});
export type AssetSnapshot = z.infer<typeof assetSnapshotSchema>;

export const runSnapshotSchema = z.object({
    id: z.string(),
    sourceId: z.string().nullable(),
    triggerKind: z.enum(["manual", "schedule"]),
    status: runStatusSchema,
    createdAt: z.string(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    itemCount: z.number(),
    createdEntryCount: z.number(),
    revisedEntryCount: z.number(),
    error: z.string().nullable(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const healthResponseSchema = z.object({
    status: z.literal("ok"),
    service: z.string(),
    version: z.string(),
    protocolVersion: z.string(),
    workerStatus: z.enum(["unknown", "starting", "ready", "stopped"]),
    storageStatus: z.enum(["unknown", "starting", "ready", "failed"]),
    migrationStatus: z.enum(["unknown", "pending", "ready", "failed"]),
    timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const serviceErrorCodeSchema = z.enum([
    "validation_failed",
    "not_found",
    "conflict",
    "service_unavailable",
    "protocol_mismatch",
    "uncertain",
]);

export type ServiceErrorCode = z.infer<typeof serviceErrorCodeSchema>;

export const serviceErrorSchema = z.object({
    code: serviceErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    commandId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean(),
});

export type ServiceError = z.infer<typeof serviceErrorSchema>;

export interface EventEnvelope<TPayload> {
    id: string;
    type: string;
    version: string;
    occurredAt: string;
    payload: TPayload;
}

export const searchQuerySchema = z.object({
    text: z.string().trim().max(500).optional(),
    sourceId: z.string().optional(),
    publishedAfter: z.string().datetime({ offset: true }).optional(),
    publishedBefore: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

export const feedItemSchema = z.object({
    storyId: z.string(),
    storyKind: z.enum(["event", "document", "media", "thread"]),
    title: z.string(),
    summary: z.string().nullable(),
    entryId: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    sourceKind: sourceKindSchema,
    revisionId: z.string(),
    publishedAt: z.string().nullable(),
    assets: assetSnapshotSchema.array(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const feedPageSchema = z.object({
    items: feedItemSchema.array(),
    nextCursor: z.string().nullable(),
});
export type FeedPage = z.infer<typeof feedPageSchema>;

export const searchResultSchema = feedItemSchema.extend({
    rank: z.number().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchPageSchema = z.object({
    items: searchResultSchema.array(),
    nextCursor: z.string().nullable(),
});
export type SearchPage = z.infer<typeof searchPageSchema>;

export const entryRevisionSnapshotSchema = z.object({
    id: z.string(),
    revision: z.number(),
    title: z.string(),
    summary: z.string().nullable(),
    contentText: z.string(),
    webUrl: z.string().nullable(),
    contentKind: contentKindSchema,
    publisher: publisherSchema.nullable(),
    publishedAt: temporalValueSchema.nullable(),
    updatedAt: temporalValueSchema.nullable(),
    sourcePublishedAt: z.string().nullable(),
    createdAt: z.string(),
    assets: assetSnapshotSchema.array(),
});
export type EntryRevisionSnapshot = z.infer<typeof entryRevisionSnapshotSchema>;

export const observationSnapshotSchema = z.object({
    id: z.string(),
    externalId: z.string().nullable(),
    externalKey: z.string(),
    eventKind: z.enum(["create", "update", "delete", "snapshot"]),
    webUrl: z.string().nullable(),
    capturedAt: z.string(),
    sourcePublishedAt: z.string().nullable(),
});
export type ObservationSnapshot = z.infer<typeof observationSnapshotSchema>;

export const entryDetailSchema = z.object({
    id: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    sourceKind: sourceKindSchema,
    currentRevisionId: z.string(),
    metrics: contentMetricsSchema.nullable(),
    revisions: entryRevisionSnapshotSchema.array(),
    observations: observationSnapshotSchema.array(),
});
export type EntryDetail = z.infer<typeof entryDetailSchema>;

export const entryListQuerySchema = z.object({
    sourceId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type EntryListQuery = z.input<typeof entryListQuerySchema>;

export const entryListItemSchema = z.object({
    id: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    sourceKind: sourceKindSchema,
    storyId: z.string().nullable(),
    currentRevisionId: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    webUrl: z.string().nullable(),
    contentKind: contentKindSchema,
    publisher: publisherSchema.nullable(),
    metrics: contentMetricsSchema.nullable(),
    publishedAt: z.string().nullable(),
    updatedAt: z.string(),
    revisionCount: z.number().int().nonnegative(),
    observationCount: z.number().int().nonnegative(),
    assets: assetSnapshotSchema.array(),
});
export type EntryListItem = z.infer<typeof entryListItemSchema>;

export const entryPageSchema = z.object({
    items: entryListItemSchema.array(),
    nextCursor: z.string().nullable(),
});
export type EntryPage = z.infer<typeof entryPageSchema>;

export const storyDetailSchema = z.object({
    story: z.object({
        id: z.string(),
        kind: z.enum(["event", "document", "media", "thread"]),
        subtype: z.string().nullable(),
        revisionId: z.string(),
        title: z.string(),
        summary: z.string().nullable(),
    }),
    entry: entryDetailSchema,
});
export type StoryDetail = z.infer<typeof storyDetailSchema>;

export const revisionDetailSchema = entryRevisionSnapshotSchema.extend({
    entryId: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    sourceKind: sourceKindSchema,
});
export type RevisionDetail = z.infer<typeof revisionDetailSchema>;

export const ingestResultSchema = z.object({
    run: runSnapshotSchema,
    createdEntryCount: z.number(),
    revisedEntryCount: z.number(),
    duplicateObservationCount: z.number(),
    errorCode: z.string().nullable().optional(),
    retryable: z.boolean().optional(),
});
export type IngestResult = z.infer<typeof ingestResultSchema>;

export const eventSnapshotSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.string(),
    occurredAt: z.string(),
    payload: z.unknown(),
});
export type EventSnapshot = z.infer<typeof eventSnapshotSchema>;

export const snapshotRequiredPayloadSchema = z.object({
    reason: z.string(),
    latestEventId: z.string(),
});
export type SnapshotRequiredPayload = z.infer<typeof snapshotRequiredPayloadSchema>;

export const sseEventSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.string(),
    occurredAt: z.string(),
    payload: z.unknown(),
});
export type SseEvent = z.infer<typeof sseEventSchema>;

export * from "./action.js";
