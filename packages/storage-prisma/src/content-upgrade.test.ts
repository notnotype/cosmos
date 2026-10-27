import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContentQuery } from "@cosmos/application";
import { expect, it } from "vitest";

import { captureLegacyFacts, firstContentMigration, withContentUpgrade } from "./content-upgrade.fixtures.js";
import { PrismaCosmosRepository } from "./index.js";
import { PrismaContentQueryRepository } from "./repository/content-query.js";

it("upgrades pre-Task40 content without backfill, preserving source facts, pointers and legacy reads", async () => {
    await withContentUpgrade(async ({ root, client, upgrade }) => {
        const before = await captureLegacyFacts(client);
        const ledger = await client.$queryRaw<Array<{ migration_name: string; checksum: string }>>`
            SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name`;
        expect(ledger.at(-1)?.migration_name).toBe("20260924100000_story_revision_producer");
        expect(await client.$queryRaw`SELECT name FROM sqlite_master WHERE name IN ('ContentRepresentation', 'StoryAgentCandidate')`).toEqual([]);
        const revisionColumns = await client.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("EntryRevision")`;
        expect(revisionColumns.map(({ name }) => name)).not.toContain("currentRepresentationId");
        const observationColumns = await client.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("Observation")`;
        expect(observationColumns.map(({ name }) => name)).not.toContain("contentSourceBlobKey");
        const blobRoot = join(root, "blobs");
        await mkdir(blobRoot);
        await writeFile(join(blobRoot, "legacy-payload"), "SYNTHETIC-PRIVATE-RAW");
        await writeFile(join(blobRoot, "legacy-media"), new Uint8Array([1, 2, 3]));

        await upgrade();
        const assertUnchanged = async () => {
            for (const fact of before) expect(await client.$queryRawUnsafe(fact.query), fact.table).toEqual(fact.rows);
            expect(await client.contentRepresentation.count()).toBe(0);
            expect(await client.storyAgentCandidate.count()).toBe(0);
            expect(await client.entryRevision.findMany({ orderBy: { id: "asc" }, select: {
                id: true, evidenceObservationId: true, currentRepresentationId: true, representationLocked: true,
            } })).toEqual(["entry-r1", "entry-r2"].map((id) => ({
                id, evidenceObservationId: null, currentRepresentationId: null, representationLocked: false,
            })));
            expect(await client.observation.findMany({ orderBy: { id: "asc" }, select: { id: true, contentSourceBlobKey: true } }))
                .toEqual(["observation-1", "observation-2"].map((id) => ({ id, contentSourceBlobKey: null })));
            expect(await client.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
            expect(await readFile(join(blobRoot, "legacy-payload"), "utf8")).toBe("SYNTHETIC-PRIVATE-RAW");
            expect(await readFile(join(blobRoot, "legacy-media"))).toEqual(Buffer.from([1, 2, 3]));
        };
        await assertUnchanged();
        const applied = await client.$queryRaw<Array<{ migration_name: string; checksum: string }>>`
            SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
        expect(applied.slice(0, ledger.length)).toEqual(ledger);
        expect(applied.map((row) => row.migration_name)).toEqual(expect.arrayContaining([
            firstContentMigration, "20261008130000_story_agent_candidate", "20261008140000_observation_content_source",
        ]));
        const query = new ContentQuery(new PrismaContentQueryRepository(client));
        const authority = { allowedProfiles: ["structured-content"] as const };
        for (const [id, text] of [["entry-r1", "Original legacy body"], ["entry-r2", "Legacy body"]] as const) {
            expect(await query.structuredContent({ entryRevisionId: id }, authority)).toEqual({
                entryId: "entry-old", entryRevisionId: id, contentText: text, representation: null,
                readingMode: "legacy-text", evidenceStatus: "representation-unavailable",
            });
            expect(await query.structuredContent({ entryRevisionId: id, representationVersion: 1 }, authority))
                .toMatchObject({ representation: null, contentText: "", readingMode: "unavailable" });
        }
        const repository = new PrismaCosmosRepository({ dataRoot: root, prisma: client });
        const entry = await repository.entry("entry-old");
        expect(entry).toMatchObject({ id: "entry-old", currentRevisionId: "entry-r2" });
        expect(entry?.revisions.map(({ id }) => id)).toEqual(["entry-r2", "entry-r1"]);
        expect(entry?.revisions[0]?.assets).toMatchObject([{ id: "asset-old", status: "downloaded" }]);
        expect(await repository.story("story-old")).toMatchObject({ story: {
            id: "story-old", revisionId: "story-r2", title: "Human title", summary: "Human summary", producer: "human",
            keyFacts: [{ text: "Human fact", entryId: "entry-old" }],
        } });
        await assertUnchanged();
        await upgrade();
        expect(await client.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`).toEqual(applied);
        await assertUnchanged();
    });
});

it("installs content version, pointer, evidence and candidate constraints on an upgraded legacy database", async () => {
    await withContentUpgrade(async ({ client, upgrade }) => {
        await upgrade();
        const indexes = await client.$queryRaw<Array<{ name: string; sql: string }>>`
            SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN (
                'EntryRevision_currentRepresentationId_key',
                'ContentRepresentation_entryRevisionId_representationVersion_key',
                'ContentRepresentation_entryRevisionId_createdAt_idx',
                'StoryAgentCandidate_storyId_createdAt_idx', 'StoryAgentCandidate_status_createdAt_idx') ORDER BY name`;
        expect(indexes.map(({ name }) => name)).toEqual([
            "ContentRepresentation_entryRevisionId_createdAt_idx", "ContentRepresentation_entryRevisionId_representationVersion_key",
            "EntryRevision_currentRepresentationId_key", "StoryAgentCandidate_status_createdAt_idx", "StoryAgentCandidate_storyId_createdAt_idx",
        ]);
        const data = { id: "representation-new", entryRevisionId: "entry-r1", representationVersion: 1,
            parserVersion: "fixture@1", status: "complete", blocksJson: "[]", contentText: "Explicit new projection", qualitySignalsJson: "{}" };
        await client.contentRepresentation.create({ data });
        await expect(client.contentRepresentation.create({ data: { ...data, id: "duplicate-version" } })).rejects.toThrow(/Unique constraint/);
        await expect(client.contentRepresentation.create({ data: { ...data, id: "missing-revision", entryRevisionId: "missing" } })).rejects.toThrow(/Foreign key constraint/);
        await client.entryRevision.update({ where: { id: "entry-r1" }, data: { currentRepresentationId: data.id } });
        await expect(client.entryRevision.update({ where: { id: "entry-r2" }, data: { currentRepresentationId: data.id } })).rejects.toThrow(/Unique constraint/);
        await expect(client.entryRevision.update({ where: { id: "entry-r2" }, data: { currentRepresentationId: "missing" } })).rejects.toThrow(/Foreign key constraint/);
        await expect(client.entryRevision.update({ where: { id: "entry-r1" }, data: { evidenceObservationId: "missing" } })).rejects.toThrow(/Foreign key constraint/);
        await client.storyAgentCandidate.create({ data: { id: "new-candidate", storyId: "story-old", storyRevisionId: "story-r2", candidateJson: "{}" } });
        expect(await client.storyAgentCandidate.findUnique({ where: { id: "new-candidate" } })).toMatchObject({ status: "pending" });
        await expect(client.storyAgentCandidate.create({ data: { id: "missing-story", storyId: "missing", storyRevisionId: "story-r2", candidateJson: "{}" } })).rejects.toThrow(/Foreign key constraint/);
        await client.entryRevision.update({ where: { id: "entry-r1" }, data: { evidenceObservationId: "observation-1" } });
        await client.observation.delete({ where: { id: "observation-1" } });
        expect(await client.entryRevision.findUnique({ where: { id: "entry-r1" } })).toMatchObject({ evidenceObservationId: null });
        await client.contentRepresentation.delete({ where: { id: data.id } });
        expect(await client.entryRevision.findUnique({ where: { id: "entry-r1" } })).toMatchObject({ currentRepresentationId: null });
    });
});
