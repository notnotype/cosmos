import { agentInvocationOutputSchema, storyAgentCandidateSchema, storyAgentProposalSchema,
    type AgentInvocationV2Input, type ContentBlockContract, type StoryAgentCandidate,
    type StoryAgentSourceBinding, type StoryAgentTask } from "@cosmos/contracts";
import type { AgentInvocationContext } from "./agent-invocation.js";
import type { AgentInvocationV2Port } from "./agent-invocation-v2.js";
import type { ContentReadAuthority } from "./content-access-policy.js";
import type { ContentQuery } from "./content-query.js";
import { prepareStoryAgentRequest, type PreparedStoryAgent } from "./story-agent-preparation.js";

export interface StoryAgentSnapshot {
    storyId: string;
    storyRevisionId: string;
    title: string;
    summary: string;
    entryRevisionIds: readonly string[];
}
export interface StoryAgentSnapshotReader {
    readStory(storyId: string): Promise<StoryAgentSnapshot | null>;
}
export interface StoryAgentRequest {
    storyId: string;
    task: StoryAgentTask;
    sources?: readonly StoryAgentSourceBinding[];
}
export interface StoryAgentHost {
    authority: ContentReadAuthority;
    modelId?: string;
    budget: AgentInvocationV2Input["budget"];
    createCandidateId(): string;
    now(): Date;
}

function blockIds(blocks: readonly ContentBlockContract[]): Set<string> {
    const ids = new Set<string>();
    const pending = [...blocks];
    while (pending.length) {
        const block = pending.pop();
        if (!block) continue;
        ids.add(block.id);
        if (block.type === "quote") pending.push(...block.data.blocks);
        if (block.type === "list") for (const item of block.data.items) pending.push(...(item.blocks ?? []));
    }
    return ids;
}

/** Model output never owns candidate identity, provenance or the evidence allowlist. */
export function completeStoryAgentProposal(
    prepared: PreparedStoryAgent, rawOutput: unknown, identity: { id: string; createdAt: string },
): StoryAgentCandidate {
    const { story, task, views } = prepared;
    const output = agentInvocationOutputSchema.parse(rawOutput);
    if (output.finishReason !== "stop" || output.toolCalls.length) throw new Error("Story Agent proposal did not complete without tools");
    const proposal = storyAgentProposalSchema.parse(JSON.parse(output.content));
    if (proposal.task !== task) throw new Error("Story Agent proposal task mismatch");
    if (proposal.task === "story.extract-relations") {
        const entryIds = new Set(views.map((view) => view.entryId));
        for (const relation of proposal.relations) {
            if (relation.sourceEntryId === relation.targetEntryId) throw new Error("Story Agent relation cannot reference the same Entry twice");
            if (!entryIds.has(relation.sourceEntryId) || !entryIds.has(relation.targetEntryId)) throw new Error("Story Agent relation references an unread Entry");
        }
    }
    const references = proposal.task === "story.summarize" ? proposal.keyFacts.flatMap((fact) => fact.evidence)
        : proposal.task === "story.extract-relations" ? proposal.relations.flatMap((relation) => relation.evidence)
            : proposal.findings.flatMap((finding) => finding.evidence);
    for (const reference of references) {
        const view = views.find((value) => value.entryId === reference.entryId
            && value.entryRevisionId === reference.entryRevisionId
            && value.representation?.representationVersion === reference.representationVersion);
        if (!view?.representation || (reference.blockId && !blockIds(view.representation.blocks).has(reference.blockId))) throw new Error("Story Agent proposal references unread evidence");
    }
    return storyAgentCandidateSchema.parse({
        id: identity.id, storyId: story.storyId, storyRevisionId: story.storyRevisionId,
        producer: "agent", producerVersion: "story-agent@1", provider: output.provider, model: output.model,
        inputSources: views.map((view) => ({ entryRevisionId: view.entryRevisionId,
            representationVersion: view.representation?.representationVersion })),
        confidence: null, proposal, createdAt: identity.createdAt,
    });
}

/** This use case can read snapshots and invoke the existing adapter; it has no formal write port. */
export class StoryAgent {
    constructor(
        private readonly stories: StoryAgentSnapshotReader,
        private readonly content: ContentQuery,
        private readonly invocation: AgentInvocationV2Port,
    ) {}

    async propose(request: StoryAgentRequest, host: StoryAgentHost, context: AgentInvocationContext): Promise<StoryAgentCandidate> {
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Story Agent request cancelled");
        const prepared = await prepareStoryAgentRequest(this.stories, this.content, request, host);
        const output = await this.invocation.invoke(prepared.input, context);
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Story Agent request cancelled");
        return completeStoryAgentProposal(prepared, output, { id: host.createCandidateId(), createdAt: host.now().toISOString() });
    }
}
