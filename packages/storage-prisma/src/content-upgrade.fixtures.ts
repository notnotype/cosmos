import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

import { deploySchema, sqliteUrl } from "./index.fixtures.js";

export const firstContentMigration = "20261008120000_content_representation";
const lastLegacyMigration = "20260924100000_story_revision_producer";
const factTables = ["SourceInstance", "Entry", "EntryRevision", "Observation", "Story", "StoryRevision", "Asset", "DomainEvent"] as const;

export async function captureLegacyFacts(client: PrismaClient) {
    return Promise.all(factTables.map(async (table) => {
        const columns = await client.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
        const query = `SELECT ${columns.map(({ name }) => `"${name}"`).join(", ")} FROM "${table}" ORDER BY 1`;
        return { table, query, rows: await client.$queryRawUnsafe(query) };
    }));
}

async function copyMigrationChain(target: string, names: string[]) {
    const source = resolve("packages/storage-prisma/prisma");
    await mkdir(join(target, "migrations"), { recursive: true });
    // migrate deploy uses migration SQL, not the current Client's model shape, to build the old database.
    await cp(join(source, "schema.prisma"), join(target, "schema.prisma"));
    await cp(join(source, "migrations/migration_lock.toml"), join(target, "migrations/migration_lock.toml"));
    for (const name of names) {
        await cp(join(source, "migrations", name), join(target, "migrations", name), { recursive: true });
    }
}

export async function withContentUpgrade(body: (fixture: {
    root: string;
    client: PrismaClient;
    upgrade: () => Promise<void>;
}) => Promise<void>) {
    const parent = resolve(".agent/tmp");
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, "task40-content-upgrade-"));
    const databasePath = join(root, "cosmos.sqlite");
    const client = new PrismaClient({ datasources: { db: { url: sqliteUrl(databasePath) } } });
    try {
        const entries = await readdir(resolve("packages/storage-prisma/prisma/migrations"), { withFileTypes: true });
        const migrations = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        const legacy = migrations.filter((name) => name < firstContentMigration);
        if (legacy.at(-1) !== lastLegacyMigration) throw new Error("Task40 legacy migration boundary changed; review the fixture");
        const legacyRoot = join(root, "legacy-prisma");
        const upgradeRoot = join(root, "upgrade-prisma");
        await copyMigrationChain(legacyRoot, legacy);
        await copyMigrationChain(upgradeRoot, migrations);
        deploySchema(databasePath, join(legacyRoot, "schema.prisma"));
        await seedLegacyContent(client);
        await body({ root, client, upgrade: async () => {
            await client.$disconnect();
            deploySchema(databasePath, join(upgradeRoot, "schema.prisma"));
        } });
    } finally {
        await client.$disconnect();
        // Only the mkdtemp result created by this invocation is eligible for recursive cleanup.
        if (dirname(root) !== parent || !basename(root).startsWith("task40-content-upgrade-")) {
            throw new Error("Refusing to clean a root outside this isolated upgrade fixture");
        }
        await rm(root, { recursive: true, force: true });
    }
}

async function seedLegacyContent(client: PrismaClient) {
    // Raw legacy columns prevent today's Prisma defaults from silently manufacturing Task40 data.
    const statements = [
        `INSERT INTO "SourceInstance" ("id", "name", "kind", "sourceDefinitionRef", "operationId", "configJson", "updatedAt")
         VALUES ('source-old', 'Legacy source', 'rss', 'source.rss@1', 'fetch', '{"feedUrl":"https://example.invalid/feed"}', '2026-09-25T00:00:00.000Z')`,
        `INSERT INTO "Story" ("id", "kind", "updatedAt") VALUES ('story-old', 'document', '2026-09-25T00:00:00.000Z')`,
        `INSERT INTO "Entry" ("id", "sourceInstanceId", "canonicalExternalId", "storyId", "metricsJson", "updatedAt")
         VALUES ('entry-old', 'source-old', 'external-old', 'story-old', '{"views":12}', '2026-09-25T00:00:00.000Z')`,
        `INSERT INTO "EntryRevision" ("id", "entryId", "revision", "title", "summary", "contentText", "contentFingerprint", "webUrl", "publisherJson", "createdAt") VALUES
         ('entry-r1', 'entry-old', 1, 'Original source', NULL, 'Original legacy body', 'source-fingerprint-1', 'https://example.invalid/old', '{"name":"Legacy publisher"}', '2026-09-24T00:00:00.000Z'),
         ('entry-r2', 'entry-old', 2, 'Revised source', 'Source summary', '<p>Legacy <strong>body</strong></p><script>hidden()</script>', 'source-fingerprint-2', 'https://example.invalid/new', '{"name":"Legacy publisher"}', '2026-09-25T00:00:00.000Z')`,
        `UPDATE "Entry" SET "currentRevisionId" = 'entry-r2' WHERE "id" = 'entry-old'`,
        `INSERT INTO "Observation" ("id", "sourceInstanceId", "entryId", "externalId", "externalKey", "externalRevision", "sourceLocatorJson", "payloadBlobKey", "contentText", "contentFingerprint", "capturedAt") VALUES
         ('observation-1', 'source-old', 'entry-old', 'external-old', 'external-old', '1', '{"provider":"fixture","id":"external-old"}', 'legacy-payload', 'Original legacy body', 'source-fingerprint-1', '2026-09-24T00:00:00.000Z'),
         ('observation-2', 'source-old', 'entry-old', 'external-old', 'external-old', '2', '{"provider":"fixture","id":"external-old"}', 'legacy-payload', '<p>Legacy <strong>body</strong></p><script>hidden()</script>', 'source-fingerprint-2', '2026-09-25T00:00:00.000Z')`,
        `INSERT INTO "StoryRevision" ("id", "storyId", "revision", "fingerprint", "producer", "title", "summary", "keyFactsJson", "actorJson", "reason", "createdAt") VALUES
         ('story-r1', 'story-old', 1, 'story-fingerprint-1', 'system', 'Original story', NULL, NULL, NULL, NULL, '2026-09-24T00:00:00.000Z'),
         ('story-r2', 'story-old', 2, 'story-fingerprint-2', 'human', 'Human title', 'Human summary', '[{"text":"Human fact","entryId":"entry-old"}]', '{"id":"fixture-human"}', 'Keep my interpretation', '2026-09-25T00:00:00.000Z')`,
        `UPDATE "Story" SET "currentRevisionId" = 'story-r2' WHERE "id" = 'story-old'`,
        `INSERT INTO "Asset" ("id", "entryRevisionId", "kind", "status", "sourceUrl", "storageKey", "mimeType", "byteSize", "attemptCount")
         VALUES ('asset-old', 'entry-r2', 'image', 'downloaded', 'https://example.invalid/legacy.png', 'legacy-media', 'image/png', 3, 1)`,
        `INSERT INTO "DomainEvent" ("eventId", "type", "version", "payloadJson", "aggregateType", "aggregateId", "occurredAt")
         VALUES ('event-old', 'story.revision_created.v1', 'v1', '{"storyId":"story-old","revision":2}', 'story', 'story-old', '2026-09-25T00:00:00.000Z')`,
    ];
    for (const statement of statements) await client.$executeRawUnsafe(statement);
}
