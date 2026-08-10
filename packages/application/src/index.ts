import {
    protocolVersion,
    type ActionErrorCode,
    type CreateSourceCommand,
    type ConnectorDescriptor,
    type FeedPage,
    type HealthResponse,
    type IngestResult,
    type EntryDetail,
    type EntryPage,
    type JobKind,
    type JobSnapshot,
    type RevisionDetail,
    type RunSnapshot,
    type SearchPage,
    type SearchQuery,
    type SourceSnapshot,
    type SourceProbeResult,
    type StoryDetail,
} from "@cosmos/contracts";
import type { NormalizedIngestItem } from "@cosmos/domain";

export interface PersistIngestItemResult {
    createdEntry: boolean;
    revisedEntry: boolean;
    duplicateObservation: boolean;
}

export interface RepositoryHealth {
    storageStatus: HealthResponse["storageStatus"];
    migrationStatus: HealthResponse["migrationStatus"];
    workerStatus: HealthResponse["workerStatus"];
}

export interface LoggerContext {
    requestId?: string;
    runId?: string;
    jobId?: string;
    sourceId?: string;
    connectorId?: string;
}

export interface LoggerPort {
    child(context: LoggerContext): LoggerPort;
    withContext<T>(
        context: LoggerContext,
        callback: () => T | Promise<T>,
    ): T | Promise<T>;
    debug(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(
        event: string,
        fields?: Record<string, unknown>,
        error?: unknown,
    ): void;
}

const noopLogger: LoggerPort = {
    child: () => noopLogger,
    withContext: (_context, callback) => callback(),
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

function resolveLogger(logger?: LoggerPort): LoggerPort {
    return logger ?? noopLogger;
}

export interface CosmosRepository {
    createSource(input: CreateSourceCommand): Promise<SourceSnapshot>;
    listSources(): Promise<readonly SourceSnapshot[]>;
    getSource(sourceId: string): Promise<SourceSnapshot | null>;
    setSourceEnabled(sourceId: string, enabled: boolean): Promise<SourceSnapshot>;
    createRun(input: {
        sourceId: string;
        triggerKind: "manual" | "schedule";
    }): Promise<RunSnapshot>;
    createQueuedRun(input: {
        sourceId: string;
        triggerKind: "manual" | "schedule";
        idempotencyKey?: string;
    }): Promise<RunSnapshot>;
    createProbeJob(input: {
        sourceId: string;
        idempotencyKey?: string;
    }): Promise<JobSnapshot>;
    getJob(jobId: string): Promise<JobSnapshot | null>;
    startRun(runId: string, lease?: JobLease): Promise<RunSnapshot>;
    getRun(runId: string): Promise<RunSnapshot | null>;
    getCheckpoint(sourceId: string): Promise<string | null>;
    claimNextJob(input: {
        owner: string;
        leaseMs: number;
    }): Promise<{
        id: string;
        runId: string | null;
        kind: string;
        leaseToken: string;
        attempts: number;
        maxAttempts: number;
        payload: unknown;
    } | null>;
    renewJobLease(input: {
        jobId: string;
        leaseToken: string;
        leaseMs: number;
    }): Promise<boolean>;
    completeJob(input: {
        jobId: string;
        leaseToken: string;
        status: "succeeded" | "retry_wait" | "failed_terminal";
        error?: string | null;
        errorCode?: string | null;
        result?: unknown;
        retryDelayMs?: number;
    }): Promise<boolean>;
    resetRunForRetry(input: {
        runId: string;
        error?: string | null;
        lease?: JobLease;
    }): Promise<RunSnapshot>;
    persistIngestItem(input: {
        sourceId: string;
        runId: string;
        item: NormalizedIngestItem;
    }): Promise<PersistIngestItemResult>;
    setCheckpoint(sourceId: string, cursor: string | null): Promise<void>;
    completeRun(input: {
        runId: string;
        status: "succeeded" | "failed" | "cancelled";
        error?: string | null;
        lease?: JobLease;
    }): Promise<RunSnapshot>;
    feed(input: {
        cursor?: string;
        limit: number;
    }): Promise<FeedPage>;
    search(input: SearchQuery): Promise<SearchPage>;
    entries(input: {
        sourceId?: string;
        cursor?: string;
        limit: number;
    }): Promise<EntryPage>;
    story(storyId: string): Promise<StoryDetail | null>;
    entry(entryId: string): Promise<EntryDetail | null>;
    revision(revisionId: string): Promise<RevisionDetail | null>;
    events(input: {
        afterSequence: number;
        limit: number;
    }): Promise<readonly {
        id: string;
        type: string;
        version: string;
        occurredAt: string;
        payload: unknown;
    }[]>;
    latestEventSequence(): Promise<number>;
    readAsset(assetId: string): Promise<{
        content: Uint8Array;
        mimeType: string;
    } | null>;
    touchWorkerHeartbeat(input: {
        instanceId: string;
        status: "starting" | "ready" | "stopped";
        version: string;
    }): Promise<void>;
    health(): Promise<RepositoryHealth>;
}

export interface JobLease {
    jobId: string;
    leaseToken: string;
}

export interface IngestConnector {
    /**
     * Phase 1B runtime boundary for one business source kind.
     *
     * A connector validates a configured SourceInstance, reads its external
     * provider, and returns normalized items. It does not persist domain data.
     * Future SourceOperation entries can refine this boundary without making
     * the connector a database-facing object.
     */
    id: string;
    description: string;
    configVersion: string;
    capabilities: readonly string[];
    validate(source: SourceSnapshot): void;
    fetchItems(input: {
        source: SourceSnapshot;
        cursor: string | null;
    }): Promise<{
        items: readonly NormalizedIngestItem[];
        nextCursor: string | null;
    }>;
}

/** Connector 错误码已并入 Action 错误合同；保留别名避免破坏现有调用方。 */
export type ConnectorErrorCode = ActionErrorCode;

export class ConnectorExecutionError extends Error {
    constructor(
        readonly code: ConnectorErrorCode,
        message: string,
        readonly retryable = true,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = "ConnectorExecutionError";
    }
}

class RunFinalizationError extends Error {
    constructor(cause: unknown) {
        super("Run finalization failed.", { cause });
        this.name = "RunFinalizationError";
    }
}

export type ConnectorResolver = (
    source: SourceSnapshot,
) => IngestConnector;

/**
 * Runtime composition boundary for business-source collectors.
 *
 * API and Worker use the same registry. The registry key is a stable
 * business source kind; implementation details such as OpenCLI remain inside
 * the connector.
 */
export class ConnectorRegistry {
    private readonly connectors = new Map<string, IngestConnector>();

    constructor(connectors: readonly IngestConnector[] = []) {
        for (const connector of connectors) {
            this.register(connector);
        }
    }

    register(connector: IngestConnector): this {
        if (this.connectors.has(connector.id)) {
            throw new Error(`Duplicate connector id: ${connector.id}`);
        }
        this.connectors.set(connector.id, connector);
        return this;
    }

    resolve(source: SourceSnapshot): IngestConnector {
        const connector = this.connectors.get(source.kind);
        if (!connector) {
            throw new Error(`Unsupported source connector: ${source.kind}`);
        }
        return connector;
    }

    validate(source: SourceSnapshot): IngestConnector {
        const connector = this.resolve(source);
        connector.validate(source);
        return connector;
    }

    descriptors(): readonly ConnectorDescriptor[] {
        return [...this.connectors.values()].map((connector) => ({
            id: connector.id,
            description: connector.description,
            capabilities: [...connector.capabilities],
            configVersion: connector.configVersion,
        }));
    }
}

export class ConnectorProbeService {
    private readonly logger: LoggerPort;

    constructor(
        private readonly repository: Pick<CosmosRepository, "getSource">,
        private readonly resolveConnector: ConnectorResolver,
        private readonly now: () => string = () => new Date().toISOString(),
        logger?: LoggerPort,
    ) {
        this.logger = resolveLogger(logger);
    }

    async runSource(sourceId: string): Promise<SourceProbeResult> {
        const startedAt = Date.now();
        let stage = "prepare";
        let logger = this.logger.child({ sourceId });
        try {
            const source = await this.repository.getSource(sourceId);
            if (!source) {
                throw new Error(`Source not found: ${sourceId}`);
            }
            const connector = this.resolveConnector(source);
            logger = logger.child({
                connectorId: connector.id,
            });
            logger.info("connector.probe.started", {
                sourceKind: source.kind,
            });
            stage = "validate";
            try {
                connector.validate(source);
            } catch (error) {
                logger.error("connector.validate.failed", {
                    errorCode: error instanceof ConnectorExecutionError
                        ? error.code
                        : "invalid_configuration",
                    retryable: error instanceof ConnectorExecutionError
                        ? error.retryable
                        : false,
                }, error);
                throw error;
            }
            const fetchStartedAt = Date.now();
            stage = "fetch";
            logger.debug("connector.fetch.started", {
                cursorPresent: false,
            });
            let result: Awaited<ReturnType<IngestConnector["fetchItems"]>>;
            try {
                result = await logger.withContext(
                    { sourceId, connectorId: connector.id },
                    () => connector.fetchItems({
                        source,
                        cursor: null,
                    }),
                );
            } catch (error) {
                logger.error("connector.fetch.failed", {
                    durationMs: Date.now() - fetchStartedAt,
                    errorCode: error instanceof ConnectorExecutionError
                        ? error.code
                        : null,
                    retryable: error instanceof ConnectorExecutionError
                        ? error.retryable
                        : true,
                }, error);
                throw error;
            }
            logger.info("connector.fetch.completed", {
                itemCount: result.items.length,
                nextCursorAvailable: result.nextCursor !== null,
                durationMs: Date.now() - fetchStartedAt,
            });
            logger.info("connector.probe.completed", {
                itemCount: result.items.length,
                nextCursorAvailable: result.nextCursor !== null,
                durationMs: Date.now() - startedAt,
            });
            return {
                sourceId,
                connectorId: connector.id,
                itemCount: result.items.length,
                nextCursorAvailable: result.nextCursor !== null,
                checkedAt: this.now(),
            };
        } catch (error) {
            logger.error("connector.probe.failed", {
                stage,
                durationMs: Date.now() - startedAt,
                errorCode: error instanceof ConnectorExecutionError
                    ? error.code
                    : null,
                retryable: error instanceof ConnectorExecutionError
                    ? error.retryable
                    : true,
            }, error);
            throw error;
        }
    }
}

export class IngestionService {
    private readonly logger: LoggerPort;

    constructor(
        private readonly repository: CosmosRepository,
        private readonly resolveConnector: ConnectorResolver,
        logger?: LoggerPort,
    ) {
        this.logger = resolveLogger(logger);
    }

    async runSource(sourceId: string): Promise<IngestResult> {
        const source = await this.repository.getSource(sourceId);
        if (!source) {
            throw new Error(`Source not found: ${sourceId}`);
        }

        const run = await this.repository.createRun({
            sourceId,
            triggerKind: "manual",
        });
        return this.executeRun(run.id, source);
    }

    async runExistingRun(runId: string): Promise<IngestResult> {
        return this.runExistingRunWithLease(runId);
    }

    async runExistingRunWithLease(
        runId: string,
        lease?: JobLease,
    ): Promise<IngestResult> {
        const startedAt = Date.now();
        const logger = this.logger.child({
            runId,
            ...(lease ? { jobId: lease.jobId } : {}),
        });
        try {
            const run = await this.repository.getRun(runId);
            if (!run || !run.sourceId) {
                throw new Error(`Run not found: ${runId}`);
            }
            const source = await this.repository.getSource(run.sourceId);
            if (!source) {
                throw new Error(`Source not found: ${run.sourceId}`);
            }
            await this.repository.startRun(runId, lease);
            return this.executeRun(runId, source, lease);
        } catch (error) {
            logger.error("run.start_failed", {
                durationMs: Date.now() - startedAt,
            }, error);
            throw error;
        }
    }

    private async executeRun(
        runId: string,
        source: SourceSnapshot,
        lease?: JobLease,
    ): Promise<IngestResult> {
        return await this.logger.withContext(
            {
                runId,
                sourceId: source.id,
                ...(lease ? { jobId: lease.jobId } : {}),
            },
            () => this.executeRunInContext(runId, source, lease),
        );
    }

    private async executeRunInContext(
        runId: string,
        source: SourceSnapshot,
        lease?: JobLease,
    ): Promise<IngestResult> {
        let createdEntryCount = 0;
        let revisedEntryCount = 0;
        let duplicateObservationCount = 0;
        const startedAt = Date.now();
        let connectorId: string | undefined;
        let completionFailed = false;
        let logger = this.logger.child({
            runId,
            sourceId: source.id,
        });

        try {
            const connector = this.resolveConnector(source);
            connectorId = connector.id;
            logger = logger.child({ connectorId: connector.id });
            logger.info("run.started", {
                sourceKind: source.kind,
            });
            try {
                connector.validate(source);
            } catch (error) {
                logger.error("connector.validate.failed", {
                    errorCode: error instanceof ConnectorExecutionError
                        ? error.code
                        : "invalid_configuration",
                    retryable: error instanceof ConnectorExecutionError
                        ? error.retryable
                        : false,
                }, error);
                throw error;
            }
            const cursor = await this.repository.getCheckpoint(source.id);
            const fetchStartedAt = Date.now();
            logger.debug("connector.fetch.started", {
                cursorPresent: cursor !== null,
            });
            let page: Awaited<ReturnType<IngestConnector["fetchItems"]>>;
            try {
                page = await logger.withContext(
                    {
                        runId,
                        sourceId: source.id,
                        connectorId: connector.id,
                    },
                    () => connector.fetchItems({
                        source,
                        cursor,
                    }),
                );
            } catch (error) {
                logger.error("connector.fetch.failed", {
                    durationMs: Date.now() - fetchStartedAt,
                    errorCode: error instanceof ConnectorExecutionError
                        ? error.code
                        : null,
                    retryable: error instanceof ConnectorExecutionError
                        ? error.retryable
                        : true,
                }, error);
                throw error;
            }
            logger.info("connector.fetch.completed", {
                itemCount: page.items.length,
                nextCursorAvailable: page.nextCursor !== null,
                durationMs: Date.now() - fetchStartedAt,
            });

            for (const [index, item] of page.items.entries()) {
                const result = await this.repository.persistIngestItem({
                    sourceId: source.id,
                    runId,
                    item,
                });
                logger.debug("ingest.item.persisted", {
                    index,
                    createdEntry: result.createdEntry,
                    revisedEntry: result.revisedEntry,
                    duplicateObservation: result.duplicateObservation,
                });
                if (result.createdEntry) {
                    createdEntryCount += 1;
                }
                if (result.revisedEntry) {
                    revisedEntryCount += 1;
                }
                if (result.duplicateObservation) {
                    duplicateObservationCount += 1;
                }
            }

            await this.repository.setCheckpoint(source.id, page.nextCursor);
            let completedRun: RunSnapshot;
            try {
                completedRun = await this.repository.completeRun({
                    runId,
                    status: "succeeded",
                    lease,
                });
            } catch (error) {
                completionFailed = true;
                logger.error("run.completion_failed", {
                    status: "succeeded",
                    durationMs: Date.now() - startedAt,
                }, error);
                throw new RunFinalizationError(error);
            }

            const result: IngestResult = {
                run: {
                    ...completedRun,
                    itemCount: page.items.length,
                    createdEntryCount,
                    revisedEntryCount,
                },
                createdEntryCount,
                revisedEntryCount,
                duplicateObservationCount,
            };
            logger.info("run.succeeded", {
                itemCount: page.items.length,
                createdEntryCount,
                revisedEntryCount,
                duplicateObservationCount,
                durationMs: Date.now() - startedAt,
            });
            return result;
        } catch (error) {
            const message = errorMessage(error);
            if (completionFailed) {
                throw error;
            }
            logger.error("run.failed", {
                connectorId,
                durationMs: Date.now() - startedAt,
                errorCode: error instanceof ConnectorExecutionError
                    ? error.code
                    : null,
                retryable: error instanceof ConnectorExecutionError
                    ? error.retryable
                    : true,
            }, error);
            let completedRun: RunSnapshot;
            try {
                completedRun = await this.repository.completeRun({
                    runId,
                    status: "failed",
                    error: message,
                    lease,
                });
            } catch (completionError) {
                completionFailed = true;
                logger.error("run.completion_failed", {
                    status: "failed",
                    durationMs: Date.now() - startedAt,
                }, completionError);
                throw new RunFinalizationError(completionError);
            }
            return {
                run: {
                    ...completedRun,
                    itemCount: 0,
                    createdEntryCount,
                    revisedEntryCount,
                },
                createdEntryCount,
                revisedEntryCount,
                duplicateObservationCount,
                errorCode: error instanceof ConnectorExecutionError
                    ? error.code
                    : null,
                retryable: error instanceof ConnectorExecutionError
                    ? error.retryable
                    : true,
            };
        }
    }
}

export interface IngestionWorkerOptions {
    owner: string;
    leaseMs: number;
    pollIntervalMs?: number;
    now?: () => Date;
    probe?: ConnectorProbeService;
    logger?: LoggerPort;
}

export interface WorkerJobResult {
    jobId: string;
    runId: string | null;
    status: "succeeded" | "retry_wait" | "failed_terminal";
    attempts: number;
}

type ClaimedJob = NonNullable<
    Awaited<ReturnType<CosmosRepository["claimNextJob"]>>
>;
type CompleteJobInput = Parameters<CosmosRepository["completeJob"]>[0];

export class IngestionWorker {
    private readonly now: () => Date;
    private readonly logger: LoggerPort;

    constructor(
        private readonly repository: CosmosRepository,
        private readonly ingestion: IngestionService,
        private readonly options: IngestionWorkerOptions,
    ) {
        this.now = options.now ?? (() => new Date());
        this.logger = resolveLogger(options.logger);
    }

    async pollOnce(): Promise<WorkerJobResult | null> {
        await this.queueScheduledSources();
        const job = await this.repository.claimNextJob({
            owner: this.options.owner,
            leaseMs: this.options.leaseMs,
        });
        if (!job) {
            return null;
        }
        const sourceId = readOptionalSourceId(job.payload);
        const logger = this.logger.child({
            jobId: job.id,
            ...(job.runId ? { runId: job.runId } : {}),
            ...(sourceId ? { sourceId } : {}),
        });
        logger.info("job.claimed", {
            kind: job.kind,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
        });

        const leaseHeartbeatMs = Math.max(
            1_000,
            Math.floor(this.options.leaseMs / 3),
        );
        const leaseHeartbeat = setInterval(() => {
            void (async () => {
                const renewed = await logger.withContext(
                    {
                        jobId: job.id,
                        ...(job.runId ? { runId: job.runId } : {}),
                        ...(sourceId ? { sourceId } : {}),
                    },
                    () => this.repository.renewJobLease({
                        jobId: job.id,
                        leaseToken: job.leaseToken,
                        leaseMs: this.options.leaseMs,
                    }),
                );
                if (!renewed) {
                    logger.warn("job.lease_lost", {
                        kind: job.kind,
                    });
                    return;
                }
                logger.debug("job.lease_renewed", {
                    kind: job.kind,
                });
            })().catch((error) => {
                logger.error("job.lease_renew_failed", {
                    kind: job.kind,
                }, error);
            });
        }, leaseHeartbeatMs);
        try {
            if (job.kind !== "source-ingest" || !job.runId) {
                if (job.kind === "source-probe" && !job.runId && this.options.probe) {
                    const result = await logger.withContext(
                        {
                            jobId: job.id,
                            ...(sourceId ? { sourceId } : {}),
                        },
                        () => this.options.probe!.runSource(
                            readSourceId(job.payload),
                        ),
                    );
                    const completed = await this.completeClaimedJob(job, logger, {
                        status: "succeeded",
                        result,
                    });
                    if (completed) {
                        logger.info("job.completed", {
                            kind: job.kind,
                            status: "succeeded",
                            attempts: job.attempts,
                        });
                    }
                    return completed
                        ? {
                            jobId: job.id,
                            runId: null,
                            status: "succeeded",
                            attempts: job.attempts,
                        }
                        : null;
                }
                const completed = await this.completeClaimedJob(job, logger, {
                    status: "failed_terminal",
                    error: `Unsupported job: ${job.kind}`,
                });
                if (!completed) {
                    return null;
                }
                logger.error("job.failed_terminal", {
                    kind: job.kind,
                    status: "failed_terminal",
                    attempts: job.attempts,
                    errorCode: "unsupported_job",
                });
                return {
                    jobId: job.id,
                    runId: job.runId,
                    status: "failed_terminal",
                    attempts: job.attempts,
                };
            }

            const result = await logger.withContext(
                {
                    jobId: job.id,
                    runId: job.runId,
                    ...(sourceId ? { sourceId } : {}),
                },
                () => this.ingestion.runExistingRunWithLease(job.runId!, {
                    jobId: job.id,
                    leaseToken: job.leaseToken,
                }),
            );
            if (result.run.status === "succeeded") {
                const completed = await this.completeClaimedJob(job, logger, {
                    status: "succeeded",
                });
                if (completed) {
                    logger.info("job.completed", {
                        kind: job.kind,
                        status: "succeeded",
                        attempts: job.attempts,
                    });
                }
                return completed
                    ? {
                        jobId: job.id,
                        runId: job.runId,
                        status: "succeeded",
                        attempts: job.attempts,
                    }
                    : null;
            }

            return this.finishFailedJob(job, {
                message: result.run.error ?? "Ingest failed.",
                code: result.errorCode ?? null,
                retryable: result.retryable ?? true,
            });
        } catch (error) {
            if (error instanceof RunFinalizationError) {
                logger.error("job.run_completion_failed", {
                    kind: job.kind,
                    status: "unknown",
                    attempts: job.attempts,
                }, error);
                return null;
            }
            return this.finishFailedJob(
                job,
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            clearInterval(leaseHeartbeat);
        }
    }

    async queueScheduledSources(): Promise<void> {
        const now = this.now();
        const sources = await this.repository.listSources();
        for (const source of sources) {
            if (!source.enabled || !source.config.scheduleIntervalMs) {
                continue;
            }
            const interval = source.config.scheduleIntervalMs;
            const lastRunAt = source.lastRunAt
                ? Date.parse(source.lastRunAt)
                : Number.NEGATIVE_INFINITY;
            if (Number.isFinite(lastRunAt) && now.getTime() - lastRunAt < interval) {
                continue;
            }
            const bucket = Math.floor(now.getTime() / interval);
            try {
                const run = await this.repository.createQueuedRun({
                    sourceId: source.id,
                    triggerKind: "schedule",
                    idempotencyKey: `schedule:${source.id}:${bucket}`,
                });
                this.logger.child({
                    runId: run.id,
                    sourceId: source.id,
                }).info("run.queued", {
                    triggerKind: "schedule",
                    status: run.status,
                });
            } catch (error) {
                this.logger.child({
                    sourceId: source.id,
                }).error("run.queue_failed", {
                    triggerKind: "schedule",
                }, error);
                throw error;
            }
        }
    }

    private async completeClaimedJob(
        job: ClaimedJob,
        logger: LoggerPort,
        input: Omit<CompleteJobInput, "jobId" | "leaseToken">,
    ): Promise<boolean> {
        const sourceId = readOptionalSourceId(job.payload);
        try {
            const completed = await logger.withContext(
                {
                    jobId: job.id,
                    ...(job.runId ? { runId: job.runId } : {}),
                    ...(sourceId ? { sourceId } : {}),
                },
                () => this.repository.completeJob({
                    jobId: job.id,
                    leaseToken: job.leaseToken,
                    ...input,
                }),
            );
            if (!completed) {
                logger.warn("job.completion_rejected", {
                    kind: job.kind,
                    status: input.status,
                    attempts: job.attempts,
                });
            }
            return completed;
        } catch (error) {
            logger.error("job.completion_failed", {
                kind: job.kind,
                status: input.status,
                attempts: job.attempts,
            }, error);
            return false;
        }
    }

    private async finishFailedJob(
        job: ClaimedJob,
        error: unknown,
    ): Promise<WorkerJobResult | null> {
        const failure = normalizeFailure(error);
        const message = failure.message;
        const errorCode = failure.code;
        const terminal = job.attempts >= job.maxAttempts
            || !failure.retryable;
        const sourceId = readOptionalSourceId(job.payload);
        const logger = this.logger.child({
            jobId: job.id,
            ...(job.runId ? { runId: job.runId } : {}),
            ...(sourceId ? { sourceId } : {}),
        });
        if (!terminal && job.runId) {
            try {
                await logger.withContext(
                    {
                        jobId: job.id,
                        runId: job.runId,
                        ...(sourceId ? { sourceId } : {}),
                    },
                    () => this.repository.resetRunForRetry({
                        runId: job.runId!,
                        error: message,
                        lease: {
                            jobId: job.id,
                            leaseToken: job.leaseToken,
                        },
                    }),
                );
            } catch (resetError) {
                logger.error("job.retry_reset_failed", {
                    attempts: job.attempts,
                    maxAttempts: job.maxAttempts,
                    errorCode,
                }, resetError);
                return null;
            }
        }
        const retryDelay = terminal
            ? undefined
            : retryDelayMs(job.attempts);
        const completed = await this.completeClaimedJob(job, logger, {
            status: terminal ? "failed_terminal" : "retry_wait",
            error: message,
            errorCode,
            retryDelayMs: retryDelay,
        });
        if (completed) {
            logger[terminal ? "error" : "warn"](
                terminal ? "job.failed_terminal" : "job.retry_scheduled",
                {
                    status: terminal ? "failed_terminal" : "retry_wait",
                    attempts: job.attempts,
                    maxAttempts: job.maxAttempts,
                    errorCode,
                    retryDelayMs: retryDelay,
                },
                error,
            );
        }
        return completed
            ? {
                jobId: job.id,
                runId: job.runId,
                status: terminal ? "failed_terminal" : "retry_wait",
                attempts: job.attempts,
            }
            : null;
    }
}

function retryDelayMs(attempt: number): number {
    return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

function readSourceId(payload: unknown): string {
    if (
        !payload
        || typeof payload !== "object"
        || typeof (payload as { sourceId?: unknown }).sourceId !== "string"
        || !(payload as { sourceId: string }).sourceId
    ) {
        throw new Error("Source probe job is missing sourceId.");
    }
    return (payload as { sourceId: string }).sourceId;
}

function readOptionalSourceId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const sourceId = (payload as { sourceId?: unknown }).sourceId;
    return typeof sourceId === "string" && sourceId
        ? sourceId
        : null;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeFailure(error: unknown): {
    message: string;
    code: string | null;
    retryable: boolean;
} {
    if (error instanceof ConnectorExecutionError) {
        return {
            message: error.message,
            code: error.code,
            retryable: error.retryable,
        };
    }
    if (error && typeof error === "object") {
        const candidate = error as {
            message?: unknown;
            code?: unknown;
            retryable?: unknown;
        };
        return {
            message: typeof candidate.message === "string"
                ? candidate.message
                : String(error),
            code: typeof candidate.code === "string"
                ? candidate.code
                : null,
            retryable: candidate.retryable !== false,
        };
    }
    return {
        message: String(error),
        code: null,
        retryable: true,
    };
}

export function createHealthSnapshot(input: {
    version: string;
    workerStatus?: HealthResponse["workerStatus"];
    storageStatus?: HealthResponse["storageStatus"];
    migrationStatus?: HealthResponse["migrationStatus"];
    now?: Date;
}): HealthResponse {
    return {
        status: "ok",
        service: "cosmos-api",
        version: input.version,
        protocolVersion,
        workerStatus: input.workerStatus ?? "unknown",
        storageStatus: input.storageStatus ?? "unknown",
        migrationStatus: input.migrationStatus ?? "unknown",
        timestamp: (input.now ?? new Date()).toISOString(),
    };
}

export * from "./action.js";
