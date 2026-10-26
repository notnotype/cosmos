import { BadRequestException, ConflictException, Inject, Optional } from "@nestjs/common";
import { type ContentRebuild, type ContentCommands, type ContentQuery, type StoryAgentCandidates, type StoryAgentWorkflowControl, type CosmosRepository, type WorkflowEnvelope, type WorkflowHostStore } from "@cosmos/application";
import type { CatalogPort } from "@cosmos/application/catalog";
import type { MediaCleanupWorkflowControlService } from "@cosmos/application/media-cleanup";
import type { IngestWorkflowControlService } from "@cosmos/application/workflow-control";
import {
    mediaCleanupRunSnapshotSchema,
    runControlResultSchema,
    type CreateSourceCommand,
    type RunControlAction,
} from "@cosmos/contracts";
import type { Logger } from "@cosmos/logging";
import { SourceProbeService } from "../source-probe.service.js";
import "reflect-metadata";
import { productRunSchema, toProductWorkflowRunStatus, toPublicWorkflowRun } from "./internals.js";

export class AppControllerBase {
    constructor(
        @Inject("COSMOS_PRODUCT_PORT")
        protected readonly repository: CosmosRepository,
        @Inject(SourceProbeService)
        protected readonly sourceProbe: SourceProbeService,
        @Optional()
        @Inject("COSMOS_LOGGER")
        protected readonly logger?: Logger,
        @Optional()
        @Inject("COSMOS_WORKFLOW_CONTROL")
        protected readonly workflowControl?: IngestWorkflowControlService,
        @Optional()
        @Inject("COSMOS_WORKFLOW_STORE")
        protected readonly workflowStore?: WorkflowHostStore,
        @Optional()
        @Inject("COSMOS_MEDIA_CLEANUP_CONTROL")
        protected readonly mediaCleanupControl?: MediaCleanupWorkflowControlService,
        @Optional()
        @Inject("COSMOS_CATALOG")
        protected readonly catalog?: CatalogPort,
        @Optional()
        @Inject("COSMOS_CONTENT_QUERY")
        protected readonly contentQuery?: ContentQuery,
        @Optional()
        @Inject("COSMOS_CONTENT_COMMANDS")
        protected readonly contentCommands?: ContentCommands,
        @Optional()
        @Inject("COSMOS_STORY_AGENT_CANDIDATES")
        protected readonly storyAgentCandidates?: StoryAgentCandidates,
        @Optional()
        @Inject("COSMOS_STORY_AGENT_WORKFLOW_CONTROL")
        protected readonly storyAgentControl?: StoryAgentWorkflowControl,
        @Optional()
        @Inject("COSMOS_CONTENT_REBUILD")
        protected readonly contentRebuild?: ContentRebuild,
    ) {}

    /**
     * Unsaved-input availability/schema validation is the client's
     * responsibility, so its failures are 400s even though the probe service
     * throws plain Errors; storage and other unexpected failures must not
     * inherit that status through the shared funnel.
     */
    protected validateSourceDefinition(input: Pick<CreateSourceCommand, "sourceDefinitionRef" | "operationId" | "config">): void {
        try {
            this.sourceProbe.validate(input);
        } catch (error) {
            throw new BadRequestException({
                code: "validation_failed",
                message: error instanceof Error ? error.message : "Source configuration is invalid.",
                retryable: false,
            });
        }
    }

    /**
     * 连接登录探测能不能发起由 manifest 的 `auth.probeSupported` 声明决定（Proposal
     * connection-login-lifecycle-v1 决定 2）：宿主不硬编码 connectorId。
     */
    protected supportsAuthProbe(connectorId: string): boolean {
        return (this.catalog?.listSourceDefinitions() ?? []).some(
            (definition) => definition.connectorId === connectorId && definition.auth.probeSupported,
        );
    }

    protected requireWorkflowStore(): WorkflowHostStore {
        if (!this.workflowStore) {
            throw new ConflictException({
                code: "conflict",
                message: "The durable workflow host is not enabled.",
                retryable: false,
            });
        }
        return this.workflowStore;
    }

    protected toRunControlResult(
        action: RunControlAction,
        envelope: WorkflowEnvelope,
        explanation: { reuse: string; sideEffects: string },
    ) {
        return runControlResultSchema.parse({
            action,
            run: toPublicWorkflowRun(envelope),
            reuse: explanation.reuse,
            sideEffects: explanation.sideEffects,
        });
    }

    protected async toMediaCleanupSnapshot(envelope: WorkflowEnvelope) {
        const report = await this.repository.getMediaCleanupReport(envelope.runId);
        const parsedProductRun = productRunSchema.safeParse(envelope.productRun);
        return mediaCleanupRunSnapshotSchema.parse({
            runId: envelope.runId,
            status: toProductWorkflowRunStatus(envelope.status),
            report,
            error: parsedProductRun.success ? parsedProductRun.data.error ?? null : null,
        });
    }
}
