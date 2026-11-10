import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContentQuery, StoryAgentWorkflowControl, createStoryAgentSaveAction, createStoryAgentWorkflowDefinition } from "@cosmos/application";
import { PrismaContentQueryRepository, PrismaStoryAgentCandidateRepository } from "@cosmos/storage-prisma";
import { storyAgentGenerationSchema, storyAgentCandidateRecordSchema, storyDetailSchema } from "@cosmos/contracts";
import { createWorkerAgentInvocationV2Action } from "../../apps/worker/src/agent-action-v2.js";
import { createWorkflowHost } from "../../apps/worker/src/workflow-host.js";
import { assertUsableCredential } from "../../.agents/tasks/39-pi-ai-adapter/connection-smoke-harness.js";
import { prepareStoryIsolation, repositoryRoot, snapshotCommit } from "./story-agent-isolation.js";
import { configureStoryConnection } from "./story-agent-plan.js";
import { runStoryGeneration, GenerationDeadlineError } from "./story-agent-generation.js";
import { bodyAcceptancePlan, bodyBindings, bodyStory } from "./story-body-plan.js";
import { seedBodyStory } from "./story-body-seed.js";
import { startBodyApi } from "./story-body-api.js";
import { classifyBodyGenerationFailure } from "./story-body-diagnostics.js";

export async function runBodyStoryAcceptance(options: { credential: string; transport: typeof fetch; maxDurationMs?: number; signal?: AbortSignal }) {
    const maxDurationMs = options.maxDurationMs ?? 60_000;
    if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 60_000) throw new Error("Invalid generation deadline");
    assertUsableCredential(options.credential);
    const plan = await bodyAcceptancePlan();
    const { root, repository, secretRefs } = await prepareStoryIsolation();
    const report = { status: "failed", stage: "configuration", failureCode: "none", transportSends: 0, pendingCount: 0,
        formalUnchanged: false, bodyEvidenceRefs: 0, manualPersistenceVerified: false, secretCleanup: "pending", decision: "none", apiQueue: false, disconnect: "pending" };
    let api: Awaited<ReturnType<typeof startBodyApi>> | undefined;
    const writeReport = () => writeFile(join(root, "result.json"), JSON.stringify(report, null, 2));
    const cleanSecrets = async () => {
        for (const ref of secretRefs) {
            await repository.secrets.delete(ref);
            if (await repository.secrets.read(ref) !== null) throw new Error("Secret cleanup incomplete");
        }
        report.secretCleanup = "completed";
    };
    let closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
        try { await api?.stop(); } finally {
            try { await cleanSecrets(); } catch { report.secretCleanup = "failed"; report.status = "failed"; }
            try { await repository.close(); report.disconnect = "completed"; }
            catch { report.disconnect = "failed"; report.status = "failed"; }
            await writeReport();
        }
    })();
    try {
        options.signal?.throwIfAborted();
        await writeFile(join(root, "request-plan.json"), JSON.stringify({ ...plan, schemaCommit: snapshotCommit,
            codeCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim() }, null, 2));
        const configured = await configureStoryConnection(repository, options.credential);
        await seedBodyStory(repository);
        const candidates = new PrismaStoryAgentCandidateRepository(repository.prisma);
        const host = createWorkflowHost({ prisma: repository.prisma, blobs: repository.blobs, owner: "task40-body-acceptance",
            leaseMs: 120_000, definitions: [createStoryAgentWorkflowDefinition()], actions: [
                createWorkerAgentInvocationV2Action({ ...configured, secrets: repository.secrets }), createStoryAgentSaveAction(candidates)] });
        const control = new StoryAgentWorkflowControl({ store: host.store,
            stories: { readStory: async () => bodyStory }, content: new ContentQuery(new PrismaContentQueryRepository(repository.prisma)) });
        api = await startBodyApi(root);
        const endpoint = `${api.origin}/api/v1/stories/${bodyStory.storyId}`;
        const readDetail = async () => storyDetailSchema.parse(await (await fetch(endpoint)).json());
        const readFormal = async () => JSON.stringify({
            story: await repository.prisma.story.findUniqueOrThrow({ where: { id: bodyStory.storyId } }),
            revisions: await repository.prisma.storyRevision.findMany({ orderBy: { id: "asc" } }),
        });
        const before = await readFormal();
        const beforeRevision = (await readDetail()).story.revisionId;
        const response = await fetch(`${endpoint}/agent-candidates`, { method: "POST", headers: {
            "content-type": "application/json", origin: api.origin, "idempotency-key": "task40-body-single-request" },
            body: JSON.stringify({ task: "story.summarize", modelId: configured.modelId, sources: bodyBindings }) });
        if (response.status !== 202) throw new Error("API did not queue request");
        const queued = storyAgentGenerationSchema.parse(await response.json());
        report.apiQueue = true;
        report.stage = "generation";
        const unchanged = async () => await readFormal() === before;
        try {
            await runStoryGeneration({ host, control, runId: queued.runId, credential: options.credential,
                transport: options.transport, maxDurationMs, signal: options.signal, approved: { storyId: bodyStory.storyId, messages: plan.messages },
                onSend: () => { report.transportSends++; } });
        } finally { report.formalUnchanged = await unchanged(); }
        const records = storyAgentCandidateRecordSchema.array().parse(await (await fetch(`${endpoint}/agent-candidates`)).json());
        report.pendingCount = records.filter((record) => record.status === "pending").length;
        const proposal = records[0]?.candidate.proposal;
        if (proposal?.task === "story.summarize") report.bodyEvidenceRefs = proposal.keyFacts.flatMap((fact) => fact.evidence).filter((ref) =>
            ref.entryRevisionId === bodyBindings[0]!.entryRevisionId && ref.representationVersion === 1 && ref.blockId === "block-1").length;
        const state = await control.read(bodyStory.storyId, queued.runId);
        if (state.status !== "completed" || report.pendingCount !== 1 || !report.formalUnchanged || report.transportSends !== 1) {
            report.failureCode = await classifyBodyGenerationFailure(repository.prisma, queued.runId);
            throw new Error("Generation acceptance failed");
        }
        await cleanSecrets();
        report.status = "awaiting_manual_decision";
        report.stage = "web_review";
        await writeReport();
        const recordDecision = async () => {
            const current = storyAgentCandidateRecordSchema.array().parse(await (await fetch(`${endpoint}/agent-candidates`)).json());
            const record = current.find((record) => record.candidate.id === records[0]!.candidate.id);
            const decision = record?.status;
            if (decision !== "accepted" && decision !== "rejected") throw new Error("No manual decision yet");
            const detail = await readDetail();
            const proposal = record!.candidate.proposal;
            if (decision === "rejected" ? !await unchanged() : proposal.task !== "story.summarize"
                || detail.story.revisionId === beforeRevision || detail.story.title !== proposal.title || detail.story.summary !== proposal.summary
                || JSON.stringify(detail.story.keyFacts) !== JSON.stringify(proposal.keyFacts.map((fact) => ({ text: fact.text, entryId: fact.evidence[0]?.entryId ?? null })))) {
                throw new Error("Manual decision persistence check failed");
            }
            report.decision = decision;
            report.manualPersistenceVerified = true;
            report.status = "decision_recorded";
            await writeReport();
        };
        return { root, report, api, close, recordDecision, storyId: bodyStory.storyId };
    } catch (error) {
        report.stage = options.signal?.aborted ? "generation_cancelled" : error instanceof GenerationDeadlineError ? "generation_timeout" : report.stage;
        if (report.failureCode === "none") report.failureCode = options.signal?.aborted ? "generation_cancelled"
            : error instanceof GenerationDeadlineError ? "generation_timeout" : "acceptance_failed";
        await close();
        return { root, report, api: undefined, close: async () => undefined, recordDecision: async () => { throw new Error("Failed session"); }, storyId: bodyStory.storyId };
    }
}
