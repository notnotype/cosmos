import { describe, expect, it, vi } from "vitest";
import { agentInvocationV2InputSchema, type AgentInvocationOutput, type StoryAgentProposal } from "@cosmos/contracts";
import type { AgentInvocationV2Port } from "./agent-invocation-v2.js";
import { ContentQuery } from "./content-query.js";
import { StoryAgent, type StoryAgentHost } from "./story-agent.js";
import { StoryAgentService } from "./story-agent-service.js";
import { StoryAgentCandidates, type StoryAgentCandidateRepository } from "./story-agent-candidates.js";

const binding = { entryRevisionId: "revision-1", representationVersion: 2 };
const evidence = { entryId: "entry-1", ...binding, blockId: "block-1" };
const host: StoryAgentHost = {
    authority: { allowedProfiles: ["summary-only", "structured-content"] },
    connectionId: "connection-1", budget: { maxDurationMs: 1000, maxToolCalls: 0, maxOutputTokens: 1000 },
    createCandidateId: () => "candidate-1", now: () => new Date("2026-10-08T12:00:00.000Z"),
};
const context = { idempotencyKey: "fixture", signal: new AbortController().signal };
function fixture(proposal: StoryAgentProposal) {
    const readStory = vi.fn(async () => ({ storyId: "story-1", storyRevisionId: "story-revision-1",
        title: "Original", summary: "Original summary", entryRevisionIds: ["revision-1", "revision-2"] }));
    const readContentSource = vi.fn(async (target: { entryRevisionId: string; representationVersion?: number }) => ({ entryId: target.entryRevisionId === "revision-2" ? "entry-2" : "entry-1", entryRevisionId: target.entryRevisionId,
        currentRepresentationId: "representation-3", contentText: "Legacy", evidenceStatus: "available" as const,
        representation: { id: "representation-2", ...binding, entryRevisionId: target.entryRevisionId, parserVersion: "fixture@1", status: "partial",
            contentText: "Untrusted source", blocks: [{ id: "block-1", type: "paragraph", data: { inlines: [{ type: "text", text: "Untrusted source" }] } }],
            createdAt: "2026-10-08T12:00:00.000Z" } }));
    const invoke = vi.fn<AgentInvocationV2Port["invoke"]>(async (input): Promise<AgentInvocationOutput> => {
        agentInvocationV2InputSchema.parse(input);
        return { content: JSON.stringify(proposal), toolCalls: [],
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            provider: "fake", model: "fixture", finishReason: "stop", metadata: {} };
    });
    return { agent: new StoryAgent({ readStory }, new ContentQuery({ readContentSource }), { invoke }),
        readStory, readContentSource, invoke };
}
const summary: StoryAgentProposal = { task: "story.summarize", title: "Suggested", summary: "Suggested summary",
    keyFacts: [{ text: "Fact", evidence: [evidence] }] };

describe("StoryAgent candidate boundary", () => {
    it("passes only the host connection and preserves the actual invocation identity", async () => {
        const f = fixture({ ...summary, keyFacts: [] });
        const legacyHost = { ...host, provider: "ignored-provider", model: "ignored-model" };
        const candidate = await f.agent.propose({ storyId: "story-1", task: "story.summarize" }, legacyHost, context);
        const [input, invocationContext] = f.invoke.mock.calls[0]!;
        expect(input).toEqual({ connectionId: "connection-1", budget: host.budget, tools: [],
            messages: expect.any(Array), metadata: { task: "story.summarize", storyId: "story-1", storyRevisionId: "story-revision-1" } });
        expect(invocationContext).toBe(context);
        expect(candidate).toMatchObject({ provider: "fake", model: "fixture" });
    });
    it.each(["", "   ", "x".repeat(201)])("rejects invalid host connection IDs before reading snapshots: %s", async (connectionId) => {
        const f = fixture(summary);
        await expect(f.agent.propose({ storyId: "story-1", task: "story.summarize" }, { ...host, connectionId }, context)).rejects.toThrow();
        expect(f.readStory).not.toHaveBeenCalled();
        expect(f.readContentSource).not.toHaveBeenCalled();
        expect(f.invoke).not.toHaveBeenCalled();
    });
    it("does not read snapshots or invoke when already cancelled", async () => {
        const f = fixture(summary);
        const controller = new AbortController();
        controller.abort(new Error("Cancelled before reading"));
        await expect(f.agent.propose({ storyId: "story-1", task: "story.summarize" }, host,
            { ...context, signal: controller.signal })).rejects.toThrow("Cancelled before reading");
        expect(f.readStory).not.toHaveBeenCalled();
        expect(f.invoke).not.toHaveBeenCalled();
    });
    it.each<StoryAgentProposal>([
        summary,
        { task: "story.extract-relations", relations: [{ sourceEntryId: "entry-1", targetEntryId: "entry-2", type: "near_duplicate_of", reason: "Fixture", evidence: [evidence] }] },
        { task: "story.review-content-quality", findings: [{ severity: "warning", message: "Partial input", evidence: [evidence] }] },
    ])("binds $task to the exact historical input without formal writes", async (proposal) => {
        const f = fixture(proposal);
        const sources = proposal.task === "story.extract-relations"
            ? [binding, { ...binding, entryRevisionId: "revision-2" }] : [binding];
        const candidate = await f.agent.propose({ storyId: "story-1", task: proposal.task, sources }, host, context);
        expect(candidate).toMatchObject({ storyRevisionId: "story-revision-1", inputSources: sources, proposal, producer: "agent" });
        expect(f.readContentSource).toHaveBeenCalledWith(binding);
        expect(f.invoke.mock.calls).toHaveLength(1);
    });
    it.each<StoryAgentProposal>([
        summary,
        { task: "story.extract-relations", relations: [] },
        { task: "story.review-content-quality", findings: [] },
    ])("discloses structured evidence objects for $task instead of an unexplained empty array", async (proposal) => {
        const f = fixture(proposal);
        await f.agent.propose({ storyId: "story-1", task: proposal.task, sources: [binding] }, host, context);
        const prompt = f.invoke.mock.calls[0]![0].messages[0]!.content;
        const shape = JSON.parse(prompt.split("Expected shape: ")[1]!);
        const items = shape.keyFacts ?? shape.relations ?? shape.findings;
        expect(items[0].evidence).toEqual([{ entryId: "string", entryRevisionId: "string", representationVersion: 1, blockId: "string" }]);
        expect(prompt).toContain("blockId is optional");
        expect(prompt).toContain("positive integer");
        expect(prompt).toContain("If no evidence is supplied, use an empty evidence array");
        expect(prompt).toContain("never strings");
    });
    it("rejects string evidence without saving a candidate", async () => {
        const f = fixture(summary);
        f.invoke.mockResolvedValueOnce({ content: JSON.stringify({ ...summary, keyFacts: [{ text: "PRIVATE-FACT", evidence: ["PRIVATE-REFERENCE"] }] }),
            toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, provider: "fake", model: "fixture", finishReason: "stop", metadata: {} });
        const save = vi.fn<StoryAgentCandidateRepository["save"]>();
        const service = new StoryAgentService(f.agent, new StoryAgentCandidates({ save, decide: vi.fn(), list: async () => [] }), host);
        await expect(service.propose({ storyId: "story-1", task: "story.summarize", sources: [binding] }, context)).rejects.toThrow();
        expect(save).not.toHaveBeenCalled();
    });
    it("uses summary only by default without reading source content", async () => {
        const f = fixture({ ...summary, keyFacts: [] });
        const candidate = await f.agent.propose({ storyId: "story-1", task: "story.summarize" },
            { ...host, authority: { allowedProfiles: ["summary-only"] } }, context);
        expect(candidate.inputSources).toEqual([]);
        expect(f.readContentSource).not.toHaveBeenCalled();
    });
    it("denies expanded scope before reading any snapshots", async () => {
        const f = fixture(summary);
        await expect(f.agent.propose({ storyId: "story-1", task: "story.summarize", sources: [binding] },
            { ...host, authority: { allowedProfiles: ["summary-only"] } }, context)).rejects.toThrow("access denied");
        expect(f.readStory).not.toHaveBeenCalled();
        expect(f.invoke).not.toHaveBeenCalled();
    });
    it("rejects foreign sources and invented block evidence", async () => {
        const f = fixture(summary);
        await expect(f.agent.propose({ storyId: "story-1", task: "story.summarize", sources: [{ ...binding, entryRevisionId: "foreign" }] }, host, context)).rejects.toThrow("not a Story member");
        expect(f.invoke).not.toHaveBeenCalled();
        const invented = fixture({ ...summary, keyFacts: [{ text: "Fact", evidence: [{ ...evidence, blockId: "invented" }] }] });
        await expect(invented.agent.propose({ storyId: "story-1", task: "story.summarize", sources: [binding] }, host, context)).rejects.toThrow("unread evidence");
    });
    it("rejects relation endpoints outside the content actually read", async () => {
        const f = fixture({ task: "story.extract-relations", relations: [{
            sourceEntryId: "entry-1", targetEntryId: "unread-entry", type: "near_duplicate_of",
            reason: "Unsupported endpoint", evidence: [evidence],
        }] });
        await expect(f.agent.propose({ storyId: "story-1", task: "story.extract-relations", sources: [binding] }, host, context))
            .rejects.toThrow("relation references an unread Entry");
    });
    it("persists only validated proposals and never decides them during generation", async () => {
        const f = fixture({ ...summary, keyFacts: [] });
        const save = vi.fn<StoryAgentCandidateRepository["save"]>(async (candidate) => ({ candidate, status: "pending" }));
        const decide = vi.fn<StoryAgentCandidateRepository["decide"]>();
        const candidates = new StoryAgentCandidates({ save, decide, list: async () => [] });
        const service = new StoryAgentService(f.agent, candidates, host);
        const result = await service.propose({ storyId: "story-1", task: "story.summarize" }, context);
        expect(result.status).toBe("pending");
        expect(save).toHaveBeenCalledOnce();
        expect(decide).not.toHaveBeenCalled();
        f.invoke.mockResolvedValueOnce({ content: "invalid JSON", toolCalls: [],
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, provider: "fake", model: "fixture",
            finishReason: "stop", metadata: {} });
        await expect(service.propose({ storyId: "story-1", task: "story.summarize" }, context)).rejects.toThrow();
        expect(save).toHaveBeenCalledOnce();
    });
    it("does not persist a proposal when invocation finishes after cancellation", async () => {
        const f = fixture({ ...summary, keyFacts: [] });
        const save = vi.fn<StoryAgentCandidateRepository["save"]>();
        const candidates = new StoryAgentCandidates({ save, decide: vi.fn(), list: async () => [] });
        const service = new StoryAgentService(f.agent, candidates, host);
        const controller = new AbortController();
        f.invoke.mockImplementationOnce(async () => {
            controller.abort(new Error("Cancelled fixture"));
            return { content: JSON.stringify({ ...summary, keyFacts: [] }), toolCalls: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, provider: "fake", model: "fixture",
                finishReason: "stop", metadata: {} };
        });
        await expect(service.propose({ storyId: "story-1", task: "story.summarize" },
            { ...context, signal: controller.signal })).rejects.toThrow("Cancelled fixture");
        expect(save).not.toHaveBeenCalled();
    });
    it("rejects malformed bindings before any reads", async () => {
        const f = fixture(summary);
        await expect(f.agent.propose({ storyId: "story-1", task: "story.summarize", sources: [{ ...binding, representationVersion: 0 }] }, host, context)).rejects.toThrow();
        expect(f.readStory).not.toHaveBeenCalled();
    });
});
