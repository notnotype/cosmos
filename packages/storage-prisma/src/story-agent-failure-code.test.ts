import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaStoryAgentFailureCodeReader } from "./story-agent-failure-code.js";

const temporaryParent = resolve(process.cwd(), ".agent", "tmp", "task42-story-agent-timeout");
let temporaryRoot: string;
let prisma: PrismaClient;

beforeEach(async () => {
    temporaryRoot = join(temporaryParent, randomUUID());
    await mkdir(temporaryRoot, { recursive: true });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${join(temporaryRoot, "test.sqlite").replaceAll("\\", "/")}` } } });
    await prisma.$executeRawUnsafe('CREATE TABLE "WorkflowRun" ("id" TEXT NOT NULL PRIMARY KEY, "stateJson" TEXT NOT NULL, "kernelRevision" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL, "resumeRequired" BOOLEAN NOT NULL DEFAULT false, "definitionKey" TEXT NOT NULL, "definitionVersion" TEXT NOT NULL, "manifestHash" TEXT NOT NULL, "inputSnapshotJson" TEXT NOT NULL DEFAULT "{}", "productRunJson" TEXT NOT NULL DEFAULT "{}", "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)');
    await prisma.$executeRawUnsafe('CREATE TABLE "Job" ("id" TEXT NOT NULL PRIMARY KEY, "workflowRunId" TEXT, "kind" TEXT NOT NULL, "status" TEXT NOT NULL, "errorCode" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "idempotencyKey" TEXT NOT NULL, "payloadJson" TEXT)');
});

afterEach(async () => {
    await prisma.$disconnect();
    const root = resolve(temporaryRoot);
    if (!root.startsWith(`${temporaryParent}${process.platform === "win32" ? "\\" : "/"}`)) {
        throw new Error("Story failure fixture cleanup rejected a non-owned temporary directory.");
    }
    await rm(root, { recursive: true, force: true });
});

describe("PrismaStoryAgentFailureCodeReader", () => {
    it("projects only a whitelisted terminal Story activity code", async () => {
        const run = async (id: string, definitionKey: string) => prisma.$executeRawUnsafe(
            'INSERT INTO "WorkflowRun" ("id", "stateJson", "status", "definitionKey", "definitionVersion", "manifestHash", "createdAt", "updatedAt") VALUES (?, "{}", "failed", ?, "1", "test", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            id, definitionKey,
        );
        await run("run", "cosmos.story-agent");
        await run("other-run", "cosmos.other");
        const row = (id: string, workflowRunId: string, status: string, errorCode: string | null) => prisma.$executeRawUnsafe(
            'INSERT INTO "Job" ("id", "workflowRunId", "kind", "status", "errorCode", "idempotencyKey", "createdAt", "updatedAt") VALUES (?, ?, "workflow-activity", ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            id, workflowRunId, status, errorCode, id,
        );
        await row("retry", "run", "retry_wait", "timeout");
        await row("other", "other-run", "failed_terminal", "authentication_required");
        await row("story", "run", "failed_terminal", "timeout");
        const reader = new PrismaStoryAgentFailureCodeReader(prisma);
        await expect(reader.getStoryAgentFailureCode("run")).resolves.toBe("timeout");
        await expect(reader.getStoryAgentFailureCode("missing")).resolves.toBeNull();
        await prisma.$executeRawUnsafe('UPDATE "Job" SET "errorCode" = ? WHERE "id" = ?', "PRIVATE_PROVIDER_TEXT", "story");
        await expect(reader.getStoryAgentFailureCode("run")).resolves.toBeNull();
        await prisma.$executeRawUnsafe('UPDATE "Job" SET "status" = ?, "errorCode" = ? WHERE "id" = ?', "cancelled", "cancelled", "story");
        await expect(reader.getStoryAgentFailureCode("run")).resolves.toBeNull();
    });
});
