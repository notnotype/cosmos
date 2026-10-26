import type { Prisma } from "@prisma/client";
import { contentRepresentationSchema, type StoryAgentCandidate, type StoryAgentCandidateRecordContract } from "@cosmos/contracts";
import { storedRepresentation } from "./content-query.js";

type SourceStatus = NonNullable<StoryAgentCandidateRecordContract["sourceStatus"]>;

/** Freshness is a live projection; historical candidate JSON must remain immutable. */
export async function candidateSourceStatus(tx: Prisma.TransactionClient, candidate: StoryAgentCandidate): Promise<SourceStatus> {
    if (candidate.inputSources.length === 0) return "current";
    const revisions = await tx.entryRevision.findMany({
        where: { id: { in: candidate.inputSources.map((source) => source.entryRevisionId) } },
        select: { id: true, currentRepresentationId: true, evidenceObservationId: true, entry: { select: { currentRevisionId: true } } },
    });
    const representations = await tx.contentRepresentation.findMany({ where: { OR: candidate.inputSources } });
    let status: SourceStatus = "current";
    for (const source of candidate.inputSources) {
        const revision = revisions.find((row) => row.id === source.entryRevisionId);
        const row = representations.find((item) => item.entryRevisionId === source.entryRevisionId && item.representationVersion === source.representationVersion);
        const parsed = contentRepresentationSchema.safeParse(storedRepresentation(row ?? null));
        if (!revision?.evidenceObservationId || !parsed.success || parsed.data.status === "failed") return "unavailable";
        if (revision.entry.currentRevisionId !== revision.id || revision.currentRepresentationId !== parsed.data.id) status = "superseded";
    }
    return status;
}
