import type { ContentQueryRepository, ContentReadSource, ContentReadTarget } from "@cosmos/application";
import type { ContentRepresentation, PrismaClient } from "@prisma/client";

function parseStoredJson(value: string): unknown {
    try { return JSON.parse(value); } catch { return null; }
}

export function storedRepresentation(record: ContentRepresentation | null): unknown {
    return record === null ? null : {
        id: record.id, entryRevisionId: record.entryRevisionId,
        representationVersion: record.representationVersion, parserVersion: record.parserVersion,
        status: record.status, blocks: parseStoredJson(record.blocksJson), contentText: record.contentText,
        qualitySignals: parseStoredJson(record.qualitySignalsJson),
        supersedesRepresentationId: record.supersedesRepresentationId, createdAt: record.createdAt.toISOString(),
    };
}

// This adapter returns only the requested projection, never raw payload or Blob keys.
export class PrismaContentQueryRepository implements ContentQueryRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async readContentSource(target: ContentReadTarget): Promise<ContentReadSource | null> {
        return this.prisma.$transaction(async (tx) => {
            const revision = await tx.entryRevision.findUnique({
                where: { id: target.entryRevisionId },
                select: { entryId: true, id: true, contentText: true, currentRepresentationId: true, evidenceObservationId: true },
            });
            if (!revision) return null;
            const record = target.representationVersion !== undefined
                ? await tx.contentRepresentation.findUnique({ where: { entryRevisionId_representationVersion: {
                    entryRevisionId: revision.id, representationVersion: target.representationVersion,
                } } })
                : revision.currentRepresentationId === null ? null
                    : await tx.contentRepresentation.findUnique({ where: { id: revision.currentRepresentationId } });
            return {
                entryId: revision.entryId,
                entryRevisionId: revision.id,
                contentText: revision.contentText,
                currentRepresentationId: revision.currentRepresentationId,
                evidenceStatus: revision.evidenceObservationId === null ? "representation-unavailable" : "available",
                representation: storedRepresentation(record),
            };
        });
    }
}
