import type { PrismaCosmosRepository } from "@cosmos/storage-prisma";
import { bodyRepresentation as representation, bodySource, bodyStory, sourceText } from "./story-body-plan.js";

export async function seedBodyStory(repository: PrismaCosmosRepository): Promise<void> {
    const source = await repository.createSource({ name: "Task40 synthetic body", sourceDefinitionRef: "source.fixture-rss@1", operationId: "fetch", config: { url: "https://example.invalid/synthetic" } });
    const prisma = repository.prisma;
    await prisma.story.create({ data: { id: bodyStory.storyId, kind: "document" } });
    await prisma.storyRevision.create({ data: { id: bodyStory.storyRevisionId, storyId: bodyStory.storyId,
        title: bodyStory.title, summary: bodyStory.summary } });
    await prisma.story.update({ where: { id: bodyStory.storyId }, data: { currentRevisionId: bodyStory.storyRevisionId } });
    await prisma.entry.create({ data: { id: bodySource.entryId, sourceInstanceId: source.id,
        canonicalExternalId: "synthetic-body", storyId: bodyStory.storyId } });
    const observation = await prisma.observation.create({ data: { sourceInstanceId: source.id, entryId: bodySource.entryId,
        externalKey: "synthetic-body", sourceLocatorJson: JSON.stringify({ provider: "synthetic" }), contentText: sourceText } });
    await prisma.entryRevision.create({ data: { id: representation.entryRevisionId, entryId: bodySource.entryId, revision: 1,
        title: bodyStory.title, summary: bodyStory.summary, contentText: representation.contentText,
        contentFingerprint: "task40-synthetic-only", evidenceObservationId: observation.id } });
    await prisma.contentRepresentation.create({ data: { id: representation.id, entryRevisionId: representation.entryRevisionId,
        representationVersion: representation.representationVersion, parserVersion: representation.parserVersion,
        status: representation.status, blocksJson: JSON.stringify(representation.blocks), contentText: representation.contentText,
        qualitySignalsJson: JSON.stringify(representation.qualitySignals), createdAt: new Date(representation.createdAt) } });
    await prisma.entryRevision.update({ where: { id: representation.entryRevisionId }, data: { currentRepresentationId: representation.id } });
    await prisma.entry.update({ where: { id: bodySource.entryId }, data: { currentRevisionId: representation.entryRevisionId } });
}
