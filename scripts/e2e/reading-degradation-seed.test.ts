import { expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { ContentQuery } from "@cosmos/application";
import { PrismaContentQueryRepository } from "@cosmos/storage-prisma";
import { createIsolatedStackRoot, databaseUrl, disposeIsolatedStack, repositoryRoot } from "./helpers.js";
import { deploySchema } from "../../packages/storage-prisma/src/index.fixtures.js";
import { seedReadingDegradation } from "./reading-degradation-seed.js";

it("rejects non-browser roots before any DB access", async () => {
    await expect(seedReadingDegradation({ root: repositoryRoot, dataRoot: resolve(repositoryRoot, "data"),
        blobRoot: resolve(repositoryRoot, "blobs"), logRoot: resolve(repositoryRoot, "logs") }))
        .rejects.toThrow("requires an isolated browser-stack root");
});

it("seeds only a new isolated DB, ignores inherited DATABASE_URL and keeps reads non-mutating", async () => {
    const stack = await createIsolatedStackRoot("browser-stack");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(stack.dataRoot) } } });
    const unused = resolve(stack.root, "must-not-be-used.sqlite");
    try {
        deploySchema(resolve(stack.dataRoot, "cosmos.sqlite"));
        vi.stubEnv("DATABASE_URL", `file:${unused.replaceAll("\\", "/")}`);
        await seedReadingDegradation(stack);
        expect(existsSync(unused)).toBe(false);
        const snapshot = async () => ({
            revisions: await prisma.entryRevision.findMany({ orderBy: { id: "asc" } }),
            representations: await prisma.contentRepresentation.findMany({ orderBy: { id: "asc" } }),
            observations: await prisma.observation.findMany({ orderBy: { id: "asc" } }),
        });
        const before = await snapshot();
        expect(before.revisions).toHaveLength(4);
        expect(before.representations).toHaveLength(3);
        await expect(seedReadingDegradation(stack)).rejects.toThrow("requires a fresh empty database");
        const query = new ContentQuery(new PrismaContentQueryRepository(prisma));
        const authority = { allowedProfiles: ["structured-content"] as const };
        for (const revision of before.revisions) {
            const view = await query.structuredContent({ entryRevisionId: revision.id }, authority);
            if (revision.title === "Legacy HTML") {
                expect(view).toMatchObject({ readingMode: "legacy-text", representation: null });
                expect(view?.contentText).not.toContain("__legacyExecuted");
                expect(await query.structuredContent({ entryRevisionId: revision.id, representationVersion: 1 }, authority))
                    .toMatchObject({ readingMode: "unavailable", contentText: "" });
            } else if (revision.title === "Corrupt representation") {
                expect(view).toMatchObject({ readingMode: "unavailable", contentText: "", representation: null });
            } else if (revision.title === "Failed representation") {
                expect(view?.representation?.status).toBe("failed");
            } else expect(view?.representation?.blocks).toHaveLength(5);
        }
        expect(await snapshot()).toEqual(before);
    } finally {
        vi.unstubAllEnvs();
        await prisma.$disconnect();
        const target = resolve(stack.root);
        if (dirname(target) !== resolve(repositoryRoot, ".agent/tmp") || !basename(target).startsWith("browser-stack-")) {
            throw new Error("Refusing to dispose an unexpected test root.");
        }
        await disposeIsolatedStack(target);
    }
});
