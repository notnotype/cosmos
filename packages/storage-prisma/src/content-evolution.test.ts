import { expect, it } from "vitest";
import { ContentCommands, ContentQuery, IngestionService, StoryAgent, type ContentDraft, type IngestConnector } from "@cosmos/application";

import { createFixtureSource, withRepository } from "./index.fixtures.js";
import { PrismaContentQueryRepository } from "./repository/content-query.js";
import { PrismaContentSelectionRepository } from "./repository/content-commands.js";
import { selectContentRepresentation } from "./repository/representation-selection.js";
import { PrismaContentRebuildRepository } from "./repository/content-rebuild.js";
import { PrismaStoryAgentCandidateRepository } from "./repository/story-agent-candidates.js";

const authority = { allowedProfiles: ["summary-only", "structured-content"] as const };

function syntheticDraft(text: string): ContentDraft {
    return { parserVersion: "synthetic-parser@2", status: "complete", contentText: text, qualitySignals: {},
        blocks: [{ type: "paragraph", data: { inlines: [{ type: "text", text }] } }] };
}

async function withContent(body: (context: {
    repository: Parameters<Parameters<typeof withRepository>[1]>[0];
    prisma: Parameters<Parameters<typeof withRepository>[1]>[1];
    revisionId: string; entryId: string; storyId: string; query: ContentQuery;
    evolveSource: () => Promise<void>;
    commit: (draft: ContentDraft) => Promise<{ representationId: string; representationVersion: number; promoted: boolean }>;
}) => Promise<void>) {
    await withRepository("content-evolution", async (repository, prisma) => {
        const source = await createFixtureSource(repository, { name: "Evolution fixture", config: {} });
        let sourceText = "Original body";
        const connector: IngestConnector = {
            id: "evolution-fixture", description: "Isolated content evolution", configVersion: "v1",
            capabilities: ["test"], validate: () => undefined,
            async fetchItems() { return { items: [{ externalId: "one", title: "Original source", summary: null,
                contentText: sourceText, webUrl: null, kind: "article", publisher: null, metrics: null,
                publishedAt: null, updatedAt: null, sourceLocator: { provider: "fixture", item: "one" },
                rawPayload: "PRIVATE-SYNTHETIC-EVIDENCE", assets: [],
                contentSource: { format: "plain-text", text: sourceText } }], nextCursor: null }; },
        };
        await new IngestionService(repository, () => connector).runSource(source.id);
        const revision = await prisma.entryRevision.findFirstOrThrow({ include: { entry: true } });
        const store = new PrismaContentRebuildRepository(prisma, repository.blobs);
        const commit = async (draft: ContentDraft) => {
            const state = await store.readRebuildSource(revision.id);
            if (!state) throw new Error("Missing rebuild fixture");
            return store.commitRebuild({ entryRevisionId: revision.id, ...state, expectedCurrentId: state.currentRepresentationId,
                expectedLocked: state.locked, draft, actorId: "synthetic-parser-upgrade" });
        };
        await body({ repository, prisma, revisionId: revision.id, entryId: revision.entryId,
            evolveSource: async () => { sourceText = "New source revision body"; await new IngestionService(repository, () => connector).runSource(source.id); },
            storyId: revision.entry.storyId!, query: new ContentQuery(new PrismaContentQueryRepository(prisma)), commit });
    });
}

it("persists upgraded parser results without rewriting source truth or exact history", async () => {
    await withContent(async ({ prisma, query, revisionId, commit }) => {
        const facts = async () => ({ revisions: await prisma.entryRevision.findMany(), observations: await prisma.observation.findMany(),
            stories: await prisma.storyRevision.findMany() });
        const before = await facts();
        const original = await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 1 }, authority);
        const result = await commit({ ...syntheticDraft("Upgraded projection"), parserVersion: "synthetic-parser@2" });
        expect(result).toMatchObject({ representationVersion: 2, promoted: true });
        expect(await query.structuredContent({ entryRevisionId: revisionId }, authority)).toMatchObject({ contentText: "Upgraded projection",
            representation: { parserVersion: "synthetic-parser@2", supersedesRepresentationId: original!.representation!.id } });
        expect(await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 1 }, authority)).toEqual(original);
        const after = await facts();
        expect(after.observations).toEqual(before.observations);
        expect(after.stories).toEqual(before.stories);
        expect(after.revisions).toEqual(before.revisions.map((row) => ({ ...row, currentRepresentationId: result.representationId })));
    });
});

it("stores lower-quality history without promotion and obeys manual locks", async () => {
    await withContent(async ({ prisma, query, revisionId, commit }) => {
        const original = await query.structuredContent({ entryRevisionId: revisionId }, authority);
        for (const status of ["partial", "failed"] as const) {
            const result = await commit({ ...syntheticDraft(`Synthetic ${status}`), status, parserVersion: `synthetic-${status}@2` });
            expect(result.promoted).toBe(false);
            expect(await query.structuredContent({ entryRevisionId: revisionId, representationVersion: result.representationVersion }, authority))
                .toMatchObject({ representation: { status }, contentText: `Synthetic ${status}` });
            expect(await query.structuredContent({ entryRevisionId: revisionId }, authority)).toEqual(original);
        }
        const promoted = await commit({ ...syntheticDraft("Recommended complete"), parserVersion: "synthetic-parser@3" });
        expect(promoted).toMatchObject({ promoted: true, representationVersion: 4 });
        const automatic = { entryRevisionId: revisionId, representationId: original!.representation!.id,
            expectedCurrentId: promoted.representationId, mode: "automatic" as const, systemRecommended: false, actorId: "system" };
        expect(await prisma.$transaction((tx) => selectContentRepresentation(tx, automatic))).toBe(false);
        const commands = new ContentCommands(new PrismaContentSelectionRepository(prisma));
        const human = { actorId: "synthetic-human", canManageRepresentations: true };
        const partial = await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 2 }, authority);
        await commands.select({ entryRevisionId: revisionId, expectedCurrentId: promoted.representationId, expectedLocked: false,
            operation: "rollback", representationId: partial!.representation!.id }, human);
        expect(await prisma.$transaction((tx) => selectContentRepresentation(tx, { ...automatic,
            representationId: promoted.representationId, expectedCurrentId: partial!.representation!.id }))).toBe(false);
        await commands.select({ entryRevisionId: revisionId, expectedCurrentId: partial!.representation!.id, expectedLocked: true, operation: "unlock" }, human);
        expect(await prisma.$transaction((tx) => selectContentRepresentation(tx, { ...automatic,
            representationId: promoted.representationId, expectedCurrentId: partial!.representation!.id }))).toBe(true);
        await commands.select({ entryRevisionId: revisionId, expectedCurrentId: promoted.representationId, expectedLocked: false, operation: "lock" }, human);
        expect(await commit({ ...syntheticDraft("Locked out"), parserVersion: "synthetic-parser@4" }))
            .toMatchObject({ promoted: false, representationVersion: 5 });
        expect(await query.structuredContent({ entryRevisionId: revisionId }, authority)).toMatchObject({ representation: { id: promoted.representationId } });
        expect(await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 1 }, authority)).toEqual(original);
    });
});

it("retains exact Agent evidence and rejects acceptance after its representation is superseded", async () => {
    await withContent(async ({ repository, prisma, query, revisionId, entryId, storyId, commit, evolveSource }) => {
        const view = await query.structuredContent({ entryRevisionId: revisionId }, authority);
        const evidence = { entryId, entryRevisionId: revisionId, representationVersion: 1, blockId: view!.representation!.blocks[0]!.id };
        const agent = new StoryAgent({ readStory: async () => {
            const detail = await repository.story(storyId);
            return { storyId, storyRevisionId: detail!.story.revisionId!, title: detail!.story.title,
                summary: detail!.story.summary ?? "", entryRevisionIds: [revisionId] };
        } }, query, { invoke: async () => ({ provider: "synthetic", model: "fixture", finishReason: "stop", toolCalls: [], metadata: {},
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, content: JSON.stringify({ task: "story.summarize", title: "Old evidence suggestion",
                summary: "Synthetic derived summary", keyFacts: [{ text: "Old fact", evidence: [evidence] }] }) }) });
        const candidate = await agent.propose({ storyId, task: "story.summarize", sources: [{ entryRevisionId: revisionId, representationVersion: 1 }] },
            { authority, modelId: "synthetic-model", budget: { maxDurationMs: 1000, maxToolCalls: 0, maxOutputTokens: 100 },
                createCandidateId: () => "old-evidence", now: () => new Date("2026-10-26T00:00:00.000Z") },
            { idempotencyKey: "old-evidence", signal: new AbortController().signal });
        const candidates = new PrismaStoryAgentCandidateRepository(prisma);
        await candidates.save(candidate);
        expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "current" }]);
        await candidates.save({ ...candidate, id: "source-evolution" });
        const frozen = await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
        await commit({ ...syntheticDraft("Updated interpretation"), parserVersion: "synthetic-parser@2" });
        expect(await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toEqual(frozen);
        expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "superseded" }, { sourceStatus: "superseded" }]);
        expect((await candidates.list(storyId))[0]!.candidate.inputSources).toEqual(candidate.inputSources);
        expect(await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 1 }, authority)).toEqual(view);
        const count = await prisma.storyRevision.count();
        const decisions = () => prisma.domainEvent.count({ where: { type: "story.agent_candidate_decided.v1" } });
        const decisionCount = await decisions();
        await expect(candidates.decide({ candidateId: candidate.id, decision: "accept", actorId: "synthetic-human" }))
            .rejects.toMatchObject({ code: "conflict" });
        expect(await prisma.storyRevision.count()).toBe(count);
        expect(await decisions()).toBe(decisionCount);
        expect(await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toEqual(frozen);
        expect(await candidates.decide({ candidateId: candidate.id, decision: "reject", actorId: "synthetic-human" }))
            .toMatchObject({ status: "rejected", sourceStatus: "superseded", candidate });

        const stored = await prisma.contentRepresentation.findUniqueOrThrow({ where: { id: view!.representation!.id } });
        for (const invalid of [{ blocksJson: "{" }, { status: "failed" }]) {
            await prisma.contentRepresentation.update({ where: { id: stored.id }, data: invalid });
            expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "unavailable" }, { sourceStatus: "unavailable" }]);
            await expect(candidates.decide({ candidateId: "source-evolution", decision: "accept", actorId: "synthetic-human" }))
                .rejects.toMatchObject({ code: "conflict" });
            await prisma.contentRepresentation.update({ where: { id: stored.id }, data: { blocksJson: stored.blocksJson, status: stored.status } });
        }
        const current = await query.structuredContent({ entryRevisionId: revisionId }, authority);
        await new ContentCommands(new PrismaContentSelectionRepository(prisma)).select({ entryRevisionId: revisionId,
            expectedCurrentId: current!.representation!.id, expectedLocked: false, operation: "rollback", representationId: view!.representation!.id },
            { actorId: "synthetic-human", canManageRepresentations: true });
        expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "current" }, { sourceStatus: "current" }]);
        const sourceCandidate = await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: "source-evolution" } });
        await evolveSource();
        expect(await prisma.entryRevision.count()).toBe(2);
        expect(await query.structuredContent({ entryRevisionId: revisionId, representationVersion: 1 }, authority)).toEqual(view);
        expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "superseded" }, { sourceStatus: "superseded" }]);
        await expect(candidates.decide({ candidateId: "source-evolution", decision: "accept", actorId: "synthetic-human" }))
            .rejects.toMatchObject({ code: "conflict" });
        await prisma.entryRevision.update({ where: { id: revisionId }, data: { evidenceObservationId: null } });
        expect(await candidates.list(storyId)).toMatchObject([{ sourceStatus: "unavailable" }, { sourceStatus: "unavailable" }]);
        expect(await prisma.storyAgentCandidate.findUniqueOrThrow({ where: { id: "source-evolution" } })).toEqual(sourceCandidate);
        expect(await candidates.decide({ candidateId: "source-evolution", decision: "reject", actorId: "synthetic-human" }))
            .toMatchObject({ status: "rejected", sourceStatus: "unavailable" });
    });
});
