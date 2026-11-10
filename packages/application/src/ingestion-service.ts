/** 采集用例编排:入队、终态化与失败归类。 */

import type {
    IngestResult, RunSnapshot, SourceSnapshot,
} from "@cosmos/contracts";

import { acquireItemsSkippingUnchanged } from "./media-acquirer.js";
import { prepareContentItem } from "./content-ingest.js";
import { stageIngestBlobs, type IngestBlobWriter } from "./ingest-blob-staging.js";
import { mediaDownloadCapability, resolveMediaPolicy } from "./media-policy.js";
import type { MediaAcquirer } from "./media-ports.js";

import {
    ConnectorExecutionError,
} from "./connector-ports.js";
import type {
    ConnectorResolver, IngestConnector, JobLease,
} from "./connector-ports.js";
import {
    ConnectorProbeService, SourceConfigProbeService,
} from "./connector-probe.js";
import type {
    ConnectionProbeService,
} from "./connection-probe.js";
import {
    RunFinalizationError,
} from "./errors.js";
import {
    errorMessage,
} from "./internals.js";
import {
    resolveLogger,
} from "./logger.js";
import type {
    LoggerPort,
} from "./logger.js";
import type {
    CosmosRepository,
} from "./repository-port.js";

export class IngestionService {
    private readonly logger: LoggerPort;

    constructor(
        private readonly repository: CosmosRepository,
        private readonly resolveConnector: ConnectorResolver,
        logger?: LoggerPort,
        private readonly mediaAcquirer?: MediaAcquirer,
        private readonly blobs?: IngestBlobWriter,
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
            const cursor = await this.repository.getCheckpoint(source.planId);
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

            const prepared = page.items.map((item) => prepareContentItem(item));
            const preparedItems = prepared.map(({ item }) => item);
            let acquiredItems: typeof page.items = preparedItems;
            if (
                this.mediaAcquirer
                && connector.capabilities.includes(mediaDownloadCapability)
            ) {
                const unchanged = await this.repository.listContentUnchangedItems({
                    sourceId: source.id,
                    items: preparedItems,
                });
                acquiredItems = await acquireItemsSkippingUnchanged(
                    this.mediaAcquirer,
                    preparedItems,
                    unchanged,
                    { policy: resolveMediaPolicy(source.mediaPolicy) },
                );
            }

            for (const [index, item] of acquiredItems.entries()) {
                const result = await this.repository.persistIngestItem({
                    sourceId: source.id,
                    runId,
                    item,
                    contentDraft: prepared[index]?.draft,
                    stagedBlobs: this.blobs ? await stageIngestBlobs(item, this.blobs) : undefined,
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

            await this.repository.setCheckpoint(source.planId, page.nextCursor);
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
    configProbe?: SourceConfigProbeService;
    /** 连接登录探测（Proposal connection-login-lifecycle-v1 决定 2）；不接线时该 Job 走失败终态。 */
    connectionProbe?: ConnectionProbeService;
    /** Disable legacy schedule enqueue while Workflow envelopes own scheduling. */
    schedule?: boolean;
    logger?: LoggerPort;
}

export interface WorkerJobResult {
    jobId: string;
    runId: string | null;
    status: "succeeded" | "retry_wait" | "failed_terminal";
    attempts: number;
}

export type ClaimedJob = NonNullable<
    Awaited<ReturnType<CosmosRepository["claimNextJob"]>>
>;
export type CompleteJobInput = Parameters<CosmosRepository["completeJob"]>[0];
