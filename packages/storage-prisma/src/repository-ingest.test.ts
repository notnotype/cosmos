import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { createMediaAcquirer, IngestionService, mediaDownloadCapability, type IngestConnector } from "@cosmos/application";
import type { NormalizedIngestItem } from "@cosmos/domain";
import { contentBlockSchema } from "@cosmos/contracts";
import { resolveStorageRoots } from "./index.js";
import { createFixtureSource, withRepository } from "./index.fixtures.js";
import { ContentRebuild, ContentQuery } from "@cosmos/application";
import { PrismaContentRebuildRepository } from "./repository/content-rebuild.js";
import { PrismaContentQueryRepository } from "./repository/content-query.js";

    it("anchors relative data roots to the workspace root", () => {
        const workspaceRoot = resolve(tmpdir(), "cosmos-workspace-root");
        const roots = resolveStorageRoots(".cosmos", workspaceRoot);

        expect(roots.dataRoot).toBe(join(workspaceRoot, ".cosmos"));
        expect(roots.databasePath).toBe(join(
            workspaceRoot,
            ".cosmos",
            "cosmos.sqlite",
        ));
    });

    it("revises equal-text sources when image order changes and skips unchanged declared content", async () => {
        await withRepository("content-source-revisions", async (repository, prisma) => {
            const source = await createFixtureSource(repository, { name: "Content source fixture", config: {} });
            const item: NormalizedIngestItem = {
                externalId: "ordered-media",
                title: "Ordered media",
                summary: null,
                contentText: "same text",
                contentSource: { format: "safe-html-input", html: "<p>same text</p><img src='https://example.test/a.png'>" },
                webUrl: null,
                kind: "article",
                publisher: null,
                metrics: null,
                publishedAt: null,
                updatedAt: null,
                sourceLocator: { provider: "fixture", item: "ordered-media" },
                rawPayload: "fixture",
                assets: [],
            };
            let current = item;
            const connector: IngestConnector = {
                id: "test-fixture",
                description: "Content source fixture",
                configVersion: "v1",
                capabilities: ["test"],
                validate: () => undefined,
                async fetchItems() { return { items: [current], nextCursor: null }; },
            };
            const blobWrites = vi.spyOn(repository.blobs, "put");
            let stagedWrites = 0;
            const service = new IngestionService(repository, () => connector, undefined, undefined, {
                async put(bytes, options) {
                    stagedWrites += 1;
                    return repository.blobs.put(bytes, options);
                },
            });
            expect((await service.runSource(source.id)).createdEntryCount).toBe(1);
            expect(stagedWrites).toBe(2);
            expect(blobWrites).toHaveBeenCalledTimes(2);
            const observation = await prisma.observation.findFirstOrThrow({ where: { sourceInstanceId: source.id } });
            expect(observation.contentSourceBlobKey).toBeTruthy();
            expect(observation.contentSourceBlobKey).not.toBe(observation.payloadBlobKey);
            const retainedSource = await repository.blobs.read(observation.contentSourceBlobKey!);
            expect(JSON.parse(new TextDecoder().decode(retainedSource))).toEqual(item.contentSource);
            expect(await repository.listContentUnchangedItems({ sourceId: source.id, items: [current] })).toEqual([true]);
            current = { ...item, contentSource: { format: "safe-html-input", html: "<img src='https://example.test/a.png'><p>same text</p>" } };
            expect(await repository.listContentUnchangedItems({ sourceId: source.id, items: [current] })).toEqual([false]);
            expect((await service.runSource(source.id)).revisedEntryCount).toBe(1);
            expect((await service.runSource(source.id)).revisedEntryCount).toBe(0);
            const entries = await repository.entries({ sourceId: source.id, limit: 20 });
            expect(entries.items).toHaveLength(1);
            expect(entries.items[0].revisionCount).toBe(2);
            const revisions = await prisma.entryRevision.findMany({
                orderBy: { revision: "asc" },
                include: { currentRepresentation: true, assets: true, evidenceObservation: true },
            });
            expect(revisions).toHaveLength(2);
            for (const revision of revisions) {
                expect(revision.evidenceObservation).not.toBeNull();
                expect(revision.currentRepresentation?.entryRevisionId).toBe(revision.id);
                expect(revision.currentRepresentation?.representationVersion).toBe(1);
                const blocks = contentBlockSchema.array().parse(JSON.parse(revision.currentRepresentation!.blocksJson));
                const image = blocks.find((block) => block.type === "image");
                expect(image?.type).toBe("image");
                if (image?.type === "image") expect(image.data.assetId).toBe(revision.assets[0].id);
                expect(blocks.map((block) => block.type)).toEqual(revision.revision === 1 ? ["paragraph", "image"] : ["image", "paragraph"]);
            }
            expect(await prisma.contentRepresentation.count()).toBe(2);
            const rebuildRepository = new PrismaContentRebuildRepository(prisma, repository.blobs);
            const rebuild = new ContentRebuild(rebuildRepository);
            const authority = { actorId: "user", canManageRepresentations: true };
            const rebuilt = await rebuild.rebuild(revisions[0].id, authority);
            expect(rebuilt).toMatchObject({ representationVersion: 2, promoted: true });
            const query = new ContentQuery(new PrismaContentQueryRepository(prisma));
            const historic = await query.structuredContent({ entryRevisionId: revisions[0].id, representationVersion: 1 }, { allowedProfiles: ["structured-content"] });
            expect(historic?.representation?.id).toBe(revisions[0].currentRepresentationId);
            await prisma.entryRevision.update({ where: { id: revisions[0].id }, data: { representationLocked: true } });
            const locked = await rebuild.rebuild(revisions[0].id, authority);
            expect(locked).toMatchObject({ representationVersion: 3, promoted: false });
            const after = await prisma.entryRevision.findUniqueOrThrow({ where: { id: revisions[0].id } });
            expect(after.currentRepresentationId).toBe(rebuilt.representationId);
            expect(await prisma.entryRevision.count()).toBe(2);
            expect(await prisma.asset.count()).toBe(2);
            const stale = await rebuildRepository.readRebuildSource(revisions[0].id);
            expect(stale).not.toBeNull();
            await expect(rebuildRepository.commitRebuild({
                entryRevisionId: revisions[0].id, expectedCurrentId: null, expectedLocked: true,
                draft: { blocks: [], contentText: "", status: "complete", parserVersion: "fixture", qualitySignals: {} }, actorId: "user",
            })).rejects.toThrow("selection conflict");
            expect(await prisma.contentRepresentation.count()).toBe(4);
            const original = revisions[0].evidenceObservation!;
            const stableRevision = await prisma.entryRevision.findUniqueOrThrow({ where: { id: revisions[0].id } });
            for (const bytes of [
                new TextEncoder().encode(JSON.stringify({ format: "plain-text", text: "x".repeat(1_048_576) })),
                new TextEncoder().encode("{malformed-private-body"),
                new Uint8Array([0xff, 0xfe]),
                new TextEncoder().encode('{"format":"not-declared"}'),
            ]) {
                const blob = await repository.blobs.put(bytes);
                await prisma.observation.update({ where: { id: original.id }, data: { contentSourceBlobKey: blob.key } });
                await expect(rebuild.rebuild(revisions[0].id, authority)).rejects.toMatchObject({ code: "conflict" });
                expect(await prisma.contentRepresentation.count()).toBe(4);
                expect(await prisma.entryRevision.findUniqueOrThrow({ where: { id: revisions[0].id } })).toEqual(stableRevision);
            }
            await prisma.observation.update({ where: { id: original.id }, data: { contentSourceBlobKey: "sha256/missing" } });
            await expect(rebuild.rebuild(revisions[0].id, authority)).rejects.toMatchObject({ code: "conflict" });
            await prisma.observation.update({ where: { id: original.id }, data: { contentSourceBlobKey: original.contentSourceBlobKey } });
            expect(await prisma.observation.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
        });
    });

    it("persists observations, revisions, assets, Story projections and FTS results", async () => {
        await withRepository("storage-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Test fixture",
                config: {},
            });
            const pages: readonly NormalizedIngestItem[] = [
            {
                externalId: "stable-1",
                title: "Original title",
                summary: "Summary",
                contentText: "Original body",
                webUrl: null,
                kind: "article",
                publisher: null,
                metrics: null,
                publishedAt: {
                    exact: "2026-08-08T00:00:00.000Z",
                    exactPrecision: "second",
                    fallback: null,
                },
                updatedAt: null,
                sourceLocator: { provider: "fixture", item: "stable-1" },
                rawPayload: "<item>original</item>",
                assets: [{
                    kind: "image",
                    sourceUrl: "https://example.test/image.png",
                    status: "saved",
                    mimeType: "image/png",
                    byteSize: 5,
                    content: new TextEncoder().encode("image"),
                }, {
                    kind: "image",
                    sourceUrl: "https://example.test/broken.png",
                    status: "failed",
                    mimeType: null,
                    byteSize: null,
                    content: null,
                    errorMessage: "图片下载超时",
                }],
            },
            {
                title: "URL-free title",
                summary: null,
                contentText: "URL-free body",
                webUrl: null,
                kind: "article",
                publisher: null,
                metrics: null,
                publishedAt: null,
                updatedAt: null,
                sourceLocator: { provider: "fixture", item: "url-free" },
                rawPayload: "<item>url-free</item>",
                assets: [{
                    kind: "attachment",
                    sourceUrl: null,
                    status: "metadata_only",
                    mimeType: "application/octet-stream",
                    byteSize: null,
                    content: null,
                }],
            },
            ];
            let pageIndex = 0;
            const connector: IngestConnector = {
            id: "test-fixture",
            description: "Test fixture",
            configVersion: "v1",
            capabilities: ["test"],
            validate: () => undefined,
            async fetchItems() {
                const revised = pageIndex++ > 0
                    ? pages.map((item) => item.externalId === "stable-1"
                        ? { ...item, contentText: "Revised body", rawPayload: "<item>revised</item>" }
                        : item)
                    : pages;
                return {
                    items: revised,
                    nextCursor: String(pageIndex),
                };
            },
            };
            const service = new IngestionService(repository, () => connector);

            const first = await service.runSource(source.id);
            const second = await service.runSource(source.id);

            expect(first.createdEntryCount).toBe(2);
            expect(first.revisedEntryCount).toBe(0);
            expect(second.createdEntryCount).toBe(0);
            expect(second.revisedEntryCount).toBe(1);
            expect(second.duplicateObservationCount).toBe(1);

            const feed = await repository.feed({ limit: 20 });
            expect(feed.items).toHaveLength(2);

            const entries = await repository.entries({
                sourceId: source.id,
                limit: 20,
            });
            expect(entries.items).toHaveLength(2);
            expect(entries.items.some((item) => item.revisionCount === 2)).toBe(true);
            expect(entries.items.every((item) => item.observationCount >= 2)).toBe(true);

            const search = await repository.search({
                text: "Revised",
                limit: 20,
            });
            expect(search.items).toHaveLength(1);

            const filtered = await repository.search({
                sourceId: source.id,
                publishedAfter: "2026-08-08T00:00:00.000Z",
                publishedBefore: "2026-08-08T23:59:59.999Z",
                limit: 1,
            });
            expect(filtered.items).toHaveLength(1);
            expect(filtered.nextCursor).toBeNull();

            const firstPage = await repository.search({
                sourceId: source.id,
                limit: 1,
            });
            expect(firstPage.nextCursor).toBe("1");
            const secondPage = await repository.search({
                sourceId: source.id,
                cursor: firstPage.nextCursor ?? undefined,
                limit: 1,
            });
            expect(secondPage.items).toHaveLength(1);
            expect(secondPage.nextCursor).toBeNull();

            const stories = await Promise.all(
                feed.items.map((item) => repository.story(item.storyId)),
            );
            const revisedStory = stories.find((item) => item?.entry?.revisions.length === 2);
            expect(revisedStory?.entry?.observations.length).toBe(2);

            const savedAsset = stories
                .flatMap((story) => story?.entry?.revisions ?? [])
                .flatMap((revision) => revision.assets)
                .find((asset) => asset.status === "saved");
            expect(savedAsset).toBeDefined();
            const asset = await repository.readAsset(savedAsset!.id);
            expect(new TextDecoder().decode(asset!.content)).toBe("image");

            const failedAsset = stories
                .flatMap((story) => story?.entry?.revisions ?? [])
                .flatMap((revision) => revision.assets)
                .find((entry) => entry.status === "failed");
            expect(failedAsset).toMatchObject({
                status: "failed",
                storageKey: null,
                errorMessage: "图片下载超时",
            });

            expect(revisedStory).toBeDefined();
            const storyRevisions = await repository.prisma.storyRevision.findMany({
                where: { storyId: revisedStory!.story.id },
                orderBy: { revision: "asc" },
            });
            // Content revision without display-field change must not append a StoryRevision (ADR-0006).
            expect(storyRevisions.map((revision) => revision.revision)).toEqual([1]);
            expect(storyRevisions[0].fingerprint).toHaveLength(64);
        });
    });

    it("preflights unchanged items and skips media re-download on legacy runs", async () => {
        await withRepository("media-skip-legacy-test", async (repository) => {
            const source = await createFixtureSource(repository, {
                name: "Media skip fixture",
                config: {},
            });
            const otherSource = await createFixtureSource(repository, {
                name: "Other media skip fixture",
                config: {},
            });
            const item: NormalizedIngestItem = {
                externalId: "media-skip-1",
                title: "Media skip item",
                summary: null,
                contentText: "Unchanged media body",
                webUrl: "https://example.test/media-skip",
                kind: "article",
                publisher: null,
                metrics: null,
                publishedAt: null,
                updatedAt: null,
                sourceLocator: { provider: "fixture", item: "media-skip-1" },
                rawPayload: "<item>media-skip</item>",
                assets: [{
                    kind: "image",
                    sourceUrl: "https://media.example.test/a.png",
                    status: "metadata_only",
                    mimeType: null,
                    byteSize: null,
                    content: null,
                }],
            };
            const fetched: string[] = [];
            const connector: IngestConnector = {
                id: "rss",
                description: "Media skip connector",
                configVersion: "v1",
                capabilities: [mediaDownloadCapability],
                validate: () => undefined,
                fetchItems: async () => ({
                    items: [item],
                    nextCursor: null,
                }),
            };
            const mediaAcquirer = createMediaAcquirer({
                fetch: async (input) => {
                    fetched.push(String(input));
                    return new Response(
                        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                        { status: 200, headers: { "content-type": "image/png" } },
                    );
                },
                resolveHost: async () => ["93.184.216.34"],
            });
            const service = new IngestionService(
                repository,
                () => connector,
                undefined,
                mediaAcquirer,
            );

            const first = await service.runSource(source.id);
            const unchanged = await repository.listContentUnchangedItems({
                sourceId: source.id,
                items: [item],
            });
            const otherSourceUnchanged = await repository.listContentUnchangedItems({
                sourceId: otherSource.id,
                items: [item],
            });
            const changedItem: NormalizedIngestItem = {
                ...item,
                contentText: "Revised media body",
                rawPayload: "<item>media-skip-revised</item>",
            };
            const revisedUnchanged = await repository.listContentUnchangedItems({
                sourceId: source.id,
                items: [changedItem],
            });
            const second = await service.runSource(source.id);

            expect(first.createdEntryCount).toBe(1);
            expect(second.duplicateObservationCount).toBe(1);
            expect(unchanged).toEqual([true]);
            expect(otherSourceUnchanged).toEqual([false]);
            expect(revisedUnchanged).toEqual([false]);
            expect(fetched).toHaveLength(1);
        });
    });

