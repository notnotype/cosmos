import { z } from "zod";
import { agentInvocationOutputSchema, storyAgentProposalSchema } from "@cosmos/contracts";
import type { PrismaClient } from "@prisma/client";

const activityPayload = z.object({ reference: z.string(), input: z.unknown().optional() });

/** Inspect only this run's durable stages; never publish errors, schema issues or model content. */
export async function classifyBodyGenerationFailure(prisma: PrismaClient, runId: string) {
    const jobs = await prisma.job.findMany({ where: { workflowRunId: runId },
        select: { payloadJson: true, status: true } });
    const activities = jobs.map(job => ({ ...job, payload: activityPayload.safeParse(parseJson(job.payloadJson)) }));
    const save = activities.find(job => job.payload.success && job.payload.data.reference === "story.agent-candidate.save@1");
    const invoke = activities.find(job => job.payload.success && job.payload.data.reference === "agent.invoke@2");
    if (!save || save.status !== "failed_terminal") {
        return invoke?.status === "failed_terminal" ? "invocation_failed" : "generation_failed";
    }
    const input = z.object({ output: z.unknown() }).safeParse(save.payload.success ? save.payload.data.input : undefined);
    const output = agentInvocationOutputSchema.safeParse(input.success ? input.data.output : undefined);
    if (!output.success) return "completion_invalid";
    if (output.data.finishReason !== "stop" || output.data.toolCalls.length) return "completion_incomplete";
    let proposal: unknown;
    try { proposal = JSON.parse(output.data.content); } catch { return "proposal_json_invalid"; }
    if (!storyAgentProposalSchema.safeParse(proposal).success) return "proposal_schema_invalid";
    // Format validation cannot distinguish evidence/allowlist rejection from a persistence failure.
    return "candidate_save_failed";
}

function parseJson(value: string | null): unknown {
    try { return JSON.parse(value ?? "null"); } catch { return null; }
}
