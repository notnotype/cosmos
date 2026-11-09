import {
    ActionRegistry,
    ContentQuery,
    StoryAgent,
    StoryAgentCandidates,
    StoryAgentService,
    type AgentInvocationV2Port,
    type AgentModelSnapshot,
    type StoryAgentCandidateRepository,
    type StoryAgentHost,
} from "@cosmos/application";
import { agentInvocationOutputSchema } from "@cosmos/contracts";
import type { PiAiClientV2 } from "@cosmos/agent-pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createWorkerAgentInvocationV2Action } from "./agent-action-v2.js";

const modelId = "configured-model-id";
const model: AgentModelSnapshot = {
    modelId: "configured-model-id", modelName: "Synthetic Model", providerId: "configured-provider", api: "openai-completions",
    baseUrl: "https://model.example.invalid/v1", contextWindow: 4096, maxOutputTokens: 256, secretRef: "opaque-ref",
    inputPricePerMillion: null, outputPricePerMillion: null,
};
const binding = { entryRevisionId: "entry-revision-1", representationVersion: 2 };
const evidence = { entryId: "entry-1", ...binding, blockId: "paragraph-1" };
const proposal = { task: "story.summarize", title: "Suggested", summary: "Suggested summary",
    keyFacts: [{ text: "A supplied fact", evidence: [evidence] }] };
const host: StoryAgentHost = {
    modelId, authority: { allowedProfiles: ["summary-only", "structured-content"] },
    budget: { maxDurationMs: 1000, maxToolCalls: 0, maxOutputTokens: 1024 },
    createCandidateId: () => "candidate-1", now: () => new Date("2026-10-26T07:00:00.000Z"),
};

function fixture() {
    const resolve = vi.fn(async (): Promise<AgentModelSnapshot | null> => model);
    const read = vi.fn(async (): Promise<string | null> => "synthetic-credential");
    const response: Awaited<ReturnType<PiAiClientV2["complete"]>> = {
        role: "assistant", content: [{ type: "text", text: JSON.stringify(proposal) }],
        api: "openai-completions", provider: model.providerId, model: model.modelId,
        usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop", timestamp: 0,
    };
    const complete = vi.fn<PiAiClientV2["complete"]>(async () => response);
    const registry = new ActionRegistry([createWorkerAgentInvocationV2Action({
        models: { resolve }, client: { complete },
        secrets: { read, put: async () => { throw new Error("Unexpected credential write"); },
            delete: async () => { throw new Error("Unexpected credential deletion"); } },
    })]);
    const invocation: AgentInvocationV2Port = {
        invoke: async (input, context) => agentInvocationOutputSchema.parse(
            await registry.dispatch("agent.invoke@2", input, context)),
    };
    const readContentSource = vi.fn(async () => ({
        entryId: "entry-1", entryRevisionId: binding.entryRevisionId, currentRepresentationId: "rep-3",
        contentText: "Legacy", evidenceStatus: "available" as const,
        representation: { id: "rep-2", ...binding, parserVersion: "fixture@1", status: "partial",
            contentText: "Supplied fact", blocks: [{ id: "paragraph-1", type: "paragraph",
                data: { inlines: [{ type: "text", text: "Supplied fact" }] } }], createdAt: host.now().toISOString() },
    }));
    const agent = new StoryAgent({ readStory: async () => ({
        storyId: "story-1", storyRevisionId: "story-revision-1", title: "Original", summary: "Original summary",
        entryRevisionIds: [binding.entryRevisionId],
    }) }, new ContentQuery({ readContentSource }), invocation);
    const save = vi.fn<StoryAgentCandidateRepository["save"]>(async (candidate) => ({ candidate, status: "pending" }));
    const decide = vi.fn<StoryAgentCandidateRepository["decide"]>();
    const service = new StoryAgentService(agent, new StoryAgentCandidates({ save, decide, list: async () => [] }), host);
    const controller = new AbortController();
    const context = { idempotencyKey: "task40-isolated-invocation", signal: controller.signal };
    const request = { storyId: "story-1", task: "story.summarize" as const, sources: [binding] };
    return { service, resolve, read, complete, response, readContentSource, save, decide, controller, context, request };
}

describe("Story generation through the Worker @2 composition without network", () => {
    it("persists a pending proposal bound to historical content and the resolved model", async () => {
        const f = fixture();
        const result = await f.service.propose(f.request, f.context);
        expect(result).toMatchObject({ status: "pending", candidate: {
            storyRevisionId: "story-revision-1", inputSources: [binding], proposal,
            provider: model.providerId, model: model.modelId,
        } });
        expect(f.resolve).toHaveBeenCalledTimes(1);
        expect(f.resolve).toHaveBeenCalledWith(model.modelId);
        expect(f.read).toHaveBeenCalledTimes(1);
        expect(f.read).toHaveBeenCalledWith(model.secretRef);
        expect(f.readContentSource).toHaveBeenCalledTimes(1);
        expect(f.readContentSource).toHaveBeenCalledWith(binding);
        expect(f.complete).toHaveBeenCalledOnce();
        const [piModel, payload, options] = f.complete.mock.calls[0]!;
        expect(piModel).toMatchObject({ id: model.modelId, provider: model.providerId, baseUrl: model.baseUrl });
        expect(options).toMatchObject({ maxTokens: model.maxOutputTokens, metadata: { idempotencyKey: f.context.idempotencyKey } });
        expect(payload.messages).toEqual([expect.objectContaining({
            role: "user", content: expect.stringContaining('"representationVersion":2'),
        })]);
        expect(JSON.stringify(payload)).not.toContain("synthetic-credential");
        expect(JSON.stringify(result)).not.toContain("synthetic-credential");
        expect(f.save).toHaveBeenCalledOnce();
        expect(f.decide).not.toHaveBeenCalled();
    });
    it("does not read credentials or save when the selected model is unavailable", async () => {
        const f = fixture();
        f.resolve.mockResolvedValueOnce(null);
        await expect(f.service.propose(f.request, f.context)).rejects.toMatchObject({ code: "authentication_required" });
        expect(f.read).not.toHaveBeenCalled();
        expect(f.complete).not.toHaveBeenCalled();
        expect(f.save).not.toHaveBeenCalled();
        expect(f.decide).not.toHaveBeenCalled();
    });
    it("does not persist a proposal after an invocation failure", async () => {
        const f = fixture();
        f.complete.mockRejectedValueOnce(new Error("Synthetic upstream failure"));
        await expect(f.service.propose(f.request, f.context)).rejects.toThrow();
        expect(f.complete).toHaveBeenCalledOnce();
        expect(f.save).not.toHaveBeenCalled();
        expect(f.decide).not.toHaveBeenCalled();
    });
    it("does not persist an invalid proposal returned by the model", async () => {
        const f = fixture();
        f.complete.mockResolvedValueOnce({ ...f.response, content: [{ type: "text", text: "not a JSON proposal" }] });
        await expect(f.service.propose(f.request, f.context)).rejects.toThrow();
        expect(f.complete).toHaveBeenCalledOnce();
        expect(f.save).not.toHaveBeenCalled();
        expect(f.decide).not.toHaveBeenCalled();
    });
    it("does not save when cancellation happens during the model request", async () => {
        const f = fixture();
        f.complete.mockImplementationOnce(async () => {
            f.controller.abort(new Error("Synthetic cancellation"));
            return f.response;
        });
        await expect(f.service.propose(f.request, f.context)).rejects.toMatchObject({ code: "cancelled" });
        expect(f.save).not.toHaveBeenCalled();
        expect(f.decide).not.toHaveBeenCalled();
    });
});
