import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContentQuery, StoryAgentWorkflowControl, createStoryAgentSaveAction, createStoryAgentWorkflowDefinition } from "@cosmos/application";
import { PrismaStoryAgentCandidateRepository } from "@cosmos/storage-prisma";
import { createWorkerAgentInvocationV2Action } from "../../apps/worker/src/agent-action-v2.js";
import { createWorkflowHost } from "../../apps/worker/src/workflow-host.js";
import { assertUsableCredential } from "../../.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.js";
import { prepareStoryIsolation } from "./story-agent-isolation.js";
import { acceptancePlan, configureStoryConnection, storySnapshot } from "./story-agent-plan.js";
import { GenerationDeadlineError, runStoryGeneration } from "./story-agent-generation.js";

export { acceptancePlan } from "./story-agent-plan.js";

export function createOfflineStoryTransport(outcome: "valid" | "invalid" | "network", requests: unknown[] = []): typeof fetch {
    return async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        if (outcome === "network") throw new Error("PRIVATE-SYNTHETIC-FAILURE");
        const text = outcome === "invalid" ? "not-json" : JSON.stringify({ task: "story.summarize",
            title: "Offline generated suggestion", summary: "An isolated synthetic reading event.", keyFacts: [] });
        const event = (delta: object, finishReason: string | null) => ({ id: "chatcmpl-task40", object: "chat.completion.chunk",
            created: 1_793_000_000, model: acceptancePlan.model, choices: [{ index: 0, delta, finish_reason: finishReason }] });
        return new Response([event({ role: "assistant", content: text }, null), event({}, "stop")]
            .map((value) => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } });
    };
}

export async function runStoryAcceptance(options: { credential: string; transport: typeof fetch; maxDurationMs?: number }) {
    const maxDurationMs = options.maxDurationMs ?? acceptancePlan.maxDurationMs;
    if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > acceptancePlan.maxDurationMs) throw new Error("Invalid generation deadline");
    assertUsableCredential(options.credential);
    const { root, repository, secretRefs } = await prepareStoryIsolation();
    const report = { status: "failed", stage: "configuration", transportSends: 0, pendingCount: 0, decision: "none",
        formalUnchanged: false, secretCleanup: "pending", disconnect: "pending" };
    try {
        await writeFile(join(root, "request-plan.json"), JSON.stringify(acceptancePlan, null, 2));
        const configured = await configureStoryConnection(repository, options.credential);
        await repository.prisma.story.create({ data: { id: storySnapshot.storyId, kind: "document" } });
        await repository.prisma.storyRevision.create({ data: { id: storySnapshot.storyRevisionId,
            storyId: storySnapshot.storyId, title: storySnapshot.title, summary: storySnapshot.summary } });
        await repository.prisma.story.update({ where: { id: storySnapshot.storyId }, data: { currentRevisionId: storySnapshot.storyRevisionId } });
        const candidates = new PrismaStoryAgentCandidateRepository(repository.prisma);
        const host = createWorkflowHost({ prisma: repository.prisma, blobs: repository.blobs, owner: "task40-acceptance",
            leaseMs: 120_000, definitions: [createStoryAgentWorkflowDefinition()],
            actions: [createWorkerAgentInvocationV2Action({ ...configured, secrets: repository.secrets }), createStoryAgentSaveAction(candidates)] });
        const control = new StoryAgentWorkflowControl({ store: host.store, connections: configured.connections,
            stories: { readStory: async () => storySnapshot }, content: new ContentQuery({ readContentSource: async () => { throw new Error("Unexpected source read"); } }) });
        const intent = { storyId: storySnapshot.storyId, connectionId: configured.connectionId, task: "story.summarize" as const, idempotencyKey: "task40-one-request" };
        const queued = await control.enqueue(intent);
        if ((await control.enqueue(intent)).runId !== queued.runId) throw new Error("Unexpected replay run");
        const readFormal = async () => ({
            story: await repository.prisma.story.findUniqueOrThrow({ where: { id: storySnapshot.storyId } }),
            revisions: await repository.prisma.storyRevision.findMany({ orderBy: { id: "asc" } }),
        });
        const before = JSON.stringify(await readFormal());
        report.stage = "generation";
        try {
            await runStoryGeneration({ host, control, runId: queued.runId, credential: options.credential,
                transport: options.transport, maxDurationMs, onSend: () => { report.transportSends++; } });
        } finally { report.formalUnchanged = before === JSON.stringify(await readFormal()); }
        const state = await control.read(storySnapshot.storyId, queued.runId);
        const records = await candidates.list(storySnapshot.storyId);
        report.pendingCount = records.filter((record) => record.status === "pending").length;
        report.formalUnchanged = before === JSON.stringify(await readFormal());
        if (state.status !== "completed" || report.pendingCount !== 1 || !report.formalUnchanged || report.transportSends !== 1) throw new Error("Generation did not satisfy acceptance");
        await candidates.decide({ candidateId: records[0].candidate.id, decision: "reject", actorId: "task40-acceptance-human" });
        report.decision = "rejected";
        report.formalUnchanged = report.formalUnchanged && before === JSON.stringify(await readFormal());
        if (!report.formalUnchanged) throw new Error("Formal content changed");
        report.status = "completed";
        report.stage = "verified";
    } catch (error) {
        report.status = "failed";
        if (error instanceof GenerationDeadlineError) report.stage = "generation_timeout";
    } finally {
        try {
            for (const ref of secretRefs) { await repository.secrets.delete(ref); if (await repository.secrets.read(ref) !== null) throw new Error("Secret cleanup incomplete"); }
            report.secretCleanup = "completed";
        } catch { report.secretCleanup = "failed"; report.status = "failed"; }
        try { await repository.close(); report.disconnect = "completed"; }
        catch { report.disconnect = "failed"; report.status = "failed"; }
        await writeFile(join(root, "result.json"), JSON.stringify(report, null, 2));
    }
    return { root, report };
}
