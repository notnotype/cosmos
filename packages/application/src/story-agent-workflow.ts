import { z } from "zod";
import { agentInvocationOutputSchema, storyAgentCandidateRecordSchema, type ActionDefinition,
    type StoryAgentCandidate } from "@cosmos/contracts";
import type { JsonValue, WorkflowDefinition } from "@notnotype/nb-workflow";
import { ActionExecutionError, type HostActionExecutionContext, type HostActionExecutionFence, type RegisteredAction } from "./action.js";
import type { StoryAgentCandidateRecord } from "./story-agent-candidates.js";
import { completeStoryAgentProposal } from "./story-agent.js";
import { storyAgentWorkflowInputSchema, storyAgentWorkflowManifestHash } from "./story-agent-workflow-control.js";

const saveInputSchema = z.object({ snapshot: storyAgentWorkflowInputSchema, output: agentInvocationOutputSchema }).strict();
export interface StoryAgentGeneratedCandidateStore {
    saveGenerated(candidate: StoryAgentCandidate, fence: HostActionExecutionFence): Promise<StoryAgentCandidateRecord>;
}

export function createStoryAgentSaveAction(store: StoryAgentGeneratedCandidateStore): RegisteredAction {
    const definition: ActionDefinition = {
        ref: "story.agent-candidate.save@1", manifestHash: "builtin:story.agent-candidate.save@1",
        kind: "library", description: "Validate and persist a pending Story proposal under the current Workflow fence.",
        capabilities: ["library:write"], executionPlacement: "host", inputSchema: saveInputSchema,
        outputSchema: storyAgentCandidateRecordSchema,
        execution: { idempotent: true, supportsCancellation: true, timeoutMs: null,
            retryPolicy: { maxAttempts: 2, backoffMs: 1000 } },
    };
    return { definition, handler: async (raw: unknown, context: HostActionExecutionContext) => {
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Story generation cancelled");
        const parsed = saveInputSchema.safeParse(raw);
        if (!parsed.success) throw new ActionExecutionError("malformed_payload", "Story Agent returned an invalid proposal.", false);
        const { snapshot, output } = parsed.data;
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Story generation cancelled");
        if (output.finishReason === "cancelled") {
            throw new ActionExecutionError("timeout", "Story Agent invocation budget expired.", false);
        }
        let candidate: StoryAgentCandidate;
        try {
            candidate = completeStoryAgentProposal(snapshot.prepared, output, {
                id: snapshot.candidateId, createdAt: snapshot.createdAt,
            });
        } catch {
            throw new ActionExecutionError("malformed_payload", "Story Agent returned an invalid proposal.", false);
        }
        return store.saveGenerated(candidate, context.fence);
    } };
}

export function createStoryAgentWorkflowDefinition(): WorkflowDefinition<JsonValue, JsonValue> & {
    inputSchema: typeof storyAgentWorkflowInputSchema;
    requiredActionRefs: readonly string[];
} {
    return {
        key: "cosmos.story-agent", version: "1", manifestHash: storyAgentWorkflowManifestHash,
        requires: { durability: "durable", processRestart: true, concurrentExecution: true, multiWorker: true,
            leases: true, externalReceipts: true, valueReferences: true },
        inputSchema: storyAgentWorkflowInputSchema,
        requiredActionRefs: ["agent.invoke@2", "story.agent-candidate.save@1"],
        run: async (workflow, raw) => {
            const snapshot = storyAgentWorkflowInputSchema.parse(raw);
            const output = await workflow.callAction("agent.invoke@2", json(snapshot.prepared.input), { key: "story.agent.invoke" });
            const result = await workflow.callAction("story.agent-candidate.save@1", json({ snapshot, output }), { key: "story.agent.save" });
            return result;
        },
    };
}
function json(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}
