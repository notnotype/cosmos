import { dirname, basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { IngestionService, type IngestConnector } from "@cosmos/application";
import { contentBlockSchema } from "@cosmos/contracts";
import { PrismaCosmosRepository } from "@cosmos/storage-prisma";
import { databaseUrl, repositoryRoot, type IsolatedStackRoot } from "./helpers.js";

export const degradationSource = "Reading degradation seed";
export const degradationOrigin = "https://reading-degradation.e2e.invalid";

export async function seedReadingDegradation(stack: IsolatedStackRoot): Promise<void> {
    // Only the freshly created browser-stack root is eligible, never an environment-selected DB.
    const root = resolve(stack.root);
    if (dirname(root) !== resolve(repositoryRoot, ".agent/tmp") || !basename(root).startsWith("browser-stack-")
        || resolve(stack.dataRoot) !== resolve(root, "data")) {
        throw new Error("Reading degradation seed requires an isolated browser-stack root.");
    }
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(stack.dataRoot) } } });
    const repository = new PrismaCosmosRepository({ dataRoot: stack.dataRoot, prisma });
    try {
        await repository.initialize();
        if (await prisma.sourceInstance.count() !== 0 || await prisma.entry.count() !== 0) {
            throw new Error("Reading degradation seed requires a fresh empty database.");
        }
        const source = await repository.createSource({ name: degradationSource,
            sourceDefinitionRef: "source.fixture-rss@1", operationId: "fetch", config: {} });
        const enabled = await repository.updateCollectionPlan(source.planId, { enabled: true, baseRevisionId: source.planRevisionId });
        const connector: IngestConnector = {
            id: "reading-degradation-seed", description: "Isolated prelaunch reading fixture", configVersion: "v1",
            capabilities: ["test"], validate: () => undefined,
            async fetchItems() {
                return { items: ["Legacy HTML", "Corrupt representation", "Failed representation", "Missing assets"].map((title) => ({
                    externalId: title, title, summary: null, contentText: "Original synthetic content", kind: "article" as const,
                    webUrl: `${degradationOrigin}/${encodeURIComponent(title)}`, publisher: null, metrics: null,
                    publishedAt: null, updatedAt: null, sourceLocator: { provider: "fixture", item: title },
                    rawPayload: "SYNTHETIC-PRIVATE-EVIDENCE", assets: [],
                    contentSource: { format: "plain-text" as const, text: "Original synthetic content" },
                })), nextCursor: null };
            },
        };
        await new IngestionService(repository, () => connector).runSource(source.id);
        await repository.updateCollectionPlan(source.planId, { enabled: false, baseRevisionId: enabled.revisionId });
        await prisma.$transaction(async (tx) => {
            const revisions = await tx.entryRevision.findMany({ include: { currentRepresentation: true } });
            if (revisions.length !== 4) throw new Error("Expected four synthetic source revisions.");
            for (const revision of revisions) {
                const current = revision.currentRepresentation;
                if (!current) throw new Error("Expected a normalized seed representation.");
                if (revision.title === "Legacy HTML") {
                    await tx.entryRevision.update({ where: { id: revision.id }, data: { currentRepresentationId: null,
                        contentText: '<p>Legacy safe body</p><script>window.__legacyExecuted = true</script><img src="https://reading-degradation.e2e.invalid/tracker.svg" onerror="window.__legacyExecuted=true"><p>Legacy tail</p>' } });
                    await tx.contentRepresentation.deleteMany({ where: { entryRevisionId: revision.id } });
                } else if (revision.title === "Corrupt representation") {
                    await tx.entryRevision.update({ where: { id: revision.id }, data: { contentText: "DO-NOT-FALLBACK-TO-STALE-TEXT" } });
                    await tx.contentRepresentation.update({ where: { id: current.id }, data: { blocksJson: "broken JSON" } });
                } else if (revision.title === "Failed representation") {
                    await tx.contentRepresentation.update({ where: { id: current.id }, data: { status: "failed", contentText: "DO-NOT-RENDER-FAILED-BODY" } });
                } else {
                    const blocks = [
                        { id: "before", type: "paragraph", data: { inlines: [{ type: "text", text: "Before missing media" }] } },
                        { id: "missing-image", type: "image", data: { assetId: "absent-image", sourceUrl: `${degradationOrigin}/original-image.svg` } },
                        { id: "missing-audio", type: "audio", data: { assetId: "absent-audio" } },
                        { id: "missing-video", type: "video", data: { assetId: "absent-video", sourceUrl: `${degradationOrigin}/original-video.mp4` } },
                        { id: "after", type: "paragraph", data: { inlines: [{ type: "text", text: "After missing media" }] } },
                    ].map((block) => contentBlockSchema.parse(block));
                    await tx.contentRepresentation.update({ where: { id: current.id }, data: { blocksJson: JSON.stringify(blocks),
                        contentText: "Before missing media\nAfter missing media" } });
                }
            }
        });
    } finally {
        await repository.close();
    }
}
