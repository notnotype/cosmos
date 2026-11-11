import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { StoryAgentCandidate } from "@cosmos/contracts";
import { createFixtureSource, withRepository } from "./index.fixtures.js";
import { PrismaStoryAgentCandidateRepository } from "./repository/story-agent-candidates.js";

it("saves without formal writes, accepts atomically, rejects repeats and stale inputs", async () => {
    await withRepository("story-agent-candidates", async (_repository, prisma) => {
        await prisma.story.create({ data: { id: "story", kind: "document" } });
        const timeRange = { start: { exact: "2026-09-14T09:30:00.000Z", exactPrecision: "second", fallback: null }, end: null };
        await prisma.storyRevision.create({ data: { id: "base", storyId: "story", title: "Original", timeRangeJson: JSON.stringify(timeRange) } });
        await prisma.story.update({ where: { id: "story" }, data: { currentRevisionId: "base" } });
        const port = new PrismaStoryAgentCandidateRepository(prisma);
        const candidate = (): StoryAgentCandidate => ({
            id: randomUUID(), storyId: "story", storyRevisionId: "base", producer: "agent",
            producerVersion: "story-agent@1", provider: "fake", model: "fixture", inputSources: [],
            confidence: null, createdAt: "2026-10-08T12:00:00.000Z",
            proposal: { task: "story.summarize", title: "Suggested", summary: "Summary", keyFacts: [] },
        });
        const accepted = candidate();
        const stale = candidate();
        const rejected = candidate();
        await port.save(accepted);
        expect(await port.get(accepted.id)).not.toHaveProperty("cost");
        const zeroCost = { ...candidate(), id: "zero-cost", cost: { input: 0, output: 0, total: 0, currency: "USD" } };
        await port.save(zeroCost);
        expect(await port.get(zeroCost.id)).toMatchObject({ cost: { input: 0, output: 0, total: 0, currency: "USD" } });
        await port.save(stale);
        await port.save(rejected);
        expect(await prisma.storyRevision.count()).toBe(1);
        expect(await prisma.domainEvent.count()).toBe(0);
        expect(await port.decide({ candidateId: rejected.id, decision: "reject", actorId: "human" }))
            .toMatchObject({ status: "rejected" });
        expect(await prisma.storyRevision.count()).toBe(1);
        expect(await port.decide({ candidateId: accepted.id, decision: "accept", actorId: "human" }))
            .toMatchObject({ status: "accepted" });
        const current = await prisma.story.findUniqueOrThrow({ where: { id: "story" }, include: { currentRevision: true } });
        expect(current.currentRevision).toMatchObject({ title: "Suggested", producer: "human" });
        expect(JSON.parse(current.currentRevision!.timeRangeJson!)).toEqual(timeRange);
        expect(await prisma.storyRevision.count()).toBe(2);
        await expect(port.decide({ candidateId: accepted.id, decision: "accept", actorId: "human" }))
            .rejects.toThrow("decision conflict");
        await expect(port.decide({ candidateId: stale.id, decision: "accept", actorId: "human" }))
            .rejects.toThrow("input changed");
        expect(await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: "pending" });
        expect(await prisma.domainEvent.count()).toBe(3);
        await expect(port.save({ ...candidate(), storyRevisionId: "missing" })).rejects.toThrow("revision mismatch");
    });
});

it("rolls back all relations and audit when a later relation fails", async () => {
    await withRepository("story-agent-atomic", async (repository, prisma) => {
        await prisma.story.create({ data: { id: "story", kind: "document" } });
        const timeRange = { start: { exact: "2026-09-14T09:30:00.000Z", exactPrecision: "second", fallback: null }, end: null };
        await prisma.storyRevision.create({ data: { id: "base", storyId: "story", title: "Original", timeRangeJson: JSON.stringify(timeRange) } });
        await prisma.story.update({ where: { id: "story" }, data: { currentRevisionId: "base" } });
        const source = await createFixtureSource(repository, { name: "Candidate relations", config: {} });
        for (const id of ["a", "b"]) await prisma.entry.create({ data: { id, sourceInstanceId: source.id, canonicalExternalId: id, storyId: "story" } });
        const port = new PrismaStoryAgentCandidateRepository(prisma);
        const candidate: StoryAgentCandidate = {
            id: "relations", storyId: "story", storyRevisionId: "base", producer: "agent",
            producerVersion: "story-agent@1", provider: "fake", model: "fixture", inputSources: [],
            confidence: null, createdAt: "2026-10-08T12:00:00.000Z",
            proposal: { task: "story.extract-relations", relations: [
                { sourceEntryId: "a", targetEntryId: "b", type: "near_duplicate_of", reason: "similar", evidence: [] },
                { sourceEntryId: "a", targetEntryId: "missing", type: "near_duplicate_of", reason: "invalid", evidence: [] },
            ] },
        };
        await port.save(candidate);
        const eventCount = await prisma.domainEvent.count();
        await expect(port.decide({ candidateId: candidate.id, decision: "accept", actorId: "human" })).rejects.toThrow();
        expect(await prisma.entryRelation.count()).toBe(0);
        expect(await prisma.domainEvent.count()).toBe(eventCount);
        expect(await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({ status: "pending" });
    });
});
