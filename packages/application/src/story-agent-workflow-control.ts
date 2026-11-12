import { z } from "zod";
import { UuidIdGenerator, type JsonValue } from "@notnotype/nb-workflow";
import { storyAgentGenerationRequestSchema, storyAgentGenerationSchema, type StoryAgentCandidate, type StoryAgentGeneration,
    type StoryAgentGenerationRequest } from "@cosmos/contracts";
import type { ContentQuery } from "./content-query.js";
import type { StoryAgentSnapshotReader } from "./story-agent.js";
import type { SystemConfigRepository } from "./system-config.js";
import { prepareStoryAgentRequest, preparedStoryAgentSchema } from "./story-agent-preparation.js";
import { WorkflowHostConflictError, WorkflowHostError, type WorkflowEnvelope, type WorkflowHostStore } from "./workflow-host.js";

export const storyAgentWorkflowManifestHash = "builtin:cosmos.story-agent@1:model-v3";
export const storyAgentWorkflowInputSchema = z.object({
    request: storyAgentGenerationRequestSchema,
    prepared: preparedStoryAgentSchema,
    candidateId: z.string().min(1), createdAt: z.string().datetime(),
}).strict();

/** Only approved public projections enter this snapshot; credentials resolve in the Worker. */
export class StoryAgentWorkflowControl {
    constructor(private readonly options: {
        store: Pick<WorkflowHostStore, "loadWorkflowEnvelope" | "createWorkflowEnvelope" | "findWorkflowEnvelopeByIdempotencyKey">;
        stories: StoryAgentSnapshotReader; content: ContentQuery;
        systemConfig: Pick<SystemConfigRepository, "getDefaultModelId" | "getModelSelection" | "getStoryAgentTimeoutSeconds">;
        failureCodes?: { getStoryAgentFailureCode(runId: string): Promise<string | null> };
        candidates?: { get(candidateId: string): Promise<StoryAgentCandidate | null> };
    }) {}

    async enqueue(input: StoryAgentGenerationRequest & { storyId: string; idempotencyKey: string }): Promise<StoryAgentGeneration> {
        const request = storyAgentGenerationRequestSchema.parse({ task: input.task, modelId: input.modelId, sources: input.sources });
        const key = input.idempotencyKey.trim();
        if (!key || !input.storyId.trim()) throw new WorkflowHostError("invalid_state", "Story generation requires Story and idempotency key.");
        const existing = await this.options.store.findWorkflowEnvelopeByIdempotencyKey(key);
        if (existing) {
            this.assertMatches(existing, input.storyId, request);
            return this.project(existing);
        }
        const modelId = request.modelId ?? await this.options.systemConfig.getDefaultModelId();
        const selection = modelId === null ? null : await this.options.systemConfig.getModelSelection(modelId);
        if (!selection || selection.providerState !== "active") {
            throw new WorkflowHostConflictError("请先在设置页选择一个可用的默认模型。");
        }
        const timeoutSeconds = await this.options.systemConfig.getStoryAgentTimeoutSeconds();
        const prepared = await prepareStoryAgentRequest(this.options.stories, this.options.content,
            { storyId: input.storyId, task: request.task, sources: request.sources }, {
                modelId: request.modelId,
                authority: { allowedProfiles: request.sources?.length ? ["summary-only", "structured-content"] : ["summary-only"] },
                budget: { maxDurationMs: timeoutSeconds * 1000, maxToolCalls: 0, maxOutputTokens: 2048 },
            });
        const runId = new UuidIdGenerator().nextId("run");
        const snapshot = storyAgentWorkflowInputSchema.parse({ request, prepared, candidateId: `story-candidate-${runId}`, createdAt: new Date().toISOString() });
        try {
            const envelope = await this.options.store.createWorkflowEnvelope({ runId, idempotencyKey: key,
                definition: { key: "cosmos.story-agent", version: "1", manifestHash: storyAgentWorkflowManifestHash },
                inputSnapshot: json(snapshot), productRun: json({ storyId: input.storyId, status: "queued" }),
            });
            return this.project(envelope);
        } catch (error) {
            // Concurrent same-key preparation may observe newer data; the first durable envelope wins.
            const winner = await this.options.store.findWorkflowEnvelopeByIdempotencyKey(key);
            if (!winner) throw error;
            this.assertMatches(winner, input.storyId, request);
            return this.project(winner);
        }
    }

    async read(storyId: string, runId: string): Promise<StoryAgentGeneration> {
        const envelope = await this.options.store.loadWorkflowEnvelope(runId);
        if (!envelope || envelope.definition.key !== "cosmos.story-agent"
            || storyAgentWorkflowInputSchema.parse(envelope.inputSnapshot).prepared.story.storyId !== storyId) {
            throw new WorkflowHostError("not_found", "Story generation not found.");
        }
        return this.project(envelope);
    }

    private assertMatches(envelope: WorkflowEnvelope, storyId: string, request: StoryAgentGenerationRequest): void {
        const parsed = storyAgentWorkflowInputSchema.safeParse(envelope.inputSnapshot);
        if (envelope.definition.key !== "cosmos.story-agent" || !parsed.success
            || parsed.data.prepared.story.storyId !== storyId || canonical(parsed.data.request) !== canonical(request)) {
            throw new WorkflowHostConflictError("Idempotency key conflicts with another generation request.");
        }
    }

    private async project(envelope: WorkflowEnvelope): Promise<StoryAgentGeneration> {
        const { request, prepared, candidateId } = storyAgentWorkflowInputSchema.parse(envelope.inputSnapshot);
        const status = ["completed", "failed", "cancelled", "queued"].includes(envelope.status) ? envelope.status : "running";
        const errorCode = status === "failed"
            ? await this.options.failureCodes?.getStoryAgentFailureCode(envelope.runId) ?? "generation_failed"
            : null;
        const generation = { runId: envelope.runId, storyId: prepared.story.storyId, task: request.task, status,
            candidateId: status === "completed" ? candidateId : null, errorCode };
        if (status !== "completed" || candidateId !== `story-candidate-${envelope.runId}` || !this.options.candidates) {
            return storyAgentGenerationSchema.parse(generation);
        }
        const candidate = await this.options.candidates.get(candidateId);
        if (!candidate || candidate.id !== candidateId || candidate.storyId !== prepared.story.storyId
            || candidate.storyRevisionId !== prepared.story.storyRevisionId || candidate.proposal.task !== request.task) {
            return storyAgentGenerationSchema.parse(generation);
        }
        return storyAgentGenerationSchema.parse({ ...generation, ...(candidate.cost ? { cost: candidate.cost } : {}) });
    }
}

function canonical(request: StoryAgentGenerationRequest): string {
    return JSON.stringify([request.modelId ?? null, request.task, request.sources ?? []]);
}
function json(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}
