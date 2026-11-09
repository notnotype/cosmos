import { z } from "zod";
import { storyAgentCandidateRecordSchema, storyAgentGenerationRequestSchema,
    storyAgentGenerationSchema, type StoryAgentCandidateRecordContract, type StoryAgentGenerationRequest, type StoryDetail } from "@cosmos/contracts";

const storeSchema = z.object({ records: storyAgentCandidateRecordSchema.array(), jobs: z.object({
    key: z.string(), generation: storyAgentGenerationSchema,
}).array() });
const storageKey = "cosmos.lab.story-agent.jobs.v1";
function readStore() {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? storeSchema.parse(JSON.parse(raw)) : { records: [], jobs: [] };
}
function writeStore(value: z.infer<typeof storeSchema>) { sessionStorage.setItem(storageKey, JSON.stringify(value)); }
function candidate(story: StoryDetail, id: string): StoryAgentCandidateRecordContract {
    return { status: "pending", candidate: {
        id, storyId: story.story.id, storyRevisionId: story.story.revisionId,
        producer: "agent", producerVersion: "lab@1", provider: "fixture", model: "fixture",
        inputSources: [], confidence: null, createdAt: "2026-10-08T12:00:00.000Z",
        proposal: { task: "story.summarize", title: "建议标题", summary: "建议摘要 <script>不会执行</script>", keyFacts: [] },
    } };
}
export function createAgentCandidateFixtureApi(story: StoryDetail,
    behavior: { loseResponse: boolean; hold: boolean; fail: boolean; saveThenFail: boolean; sourceStatus: "current" | "superseded" | "unavailable" }, onCount: (count: number) => void) {
    return {
        async storyAgentCandidates() { return readStore().records; },
        async revisionContent(revisionId: string) {
            return { entryId: "lab-entry", entryRevisionId: revisionId, representation: null, contentText: "", readingMode: "unavailable" as const, evidenceStatus: "available" as const };
        },
        async proposeStoryAgentCandidate(storyId: string, raw: StoryAgentGenerationRequest, key: string) {
            const request = storyAgentGenerationRequestSchema.parse(raw);
            const data = readStore();
            const existing = data.jobs.find((item) => item.key === key);
            if (existing) { onCount(data.jobs.length); return existing.generation; }
            const generation = storyAgentGenerationSchema.parse({ runId: `lab-run-${data.jobs.length}`, storyId,
                task: request.task, status: "queued", candidateId: null, errorCode: null });
            data.jobs.push({ key, generation });
            writeStore(data);
            onCount(data.jobs.length);
            if (behavior.loseResponse) throw new Error("Synthetic lost response");
            return generation;
        },
        async storyAgentGeneration(_storyId: string, runId: string) {
            const data = readStore();
            const job = data.jobs.find((item) => item.generation.runId === runId);
            if (!job) throw new Error("Synthetic missing job");
            if (job.generation.status !== "completed" && job.generation.status !== "failed") {
                job.generation.status = behavior.hold ? "running" : behavior.fail || behavior.saveThenFail ? "failed" : "completed";
                job.generation.errorCode = job.generation.status === "failed" ? "generation_failed" : null;
                if (job.generation.status === "completed" || behavior.saveThenFail) {
                    const candidateId = `candidate-${runId}`;
                    if (job.generation.status === "completed") job.generation.candidateId = candidateId;
                    const record = candidate(story, candidateId);
                    record.sourceStatus = behavior.sourceStatus;
                    if (behavior.sourceStatus !== "current") record.candidate.inputSources = [{ entryRevisionId: "lab-old-source", representationVersion: 1 }];
                    data.records.unshift(record);
                }
                writeStore(data);
            }
            onCount(data.jobs.length);
            return job.generation;
        },
        async decideStoryAgentCandidate(id: string, decision: "accept" | "reject") {
            const data = readStore();
            const record = data.records.find((item) => item.candidate.id === id);
            if (!record || record.status !== "pending") throw new Error("Synthetic candidate already decided");
            record.status = decision === "accept" ? "accepted" : "rejected";
            writeStore(data);
            return record;
        },
    };
}
