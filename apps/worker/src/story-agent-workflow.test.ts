import { afterEach, expect, it, vi } from "vitest";
import * as application from "@cosmos/application";
import { configuredModelSnapshotSchema } from "@cosmos/contracts";
import { PrismaStoryAgentCandidateRepository, PrismaStoryAgentFailureCodeReader } from "@cosmos/storage-prisma";
import { createWorkerAgentInvocationV2Action } from "./agent-action-v2.js";
import { createWorkflowHost } from "./workflow-host.js";
import { cleanupTemporaryRoots, drainWorkflow, withRepository } from "./workflow-ingest.fixtures.js";

afterEach(cleanupTemporaryRoots);

function activeModelConfig(modelId: string, timeoutSeconds = 300) {
    const model = configuredModelSnapshotSchema.parse({ id: modelId, providerId: "provider", modelId: "upstream-model", name: "Synthetic",
        contextWindow: 4096, maxOutputTokens: 1024, version: 1, inputPricePerMillion: 0, outputPricePerMillion: 0,
        createdAt: "2026-10-08T12:00:00.000Z", updatedAt: "2026-10-08T12:00:00.000Z" });
    return { getDefaultModelId: async () => modelId,
        getStoryAgentTimeoutSeconds: async () => timeoutSeconds,
        getModelSelection: async (selectedId: string) => selectedId === modelId ? { model, providerState: "active" } : null };
}

it("queues once, resumes through the durable Worker and requires a human decision", async () => {
    expect(application.StoryAgentWorkflowControl).toBeTypeOf("function");
    await withRepository("story-agent-product", async (repository) => {
        await repository.prisma.story.create({ data: { id: "story", kind: "document" } });
        await repository.prisma.storyRevision.create({ data: { id: "base", storyId: "story", title: "Original" } });
        await repository.prisma.story.update({ where: { id: "story" }, data: { currentRevisionId: "base" } });
        const candidates = new PrismaStoryAgentCandidateRepository(repository.prisma);
        const modelId = "configured-model-id";
        const model = {
            modelId: "synthetic-model", modelName: "Synthetic", providerId: "synthetic-provider", api: "openai-completions" as const,
            baseUrl: "https://synthetic.invalid/v1", contextWindow: 4096, maxOutputTokens: 256, secretRef: "opaque-ref",
            inputPricePerMillion: 10_000, outputPricePerMillion: 20_000,
        };
        const models = { resolve: vi.fn(async (id: string | null) => id === modelId ? model : null) };
        const complete = vi.fn(async () => ({
            role: "assistant" as const, content: [{ type: "text" as const, text: JSON.stringify({
                task: "story.summarize", title: "Suggested", summary: "Suggested summary", keyFacts: [],
            }) }], api: "openai-completions" as const, provider: "synthetic-provider", model: "synthetic-model",
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "stop" as const, timestamp: 0,
        }));
        let persisted: { candidate: Parameters<typeof candidates.saveGenerated>[0]; fence: application.HostActionExecutionFence } | undefined;
        const options = {
            prisma: repository.prisma, blobs: repository.blobs,
            definitions: [application.createStoryAgentWorkflowDefinition()],
            actions: [createWorkerAgentInvocationV2Action({ models, secrets: {
                read: async () => "synthetic-key", put: async () => { throw new Error("Unexpected write"); }, delete: async () => false,
            }, client: { complete } }), application.createStoryAgentSaveAction({ saveGenerated: async (candidate, fence) => {
                persisted = { candidate, fence };
                const record = await candidates.saveGenerated(candidate, fence);
                expect(await candidates.saveGenerated(candidate, fence)).toEqual(record);
                await expect(candidates.saveGenerated({ ...candidate,
                    cost: { input: 9, output: 9, total: 18, currency: "USD" } }, fence)).rejects.toThrow("replay mismatch");
                return record;
            } })],
            leaseMs: 60_000,
        };
        const host = createWorkflowHost({ ...options, owner: "enqueue-host" });
        const control = new application.StoryAgentWorkflowControl({ store: host.store, candidates, systemConfig: activeModelConfig(modelId),
            failureCodes: new PrismaStoryAgentFailureCodeReader(repository.prisma),
            stories: { readStory: async () => ({ storyId: "story", storyRevisionId: "base", title: "Original", summary: "", entryRevisionIds: [] }) },
            content: new application.ContentQuery({ readContentSource: async () => { throw new Error("Unexpected full content read"); } }),
        });
        const request = { storyId: "story", modelId, task: "story.summarize" as const, idempotencyKey: "request-1" };
        const queued = await control.enqueue(request);
        expect(queued).toMatchObject({ status: "queued", candidateId: null });
        const queuedEnvelope = await host.store.loadWorkflowEnvelope(queued.runId);
        expect(queuedEnvelope?.inputSnapshot).toMatchObject({ prepared: { input: { budget: { maxDurationMs: 300_000 } } } });
        const replayControl = new application.StoryAgentWorkflowControl({ store: host.store, candidates, systemConfig: activeModelConfig(modelId, 900),
            stories: { readStory: async () => { throw new Error("Idempotent replay must use the original snapshot"); } },
            content: new application.ContentQuery({ readContentSource: async () => { throw new Error("Unexpected body read"); } }) });
        expect(await replayControl.enqueue(request)).toEqual(queued);
        const replayedEnvelope = await host.store.loadWorkflowEnvelope(queued.runId);
        expect(replayedEnvelope?.inputSnapshot).toMatchObject({ prepared: { input: { budget: { maxDurationMs: 300_000 } } } });
        await expect(control.enqueue({ ...request, modelId: "other-model" })).rejects.toMatchObject({ code: "conflict" });
        expect(complete).not.toHaveBeenCalled();
        expect(await repository.prisma.storyAgentCandidate.count()).toBe(0);
        const recovered = createWorkflowHost({ ...options, owner: "recovered-worker" });
        expect((await drainWorkflow(recovered, queued.runId)).status).toBe("completed");
        const finished = await control.read("story", queued.runId);
        expect(finished).toMatchObject({ status: "completed", candidateId: `story-candidate-${queued.runId}`,
            cost: { input: 0.01, output: 0.02, total: 0.03, currency: "USD" } });
        expect(complete).toHaveBeenCalledOnce();
        expect(await control.enqueue(request)).toEqual(finished);
        const restartedControl = new application.StoryAgentWorkflowControl({ store: recovered.store,
            candidates: new PrismaStoryAgentCandidateRepository(repository.prisma), systemConfig: activeModelConfig(modelId),
            stories: { readStory: async () => { throw new Error("Historical reads must use the durable snapshot"); } },
            content: new application.ContentQuery({ readContentSource: async () => { throw new Error("Unexpected body read"); } }),
        });
        model.inputPricePerMillion = 999;
        model.outputPricePerMillion = 999;
        expect(await restartedControl.read("story", queued.runId)).toEqual(finished);
        const saved = await candidates.get(finished.candidateId!);
        expect(saved?.cost).toEqual(finished.cost);
        const get = vi.spyOn(candidates, "get");
        for (const value of [null, { ...saved!, id: "other-candidate" }, { ...saved!, storyId: "other-story" },
            { ...saved!, storyRevisionId: "other-revision" },
            { ...saved!, proposal: { task: "story.review-content-quality" as const, findings: [] } }]) {
            get.mockResolvedValueOnce(value);
            expect(await control.read("story", queued.runId)).not.toHaveProperty("cost");
        }
        const { cost: _oldCost, ...legacy } = saved!;
        get.mockResolvedValueOnce(legacy);
        expect(await control.read("story", queued.runId)).not.toHaveProperty("cost");
        get.mockResolvedValueOnce({ ...saved!, cost: { input: 0, output: 0, total: 0, currency: "USD" } });
        expect(await control.read("story", queued.runId)).toHaveProperty("cost.total", 0);
        get.mockRestore();
        expect(persisted).toBeDefined();
        await expect(candidates.saveGenerated(persisted!.candidate, persisted!.fence)).rejects.toThrow("Workflow Run fence lost or Kernel revision changed.");
        expect(await repository.prisma.storyAgentCandidate.count()).toBe(1);
        expect(await repository.prisma.storyRevision.count()).toBe(1);
        expect(JSON.stringify(await host.store.loadWorkflowEnvelope(queued.runId))).not.toContain("synthetic-key");
        await expect(control.read("other-story", queued.runId)).rejects.toMatchObject({ code: "not_found" });
        const [candidate] = await candidates.list("story");
        expect(candidate).toMatchObject({ status: "pending", candidate: { provider: "synthetic-provider", model: "synthetic-model" } });
        await candidates.decide({ candidateId: candidate!.candidate.id, decision: "accept", actorId: "human" });
        expect(await repository.prisma.storyRevision.count()).toBe(2);
        await expect(candidates.decide({ candidateId: candidate!.candidate.id, decision: "accept", actorId: "human" })).rejects.toMatchObject({ code: "conflict" });
        const rejected = await control.enqueue({ ...request, idempotencyKey: "request-2" });
        await drainWorkflow(recovered, rejected.runId);
        await candidates.decide({ candidateId: `story-candidate-${rejected.runId}`, decision: "reject", actorId: "human" });
        expect(await repository.prisma.storyRevision.count()).toBe(2);
        const cancelled = await control.enqueue({ ...request, idempotencyKey: "request-cancel" });
        await host.store.cancelWorkflowRun({ runId: cancelled.runId });
        expect(await control.read("story", cancelled.runId)).toMatchObject({ status: "cancelled", candidateId: null });
        await drainWorkflow(recovered, cancelled.runId);
        expect(complete).toHaveBeenCalledTimes(2);
    });
});

it("fails closed after enqueue on revoked model, provider failure, invalid proposal or cancellation", async () => {
    await withRepository("story-agent-failures", async (repository) => {
        await repository.prisma.story.create({ data: { id: "story", kind: "document" } });
        await repository.prisma.storyRevision.create({ data: { id: "base", storyId: "story", title: "Original" } });
        await repository.prisma.story.update({ where: { id: "story" }, data: { currentRevisionId: "base" } });
        for (const mode of ["revoked", "provider", "invalid", "timeout", "cancel", "save-unknown"] as const) {
            const candidates = new PrismaStoryAgentCandidateRepository(repository.prisma);
            let allowed = true;
            let cancel = async () => {};
            let time = Date.now();
            const modelId = "configured-model-id";
            const model = {
                modelId: "synthetic-model", modelName: "Synthetic", providerId: "synthetic-provider", api: "openai-completions" as const,
                baseUrl: "https://synthetic.invalid/v1", contextWindow: 4096, maxOutputTokens: 256, secretRef: "opaque-ref",
                inputPricePerMillion: 1, outputPricePerMillion: 1,
            };
            const models = { resolve: async (id: string | null) => allowed && id === modelId ? model : null };
            const complete = vi.fn(async () => {
                if (mode === "provider") throw new Error("SYNTHETIC-PRIVATE-ERROR");
                if (mode === "cancel") await cancel();
                return { role: "assistant" as const, content: [{ type: "text" as const, text: mode === "invalid" ? "not-json" : JSON.stringify({
                    task: "story.summarize", title: "Suggested", summary: "Summary", keyFacts: [],
                }) }], api: "openai-completions" as const, provider: "synthetic-provider", model: "synthetic-model",
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: mode === "timeout" ? "aborted" as const : "stop" as const, timestamp: 0 };
            });
            const host = createWorkflowHost({ prisma: repository.prisma, blobs: repository.blobs, owner: `worker-${mode}`,
                now: () => new Date(time), leaseMs: 60_000,
                definitions: [application.createStoryAgentWorkflowDefinition()],
                actions: [createWorkerAgentInvocationV2Action({ models, secrets: {
                    read: async () => "synthetic-key", put: async () => { throw new Error("Unexpected write"); }, delete: async () => false,
                }, client: { complete } }), application.createStoryAgentSaveAction({ saveGenerated: async (candidate, fence) => {
                    const record = await candidates.saveGenerated(candidate, fence);
                    if (mode === "save-unknown") throw new application.ActionExecutionError("dependency_unavailable", "Synthetic receipt lost", true);
                    return record;
                } })],
            });
            const control = new application.StoryAgentWorkflowControl({ store: host.store, candidates, systemConfig: activeModelConfig(modelId),
            failureCodes: new PrismaStoryAgentFailureCodeReader(repository.prisma),
                stories: { readStory: async () => ({ storyId: "story", storyRevisionId: "base", title: "Original", summary: "", entryRevisionIds: [] }) },
                content: new application.ContentQuery({ readContentSource: async () => { throw new Error("Unexpected body read"); } }),
            });
            const queued = await control.enqueue({ storyId: "story", task: "story.summarize", modelId, idempotencyKey: mode });
            if (mode === "revoked") allowed = false;
            cancel = async () => { await host.store.cancelWorkflowRun({ runId: queued.runId }); };
            for (let step = 0; step < 60; step += 1) {
                await host.runLane.pollOnce();
                await host.activityWorker.pollOnce();
                await host.completionDispatcher.pollOnce();
                const result = await control.read("story", queued.runId);
                if (["failed", "cancelled", "completed"].includes(result.status)) break;
                time += 2000;
            }
            const result = await control.read("story", queued.runId);
            expect(result).toMatchObject({ status: mode === "cancel" ? "cancelled" : "failed", candidateId: null,
                errorCode: mode === "timeout" ? "timeout" : mode === "invalid" ? "malformed_payload" : mode === "cancel" ? null : mode === "revoked" ? "authentication_required" : "generation_failed" });
            expect(result).not.toHaveProperty("cost");
            expect(await host.backend.loadRun(queued.runId)).toMatchObject({ status: result.status });
            expect(JSON.stringify(result)).not.toContain("SYNTHETIC-PRIVATE-ERROR");
            expect(complete).toHaveBeenCalledTimes(mode === "revoked" ? 0 : 1);
            if (mode === "timeout") {
                const failedJobs = await repository.prisma.job.findMany({ where: { workflowRunId: queued.runId, status: "failed_terminal" } });
                expect(failedJobs).toHaveLength(1);
                expect(failedJobs[0]).toMatchObject({ errorCode: "timeout", attempts: 1 });
            }
            expect(await repository.prisma.storyAgentCandidate.count()).toBe(mode === "save-unknown" ? 1 : 0);
            if (mode === "save-unknown") {
                const orphan = await candidates.get(`story-candidate-${queued.runId}`);
                expect(orphan).toHaveProperty("cost");
            }
            expect(await repository.prisma.storyRevision.count()).toBe(1);
        }
    });
});
