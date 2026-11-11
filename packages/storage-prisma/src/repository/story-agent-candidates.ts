import { type Prisma, type PrismaClient } from "@prisma/client";
import {
    StoryAgentCandidateError,
    type StoryAgentCandidateRecord,
    type StoryAgentCandidateRepository,
    type StoryAgentCandidateStatus,
} from "@cosmos/application";
import { type StoryAgentCandidate, storyAgentCandidateSchema, storySuccessorSchema, storyTimeRangeSchema } from "@cosmos/contracts";
import { candidateSourceStatus } from "./story-agent-source-status.js";
import { writeEntryRelation } from "./entry-relation-command.js";
import { writeStoryRevision } from "./story-revision-command.js";
import { appendDomainEvent, assertWorkflowActionFence } from "./repository-internals.js";

function parseCandidate(value: string): StoryAgentCandidate {
    return storyAgentCandidateSchema.parse(JSON.parse(value));
}

function record(candidate: StoryAgentCandidate, status: StoryAgentCandidateStatus): StoryAgentCandidateRecord {
    return { candidate, status };
}

export class PrismaStoryAgentCandidateRepository implements StoryAgentCandidateRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async save(candidate: StoryAgentCandidate): Promise<StoryAgentCandidateRecord> {
        return this.persist(candidate);
    }

    async saveGenerated(candidate: StoryAgentCandidate, fence: import("@cosmos/application").HostActionExecutionFence): Promise<StoryAgentCandidateRecord> {
        return this.persist(candidate, fence);
    }

    async get(candidateId: string): Promise<StoryAgentCandidate | null> {
        const row = await this.prisma.storyAgentCandidate.findUnique({ where: { id: candidateId } });
        return row ? parseCandidate(row.candidateJson) : null;
    }

    private async persist(candidate: StoryAgentCandidate, fence?: import("@cosmos/application").HostActionExecutionFence): Promise<StoryAgentCandidateRecord> {
        const parsed = storyAgentCandidateSchema.parse(candidate);
        const row = await this.prisma.$transaction(async (tx) => {
            if (fence) {
                await assertWorkflowActionFence(tx, fence, fence.workflowRunId);
                if (parsed.id !== `story-candidate-${fence.workflowRunId}`) throw new StoryAgentCandidateError("conflict", "Story candidate Run identity mismatch");
                const existing = await tx.storyAgentCandidate.findUnique({ where: { id: parsed.id } });
                if (existing) {
                    if (JSON.stringify(parseCandidate(existing.candidateJson)) !== JSON.stringify(parsed)) throw new StoryAgentCandidateError("conflict", "Story candidate replay mismatch");
                    return existing;
                }
            }
            const revision = await tx.storyRevision.findUnique({ where: { id: parsed.storyRevisionId } });
            if (!revision || revision.storyId !== parsed.storyId) throw new StoryAgentCandidateError("conflict", "Story candidate revision mismatch");
            for (const binding of parsed.inputSources) {
                const representation = await tx.contentRepresentation.findUnique({
                    where: { entryRevisionId_representationVersion: binding },
                });
                if (!representation || representation.status === "failed") throw new StoryAgentCandidateError("conflict", "Story candidate source unavailable");
            }
            return tx.storyAgentCandidate.create({
                data: {
                    id: parsed.id,
                    storyId: parsed.storyId,
                    storyRevisionId: parsed.storyRevisionId,
                    candidateJson: JSON.stringify(parsed),
                    status: "pending",
                    createdAt: new Date(parsed.createdAt),
                },
            });
        });
        if (row.status !== "pending" && row.status !== "accepted" && row.status !== "rejected") throw new Error("Invalid Story candidate status");
        return record(parseCandidate(row.candidateJson), row.status);
    }

    async list(storyId: string): Promise<readonly StoryAgentCandidateRecord[]> {
        return this.prisma.$transaction(async (tx) => {
            const rows = await tx.storyAgentCandidate.findMany({
                where: { storyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
            });
            return Promise.all(rows.map(async (row) => {
                if (row.status !== "pending" && row.status !== "accepted" && row.status !== "rejected") throw new Error("Invalid Story candidate status");
                const candidate = parseCandidate(row.candidateJson);
                return { ...record(candidate, row.status), sourceStatus: await candidateSourceStatus(tx, candidate) };
            }));
        });
    }

    async decide(input: {
        candidateId: string;
        decision: "accept" | "reject";
        actorId: string;
    }): Promise<StoryAgentCandidateRecord> {
        return this.prisma.$transaction(async (tx) => {
            const row = await tx.storyAgentCandidate.findUnique({ where: { id: input.candidateId } });
            if (!row) throw new StoryAgentCandidateError("not_found", "Story candidate not found");
            if (row.status !== "pending") throw new StoryAgentCandidateError("conflict", "Story candidate decision conflict");
            const candidate = parseCandidate(row.candidateJson);

            if (input.decision === "accept") {
                const story = await tx.story.findUnique({ where: { id: candidate.storyId } });
                if (!story || story.currentRevisionId !== candidate.storyRevisionId) throw new StoryAgentCandidateError("conflict", "Story candidate input changed");
                if (await candidateSourceStatus(tx, candidate) !== "current") {
                    throw new StoryAgentCandidateError("conflict", "Story candidate sources changed or are unavailable");
                }
                await this.applyCandidate(tx, candidate, input.actorId);
            }

            const decidedAt = new Date();
            const updated = await tx.storyAgentCandidate.updateMany({
                where: { id: row.id, status: "pending" },
                data: { status: input.decision === "accept" ? "accepted" : "rejected", decidedAt, decidedBy: input.actorId },
            });
            if (updated.count !== 1) throw new StoryAgentCandidateError("conflict", "Story candidate decision conflict");
            await appendDomainEvent(tx, {
                type: "story.agent_candidate_decided.v1",
                aggregateType: "Story",
                aggregateId: candidate.storyId,
                payload: { candidateId: candidate.id, decision: input.decision, actorId: input.actorId },
            });
            return { ...record(candidate, input.decision === "accept" ? "accepted" : "rejected"), sourceStatus: await candidateSourceStatus(tx, candidate) };
        });
    }

    private async applyCandidate(tx: Prisma.TransactionClient, candidate: StoryAgentCandidate, actorId: string): Promise<void> {
        if (candidate.proposal.task === "story.summarize") {
            const story = await tx.story.findUnique({ where: { id: candidate.storyId }, select: { kind: true, subtype: true, currentRevision: { select: { timeRangeJson: true } } } });
            if (!story) throw new StoryAgentCandidateError("conflict", "Story candidate story not found");
            await writeStoryRevision(tx, {
                storyId: candidate.storyId,
                baseRevisionId: candidate.storyRevisionId,
                title: candidate.proposal.title,
                summary: candidate.proposal.summary,
                kind: storySuccessorSchema.shape.kind.parse(story.kind),
                subtype: story.subtype,
                // Summary proposals do not own the existing temporal annotation.
                timeRange: story.currentRevision?.timeRangeJson
                    ? storyTimeRangeSchema.parse(JSON.parse(story.currentRevision.timeRangeJson)) : null,
                keyFacts: candidate.proposal.keyFacts.map((fact) => ({ text: fact.text, entryId: fact.evidence[0]?.entryId ?? null })),
                actor: actorId,
                reason: `Accepted Story Agent candidate ${candidate.id}`,
            });
            return;
        }
        if (candidate.proposal.task === "story.extract-relations") {
            for (const relation of candidate.proposal.relations) {
                await writeEntryRelation(tx, {
                    fromEntryId: relation.sourceEntryId,
                    toEntryId: relation.targetEntryId,
                    relationType: relation.type,
                    producer: candidate.producer,
                    producerVersion: candidate.producerVersion,
                    evidence: JSON.stringify(relation.evidence),
                    actor: actorId,
                    reason: relation.reason,
                });
            }
            return;
        }
        throw new StoryAgentCandidateError("unsupported", "Story Agent quality review candidates are not formally writable");
    }
}
